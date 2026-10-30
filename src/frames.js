import { completeInitialBlankFrame } from './document-reset.js';
import { createInvocationTrampoline } from './invocation.js';
import { installListenerOwnership, createOwnedWindow } from './listener-ownership.js';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// These hooks target pinned jsdom26. They affect only frames whose owner
// document belongs to an installed registry, and retain jsdom's actual windows.
// Scope: GET navigation, src/srcdoc/about:blank and normal jsdom subresources.
// Frame history, POST navigation, named targets, sandbox/CSP/origin isolation and
// cross-frame coordinate transforms are not implemented. Child facade close()
// unregisters its browsing context; native detach/parent close closes windows.
const require = createRequire(import.meta.url);
const FrameImpl = require('jsdom/lib/jsdom/living/nodes/HTMLFrameElement-impl.js').implementation;
const WindowFactory = require('jsdom/lib/jsdom/browser/Window.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const { parseIntoDocument } = require('jsdom/lib/jsdom/browser/parser');
const PerDocumentLoader = require('jsdom/lib/jsdom/browser/resources/per-document-resource-loader.js');
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/browser/Window.js'));
const { parseURL } = jsdomRequire('whatwg-url');
const DOCUMENTS = new WeakMap();
let patched = false, nativeAttrModified;
const operations = [];

function frameOperation(frame, invoke, overrides = {}) {
  const owner = DOCUMENTS.get(frame._ownerDocument);
  if (!owner || owner.registry.disposed) return invoke();
  const element = wrapperForImpl(frame);
  const srcdoc = overrides.ignoreSrcdoc ? undefined : overrides.srcdoc ?? (element.hasAttribute('srcdoc') ? element.getAttribute('srcdoc') : undefined);
  const operation = { frame, owner, srcdoc, ...overrides };
  const attributes = frame._attributeList;
  if (operation.url !== undefined || srcdoc !== undefined) {
    frame._attributeList = attributes.filter(attribute => attribute._localName !== 'src' || attribute._namespace !== null);
    frame._attributeList.push({ _namespace: null, _localName: 'src', _value: srcdoc !== undefined ? '' : operation.url });
  }
  operation.restore = () => { frame._attributeList = attributes; };
  // Avoid jsdom's synchronous blank-frame load shortcut so adapters are in
  // place before lifecycle events, including srcdoc's substituted parser.
  const noop = () => {};
  element.addEventListener('load', noop, { once: true });
  operations.push(operation);
  try { return invoke(); }
  finally {
    operations.pop(); operation.restore();
    element.removeEventListener('load', noop);
    operation.owner.registry.afterOperation(operation);
  }
}

function patch() {
  if (patched) return;
  patched = true;
  const attach = FrameImpl.prototype._attach;
  const detach = FrameImpl.prototype._detach;
  const attrModified = FrameImpl.prototype._attrModified;
  nativeAttrModified = attrModified;
  const createWindow = WindowFactory.createWindow;
  const fetchResource = PerDocumentLoader.prototype.fetch;
  FrameImpl.prototype._attach = function () { return frameOperation(this, () => attach.call(this)); };
  FrameImpl.prototype._detach = function () {
    const owner = DOCUMENTS.get(this._ownerDocument);
    owner?.registry.detach(this);
    return detach.call(this);
  };
  FrameImpl.prototype._attrModified = function (name, value, previous) {
    const owner = DOCUMENTS.get(this._ownerDocument);
    if (!owner || !this._attached || !['src', 'srcdoc'].includes(name)) return attrModified.call(this, name, value, previous);
    return frameOperation(this, () => name === 'srcdoc'
      ? attrModified.call(this, 'src', this.getAttributeNS(null, 'src'), this.getAttributeNS(null, 'src'))
      : attrModified.call(this, name, value, previous));
  };
  WindowFactory.createWindow = function (options) {
    const operation = operations.at(-1);
    const window = operation && !operation.created && !operation.owner.registry.disposed
      ? createOwnedWindow(createWindow, options) : createWindow(options);
    if (!operation || operation.created || operation.owner.registry.disposed) return window;
    operation.created = true; operation.restore();
    operation.owner.registry.register(operation, window);
    return window;
  };
  PerDocumentLoader.prototype.fetch = function (url, options) {
    const owner = DOCUMENTS.get(this._document);
    const frame = options.element;
    if (!owner || !['iframe', 'frame'].includes(frame.localName)) return fetchResource.call(this, url, options);
    const page = owner.registry.pageForElement(frame);
    if (!page) return fetchResource.call(this, url, options);
    let request;
    const loaded = options.onLoad;
    const abort = () => request?.abort?.();
    request = fetchResource.call(this, url, { ...options, onLoad(data) {
      if (page.closed) throw stale();
      owner.registry.beforeFrameParse(frame, request);
      page.documentAbort.signal.removeEventListener('abort', abort);
      return loaded?.(data);
    }, onError(error) {
      page.documentAbort.signal.removeEventListener('abort', abort);
      if (!page.closed) owner.registry.announce('frameNavigationError', { frameId: page.frameId, error });
      return options.onError?.(error);
    } });
    page.documentAbort.signal.addEventListener('abort', abort, { once: true });
    return request;
  };
}

// Keep retained inactive Documents as real DOM trees. Delegate every other
// cleanup operation to the original close, including timers, requests and ports.
function closeRetainingDocument(document, close) {
  const view = document._defaultView;
  // Registry teardown already discarded child browsing contexts. Remove their
  // Window accessors before native close recurses; retained iframe DOM nodes
  // no longer have a live contentWindow after their own teardown.
  if (view) {
    for (let index = 0; index < view._length; index++) Reflect.deleteProperty(view, String(index));
    view._length = 0;
  }
  document._lastFocusedElement = null;
  const body = document.body;
  const descriptor = body && Object.getOwnPropertyDescriptor(body, '_replaceAll');
  const replaceAll = body?._replaceAll;
  let pending = true;
  if (body) Object.defineProperty(body, '_replaceAll', { configurable: true, writable: true, value(node, ...args) {
    // Pinned jsdom's native close clears body.innerHTML with an empty real
    // fragment. Skip only that destructive teardown replacement, not parsing
    // or public mutation methods, and restore the private method immediately.
    if (pending && node?.nodeType === 11 && !node.firstChild) { pending = false; return; }
    return replaceAll.call(this, node, ...args);
  } });
  try { return close(); }
  finally {
    if (body) { if (descriptor) Object.defineProperty(body, '_replaceAll', descriptor); else delete body._replaceAll; }
    document._defaultView = null;
  }
}

function stale() { return Object.assign(new Error('Frame document is detached or no longer current'), { code: -32602 }); }
function originOf(window) { return implForWrapper(window.document)._origin ?? window.location.origin; }
function describe(page, parentId) {
  const window = page.dom.window;
  return { id: page.frameId ?? page.id, ...(parentId ? { parentId } : {}), loaderId: page.loaderId,
    url: window.location.href, name: window.frameElement?.getAttribute('name') ?? '',
    securityOrigin: originOf(window), mimeType: window.document.contentType };
}

class FramePage extends EventEmitter {
  constructor(registry, record, window) {
    super();
    this.registry = registry; this.record = record;
    this.id = this.frameId = record.id; this.parentFrameId = record.parentId;
    this.loaderId = randomUUID(); this.documentId = randomUUID();
    this.executionContextId = registry.page.browser.nextExecutionContext++;
    this.executionContextUniqueId = randomUUID();
    this.documentGeneration = record.generation++; this.navigationGeneration = this.documentGeneration;
    this.documentAbort = new AbortController(); this.closed = false;
    this.url = window.location.href;
    Object.defineProperty(this, 'securityOrigin', { get: () => originOf(window) });
    Object.defineProperty(this, 'mimeType', { get: () => implForWrapper(window.document).contentType });
    const global = window._globalObject;
    this.dom = { window: window._globalProxy, getInternalVMContext() {
      if (!vm.isContext(global)) throw new Error('Frame does not have a JavaScript VM context');
      return global;
    }, serialize: () => window.document.documentElement?.outerHTML ?? '' };
    for (const name of ['browser', 'context', 'userAgent', 'acceptLanguage', 'platform', 'userAgentMetadata', 'timeout', 'javascript',
      'extraHTTPHeaders', 'activeRequests', 'lastActivity', 'newDocumentScripts']) {
      Object.defineProperty(this, name, { enumerable: true, get: () => registry.page[name] });
    }
    this.on('console', payload => registry.announce('frameConsole', { ...payload, frameId: this.frameId, executionContextId: this.executionContextId }));
    this.on('pageError', error => registry.announce('framePageError', { frameId: this.frameId, executionContextId: this.executionContextId, error }));
    this.on('withinDocument', payload => registry.announce('frameWithinDocument', { frameId: this.frameId, ...payload }));
  }
  current() { if (this.closed || this.documentAbort.signal.aborted || this.record.page !== this) throw stale(); }
  evaluate(expression) {
    this.current();
    try { return vm.runInContext(expression, this.dom.getInternalVMContext(), { timeout: Math.min(this.timeout ?? 10000, 2000), displayErrors: false }); }
    finally { if (!this.closed) this.reconcileURL(); }
  }
  callFunction(declaration, thisArg, args = []) {
    this.current();
    try {
      return createInvocationTrampoline(this.dom.getInternalVMContext()).invokeDeclaration(declaration, thisArg, args,
        {timeout:Math.min(this.timeout ?? 10000,2000),displayErrors:false});
    } finally { if (!this.closed) this.reconcileURL(); }
  }
  referrerFor(url, source = this.url) { return this.registry.page.referrerFor(url, source); }
  async fetch(input, init = {}, type = 'Fetch') {
    this.current();
    const request = input instanceof Request ? input : new URL(String(input), this.dom.window.document.baseURI).href;
    const destination = input instanceof Request ? input.url : request;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (!init.skipDefaultReferrer && !headers.has('referer')) { const referrer = this.referrerFor(destination); if (referrer) headers.set('referer', referrer); }
    const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = callerSignal ? AbortSignal.any([this.documentAbort.signal, callerSignal]) : this.documentAbort.signal;
    return this.registry.page.fetch(request, { ...init, headers, signal, frameId: this.frameId, loaderId: this.loaderId,
      credentialsOrigin: init.credentialsOrigin ?? originOf(this.dom.window) }, type);
  }
  async navigate(url, options = {}) {
    this.current();
    return this.registry.navigate(this.frameId, url, options);
  }
  reconcileURL(window = this.dom.window) {
    if (this.closed || window !== this.dom.window || window.location.href === this.url) return;
    this.url = window.location.href; this.emit('withinDocument', { url: this.url, navigationType: 'fragment' });
  }
  close() { this.registry.detach(this.record.element); }
}

export function installFrames(page, window, { prepareWindow } = {}) {
  patch();
  const document = window.document, rootId = page.frameId ?? page.id;
  const existing = DOCUMENTS.get(implForWrapper(document));
  if (existing && !existing.registry.disposed) return existing.registry;
  const registry = new EventEmitter();
  const records = new Map(), elements = new WeakMap(), contexts = new Map();
  const root = { id: rootId, parentId: undefined, window, document, page, generation: 0, root: true };
  records.set(rootId, root);
  registry.page = page; registry.disposed = false;
  registry.frames = new Map([[rootId, page]]);
  registry.announce = (name, payload) => {
    registry.emit(name, payload);
    if (page.emitFrameEvent) page.emitFrameEvent(name, payload);
    else page.emit(name, payload);
  };
  function addContext(record) {
    const framePage = record.page;
    contexts.set(framePage.executionContextId, { page: framePage, window: record.window._globalProxy ?? record.window,
      context: record.window._globalObject, frameId: record.id });
  }
  addContext(root); DOCUMENTS.set(implForWrapper(document), { registry, record: root });
  function children(record) { return [...records.values()].filter(child => child.parentId === record.id); }
  function destroyDocument(record) {
    for (const child of children(record)) registry.detach(child.element);
    const old = record.page;
    if (!old || record.root || old.closed) return;
    old.closed = true; old.documentAbort.abort(); old.emit('close');
    DOCUMENTS.delete(implForWrapper(record.document)); contexts.delete(old.executionContextId);
    registry.announce('frameContextDestroyed', { frameId: record.id, executionContextId: old.executionContextId,
      executionContextUniqueId: old.executionContextUniqueId });
    record.page = undefined; registry.frames.delete(record.id);
  }
  registry.detach = element => {
    const implementation = implForWrapper(element) ?? element;
    const record = elements.get(implementation);
    if (!record || !records.has(record.id)) return;
    destroyDocument(record); records.delete(record.id); elements.delete(implementation);
    record.window.close();
    registry.announce('frameDetached', { frameId: record.id, reason: 'remove' });
  };
  function resourceLoader(framePage, inherited) {
    return Object.assign(Object.create(inherited), { fetch(url, options = {}) {
      const kind = ['iframe', 'frame'].includes(options.element?.localName) ? 'iframe' : options.element?.localName === 'link' ? 'stylesheet' : null;
      const enabled = framePage.browser.options.loadResources;
      if (kind && enabled !== undefined && !enabled.includes(kind)) return null;
      const abort = new AbortController(), headers = new Headers();
      if (options.accept) headers.set('accept', options.accept);
      const referrer = framePage.referrerFor(url, options.referrer); if (referrer) headers.set('referer', referrer);
      const type = kind === 'iframe' ? 'Document' : options.element?.localName === 'script' ? 'Script' : options.element?.localName === 'link' ? 'Stylesheet' : 'Other';
      const owner = kind === 'iframe' ? registry.findElement(options.element) ?? framePage : framePage;
      const request = owner.fetch(url, { headers, signal: abort.signal }, type).then(async response => {
        request.response = { statusCode: response.status, headers: Object.fromEntries(response.headers) };
        delete request.response.headers['set-cookie']; request.href = response.url;
        if (!response.ok) throw new Error(`Frame resource load failed (${response.status}): ${url}`);
        return Buffer.from(await response.arrayBuffer());
      });
      request.abort = () => abort.abort(); request.getHeader = name => headers.get(name) ?? framePage.extraHTTPHeaders.get(name);
      return request;
    } });
  }
  registry.register = (operation, childWindow) => {
    const implementation = operation.frame;
    let record = elements.get(implementation);
    const fresh = !record;
    if (!record) {
      record = { id: randomUUID(), parentId: operation.owner.record.id, element: implementation, generation: 0 };
      elements.set(implementation, record); records.set(record.id, record);
    } else destroyDocument(record);
    const parentWindow = operation.owner.record.window;
    childWindow._parent = parentWindow._globalProxy ?? parentWindow;
    childWindow._top = parentWindow.top; childWindow._frameElement = implementation;
    childWindow._virtualConsole = parentWindow._virtualConsole;
    record.window = childWindow; record.document = childWindow.document;
    const framePage = record.page = new FramePage(registry, record, childWindow);
    registry.frames.set(record.id, framePage);
    const impl = implForWrapper(record.document);
    record.waitingResource = !['about:blank', 'about:srcdoc'].includes(framePage.url) &&
      !/^javascript:/i.test(implementation.getAttributeNS(null, 'src') ?? '');
    if (operation.srcdoc !== undefined) {
      impl._URL = parseURL('about:srcdoc');
      impl._fallbackBaseURL = () => implementation._ownerDocument.baseURL();
      framePage.url = 'about:srcdoc';
      record.waitingResource = false;
      const close = impl.close;
      let substituted = false;
      impl.close = function () {
        if (!substituted) {
          substituted = true; this.open(); parseIntoDocument(operation.srcdoc, this);
        }
        return close.call(this, false);
      };
    }
    DOCUMENTS.set(impl, { registry, record }); addContext(record);
    const loader = resourceLoader(framePage, childWindow._resourceLoader);
    childWindow._resourceLoader = loader; impl._resourceLoader._resourceLoader = loader;
    if (fresh) registry.announce('frameAttached', { frameId: record.id, parentFrameId: record.parentId });
    registry.announce('frameNavigationStarted', { frameId: record.id, loaderId: framePage.loaderId, url: framePage.url });
    const closed = childWindow.close.bind(childWindow);
    childWindow.close = () => {
      if (record.page === framePage) destroyDocument(record);
      return closeRetainingDocument(impl, closed);
    };
    installListenerOwnership(childWindow._globalProxy).scope(() => {
    record.document.addEventListener('DOMContentLoaded', () => {
      if (!framePage.closed) registry.announce('frameDOMContentLoaded', { frameId: record.id, loaderId: framePage.loaderId });
    });
    childWindow.addEventListener('load', () => {
      if (!framePage.closed) registry.announce('frameLoad', { frameId: record.id, loaderId: framePage.loaderId });
    });
    childWindow.addEventListener('error', event => {
      if (!framePage.closed) framePage.emit('pageError', event.error ?? new Error(event.message));
    });
    });
    for (const type of ['log', 'info', 'warn', 'error', 'debug']) childWindow.console[type] = (...args) => framePage.emit('console', { type, args });
    // This call runs inside createWindow, before native frame parsing starts.
    prepareWindow?.(framePage, childWindow._globalProxy);
    // The known literal about:blank placeholder has no authored parser script.
    // Adopt only native load listeners added after prepareWindow has returned;
    // authored new-document injection listeners are already in the checkpoint.
    if (framePage.url === 'about:blank' && operation.srcdoc === undefined) {
      operation.blankListeners = installListenerOwnership(childWindow._globalProxy).checkpoint(record.document, 'load');
    }
    operation.record = record;
  };
  registry.afterOperation = operation => {
    const record = operation.record;
    if (!record?.page || record.page.closed || record.waitingResource) return;
    if (operation.blankListeners) {
      installListenerOwnership(record.window._globalProxy).adoptSince(record.document, 'load', operation.blankListeners);
      completeInitialBlankFrame(record.window._globalProxy);
    }
    registry.committed(record);
  };
  registry.committed = record => {
    const framePage = record.page;
    registry.announce('frameNavigated', { frame: describe(framePage, record.parentId), page: framePage });
    registry.announce('frameContextCreated', { frameId: record.id, page: framePage, context: {
      id: framePage.executionContextId, uniqueId: framePage.executionContextUniqueId,
      origin: originOf(record.window), name: '', auxData: { isDefault: true, type: 'default', frameId: record.id },
    } });
  };
  registry.pageForElement = implementation => elements.get(implementation)?.page;
  registry.findElement = element => !registry.disposed ? elements.get(implForWrapper(element) ?? element)?.page : undefined;
  registry.beforeFrameParse = (implementation, request) => {
    const record = elements.get(implementation);
    if (!record?.page || record.page.closed) throw stale();
    const finalURL = request?.href;
    if (finalURL) {
      const documentImpl = implForWrapper(record.document);
      documentImpl._URL = parseURL(finalURL); documentImpl._origin = new URL(finalURL).origin;
      documentImpl._clearBaseURLCache();
      record.window._origin = documentImpl._origin; record.page.url = finalURL;
      const mimeType = request?.response?.headers?.['content-type']?.split(';')[0].trim();
      if (mimeType) documentImpl.contentType = mimeType;
    }
    record.waitingResource = false; registry.committed(record);
  };
  registry.findFrame = id => !registry.disposed ? registry.frames.get(id) : undefined;
  registry.findContext = id => !registry.disposed ? contexts.get(id) : undefined;
  registry.getTree = () => {
    if (registry.disposed) throw stale();
    const tree = record => {
      const frame = record.root ? { id: rootId, loaderId: page.loaderId, url: window.location.href,
        securityOrigin: originOf(window), mimeType: page.mimeType ?? document.contentType } : describe(record.page, record.parentId);
      const descendants = children(record).filter(child => child.page && !child.page.closed);
      return { frame, ...(descendants.length ? { childFrames: descendants.map(tree) } : {}) };
    };
    return tree(root);
  };
  registry.navigate = async (id, input, { waitUntil = 'load', onCommit, method, body, headers, historyMode } = {}) => {
    const record = records.get(id);
    if (!record || record.root || !record.page) throw stale();
    if ((method && method.toUpperCase() !== 'GET') || body !== undefined || (headers && [...new Headers(headers)].length)) {
      throw new TypeError('Frame POST navigation and custom navigation headers are not implemented');
    }
    if (!['load', 'domcontentloaded'].includes(waitUntil)) throw new TypeError('Unsupported frame navigation wait condition');
    const url = new URL(String(input), record.document.baseURI);
    if (!['http:', 'https:', 'data:'].includes(url.protocol) && url.href !== 'about:blank') throw new TypeError(`Unsupported frame navigation URL: ${url.href}`);
    const previousURL = new URL(record.page.url);
    if (historyMode !== 'reload' && url.href.includes('#') && url.href.split('#')[0] === previousURL.href.split('#')[0]) {
      record.window.location.hash = url.hash; record.page.reconcileURL(); onCommit?.();
      return { url: record.page.url, frameId: id, loaderId: record.page.loaderId };
    }
    const implementation = record.element;
    // Trigger native loadFrame without altering reflected iframe.src/srcdoc.
    frameOperation(implementation, () => nativeAttrModified.call(implementation,
      'src', url.href, implementation.getAttributeNS(null, 'src')), { url: url.href, srcdoc: undefined, ignoreSrcdoc: true });
    const current = record.page; onCommit?.();
    const loaded = new Promise(resolve => {
      if (current.dom.window.document.readyState === 'complete') resolve();
      else installListenerOwnership(current.dom.window).add(current.dom.window, waitUntil === 'domcontentloaded' ? 'DOMContentLoaded' : 'load', resolve, { once: true });
    });
    let abort;
    const aborted = new Promise((_, reject) => {
      abort = () => reject(stale()); current.documentAbort.signal.addEventListener('abort', abort, { once: true });
    });
    let failed;
    const failure = new Promise((_, reject) => {
      failed = event => { if (event.frameId === id) reject(event.error); }; registry.on('frameNavigationError', failed);
    });
    let timer;
    try {
      await Promise.race([loaded, aborted, failure, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Frame navigation timed out')), current.timeout ?? 10000); })]);
      await current.moduleReady; return { url: current.url, frameId: id, loaderId: current.loaderId };
    } finally { clearTimeout(timer); current.documentAbort.signal.removeEventListener('abort', abort); registry.off('frameNavigationError', failed); }
  };
  const originalClose = window.close.bind(window);
  registry.dispose = () => {
    if (registry.disposed) return;
    for (const child of children(root)) registry.detach(child.element);
    for (let index = 0; index < window._length; index++) Reflect.deleteProperty(window, String(index));
    window._length = 0;
    registry.disposed = true; contexts.clear(); registry.frames.clear(); DOCUMENTS.delete(implForWrapper(document));
    page.documentAbort?.signal.removeEventListener('abort', registry.dispose);
  };
  window.close = () => { registry.dispose(); return originalClose(); };
  page.documentAbort?.signal.addEventListener('abort', registry.dispose, { once: true });
  return registry;
}
