import { isCanvasCloneRejected } from './canvas.js';
import { cloneObjectKind } from './clone-object-kind.js';
import { registerPlatformFactory, platformFactoryRecord, registerPlatformCloneRealm } from './platform-factories.js';
import { createPlatformCodec } from "./platform-codec.js";
import { MessageChannel as NativeChannel, MessagePort as NativePort } from 'node:worker_threads';
import { types } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const { fireAnEvent } = require('jsdom/lib/jsdom/living/helpers/events.js');
const MessageEvent = require('jsdom/lib/jsdom/living/generated/MessageEvent.js');
const nativeClone = globalThis.structuredClone;
const PORTS = new WeakMap(), INSTALLED = new WeakMap();
const ERROR_NAMES = ['Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'];
const VIEW_NAMES = ['DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float16Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'];

/** A realm adapter shared by Window and dedicated-worker bridges.
 * prepare(data, transfer, sourcePort?) returns {message:{data,ports},transfer,
 * commit()}. Send message over a real Node Worker/MessagePort using transfer,
 * then commit only after postMessage succeeds. receive(message) returns realm
 * data and a frozen realm ports array; dispatchMessage(target,message,type?)
 * additionally emits a MessageEvent. wrap/unwrap are host-only port adapters.
 * clone implements genuine native structured clone/transfer plus realm adoption.
 * dispose closes only ports still owned by this realm; transferred ports survive.
 * Blob/File preserve their immutable bytes and private metadata through graph
 * codecs. SharedArrayBuffer and other DOM platform objects reject explicitly.
 */
