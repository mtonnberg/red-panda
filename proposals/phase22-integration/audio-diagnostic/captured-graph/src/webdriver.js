import { randomUUID } from 'node:crypto';
import { VERSION, withTimeout } from './browser.js';
import { cookieToCDP, setCookie } from './cookies.js';

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const supportedEvents = new Set([
  'browsingContext.contextCreated', 'browsingContext.contextDestroyed', 'browsingContext.navigationStarted',
  'browsingContext.domContentLoaded', 'browsingContext.load', 'browsingContext.fragmentNavigated',
  'browsingContext.historyUpdated', 'script.realmCreated', 'script.realmDestroyed', 'log.entryAdded',
]);

class DriverError extends Error {
  constructor(error, message, status = 400) { super(message); this.error = error; this.status = status; }
}
const invalid = message => new DriverError('invalid argument', message);
const requireString = (value, name) => { if (typeof value !== 'string') throw invalid(`${name} must be a string`); return value; };
const requireObject = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${name} must be an object`);
  return value;
};
const safeText = value => { try { return String(value); } catch { return '[unprintable]'; } };

async function bodyJSON(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw invalid('Request body exceeds 1 MiB');
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return requireObject(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'Request body'); }
  catch (error) { if (error instanceof DriverError) throw error; throw invalid('Invalid JSON request body'); }
}

function negotiate(input) {
  const capabilities = requireObject(input.capabilities ?? {}, 'capabilities');
  const always = requireObject(capabilities.alwaysMatch ?? {}, 'alwaysMatch');
  const first = capabilities.firstMatch ?? [{}];
  if (!Array.isArray(first) || !first.length) throw invalid('firstMatch must be a non-empty array');
  for (const candidate of first) {
    requireObject(candidate, 'firstMatch entry');
    if (Object.keys(candidate).some(key => Object.hasOwn(always, key))) throw invalid('Capability appears in both alwaysMatch and firstMatch');
    const selected = { ...always, ...candidate };
    if (selected.browserName && !['red-panda', 'RedPanda', 'lightpanda'].includes(selected.browserName)) continue;
    if (selected.browserVersion && selected.browserVersion !== VERSION) continue;
    if (selected.acceptInsecureCerts === true || selected.proxy || (selected.pageLoadStrategy && selected.pageLoadStrategy !== 'normal')) continue;
    return selected;
  }
  throw new DriverError('session not created', 'No supported capability set matched', 500);
}

class DriverSession {
  constructor(manager, capabilities, classic) {
    this.manager = manager; this.browser = manager.browser; this.id = randomUUID();
    this.contextId = this.browser.createContext(); this.created = Date.now(); this.lastUsed = Date.now();
    this.capabilities = capabilities; this.currentPage = null; this.handles = new Map();
    this.subscriptions = new Map(); this.sockets = new Set(); this.pageListeners = new Map();
    this.pendingURLs = new Map(); this.realms = new Map(); this.scriptTimeout = 10000;
    if (classic) this.newPage();
  }
  touch() { this.lastUsed = Date.now(); }
  pages() { return [...this.browser.pages.values()].filter(page => page.context.id === this.contextId); }
  page(id = this.currentPage) {
    const page = this.browser.pages.get(id);
    if (!page || page.context.id !== this.contextId || page.closed) throw new DriverError('no such frame', 'Unknown browsing context', 404);
    return page;
  }
  newPage() { const page = this.browser.createPage(this.contextId); this.currentPage ??= page.id; this.attachPage(page); return page; }
  realm(page) { return `${page.id}:${page.executionContextId}`; }
  target(target) {
    requireObject(target, 'target');
    if (target.sandbox !== undefined && target.sandbox !== '') throw new DriverError('unsupported operation', 'Named script sandboxes are not implemented', 500);
    if (target.context) return this.page(target.context);
    if (target.realm) {
      const page = this.pages().find(page => this.realm(page) === target.realm);
      if (page) return page;
      throw new DriverError('no such realm', 'Unknown script realm', 404);
    }
    throw invalid('A context or realm target is required');
  }
  info(page) { return { context: page.id, url: page.url, userContext: 'default', originalOpener: null, children: [], parent: null }; }
  emit(method, params, page) {
    const interested = [...this.subscriptions.values()].some(sub => sub.events.has(method) && (!sub.contexts || sub.contexts.has(page?.id)));
    if (interested) for (const socket of this.sockets) this.manager.send(socket, { type: 'event', method, params });
  }
  attachPage(page) {
    if (this.pageListeners.has(page.id)) return;
    const listeners = [];
    const on = (name, callback) => { page.on(name, callback); listeners.push([name, callback]); };
    const navigation = () => ({ context: page.id, navigation: page.loaderId, timestamp: Date.now(), url: this.pendingURLs.get(page.id) ?? page.url });
    this.realms.set(page.id, this.realm(page));
    on('navigationStarted', () => this.emit('browsingContext.navigationStarted', navigation(), page));
    on('domContentLoaded', () => this.emit('browsingContext.domContentLoaded', navigation(), page));
    on('load', () => { this.pendingURLs.delete(page.id); this.emit('browsingContext.load', navigation(), page); });
    on('withinDocument', ({ url, navigationType }) => this.emit(navigationType === 'fragment' ? 'browsingContext.fragmentNavigated' : 'browsingContext.historyUpdated', {
      context: page.id, navigation: null, timestamp: Date.now(), url,
    }, page));
    on('contextsCleared', () => {
      const realm = this.realms.get(page.id);
      if (realm) this.emit('script.realmDestroyed', { realm }, page);
      for (const [id, entry] of this.handles) if (entry.pageId === page.id) this.handles.delete(id);
    });
    on('contextCreated', () => {
      this.realms.set(page.id, this.realm(page));
      this.emit('script.realmCreated', this.realmInfo(page), page);
    });
    on('console', ({ type, args }) => this.emit('log.entryAdded', { entry: {
      type: 'console', method: type, level: type === 'error' ? 'error' : type === 'warn' ? 'warn' : type === 'debug' ? 'debug' : 'info',
      text: args.map(safeText).join(' '), timestamp: Date.now(), source: { realm: this.realm(page), context: page.id },
      args: args.map(value => this.remote(value, page)),
    } }, page));
    on('pageError', error => this.emit('log.entryAdded', { entry: {
      type: 'javascript', level: 'error', text: error.message ?? safeText(error), timestamp: Date.now(), source: { realm: this.realm(page), context: page.id },
    } }, page));
    on('close', () => {
      this.emit('browsingContext.contextDestroyed', this.info(page), page);
      const realm = this.realms.get(page.id); if (realm) this.emit('script.realmDestroyed', { realm }, page);
      for (const [id, entry] of this.handles) if (entry.pageId === page.id) this.handles.delete(id);
      this.realms.delete(page.id); this.detachPage(page);
      if (this.currentPage === page.id) this.currentPage = this.pages()[0]?.id ?? null;
    });
    this.pageListeners.set(page.id, { page, listeners });
    this.emit('browsingContext.contextCreated', this.info(page), page);
    this.emit('script.realmCreated', this.realmInfo(page), page);
  }
  detachPage(page) {
    const entry = this.pageListeners.get(page.id);
    if (entry) for (const [name, callback] of entry.listeners) page.off(name, callback);
    this.pageListeners.delete(page.id);
  }
  realmInfo(page) { return { realm: this.realm(page), origin: page.securityOrigin??new URL(page.url).origin, type: 'window', context: page.id }; }
  handle(value, page, kind = 'handle') {
    if (kind !== 'handle') for (const [id, entry] of this.handles) {
      if (entry.value === value && entry.pageId === page.id && entry.generation === page.executionContextId && entry.kind === kind) return id;
    }
    const id = randomUUID(); this.handles.set(id, { value, pageId: page.id, generation: page.executionContextId, kind }); return id;
  }
  referenced(id, page) {
    const entry = this.handles.get(id);
    if (!entry || entry.pageId !== page.id || entry.generation !== page.executionContextId) throw new DriverError('no such handle', 'Unknown or stale remote value', 404);
    return entry.value;
  }
  remote(value, page, ownership = 'none', depth = 0, seen = new Map(), maxDepth = 10) {
    if (value === undefined) return { type: 'undefined' };
    if (value === null) return { type: 'null' };
    const type = typeof value;
    if (type === 'number') return { type, value: Number.isNaN(value) ? 'NaN' : value === Infinity ? 'Infinity' : value === -Infinity ? '-Infinity' : Object.is(value, -0) ? '-0' : value };
    if (type === 'bigint') return { type, value: String(value) };
    if (['string', 'boolean'].includes(type)) return { type, value };
    if (type === 'symbol') return { type: 'symbol' };
    const name = value.nodeType ? 'node' : Array.isArray(value) ? 'array' : Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
    const result = { type: ['node', 'array', 'date', 'regexp', 'map', 'set', 'function', 'promise', 'error'].includes(name) ? name : type === 'function' ? 'function' : 'object' };
    if (ownership === 'root' && depth === 0) result.handle = this.handle(value, page);
    if (seen.has(value)) return { ...result, internalId: seen.get(value) };
    const internalId = String(seen.size); seen.set(value, internalId); result.internalId = internalId;
    const child = item => this.remote(item, page, 'none', depth + 1, seen, maxDepth);
    if (value.nodeType) {
      result.sharedId = this.handle(value, page, 'node');
      result.value = { nodeType: value.nodeType, childNodeCount: value.childNodes?.length ?? 0,
        ...(value.localName ? { localName: value.localName, namespaceURI: value.namespaceURI, attributes: Object.fromEntries([...value.attributes].map(a => [a.name, a.value])) } : {}),
        ...(value.nodeValue !== null ? { nodeValue: value.nodeValue } : {}),
      };
    } else if (name === 'date') result.value = value.toISOString();
    else if (name === 'regexp') result.value = { pattern: value.source, flags: value.flags };
    else if (depth < maxDepth) {
      if (Array.isArray(value)) result.value = Array.from(value, child);
      else if (name === 'map') result.value = [...value].map(([key, item]) => [child(key), child(item)]);
      else if (name === 'set') result.value = [...value].map(child);
      else if (type === 'object' && !['promise', 'error'].includes(name)) result.value = Object.keys(value).map(key => [key, child(value[key])]);
    }
    return result;
  }
  local(value, page) {
    requireObject(value, 'script argument');
    if (value.handle || value.sharedId) return this.referenced(value.handle ?? value.sharedId, page);
    switch (value.type) {
      case 'undefined': return undefined;
      case 'null': return null;
      case 'string': return requireString(value.value, 'string value');
      case 'boolean': if (typeof value.value !== 'boolean') throw invalid('Invalid boolean'); return value.value;
      case 'number': {
        if (typeof value.value === 'number') return value.value;
        if (value.value === 'NaN') return NaN;
        if (value.value === 'Infinity') return Infinity;
        if (value.value === '-Infinity') return -Infinity;
        if (value.value === '-0') return -0;
        throw invalid('Invalid number');
      }
      case 'bigint': try { return BigInt(value.value); } catch { throw invalid('Invalid bigint'); }
      case 'array': if (!Array.isArray(value.value)) throw invalid('Invalid array'); return value.value.map(item => this.local(item, page));
      case 'object': {
        if (!Array.isArray(value.value)) throw invalid('Invalid object');
        const object = Object.create(null);
        for (const pair of value.value) {
          if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') throw invalid('Invalid object entry');
          Object.defineProperty(object, pair[0], { value: this.local(pair[1], page), writable: true, configurable: true, enumerable: true });
        }
        return object;
      }
      default: throw invalid(`Unsupported local value type: ${value.type}`);
    }
  }
  async navigate(page, url, wait = 'complete', mode) {
    requireString(url, 'url');
    if (!['none', 'interactive', 'complete'].includes(wait)) throw invalid('Unsupported navigation wait condition');
    const absolute = new URL(url, page.url).href;
    this.pendingURLs.set(page.id, absolute);
    const task = page.navigate(absolute, { waitUntil: wait === 'interactive' ? 'domcontentloaded' : 'load', ...(mode ? { historyMode: mode } : {}) });
    if (wait === 'none') task.catch(() => this.pendingURLs.delete(page.id)); else await task;
    return { navigation: page.loaderId, url: absolute };
  }
  async command(method, params) {
    this.touch();
    switch (method) {
      case 'session.status': return { ready: false, message: 'Session is active' };
      case 'session.subscribe': {
        if (!Array.isArray(params.events) || !params.events.length) throw invalid('events must be a non-empty array');
        const events = new Set();
        for (const event of params.events) {
          requireString(event, 'event');
          const names = supportedEvents.has(event) ? [event] : [...supportedEvents].filter(name => name.startsWith(`${event}.`));
          if (!names.length) throw invalid(`Unsupported event: ${event}`);
          names.forEach(name => events.add(name));
        }
        let contexts;
        if (params.contexts !== undefined) {
          if (!Array.isArray(params.contexts) || !params.contexts.length) throw invalid('contexts must be a non-empty array');
          contexts = new Set(params.contexts.map(id => this.page(id).id));
        }
        const subscription = randomUUID(); this.subscriptions.set(subscription, { events, contexts }); return { subscription };
      }
      case 'session.unsubscribe': {
        if (!Array.isArray(params.subscriptions)) throw invalid('subscriptions must be an array');
        for (const id of params.subscriptions) if (!this.subscriptions.has(id)) throw new DriverError('no such subscription', 'Unknown subscription', 404);
        for (const id of params.subscriptions) this.subscriptions.delete(id);
        return {};
      }
      case 'browsingContext.create': {
        if (!['tab', 'window'].includes(params.type)) throw invalid('type must be tab or window');
        if (params.userContext !== undefined && params.userContext !== 'default') throw new DriverError('no such user context', 'Unknown user context', 404);
        return { context: this.newPage().id };
      }
      case 'browsingContext.getTree': {
        if (params.maxDepth !== undefined && (!Number.isInteger(params.maxDepth) || params.maxDepth < 0)) throw invalid('maxDepth must be non-negative');
        return { contexts: (params.root ? [this.page(params.root)] : this.pages()).map(page => this.info(page)) };
      }
      case 'browsingContext.navigate': return this.navigate(this.page(params.context), params.url, params.wait);
      case 'browsingContext.reload': { const page = this.page(params.context); return this.navigate(page, page.url, params.wait, 'reload'); }
      case 'browsingContext.close': this.page(params.context).close(); return {};
      case 'browsingContext.activate': this.currentPage = this.page(params.context).id; return {};
      case 'script.getRealms': {
        if (params.type !== undefined && params.type !== 'window') return { realms: [] };
        return { realms: (params.context ? [this.page(params.context)] : this.pages()).map(page => this.realmInfo(page)) };
      }
      case 'script.evaluate':
      case 'script.callFunction': {
        const page = this.target(params.target);
        const ownership = params.resultOwnership ?? 'none';
        if (!['none', 'root'].includes(ownership)) throw invalid('Invalid result ownership');
        const maxDepth = params.serializationOptions?.maxObjectDepth ?? 10;
        if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 64) throw invalid('maxObjectDepth must be between 0 and 64');
        if (params.awaitPromise !== undefined && typeof params.awaitPromise !== 'boolean') throw invalid('awaitPromise must be boolean');
        let args, thisArg;
        if (method === 'script.callFunction') {
          if (params.arguments !== undefined && !Array.isArray(params.arguments)) throw invalid('arguments must be an array');
          args = (params.arguments ?? []).map(value => this.local(value, page));
          thisArg = params.this ? this.local(params.this, page) : page.dom.window;
          requireString(params.functionDeclaration, 'functionDeclaration');
        } else requireString(params.expression, 'expression');
        try {
          let value = method === 'script.evaluate' ? page.evaluate(params.expression) : page.callFunction(params.functionDeclaration, thisArg, args);
          if (params.awaitPromise) value = await withTimeout(Promise.resolve(value), this.scriptTimeout, 'Script timed out');
          return { type: 'success', realm: this.realm(page), result: this.remote(value, page, ownership, 0, new Map(), maxDepth) };
        } catch (error) {
          return { type: 'exception', realm: this.realm(page), exceptionDetails: {
            text: error.message ?? safeText(error), lineNumber: 0, columnNumber: 0,
            exception: this.remote(error, page), stackTrace: { callFrames: [] },
          } };
        }
      }
      case 'script.disown': {
        const page = this.target(params.target);
        if (!Array.isArray(params.handles) || params.handles.some(value => typeof value !== 'string')) throw invalid('handles must be an array of strings');
        for (const id of params.handles) { const entry = this.handles.get(id); if (entry?.pageId === page.id) this.handles.delete(id); }
        return {};
      }
      default: throw new DriverError('unknown command', `Unsupported BiDi method: ${method}`, 404);
    }
  }
  classicValue(value, page, seen = new Set()) {
    if (value === undefined || value === null) return null;
    if (['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value.nodeType === 1) return { [ELEMENT_KEY]: this.handle(value, page, 'element') };
    if (typeof value !== 'object') throw new DriverError('javascript error', 'Value is not JSON serializable', 500);
    if (seen.has(value)) throw new DriverError('javascript error', 'Cyclic result is not JSON serializable', 500);
    seen.add(value);
    const result = Array.isArray(value) ? value.map(item => this.classicValue(item, page, seen)) : Object.fromEntries(Object.keys(value).map(key => [key, this.classicValue(value[key], page, seen)]));
    seen.delete(value); return result;
  }
  classicArgument(value, page) {
    if (!value || typeof value !== 'object') return value;
    if (Object.hasOwn(value, ELEMENT_KEY)) {
      try { return this.referenced(value[ELEMENT_KEY], page); }
      catch { throw new DriverError('stale element reference', 'Element no longer belongs to the current document', 404); }
    }
    if (Array.isArray(value)) return value.map(item => this.classicArgument(item, page));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.classicArgument(item, page)]));
  }
  async classic(method, command, params) {
    this.touch();
    if (command === 'window/handles' && method === 'GET') return this.pages().map(page => page.id);
    if (command === 'window' && method === 'POST') { this.currentPage = this.page(params.handle).id; return null; }
    if (command === 'window/new' && method === 'POST') { const page = this.newPage(); return { handle: page.id, type: 'tab' }; }
    const page = this.page();
    if (command === 'url' && method === 'GET') return page.url;
    if (command === 'url' && method === 'POST') { await this.navigate(page, params.url); return null; }
    if (command === 'title' && method === 'GET') return page.dom.window.document.title;
    if (command === 'source' && method === 'GET') return page.dom.serialize();
    if (command === 'window' && method === 'GET') return page.id;
    if (command === 'window' && method === 'DELETE') { page.close(); return this.pages().map(page => page.id); }
    if (command === 'refresh' && method === 'POST') { await this.navigate(page, page.url, 'complete', 'reload'); return null; }
    if (['back', 'forward'].includes(command) && method === 'POST') {
      await page.traverseHistory(page.historyIndex + (command === 'back' ? -1 : 1), { forceReload: true }); return null;
    }
    if (['execute/sync', 'execute/async'].includes(command) && method === 'POST') {
      requireString(params.script, 'script');
      if (!Array.isArray(params.args)) throw invalid('args must be an array');
      const args = params.args.map(value => this.classicArgument(value, page));
      try {
        let value;
        if (command === 'execute/async') value = await withTimeout(new Promise((resolve, reject) => {
          try { page.callFunction(`function(){${params.script}\n}`, page.dom.window, [...args, resolve]); } catch (error) { reject(error); }
        }), this.scriptTimeout, 'Script timed out');
        else value = await withTimeout(Promise.resolve(page.callFunction(`function(){${params.script}\n}`, page.dom.window, args)), this.scriptTimeout, 'Script timed out');
        return this.classicValue(value, page);
      } catch (error) { if (error instanceof DriverError) throw error; throw new DriverError(/timed out/i.test(error.message) ? 'script timeout' : 'javascript error', error.message, 500); }
    }
    if (command === 'cookie' && method === 'GET') return (await page.context.cookies.getCookies(page.url)).map(cookieToCDP);
    if (command === 'cookie' && method === 'POST') { await setCookie(page.context.cookies, requireObject(params.cookie, 'cookie'), page.url); return null; }
    if (command === 'cookie' && method === 'DELETE') {
      for (const cookie of await page.context.cookies.getCookies(page.url)) {
        await new Promise((resolve, reject) => page.context.cookies.store.removeCookie(cookie.domain, cookie.path, cookie.key, error => error ? reject(error) : resolve()));
      }
      return null;
    }
    if (command === 'timeouts' && method === 'GET') return { script: this.scriptTimeout, pageLoad: page.timeout, implicit: 0 };
    if (command === 'timeouts' && method === 'POST') {
      for (const key of ['script', 'pageLoad', 'implicit']) if (params[key] !== undefined && (!Number.isSafeInteger(params[key]) || params[key] < 0)) throw invalid(`Invalid ${key} timeout`);
      if (params.implicit) throw new DriverError('unsupported operation', 'Implicit waits are not implemented', 500);
      if (params.script !== undefined) this.scriptTimeout = params.script;
      if (params.pageLoad !== undefined) for (const owned of this.pages()) owned.timeout = params.pageLoad || 1;
      return null;
    }
    if (['element', 'elements'].includes(command) && method === 'POST') {
      if (params.using !== 'css selector') throw new DriverError('unsupported operation', 'Only CSS selectors are implemented', 500);
      requireString(params.value, 'value');
      let nodes; try { nodes = [...page.dom.window.document.querySelectorAll(params.value)]; } catch (error) { throw new DriverError('invalid selector', error.message, 400); }
      if (command === 'elements') return nodes.map(node => ({ [ELEMENT_KEY]: this.handle(node, page, 'element') }));
      if (!nodes.length) throw new DriverError('no such element', 'No matching element', 404);
      return { [ELEMENT_KEY]: this.handle(nodes[0], page, 'element') };
    }
    throw new DriverError('unknown command', `Unsupported WebDriver command: ${method} ${command}`, 404);
  }
  dispose(except) {
    for (const page of this.pages()) this.detachPage(page);
    this.browser.disposeContext(this.contextId);
    this.handles.clear(); this.subscriptions.clear();
    for (const socket of this.sockets) if (socket !== except) socket.close(1000, 'WebDriver session ended');
    this.sockets.clear();
  }
}

/**
 * Independent WebDriver/BiDi adapter. Parent HTTP server calls await handle(req,
 * res, parsedURL), then falls through if false. For upgrades, accepts(path)
 * identifies /session or an existing /session/:id; after its normal Origin
 * checks the parent upgrades and calls attach(ws,{path,webSocketUrl}). close()
 * releases only adapter-owned sessions/pages, leaving unrelated CDP pages alone.
 * webSocketUrl option may be a base string or (sessionId,request)=>absolute URL.
 */
export function createWebDriver(browser, { sessionTimeout = 60, webSocketUrl } = {}) {
  if (!Number.isFinite(sessionTimeout) || sessionTimeout < 0) throw new Error('sessionTimeout must be non-negative seconds');
  const sessions = new Map(), connections = new Set();
  const send = (socket, message) => { if (socket.readyState === 1) socket.send(JSON.stringify(message)); };
  const manager = { browser, send };
  const get = id => { const session = sessions.get(id); if (!session) throw new DriverError('invalid session id', 'Unknown WebDriver session', 404); session.touch(); return session; };
  const create = (params, classic) => { const session = new DriverSession(manager, negotiate(params), classic); sessions.set(session.id, session); return session; };
  const end = (session, except) => { sessions.delete(session.id); session.dispose(except); };
  const caps = (session, request, override) => {
    let url;
    if (typeof webSocketUrl === 'function') url = webSocketUrl(session.id, request);
    else {
      const base = override ?? webSocketUrl ?? `ws://${request?.headers.host ?? '127.0.0.1'}`;
      url = `${base.replace(/\/$/, '').replace(/\/session$/, '')}/session/${session.id}`;
    }
    return { browserName: 'red-panda', browserVersion: VERSION, platformName: process.platform, acceptInsecureCerts: false,
      setWindowRect: false, pageLoadStrategy: 'normal', ...(session.capabilities.webSocketUrl ? { webSocketUrl: url } : {}) };
  };
  const onCreated = page => { for (const session of sessions.values()) if (page.context.id === session.contextId) session.attachPage(page); };
  browser.on('targetCreated', onCreated);
  const expiration = sessionTimeout > 0 ? setInterval(() => {
    const deadline = Date.now() - sessionTimeout * 1000;
    for (const session of sessions.values()) if (session.lastUsed < deadline) end(session);
  }, Math.min(1000, sessionTimeout * 1000)) : null;
  expiration?.unref();

  async function handle(request, response, parsedURL) {
    const url = parsedURL ?? new URL(request.url, 'http://127.0.0.1');
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (path !== '/status' && path !== '/session' && !path.startsWith('/session/')) return false;
    const reply = (status, value) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify({ value })); };
    try {
      if (path === '/status' && request.method === 'GET') { reply(200, { ready: true, message: 'Red Panda WebDriver is accepting sessions' }); return true; }
      const params = ['POST', 'PUT'].includes(request.method) ? await bodyJSON(request) : {};
      if (path === '/session' && request.method === 'POST') {
        const session = create(params, true); reply(200, { sessionId: session.id, capabilities: caps(session, request) }); return true;
      }
      const match = /^\/session\/([^/]+)(?:\/(.*))?$/.exec(path);
      if (!match) throw new DriverError('unknown command', 'Unknown WebDriver endpoint', 404);
      const session = get(decodeURIComponent(match[1]));
      if (!match[2] && request.method === 'DELETE') { end(session); reply(200, null); return true; }
      reply(200, await session.classic(request.method, match[2] ?? '', params));
    } catch (error) {
      const known = error instanceof DriverError;
      reply(known ? error.status : 500, { error: known ? error.error : 'unknown error', message: error.message ?? safeText(error), stacktrace: '' });
    }
    return true;
  }

  function accepts(path) {
    const pathname = path.split('?')[0].replace(/\/$/, '');
    try { return pathname === '/session' || /^\/session\/[^/]+$/.test(pathname) && sessions.has(decodeURIComponent(pathname.slice('/session/'.length))); }
    catch { return false; }
  }
  function attach(socket, { path = '/session', webSocketUrl: advertised } = {}) {
    const pathname = path.split('?')[0].replace(/\/$/, '');
    let session;
    try { session = pathname.startsWith('/session/') ? sessions.get(decodeURIComponent(pathname.slice('/session/'.length))) : null; }
    catch { socket.close(1008, 'Invalid session path'); return; }
    let ownsSession = false;
    if (pathname !== '/session' && !session) { socket.close(1008, 'Unknown session'); return; }
    if (session) session.sockets.add(socket);
    connections.add(socket);
    socket.on('message', async raw => {
      let message;
      try {
        try { message = JSON.parse(raw); } catch { throw invalid('Invalid JSON request'); }
        requireObject(message, 'request');
        if (!Number.isSafeInteger(message.id) || message.id < 0) throw invalid('id must be a non-negative integer');
        requireString(message.method, 'method');
        const params = requireObject(message.params ?? {}, 'params');
        let result, closeAfter = false;
        if (message.method === 'session.status') result = { ready: !session, message: session ? 'Session is active' : 'Ready for a session' };
        else if (message.method === 'session.new') {
          if (session) throw new DriverError('session not created', 'Connection already has a session', 500);
          session = create(params, false); ownsSession = true; session.sockets.add(socket);
          result = { sessionId: session.id, capabilities: caps(session, undefined, advertised) };
        } else {
          if (!session || !sessions.has(session.id)) throw new DriverError('invalid session id', 'No active session', 404);
          if (message.method === 'session.end') { end(session, socket); session = null; result = {}; closeAfter = true; }
          else result = await session.command(message.method, params);
        }
        send(socket, { type: 'success', id: message.id, result });
        if (closeAfter) socket.close(1000, 'Session ended');
      } catch (error) {
        send(socket, { type: 'error', id: Number.isSafeInteger(message?.id) ? message.id : null,
          error: error instanceof DriverError ? error.error : 'unknown error', message: error.message ?? safeText(error), stacktrace: '' });
      }
    });
    const cleanup = () => {
      connections.delete(socket);
      if (session) {
        session.sockets.delete(socket);
        if (ownsSession && sessions.has(session.id)) end(session);
      }
    };
    socket.once('close', cleanup); socket.once('error', cleanup);
  }
  function close() {
    if (expiration) clearInterval(expiration);
    browser.off('targetCreated', onCreated);
    for (const session of [...sessions.values()]) end(session);
    for (const socket of connections) socket.terminate();
    connections.clear();
  }
  return { handle, accepts, attach, close, sessions };
}
