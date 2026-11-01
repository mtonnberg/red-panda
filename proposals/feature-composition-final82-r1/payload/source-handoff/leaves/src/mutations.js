import {platformFactoryRecord} from './platform-factories.js';
import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ObserverImpl = require('jsdom/lib/jsdom/living/mutation-observer/MutationObserver-impl.js').implementation;
const ErrorEvent = require('jsdom/lib/jsdom/living/generated/ErrorEvent.js');
const {wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const windows = new WeakMap(), observers = new WeakMap(), agents = new WeakMap();
let patched = false;

function active(context) {
  return !context.disposed && !context.signal?.aborted && !context.page.closed && context.window.document === context.document;
}

function report(context, value) {
  if (context.reportError) { context.reportError(value); return; }
  let message;
  try { message = String(value); } catch { message = 'Uncaught exception'; }
  const event = ErrorEvent.createImpl(context.window, ['error', { error: value, message, cancelable: true }], { isTrusted: true });
  implForWrapper(context.window)._dispatch(event);
  if (!event.defaultPrevented) {
    const error = new Error(message); error.type = 'unhandled exception'; error.detail = value;
    context.window._virtualConsole.emit('jsdomError', error);
  }
}

function recordsArray(state) {
  const records = state.records;
  state.records = [];
  return state.context.arrayFrom(records, wrapperForImpl);
}

function notify(agent) {
  agent.queued = false;
  // Native Lightpanda and pinned jsdom both deliver in observer construction order.
  const pending = [...agent.pending].sort((a, b) => a.impl._id - b.impl._id);
  agent.pending.clear();
  for (const state of pending) {
    if (!active(state.context)) { state.records = []; continue; }
    const records = recordsArray(state);
    if (!records.length) continue;
    try { state.callback.call(state.wrapper, records, state.wrapper); }
    catch (error) { report(state.context, error); }
  }
}

function enqueue(state, record) {
  if (!active(state.context)) return;
  state.records.push(record);
  const agent = state.context.agent;
  agent.pending.add(state);
  if (agent.queued) return;
  agent.queued = true;
  // This token is queued by an actual interested public record, never an empty
  // jsdom checkpoint or an engine's internal invalidation observer.
  queueMicrotask(() => notify(agent));
}

function patch() {
  if (patched) return;
  patched = true;
  const takeRecords = ObserverImpl.prototype.takeRecords;
  const disconnect = ObserverImpl.prototype.disconnect;
  const observe = ObserverImpl.prototype.observe;
  ObserverImpl.prototype.takeRecords = function () {
    const state = observers.get(this);
    return state ? recordsArray(state) : takeRecords.call(this);
  };
  ObserverImpl.prototype.disconnect = function () {
    const result = disconnect.call(this);
    const state = observers.get(this);
    if (state) state.records = [];
    // Keep the existing token: a subsequent observe/mutation in this turn may
    // reuse it, exactly as native takeRecords/disconnect do.
    return result;
  };
  ObserverImpl.prototype.observe = function (...args) {
    const state = observers.get(this);
    let result;
    try { result = observe.apply(this, args); }
    catch (error) {
      if (state && error instanceof TypeError) throw new state.context.window.TypeError(error.message);
      throw error;
    }
    if (state && !active(state.context)) disconnect.call(this);
    return result;
  };
}

/** Separate engine invalidations from the public MutationObserver checkpoint. */
export function createInternalMutationObserver(window, callback) {
  const context = windows.get(window);
  return context ? context.controller.createInternalObserver(callback) : new window.MutationObserver(callback);
}

/** Retain pinned jsdom observation/record creation while owning public delivery. */
export function installMutations(page, window) {
  if (windows.has(window)) return windows.get(window).controller;
  patch();
  const NativeObserver = window.MutationObserver;
  const agentKey = page.browser ?? page;
  let agent = agents.get(agentKey);
  if (!agent) { agent = { pending: new Set(), queued: false }; agents.set(agentKey, agent); }
  const context = { page, window, document: window.document, signal: page.documentAbort?.signal, agent,
    disposed: false, owned: new Set(), arrayFrom: window.Array.from.bind(window.Array),
    reportError: typeof window.reportError === 'function' ? window.reportError.bind(window) : null };
  windows.set(window, context);

  function MutationObserver(callback) {
    if (!new.target) throw new window.TypeError('MutationObserver requires new.');
    const wrapper = Reflect.construct(NativeObserver, Array.from(arguments), new.target);
    const impl = implForWrapper(wrapper);
    const state = { wrapper, impl, context, callback: impl._callback, records: [] };
    observers.set(impl, state);
    context.owned.add(new WeakRef(wrapper));
    // The native helper may already have an empty notification microtask queued.
    // It sees no public records, while our sink retains the actual record objects
    // and schedules public delivery at their true insertion point.
    const sink = [];
    Object.defineProperty(sink, 'push', { value(record) { enqueue(state, record); return 0; } });
    Object.defineProperty(impl, '_recordQueue', { configurable: false, get: () => sink, set() {} });
    impl._callback = () => {};
    return wrapper;
  }
  Object.setPrototypeOf(MutationObserver, window.Function.prototype);
  Object.defineProperty(MutationObserver, 'prototype', { value: NativeObserver.prototype, writable: false });
  Object.defineProperty(NativeObserver.prototype, 'constructor', { value: MutationObserver, writable: true, configurable: true });
  Object.defineProperty(window, 'MutationObserver', { value: MutationObserver, writable: true, configurable: true });

  const dispose = () => {
    if (context.disposed) return;
    context.disposed = true;
    for (const reference of context.owned) {
      const wrapper = reference.deref();
      if (!wrapper) continue;
      const impl = implForWrapper(wrapper);
      impl.disconnect();
      const state = observers.get(impl);
      if (state) agent.pending.delete(state);
    }
    context.owned.clear();
    context.signal?.removeEventListener('abort', dispose);
    page.off?.('close', dispose);
    window.removeEventListener('unload', dispose);
    if (window.close === close) window.close = previousClose;
  };
  const previousClose = window.close;
  function close(...args) { dispose(); return Reflect.apply(previousClose, this, args); }
  window.close = close;
  context.controller = Object.freeze({
    createInternalObserver(callback) {
      const observer = new NativeObserver(callback);
      context.owned.add(new WeakRef(observer));
      if (!active(context)) observer.disconnect();
      return observer;
    },
    dispose,
  });
  context.signal?.addEventListener('abort', dispose, { once: true });
  page.once?.('close', dispose);
  window.addEventListener('unload', dispose, { once: true });
  if (!active(context)) dispose();
  return context.controller;
}

// Successful canonical generated setup supplies the actual record backend.
// Internal consumers must not invoke authored MutationRecord accessors.
export function canonicalMutationRecord(value) {
  const record=platformFactoryRecord(value);
  return record?.kind==='MutationRecord'?record.implementation:undefined;
}