export function createMessagingRealm(realm, { active = () => true, dispatch, reportError = () => {}, cloneUnknownTransfers = false } = {}) {
  const I = Object.fromEntries(['Object', 'Array', 'Map', 'Set', 'ArrayBuffer', 'Date', 'RegExp', ...ERROR_NAMES, ...VIEW_NAMES]
    .filter(name => typeof realm[name] === 'function').map(name => [name, realm[name]]));
  const codec = createPlatformCodec(realm);
  const deliveryQueues = new WeakMap(), pendingDeliveries = new Set();
  const EventTarget = realm.EventTarget;
  const owned = new Set(), wrapped = new WeakMap(), channels = new WeakMap(), secret = {};
  let disposed = false;
  const live = () => !disposed && active();
  const cloneError = message => new realm.DOMException(message, 'DataCloneError');
  const typeError = message => new realm.TypeError(message);
  const emit = dispatch ?? ((target, type, data, ports) => {
    const event = new realm.MessageEvent(type, { data, ports, origin: '', source: null });
    Object.defineProperty(event, 'isTrusted', { value: true });
    target.dispatchEvent(event);
  });
  function record(port) {
    const state = PORTS.get(port);
    if (!state) throw typeError('Illegal invocation');
    return state;
  }
  function release(state, detached = false) {
    state.detached ||= detached;
    state.native.off('message', state.message); state.native.off('messageerror', state.messageerror);
    state.native.off('close', state.close);
    state.owner.delete(state);
  }
  function wrap(native) {
    if (!(native instanceof NativePort)) throw typeError('Expected a native MessagePort');
    const cached = wrapped.get(native);
    if (cached) return cached;
    if (!live()) { native.close(); throw new realm.DOMException('The realm is disposed', 'InvalidStateError'); }
    const port = new MessagePort(secret);
    const state = { native, owner: owned, port, detached: false, closed: false, started: false, handlers: new Map() };
    state.message = message => {
      if (!live() || state.detached || state.closed) return;
      try { dispatchMessage(port, message); }
      catch (error) {
        try { emit(port, 'messageerror', null, I.Object.freeze(new I.Array())); }
        catch (eventError) { reportError(eventError); }
      }
    };
    state.messageerror = () => {
      if (live() && !state.detached && !state.closed) emit(port, 'messageerror', null, I.Object.freeze(new I.Array()));
    };
    state.close = () => { state.closed = true; release(state); };
    PORTS.set(port, state); registerPlatformFactory(port,{kind:'MessagePort',globalObject:realm}); wrapped.set(native, port); owned.add(state);
    native.on('close', state.close); native.unref();
    return port;
  }
  function encode(value, allowed, seen = new Map(), platforms) {
    if (typeof value === 'function' || typeof value === 'symbol') throw cloneError('Value cannot be structured cloned');
    if (value === null || typeof value !== 'object') return value;
    if (types.isProxy(value) && !platformFactoryRecord(value)) throw cloneError('Proxy objects cannot be structured cloned');
    const port = PORTS.get(value);
    if (port) {
      if (port.detached || !allowed.has(value)) throw cloneError('MessagePort must be transferred and cannot be detached');
      return port.native;
    }
    if (value instanceof NativePort) throw cloneError('Native MessagePort must be wrapped before sending');
    if (seen.has(value)) return seen.get(value);
    const platform = codec.serialize(value);
    if (platform) { const placeholder = {}; seen.set(value, placeholder); platforms.set(placeholder, platform); return placeholder; }
    if (types.isSharedArrayBuffer(value)) throw cloneError('SharedArrayBuffer messaging is not implemented');
    if (types.isArrayBuffer(value) || ArrayBuffer.isView(value) || types.isDate(value) || types.isRegExp(value)) return value;
    if (types.isNativeError(value)) {
      const Constructor = ERROR_NAMES.includes(value.name) ? globalThis[value.name] : Error;
      const result = new Constructor(value.message); seen.set(value, result);
      if (value.stack !== undefined) result.stack = value.stack;
      if (Object.hasOwn(value, 'cause')) result.cause = encode(value.cause, allowed, seen, platforms);
      return result;
    }
    if (types.isMap(value)) {
      const result = new Map(); seen.set(value, result);
      for (const [key, item] of value) result.set(encode(key, allowed, seen, platforms), encode(item, allowed, seen, platforms));
      return result;
    }
    if (types.isSet(value)) {
      const result = new Set(); seen.set(value, result);
      for (const item of value) result.add(encode(item, allowed, seen, platforms)); return result;
    }
    if (platformFactoryRecord(value) || !['Object','Array'].includes(cloneObjectKind(value))) {
      throw cloneError('Unsupported structured clone type');
    }
    const result = Array.isArray(value) ? new Array(value.length) : {};
    seen.set(value, result);
    for (const key of Object.keys(value)) Object.defineProperty(result, key, {
      value: encode(value[key], allowed, seen, platforms), enumerable: true, configurable: true, writable: true,
    });
    return result;
  }
  function transferList(options) {
    const list = options && typeof options === 'object' && typeof options[Symbol.iterator] === 'function'
      ? options : options?.transfer === undefined ? [] : options.transfer;
    if (list === null || typeof list?.[Symbol.iterator] !== 'function') throw typeError('Transfer list must be iterable');
    return [...list];
  }
  function prepare(data, options, sourcePort, ignoreUnknownTransfers = false) {
    const list = transferList(options), allowed = new Set(), transfer = [], moved = [], ports = [];
    for (const value of list) {
      if (ignoreUnknownTransfers && !PORTS.has(value) && !types.isArrayBuffer(value)) continue;
      if (allowed.has(value)) throw cloneError('Transfer list contains duplicates');
      allowed.add(value);
      const state = PORTS.get(value);
      if (state) {
        if (state.detached) throw cloneError('MessagePort is already detached');
        if (value === sourcePort) throw cloneError('A MessagePort cannot transfer itself');
        transfer.push(state.native); ports.push(state.native); moved.push(state);
      } else if (types.isArrayBuffer(value)) transfer.push(value);
      else throw cloneError(isCanvasCloneRejected(value)?'The object can not be cloned':'Transfer list contains a non-transferable value');
    }
    const platforms = new Map();
    const message = { data: encode(data, allowed, new Map(), platforms), ports };
    if (platforms.size) message.platforms = platforms;
    let committed = false;
    return { message, transfer, commit() {
      if (committed) return;
      committed = true; for (const state of moved) release(state, true);
    } };
  }
  function adopt(value, seen = new Map(), platforms) {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (platforms?.has(value)) { const result = codec.deserialize(platforms.get(value)); seen.set(value, result); return result; }
    if (value instanceof NativePort) { const result = wrap(value); seen.set(value, result); return result; }
    if (types.isSharedArrayBuffer(value)) throw cloneError('SharedArrayBuffer messaging is not implemented');
    if (types.isArrayBuffer(value)) {
      Object.setPrototypeOf(value, I.ArrayBuffer.prototype); seen.set(value, value); return value;
    }
    if (ArrayBuffer.isView(value)) {
      const buffer = adopt(value.buffer, seen, platforms), name = Object.prototype.toString.call(value).slice(8, -1);
      if (!I[name]) throw cloneError(`Unsupported array view: ${name}`);
      const result = name === 'DataView' ? new I.DataView(buffer, value.byteOffset, value.byteLength) : new I[name](buffer, value.byteOffset, value.length);
      seen.set(value, result); return result;
    }
    if (types.isDate(value) || types.isRegExp(value)) {
      Object.setPrototypeOf(value, (types.isDate(value) ? I.Date : I.RegExp).prototype); seen.set(value, value); return value;
    }
    if (types.isNativeError(value)) {
      Object.setPrototypeOf(value, (I[value.name] ?? I.Error).prototype); seen.set(value, value);
      if (Object.hasOwn(value, 'cause')) value.cause = adopt(value.cause, seen, platforms);
      return value;
    }
    if (types.isMap(value)) {
      const result = new I.Map(); seen.set(value, result);
      for (const [key, item] of value) result.set(adopt(key, seen, platforms), adopt(item, seen, platforms)); return result;
    }
    if (types.isSet(value)) {
      const result = new I.Set(); seen.set(value, result);
      for (const item of value) result.add(adopt(item, seen, platforms)); return result;
    }
    const result = Array.isArray(value) ? new I.Array(value.length) : new I.Object();
    seen.set(value, result);
    for (const key of Object.keys(value)) I.Object.defineProperty(result, key, {
      value: adopt(value[key], seen, platforms), enumerable: true, configurable: true, writable: true,
    });
    return result;
  }
  function receive(message) {
    if (!live()) {
      for (const port of message?.ports ?? []) if (port instanceof NativePort) port.close();
      throw new realm.DOMException('The realm is disposed', 'InvalidStateError');
    }
    if (!message || !Array.isArray(message.ports) || message.ports.some(port => !(port instanceof NativePort))) throw cloneError('Malformed messaging envelope');
    const platforms = codec.records(message), seen = new Map(), ports = new I.Array(message.ports.length);
    for (let index = 0; index < message.ports.length; index++) Object.defineProperty(ports, index, {value: adopt(message.ports[index], seen, platforms), enumerable: true, configurable: true, writable: true});
    return { data: adopt(message.data, seen, platforms), ports: Object.freeze(ports) };
  }
  function dropMessage(message) { for (const port of message?.ports ?? []) if (port instanceof NativePort) port.close(); }
  function deliver(target, message, callback, guard = () => true) {
    const valid = () => { const port = PORTS.get(target); return live() && guard() && (!port || (!port.closed && !port.detached)); };
    const previous = deliveryQueues.get(target);
    if (!previous && !codec.needsAsync(message)) {
      if (!valid()) { dropMessage(message); return; }
      return callback(receive(message));
    }
    const work = { message }; pendingDeliveries.add(work);
    let operation;
    operation = (previous ?? Promise.resolve()).then(async () => {
      if (!valid()) { dropMessage(message); return; }
      await codec.hydrate(message);
      if (!valid()) { dropMessage(message); return; }
      callback(receive(message));
    }).catch(error => {
      dropMessage(message);
      if (valid()) { try { emit(target, 'messageerror', null, I.Object.freeze(new I.Array())); } catch (eventError) { reportError(eventError); } }
    }).finally(() => {
      pendingDeliveries.delete(work);
      if (deliveryQueues.get(target) === operation) deliveryQueues.delete(target);
    });
    deliveryQueues.set(target, operation); return operation;
  }
  function dispatchMessage(target, message, type = 'message', guard) {
    return deliver(target, message, ({data, ports}) => emit(target, type, data, ports), guard);
  }
  function prepareBroadcast(data) {
    const prepared = prepare(data);
    let message;
    try { message = nativeClone(prepared.message); prepared.commit(); }
    catch (error) { if(error?.name==='DataCloneError')throw cloneError(error.message);throw error; }
    const pending = codec.needsBroadcastBytes(message);
    if (!pending) codec.stripNativeHandles(message);
    return {message, pending};
  }
  function clone(data, options) {
    const prepared = prepare(data, options, undefined, cloneUnknownTransfers);
    if (codec.needsAsync(prepared.message)) throw cloneError('Synchronous clone cannot asynchronously read an embedded native Blob');
    try {
      const message = nativeClone(prepared.message, { transfer: prepared.transfer }); prepared.commit(); return receive(message).data;
    } catch (error) { if (error?.name === 'DataCloneError') throw cloneError(error.message); throw error; }
  }
  function discard(data, options) {
    const prepared = prepare(data, options);
    try {
      const dropped = nativeClone(prepared.message, { transfer: prepared.transfer }); prepared.commit();
      for (const port of dropped.ports) port.close();
    } catch (error) { if (error?.name === 'DataCloneError') throw cloneError(error.message); throw error; }
  }
  class MessagePort extends EventTarget {
    constructor(token) { super(); if (token !== secret) throw typeError('Illegal constructor'); }
    postMessage(data, options) {
      if (!arguments.length) throw typeError('postMessage requires a message');
      const state = record(this), prepared = prepare(data, options, this);
      try {
        if (state.closed || state.detached || !live()) {
          // Closed ports still serialize and detach transferables. A real native
          // clone performs the transfer; its orphaned destination ports close.
          const dropped = nativeClone(prepared.message, { transfer: prepared.transfer }); prepared.commit();
          for (const port of dropped.ports) port.close();
        } else { state.native.postMessage(prepared.message, prepared.transfer); prepared.commit(); }
      } catch (error) { if (error?.name === 'DataCloneError') throw cloneError(error.message); throw error; }
    }
    start() {
      const state = record(this);
      if (state.started || state.closed || state.detached || !live()) return;
      state.started = true; state.native.on('message', state.message); state.native.on('messageerror', state.messageerror); state.native.unref();
    }
    close() { const state = record(this); state.closed = true; release(state); state.native.close(); }
    get [Symbol.toStringTag]() { return 'MessagePort'; }
  }
  for (const type of ['message', 'messageerror']) Object.defineProperty(MessagePort.prototype, `on${type}`, {
    configurable: true, enumerable: true,
    get() { return record(this).handlers.get(type) ?? null; },
    set(value) {
      const state = record(this), previous = state.handlers.get(type);
      if (previous) this.removeEventListener(type, previous);
      state.handlers.delete(type);
      if (typeof value === 'function') { state.handlers.set(type, value); this.addEventListener(type, value); if (type === 'message') this.start(); }
    },
  });
  class MessageChannel {
    constructor() {
      if (!live()) throw new realm.DOMException('The realm is disposed', 'InvalidStateError');
      const native = new NativeChannel(); channels.set(this, { port1: wrap(native.port1), port2: wrap(native.port2) });
    }
    get port1() { const pair = channels.get(this); if (!pair) throw typeError('Illegal invocation'); return pair.port1; }
    get port2() { const pair = channels.get(this); if (!pair) throw typeError('Illegal invocation'); return pair.port2; }
    get [Symbol.toStringTag]() { return 'MessageChannel'; }
  }
  Object.setPrototypeOf(MessageChannel, realm.Function.prototype); Object.setPrototypeOf(MessageChannel.prototype, I.Object.prototype);
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const work of pendingDeliveries) dropMessage(work.message); pendingDeliveries.clear();
    for (const state of [...owned]) { state.closed = true; release(state); state.native.close(); }
  }
  registerPlatformCloneRealm(realm);
  return { MessageChannel, MessagePort, prepare, receive, deliver, prepareBroadcast, broadcastBody: codec.broadcastBody, dispatchMessage, clone, discard, wrap,
    unwrap(port) { const state = record(port); if (state.detached) throw cloneError('MessagePort is detached'); return state.native; },
    isPort: value => PORTS.has(value), dispose, get size() { return owned.size; } };
}

