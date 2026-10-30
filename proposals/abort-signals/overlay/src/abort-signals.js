import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Signal = require('jsdom/lib/jsdom/living/generated/AbortSignal.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const SignalImpl = require('jsdom/lib/jsdom/living/aborting/AbortSignal-impl.js').implementation;
const conversions = require('webidl-conversions');
const NativeController = globalThis.AbortController;
const installed = new WeakMap();

// Keep the genuine document's EventTarget/AbortSignal objects. Only the
// transport counterpart is a Node signal; it is never returned to author code.
export function installAbortSignals(page, window) {
  if (installed.has(window)) return installed.get(window);
  const document = window.document, generation = page.documentGeneration;
  const documentSignal = page.documentAbort?.signal;
  const bridges = new WeakMap(), bridgeEntries = new Set(), timers = new Set();
  const bridgeFinalizer = new FinalizationRegistry(entry => bridgeEntries.delete(entry));
  const setTimer = window.setTimeout.bind(window), clearTimer = window.clearTimeout.bind(window);
  const Controller = window.AbortController, AbortSignal = window.AbortSignal;
  const abort = Controller.prototype.abort, staticAbort = AbortSignal.abort;
  let disposed = false;
  const active = () => !disposed && !page.closed && !documentSignal?.aborted && page.documentGeneration === generation && window.document === document;
  const reason = () => new window.DOMException('signal is aborted without reason', 'AbortError');
  const api = {
    native(signal) {
      if (!Signal.is(signal)) throw new window.TypeError('The provided value is not of type AbortSignal.');
      const source = implForWrapper(signal);
      let bridge = bridges.get(source);
      if (bridge) return bridge.signal;
      bridge = new NativeController(); bridges.set(source, bridge);
      const sourceRef = new WeakRef(source);
      let entry;
      const propagate = () => {
        const actual = sourceRef.deref(); if (actual) bridge.abort(actual.reason);
        if (entry) { bridgeEntries.delete(entry); bridgeFinalizer.unregister(entry); }
      };
      if (source.aborted) propagate();
      else if (!disposed) {
        source._addAlgorithm(propagate);
        // Weak source references allow unused signals to be collected while
        // still permitting deterministic algorithm removal at document close.
        entry = { source: sourceRef, propagate };
        bridgeEntries.add(entry); bridgeFinalizer.register(source, entry, entry);
      }
      return bridge.signal;
    },
    validate(signal) { if (!Signal.is(signal)) throw new window.TypeError('The provided value is not of type AbortSignal.'); return signal; },
    timeout(value, count) {
      if (!count) throw new window.TypeError('AbortSignal.timeout requires 1 argument');
      const milliseconds = conversions['unsigned long long'](value, { globals: window, enforceRange: true });
      const signal = Signal.create(window, []), implementation = implForWrapper(signal);
      let remaining = milliseconds;
      const schedule = () => {
        if (!active()) return;
        const chunk = Math.min(remaining, 2147483647);
        const timer = setTimer(() => {
          timers.delete(timer);
          if (!active()) return;
          remaining -= chunk;
          if (remaining > 0) schedule();
          else implementation._signalAbort(new window.DOMException('signal timed out', 'TimeoutError'));
        }, chunk);
        timers.add(timer);
      };
      schedule(); return signal;
    },
    abort(receiver, value) { return abort.call(receiver, value === undefined ? reason() : value); },
    staticAbort(value) { return staticAbort.call(AbortSignal, value === undefined ? reason() : value); },
    sequence() { return []; },
    member(list, signal) { list.push(implForWrapper(api.validate(signal))); },
    any(signals) { return wrapperForImpl(SignalImpl.any(window, signals)); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const timer of timers) clearTimer(timer); timers.clear();
      for (const entry of bridgeEntries) { entry.source.deref()?._removeAlgorithm(entry.propagate); bridgeFinalizer.unregister(entry); }
      bridgeEntries.clear(); documentSignal?.removeEventListener('abort', api.dispose);
      if (window.close === close) window.close = previousClose;
    },
  };
  window.eval(`(function(bridge) {
    Object.defineProperty(AbortController.prototype, 'abort', {value: function abort() { return bridge.abort(this, arguments[0]); }, writable:true, enumerable:true, configurable:true});
    Object.defineProperty(AbortSignal, 'abort', {value: function abort() { return bridge.staticAbort(arguments[0]); }, writable:true, enumerable:true, configurable:true});
    Object.defineProperty(AbortSignal, 'any', {value: function any(signals) {
      if (!arguments.length || signals === null || (typeof signals !== 'object' && typeof signals !== 'function')) throw new TypeError('AbortSignal.any requires an iterable object');
      const list = bridge.sequence(); for (const signal of signals) bridge.member(list, signal);
      return bridge.any(list);
    }, writable:true, enumerable:true, configurable:true});
    Object.defineProperty(AbortSignal, 'timeout', {value: function timeout(milliseconds) { return bridge.timeout(milliseconds, arguments.length); }, writable:true, enumerable:true, configurable:true});
  })`)(api);
  const previousClose = window.close;
  const close = function(...args) { api.dispose(); return previousClose.apply(this, args); };
  window.close = close; documentSignal?.addEventListener('abort', api.dispose, {once: true});
  installed.set(window, api); return api;
}
