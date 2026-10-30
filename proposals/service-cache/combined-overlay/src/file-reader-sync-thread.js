// The caller blocks only its dedicated worker. This separate actual thread
// reads an immutable public Blob clone through Blob.arrayBuffer().
import { workerData } from 'node:worker_threads';
const state = new Int32Array(workerData.shared, 0, 2);
try {
  const bytes = new Uint8Array(await Blob.prototype.arrayBuffer.call(workerData.blob));
  const destination = new Uint8Array(workerData.shared, 8);
  if (bytes.length !== destination.length) throw new Error('Blob clone size changed');
  destination.set(bytes); Atomics.store(state, 1, bytes.length); Atomics.store(state, 0, 1);
} catch { Atomics.store(state, 0, 2); }
finally { Atomics.notify(state, 0); }
