import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { writeFile, mkdir, realpath, rename, rm } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { Browser, VERSION, until, withTimeout } from './browser.js';
import { exportCookies, cookieToCDP } from './cookies.js';
import { runInput } from './input.js';

const string = { type: 'string' }, integer = { type: 'integer' }, boolean = { type: 'boolean' };
const loadState = { type: 'string', enum: ['load', 'domcontentloaded', 'networkalmostidle', 'networkidle', 'done'] };
const scope = { selector: string, backendNodeId: integer };
const reading = { url: string, timeout: integer };
const stripping = { type: 'object', properties: Object.fromEntries(['js', 'css', 'ui', 'invisible', 'shell', 'clutter'].map(name => [name, boolean])) };
const definitions = [
  ['goto', 'Navigate the current page', { url: string, timeout: integer, waitUntil: loadState }, ['url']],
  ['markdown', 'Read page or subtree as Markdown', { ...scope, ...reading, maxBytes: integer, strip: stripping, alternate: boolean }],
  ['html', 'Read document or node HTML', { ...scope, ...reading, maxBytes: integer, strip: stripping }],
  ['links', 'List document links', { ...reading, limit: integer }],
  ['evaluate', 'Evaluate JavaScript in the page', { ...reading, script: string, save: string }, ['script']],
  ['extract', 'Extract structured values using CSS selector specifications', { schema: string, save: string }, ['schema']],
  ['tree', 'Read a semantic overview of the current page', { ...reading, backendNodeId: integer, maxDepth: integer, maxBytes: integer }],
  ['nodeDetails', 'Describe a node and a unique CSS selector', { backendNodeId: integer }, ['backendNodeId']],
  ['interactiveElements', 'List interactive elements', reading],
  ['structuredData', 'Read JSON-LD and document metadata', reading],
  ['detectForms', 'Inspect forms and their controls', reading],
  ['click', 'Dispatch a DOM click', scope],
  ['fill', 'Fill an editable control', { ...scope, value: string }, ['value']],
  ['waitForSelector', 'Wait for a CSS selector match', { selector: string, timeout: integer }, ['selector']],
  ['waitForScript', 'Wait for a truthy JavaScript expression', { script: string, timeout: integer }, ['script']],
  ['waitForState', 'Wait for a document load state', { state: loadState, timeout: integer }, ['state']],
  ['hover', 'Dispatch pointer and mouse hover events', scope],
  ['press', 'Dispatch a keyboard key', { ...scope, key: string }, ['key']],
  ['selectOption', 'Select a dropdown option', { ...scope, value: string }, ['value']],
  ['setChecked', 'Set a checkbox or radio state', { ...scope, checked: boolean }, ['checked']],
  ['findElement', 'Find interactive elements by role or accessible name', { role: string, name: string }],
  ['consoleLogs', 'Read and clear buffered page console messages', {}],
  ['getUrl', 'Read the loaded page URL', {}],
  ['getCookies', 'Inspect current session cookies', { url: string, all: boolean }],
  ['getEnv', 'Read named LP_ configuration or list available LP_ variable names', { name: string }],
  ['download', 'Download a successful HTTP response into a relative file', { url: string, path: string }, ['url', 'path']],
  ['save', 'Write an explicit agent script into a relative file', { path: string, script: string }, ['path', 'script']],
  ['session_new', 'Create a session (requires the HTTP transport)', { name: string }],
  ['session_list', 'List sessions (requires the HTTP transport)', {}],
  ['session_close', 'Close a session (requires the HTTP transport)', { id: string }, ['id']],
];
const tools = definitions.map(([name, description, properties, required = []]) => ({
  name, title: description, description, inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}) },
}));
const toolMap = new Map(tools.map(tool => [tool.name, tool]));
const unsupportedTools = new Set(['search', 'screenshot', 'scroll']);
const urlReadTools = new Set(['goto', 'markdown', 'html', 'links', 'evaluate', 'tree', 'interactiveElements', 'structuredData', 'detectForms']);

