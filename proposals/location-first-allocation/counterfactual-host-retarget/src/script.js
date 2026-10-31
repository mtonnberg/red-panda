import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { Worker, isMainThread, workerData, parentPort, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';

/** Saved scripts and pages are trusted input. Node vm is not a security sandbox. */
export class ScriptError extends Error {
  constructor(message, { phase = 'runtime', code = 'SCRIPT_ERROR', output = '', cause } = {}) {
    super(message, { cause }); this.name = 'ScriptError'; this.phase = phase; this.code = code; this.output = output;
  }
}

const methods = ['goto', 'screenshot', 'evaluate', 'extract', 'click', 'fill', 'scroll', 'waitForSelector',
  'waitForScript', 'waitForState', 'hover', 'press', 'selectOption', 'setChecked', 'download', 'close'];
const serializeError = error => ({ message: error.message, name: error.name, code: error.code, phase: error.phase });

function scriptWorker() {
  // An unresolved top-level promise must remain alive until the host deadline.
  parentPort.ref();
  const sync = (pageId, method, args) => {
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    parentPort.postMessage({ type: 'call', pageId, method, args, signal, port: port2 }, [port2]);
    try {
      // Only the script worker blocks. The browser host can continue fetching and polling.
      while (Atomics.load(signal, 0) === 0) Atomics.wait(signal, 0, 0);
      const reply = receiveMessageOnPort(port1)?.message;
      if (!reply) throw new Error('Script browser bridge closed without a response');
      if (reply.error) throw Object.assign(new Error(reply.error.message), reply.error);
      return reply.value;
    } finally { port1.close(); }
  };
  const asyncCall = (pageId, method, args) => new Promise((accept, reject) => {
    const { port1, port2 } = new MessageChannel();
    port1.once('message', reply => {
      port1.close();
      if (reply.error) reject(Object.assign(new Error(reply.error.message), reply.error));
      else accept(reply.value);
    });
    parentPort.postMessage({ type: 'call', pageId, method, args, port: port2 }, [port2]);
  });
  class Page {
    constructor(...args) {
      if (args.length) throw new Error('Page constructor does not accept options');
      const pageId = sync(undefined, 'new', []);
      for (const method of methods) Object.defineProperty(this, method, {
        enumerable: true,
        value: method === 'goto' ? async (...values) => {
          const value = await asyncCall(pageId, method, values);
          this.__lpFrameId = value.__lpFrameId;
          return value;
        } : (...values) => sync(pageId, method, values),
      });
    }
  }
  const print = (...values) => parentPort.postMessage({ type: 'console', text: values.map(value => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
  }).join(' ') + '\n' });
  const context = vm.createContext({ Page, console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(name => [name, print])) });
  let compiled;
  try { compiled = new vm.Script(`(async()=>{\n${workerData.source}\n})()`, { filename: workerData.filename, lineOffset: -1 }); }
  catch (error) { parentPort.postMessage({ type: 'error', error: { ...serializeError(error), phase: 'parse' } }); parentPort.close(); return; }
  Promise.resolve().then(() => compiled.runInContext(context, { timeout: workerData.timeout })).then(value => {
    // Mirror native output: undefined is silent, strings are raw, other values use JSON.
    const json = value === undefined ? undefined : JSON.stringify(value);
    if (value !== undefined && json === undefined) throw new Error('Script return value is not JSON serializable');
    parentPort.postMessage({ type: 'result', json, rendered: value === undefined ? '' : `${typeof value === 'string' ? value : json}\n` });
  }).catch(error => parentPort.postMessage({ type: 'error', error: serializeError(error) })).finally(() => parentPort.close());
}

