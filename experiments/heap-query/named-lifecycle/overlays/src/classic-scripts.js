import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ScriptImpl = require('jsdom/lib/jsdom/living/nodes/HTMLScriptElement-impl.js').implementation;
const LinkImpl = require('jsdom/lib/jsdom/living/nodes/HTMLLinkElement-impl.js').implementation;
const ResourceLoader = require('jsdom/lib/jsdom/browser/resources/per-document-resource-loader.js');
const DocumentImpl = require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'));
const parse5 = jsdomRequire('parse5');
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const documents = new WeakMap(), flags = new WeakMap();
const hintKeys = new WeakMap();
let patched = false;
const scriptTypes = new Set(['application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript',
  'text/livescript', 'text/x-ecmascript', 'text/x-javascript', 'module', 'importmap']);

function active(record) { return record && !record.disposed && !record.signal?.aborted && !record.page.closed; }
function state(script) {
  if (!flags.has(script)) flags.set(script, { forceAsync: !(script._parserInserted && script._alreadyStarted) });
  return flags.get(script);
}
function asyncValue(script) { return script.hasAttributeNS(null, 'async') || state(script).forceAsync; }
function cacheKey(url, element) {
  return JSON.stringify([url, element.getAttributeNS(null, 'crossorigin'), element.getAttributeNS(null, 'referrerpolicy') ?? '']);
}
function resourceEvent(record, element, type) {
  if (!active(record) || !element._attached) return;
  const event = implForWrapper(new record.window.Event(type)); event.isTrusted = true; element._dispatch(event);
}
function preload(record, element) {
  if (!active(record) || record.page.javascript === false || !element._attached) return;
  if (!(element.getAttributeNS(null, 'rel') ?? '').toLowerCase().split(/\s+/).includes('preload') ||
      (element.getAttributeNS(null, 'as') ?? '').toLowerCase() !== 'script') { hintKeys.delete(element); return; }
  const href = element.getAttributeNS(null, 'href'); if (!href?.trim()) return;
  let url;
  try { url = new URL(href, record.window.document.baseURI).href; } catch { return; }
  const key = cacheKey(url, element);
  if (hintKeys.get(element) === key) return;
  hintKeys.set(element, key);
  let entry = record.preloads.get(key);
  if (!entry) {
    const headers = new Headers({ accept: '*/*' });
    const referrer = record.page.referrerFor?.(url, record.window.document.URL);
    if (referrer) headers.set('referer', referrer);
    const signal = record.signal ? AbortSignal.any([record.signal, record.preloadAbort.signal]) : record.preloadAbort.signal;
    const promise = record.page.fetch(url, { headers, signal }, 'Script').then(async response => {
      if (!response.ok) throw new Error(`Script preload failed (${response.status}): ${url}`);
      const metadata = { statusCode: response.status, headers: Object.fromEntries(response.headers) };
      delete metadata.headers['set-cookie'];
      return { bytes: Buffer.from(await response.arrayBuffer()), response: metadata, href: response.url || url };
    });
    promise.catch(() => {}); entry = { promise }; record.preloads.set(key, entry);
  }
  // These events follow completion of a real body fetch. Unused hints are not
  // inserted into Document's resource queue and cannot delay its load event.
  entry.promise.then(() => {
    if (hintKeys.get(element) === key) resourceEvent(record, element, 'load');
  }, () => {
    if (hintKeys.get(element) === key) resourceEvent(record, element, 'error');
  });
}
function adoptPreload(record, url, element) {
  const key = cacheKey(url, element), entry = record.preloads.get(key);
  if (!entry || entry.consumed) return undefined;
  entry.consumed = true;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const request = Promise.race([entry.promise, aborted]).then(result => {
    request.response = result.response; request.href = result.href; return Buffer.from(result.bytes);
  });
  request.abort = () => rejectAbort(new DOMException('Script preload adoption was aborted', 'AbortError'));
  request.getHeader = () => undefined;
  const release = () => { if (record.preloads.get(key) === entry) record.preloads.delete(key); };
  request.then(release, release);
  return request;
}
function finishParser(record, parser) {
  if (!active(record) || parser.tokenizer.paused || !parser.stopped) return;
  record.parserDone = true; record.blocker = null;
  if (record.closeRequested) {
    const arguments_ = record.closeRequested; record.closeRequested = null;
    record.document.close(...arguments_);
  }
}
function resumeAfterScript(record, script) {
  const blocker = record.blocker;
  if (!blocker || blocker.script !== script || blocker.scheduled) return;
  blocker.scheduled = true;
  queueMicrotask(() => {
    if (!active(record) || record.blocker !== blocker) return;
    record.blocker = null;
    if (blocker.parser.tokenizer.paused) blocker.parser.tokenizer.resume(() => finishParser(record, blocker.parser));
  });
}