class MCPError extends Error {
  constructor(message, code = -32604) { super(message); this.code = code; }
}
const textResult = (text, structuredContent, isError = false) => ({
  content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }],
  ...(structuredContent ? { structuredContent } : {}), isError,
});
function timeout(args, fallback) {
  const value = args.timeout ?? fallback;
  if (!Number.isInteger(value) || value < 1 || value > 2147483647) throw new MCPError('timeout must be a positive integer', -32602);
  return value;
}
function truncate(text, maximum) {
  if (maximum === undefined || maximum === 0) return text;
  if (!Number.isInteger(maximum) || maximum < 0) throw new MCPError('maxBytes must be a non-negative integer', -32602);
  const bytes = Buffer.from(text);
  if (bytes.length <= maximum) return text;
  let end = maximum;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return `${bytes.subarray(0, end).toString('utf8')}\n[truncated]`;
}
const cleanText = node => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
function consoleValue(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value) ?? String(value); }
  catch { try { return String(value); } catch { return '[unserializable]'; } }
}

function roleOf(node) {
  const explicit = node.getAttribute('role');
  if (explicit) return explicit.split(/\s+/)[0];
  const tag = node.localName;
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'a' && node.hasAttribute('href')) return 'link';
  if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(node.type))) return 'button';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return node.multiple ? 'listbox' : 'combobox';
  if (tag === 'input') return node.type === 'hidden' ? null : ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton' })[node.type] ?? 'textbox';
  if (tag === 'img') return 'img';
  return null;
}
function nameOf(node) {
  const labels = node.getAttribute('aria-labelledby');
  if (labels) {
    const text = labels.split(/\s+/).map(id => cleanText(node.ownerDocument.getElementById(id))).filter(Boolean).join(' ');
    if (text) return text;
  }
  const aria = node.getAttribute('aria-label');
  if (aria) return aria;
  if (node.labels?.length) return [...node.labels].map(cleanText).join(' ');
  if (node.alt) return node.alt;
  if (['button', 'submit', 'reset'].includes(node.type) && node.value) return node.value;
  if (['button', 'a', 'label', 'legend'].includes(node.localName) || /^h[1-6]$/.test(node.localName)) return cleanText(node) || null;
  return node.getAttribute('title') || null;
}
function isInteractive(node) {
  if (node.localName === 'input' && node.type === 'hidden') return false;
  return ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(node.localName) || node.hasAttribute('tabindex') || node.hasAttribute('contenteditable') ||
    ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'switch', 'slider'].includes(node.getAttribute('role'));
}
function visible(node) {
  for (let current = node; current?.nodeType === 1; current = current.parentElement) {
    if (current.hidden || current.style?.display === 'none' || current.style?.visibility === 'hidden' || current.getAttribute('aria-hidden') === 'true') return false;
  }
  return true;
}
function attributeQuote(value) { return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\n\r\f]/g, char => `\\${char.codePointAt(0).toString(16)} `)}"`; }
function uniqueSelector(node) {
  const document = node.ownerDocument;
  if (node.id) {
    const selector = `[id=${attributeQuote(node.id)}]`;
    if (document.querySelectorAll(selector).length === 1) return selector;
  }
  const parts = [];
  for (let current = node; current?.nodeType === 1; current = current.parentElement) {
    const siblings = current.parentElement ? [...current.parentElement.children].filter(child => child.localName === current.localName) : [current];
    parts.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
    const selector = parts.join(' > ');
    if (document.querySelectorAll(selector).length === 1) return selector;
  }
  throw new MCPError('Cannot construct a unique selector');
}

