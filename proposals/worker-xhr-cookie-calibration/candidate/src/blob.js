import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BlobIDL = require('jsdom/lib/jsdom/living/generated/Blob.js');
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const installed = new WeakSet();
const setBytes = Uint8Array.prototype.set;

// Immutable Blob/File data is independent of a live document or FileReader.
// Every read produces a real copy in the owning realm.
export function installBlobReads(window) {
  if (installed.has(window)) return;
  installed.add(window);
  const Promise = window.Promise, Bytes = window.Uint8Array, TypeError = window.TypeError;
  const Readable = window.ReadableStream ?? globalThis.ReadableStream;
  const snapshot = value => {
    if (!BlobIDL.is(value)) throw new TypeError('Illegal invocation');
    return Buffer.from(implForWrapper(value)._buffer);
  };
  const copy = data => { const bytes = new Bytes(data.length); setBytes.call(bytes, data); return bytes; };
  for (const kind of ['text', 'arrayBuffer', 'bytes']) {
    Object.defineProperty(window.Blob.prototype, kind, { configurable: true, writable: true,
      value: function () {
        return new Promise(resolve => {
          const data = snapshot(this);
          resolve(kind === 'text' ? new TextDecoder().decode(data) : kind === 'bytes' ? copy(data) : copy(data).buffer);
        });
      },
    });
  }
  Object.defineProperty(window.Blob.prototype, 'stream', { configurable: true, writable: true,
    value: function () {
      const data = snapshot(this); let offset = 0;
      return new Readable({ pull(controller) {
        if (offset === data.length) { controller.close(); return; }
        const end = Math.min(data.length, offset + 65536);
        controller.enqueue(copy(data.subarray(offset, end))); offset = end;
      } });
    },
  });
}