function patch() {
  if (patched) return;
  patched = true;
  const evaluate = ScriptImpl.prototype._eval;
  const fetchInternal = ScriptImpl.prototype._fetchInternalScript;
  const modify = ScriptImpl.prototype._attrModified;
  const textChanged = ScriptImpl.prototype._childTextContentChangeSteps;
  const dispatch = ScriptImpl.prototype._dispatch;
  const fetchResource = ResourceLoader.prototype.fetch;
  const parse = parse5.parse;
  const closeDocument = DocumentImpl.prototype.close;
  const attachLink = LinkImpl.prototype._attach, modifyLink = LinkImpl.prototype._attrModified, dispatchLink = LinkImpl.prototype._dispatch;
  LinkImpl.prototype._dispatch = function (...args) {
    const result = dispatchLink.apply(this, args), record = documents.get(this._ownerDocument);
    if (record && args[0].isTrusted && ['load', 'error'].includes(args[0].type)) record.styles.delete(this);
    return result;
  };
  LinkImpl.prototype._attach = function () {
    attachLink.call(this); const record = documents.get(this._ownerDocument); if (record) preload(record, this);
  };
  LinkImpl.prototype._attrModified = function (name, value, previous) {
    modifyLink.call(this, name, value, previous);
    const record = documents.get(this._ownerDocument);
    if (record && ['rel', 'as', 'href', 'crossorigin', 'referrerpolicy'].includes(name)) preload(record, this);
  };

  parse5.parse = function (markup, options) {
    const record = documents.get(options?.treeAdapter?._documentImpl);
    if (!active(record) || record.page.javascript === false) return parse.call(this, markup, options);
    const parser = new parse5.Parser(options, undefined, null, script => {
      const type = script._getTypeString()?.toLowerCase();
      if (type === 'module' || type === 'importmap' || !scriptTypes.has(type) || !script._canRunScript()) return;
      if (!script.hasAttributeNS(null, 'src')) {
        if (script.text.length && record.styles.size) { record.blocker = { script, parser, kind: 'styles', scheduled: false }; parser.tokenizer.pause(); }
        return;
      }
      if (!script.getAttributeNS(null, 'src').trim() ||
          script._ownerDocument.encodingParseAURL(script.getAttributeNS(null, 'src')) === null ||
          script.hasAttributeNS(null, 'async') || script.hasAttributeNS(null, 'defer')) return;
      record.blocker = { script, parser, scheduled: false };
      parser.tokenizer.pause();
    });
    record.parser = parser; record.parserDone = false;
    parser.tokenizer.write(markup, true, () => finishParser(record, parser));
    return parser.document;
  };
  DocumentImpl.prototype.close = function (...args) {
    const record = documents.get(this);
    if (active(record) && record.parser && !record.parserDone) { record.closeRequested = args; return; }
    return closeDocument.apply(this, args);
  };

  ScriptImpl.prototype._eval = function () {
    const record = documents.get(this._ownerDocument);
    if (!record) return evaluate.call(this);
    if (!active(record)) return;
    const inserted = this._parserInserted;
    const empty = !this.hasAttributeNS(null, 'src') && this.text.length === 0;
    if (inserted && !this._alreadyStarted) {
      state(this).forceAsync = true;
      if (!empty && this._attached && scriptTypes.has(this._getTypeString()?.toLowerCase())) state(this).forceAsync = false;
    }
    const result = evaluate.call(this);
    // Preparation of an empty parser script leaves it eligible for later text
    // insertion. The HTML parser no longer owns that unstarted script.
    if (inserted && empty && !this._alreadyStarted) this._parserInserted = false;
    return result;
  };
  ScriptImpl.prototype._fetchInternalScript = function () {
    const document = this._ownerDocument, record = documents.get(document);
    if (!record) return fetchInternal.call(this);
    if (!active(record) || !this._canRunScript()) return;
    if (this._parserInserted && !record.parser) return fetchInternal.call(this);
    const execute = () => {
      const current = document._currentScript, writeAfter = document._writeAfterElement;
      const hadWriteAfter = Object.hasOwn(document, '_writeAfterElement');
      try {
        // Delegate to the current evaluator, including any module-loader wrapper.
        // Do not replace _innerEval or maintain a second JavaScript execution path.
        return this._innerEval(this.text, document.URL);
      } finally {
        document._currentScript = current;
        if (hadWriteAfter) document._writeAfterElement = writeAfter;
        else delete document._writeAfterElement;
      }
    };
    if (record.blocker?.script === this && record.blocker.kind === 'styles') {
      return document._queue.push(Promise.resolve(), () => { try { return execute(); } finally { resumeAfterScript(record, this); } }, null, false, this);
    }
    return execute();
  };
  ScriptImpl.prototype._childTextContentChangeSteps = function () {
    textChanged.call(this);
    const record = documents.get(this._ownerDocument);
    if (active(record) && this._attached && !this._parserInserted && !this._alreadyStarted) this._eval();
  };
  ScriptImpl.prototype._attrModified = function (name, value, previous) {
    const record = documents.get(this._ownerDocument);
    if (!record || name !== 'src' || !this._attached) return modify.call(this, name, value, previous);
    // Native jsdom's src hook bypasses preparation and never sets alreadyStarted.
    // Preserve attribute bookkeeping, then use the regular preparation path once.
    const started = this._startedEval, hadStarted = Object.hasOwn(this, '_startedEval');
    this._startedEval = true;
    try { modify.call(this, name, value, previous); }
    finally { if (hadStarted) this._startedEval = started; else delete this._startedEval; }
    if (active(record) && !this._alreadyStarted && value !== null && value.trim() !== '') this._eval();
  };
  ScriptImpl.prototype._dispatch = function (...args) {
    const record = documents.get(this._ownerDocument);
    if (record && !active(record)) return true;
    const result = dispatch.apply(this, args);
    if (record && args[0].isTrusted && ['load', 'error'].includes(args[0].type)) resumeAfterScript(record, this);
    return result;
  };
  ResourceLoader.prototype.fetch = function (url, options) {
    const record = documents.get(this._document), element = options.element;
    if (!record) return fetchResource.call(this, url, options);
    if (element.localName === 'link' && (element.getAttributeNS(null, 'rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) {
      const request = fetchResource.call(this, url, options);
      if (request?.then) record.styles.add(element);
      return request;
    }
    if (element.localName !== 'script') return fetchResource.call(this, url, options);
    if (!active(record)) return null;
    // jsdom classifies its queues using the async attribute only. Supply the
    // actual force-async state during this synchronous classification, without
    // modifying reflected attributes or hiding them from executing page code.
    const hasAttribute = element.hasAttributeNS;
    const own = Object.getOwnPropertyDescriptor(element, 'hasAttributeNS');
    const forceAsync = asyncValue(element), dynamic = !element._parserInserted;
    element.hasAttributeNS = function (namespace, name) {
      if (namespace === null && name === 'async') return forceAsync;
      if (namespace === null && name === 'defer' && dynamic) return false;
      return hasAttribute.call(this, namespace, name);
    };
    let request;
    const originalLoader = this._resourceLoader;
    const adopted = adoptPreload(record, url, element);
    if (adopted) {
      const overlay = Object.create(originalLoader);
      overlay.fetch = () => adopted; this._resourceLoader = overlay;
    }
    try {
      request = fetchResource.call(this, url, { ...options, onLoad(data) {
        // A disposed realm must not execute an already queued script callback.
        if (!active(record)) return new Promise(() => {});
        return options.onLoad?.(data);
      } });
    } finally {
      this._resourceLoader = originalLoader;
      if (own) Object.defineProperty(element, 'hasAttributeNS', own);
      else delete element.hasAttributeNS;
    }
    if (request?.then) {
      record.requests.add(request);
      request.then(() => record.requests.delete(request), () => record.requests.delete(request));
    }
    return request;
  };
}

// Install after installModuleScripts in beforeParse. All implementation hooks
// are scoped to this document and compose the prior handlers. Native jsdom
// cloning steps already preserve alreadyStarted; they remain untouched.
// Limits include complete stylesheet blocking rules, document.open resets,
// speculative/module preload scanning and complete microtask checkpoint parity.
// This adapter does not add CSP/SRI/CORS validation or fix MutationObserver order.
export function installClassicScripts(page, window) {
  patch();
  const document = implForWrapper(window.document), previous = documents.get(document);
  if (previous && !previous.disposed) return previous.controller;
  const record = { page, window, document, signal: page.documentAbort?.signal, requests: new Set(), disposed: false,
    preloads: new Map(), preloadAbort: new AbortController(), styles: new Set() };
  const prototype = window.HTMLScriptElement.prototype;
  const script = value => {
    const implementation = implForWrapper(value);
    if (!(implementation instanceof ScriptImpl)) throw new window.TypeError('Illegal invocation');
    return implementation;
  };
  Object.defineProperty(prototype, 'async', { configurable: true, enumerable: true,
    get() { return asyncValue(script(this)); },
    set(value) {
      const implementation = script(this); state(implementation).forceAsync = false;
      if (Boolean(value)) implementation.setAttributeNS(null, 'async', '');
      else implementation.removeAttributeNS(null, 'async');
    },
  });
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true;
    if (record.parser && !record.parserDone) { record.parser.tokenizer.pause(); record.parser.stopped = true; }
    record.blocker = null; record.closeRequested = null;
    record.preloadAbort.abort(); record.preloads.clear();
    record.styles.clear();
    for (const request of record.requests) request.abort?.();
    record.requests.clear(); record.signal?.removeEventListener('abort', dispose);
    if (window.close === record.close) window.close = record.originalClose;
  };
  record.originalClose = window.close;
  record.close = function (...args) { dispose(); return record.originalClose.apply(window, args); };
  window.close = record.close;
  record.controller = { dispose };
  documents.set(document, record); record.signal?.addEventListener('abort', dispose, { once: true });
  if (record.signal?.aborted || page.closed) dispose();
  return record.controller;
}
