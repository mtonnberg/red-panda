import {types} from 'node:util';
import {beginDispatchRecoveryParticipant,completeDispatchRecoveryParticipant} from './dom-dispatch-recovery.js';
import {installEventAPIParity,createPromiseRejectionEvent} from './event-api-parity.js';
import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import { createRequire } from 'node:module';
import { createHook } from 'node:async_hooks';
import { getHeapBinding } from './native-heap.js';
import { runInContext, isContext } from 'node:vm';

const require = createRequire(import.meta.url);

const ErrorEvent = require('jsdom/lib/jsdom/living/generated/ErrorEvent.js');
const { DOMString } = require('webidl-conversions');
const EventTargetImpl = require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const records = new WeakMap();
// Actual intrinsic anchors stay rooted by their genuine creation context. The
// ephemeron value retains inactive ownership while that context remains alive.
// Weak index entries neither retain old contexts nor use a reusable Window proxy
// as context authority. Every match uses public V8 GetCreationContext equality.
const promiseRealms = new WeakMap();
const promiseAnchors = new Set();
const hostRealmAnchor = Object.prototype;
let legacyHostRecord;
let legacyHostObserver;
const promises = new WeakMap();
const getPrototypeOf = Object.getPrototypeOf;
let installed = false;

function read(value, key) { try { return value?.[key]; } catch { return undefined; } }
function message(value) {
  try { return typeof value === 'symbol' ? value.description ?? '' : String(value); }
  catch { return 'Uncaught exception'; }
}
function active(record) {
  return !record.disposed && !record.signal?.aborted && !record.page.closed && record.window.document === record.document;
}

// Keep arbitrary thrown values out of host protocol serializers, which expect Error-like fields.
function forward(record, value) {
  if (!active(record)) return;
  const error = new Error(message(value));
  const name = read(value, 'name');
  error.name = typeof name === 'string' ? name : 'Error';
  const stack = read(value, 'stack');
  if (typeof stack === 'string') error.stack = stack;
  error.detail = value;
  error.type = 'unhandled exception';
  record.window._virtualConsole.emit('jsdomError', error);
}

function location(record, value, callerStack) {
  const stack = read(value, 'stack');
  for (const text of [stack, callerStack]) {
    if (typeof text !== 'string') continue;
    for (const line of text.split('\n').slice(1)) {
      if (line.includes('/src/errors.js:') || line.includes('node:') || line.includes('/node_modules/')) continue;
      const match = line.match(/(?:at\s+(?:.*?\s+\()?)(.*?):(\d+):(\d+)\)?$/);
      if (match) return { filename: match[1], lineno: Number(match[2]), colno: Number(match[3]) };
    }
  }
  return { filename: read(record.window.document, 'URL') ?? '', lineno: 0, colno: 0 };
}

function report(record, value, callerStack) {
  if (!active(record)) return;
  if (record.depth) { forward(record, value); return; }
  const event = ErrorEvent.createImpl(record.window, ['error', {
    message: message(value), ...location(record, value, callerStack), error: value, cancelable: true,
  }], { isTrusted: true });
  implForWrapper(record.window)._dispatch(event);
  if (!event.defaultPrevented) forward(record, value);
}

function registerPromiseRealm(record) {
  const context = implForWrapper(record.window)._globalObject;
  if (!isContext(context)) {
    // Explicit no-runScripts JSDOM installation historically owns subsequent
    // Host Promise births. Preserve allocation-time ownership across multiple
    // such installers, without making earlier unrelated Host work owned lazily.
    // This legacy mode still enables Node Promise hooks and retains their known
    // interruption hazard; ordinary VM Window installation does not enable it.
    if (!legacyHostObserver) {
      const binding = getHeapBinding();
      legacyHostObserver = createHook({ init(_id, type, _trigger, resource) {
        if (type === 'PROMISE' && legacyHostRecord && types.isPromise(resource) && binding.sameRealm(resource, hostRealmAnchor)) {
          promises.set(resource, { record: legacyHostRecord, reason: undefined, reported: false });
        }
      } });
      legacyHostObserver.enable();
    }
    legacyHostRecord = record;
    return;
  }
  // The literal has no authored lookups. Its genuine initial prototype is an
  // intrinsic kept by the actual context even after public globals/prototypes
  // are replaced. It remains independent of the public Window proxy's identity.
  const anchor = getPrototypeOf(runInContext('({})', context));
  if (!promiseRealms.has(anchor)) promiseAnchors.add(new WeakRef(anchor));
  record.promiseAnchor = anchor;
  promiseRealms.set(anchor, record);
}

function owner(promise) {
  if (!types.isPromise(promise)) return undefined;
  const binding = getHeapBinding();
  for (const reference of promiseAnchors) {
    const anchor = reference.deref();
    if (!anchor) { promiseAnchors.delete(reference); continue; }
    if (binding.sameRealm(promise, anchor)) return promiseRealms.get(anchor);
  }
}

function rejectionEvent(record, type, promise, reason) {
  const event = createPromiseRejectionEvent(record.window, type, promise, reason);
  const impl = implForWrapper(event);
  implForWrapper(record.window)._dispatch(impl);
  return event;
}

