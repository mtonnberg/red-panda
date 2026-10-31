import {canNavigateJavaScript} from './blob-urls.js';
import {reportWindowException} from './errors.js';
import vm from 'node:vm';
import {beforeNavigation,linkedNavigation,stopNavigation} from './navigation-lifecycle.js';
import { createRequire } from 'node:module';
import {onFrameRetirement} from './frame-activity.js';

// The pinned jsdom Location properties are deliberately nonconfigurable. Hook
// its host implementations rather than exposing a Page object to page scripts.
const require = createRequire(import.meta.url);
const LocationImpl = require('jsdom/lib/jsdom/living/window/Location-impl.js').implementation;
const AnchorImpl = require('jsdom/lib/jsdom/living/nodes/HTMLAnchorElement-impl.js').implementation;
const { implForWrapper,wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/living/window/Location-impl.js'));
const whatwgURL = jsdomRequire('whatwg-url');
const {percentDecodeString}=jsdomRequire('whatwg-url/lib/percent-encoding.js');
const DOCUMENTS = new WeakMap();
let patched = false;

function supported(record, url) {
  const parsed = new URL(url);
  if (['http:', 'https:', 'data:'].includes(parsed.protocol)) return;
  if (parsed.protocol === 'about:' && parsed.pathname === 'blank' && !parsed.search) return;
  throw new record.DOMException(`Unsupported navigation protocol: ${parsed.protocol}`, 'NotSupportedError');
}

function fragmentNavigation(current, destination) {
  if (destination.fragment === null) return false;
  return whatwgURL.serializeURL(current, true) === whatwgURL.serializeURL(destination, true);
}

function active(record) {
  return !record.disposed && !record.page.closed && !record.signal?.aborted && record.window.document === record.document;
}

function ownsCurrentDocument(record) {
  const current = record.page.dom?.window?.document;
  return !current || current === record.document;
}

function clearTimer(record, timer) {
  record.clearTimeout(timer);
  record.timers.delete(timer);
}

function scheduleJavascript(record,url){
 const source=Buffer.from(percentDecodeString(url.slice('javascript:'.length))).toString('utf8');
 let timer;timer=record.setTimeout(()=>{record.timers.delete(timer);record.javascriptTasks.delete(timer);if(!active(record)||!ownsCurrentDocument(record))return;try{vm.runInContext(source,record.page.dom.getInternalVMContext(),{timeout:Math.min(record.page.timeout??10000,2000),displayErrors:false,filename:'javascript:'})}catch(error){if(!reportWindowException(record.window,error))record.page.emit?.('pageError',error)}},0);record.timers.add(timer);record.javascriptTasks.add(timer);
}
function schedule(record, url, options) {
  if(new URL(url).protocol==='javascript:'){if(active(record))scheduleJavascript(record,url);return}
  supported(record, url);
  if (!active(record)) throw new record.DOMException('The document is no longer active', 'InvalidStateError');
  const operation=options.navigationOperation??beforeNavigation(record.page,{kind:options.historyMode==='traverse'?'traverse':options.historyMode==='reload'?'reload':options.historyMode==='replace'?'replace':'push',url,sameDocument:false,entry:options.historyEntry,stateJSON:options.navigationStateJSON,sourceElement:options.sourceElement,formData:options.formData});if(operation===false)return;
  if(operation!==undefined)options={...options,navigationOperation:operation};
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  // A page's location setter returns void. Observe the owned promise even if no
  // caller follows it; parent navigation can still await the original promise.
  promise.catch(() => {});
  const pending = {
    promise, url, options, historyMode: options.historyMode,
    window: record.window, sourceDocument: record.document,
    started: false, settled: false, supersededBy: null, error: null,
    cancel(reason = 'Queued navigation canceled') {
      if (pending.started || pending.settled) return false;
      pending.settled = true;
      clearTimer(record, pending.timer);
      record.pending.delete(pending);
      if (record.page.pendingNavigation === pending) record.page.pendingNavigation = null;
      const error = new record.DOMException(reason, 'AbortError');
      pending.error = error;
      reject(error);
      return true;
    },
  };
  const previous = record.page.pendingNavigation;
  record.page.pendingNavigation = pending;
  // Consecutive assignments in one task use the last destination. An outer
  // caller already following the earlier promise must follow that destination.
  if (previous && !previous.started && !previous.settled && previous.sourceDocument === record.document) {
    previous.supersededBy = pending;
    previous.supersede?.(pending);
  }
  pending.supersede = next => {
    if (pending.started || pending.settled) return;
    pending.settled = true;
    clearTimer(record, pending.timer);
    record.pending.delete(pending);
    resolve(next.promise);
  };
  record.pending.add(pending);
  pending.timer = record.setTimeout(() => {
    record.timers.delete(pending.timer);
    if (pending.settled) return;
    if (!active(record) || !ownsCurrentDocument(record)) { pending.cancel('Source document was disposed'); return; }
    pending.started = true;
    // Child Page.navigate must not see itself as a pending redirect and await
    // its own completion. The parent retains the published pending object.
    if (record.page.pendingNavigation === pending) record.page.pendingNavigation = null;
    let child;
    try { child = record.page.navigate(url, options); } catch (error) { child = Promise.reject(error); }
    Promise.resolve(child).then(
      result => { pending.settled = true; record.pending.delete(pending); resolve(result); },
      error => { pending.settled = true; pending.error = error; record.pending.delete(pending); reject(error); },
    );
  }, 0);
  record.timers.add(pending.timer);
  linkedNavigation(operation,pending);record.page.emit?.('navigationRequested', pending);
  return pending;
}

function targetIsSelf(record, target) {
  const name = target.toLowerCase();
  if (!name || name === '_self') return true;
  if (name === '_parent' || name === '_top') {
    try {
      const targetWindow = name === '_parent' ? record.window.parent : record.window.top;
      return targetWindow.document === record.document;
    } catch { return false; }
  }
  return false;
}

function patchHostImplementations() {
  if (patched) return;
  patched = true;
  const locationNavigate = LocationImpl.prototype._locationObjectNavigate;
  const locationReload = LocationImpl.prototype.reload;
  const anchorFollow = AnchorImpl.prototype._followAHyperlink;
  const anchorActivate = AnchorImpl.prototype._activationBehavior;

  LocationImpl.prototype._locationObjectNavigate = function (destination, flags = {}) {
    const record = DOCUMENTS.get(this._relevantDocument);
    if (!record || !active(record)) return locationNavigate.call(this, destination, flags);
    const url = whatwgURL.serializeURL(destination);
    if(destination.scheme==='javascript'){scheduleJavascript(record,url);return}
    supported(record, url);
    if (fragmentNavigation(this._url, destination)) {
      if(url===record.window.location.href)return;
      const historyMode=flags.replacement||record.document.readyState==='loading'?'replace':'push';
      const operation=beforeNavigation(record.page,{kind:historyMode,url,sameDocument:true,hashChange:true});if(operation===false)return;
      const result = locationNavigate.call(this, destination, flags);
      record.page.reconcileURL?.(record.window, { historyMode,navigationOperation:operation });
      return result;
    }
    schedule(record, url, { historyMode: flags.replacement||record.document.readyState==='loading' ? 'replace' : 'push', referrer: record.window.location.href });
  };

  LocationImpl.prototype.reload = function () {
    const record = DOCUMENTS.get(this._relevantDocument);
    if (!record || !active(record)) return locationReload.call(this);
    schedule(record, whatwgURL.serializeURL(this._url), { historyMode: 'reload', method:'GET', referrer: record.window.location.href });
  };

  AnchorImpl.prototype._followAHyperlink = function () {
    const record = DOCUMENTS.get(this._ownerDocument);
    if (!record || !active(record)) return anchorFollow.call(this);
    if (this._cannotNavigate() || !this.hasAttributeNS(null, 'href')) return;
    const destination = this._ownerDocument.encodingParseAURL(this.href);
    if (this.hasAttributeNS(null, 'download') && destination?.scheme!=='javascript') throw new record.DOMException('Anchor downloads are not implemented', 'NotSupportedError');
    const target = this._getAnElementsTarget();
    if (!targetIsSelf(record, target)) throw new record.DOMException(`Navigation target ${target} is not implemented`, 'NotSupportedError');
    if (!destination) return;
    const url = whatwgURL.serializeURL(destination);
    if(destination.scheme==='javascript'){scheduleJavascript(record,url);return}
    supported(record, url);
    if (fragmentNavigation(this._ownerDocument._URL, destination)) {
      const timer = record.setTimeout(() => {
        record.timers.delete(timer);
        if (!active(record) || !ownsCurrentDocument(record)) return;
        const location = implForWrapper(record.window.location);
        locationNavigate.call(location, destination, {});
        record.page.reconcileURL?.(record.window, { historyMode: 'push' });
      }, 0);
      record.timers.add(timer);
      return;
    }
    schedule(record, url, { historyMode:'push',sourceElement:wrapperForImpl(this), referrer: this.relList.contains('noreferrer') ? '' : record.window.location.href });
  };

  AnchorImpl.prototype._activationBehavior = function (event) {
    const record = DOCUMENTS.get(this._ownerDocument);
    if (!record || !active(record)) return anchorActivate.call(this, event);
    try {
      if (event && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
        throw new record.DOMException('Modified anchor navigation requires another browsing context', 'NotSupportedError');
      }
      return anchorActivate.call(this, event);
    } catch (error) {
      // HTMLElement.click keeps this guard around default activation. A host
      // unsupported-navigation error must not permanently disable later clicks.
      this._clickInProgress = false;
      throw error;
    }
  };
}

export function installNavigation(page, window) {
  if (!page || typeof page.navigate !== 'function' || !window?.document) throw new TypeError('Navigation requires a Page and document window');
  patchHostImplementations();
  const document = window.document;
  const documentImpl = implForWrapper(document);
  const existing = DOCUMENTS.get(documentImpl);
  if (existing?.page === page && !existing.disposed) return existing.controller;
  existing?.controller.dispose();
  const record = {
    page, window, document, documentImpl, signal: page.documentAbort?.signal,
    DOMException: window.DOMException, setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window), timers: new Set(), javascriptTasks: new Set(), pending: new Set(), disposed: false,
    originalClose: window.close,originalStop:window.stop,
  };
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true;
    for (const pending of record.pending) if (!pending.started) pending.cancel('Source document was disposed');
    for (const timer of record.timers) record.clearTimeout(timer);
    record.timers.clear();record.javascriptTasks.clear();
    DOCUMENTS.delete(documentImpl);
    if (window.close === record.close) window.close = record.originalClose;
    record.signal?.removeEventListener('abort', dispose);
    record.retirementUnsubscribe?.();if(window.stop===record.stop)window.stop=record.originalStop;
    page.off?.('close', dispose);
  };
  record.controller = { dispose };
  if (record.signal?.aborted || page.closed) { record.disposed = true; return record.controller; }
  DOCUMENTS.set(documentImpl, record);
  const stop=function(){record.page.pendingNavigation?.cancel?.('Navigation was aborted');record.page.navigationAbort?.abort();stopNavigation(record.page);return record.originalStop.call(window)};record.stop=stop;window.stop=stop;
  record.retirementUnsubscribe=onFrameRetirement(window,()=>{for(const pending of record.pending)if(!pending.started)pending.cancel('Target browsing context was retired');for(const timer of record.javascriptTasks)clearTimer(record,timer);record.javascriptTasks.clear();});
  record.close = function () { dispose(); return record.originalClose.call(window); };
  window.close = record.close;
  record.signal?.addEventListener('abort', dispose, { once: true });
  page.once?.('close', dispose);
  return record.controller;
}

