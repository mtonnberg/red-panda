import { createReadableState, bindReadable, bindReadableController, cancelReadableState, noteReadableOperation } from './request-stream-state.js';
import * as web from 'node:stream/web';
import * as zlib from 'node:zlib';
import { types } from 'node:util';

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const viewGetters = prototype => Object.fromEntries(['buffer', 'byteOffset', 'byteLength'].map(key => [key, Object.getOwnPropertyDescriptor(prototype, key).get]));
const typedArrayGetters = viewGetters(typedArrayPrototype), dataViewGetters = viewGetters(DataView.prototype);

// An independent streaming adapter over Node's real zlib/Brotli engines. A
// separate readable/writable pair preserves the measured cancellation behavior.
export function codecPair({ realm, format, decompress }) {
  let readableController, writableController, failure, failed = false, cancelled = false;
  const readableState = createReadableState();
  let gzipHeader = Buffer.alloc(0), headerDone = !(decompress && format === 'gzip');
  let trailer = Buffer.alloc(0), crc = 0, size = 0, ended = false;
  const inflight = new Set();
  const factories = decompress
    ? { gzip: zlib.createInflateRaw, deflate: zlib.createInflate, 'deflate-raw': zlib.createInflateRaw, brotli: zlib.createBrotliDecompress }
    : { gzip: zlib.createGzip, deflate: zlib.createDeflate, 'deflate-raw': zlib.createDeflateRaw, brotli: zlib.createBrotliCompress };
  const engine = factories[format](format === 'brotli' && !decompress ? {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 },
  } : undefined);
  function fail(error) {
    if (!failed) {
      failed = true;
      failure = error instanceof realm.TypeError ? error : new realm.TypeError(error?.message ?? String(error));
      if (!cancelled) { try { readableController.error(failure); noteReadableOperation('ReadableStreamDefaultController', 'error', readableController, [failure]); } catch {} }
      try { writableController.error(failure); } catch {}
      for (const reject of inflight) reject(failure);
      inflight.clear();
      engine.destroy();
    }
    return failure;
  }
  function bytes(chunk) {
    if (!ArrayBuffer.isView(chunk) && !types.isAnyArrayBuffer(chunk)) {
      throw new realm.TypeError('Chunk is not an ArrayBuffer or ArrayBufferView');
    }
    // Copy before exposing any output/result object to user promise assimilation.
    if (!ArrayBuffer.isView(chunk)) return Buffer.from(new Uint8Array(chunk));
    const getters = types.isDataView(chunk) ? dataViewGetters : typedArrayGetters;
    return Buffer.from(new Uint8Array(Reflect.apply(getters.buffer, chunk, []),
      Reflect.apply(getters.byteOffset, chunk, []), Reflect.apply(getters.byteLength, chunk, [])));
  }
  function stripHeader(input) {
    if (headerDone) return input;
    gzipHeader = Buffer.concat([gzipHeader, input]);
    const h = gzipHeader;
    if (h.length >= 2 && (h[0] !== 31 || h[1] !== 139)) throw new realm.TypeError('Invalid gzip header');
    if (h.length >= 3 && h[2] !== 8) throw new realm.TypeError('Invalid gzip compression method');
    if (h.length < 10) return Buffer.alloc(0);
    const flags = h[3];
    if (flags & 0xe0) throw new realm.TypeError('Invalid gzip flags');
    let offset = 10;
    if (flags & 4) {
      if (h.length < offset + 2) return Buffer.alloc(0);
      const length = h.readUInt16LE(offset); offset += 2;
      if (h.length < offset + length) return Buffer.alloc(0);
      offset += length;
    }
    for (const flag of [8, 16]) if (flags & flag) {
      const end = h.indexOf(0, offset);
      if (end === -1) return Buffer.alloc(0);
      offset = end + 1;
    }
    if (flags & 2) {
      if (h.length < offset + 2) return Buffer.alloc(0);
      if ((zlib.crc32(h.subarray(0, offset)) & 0xffff) !== h.readUInt16LE(offset)) throw new realm.TypeError('Invalid gzip header checksum');
      offset += 2;
    }
    headerDone = true; gzipHeader = Buffer.alloc(0);
    return h.subarray(offset);
  }
  function extra(input) {
    if (!input.length) return;
    if (format !== 'gzip') throw new realm.TypeError('Trailing compressed data');
    trailer = Buffer.concat([trailer, input]);
    if (trailer.length > 8) throw new realm.TypeError('Trailing compressed data');
    if (trailer.length === 8 && (trailer.readUInt32LE(0) !== crc || trailer.readUInt32LE(4) !== size)) {
      throw new realm.TypeError('Invalid gzip checksum or size');
    }
  }
  engine.on('data', chunk => {
    if (failed || chunk.length === 0) return;
    if (decompress && format === 'gzip') { crc = zlib.crc32(chunk, crc); size = (size + chunk.length) >>> 0; }
    try {
      if (cancelled) throw new realm.TypeError('The readable side is closed');
      const output = new realm.Uint8Array(chunk.length); output.set(chunk);
      readableController.enqueue(output); noteReadableOperation('ReadableStreamDefaultController', 'enqueue', readableController, [output]);
    } catch (error) { fail(error); }
  });
  engine.on('error', error => fail(error));
  engine.on('end', () => { ended = true; });
  const readable = new web.ReadableStream({
    start(controller) { readableController = controller; bindReadableController(controller, readableState); },
    cancel() { cancelled = true; cancelReadableState(readableState); },
  });
  bindReadable(readable, readableState);
  const writable = new web.WritableStream({
    start(controller) { writableController = controller; },
    async write(chunk) {
      if (failed) throw failure;
      try {
        let input = bytes(chunk);
        if (decompress) input = stripHeader(input);
        if (!input.length) return;
        if (ended) { extra(input); return; }
        const before = engine.bytesWritten;
        await new Promise((resolve, reject) => {
          inflight.add(reject);
          engine.write(input, error => {
            inflight.delete(reject);
            if (error || failed) reject(failed ? failure : fail(error)); else resolve();
          });
        });
        if (failed) throw failure;
        if (decompress) {
          const consumed = engine.bytesWritten - before;
          if (consumed < input.length) extra(input.subarray(consumed));
        }
      } catch (error) { throw fail(error); }
    },
    async close() {
      if (failed) throw failure;
      try {
        if (!headerDone) throw new realm.TypeError('Incomplete gzip header');
        if (!ended) await new Promise((resolve, reject) => {
          inflight.add(reject);
          const complete = () => { inflight.delete(reject); resolve(); };
          engine.once('end', complete);
          engine.end();
        });
        if (failed) throw failure;
        if (decompress && format === 'gzip' && trailer.length !== 8) throw new realm.TypeError('Incomplete gzip trailer');
        if (!cancelled) { readableController.close(); noteReadableOperation('ReadableStreamDefaultController', 'close', readableController, []); }
      } catch (error) { throw fail(error); }
      finally { engine.destroy(); }
    },
    abort(reason) { dispose(reason); },
  });
  function dispose(reason) {
    if (failed) return;
    failed = true; failure = reason;
    if (!cancelled) { try { readableController.error(reason); noteReadableOperation('ReadableStreamDefaultController', 'error', readableController, [reason]); } catch {} }
    try { writableController.error(reason); } catch {}
    for (const reject of inflight) reject(reason);
    inflight.clear(); engine.destroy();
  }
  return { readable, writable, dispose };
}
