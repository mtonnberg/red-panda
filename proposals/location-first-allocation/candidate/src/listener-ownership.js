import { AsyncLocalStorage } from 'node:async_hooks';
// Explicit host-listener registration scopes mark
// actual private records; authored callbacks are never classified by source.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const contexts = new WeakMap(), scopes = [];
const creation = new AsyncLocalStorage();
let patched = false;

function internals() {
  return { ...require('jsdom/lib/jsdom/living/generated/utils.js'),
    EventTargetImpl: require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation,
    tree: require('jsdom/lib/jsdom/living/helpers/internal-constants.js').domSymbolTree };
}

export function installListenerOwnership(window) {
  if (contexts.has(window)) return contexts.get(window).controller;
  const { implForWrapper, EventTargetImpl, tree } = internals();
  if (!patched) {
    patched = true; const add = EventTargetImpl.prototype.addEventListener, dispatch = EventTargetImpl.prototype._dispatch;
    EventTargetImpl.prototype._dispatch = function (...args) {
      // Native creation tasks may dispatch authored event callbacks. Those
      // callbacks and their descendants must not inherit host ownership.
      const saved = scopes.splice(0);
      try { return creation.run(null, () => dispatch.apply(this, args)); }
      finally { scopes.push(...saved); }
    };
    EventTargetImpl.prototype.addEventListener = function (type, ...args) {
      const inherited = creation.getStore()?.context;
      const context = scopes.at(-1) ?? inherited, targetContext = contexts.get(this._globalObject);
      const before = context && context === targetContext ? new Set(this._eventListeners[type] ?? []) : null;
      const result = add.call(this, type, ...args);
      if (before) for (const listener of this._eventListeners[type] ?? []) if (!before.has(listener)) {
        context.internal.add(listener);
        if (context === inherited && this === context.document && type === 'load') context.nativeLoadBridge = true;
      }
      return result;
    };
  }
  const implementation = implForWrapper(window);
  const context = { window, implementation, document: implForWrapper(window.document), internal: new WeakSet(), nativeLoadBridge: false };
  contexts.set(window, context); contexts.set(implementation._globalObject, context);
  const scope = callback => {
    scopes.push(context);
    try { return callback(); }
    finally { scopes.pop(); }
  };
  function eraseTarget(target) {
    for (const listeners of Object.values(target._eventListeners ?? {})) {
      // Mutate the actual arrays: jsdom's current dispatch also checks these
      // arrays, so erased listeners cannot fire later in the same dispatch.
      const retained = listeners.filter(listener => context.internal.has(listener));
      listeners.splice(0, listeners.length, ...retained);
    }
    if (target._eventHandlers) target._eventHandlers = Object.create(null);
    if (target._registeredHandlers) target._registeredHandlers = new Set();
  }
  function eraseAuthoredListeners(document = window.document) {
    const implementation = implForWrapper(document);
    if (!implementation || implementation !== implForWrapper(window.document)) throw new TypeError('The live owned Document is required');
    const pending = [implementation];
    while (pending.length) {
      const target = pending.pop(); eraseTarget(target);
      for (const child of tree.childrenIterator(target)) pending.push(child);
      if (target._shadowRoot) pending.push(target._shadowRoot);
    }
    eraseTarget(context.implementation);
    // Window's event-handler maps live on the Window object, while its event
    // listener arrays are on the EventTarget implementation.
    if (window._eventHandlers) window._eventHandlers = Object.create(null);
    if (window._registeredHandlers) window._registeredHandlers = new Set();
  }
  context.controller = { scope, eraseAuthoredListeners,
    get hasNativeLoadBridge() { return context.nativeLoadBridge; },
    checkpoint(target, type) { return new Set(implForWrapper(target)._eventListeners[type] ?? []); },
    adoptSince(target, type, checkpoint) {
      for (const listener of implForWrapper(target)._eventListeners[type] ?? []) if (!checkpoint.has(listener)) context.internal.add(listener);
    },
    add(target, type, callback, options) { return scope(() => target.addEventListener(type, callback, options)); } };
  return context.controller;
}

// The native Window factory schedules its own load-bridge task. Bind that
// task's registration to the newly returned Window, before any authored parse.
// No callback source/realm heuristics or public getter overrides are involved.
export function createOwnedWindow(factory, options) {
  const binding = { context: null };
  const window = creation.run(binding, () => factory(options));
  const proxy = window._globalProxy ?? window;
  installListenerOwnership(proxy); binding.context = contexts.get(proxy);
  return window;
}
