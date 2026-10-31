import {registerHeapWrapper} from './heap-registry.js';
import { createReadableState, bindReadable, bindTransformPair, bindReadableController, failReadable, noteReadableOperation } from './request-stream-state.js';
import * as web from 'node:stream/web';
import { TextEncoder, TextDecoder } from 'node:util';
import { codecPair } from './stream-codecs.js';

const NATIVES = { ...web, TextEncoder, TextDecoder };
const SURFACE = {
  ReadableStream: ['cancel', 'getReader', 'pipeThrough', 'pipeTo', 'locked', Symbol.asyncIterator],
  ReadableStreamDefaultReader: ['read', 'cancel', 'releaseLock'],
  ReadableStreamDefaultController: ['enqueue', 'close', 'error', 'desiredSize'],
  WritableStream: ['getWriter', 'locked'],
  WritableStreamDefaultWriter: ['write', 'close', 'releaseLock', 'closed', 'ready', 'desiredSize'],
  WritableStreamDefaultController: ['error'],
  TransformStream: ['readable', 'writable'],
  TransformStreamDefaultController: ['enqueue', 'error', 'terminate'],
  ByteLengthQueuingStrategy: ['highWaterMark', 'size'],
  CountQueuingStrategy: ['highWaterMark', 'size'],
  TextEncoder: ['encode', 'encodeInto', 'encoding'],
  TextDecoder: ['decode', 'encoding', 'fatal', 'ignoreBOM'],
  TextEncoderStream: ['encoding', 'readable', 'writable'],
  TextDecoderStream: ['encoding', 'readable', 'writable', 'fatal', 'ignoreBOM'],
  CompressionStream: ['readable', 'writable'],
  DecompressionStream: ['readable', 'writable'],
};
export const STREAM_CONSTRUCTORS = Object.freeze(Object.keys(SURFACE));
const ILLEGAL = new Set(['ReadableStreamDefaultReader', 'ReadableStreamDefaultController',
  'WritableStreamDefaultWriter', 'WritableStreamDefaultController', 'TransformStreamDefaultController']);
const INSTALLED = new WeakMap();
const TEXT_ENCODERS = new WeakSet();

// WebIDL converts the first argument before validating the destination. Preserve
// authored conversion exceptions while creating conversion errors in the API realm.
function encoderString(input, TypeErrorClass) {
  const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
  if (object(input)) {
    const exotic = input[Symbol.toPrimitive];
    if (exotic !== undefined && exotic !== null) {
      if (typeof exotic !== 'function') throw new TypeErrorClass('invalid argument');
      input = Reflect.apply(exotic, input, ['string']);
      if (object(input)) throw new TypeErrorClass('invalid argument');
    } else {
      let converted = false;
      for (const key of ['toString', 'valueOf']) {
        const method = input[key];
        if (typeof method !== 'function') continue;
        const primitive = Reflect.apply(method, input, []);
        if (!object(primitive)) { input = primitive; converted = true; break; }
      }
      if (!converted) throw new TypeErrorClass('invalid argument');
    }
  }
  if (typeof input === 'symbol') throw new TypeErrorClass('invalid argument');
  return String(input);
}

/** Real Node WebStreams behind one realm's constructors, callbacks and promises.
 * installStreams(page, window) or installStreams(null, vmGlobal) must precede
 * document/worker script execution. Returned adopt(body) supplies per-realm
 * stream methods to existing Fetch bodies. The native prototype remains in the
 * chain for Node Fetch's brand checks; this is not a security boundary.
 */
