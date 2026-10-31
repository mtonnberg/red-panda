import {createRequire} from 'node:module';
import {platformFactoryRecord} from './platform-factories.js';
import { serializeHTML as html } from './serialization.js';
/** Independent DOM dumps. Rendering/image formats require an actual renderer. */
export class DumpError extends Error {
  constructor(message, code = 'InvalidArgument') { super(message); this.name = 'DumpError'; this.code = code; }
}
const require=createRequire(import.meta.url),NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation,cloneNode=NodeImpl.prototype.cloneNode,{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js'),childrenIterator=domSymbolTree.childrenIterator,wrapperForImpl=require('jsdom/lib/jsdom/living/generated/utils.js').wrapperForImpl,hasInstance=Function.prototype[Symbol.hasInstance],apply=Reflect.apply;
export const STRIP_MODES = Object.freeze(['clutter', 'css', 'js', 'invisible', 'shell', 'ui']);
export const DUMP_FORMATS = Object.freeze(['html', 'markdown', 'semantic_tree', 'semantic_tree_text', 'structured_data', 'text', 'links']);
const text = node => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
const all = (root, selector) => [...(root.nodeType === 1 && root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
function cloneWithSources(root) {
  const clone = root.cloneNode(true), sources = new WeakMap();
  const pair = (source, target) => {
    sources.set(target, source);
    const a = source.localName === 'template' ? source.content.childNodes : source.childNodes;
    const b = target.localName === 'template' ? target.content.childNodes : target.childNodes;
    [...a].forEach((child, index) => pair(child, b[index]));
  };
  pair(root, clone); return { root: clone, sources };
}
function computed(node, sources) {
  const source = sources.get(node) ?? node;
  try { return source.ownerDocument?.defaultView?.getComputedStyle(source); } catch { return null; }
}
function authoredDisplayNone(node, sources) {
  if (computed(node, sources)?.display !== 'none') return false;
  const source = sources.get(node) ?? node;
  if (source.style?.display) return true;
  const matches = rules => [...rules].some(rule => {
    if (rule.selectorText && rule.style?.display) { try { if (source.matches(rule.selectorText)) return true; } catch {} }
    return rule.cssRules ? matches(rule.cssRules) : false;
  });
  for (const sheet of source.ownerDocument?.styleSheets ?? []) { try { if (matches(sheet.cssRules)) return true; } catch {} }
  return false;
}
function strip(root, modes, sources) {
  let removed = false;
  const remove = node => { if (node === root) removed = true; else node.remove(); };
  const removeMatches = selector => all(root, selector).forEach(remove);
  // Determine visibility before CSS removal; stripping CSS must not resurrect hidden content.
  if (modes.has('invisible') || modes.has('clutter')) all(root, '*').filter(node => node.localName === 'template' || authoredDisplayNone(node, sources)).forEach(remove);
  if (modes.has('js')) removeMatches('script,link[rel~="preload"][as="script"],link[rel="modulepreload"]');
  if (modes.has('css') || modes.has('ui')) removeMatches('style,link[rel~="stylesheet"]');
  if (modes.has('ui')) removeMatches('img,picture,video,svg');
  if (modes.has('shell') || modes.has('clutter')) {
    const chrome = all(root, 'nav,aside,dialog,header,footer').filter(node =>
      !['header', 'footer'].includes(node.localName) || !node.closest('article,section,main,[role="main"]'));
    const top = chrome.filter(node => !chrome.some(other => other !== node && other.contains(node)));
    const body = root.nodeType === 9 ? root.body : root;
    const total = text(body).length, lost = top.reduce((size, node) => size + text(node).length, 0);
    // Explicit main content is strong evidence. Without it, retain pages whose text is almost all chrome.
    if (body.querySelector('main,article,[role="main"]') || !total || total - lost >= total * .2) top.forEach(remove);
    if (modes.has('clutter')) {
      const candidates = all(body, 'main,article,[role="main"]');
      const winner = candidates.sort((a, b) => text(b).length - text(a).length)[0];
      if (winner && text(winner).length >= 100 && text(winner).length >= text(body).length * .35) {
        for (let current = winner; current !== body && current.parentNode; current = current.parentNode) {
          for (const sibling of [...current.parentNode.childNodes]) if (sibling !== current) sibling.remove();
        }
      }
    }
  }
  return removed;
}

/** Native soft cap: retain complete UTF-8 characters, then append a marker outside the cap. */
export function truncateDump(value, maximum) {
  if (maximum === undefined || maximum === null) return value;
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new DumpError('maxBytes must be a non-negative integer');
  const bytes = Buffer.from(value);
  if (bytes.length <= maximum) return value;
  let end = maximum;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return `${bytes.subarray(0, end).toString('utf8')}\n\n[truncated]\n`;
}

function markdown(root, sources) {
  const render = (node, listIndex = 1) => {
    if (node.nodeType === 3) return node.data.replace(/\s+/g, ' ');
    if (node.nodeType === 9 || node.nodeType === 11) return [...node.childNodes].map(child => render(child)).join('');
    if (node.nodeType !== 1) return '';
    const tag = node.localName, style = computed(node, sources);
    if (['head', 'script', 'style', 'noscript', 'template'].includes(tag) || node.hidden || node.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden') return '';
    const content = [...node.childNodes].map(child => render(child)).join('');
    if (/^h[1-6]$/.test(tag)) return `\n${'#'.repeat(Number(tag[1]))} ${content.trim()}\n`;
    if (tag === 'a') {
      const link = node.hasAttribute('href') ? `[${content.trim()}](${(sources.get(node) ?? node).href || node.getAttribute('href')})` : content;
      return ['body', 'div', 'main', 'article', 'section', 'nav', 'aside', 'header', 'footer'].includes(node.parentElement?.localName) ? `${link}\n` : link;
    }
    if (tag === 'img') return `![${node.alt ?? ''}](${(sources.get(node) ?? node).src || node.getAttribute('src') || ''})`;
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n---\n';
    if (tag === 'ul' || tag === 'ol') return [...node.children].map((child, index) => render(child, index + Number(node.getAttribute('start') ?? 1))).join('');
    if (tag === 'li') return `${node.parentElement?.localName === 'ol' ? `${listIndex}.` : '-'} ${content.trim()}\n`;
    if (tag === 'pre') return `\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n`;
    if (tag === 'code') return node.parentElement?.localName === 'pre' ? content : `\`${content}\``;
    if (tag === 'b' || tag === 'strong') return `**${content}**`;
    if (tag === 'i' || tag === 'em') return `*${content}*`;
    if (tag === 'del' || tag === 's') return `~~${content}~~`;
    if (tag === 'input') return ['checkbox', 'radio'].includes(node.type) ? `[${node.checked ? 'x' : ' '}] ` : '';
    if (tag === 'select') return [...node.selectedOptions].map(option => option.textContent).join(', ');
    if (tag === 'table') {
      const rows = [...node.rows].map(row => `| ${[...row.cells].map(cell => render(cell).trim().replaceAll('|', '\\|')).join(' | ')} |\n`);
      if (node.rows[0]?.querySelector('th')) rows.splice(1, 0, `|${[...node.rows[0].cells].map(() => '---').join('|')}|\n`);
      return `\n${rows.join('')}`;
    }
    if (tag === 'blockquote') return `\n${content.trim().split('\n').map(line => `> ${line}`).join('\n')}\n`;
    if (['p', 'div', 'section', 'article', 'footer', 'header', 'aside', 'nav'].includes(tag)) return content.trim() ? `\n${content.trim()}\n` : '';
    return content;
  };
  let result = render(root).replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (result && !result.endsWith('\n')) result += '\n';
  return result;
}
function add(object, key, value) {
  if (!Object.hasOwn(object, key)) Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  else if (Array.isArray(object[key])) object[key].push(value);
  else object[key] = [object[key], value];
}
function structured(root, sources) {
  const output = { jsonLd: [], openGraph: {}, twitterCard: {}, meta: {}, links: {} };
  for (const node of all(root, 'title,meta,link,script[type="application/ld+json"]')) {
    if (node.localName === 'title') add(output.meta, 'title', node.textContent);
    else if (node.localName === 'script') output.jsonLd.push(node.textContent.trim());
    else if (node.localName === 'meta') {
      if (node.hasAttribute('charset')) { add(output.meta, 'charset', node.getAttribute('charset')); continue; }
      const name = node.getAttribute('property') || node.getAttribute('name') || node.getAttribute('http-equiv');
      if (!name || !node.hasAttribute('content')) continue;
      const content = node.getAttribute('content');
      if (name.startsWith('og:')) add(output.openGraph, name.slice(3), content);
      else if (name.startsWith('twitter:')) add(output.twitterCard, name.slice(8), content);
      else add(output.meta, name, content);
    } else if (node.hasAttribute('href')) {
      const relations = (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
      for (const rel of relations) {
        if (rel === 'alternate') {
          output.alternate ??= [];
          output.alternate.push(Object.fromEntries(['href', 'type', 'hreflang', 'title'].filter(key => node.hasAttribute(key)).map(key => [key, key === 'href' ? (sources.get(node) ?? node).href : node.getAttribute(key)])));
        } else if (rel && !['preload', 'modulepreload', 'stylesheet'].includes(rel)) add(output.links, rel, (sources.get(node) ?? node).href);
      }
    }
  }
  return output;
}

function roleOf(node) {
  const explicit = node.getAttribute('role'); if (explicit) return explicit.split(/\s+/)[0];
  const tag = node.localName;
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'input') return ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', button: 'button', submit: 'button', reset: 'button', image: 'button', search: 'searchbox' })[node.type] ?? 'textbox';
  if (tag === 'select') return node.multiple ? 'listbox' : 'combobox';
  if (tag === 'a') return node.hasAttribute('href') ? 'link' : 'none';
  return ({ button: 'button', textarea: 'textbox', img: 'image', p: 'paragraph', main: 'main', nav: 'navigation', aside: 'complementary', header: 'banner', footer: 'contentinfo', article: 'article', section: 'region', ul: 'list', ol: 'list', li: 'listitem', table: 'table', tr: 'row', td: 'cell', th: 'columnheader', hr: 'separator', br: 'LineBreak', summary: 'button', progress: 'progressbar', meter: 'meter' })[tag] ?? 'none';
}
function nameOf(node, role) {
  const labelled = node.getAttribute('aria-labelledby');
  if (labelled) {
    const value = labelled.split(/\s+/).map(id => text(node.ownerDocument.getElementById(id) ?? { textContent: '' })).filter(Boolean).join(' ');
    if (value) return value;
  }
  if (node.getAttribute('aria-label')) return node.getAttribute('aria-label');
  if (node.labels?.length) return [...node.labels].map(text).join(' ');
  if (node.localName === 'img') return node.alt || node.getAttribute('title') || undefined;
  if (node.localName === 'input' && ['button', 'submit', 'reset'].includes(node.type)) return node.value || undefined;
  if (['heading', 'button', 'link', 'option', 'tab', 'menuitem'].includes(role)) return text(node) || undefined;
  return node.getAttribute('title') || undefined;
}
function semantic(root, sources, nodeIdFor, plainText, document) {
  let next = 1; const lines = [];
  const visit = (node, path, depth) => {
    if (node.nodeType !== 9 && node.nodeType !== 1 && node.nodeType !== 3) return null;
    if (node.nodeType === 3 && !text(node)) return null;
    if (node.nodeType === 1 && (['head', 'script', 'style', 'noscript', 'template', 'option'].includes(node.localName) || node.hidden || node.localName === 'input' && node.type === 'hidden' || computed(node, sources)?.display === 'none')) return null;
    const source = sources.get(node) ?? node, id = nodeIdFor ? nodeIdFor(source) : next++;
    if (node.nodeType === 1 && computed(node, sources)?.visibility === 'hidden') return null;
    const result = { nodeId: String(id), backendDOMNodeId: id, nodeName: node.nodeType === 9 ? 'root' : node.nodeType === 3 ? 'text' : node.localName, xpath: path, nodeType: node.nodeType };
    const role = node.nodeType === 1 ? roleOf(node) : null;
    const name = node.nodeType === 1 ? nameOf(source, role) : null;
    let interactive = false;
    if (node.nodeType === 1) {
      interactive = ['button', 'input', 'select', 'textarea', 'summary'].includes(node.localName) || node.localName === 'a' && node.hasAttribute('href') || node.hasAttribute('tabindex') || node.hasAttribute('contenteditable') || ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'switch', 'slider', 'tab', 'menuitem'].includes(node.getAttribute('role'));
      result.isInteractive = interactive;
      if (node.disabled || node.getAttribute('aria-disabled') === 'true') result.isDisabled = true;
      result.role = role;
      if (name) result.name = name;
      if (['input', 'textarea', 'select'].includes(node.localName)) result.value = source.value;
      if (node.attributes.length) result.attributes = Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value]));
      if (node.localName === 'input' && ['checkbox', 'radio'].includes(node.type)) result.checked = source.checked;
      if (node.localName === 'select') result.options = [...source.options].map(option => ({ value: option.value, text: option.textContent, selected: option.selected }));
    } else if (node.nodeType === 3) result.nodeValue = node.data;
    let childDepth = depth;
    if (plainText) {
      let line;
      if (node.nodeType === 9) line = `RootWebArea '${document.title.replaceAll("'", "\\'")}'`;
      else if (node.nodeType === 3) line = `'${text(node).replaceAll("'", "\\'")}'`;
      else if (role !== 'none' && !['main', 'region', 'article'].includes(role) || interactive) {
        line = `${interactive ? `[i${result.isDisabled ? ':disabled' : ''}] ` : ''}${role}`;
        if (name) line += ` '${name.replaceAll("'", "\\'")}'`;
        if (result.value !== undefined && result.value !== '') line += ` value='${String(result.value).replaceAll("'", "\\'")}'`;
        if (result.checked) line += ' [checked]';
        if (result.options) line += ` options=[${result.options.map(option => `'${option.value.replaceAll("'", "\\'")}'${option.selected ? '*' : ''}`).join(', ')}]`;
      }
      if (line) { lines.push(`${' '.repeat(depth)}${id} ${line}\n`); childDepth++; }
      if (node.nodeType === 1 && (name && ['heading', 'button', 'link', 'image'].includes(role) || ['input', 'textarea', 'select'].includes(node.localName))) return result;
    }
    const children = [], counts = new Map();
    for (const child of node.childNodes) {
      const key = child.nodeType === 3 ? 'text()' : child.localName;
      const index = (counts.get(key) ?? 0) + 1; counts.set(key, index);
      const item = visit(child, `${path}/${key}[${index}]`, childDepth);
      if (item) children.push(item);
    }
    result.children = children; return result;
  };
  const tree = visit(root, root.nodeType === 9 ? '' : `/${root.localName}[1]`, 0);
  return plainText ? lines.join('') : JSON.stringify(tree);
}

