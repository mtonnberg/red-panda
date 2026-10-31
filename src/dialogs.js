import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
// Independent dialog and popover state, events, and default actions.
import { createRequire } from 'node:module';
// Bootstrap jsdom's interface registry before accessing pinned internal IDL.
import 'jsdom';

const require = createRequire(import.meta.url);
const Dialog = require('jsdom/lib/jsdom/living/generated/HTMLDialogElement.js');
const HTMLElement = require('jsdom/lib/jsdom/living/generated/HTMLElement.js');
const HTMLElementImpl = require('jsdom/lib/jsdom/living/nodes/HTMLElement-impl.js').implementation;
const {wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const documents = new WeakMap(), states = new WeakMap(), installed = new WeakMap();
let patched = false;

const live = record => record && !record.disposed && !record.signal?.aborted && !record.page.closed && record.window.document === record.document;
const recordFor = element => documents.get(implForWrapper(element?.ownerDocument));
function stateFor(element) {
  let state = states.get(element);
  if (!state) {
    state = { element, modal: false, popover: false, transitioning: false, returnValue: '' };
    states.set(element, state);
  }
  return state;
}
function string(value, window) {
  if (typeof value === 'symbol') throw new window.TypeError('Cannot convert a Symbol to a DOMString');
  return String(value);
}
function kind(value) {
  if (value === null) return null;
  value = value.toLowerCase();
  return !value || value === 'auto' ? 'auto' : value === 'hint' ? 'hint' : 'manual';
}
function trusted(element, event) {
  const impl = implForWrapper(event); impl.isTrusted = true;
  return implForWrapper(element)._dispatch(impl);
}
function invalid(window) { return new window.DOMException('The object is in an invalid state', 'InvalidStateError'); }
function modalOff(element) {
  const state = states.get(element); if (!state?.modal) return;
  state.modal = false;
  const record = recordFor(element);
  if (record) {
    record.revision++;
    record.modals = record.modals.filter(candidate => candidate !== element);
    if (!state.popover) record.topLayer = record.topLayer.filter(candidate => candidate !== element);
  }
}

/** Private selector/layout providers. Neither reflects a synthetic attribute. */
export function isModal(element) {
  return !!(states.get(element)?.modal && element.isConnected && element.open && live(recordFor(element)));
}
export function isPopoverOpen(element) {
  return !!(states.get(element)?.popover && element.isConnected && element.hasAttribute('popover') && live(recordFor(element)));
}
/** Monotonic host-only state token for CSS/layout caches, including closed
 * shadow trees. Ordinary attribute/tree mutations have their own DOM token. */
export function getDialogStateRevision(window) {
  return documents.get(implForWrapper(window?.document))?.revision ?? 0;
}

function toggleEvent(record, element, oldState, newState, before) {
  return trusted(element, new record.window.ToggleEvent(before ? 'beforetoggle' : 'toggle', {
    oldState, newState, cancelable: before && newState === 'open',
  }));
}
function hide(element, record, { silent = false } = {}) {
  const state = states.get(element);
  if (!state?.popover) return;
  // Invalidation must clear state even if a beforetoggle handler changes the
  // attribute or removes its element during an in-progress transition.
  if (state.transitioning) {
    state.popover = false; record.popovers.delete(element);
    record.revision++;
    if (!state.modal) record.topLayer = record.topLayer.filter(candidate => candidate !== element);
    return;
  }
  state.transitioning = true;
  try {
    if (!silent) toggleEvent(record, element, 'open', 'closed', true);
    state.popover = false; record.popovers.delete(element);
    record.revision++;
    if (!state.modal) record.topLayer = record.topLayer.filter(candidate => candidate !== element);
    if (!silent) toggleEvent(record, element, 'open', 'closed', false);
  } finally { state.transitioning = false; }
}
function showPopover(element, record) {
  const state = stateFor(element);
  if (state.popover || state.transitioning) return;
  if (!element.isConnected || !live(record)) throw invalid(record.window);
  state.transitioning = true;
  try {
    if (!toggleEvent(record, element, 'closed', 'open', true)) return;
    if (!element.isConnected || !live(record) || element.getAttribute('popover') === null) return;
    const mode = kind(element.getAttribute('popover'));
    if (mode !== 'manual') {
      // Retain the open ancestors of a nested auto/hint popover, but close a
      // sibling chain of that mode in reverse top-layer order.
      for (const other of [...record.popovers].reverse()) {
        if (kind(other.getAttribute('popover')) === mode && !other.contains(element)) hide(other, record);
      }
    }
    if (!element.isConnected || !live(record) || element.getAttribute('popover') === null) return;
    state.popover = true; record.popovers.add(element);
    record.revision++;
    record.topLayer = record.topLayer.filter(candidate => candidate !== element); record.topLayer.push(element);
    toggleEvent(record, element, 'closed', 'open', false);
  } finally { state.transitioning = false; }
}
function closeDialog(element, record, value) {
  const state = stateFor(element);
  if (!element.open) return;
  if (value !== null && value !== undefined) state.returnValue = value;
  element.removeAttribute('open'); modalOff(element);
  if (!live(record)) return;
  const timer = record.window.setTimeout(() => {
    record.timers.delete(timer);
    if (live(record)) trusted(element, new record.window.Event('close'));
  }, 0);
  record.timers.add(timer);
}

/** Called by the privileged input default action after uncancelled keydown.
 * The native oracle exposes cancel.isTrusted=false here; close remains trusted.
 * Page-created KeyboardEvents do not call this helper or close a dialog.
 */
export function requestDialogClose(window) {
  const record = documents.get(implForWrapper(window.document));
  if (!live(record)) return false;
  record.modals = record.modals.filter(isModal);
  const element = record.modals.at(-1);
  if (!element) return false;
  const event = new window.Event('cancel', { cancelable: true });
  if (implForWrapper(element)._dispatch(implForWrapper(event))) closeDialog(element, record);
  return true;
}

/** Called by forms.js after its validation/submit/formdata pipeline, before
 * navigation. True consumes method=dialog even without an ancestor dialog.
 */
export function submitDialogForm(form, submitter) {
  const override = submitter?.getAttribute('formmethod');
  const method = (override ?? form.getAttribute('method') ?? '').toLowerCase();
  if (method !== 'dialog') return false;
  const record = recordFor(form);
  if (!live(record)) return true;
  for (let element = form.parentElement; element; element = element.parentElement) {
    if (Dialog.is(element)) { closeDialog(element, record, submitter?.getAttribute('value')); break; }
  }
  return true;
}

function patchLifecycle() {
  if (patched) return; patched = true;
  const originalAttribute = HTMLElementImpl.prototype._attrModified;
  const originalDetach = HTMLElementImpl.prototype._detach;
  HTMLElementImpl.prototype._attrModified = function (name, value, previous) {
    const result = originalAttribute.call(this, name, value, previous);
    const record = documents.get(this._ownerDocument);
    if (!live(record)) return result;
    const element = wrapperForImpl(this);
    if (name === 'open' && value === null && Dialog.is(element)) modalOff(element);
    if (name === 'popover' && kind(value) !== kind(previous)) hide(element, record);
    return result;
  };
  HTMLElementImpl.prototype._detach = function () {
    const record = documents.get(this._ownerDocument), element = wrapperForImpl(this);
    const result = originalDetach.call(this);
    if (live(record)) {
      modalOff(element); hide(element, record);
      // jsdom's ordinary _detach recursion does not enter a host's ShadowRoot.
      // Sweep only private top-layer entries so closed-root descendants cannot
      // retain showing state after their host is removed and reinserted.
      for (const candidate of [...record.topLayer]) {
        if (!candidate.isConnected) { modalOff(candidate); hide(candidate, record); }
      }
    }
    return result;
  };
}

export function installDialogs(page, window) {
  if (installed.has(window)) return installed.get(window);
  if (!window?.document || !window.HTMLDialogElement) throw new TypeError('Dialogs require a Window realm');
  patchLifecycle();
  const record = { page, window, document: window.document, signal: page.documentAbort?.signal,
    disposed: false, revision: 0, modals: [], popovers: new Set(), topLayer: [], timers: new Set() };
  documents.set(implForWrapper(record.document), record);
  const dialog = receiver => { Dialog.convert(window, receiver); return recordFor(receiver); };
  const html = receiver => {
    HTMLElement.convert(window, receiver);
    const owner = recordFor(receiver);
    if (!owner || receiver.getAttribute('popover') === null) throw new window.DOMException('Element has no popover attribute', 'NotSupportedError');
    return owner;
  };
  const methods = {
    show() { dialog(this); if (!this.open) this.setAttribute('open', ''); },
    showModal() {
      const owner=dialog(this), state=stateFor(this);
      if (this.open) { if (state.modal && isModal(this)) return; throw invalid(window); }
      if (!this.isConnected || !live(owner) || isPopoverOpen(this)) throw invalid(window);
      this.setAttribute('open', ''); state.modal=true; owner.modals.push(this); owner.topLayer.push(this); owner.revision++;
    },
    close(returnValue = undefined) {
      const owner=dialog(this);
      const value=returnValue == null ? returnValue : string(returnValue, window);
      closeDialog(this, owner, value);
    },
  };
  for (const [name, value] of Object.entries(methods)) Object.defineProperty(window.HTMLDialogElement.prototype, name, { value, writable:true, configurable:true, enumerable:true });
  Object.defineProperty(window.HTMLDialogElement.prototype, 'returnValue', {
    configurable:true, enumerable:true,
    get() { dialog(this); return stateFor(this).returnValue; },
    set(value) { dialog(this); stateFor(this).returnValue=string(value, window); },
  });
  const popovers = {
    showPopover() { showPopover(this, html(this)); },
    hidePopover() { hide(this, html(this)); },
    togglePopover(force = undefined) {
      const owner=html(this), requested=force == null ? !isPopoverOpen(this) : Boolean(force);
      if (requested) showPopover(this, owner); else hide(this, owner);
      return isPopoverOpen(this);
    },
  };
  for (const [name,value] of Object.entries(popovers)) Object.defineProperty(window.HTMLElement.prototype,name,{value,writable:true,configurable:true,enumerable:true});
  Object.defineProperty(window.HTMLElement.prototype, 'popover', {
    configurable:true, enumerable:true,
    get() { HTMLElement.convert(window,this);return kind(this.getAttribute('popover')); },
    set(value) { HTMLElement.convert(window,this);if(value==null)this.removeAttribute('popover');else this.setAttribute('popover',string(value,window)); },
  });
  if (typeof window.ToggleEvent !== 'function') {
    const slots = new WeakMap();
    class ToggleEvent extends window.Event {
      constructor(type, init = {}) {
        super(type, init); slots.set(this,{oldState:string(init.oldState??'',window),newState:string(init.newState??'',window)});
      }
      get oldState() { if(!slots.has(this))throw new window.TypeError('Illegal invocation');return slots.get(this).oldState; }
      get newState() { if(!slots.has(this))throw new window.TypeError('Illegal invocation');return slots.get(this).newState; }
      get [Symbol.toStringTag]() { return 'ToggleEvent'; }
    }
    Object.defineProperty(window,'ToggleEvent',{value:ToggleEvent,writable:true,configurable:true});
  }
  const previousClose=window.close;
  function dispose() {
    if(record.disposed)return;record.disposed=true;
    if(record.modals.length||record.popovers.size)record.revision++;
    for(const timer of record.timers)window.clearTimeout(timer);record.timers.clear();
    for(const element of record.modals)states.get(element).modal=false;record.modals=[];
    for(const element of record.popovers)states.get(element).popover=false;record.popovers.clear();record.topLayer=[];
    record.signal?.removeEventListener('abort',dispose);
    if(window.close===close)window.close=previousClose;
  }
  function close(...args) { dispose();return previousClose.apply(this,args); }
  window.close=close;record.signal?.addEventListener('abort',dispose,{once:true});
  const api={dispose,isModal,isPopoverOpen,get revision(){return record.revision;},get topLayer(){return [...record.topLayer].filter(element=>isModal(element)||isPopoverOpen(element));}};
  installed.set(window,api);return api;
}
