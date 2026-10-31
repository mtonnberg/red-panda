// Private observations of successful operations on genuine Node WebStreams.
// Queue entries retain actual enqueued values until the real queue consumes them.
import * as web from 'node:stream/web';
const states = new WeakMap(), controllers = new WeakMap(), readers = new WeakMap(), sinks = new WeakMap(), writers = new WeakMap();
const locked = Object.getOwnPropertyDescriptor(web.ReadableStream.prototype, 'locked').get;
const getReader = web.ReadableStream.prototype.getReader;
const read = web.ReadableStreamDefaultReader.prototype.read;
const release = web.ReadableStreamDefaultReader.prototype.releaseLock;
const desiredSize = Object.getOwnPropertyDescriptor(web.ReadableStreamDefaultController.prototype, 'desiredSize').get;
const transformSize = Object.getOwnPropertyDescriptor(web.TransformStreamDefaultController.prototype, 'desiredSize').get;
function actualErrored(state) { const controller = state.controller?.deref(); return !!controller && (state.controllerKind === 'TransformStreamDefaultController' ? transformSize : desiredSize).call(controller) === null; }
function failActual(state) { if (actualErrored(state)) failReadable(state); }
function settled(state) { if (state.closed && !state.queue.length || state.errored) { for (const callback of state.completion ?? []) { try { callback(); } catch {} } state.completion?.clear(); } }
export function onReadableSettled(stream, callback) { const state = states.get(stream); if (!state) return false; (state.completion ??= new Set()).add(callback); settled(state); return true; }
export function createReadableState() { return { queue: [], closed: false, errored: false, drained: false, pending: 0, version: 0 }; }
export function bindReadable(stream, state) { states.set(stream, state); }
export function bindReadableController(controller, state, kind = 'ReadableStreamDefaultController') { controllers.set(controller, state); state.controller = new WeakRef(controller); state.controllerKind = kind; }
export function bindTransformPair(readable, writable, state) { bindReadable(readable, state); sinks.set(writable, state); }
export function failReadable(state) { if (state && (!state.closed || state.queue.length)) { state.errored = true; state.queue.length = 0; state.pending = 0; if (state.reader) state.reader.pending = 0; settled(state); } }
export function cancelReadableState(state) { state.queue.length = 0; state.closed = true; state.drained = false; state.pending = 0; state.version++; if (state.reader) state.reader.pending = 0; settled(state); }
export function isReadableSource(stream) { try { locked.call(stream); return true; } catch { return false; } }
export function readableWasDrained(stream) { return !!states.get(stream)?.drained; }
export function readableVersion(stream) { return states.get(stream)?.version; }
export function readableLocked(stream) { return locked.call(stream); }
export function noteReadableOperation(name, key, receiver, args, result) {
  if (name === 'WritableStream' && key === 'getWriter' && sinks.has(receiver)) writers.set(result, sinks.get(receiver));
  if (name === 'WritableStreamDefaultWriter' && writers.has(receiver)) {
    const state = writers.get(receiver);
    if (key === 'close') Promise.prototype.then.call(result, () => { state.closed = true; settled(state); }, () => failActual(state));
    if (key === 'write' || key === 'abort') Promise.prototype.then.call(result, undefined, () => failActual(state));
    if (key === 'releaseLock') writers.delete(receiver);
  }
  if (name === 'ReadableStreamDefaultController' || name === 'TransformStreamDefaultController') {
    const state = controllers.get(receiver); if (!state) return;
    if (key === 'enqueue') { if (state.pending) { state.pending--; if (state.reader?.pending) state.reader.pending--; } else state.queue.push(args[0]); }
    if (key === 'close' || key === 'terminate') { state.closed = true; state.pending = 0; if (state.reader) state.reader.pending = 0; settled(state); }
    if (key === 'error') failReadable(state);
  }
  if (name === 'ReadableStream') {
    const state = states.get(receiver); if (!state) return;
    if (key === 'getReader') { const binding = { state, released: false, pending: 0 }; readers.set(result, binding); state.reader = binding; }
    if (key === 'cancel' && !locked.call(receiver)) cancelReadableState(state);
    // Node's native tee/pipe machinery bypasses the public reader methods.
    // Stop claiming a synchronous mirror rather than reusing stale queue data.
    if (['tee', 'pipeThrough', 'pipeTo', Symbol.asyncIterator].includes(key)) state.untracked = true;
  }
  if (name === 'ReadableStreamDefaultReader') {
    const binding = readers.get(receiver); if (!binding || binding.released) return;
    const { state } = binding;
    if (key === 'read') { state.version++; if (state.queue.length) state.queue.shift(); else if (!state.closed && !state.errored) { state.pending++; binding.pending++; } settled(state); }
    if (key === 'cancel') { cancelReadableState(state); binding.pending = 0; binding.released = true; state.reader = null; }
    if (key === 'releaseLock') { state.pending -= binding.pending; binding.pending = 0; binding.released = true; state.reader = null; }
  }
}
export function drainReadableSource(stream, convertChunk, { keepLock = false } = {}) {
  const state = states.get(stream);
  if (!state || state.untracked || !state.closed || state.errored || state.drained || locked.call(stream)) return null;
  const controller = state.controller?.deref();
  // The genuine native getter also observes errors raised by rejected source
  // promises, without attaching handlers or rereading authored then getters.
  if (controller && (state.controllerKind === 'TransformStreamDefaultController' ? transformSize : desiredSize).call(controller) === null) return null;
  // Conversion must succeed for every actual queued chunk before disturbing or
  // locking anything, as observed for invalid native stream body values.
  let chunks;
  try { chunks = state.queue.map(convertChunk); } catch { return null; }
  if (chunks.some(chunk => chunk === null)) return null;
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0), bytes = new Uint8Array(length);
  let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const reader = getReader.call(stream);
  // A closed, unlocked queue has no pending reads. Each genuine read removes
  // one queued value synchronously; the last observes its real closed state.
  for (let index = 0; index <= state.queue.length; index++) read.call(reader).catch(() => {});
  state.queue.length = 0; state.pending = 0; state.drained = true; settled(state);
  if (!keepLock) release.call(reader);
  return { bytes, version: state.version };
}
export function lockDrainedReadable(stream, expectedVersion) {
  const state = states.get(stream);
  if (!state || state.version !== expectedVersion || locked.call(stream)) return false;
  const reader = getReader.call(stream); read.call(reader).catch(() => {}); return true;
}
