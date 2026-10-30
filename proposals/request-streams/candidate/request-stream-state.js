// Private observations of successful operations on genuine Node WebStreams.
// Queue entries retain actual enqueued values until the real queue consumes them.
import * as web from 'node:stream/web';
const states = new WeakMap(), controllers = new WeakMap(), readers = new WeakMap();
const locked = Object.getOwnPropertyDescriptor(web.ReadableStream.prototype, 'locked').get;
const getReader = web.ReadableStream.prototype.getReader;
const read = web.ReadableStreamDefaultReader.prototype.read;
const release = web.ReadableStreamDefaultReader.prototype.releaseLock;
const desiredSize = Object.getOwnPropertyDescriptor(web.ReadableStreamDefaultController.prototype, 'desiredSize').get;
export function createReadableState() { return { queue: [], closed: false, errored: false, drained: false, pending: 0, version: 0 }; }
export function bindReadable(stream, state) { states.set(stream, state); }
export function bindReadableController(controller, state) { controllers.set(controller, state); state.controller = new WeakRef(controller); }
export function failReadable(state) { if (state && (!state.closed || state.queue.length)) { state.errored = true; state.queue.length = 0; state.pending = 0; if (state.reader) state.reader.pending = 0; } }
export function isReadableSource(stream) { try { locked.call(stream); return true; } catch { return false; } }
export function readableWasDrained(stream) { return !!states.get(stream)?.drained; }
export function readableVersion(stream) { return states.get(stream)?.version; }
export function readableLocked(stream) { return locked.call(stream); }
export function noteReadableOperation(name, key, receiver, args, result) {
  if (name === 'ReadableStreamDefaultController') {
    const state = controllers.get(receiver); if (!state) return;
    if (key === 'enqueue') { if (state.pending) { state.pending--; if (state.reader?.pending) state.reader.pending--; } else state.queue.push(args[0]); }
    if (key === 'close') { state.closed = true; state.pending = 0; if (state.reader) state.reader.pending = 0; }
    if (key === 'error') failReadable(state);
  }
  if (name === 'ReadableStream') {
    const state = states.get(receiver); if (!state) return;
    if (key === 'getReader') { const binding = { state, released: false, pending: 0 }; readers.set(result, binding); state.reader = binding; }
    if (key === 'cancel' && !locked.call(receiver)) { state.queue.length = 0; state.closed = true; state.drained = false; state.version++; }
    // Node's native tee/pipe machinery bypasses the public reader methods.
    // Stop claiming a synchronous mirror rather than reusing stale queue data.
    if (['tee', 'pipeThrough', 'pipeTo', Symbol.asyncIterator].includes(key)) state.untracked = true;
  }
  if (name === 'ReadableStreamDefaultReader') {
    const binding = readers.get(receiver); if (!binding || binding.released) return;
    const { state } = binding;
    if (key === 'read') { state.version++; if (state.queue.length) state.queue.shift(); else if (!state.closed && !state.errored) { state.pending++; binding.pending++; } }
    if (key === 'cancel') { state.version++; state.queue.length = 0; state.closed = true; state.drained = false; state.pending = 0; binding.pending = 0; binding.released = true; state.reader = null; }
    if (key === 'releaseLock') { state.pending -= binding.pending; binding.pending = 0; binding.released = true; state.reader = null; }
  }
}
export function drainReadableSource(stream, convertChunk, { keepLock = false } = {}) {
  const state = states.get(stream);
  if (!state || state.untracked || !state.closed || state.errored || state.drained || locked.call(stream)) return null;
  const controller = state.controller?.deref();
  // The genuine native getter also observes errors raised by rejected source
  // promises, without attaching handlers or rereading authored then getters.
  if (controller && desiredSize.call(controller) === null) return null;
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
  state.queue.length = 0; state.pending = 0; state.drained = true;
  if (!keepLock) release.call(reader);
  return { bytes, version: state.version };
}
export function lockDrainedReadable(stream, expectedVersion) {
  const state = states.get(stream);
  if (!state || state.version !== expectedVersion || locked.call(stream)) return false;
  const reader = getReader.call(stream); read.call(reader).catch(() => {}); return true;
}