function options(value, allowed) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid arguments: options must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported script option '${key}'`);
  return value;
}
function target(value) {
  if (typeof value === 'string') return { selector: value };
  if (Number.isInteger(value)) return { backendNodeId: value };
  return options(value, ['selector', 'backendNodeId']);
}
function selectorFor(node) {
  const document = node.ownerDocument;
  if (node.id) {
    const candidate = `[id=${JSON.stringify(node.id)}]`;
    if (document.querySelectorAll(candidate).length === 1) return candidate;
  }
  const parts = [];
  for (let current = node; current?.nodeType === 1; current = current.parentElement) {
    const siblings = current.parentElement ? [...current.parentElement.children].filter(other => other.localName === current.localName) : [current];
    parts.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
    if (document.querySelectorAll(parts.join(' > ')).length === 1) return parts.join(' > ');
  }
  throw new Error('Cannot construct a selector for the script node');
}
function parameters(method, args) {
  const [first, second] = args;
  const limits = { goto: 2, evaluate: 2, extract: 1, click: 1, fill: 2, hover: 1, press: 2,
    selectOption: 2, setChecked: 2, waitForSelector: 2, waitForScript: 2, waitForState: 2, download: 2 };
  if (args.length > limits[method]) throw new Error(`invalid arguments for ${method}`);
  if (method === 'goto' || method === 'evaluate') {
    const key = method === 'goto' ? 'url' : 'script', allowed = method === 'goto' ? ['timeout', 'waitUntil'] : ['timeout'];
    if (first && typeof first === 'object') {
      if (second !== undefined) throw new Error(`invalid arguments for ${method}`);
      return options(first, [key, ...allowed]);
    }
    return { [key]: first, ...options(second, allowed) };
  }
  if (method === 'extract') return { schema: JSON.stringify(first) };
  if (['click', 'hover'].includes(method)) return target(first);
  if (['fill', 'press', 'selectOption', 'setChecked'].includes(method)) {
    if (first && typeof first === 'object') {
      if (second !== undefined) throw new Error(`invalid arguments for ${method}`);
      return options(first, ['selector', 'backendNodeId', { fill: 'value', press: 'key', selectOption: 'value', setChecked: 'checked' }[method]]);
    }
    return { ...target(first), [{ fill: 'value', press: 'key', selectOption: 'value', setChecked: 'checked' }[method]]: second };
  }
  if (method.startsWith('waitFor')) {
    const key = { waitForSelector: 'selector', waitForScript: 'script', waitForState: 'state' }[method];
    if (first && typeof first === 'object') {
      if (second !== undefined) throw new Error(`invalid arguments for ${method}`);
      return options(first, [key, 'timeout']);
    }
    return { [key]: first, ...options(second, ['timeout']) };
  }
  if (method === 'download') {
    if (first && typeof first === 'object') {
      if (second !== undefined) throw new Error('invalid arguments for download');
      return options(first, ['url', 'path']);
    }
    return { url: first, path: second };
  }
  throw new Error(`Unsupported Page method '${method}'`);
}

/**
 * Execute a trusted native-style saved script. Page.goto is asynchronous; other
 * Page methods are synchronous. Returns captured console/final output without
 * writing process streams. No LLM/provider calls are performed.
 */
export async function runScript({ path, args = [], browserOptions = {}, cwd = process.cwd(), env = process.env,
  input = process.stdin, source, timeout = 30000 } = {}) {
  if (!Array.isArray(args) || args.length) throw new ScriptError('Saved scripts do not accept positional arguments', { phase: 'load' });
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw new ScriptError('timeout must be a positive integer', { phase: 'load' });
  let filename;
  try {
    if (source === undefined) {
      if (typeof path !== 'string' || !path) throw new Error('A script path or - for stdin is required');
      filename = path === '-' ? '<stdin>' : resolve(cwd, path);
      if (path === '-') { source = ''; for await (const chunk of input) source += chunk.toString(); }
      else source = await readFile(filename, 'utf8');
    } else if (typeof source !== 'string') throw new Error('source must be a string');
  } catch (cause) { throw new ScriptError(cause.message, { phase: 'load', cause }); }
  filename ??= path ? resolve(cwd, path) : '<script>';
  const [{ Browser, until, withTimeout }, { createMCPHandler }] = await Promise.all([import('./browser.js'), import('./mcp.js')]);
  const browser = new Browser(browserOptions), pages = new Map(), nodeStates = new WeakMap();
  let nextPage = 1, sharedCookies, output = '', finished = false, timer, worker;
  // Saved scripts do not interpolate LP_ values. MCP's string expansion is
  // neutralized here, including for names absent from the process environment.
  const literalEnv = new Proxy(Object.create(null), { get: (_, key) => typeof key === 'string' ? `$${key}` : undefined });
  void env; // Native PandaScript exposes no process/environment global.
  const open = id => {
    const handler = createMCPHandler({ browser, browserOptions, cwd, env: literalEnv });
    if (sharedCookies) handler.page.context.cookies = sharedCookies;
    else sharedCookies = handler.page.context.cookies;
    pages.set(id, handler); return handler;
  };
  const invoke = async ({ method, pageId, args }) => {
    if (method === 'new') {
      const id = nextPage++; open(id); return id;
    }
    let handler = pages.get(pageId);
    if (!handler && method === 'goto' && Number.isInteger(pageId) && pageId > 0 && pageId < nextPage) handler = open(pageId);
    if (!handler && method === 'close' && !args.length) return undefined;
    if (!handler) throw new Error('page is not navigated or has been closed; call page.goto(url) first');
    if (method === 'close') {
      if (args.length) throw new Error('close does not accept arguments');
      handler.close(); pages.delete(pageId); return undefined;
    }
    if (method === 'scroll' || method === 'screenshot') throw new Error(`${method} is not implemented in Red Panda saved scripts`);
    let nodes = nodeStates.get(handler);
    if (!nodes || nodes.generation !== handler.page.documentGeneration) {
      nodes = { generation: handler.page.documentGeneration, next: 1, ids: new WeakMap(), byId: new Map() };
      nodeStates.set(handler, nodes);
    }
    const params = parameters(method, args), requestedNodeId = params.backendNodeId;
    if (requestedNodeId !== undefined) {
      const node = nodes.byId.get(requestedNodeId);
      if (!node || !handler.page.dom.window.document.contains(node)) throw new Error('NodeNotFound: script node is missing or stale');
      params.selector = selectorFor(node); delete params.backendNodeId;
    }
    let result;
    if (method.startsWith('waitFor')) {
      await handler.callTool('getUrl'); // Preserve native pre-navigation errors.
      const budget = params.timeout ?? 5000;
      if (!Number.isInteger(budget) || budget < 1 || budget > 2147483647) throw new Error('timeout must be a positive integer');
      const key = { waitForSelector: 'selector', waitForScript: 'script', waitForState: 'state' }[method];
      if (typeof params[key] !== 'string') throw new Error(`invalid argument '${key}'`);
      if (method === 'waitForState' && !['load', 'domcontentloaded', 'networkidle', 'networkalmostidle', 'done'].includes(params.state)) throw new Error('invalid load state');
      await withTimeout(until(() => {
        // The current document can change while a click-triggered navigation is pending.
        const page = handler.page, document = page.dom.window.document;
        if (method === 'waitForSelector') return document.querySelector(params.selector);
        if (method === 'waitForScript') return page.evaluate(`(${params.script}\n)`);
        return params.state === 'domcontentloaded' ? document.readyState !== 'loading' : ['networkidle', 'networkalmostidle', 'done'].includes(params.state)
          ? document.readyState === 'complete' && page.activeRequests.size <= (params.state === 'networkalmostidle' ? 2 : 0) && Date.now() - page.lastActivity >= 500
          : document.readyState === 'complete';
      }, { timeout: budget }), budget, `${method} timed out after ${budget}ms`);
      result = { content: [{ text: '' }], structuredContent: { url: handler.page.url, httpStatus: handler.page.status, title: handler.page.dom.window.document.title } };
    } else result = await handler.callTool(method, params);
    if (result.isError) throw new Error(result.content.map(item => item.text ?? '').join('\n'));
    if (method === 'goto') return { __lpFrameId: pageId };
    if (method === 'extract') return JSON.parse(result.content[0].text);
    const text = result.content[0].text;
    // Match native action descriptions while preserving explicit host errors.
    const metadata = result.structuredContent;
    const summary = metadata ? `Page url: ${metadata.url}, HTTP ${metadata.httpStatus} ${metadata.httpStatus >= 400 ? 'error' : 'OK'}, title: ${metadata.title}` : '';
    const selector = requestedNodeId !== undefined ? `backendNodeId: ${requestedNodeId}` : `selector: ${params.selector}`;
    if (method === 'click') return `Clicked element (${selector}). ${summary}`;
    if (method === 'fill') return `Filled element (${selector}) with ${JSON.stringify(params.value)}. ${summary}`;
    if (method === 'hover') return `Hovered element (${selector}). ${summary}`;
    if (method === 'press') return `Pressed key '${params.key}'. ${summary}`;
    if (method === 'selectOption') return `Selected option '${params.value}' (${selector}). ${summary}`;
    if (method === 'setChecked') return `Set element (${selector}) to ${params.checked ? 'checked' : 'unchecked'}. ${summary}`;
    if (method === 'waitForState') return `Page reached ${params.state}.`;
    if (method === 'waitForScript') return 'Script returned truthy.';
    if (method === 'waitForSelector') {
      if (nodes.generation !== handler.page.documentGeneration) {
        nodes = { generation: handler.page.documentGeneration, next: 1, ids: new WeakMap(), byId: new Map() };
        nodeStates.set(handler, nodes);
      }
      const node = handler.page.dom.window.document.querySelector(params.selector);
      let id = nodes.ids.get(node);
      if (!id) { id = nodes.next++; nodes.ids.set(node, id); nodes.byId.set(id, node); }
      return `Element found. backendNodeId: ${id}`;
    }
    return text;
  };
  try {
    return await new Promise((accept, reject) => {
      const fail = (cause, phase = cause.phase ?? 'runtime') => {
        if (finished) return;
        finished = true;
        reject(new ScriptError(cause.message, { phase, code: cause.code ?? 'SCRIPT_ERROR', output, cause }));
      };
      worker = new Worker(new URL(import.meta.url), {
        // Entry-point/debug/test flags can be invalid when replayed for a worker.
        execArgv: [],
        workerData: { redPandaScriptWorker: true, source, filename, timeout },
      });
      timer = setTimeout(() => fail(new Error(`Script timed out after ${timeout}ms`), 'timeout'), timeout);
      worker.on('error', error => fail(error));
      worker.on('exit', code => { if (!finished) fail(new Error(`Script worker exited before returning (code ${code})`)); });
      worker.on('message', message => {
        if (message.type === 'call') {
          Promise.resolve().then(() => { if (finished) throw new Error('Script execution has finished'); return invoke(message); }).then(
            value => ({ value }), error => ({ error: serializeError(error) }),
          ).then(reply => {
            try { message.port.postMessage(reply); }
            catch (error) { try { message.port.postMessage({ error: serializeError(error) }); } catch {} }
            finally {
              if (message.signal) { Atomics.store(message.signal, 0, 1); Atomics.notify(message.signal, 0); }
              message.port.close();
            }
          });
        } else if (!finished && message.type === 'console') output += message.text;
        else if (!finished && message.type === 'result') {
          finished = true; output += message.rendered;
          accept({ value: message.json === undefined ? undefined : JSON.parse(message.json), output });
        } else if (message.type === 'error') fail(message.error);
      });
    });
  } finally {
    clearTimeout(timer);
    await worker?.terminate();
    for (const handler of pages.values()) handler.close();
    browser.close();
  }
}

if (!isMainThread && workerData?.redPandaScriptWorker) scriptWorker();