// Other host defaults (such as form submission) share the same document-owned
// queue and redirect-chain bookkeeping as Location and hyperlink navigation.
export function requestNavigation(page, window, url, options = {}) {
  const record = DOCUMENTS.get(implForWrapper(window?.document));
  if (!record || record.page !== page || !active(record)) {
    throw new window.DOMException('The source document is not registered for navigation', 'InvalidStateError');
  }
  return schedule(record, new URL(url, window.location.href).href, {
    historyMode: 'push', referrer: window.location.href, ...options,
  });
}

// Selection uses private browsing-context ownership. Once accepted, the target
// document owns its queued navigation, so retiring the source frame cannot
// cancel an active ancestor's submission. Closing the target cancels normally.
export function requestTargetNavigation(page, window, targetPage, url, options = {}) {
 const source=DOCUMENTS.get(implForWrapper(window?.document));
 if(!source||source.page!==page||!active(source))throw new window.DOMException('The source document is not registered for navigation','InvalidStateError');
 if(!targetPage||targetPage.closed||targetPage.retired)return;
 if(targetPage!==page&&(targetPage.browser!==page.browser||targetPage.context!==page.context))throw new window.DOMException('The target browsing context is not owned by this context','SecurityError');
 const targetWindow=targetPage.dom?.window??window,target=DOCUMENTS.get(implForWrapper(targetWindow.document));
 if(!target||target.page!==targetPage||!active(target))return;
 const destination=new URL(url,window.location.href);
 if(destination.protocol==='javascript:'&&target!==source&&!canNavigateJavaScript(source.window,target.window))return;
 return schedule(target,destination.href,{historyMode:'push',referrer:window.location.href,...options});
}
