import{startNetworkCapture,inlinePostData,beginNetworkResponse,appendNetworkResponse,finishNetworkResponse}from'./network-capture.js';
import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import{randomUUID}from'node:crypto';
import{resolveBlobURL}from'./blob-urls.js';
import{stylesheetParserBytes}from'./stylesheet-decoder.js';
import { parseDocumentWriteFragment } from './shadow.js';
import { installCurrentScriptCheckpoint, withClassicEvaluation } from './clear-hook.js';
import { prepareInputParserAdapter } from './input-controls.js';
import { prepareCustomElementParserAdapter } from './custom-elements.js';
import {onFrameRetirement} from './frame-retirement-hooks.js';
import { installDocumentReset } from './document-reset.js';
import {runInitialNetworkParserClose} from './initial-network-load.js';
import { createParserStream } from './parser-stream.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ScriptImpl = require('jsdom/lib/jsdom/living/nodes/HTMLScriptElement-impl.js').implementation;
const LinkImpl = require('jsdom/lib/jsdom/living/nodes/HTMLLinkElement-impl.js').implementation;
const ResourceLoader = require('jsdom/lib/jsdom/browser/resources/per-document-resource-loader.js');
const DocumentImpl = require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'));
const parse5 = jsdomRequire('parse5');
const documents = new WeakMap(), flags = new WeakMap();
const hintKeys = new WeakMap();
const stylesheetRequests=new WeakMap(),stylesheetDeliveries=new WeakMap(),loaderFrames=new WeakMap();
const hostCheckpoint=queueMicrotask;
let patched = false;
const scriptTypes = new Set(['application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript',
  'text/livescript', 'text/x-ecmascript', 'text/x-javascript', 'module', 'importmap']);

function active(record) { return record && !record.disposed && !record.signal?.aborted && !record.page.closed && implForWrapper(record.window.document) === record.document; }
// Track only scripts actually being evaluated on behalf of the active parser.
// A dynamic nested inline script inherits that nesting; an unrelated async
// script executing while the parser is waiting does not acquire it.
function duringParserScript(record, script, evaluate) {
  const parserScript = record.parser && !record.parserDone &&
    (record.parserScriptDepth > 0 || (script._parserInserted &&
      (record.parser.tokenizer.inLoop || record.blocker?.script === script)));
  if (parserScript) record.parserScriptDepth = (record.parserScriptDepth ?? 0) + 1;
  const writeParser = parserScript && record.stream?.kind === 'write' ? record.stream : null;
  const entered = writeParser?.enterScript();
  try { return withClassicEvaluation(record, script, evaluate); }
  finally {
    if (entered) writeParser.leaveScript();
    if (parserScript) record.parserScriptDepth--;
  }
}
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
  if (!active(record) || record.parser !== parser || parser.tokenizer.paused || !parser.stopped) return;
  record.parserDone = true; record.blocker = null;
  if (record.closeRequested) {
    const arguments_ = record.closeRequested;
    runInitialNetworkParserClose(record, parser, arguments_, () => {
      record.closeRequested = null;
      return record.document.close(...arguments_);
    });
  }
}
function hostTask(run) {
  return new Promise((resolve, reject) => setImmediate(() => {
    try { resolve(run()); } catch (error) { reject(error); }
  }));
}

function resumeAfterScript(record, script) {
  const blocker = record.blocker;
  if (!blocker || blocker.script !== script || blocker.scheduled) return;
  blocker.scheduled = true;
  setImmediate(() => {
    if (!active(record) || record.blocker !== blocker) return;
    record.blocker = null;
    if (record.stream) record.stream.resume();
    else if (blocker.parser.tokenizer.paused) blocker.parser.tokenizer.resume(() => finishParser(record, blocker.parser));
  });
}

function makeParser(record, options) {
  prepareInputParserAdapter(options?.treeAdapter);
  prepareCustomElementParserAdapter(options?.treeAdapter);
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
  return parser;
}