export function installStreams(page, realm, { signal = page?.documentAbort?.signal } = {}) {
  if (INSTALLED.has(realm)) return INSTALLED.get(realm);
  const constructors = {}, owned = new WeakMap(), references = new Set(), pending = new Set(), functions = new WeakMap(), special = new WeakMap(), codecDisposers = new WeakMap();
  // Ownership must not keep consumed Fetch bodies, readers or controllers alive
  // for the lifetime of a long-lived document. Finalizer holdings and unregister
  // tokens contain only WeakRefs, never the stream or a closure capturing it.
  const finalization = new FinalizationRegistry(reference => references.delete(reference));
  function tag(value, name) {
    owned.set(value, name);
    registerHeapWrapper(value,realm);
    const reference = new WeakRef(value);
    references.add(reference);
    finalization.register(value, reference, reference);
  }
  let disposed = false, disposalReason;
  const convertedErrors = new WeakMap();
  const functionInRealm = invoke => realm.Function('invoke', 'return function (...args) { return invoke(this, args); }')(invoke);
  const errorInRealm = error => {
    if (!error || typeof error !== 'object' || error instanceof realm.Error || (realm.DOMException && error instanceof realm.DOMException)) return error;
    if (convertedErrors.has(error)) return convertedErrors.get(error);
    if (error instanceof globalThis.DOMException && realm.DOMException) {
      const converted = new realm.DOMException(error.message, error.name);
      convertedErrors.set(error, converted); return converted;
    }
    if (error instanceof Error) {
      const ErrorClass = ['TypeError', 'RangeError', 'SyntaxError', 'Error'].includes(error.name) ? realm[error.name] : realm.Error;
      const messages = {
        'Invalid state: Writer is not bound to a WritableStream': 'Writer has been released',
        'Invalid state: Writer has been released': 'Writer has been released',
        'Invalid state: WritableStream is closed': 'Stream is not writable',
        'Invalid state: The reader is not attached to a stream': 'Reader has been released',
        'Invalid state: The ReadableStream is locked': 'ReadableStream is locked',
      };
      const converted = new ErrorClass(error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA' ? 'The encoded data is not valid' : messages[error.message] ?? error.message);
      converted.name = error.name; convertedErrors.set(error, converted); return converted;
    }
    return error;
  };
  const assertActive = () => { if (disposed) throw disposalReason; };
  function nativeName(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    if (owned.has(value)) return owned.get(value);
    for (const name of STREAM_CONSTRUCTORS) if (value instanceof NATIVES[name]) return name;
    return undefined;
  }
  function adopt(value) {
    const name = nativeName(value);
    if (name && !owned.has(value)) {
      Object.setPrototypeOf(value, constructors[name].prototype); tag(value, name);
    }
    return value;
  }
  function converted(value, record = false) {
    if (nativeName(value)) return adopt(value);
    if (ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]' && !(value instanceof realm.Uint8Array)) {
      const copy = new realm.Uint8Array(value.byteLength); copy.set(value); return copy;
    }
    if (record && value && typeof value === 'object') {
      const result = new realm.Object();
      for (const key of Object.keys(value)) result[key] = converted(value[key]);
      return result;
    }
    return value;
  }
  function wrapResult(value, record = false) {
    if (value instanceof Promise) return new realm.Promise((resolve, reject) => {
      const item = { reject }; pending.add(item);
      value.then(result => { if (pending.delete(item)) resolve(converted(result, record)); },
        error => { if (pending.delete(item)) reject(errorInRealm(error)); });
    });
    return converted(value, record);
  }
  function callbackDictionary(value, names, ignoreByteType = false, readableState, controllerKind = 'ReadableStreamDefaultController') {
    if (value === null || !['object', 'function'].includes(typeof value)) return value;
    // Keep property access/getter order with Node's WebIDL converter: callbacks
    // are read when its implementation reads the corresponding dictionary key.
    return new Proxy(Object(value), { get(target, key) {
      if (ignoreByteType && key === 'type') return undefined;
      const callback = Reflect.get(target, key, target);
      if (controllerKind === 'TransformStreamDefaultController' && key === 'transform' && callback === undefined) return (chunk, controller) => { bindReadableController(controller, readableState, controllerKind); const result = web.TransformStreamDefaultController.prototype.enqueue.call(controller, chunk); noteReadableOperation(controllerKind, 'enqueue', controller, [chunk], result); return result; };
      if (!names.includes(key) || typeof callback !== 'function') return callback;
      return (...args) => {
        if (!['cancel', 'abort'].includes(key)) assertActive();
        if (readableState && ['start', 'pull', 'transform', 'flush'].includes(key)) bindReadableController(key === 'transform' ? args[1] : args[0], readableState, controllerKind);
        try { return Reflect.apply(callback, value, ['cancel', 'abort'].includes(key) ? args : args.map(argument => converted(argument))); }
        catch (error) { failReadable(readableState); throw error; }
      };
    } });
  }
  function construct(name, args) {
    assertActive();
    if (ILLEGAL.has(name)) throw new realm.TypeError('Illegal Constructor');
    args = [...args];
    const readableState = ['ReadableStream', 'TransformStream'].includes(name) ? createReadableState() : null;
    if (name === 'ReadableStream') args[0] = callbackDictionary(args[0], ['start', 'pull', 'cancel'], true, readableState);
    if (name === 'WritableStream') args[0] = callbackDictionary(args[0], ['start', 'write', 'close', 'abort']);
    if (name === 'TransformStream') {
      args[0] = callbackDictionary(args[0] ?? {}, ['start', 'transform', 'flush', 'cancel'], false, readableState, 'TransformStreamDefaultController');
      // Measured target transforms do not block writes on readable queue size,
      // including an explicitly requested zero readable highWaterMark.
      args[1] = undefined; args[2] = { highWaterMark: Infinity };
    }
    if (name === 'CompressionStream' || name === 'DecompressionStream') {
      const format = String(args[0]);
      if (!['gzip', 'deflate', 'deflate-raw', 'brotli'].includes(format)) throw new realm.TypeError('invalid argument');
      const result = Object.create(constructors[name].prototype);
      const pair = codecPair({ realm, format, decompress: name === 'DecompressionStream' });
      special.set(result, pair); tag(result, name); adopt(pair.readable); adopt(pair.writable);
      codecDisposers.set(pair.readable, pair.dispose); codecDisposers.set(pair.writable, pair.dispose);
      return result;
    }
    if (name === 'TextEncoderStream') {
      // The target independently encodes each chunk; unlike Node's encoder
      // stream, it does not retain a trailing surrogate for the next chunk.
      const textState = createReadableState();
      const transform = new web.TransformStream({ start(controller) { bindReadableController(controller, textState, 'TransformStreamDefaultController'); }, transform(chunk, controller) {
        const bytes = new TextEncoder().encode(String(chunk)); controller.enqueue(bytes); noteReadableOperation('TransformStreamDefaultController', 'enqueue', controller, [bytes]);
      } }, undefined, { highWaterMark: Infinity });
      bindTransformPair(transform.readable, transform.writable, textState);
      const result = Object.create(constructors[name].prototype);
      special.set(result, { encoding: 'utf-8', readable: transform.readable, writable: transform.writable });
      tag(result, name);
      adopt(transform.readable); adopt(transform.writable);
      return result;
    }
    if (name === 'TextDecoderStream') {
      let decoder;
      try { decoder = new TextDecoder(...args); } catch (error) { throw errorInRealm(error); }
      const textState = createReadableState();
      const transform = new web.TransformStream({ start(controller) { bindReadableController(controller, textState, 'TransformStreamDefaultController'); }, transform(chunk, controller) {
        let text;
        try { text = decoder.decode(chunk, { stream: true }); }
        catch (error) { throw errorInRealm(error); }
        if (text) { controller.enqueue(text); noteReadableOperation('TransformStreamDefaultController', 'enqueue', controller, [text]); }
      }, flush(controller) {
        let text;
        try { text = decoder.decode(); } catch (error) { throw errorInRealm(error); }
        if (text) { controller.enqueue(text); noteReadableOperation('TransformStreamDefaultController', 'enqueue', controller, [text]); }
      } }, undefined, { highWaterMark: Infinity });
      bindTransformPair(transform.readable, transform.writable, textState);
      const result = Object.create(constructors[name].prototype);
      special.set(result, { encoding: decoder.encoding, fatal: decoder.fatal, ignoreBOM: decoder.ignoreBOM,
        readable: transform.readable, writable: transform.writable });
      tag(result, name); adopt(transform.readable); adopt(transform.writable); return result;
    }
    try { const result = Reflect.construct(NATIVES[name], args); if (name === 'TextEncoder') TEXT_ENCODERS.add(result);
      if (name === 'ReadableStream') bindReadable(result, readableState);
      if (name === 'TransformStream') bindTransformPair(result.readable, result.writable, readableState); return adopt(result); }
    catch (error) { throw errorInRealm(error); }
  }
  for (const name of STREAM_CONSTRUCTORS) {
    const Native = NATIVES[name];
    const Constructor = realm.Function('construct', `return function ${name}(...args) { if (!new.target) throw new TypeError("Class constructor ${name} requires 'new'"); return construct(args); }`)(args => construct(name, args));
    // Keep Node's native chain so Response(stream) recognizes genuine native
    // internal slots rather than stringifying a superficially stream-like body.
    Constructor.prototype = Object.create(Native.prototype);
    Object.defineProperty(Constructor.prototype, 'constructor', { value: Constructor, configurable: true, writable: true });
    Object.defineProperty(Constructor, Symbol.hasInstance, { value: functionInRealm((_, args) => Reflect.apply(Function.prototype[Symbol.hasInstance], Native, args)) });
    constructors[name] = Constructor;
  }
  function iteratorFor(stream, options) {
    const iterator = Reflect.apply(web.ReadableStream.prototype[Symbol.asyncIterator], stream, [options]);
    noteReadableOperation('ReadableStream', Symbol.asyncIterator, stream, [], iterator);
    const result = new realm.Object();
    for (const key of ['next', 'return', 'throw']) if (typeof iterator[key] === 'function') {
      result[key] = functionInRealm((_, args) => {
        assertActive();
        try { return wrapResult(Reflect.apply(iterator[key], iterator, args), true); }
        catch (error) { throw errorInRealm(error); }
      });
    }
    result[Symbol.asyncIterator] = functionInRealm(() => result);
    return result;
  }
  for (const [name, keys] of Object.entries(SURFACE)) {
    const Native = NATIVES[name], prototype = constructors[name].prototype;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(Native.prototype, key);
      if (key === Symbol.asyncIterator) {
        Object.defineProperty(prototype, key, { configurable: true, writable: true,
          value: functionInRealm((receiver, args) => iteratorFor(receiver, args[0])) });
      } else if (descriptor.get) {
        Object.defineProperty(prototype, key, { configurable: true, enumerable: true,
          get: functionInRealm(receiver => {
            try {
              const result = special.has(receiver) && owned.get(receiver) === name ? special.get(receiver)[key] : Reflect.apply(descriptor.get, receiver, []);
              if (key === 'size' && typeof result === 'function') {
                if (!functions.has(result)) functions.set(result, functionInRealm((thisArg, args) => {
                  try { return Reflect.apply(result, thisArg, args); } catch (error) { throw errorInRealm(error); }
                }));
                return functions.get(result);
              }
              return wrapResult(result);
            }
            catch (error) { throw errorInRealm(error); }
          }) });
      } else if (name === 'TextEncoder' && key === 'encodeInto') {
        const TypeErrorClass = realm.TypeError;
        const invoke = (receiver, source, destination, count) => {
          assertActive();
          if (!TEXT_ENCODERS.has(receiver)) throw new TypeErrorClass('Illegal invocation');
          if (count < 2) throw new TypeErrorClass('invalid argument');
          const input = encoderString(source, TypeErrorClass);
          try { return Reflect.apply(descriptor.value, receiver, [input, destination]); }
          catch (error) {
            if (error instanceof TypeError) throw new TypeErrorClass('invalid argument');
            throw errorInRealm(error);
          }
        };
        const method = realm.Function('invoke', 'return ({encodeInto(source,destination){const result=invoke(this,source,destination,arguments.length);return {read:result.read,written:result.written};}}).encodeInto;')(invoke);
        Object.defineProperty(prototype, key, {configurable:true, enumerable:true, writable:true, value:method});
      } else {
        Object.defineProperty(prototype, key, { configurable: true, enumerable: true, writable: true,
          value: functionInRealm((receiver, args) => {
            assertActive();
            try {
              const result = Reflect.apply(descriptor.value, receiver, name === 'ReadableStream' && key === 'getReader' ? [] : args);
              noteReadableOperation(name, key, receiver, args, result);
              if (name === 'ReadableStreamDefaultReader' && key === 'cancel') {
                // Native releases synchronously, even while source.cancel's
                // returned promise is still pending. Pending reads settle done.
                try { web.ReadableStreamDefaultReader.prototype.releaseLock.call(receiver); } catch {}
              }
              if (key === 'tee') return realm.Array.from(result, adopt);
              return wrapResult(result, ['read', 'encodeInto'].includes(key));
            }
            catch (error) { throw errorInRealm(error); }
          }) });
      }
    }
    // Hide Node-only extensions absent from the measured native public surface.
    for (const key of Reflect.ownKeys(Native.prototype)) {
      if (typeof key === 'string' && key !== 'constructor' && !keys.includes(key)) {
        Object.defineProperty(prototype, key, { value: undefined, configurable: true });
      }
    }
    Object.defineProperty(realm, name, { value: constructors[name], configurable: true, writable: true, enumerable: false });
  }
  function dispose(reason) {
    if (disposed) return;
    disposalReason = reason ?? (realm.DOMException ? new realm.DOMException('The stream realm is disposed', 'AbortError') : new realm.Error('The stream realm is disposed'));
    disposed = true;
    const ignore = task => { try { Promise.resolve(task()).catch(() => {}); } catch {} };
    // Hold only a synchronous disposal snapshot strongly. Ordinary operation
    // stores no strong iterable collection of stream instances.
    const live = [];
    for (const reference of references) {
      const value = reference.deref();
      if (value) live.push([value, owned.get(value)]);
      finalization.unregister(reference);
    }
    references.clear();
    for (const [value, name] of live) {
      if (codecDisposers.has(value)) ignore(() => codecDisposers.get(value)(disposalReason));
      if (name === 'ReadableStreamDefaultReader') ignore(() => web.ReadableStreamDefaultReader.prototype.cancel.call(value, disposalReason));
      if (name === 'WritableStreamDefaultWriter') ignore(() => web.WritableStreamDefaultWriter.prototype.abort.call(value, disposalReason));
      if (name === 'ReadableStream' && !Reflect.get(web.ReadableStream.prototype, 'locked', value)) ignore(() => { const result = web.ReadableStream.prototype.cancel.call(value, disposalReason); noteReadableOperation(name, 'cancel', value, [disposalReason], result); return result; });
      if (name === 'WritableStream' && !Reflect.get(web.WritableStream.prototype, 'locked', value)) ignore(() => web.WritableStream.prototype.abort.call(value, disposalReason));
    }
    for (const [value, name] of live) {
      if (['ReadableStreamDefaultController', 'TransformStreamDefaultController', 'WritableStreamDefaultController'].includes(name)) {
        ignore(() => { const result = Reflect.apply(NATIVES[name].prototype.error, value, [disposalReason]); noteReadableOperation(name, 'error', value, [disposalReason], result); return result; });
      }
    }
    for (const item of pending) item.reject(disposalReason);
    pending.clear(); signal?.removeEventListener('abort', onAbort);
  }
  const onAbort = () => dispose();
  const controller = { constructors: Object.freeze(constructors), adopt, dispose, get disposed() { return disposed; } };
  INSTALLED.set(realm, controller);
  if (signal?.aborted) dispose(); else signal?.addEventListener('abort', onAbort, { once: true });
  return controller;
}