/** Legacy LP markdown scopes use the same independent producer on a real registered Node. */
export function dumpMarkdownNode(node) {
  const source=platformFactoryRecord(node)?.implementation;
  if(!source||!apply(hasInstance,NodeImpl,[source]))throw new DumpError('A genuine registered DOM node is required');
  const clone=apply(cloneNode,source,[true]),sources=new WeakMap();
  const pair=(original,copy)=>{
    sources.set(wrapperForImpl(copy),wrapperForImpl(original));
    const a=Array.from(apply(childrenIterator,domSymbolTree,[original._templateContents??original]));
    const b=Array.from(apply(childrenIterator,domSymbolTree,[copy._templateContents??copy]));
    for(let index=0;index<a.length;index++)pair(a[index],b[index]);
  };
  pair(source,clone);
  return markdown(wrapperForImpl(clone),sources);
}

/** Dump a document or the first CSS match without mutating the live DOM. */
export function dumpDocument(document, { format = 'html', selector, rootNode, maxBytes, stripModes = [], nodeIdFor, withBase = false } = {}) {
  if (!document || document.nodeType !== 9) throw new DumpError('A DOM document is required');
  if (!DUMP_FORMATS.includes(format)) throw new DumpError(`${format} dump is not implemented`, 'UnsupportedDumpFormat');
  if (maxBytes !== undefined && maxBytes !== null && !['html', 'markdown'].includes(format)) throw new DumpError('maxBytes is supported only for html and markdown');
  if (maxBytes !== undefined && maxBytes !== null && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) throw new DumpError('maxBytes must be a non-negative integer');
  if (!Array.isArray(stripModes)) throw new DumpError('stripModes must be an array');
  for (const mode of stripModes) if (!STRIP_MODES.includes(mode)) throw new DumpError(`Unknown strip mode: ${mode}`);
  if (nodeIdFor !== undefined && typeof nodeIdFor !== 'function') throw new DumpError('nodeIdFor must be a function');
  if (typeof withBase !== 'boolean') throw new DumpError('withBase must be a boolean');
  if (rootNode !== undefined && selector !== undefined) throw new DumpError('Choose a selector or a root node');
  if (rootNode !== undefined && (rootNode.nodeType !== 1 || rootNode.ownerDocument !== document || !rootNode.isConnected)) throw new DumpError('Root node must be a connected element of this document');
  let original = rootNode ?? document;
  if (selector !== undefined) {
    if (typeof selector !== 'string' || !selector) throw new DumpError('selector must be a nonempty CSS selector');
    try { original = document.querySelector(selector); } catch (cause) { throw new DumpError(`Invalid CSS selector: ${cause.message}`, 'InvalidSelector'); }
    if (!original) throw new DumpError(`No element matches ${selector}`, 'SelectorNotFound');
  }
  const { root, sources } = cloneWithSources(original);
  if (strip(root, new Set(stripModes), sources)) return '';
  if (withBase && format === 'html' && root.nodeType === 9 && root.head) {
    const base = root.createElement('base'); base.setAttribute('href', document.baseURI); root.head.prepend(base);
  }
  let value;
  if (format === 'html') value = html(root);
  else if (format === 'markdown') value = markdown(root, sources);
  else if (format === 'structured_data') value = JSON.stringify(structured(root, sources));
  else if (format.startsWith('semantic_tree')) value = semantic(root, sources, nodeIdFor, format.endsWith('_text'), document);
  else if (format === 'links') value = JSON.stringify(all(root, 'a[href]').map(node => ({ text: node.textContent.trim(), href: (sources.get(node) ?? node).href })), null, 2);
  else {
    const body = root.nodeType === 9 ? root.body : root;
    all(body, 'script,style,noscript,template').forEach(node => node.remove());
    value = body.textContent.trim();
  }
  return truncateDump(value, maxBytes);
}