function installHooks() {
  if (installed) return;
  installed = true;
  // Pinned jsdom callback converters retain listener identity, receiver and WebIDL conversions.
  // Catch before its legacy reporter reads unsafe properties on arbitrary thrown values.
  for (const name of ['EventListener', 'EventHandlerNonNull', 'OnErrorEventHandlerNonNull', 'MutationCallback', 'Function']) {
    const callback = require(`jsdom/lib/jsdom/living/generated/${name}.js`);
    const convert = callback.convert;
    callback.convert = function (globalObject, ...args) {
      const converted = convert.call(this, globalObject, ...args);
      const record = records.get(globalObject);
      if (!record) return converted;
      function guarded(...values) {
        if (!active(record)) return undefined;
        try { return Reflect.apply(converted, this, values); }
        catch (error) { report(record, error); return undefined; }
      }
      Object.defineProperties(guarded, Object.getOwnPropertyDescriptors(converted));
      return guarded;
    };
  }
  const dispatch = EventTargetImpl.prototype._dispatch;
  EventTargetImpl.prototype._dispatch = function (event, ...args) {
    const record = records.get(this._globalObject);
    const reporting = record && this === implForWrapper(record.window) && event.isTrusted && ErrorEvent.isImpl(event);
    if (!reporting) return dispatch.call(this, event, ...args);
    // Also covers classic script errors reported by jsdom itself.
    event.message = message(event.error);
    const previousDepth = record.depth;
    const recovery = beginDispatchRecoveryParticipant(() => { record.depth = previousDepth; });
    record.depth++;
    try { return dispatch.call(this, event, ...args); }
    finally { record.depth--; completeDispatchRecoveryParticipant(recovery); }
  };
  function onUnhandled(reason, promise) {
    let owned = promises.get(promise);
    if (!owned) {
      const record = owner(promise);
      if (record) {
        owned = { record, reason: undefined, reported: false };
        promises.set(promise, owned);
      }
    }
    if (owned) {
      const { record } = owned;
      owned.reason = reason;
      if (!active(record)) return;
      owned.reported = true;
      if (!rejectionEvent(record, 'unhandledrejection', promise, reason).defaultPrevented) forward(record, reason);
      return;
    }
    // Installing this listener must not turn unrelated host failures into silent successes.
    if (process.listeners('unhandledRejection').every(listener => listener === onUnhandled)) {
      queueMicrotask(() => { throw reason instanceof Error ? reason : new Error(message(reason)); });
    }
  }
  process.on('unhandledRejection', onUnhandled);
  process.on('rejectionHandled', promise => {
    const owned = promises.get(promise);
    if (owned?.reported && active(owned.record)) rejectionEvent(owned.record, 'rejectionhandled', promise, owned.reason);
  });
}

/** Install before document scripts run. Existing jsdom VirtualConsole forwarding remains authoritative. */
export function installErrors(page, window) {
  const prior = records.get(window);
  if (prior) return prior.controller;
  installHooks();
  const record = { page, window, document: window.document, signal: page.documentAbort?.signal, disposed: false, depth: 0 };
  records.set(window, record);
  records.set(implForWrapper(window)._globalObject, record);
  registerPromiseRealm(record);
  installEventAPIParity(window);
  Object.defineProperty(window, 'reportError', { configurable: true, writable: true, enumerable: true,
    value: function reportError(value) {
      if (!arguments.length) throw new window.TypeError('reportError requires an argument.');
      report(record, value, new Error().stack);
    },
  });
  // Unlike event listeners, timer function handlers do not pass through a WebIDL callback converter.
  for (const name of ['setTimeout', 'setInterval']) {
    const original = window[name];
    window[name] = function (handler, ...args) {
      const callback = typeof handler === 'function' ? handler : null;
      const source = callback ? null : DOMString(handler, { globals: window });
      return Reflect.apply(original, this, [function (...values) {
        if (!active(record)) return;
        try {
          if (callback) return Reflect.apply(callback, this, values);
          const context = implForWrapper(window)._globalObject;
          if (context._runScripts === 'dangerously') return runInContext(source, context, {
            filename: window.location.href, displayErrors: false,
          });
        }
        catch (error) { report(record, error); }
      }, ...args]);
    };
  }
  record.controller = Object.freeze({
    report(value) { report(record, value, new Error().stack); },
    dispose() { record.disposed = true; },
  });
  record.signal?.addEventListener('abort', record.controller.dispose, { once: true });
  return record.controller;
}

// Trusted Host callers reuse the actual registered realm's ErrorEvent path.
// Host VM-control errors keep their existing protocol diagnostic path.
// Return only reporting status; private records and Host errors stay outside the VM.
const hostErrorPrototype=Error.prototype;
function hostError(value){
 if(!types.isNativeError(value))return false;
 let prototype=getPrototypeOf(value);
 for(let depth=0;prototype&&depth<32;depth++){
  if(types.isProxy(prototype))return false;
  if(prototype===hostErrorPrototype)return true;
  prototype=getPrototypeOf(prototype);
 }
 return false;
}
export function reportWindowException(window,value){const record=records.get(window);if(!record||hostError(value))return false;report(record,value);return true;}