/** Install document-owned channels plus realm-correct structuredClone. */
export function installMessaging(page, window) {
  if (INSTALLED.has(window)) return INSTALLED.get(window);
  const generation = page.documentGeneration, signal = page.documentAbort?.signal;
  const bridge = createMessagingRealm(window, {
    cloneUnknownTransfers: !page.parentFrameId,
    active: () => !page.closed && !!window.document && page.documentGeneration === generation && !signal?.aborted,
    dispatch: (target, type, data, ports) => fireAnEvent(type, implForWrapper(target), MessageEvent,
      { data, ports, origin: '', source: null, lastEventId: '', bubbles: false, cancelable: false }),
    reportError: error => page.emit?.('pageError', error),
  });
  for (const [name, value] of Object.entries({ MessageChannel: bridge.MessageChannel, MessagePort: bridge.MessagePort, structuredClone: bridge.clone })) {
    Object.defineProperty(window, name, { value, configurable: true, writable: true });
  }
  const previousClose = window.close;
  const close = function (...args) { bridge.dispose(); return previousClose.apply(this, args); };
  window.close = close;
  signal?.addEventListener('abort', () => { bridge.dispose(); if (window.close === close) window.close = previousClose; }, { once: true });
  INSTALLED.set(window, bridge); return bridge;
}