// Queue ownership remains with the real loader. Drop only delivery into an
// inactive Document; completed bytes/error cleanup still drain the retired
// queue without dispatching late events or invoking its DOM callbacks.
function loaderOverlay(loader,overlays,invoke){
 let state=loaderFrames.get(loader);if(!state){state={frames:[],queued:false};loaderFrames.set(loader,state);}
 const frame={previous:Object.fromEntries(Object.keys(overlays).map(name=>[name,loader[name]])),overlays};state.frames.push(frame);
 if(!state.queued){state.queued=true;hostCheckpoint(()=>{state.queued=false;for(const pending of [...state.frames].reverse())for(const[name,value]of Object.entries(pending.overlays))if(loader[name]===value)loader[name]=pending.previous[name];state.frames.length=0;});}
 for(const[name,value]of Object.entries(overlays))loader[name]=value;
 try{return invoke()}finally{for(const[name,value]of Object.entries(overlays))if(loader[name]===value)loader[name]=frame.previous[name];const index=state.frames.indexOf(frame);if(index>=0)state.frames.splice(index,1);}
}
function fetchOwnedResource(record, loader, fetch, url, options, delivery) {
// Callback custody belongs to the actual fetch-registration generation.
 // Retirement invalidates pending delivery, without disabling retained APIs.
 const registrationGeneration=record.resourceDeliveryGeneration;
 const overlays={};
 for(const name of ['_queue','_deferQueue','_asyncQueue']){
  const queue=loader[name];overlays[name]=Object.create(queue,{push:{value(request,loaded,failed,...args){
   const guard=callback=>typeof callback==='function'?(...values)=>{
    if(active(record)&&record.resourceDeliveryGeneration===registrationGeneration&&(!delivery||delivery.current())){
     if(!delivery)return callback(...values);
     stylesheetDeliveries.set(delivery.element,delivery);let result;
     try{result=callback(...values)}catch(error){if(stylesheetDeliveries.get(delivery.element)===delivery)stylesheetDeliveries.delete(delivery.element);throw error;}
     return Promise.resolve(result).finally(()=>{if(stylesheetDeliveries.get(delivery.element)===delivery)stylesheetDeliveries.delete(delivery.element);});
    }
    loader._requestManager.remove(request);return Promise.resolve();
   }:callback;
   return queue.push(request,guard(loaded),guard(failed),...args);
  }}});
 }
 return loaderOverlay(loader,overlays,()=>fetch.call(loader,url,options));
}
function synchronousStylesheet(record,loader,fetch,url,options,delivery){
 const page=record.page,owner=page.registry?.page??page,op={complete:false,request:null,local:null};
 const cancel=()=>{delivery.canceled=true;if(stylesheetRequests.get(delivery.element)===delivery){stylesheetRequests.delete(delivery.element);record.styles.delete(delivery.element);}if(op.request)loader._requestManager.remove(op.request);if(op.local){owner.activeRequests.delete(op.local);op.local=null;}};
 // A V8 interruption can abandon the Host stack before any finally executes.
 hostCheckpoint(()=>{if(!op.complete)cancel();});
 let response,error;
 try{
  const protocol=new URL(url).protocol;
  if(protocol==='blob:'||protocol==='data:'){
   let snapshot;if(protocol==='blob:')snapshot=resolveBlobURL(page,url);else{const parsed=require('data-urls')(url);if(!parsed)throw Error('Invalid data URL');snapshot={bytes:parsed.body,mimeType:parsed.mimeType.toString(),url};}
   const id=randomUUID(),capture=startNetworkCapture(owner.context,id);op.local=id;owner.activeRequests.add(id);owner.lastActivity=Date.now();owner.emit('request',{id,url,type:'Stylesheet',method:'GET',headers:{},postDataFields:inlinePostData(capture),timestamp:performance.now()/1000,frameId:page.frameId,loaderId:page.loaderId});
   if(!delivery.current())throw Error('Synchronous stylesheet canceled');
   if(snapshot.bytes.byteLength>4*1024*1024)throw Error('Stylesheet exceeds 4 MiB limit');
   response={status:200,statusText:'OK',headers:new Headers(snapshot.mimeType?{'content-type':snapshot.mimeType}:{}),bytes:Buffer.from(snapshot.bytes),url:snapshot.url};beginNetworkResponse(capture,response.headers);appendNetworkResponse(capture,response.bytes);finishNetworkResponse(capture);
   owner.activeRequests.delete(id);owner.requestFinished(id,url,200,response.bytes.length,Object.fromEntries(response.headers),'Stylesheet',page.frameId,page.loaderId);op.local=null;
  }else{
   const headers=new Headers(),referrer=page.referrerFor?.(url,record.window.document.URL);if(referrer)headers.set('referer',referrer);
   response=owner.browser.syncHTTP.fetch(owner,url,{headers,signal:record.signal,frameId:page.frameId,loaderId:page.loaderId,resourceType:'Stylesheet',maxBodyBytes:4*1024*1024});
  }
  if(!delivery.current())throw Error('Synchronous stylesheet canceled');
  if(response.status<200||response.status>299)throw Error('Resource was not loaded. Status: '+response.status);
  const metadata={headers:Object.fromEntries(response.headers)};options.onLoad?.(stylesheetParserBytes(response.bytes,metadata,delivery.element));
 }catch(cause){error=cause;if(op.local){const id=op.local;op.local=null;owner.activeRequests.delete(id);owner.requestFailed(id,cause);}}
 const request=error?Promise.reject(error):Promise.resolve(response.bytes);request.catch(()=>{});op.request=request;
 const headers=response?Object.fromEntries(response.headers):{};delete headers['set-cookie'];request.response={statusCode:response?.status??0,headers};request.href=response?.url??url;request.abort=cancel;request.getHeader=()=>undefined;
 if(!delivery.current()){cancel();op.complete=true;return request;}
 const overlay=Object.create(loader._resourceLoader);overlay.fetch=()=>request;
 record.styles.delete(delivery.element);
 const queued=loaderOverlay(loader,{_resourceLoader:overlay},()=>fetchOwnedResource(record,loader,fetch,url,{...options,onLoad(){},onError:options.onError},delivery));
 op.complete=true;return queued;
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
  const openDocument = DocumentImpl.prototype.open, writeDocument = DocumentImpl.prototype.write;
  const attachLink = LinkImpl.prototype._attach, modifyLink = LinkImpl.prototype._attrModified, dispatchLink = LinkImpl.prototype._dispatch, detachLink=LinkImpl.prototype._detach;
  LinkImpl.prototype._dispatch = function (...args) {
    const record=documents.get(this._ownerDocument),delivery=stylesheetDeliveries.get(this);
    if(record&&args[0].isTrusted&&['load','error'].includes(args[0].type)&&(!active(record)||!this._attached||delivery&&!delivery.current()))return true;
    const result = dispatchLink.apply(this, args);
    if (record && args[0].isTrusted && ['load', 'error'].includes(args[0].type)) record.styles.delete(this);
    return result;
  };
  LinkImpl.prototype._detach=function(){stylesheetRequests.delete(this);const record=documents.get(this._ownerDocument);record?.styles.delete(this);return detachLink.call(this);};
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
    if (!active(record)) return parse.call(this, markup, options);
    record.parserOptions = options;
    const parser = makeParser(record, options);
    record.parser = parser; record.parserDone = false;
    record.stream = createParserStream(parser, markup, {
      signal: record.signal, active: () => active(record) && record.parser === parser,
      onComplete: () => finishParser(record, parser),
      onError: error => record.page.emit?.('pageError', error),
    });
    record.stream.start();
    return parser.document;
  };
  DocumentImpl.prototype.open = function (...args) {
    const record = documents.get(this);
    // The HTML open algorithm returns the current document while a parser
    // script is on the stack. Do not apply this new no-op branch to XML or
    // custom-element dynamic-markup scopes; their existing behavior is retained.
    if (active(record) && record.parserScriptDepth > 0 &&
        this._parsingMode !== 'xml' && !this._throwOnDynamicMarkupInsertionCounter) return this;
    return openDocument.apply(this, args);
  };
  DocumentImpl.prototype.write = function (...args) {
    const record = documents.get(this), anchor = this._writeAfterElement;
    if (active(record) && anchor && this._parsingMode === 'html' && !this._throwOnDynamicMarkupInsertionCounter) {
      const fragment = parseDocumentWriteFragment(this, args.join(''));
      // Fragment scripts can remove the writing script while parsing. Preserve
      // their actual effects and stop the splice if its live anchor vanished.
      if (!active(record)) return;
      const parent = anchor.parentNode;
      if (!parent) return;
      let cursor = anchor;
      while (fragment.firstChild) {
        const node = fragment.firstChild;
        parent.insertBefore(node, cursor.parentNode === parent ? cursor.nextSibling : null);
        cursor = node;
      }
      this._writeAfterElement = cursor;
      return;
    }
    const parent = anchor?.parentNode, boundary = anchor?.nextSibling;
    const result = writeDocument.apply(this, args);
    // Follow the actual insertion boundary, including nodes produced by a
    // nested written script. The next write must follow the preceding write.
    // If page code detached the old boundary/anchor, leave its mutation intact.
    if (active(record) && parent && anchor.parentNode === parent &&
        (!boundary || boundary.parentNode === parent)) {
      const cursor = boundary ? boundary.previousSibling : parent.lastChild;
      if (cursor?.parentNode === parent) this._writeAfterElement = cursor;
    }
    return result;
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
        return duringParserScript(record, this, () => this._innerEval(this.text, document.URL));
      } finally {
        document._currentScript = current;
        if (hadWriteAfter) document._writeAfterElement = writeAfter;
        else delete document._writeAfterElement;
      }
    };
    if (record.blocker?.script === this && record.blocker.kind === 'styles') {
      return document._queue.push(Promise.resolve(), () => hostTask(() => { if (!active(record)) return; try { return execute(); } finally { resumeAfterScript(record, this); } }), null, false, this);
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
      if(!active(record))return null;
      const delivery={element,canceled:false,current:()=>!delivery.canceled&&active(record)&&element._attached&&stylesheetRequests.get(element)===delivery};
      stylesheetRequests.set(element,delivery);
      if(record.page.browser?.syncHTTP)return synchronousStylesheet(record,this,fetchResource,url,options,delivery);
      const request = fetchOwnedResource(record, this, fetchResource, url, {...options,onLoad(data){return options.onLoad?.(stylesheetParserBytes(data,request.response,element));}},delivery);
      if (request?.then) record.styles.add(element);
      return request;
    }
    if (element.localName !== 'script') return fetchOwnedResource(record, this, fetchResource, url, options);
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
      request = fetchOwnedResource(record, this, fetchResource, url, { ...options, onLoad(data) {
        return hostTask(() => {
          if (!active(record)) return;
          return duringParserScript(record, element, () => options.onLoad?.(data));
        });
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
    preloads: new Map(), preloadAbort: new AbortController(), styles: new Set(), resourceDeliveryGeneration: Object.create(null) };
  const stopRetirement=onFrameRetirement(window,()=>{record.resourceDeliveryGeneration=Object.create(null)});
  record.currentScriptCheckpoint = installCurrentScriptCheckpoint(record, () => active(record));
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
    record.disposed = true; stopRetirement(); record.currentScriptCheckpoint.dispose(); record.resetController?.dispose(); record.stream?.abort();
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
  record.resetController = installDocumentReset(page, window, record, makeParser, finishParser);
  if (record.signal?.aborted || page.closed) dispose();
  return record.controller;
}