async function outputPath(cwd, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.includes('\0')) {
    throw new MCPError('path must be a relative path without .. segments', -32602);
  }
  const root = await realpath(cwd);
  const destination = resolve(root, path);
  if (relative(root, destination).startsWith('..')) throw new MCPError('path escapes the working directory', -32602);
  const components = relative(root, dirname(destination)).split('/').filter(Boolean);
  let directory = root;
  for (const component of components) {
    directory = join(directory, component);
    await mkdir(directory, { recursive: true });
    const actual = await realpath(directory);
    if (actual !== root && !actual.startsWith(`${root}/`)) throw new MCPError('path traverses an external symlink', -32602);
  }
  const parent = await realpath(dirname(destination));
  if (parent !== root && !parent.startsWith(`${root}/`)) throw new MCPError('path traverses an external symlink', -32602);
  return join(parent, basename(destination));
}
async function atomicWrite(path, value) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try { await writeFile(temporary, value, { flag: 'wx', mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

/** Independent MCP adapter. Each handler owns one browsing context and page. */
export function createMCPHandler({ browser, browserOptions = {}, cwd = process.cwd(), env = process.env } = {}) {
  const ownsBrowser = !browser;
  browser ??= new Browser(browserOptions);
  const contextId = browser.createContext();
  const page = browser.createPage(contextId);
  const saved = Object.create(null), logs = [];
  let loaded = false, closed = false, generation = page.documentGeneration;
  let nodes = new Map(), ids = new WeakMap(), nextId = 1;
  page.on('console', ({ type, args }) => logs.push(`[${type}] ${args.map(consoleValue).join(' ')}\n`));
  const idFor = node => {
    if (page.documentGeneration !== generation) { generation = page.documentGeneration; nodes = new Map(); ids = new WeakMap(); }
    let id = ids.get(node);
    if (!id) { id = nextId++; ids.set(node, id); nodes.set(id, node); }
    return id;
  };
  const metadata = () => ({ url: page.url, ...(page.status !== undefined ? { httpStatus: page.status } : {}), title: page.dom.window.document.title });
  const requirePage = () => { if (!loaded) throw new MCPError('FrameNotLoaded: no page is loaded — call goto (or pass a url) first.'); };
  const selected = (args, defaultRoot = false) => {
    requirePage();
    if (page.documentGeneration !== generation) { generation = page.documentGeneration; nodes = new Map(); ids = new WeakMap(); }
    let node;
    if (args.selector) node = page.dom.window.document.querySelector(args.selector);
    else if (args.backendNodeId) node = nodes.get(args.backendNodeId);
    else if (defaultRoot) node = page.dom.window.document;
    if (!node || (node.nodeType !== 9 && !page.dom.window.document.contains(node))) throw new MCPError('NodeNotFound: the selector or backendNodeId matched nothing on the current page.', -32602);
    return node;
  };
  const element = args => {
    const node = selected(args);
    if (node.nodeType !== 1) throw new MCPError('Expected an element node', -32602);
    return node;
  };
  const interactives = () => [...page.dom.window.document.querySelectorAll('*')].filter(node => isInteractive(node) && visible(node)).map(node => ({
    backendNodeId: idFor(node), tagName: node.localName, role: roleOf(node), name: nameOf(node), type: 'native', tabIndex: node.tabIndex,
    ...(node.id ? { id: node.id } : {}), ...(node.localName === 'a' ? { href: node.href } : {}),
    ...(node.localName === 'input' ? { inputType: node.type, value: node.value } : {}),
    ...(node.localName === 'textarea' ? { value: node.value } : {}),
  }));
  const navigate = async args => {
    if (!args.url) return;
    const budget = timeout(args, 10000), previous = page.timeout, previousDocument = page.documentGeneration;
    page.timeout = budget;
    try {
      const state = args.waitUntil ?? 'load';
      const waitUntil = ({ networkalmostidle: 'networkidle2', networkidle: 'networkidle0', done: 'networkidle0' })[state] ?? state;
      await page.navigate(args.url, { waitUntil }); loaded = true;
    } finally { page.timeout = previous; if (page.documentGeneration !== previousDocument) loaded = true; }
  };
  const expand = value => {
    if (typeof value === 'string') return value.replace(/\$LP_[A-Za-z0-9_]+/g, name => {
      if (env[name.slice(1)] === undefined) throw new MCPError(`Environment reference ${name} is not set`, -32602);
      return env[name.slice(1)];
    });
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
    return value;
  };
  const writeSaved = (key, value) => { if (key !== undefined) { if (!key) throw new MCPError('save must be nonempty', -32602); if (value === undefined) throw new MCPError('Cannot save an undefined value', -32602); saved[key] = JSON.parse(JSON.stringify(value)); } };

  function readClone(args) {
    const node = selected(args, true).cloneNode(true);
    const strip = args.strip ?? {};
    if (strip.shell || strip.clutter) throw new MCPError('shell/clutter stripping is not implemented');
    const selectors = [];
    if (strip.js) selectors.push('script,noscript,link[as="script"]');
    if (strip.css || strip.ui) selectors.push('style,link[rel="stylesheet"]');
    if (strip.ui) selectors.push('img,picture,video,audio,svg,canvas,iframe');
    if (selectors.length) node.querySelectorAll(selectors.join(',')).forEach(child => child.remove());
    if (strip.invisible) node.querySelectorAll('[hidden],[aria-hidden="true"],[style]').forEach(child => { if (!visible(child)) child.remove(); });
    return node;
  }
  function render(args, format) {
    const node = readClone(args);
    let value;
    if (format === 'html') {
      value = node.nodeType === 9 ? `${node.doctype ? new page.dom.window.XMLSerializer().serializeToString(node.doctype) : ''}${node.documentElement.outerHTML}` : node.outerHTML;
    } else {
      if (args.alternate) throw new MCPError('Alternate Markdown resources are not implemented');
      let document = node;
      if (node.nodeType !== 9) { document = page.dom.window.document.implementation.createHTMLDocument(''); document.body.append(node); }
      value = page.dump.call({ dom: { window: { document } }, url: page.url }, 'markdown');
    }
    return truncate(value, args.maxBytes);
  }
  function extract(spec, root) {
    if (Array.isArray(spec)) {
      if (spec.length !== 1) throw new MCPError('Extraction arrays must contain one selector specification', -32602);
      const item = typeof spec[0] === 'string' ? { selector: spec[0] } : spec[0];
      if (!item || typeof item.selector !== 'string') throw new MCPError('Invalid extraction array specification', -32602);
      const matches = item.selector === '' ? [root] : [...root.querySelectorAll(item.selector)];
      const limited = item.limit === undefined ? matches : matches.slice(0, item.limit);
      return limited.map(node => item.fields ? Object.fromEntries(Object.entries(item.fields).map(([name, value]) => [name, extract(value, node)])) : extract({ ...item, selector: '' }, node));
    }
    const item = typeof spec === 'string' ? { selector: spec } : spec;
    if (!item || typeof item.selector !== 'string') throw new MCPError('Invalid extraction specification', -32602);
    const node = item.selector === '' ? root : root.querySelector(item.selector);
    if (!node) return null;
    if (item.attr) {
      const value = node.getAttribute(item.attr);
      if (value === null) return null;
      return ['href', 'src'].includes(item.attr) ? new URL(value, page.url).href : value;
    }
    return (node.textContent ?? '').trim();
  }

  async function callTool(name, rawArgs = {}) {
    if (closed) throw new MCPError('Session is closed');
    const tool = toolMap.get(name);
    if (!tool) {
      if (unsupportedTools.has(name)) return textResult(`${name} is not implemented in Red Panda`, undefined, true);
      throw new MCPError('Tool not found', -32601);
    }
    if (!rawArgs || Array.isArray(rawArgs) || typeof rawArgs !== 'object') throw new MCPError('arguments must be an object', -32602);
    for (const required of tool.inputSchema.required ?? []) {
      if (rawArgs[required] === undefined) return textResult(`missing required argument '${required}'`, undefined, true);
    }
    for (const [key, value] of Object.entries(rawArgs)) {
      const schema = tool.inputSchema.properties[key];
      if (!schema) continue;
      if ((schema.type === 'integer' && !Number.isInteger(value)) || (schema.type !== 'integer' && typeof value !== schema.type) ||
          (schema.type === 'object' && (value === null || Array.isArray(value))) ||
          (schema.enum && !schema.enum.includes(value))) return textResult(`invalid argument '${key}'`, undefined, true);
    }
    // Saved source must retain references rather than writing resolved credentials.
    const args = name === 'save' || name === 'getEnv' ? rawArgs : expand(rawArgs);
    if (name.startsWith('session_')) return textResult('multiple sessions require the HTTP transport (start with --port)', undefined, true);
    if (name === 'getEnv') {
      if (args.name === undefined) return textResult(Object.keys(env).filter(key => key.startsWith('LP_')).sort());
      return textResult(args.name.startsWith('LP_') && env[args.name] !== undefined ? env[args.name] : `${args.name} is not set`);
    }
    if (name === 'save') {
      const path = await outputPath(cwd, args.path); await atomicWrite(path, args.script); return textResult(`Saved script to ${path}`);
    }
    if (urlReadTools.has(name) && args.url) await navigate(args);
    requirePage();
    const document = page.dom.window.document, window = page.dom.window;
    switch (name) {
      case 'goto': return textResult(`Navigated. HTTP ${page.status} ${page.status >= 400 ? 'error' : 'OK'}.`, metadata());
      case 'getUrl': return textResult(page.url);
      case 'html': return textResult(render(args, 'html'));
      case 'markdown': return textResult(render(args, 'markdown'));
      case 'links': {
        let links = [...document.querySelectorAll('a[href]')].map(node => ({ backendNodeId: idFor(node), text: cleanText(node), href: node.href }));
        if (args.limit !== undefined) { if (args.limit < 0) throw new MCPError('limit must be non-negative', -32602); links = links.slice(0, args.limit); }
        return textResult(links);
      }
      case 'evaluate': {
        page.evaluate(`globalThis.lp=JSON.parse(${JSON.stringify(JSON.stringify(saved))})`);
        let source = args.script;
        try { new vm.Script(source); } catch {
          const expression = `(async()=>(${source}\n))()`;
          try { new vm.Script(expression); source = expression; } catch { source = `(async()=>{${source}\n})()`; }
        }
        try {
          const value = await withTimeout(Promise.resolve(page.evaluate(source)), timeout(args, 10000));
          if (args.save !== undefined) writeSaved(args.save, value);
          return textResult(typeof value === 'string' ? value : value === undefined ? 'undefined' : JSON.stringify(value));
        } catch (error) { return textResult(`exception: ${error.message}`, undefined, true); }
      }
      case 'extract': {
        const schema = JSON.parse(args.schema);
        if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Object.keys(schema).length) throw new MCPError('schema must be a nonempty selector-spec object', -32602);
        const result = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, extract(value, document)]));
        if (Object.values(result).every(value => value === null || Array.isArray(value) && !value.length)) return textResult('No extraction selectors matched; inspect the page and retry.', undefined, true);
        writeSaved(args.save, result); return textResult(result);
      }
      case 'interactiveElements': return textResult(interactives());
      case 'findElement': {
        let found = interactives();
        if (args.role) found = found.filter(node => node.role === args.role);
        if (args.name) {
          const literal = args.name.match(/^\/(.*)\/([imsu]*)$/);
          const matcher = literal ? new RegExp(literal[1], [...new Set(`${literal[2]}i`)].join('')) : new RegExp(args.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          found = found.filter(node => matcher.test(node.name ?? ''));
        }
        return textResult(found);
      }
      case 'nodeDetails': {
        const node = element(args);
        return textResult({ backendNodeId: idFor(node), tagName: node.localName, id: node.id || null, className: node.className || null,
          attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value])), selector: uniqueSelector(node) });
      }
      case 'tree': {
        if (args.maxBytes !== undefined) throw new MCPError('Priority-based tree maxBytes pruning is not implemented');
        const root = selected(args, true), lines = [];
        const visit = (node, depth) => {
          if (args.maxDepth !== undefined && depth > args.maxDepth) return;
          if (node.nodeType === 9) { lines.push(`${idFor(node)} RootWebArea '${document.title.replaceAll("'", "\\'")}'`); for (const child of node.body?.childNodes ?? []) visit(child, depth + 1); return; }
          if (node.nodeType === 3) { const text = cleanText(node); if (text) lines.push(`${' '.repeat(depth)}${idFor(node)} '${text.replaceAll("'", "\\'")}'`); return; }
          if (node.nodeType !== 1 || !visible(node) || ['script', 'style', 'noscript', 'template'].includes(node.localName)) return;
          const role = roleOf(node), name = nameOf(node), interactive = isInteractive(node);
          const printed = role || interactive;
          if (printed) {
            let line = `${' '.repeat(depth)}${idFor(node)} ${interactive ? '[i] ' : ''}${role ?? node.localName}${name ? ` '${name.replaceAll("'", "\\'")}'` : ''}`;
            if (['input', 'textarea', 'select'].includes(node.localName)) line += ` value='${String(node.value).replaceAll("'", "\\'")}'`;
            if (node.disabled) line += ' [disabled]';
            if (['checkbox', 'radio'].includes(node.type)) line += node.checked ? ' [checked]' : ' [unchecked]';
            lines.push(line);
            if (role === 'heading' || interactive) return;
          }
          for (const child of node.childNodes) visit(child, depth + (printed ? 1 : 0));
        };
        visit(root, 0); return textResult(`${lines.join('\n')}\n`);
      }
      case 'structuredData': {
        const output = { jsonLd: [], openGraph: {}, twitterCard: {}, meta: { ...(document.title ? { title: document.title } : {}) }, links: {} };
        for (const node of document.querySelectorAll('script[type="application/ld+json"]')) { try { output.jsonLd.push(JSON.parse(node.textContent)); } catch { /* invalid JSON-LD is excluded */ } }
        for (const node of document.querySelectorAll('meta[property],meta[name]')) {
          const key = node.getAttribute('property') ?? node.name, value = node.content;
          if (key.startsWith('og:')) output.openGraph[key.slice(3)] = value;
          else if (key.startsWith('twitter:')) output.twitterCard[key.slice(8)] = value;
          else output.meta[key] = value;
        }
        for (const node of document.querySelectorAll('link[rel][href]')) output.links[node.rel] = node.href;
        return textResult(output);
      }
      case 'detectForms': return textResult([...document.forms].map(form => ({ backendNodeId: idFor(form), id: form.id || null, action: form.action, method: form.method,
        fields: [...form.elements].map(node => ({ backendNodeId: idFor(node), tagName: node.localName, name: node.name, type: node.type, value: node.value, label: nameOf(node), required: !!node.required })) })));
      case 'click': {
        const node = element(args);
        if (node.disabled) throw new MCPError('Element is disabled', -32602);
        node.click(); page.reconcileURL(); return textResult('Clicked element.', metadata());
      }
      case 'fill': {
        const node = element(args);
        if (!['input', 'textarea'].includes(node.localName) || node.disabled || node.readOnly) throw new MCPError('Element is not an editable input', -32602);
        if (node.localName === 'input' && !['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(node.type)) throw new MCPError('Unsupported input type for fill', -32602);
        node.focus(); node.value = args.value;
        node.dispatchEvent(new window.InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: args.value }));
        node.dispatchEvent(new window.Event('change', { bubbles: true })); return textResult('Filled element.', metadata());
      }
      case 'selectOption': {
        const node = element(args);
        if (node.localName !== 'select' || node.disabled) throw new MCPError('Element is not an enabled select', -32602);
        if (![...node.options].some(option => option.value === args.value)) throw new MCPError('Option not found', -32602);
        node.value = args.value; node.dispatchEvent(new window.Event('input', { bubbles: true })); node.dispatchEvent(new window.Event('change', { bubbles: true }));
        return textResult('Selected option.', metadata());
      }
      case 'setChecked': {
        const node = element(args);
        if (node.localName !== 'input' || !['checkbox', 'radio'].includes(node.type) || node.disabled) throw new MCPError('Element is not an enabled checkbox or radio', -32602);
        if (node.checked !== args.checked) {
          if (node.type === 'radio' && !args.checked) { node.checked = false; node.dispatchEvent(new window.Event('input', { bubbles: true })); node.dispatchEvent(new window.Event('change', { bubbles: true })); }
          else node.click();
        }
        return textResult('Updated checked state.', metadata());
      }
      case 'hover': {
        const node = element(args);
        for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter']) node.dispatchEvent(new window.MouseEvent(type, { bubbles: !type.endsWith('enter'), composed: true }));
        return textResult('Dispatched hover events.', metadata());
      }
      case 'press': {
        if (args.selector || args.backendNodeId) {
          const node = element(args);
          if (node.disabled) throw new MCPError('Element is disabled', -32602);
          node.focus();
        }
        let key = args.key, modifiers = 0;
        for (let prefix; (prefix = key.match(/^(Control|Ctrl|Alt|Shift|Meta|Cmd)\+/i));) {
          modifiers |= ({ control: 2, ctrl: 2, alt: 1, shift: 8, meta: 4, cmd: 4 })[prefix[1].toLowerCase()];
          key = key.slice(prefix[0].length);
        }
        key = ({ Return: 'Enter', Esc: 'Escape', Space: ' ' })[key] ?? key;
        if (!key) throw new MCPError('key must name a key after any modifiers', -32602);
        runInput({ page }, 'Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers, ...(key.length === 1 || key === 'Enter' ? { text: key === 'Enter' ? '\r' : key } : {}) });
        runInput({ page }, 'Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
        return textResult('Dispatched key.', metadata());
      }
      case 'waitForSelector': await until(() => page.dom.window.document.querySelector(args.selector), { timeout: timeout(args, 5000) }); return textResult('Selector matched.', metadata());
      case 'waitForScript': await until(() => page.evaluate(`(${args.script}\n)`), { timeout: timeout(args, 5000) }); return textResult('Script condition matched.', metadata());
      case 'waitForState': {
        const state = args.state;
        await until(() => {
          const current = page.dom.window.document;
          if (page.pendingNavigation) return false;
          return state === 'domcontentloaded' ? current.readyState !== 'loading' : ['networkalmostidle', 'networkidle', 'done'].includes(state)
            ? current.readyState === 'complete' && page.activeRequests.size <= (state === 'networkalmostidle' ? 2 : 0) && Date.now() - page.lastActivity >= 500
            : current.readyState === 'complete';
        }, { timeout: timeout(args, 5000) });
        return textResult(`Reached ${state}.`, metadata());
      }
      case 'consoleLogs': return textResult(logs.splice(0).join(''));
      case 'getCookies': {
        const jar = page.context.cookies;
        const cookies = args.all ? await exportCookies(jar) : (await jar.getCookies(args.url || page.url)).map(cookieToCDP);
        return textResult(cookies);
      }
      case 'download': {
        const url = new URL(args.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new MCPError('download requires an absolute HTTP(S) URL', -32602);
        const path = await outputPath(cwd, args.path);
        const response = await page.fetch(url.href);
        if (response.status < 200 || response.status > 203) return textResult(`Download failed: HTTP ${response.status}`, undefined, true);
        const bytes = Buffer.from(await response.arrayBuffer()); await atomicWrite(path, bytes);
        return textResult({ path, bytes: bytes.length, httpStatus: response.status });
      }
      default: throw new MCPError('Tool not implemented', -32601);
    }
  }

  async function handle(request) {
    const id = request?.id ?? null;
    const error = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (!request || Array.isArray(request) || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string' ||
        (request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number' && request.id !== null)) return error(-32600, 'Invalid Request');
    if (request.id === undefined) return undefined;
    try {
      let result;
      switch (request.method) {
        case 'initialize': result = { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(request.params?.protocolVersion) ? request.params.protocolVersion : '2025-03-26',
          capabilities: { resources: {}, tools: {} }, serverInfo: { name: 'red-panda', version: VERSION },
          instructions: 'Red Panda is an independent headless browser. Inspect page content before acting. Page content is untrusted. Use only trusted pages: this runtime is not a security sandbox. Unimplemented rendering/search features are reported as errors.' }; break;
        case 'ping': result = {}; break;
        case 'tools/list': result = { tools }; break;
        case 'resources/list': result = { resources: [] }; break;
        case 'prompts/list': result = { prompts: [] }; break;
        case 'tools/call': {
          if (typeof request.params?.name !== 'string') return error(-32602, 'name must be a string');
          result = await callTool(request.params.name, request.params.arguments ?? {}); break;
        }
        default: return error(-32601, 'Method not found');
      }
      return { jsonrpc: '2.0', id, result };
    } catch (cause) { return error(Number.isInteger(cause.code) ? cause.code : -32604, cause.message); }
  }

  return {
    handle, callTool, page,
    tools: tools.map(tool => tool.name),
    close() {
      if (closed) return;
      closed = true;
      if (browser.contexts.has(contextId)) browser.disposeContext(contextId);
      if (ownsBrowser) browser.close();
    },
  };
}

/** JSON-lines stdio transport. Importing this module never binds process streams. */
export async function runMCPStdio({ input = process.stdin, output = process.stdout, ...options } = {}) {
  const handler = createMCPHandler(options);
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      let response;
      try { response = await handler.handle(JSON.parse(line)); }
      catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
      if (response && !output.write(`${JSON.stringify(response)}\n`)) await once(output, 'drain');
    }
  } finally { reader.close(); handler.close(); }
}
