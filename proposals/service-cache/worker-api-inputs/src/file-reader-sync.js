import { Worker, isMainThread } from 'node:worker_threads';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), MIMEType = require('whatwg-mimetype');
const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get;
const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type').get;

/** Dedicated-worker-only FileReaderSync with genuine public Blob byte reads.
 * Limits are explicit: at most 8MiB per read and 5s helper completion by default.
 * No Node private Blob fields or symbols are inspected.
 */
export function installFileReaderSync(realm, { evaluate, maxBytes = 8 * 1024 * 1024, timeoutMs = 5000 } = {}) {
  if (isMainThread) throw new Error('FileReaderSync is only installed in a dedicated worker thread');
  if (typeof evaluate !== 'function') throw new TypeError('The actual worker evaluator is required');
  const read = blob => {
    let size, type;
    try { size = Reflect.apply(blobSize, blob, []); type = Reflect.apply(blobType, blob, []); }
    catch { return { error: 'TypeError', message: 'invalid argument' }; }
    if (size > maxBytes) return { error: 'NotReadableError', message: `Blob exceeds the ${maxBytes}-byte synchronous reader limit` };
    const shared = new SharedArrayBuffer(size + 8), state = new Int32Array(shared, 0, 2);
    let helper;
    try {
      helper = new Worker(new URL('./file-reader-sync-thread.js', import.meta.url), { workerData: { blob, shared }, execArgv: [] });
      helper.on('error', () => {}); helper.unref();
      const waited = Atomics.wait(state, 0, 0, timeoutMs), status = Atomics.load(state, 0);
      if (waited === 'timed-out' || status !== 1) return { error: 'NotReadableError', message: 'Synchronous Blob read did not complete' };
      return { bytes: new Uint8Array(shared, 8, Atomics.load(state, 1)).slice(), type };
    } catch { return { error: 'NotReadableError', message: 'Cannot clone Blob into the reader thread' }; }
    finally { if (helper) void helper.terminate(); }
  };
  const decode = (bytes, type, encoding) => {
    let charset;
    // File API BOM sniffing precedes the explicit label and MIME charset.
    if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)charset='utf-8';
    else if(bytes[0]===0xff&&bytes[1]===0xfe)charset='utf-16le';
    else if(bytes[0]===0xfe&&bytes[1]===0xff)charset='utf-16be';
    if(!charset)try { charset = new TextDecoder(String(encoding)).encoding; } catch {}
    if (!charset) { try { charset = new MIMEType(type).parameters.get('charset'); new TextDecoder(charset); } catch { charset = undefined; } }
    try { return new TextDecoder(charset || 'utf-8').decode(bytes); }
    catch { return new TextDecoder().decode(bytes); }
  };
  const factory = evaluate(`(bridge => {
    const readers = new WeakSet();
    const data = (reader,blob) => {
      if(!readers.has(reader))throw new TypeError('Illegal invocation');
      const result=bridge.read(blob);
      if(result.error){if(result.error==='TypeError')throw new TypeError(result.message);throw new DOMException(result.message,result.error)}
      return result;
    };
    class FileReaderSync {
      constructor(){readers.add(this)}
      readAsArrayBuffer(blob){const result=data(this,blob),bytes=new Uint8Array(result.bytes.length);bytes.set(result.bytes);return bytes.buffer}
      readAsText(blob,encoding){const result=data(this,blob);return bridge.decode(result.bytes,result.type,encoding)}
      readAsBinaryString(blob){const result=data(this,blob);return bridge.binary(result.bytes)}
      readAsDataURL(blob){const result=data(this,blob);return 'data:'+(result.type||'application/octet-stream')+';base64,'+bridge.base64(result.bytes)}
      get [Symbol.toStringTag](){return 'FileReaderSync'}
    }
    return FileReaderSync;
  })`);
  const Constructor = factory({ read, decode,
    binary(bytes) { let text = ''; for (let offset = 0; offset < bytes.length; offset += 4096) text += String.fromCharCode(...bytes.subarray(offset, offset + 4096)); return text; },
    base64: bytes => Buffer.from(bytes).toString('base64'),
  });
  Object.defineProperty(realm, 'FileReaderSync', { value: Constructor, configurable: true, writable: true });
  return Constructor;
}
