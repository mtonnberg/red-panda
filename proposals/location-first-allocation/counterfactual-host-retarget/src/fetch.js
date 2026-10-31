import {networkDocumentURL} from './cookie-site.js';
import {registerHeapWrapper} from './heap-registry.js';
import { randomBytes } from 'node:crypto';
import { isReadableSource, readableWasDrained, readableVersion, readableLocked, drainReadableSource, lockDrainedReadable, onReadableSettled, noteReadableOperation } from './request-stream-state.js';
import { createRequire } from 'node:module';
import { types } from 'node:util';
import { installStreams } from './streams.js';
import { installAbortSignals } from './abort-signals.js';

const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const DOMBlob = require('jsdom/lib/jsdom/living/generated/Blob.js');
const DOMFormData = require('jsdom/lib/jsdom/living/generated/FormData.js');
const DOMURLSearchParams = require('whatwg-url/lib/URLSearchParams.js');
const MIMEType = require('whatwg-mimetype');
const NativeHeaders = globalThis.Headers;
const NativeRequest = globalThis.Request;
const NativeResponse = globalThis.Response;
const NativeFormData = globalThis.FormData;
const NativeBlob = globalThis.Blob;
const nativeReader = globalThis.ReadableStream.prototype.getReader;
const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
const typedOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset').get;
const viewBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer').get;
const viewLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get;
const viewOffset = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset').get;
const INSTALLED = new WeakMap(), RETIRE_REQUESTS = new WeakMap();
export function retireFetchRequests(window) { RETIRE_REQUESTS.get(window)?.(); }
const HEADER_STATE = new WeakMap(), REQUEST_STATE = new WeakMap(), RESPONSE_STATE = new WeakMap();
const FORBIDDEN = new Set(['accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt',
  'expect', 'host', 'keep-alive', 'origin', 'permissions-policy', 'referer', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'user-agent', 'via']);
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);
const REQUEST_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'PROPFIND']);
const SIMPLE_RESPONSE = new Set(['cache-control', 'content-language', 'content-length', 'content-type',
  'expires', 'last-modified', 'pragma']);

function forbidden(name, value) {
  return FORBIDDEN.has(name) || name.startsWith('proxy-') || name.startsWith('sec-') ||
    (['x-http-method', 'x-http-method-override', 'x-method-override'].includes(name) &&
      value.split(',').some(method => ['CONNECT', 'TRACE', 'TRACK'].includes(method.trim().toUpperCase())));
}
function safeHeader(name, value) {
  if (value.length > 128) return false;
  if (['accept-language', 'content-language'].includes(name)) return /^[0-9A-Za-z *,\-.;=]*$/.test(value);
  if (name === 'range') return /^bytes=\d+-\d*$/.test(value);
  if (!['accept', 'content-type'].includes(name) || /[\x00-\x08\x0a-\x1f\x7f"():<>?@[\]{}]/.test(value)) return false;
  if (name === 'accept') return true;
  try { return ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'].includes(new MIMEType(value).essence); }
  catch { return false; }
}

/** Install browser Fetch, Request, Response and Headers for one document.
 * Uses Page.fetch for all HTTP/data traffic and suppresses settlement after
 * disposal. DOM Blob/FormData snapshots use pinned jsdom's body representation;
 * no page can obtain those internal buffers. Network headers are immutable and
 * CORS-filtered. Opaque views expose neither status/URL/headers nor entity data.
 * Redirects needing another preflight or opaque-origin taint reject explicitly.
 * Stream upload bodies are extracted only after real source closure; queued
 * data and ordinary request bodies use the shared buffered transport.
 * Returns an idempotent silent disposal hook.
 */
export function installFetch(page, window) {
  if (INSTALLED.has(window)) return INSTALLED.get(window);
  const streams = installStreams(page, window);
  const abortSignals = installAbortSignals(page, window);
  const generation = page.documentGeneration;
  const documentSignal = page.documentAbort?.signal;
  const headersState = HEADER_STATE, requestState = REQUEST_STATE, responseState = RESPONSE_STATE;
  const pending = new Set();
  const bodyCleanups = new Set();
  let disposed = false, requestEpoch = 0;
  const active = () => !disposed && !page.closed && !!window.document && page.documentGeneration === generation && !documentSignal?.aborted;
  const documentOrigin = () => implForWrapper(window.document)?._origin ?? window.location.origin;
  function realmError(error) {
    if (types.isProxy(error)) return error;
    if (error !== null && ['object', 'function'].includes(typeof error) && Object.getPrototypeOf(error) === globalThis.DOMException.prototype) {
      return new window.DOMException(error.message, error.name);
    }
    if (types.isNativeError(error)) {
      let prototype = Object.getPrototypeOf(error);
      for (let depth = 0; prototype && depth < 32; depth++) {
        if (types.isProxy(prototype)) return error;
        if (prototype === globalThis.SyntaxError.prototype) return new window.SyntaxError(error.message);
        if (prototype === globalThis.RangeError.prototype) return new window.RangeError(error.message);
        if (prototype === globalThis.Error.prototype) {
          const text = error.message === 'Body is unusable: Body has already been read' ? 'Body has already been read' : error.message;
          return new window.TypeError(text);
        }
        prototype = Object.getPrototypeOf(prototype);
      }
    }
    return error;
  }
  function headerError(error) {
    if (error instanceof globalThis.TypeError) {
      if (/invalid header name/i.test(error.message)) return new window.TypeError('Invalid header name');
      if (/invalid header value/i.test(error.message)) return new window.TypeError('Invalid header value');
    }
    return realmError(error);
  }
  const promise = (task, signal) => new window.Promise((resolve, reject) => {
    Promise.resolve().then(task).then(value => { if (active()) resolve(value); }, error => {
      if (active()) reject(signal?.aborted && error === signal.reason ? signal.reason : realmError(error));
    });
  });
  const bytesInRealm = bytes => { const copy = new window.Uint8Array(bytes.byteLength); copy.set(new Uint8Array(bytes)); return copy; };
  const getHeaders = value => {
    const s = headersState.get(value);
    if (!s) throw new window.TypeError('Illegal invocation');
    return s;
  };
  const getRequest = value => {
    const s = requestState.get(value);
    if (!s) throw new window.TypeError('Illegal invocation');
    return s;
  };
  const getResponse = value => {
    const s = responseState.get(value);
    if (!s) throw new window.TypeError('Illegal invocation');
    return s;
  };
  function bodyValue(body, allowStream = false) {
    if (types.isSharedArrayBuffer(body)) throw new window.TypeError('SharedArrayBuffer bodies are not supported');
    if (DOMBlob.is(body)) {
      return new NativeBlob([new Uint8Array(implForWrapper(body)._buffer)], { type: body.type });
    }
    if (DOMFormData.is(body)) {
      const converted = new NativeFormData();
      for (const [name, value] of body) {
        if (typeof value === 'string') converted.append(name, value);
        else converted.append(name, bodyValue(value), value.name);
      }
      return converted;
    }
    if (DOMURLSearchParams.is(body)) return new URLSearchParams(body.toString());
    if (types.isArrayBuffer(body)) return body.byteLength ? new Uint8Array(body).slice() : new Uint8Array();
    if (ArrayBuffer.isView(body)) {
      const dataView = types.isDataView(body);
      const buffer = (dataView ? viewBuffer : typedBuffer).call(body);
      if (types.isSharedArrayBuffer(buffer)) throw new window.TypeError('SharedArrayBuffer bodies are not supported');
      const length = (dataView ? viewLength : typedLength).call(body);
      return length ? new Uint8Array(buffer, (dataView ? viewOffset : typedOffset).call(body), length).slice() : new Uint8Array();
    }
    return body;
  }
  function bufferedInput(body) {
    if (body == null || isReadableSource(body)) return { value: body, bytes: undefined };
    if (DOMFormData.is(body)) {
      const boundary = `----${randomBytes(10).toString('hex')}`, chunks = [];
      const quoted = value => String(value).replace(/\r\n|\r|\n/g, '\r\n').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/"/g, '%22');
      for (const [name, value] of body) {
        if (typeof value === 'string') chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${quoted(name)}"\r\n\r\n${value.replace(/\r\n|\r|\n/g, '\r\n')}\r\n`));
        else chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${quoted(name)}"; filename="${quoted(value.name ?? 'blob')}"\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`), Buffer.from(implForWrapper(value)._buffer), Buffer.from('\r\n'));
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      const bytes = Buffer.concat(chunks); return { value: new NativeBlob([bytes], { type: `multipart/form-data; boundary=${boundary}` }), bytes };
    }
    const converted = bodyValue(body);
    if (DOMBlob.is(body)) return { value: converted, bytes: Buffer.from(implForWrapper(body)._buffer) };
    if (DOMURLSearchParams.is(body)) return { value: converted, bytes: Buffer.from(converted.toString(), 'utf8') };
    if (types.isArrayBuffer(converted) || ArrayBuffer.isView(converted)) return { value: converted, bytes: Buffer.from(converted) };
    if (typeof converted === 'symbol') return { value: converted, bytes: undefined };
    const text = String(converted); return { value: text, bytes: Buffer.from(text, 'utf8') };
  }
  const bufferedFinalizer = new FinalizationRegistry(cleanup => cleanup());
  const bufferedRecord = bytes => bytes === undefined ? undefined : { bytes: Buffer.from(bytes), stream: null, version: null };
  function bufferedStream(s) {
    const record = s.bufferedBody;
    if (!record) return streams.adopt(s.raw.body);
    if (!record.stream) {
      let controller;
      const bytes = record.bytes, bodySignal = s.signal;
      record.stream = new window.ReadableStream({ start(value) { controller = value; if (bodySignal?.aborted) value.error(bodySignal.reason); else { if (bytes.length) value.enqueue(bytesInRealm(bytes)); value.close(); } } });
      record.version = readableVersion(record.stream);
      if (s.signal && !s.signal.aborted) {
        const weak = new WeakRef(controller), token = {}, signal = s.signal;
        const abort = () => { try { weak.deref()?.error(signal.reason); } catch {} };
        const cleanup = () => { signal.removeEventListener('abort', abort); bodyCleanups.delete(cleanup); bufferedFinalizer.unregister(token); };
        signal.addEventListener('abort', abort, { once: true }); bodyCleanups.add(cleanup);
        bufferedFinalizer.register(record.stream, cleanup, token); onReadableSettled(record.stream, cleanup);
      }
      controller = null;
    }
    return record.stream;
  }
  function assertBufferedBodyUsable(s) {
    if (!s.bufferedBody) return;
    if (s.signal?.aborted) throw s.signal.reason;
    if (s.raw.bodyUsed) throw new window.TypeError('Body has already been read');
    const record = s.bufferedBody;
    if (record.stream && (readableLocked(record.stream) || readableVersion(record.stream) !== record.version)) throw new window.TypeError('Body is disturbed or locked');
  }
  function lockBufferedBody(s) {
    if (!s.bufferedBody) return;
    assertBufferedBodyUsable(s);
    const stream = bufferedStream(s), record = s.bufferedBody;
    if (readableWasDrained(stream)) {
      if (!lockDrainedReadable(stream, record.version)) throw new window.TypeError('Body is disturbed or locked');
    } else if (!drainReadableSource(stream, streamChunkBytes, { keepLock: true })) throw new window.TypeError('Body is disturbed or locked');
  }

  function materializeResponseStream(s) {
    if (!s.streamBody) return;
    if (s.streamUsed) throw new window.TypeError('Body has already been read');
    const source = s.streamBody;
    if (readableLocked(source) || (readableVersion(source) ?? 0) > 0) throw new window.TypeError('Body is disturbed or locked');
    const reader = nativeReader.call(source);
    noteReadableOperation('ReadableStream', 'getReader', source, [], reader);
    s.streamUsed = true;
    let finished = false;
    const release = () => { try { globalThis.ReadableStreamDefaultReader.prototype.releaseLock.call(reader); noteReadableOperation('ReadableStreamDefaultReader', 'releaseLock', reader, []); } catch {} };
    const cleanup = () => bodyCleanups.delete(disposeBody);
    const disposeBody = () => { if (finished) return; finished = true; cleanup(); try { const result = globalThis.ReadableStreamDefaultReader.prototype.cancel.call(reader); noteReadableOperation('ReadableStreamDefaultReader', 'cancel', reader, [], result); Promise.resolve(result).catch(() => {}); } catch {} release(); };
    bodyCleanups.add(disposeBody);
    const normalized = new globalThis.ReadableStream({
      async pull(controller) {
        try {
          const reading = globalThis.ReadableStreamDefaultReader.prototype.read.call(reader);
          noteReadableOperation('ReadableStreamDefaultReader', 'read', reader, [], reading);
          const result = await reading;
          if (finished) return;
          if (result.done) { finished = true; cleanup(); controller.close(); return; }
          if (!types.isUint8Array(result.value)) throw new window.TypeError('Response body chunk is not a Uint8Array');
          controller.enqueue(bodyValue(result.value));
        } catch (error) { if (finished) return; finished = true; cleanup(); release(); controller.error(error); }
      },
      async cancel(reason) { if (finished) return; finished = true; cleanup(); try { const result = globalThis.ReadableStreamDefaultReader.prototype.cancel.call(reader, reason); noteReadableOperation('ReadableStreamDefaultReader', 'cancel', reader, [reason], result); await result; } finally { release(); } },
    }, { highWaterMark: 0 });
    s.raw = new NativeResponse(normalized, { status: s.raw.status, statusText: s.raw.statusText, headers: getHeaders(s.headers).raw });
  }

  function streamChunkBytes(chunk) {
    if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
    if (types.isArrayBuffer(chunk) || ArrayBuffer.isView(chunk)) return bodyValue(chunk);
    return null;
  }
  function extractStreamBody(s, { keepLock = false, cache = false } = {}) {
    if (s.streamUsed) throw new window.TypeError('Body has already been read');
    if (s.streamBytes) {
      if (readableLocked(s.streamBody) || readableVersion(s.streamBody) !== s.streamVersion) throw new window.TypeError('Body is disturbed or locked');
      if (keepLock && !lockDrainedReadable(s.streamBody, s.streamVersion)) throw new window.TypeError('Body is disturbed or locked');
      return s.streamBytes;
    }
    if (readableLocked(s.streamBody) && readableWasDrained(s.streamBody)) throw new window.TypeError('Body is disturbed or locked');
    const extracted = drainReadableSource(s.streamBody, streamChunkBytes, { keepLock });
    if (!extracted) throw new window.TypeError('Failed to read ReadableStream body');
    if (cache) { s.streamBytes = extracted.bytes; s.streamVersion = extracted.version; }
    return extracted.bytes;
  }
  function materializeStreamBody(s) {
    if (!s.streamBody) return;
    const bytes = extractStreamBody(s, { keepLock: true });
    s.raw = new NativeRequest(s.raw, { body: bytes, headers: getHeaders(s.headers).raw });
    s.streamUsed = true;
  }
  function fillHeaders(init, guard = 'none') {
    const result = new Headers(); headersState.get(result).guard = guard;
    let source;
    try { source = new NativeHeaders(init); } catch (error) { throw headerError(error); }
    for (const [name, value] of source) result.append(name, value);
    return result;
  }
  function wrapHeaders(raw, guard) {
    const result = Object.create(Headers.prototype);
    headersState.set(result, { raw, guard }); return registerHeapWrapper(result,window);
  }
  class Headers {
    constructor(init) {
      try { headersState.set(this, { raw: new NativeHeaders(init), guard: 'none' }); registerHeapWrapper(this,window); }
      catch (error) { throw headerError(error); }
    }
    append(name, value) { if (arguments.length < 2) throw new window.TypeError('append requires two arguments'); this._change('append', name, value); }
    set(name, value) { if (arguments.length < 2) throw new window.TypeError('set requires two arguments'); this._change('set', name, value); }
    delete(name) { if (!arguments.length) throw new window.TypeError('delete requires a name'); this._change('delete', name); }
    _change(operation, name, value) {
      const s = getHeaders(this);
      if (s.guard === 'immutable') throw new window.TypeError('Headers are immutable');
      let checked;
      try {
        checked = new NativeHeaders();
        if (operation === 'delete') { checked.set(name, ''); value = ''; }
        else checked.set(name, value);
        name = [...checked.keys()][0]; value = checked.get(name);
      } catch (error) { throw headerError(error); }
      if (['request', 'request-no-cors'].includes(s.guard) && forbidden(name, value)) return;
      if (s.guard === 'response' && ['set-cookie', 'set-cookie2'].includes(name)) return;
      const combined = operation === 'append' && s.raw.has(name) ? `${s.raw.get(name)}, ${value}` : value;
      if (s.guard === 'request-no-cors' && (operation === 'delete'
        ? !['accept', 'accept-language', 'content-language', 'content-type', 'range'].includes(name)
        : !['accept', 'accept-language', 'content-language', 'content-type'].includes(name) || !safeHeader(name, combined))) return;
      if (operation === 'delete') s.raw.delete(name); else s.raw[operation](name, value);
    }
    get(name) { if (!arguments.length) throw new window.TypeError('get requires a name'); try { return getHeaders(this).raw.get(name); } catch (error) { throw realmError(error); } }
    has(name) { if (!arguments.length) throw new window.TypeError('has requires a name'); try { return getHeaders(this).raw.has(name); } catch (error) { throw realmError(error); } }
    getSetCookie() { return window.Array.from(getHeaders(this).raw.getSetCookie()); }
    *entries() { for (const [name, value] of getHeaders(this).raw) yield window.Array.of(name, value); }
    *keys() { yield* getHeaders(this).raw.keys(); }
    *values() { yield* getHeaders(this).raw.values(); }
    forEach(callback, thisArg) {
      if (typeof callback !== 'function') throw new window.TypeError('Callback is not a function');
      for (const [name, value] of getHeaders(this).raw) callback.call(thisArg, value, name, this);
    }
    [Symbol.iterator]() { return this.entries(); }
    get [Symbol.toStringTag]() { return 'Headers'; }
  }
  function consume(owner, kind, isResponse) {
    const s = isResponse ? getResponse(owner) : getRequest(owner);
    const read = kind === 'json' ? 'text' : ['bytes', 'formData'].includes(kind) ? 'arrayBuffer' : kind;
    let reading;
    try { if (isResponse) materializeResponseStream(s); lockBufferedBody(s); if (!isResponse) materializeStreamBody(s); reading = s.raw[read](); } catch (error) { reading = Promise.reject(error); }
    return promise(async () => {
      if (kind === 'json') return window.JSON.parse(await reading);
      if (kind === 'arrayBuffer' || kind === 'bytes') {
        const array = bytesInRealm(await reading); return kind === 'bytes' ? array : array.buffer;
      }
      if (kind === 'blob') {
        const blob = await reading; return new window.Blob([bytesInRealm(await blob.arrayBuffer()).buffer], { type: blob.type });
      }
      if (kind === 'formData') {
        return parseFormData(Buffer.from(await reading), s.raw.headers.get('content-type'));
      }
      return reading;
    }, s.signal);
  }
  function parseFormData(bytes, contentType) {
    let mime;
    try { mime = new MIMEType(contentType); } catch { throw new window.TypeError('Unsupported form data Content-Type'); }
    const result = new window.FormData();
    if (mime.essence === 'application/x-www-form-urlencoded') {
      for (const [name, value] of new URLSearchParams(bytes.toString('utf8'))) result.append(name, value);
      return result;
    }
    const boundary = mime.parameters.get('boundary');
    if (mime.essence !== 'multipart/form-data' || !boundary || /[\r\n]/.test(boundary)) throw new window.TypeError('Invalid form data boundary');
    const delimiter = Buffer.from(`--${boundary}`), separator = Buffer.from(`\r\n--${boundary}`);
    let cursor = bytes.indexOf(delimiter);
    const invalid = () => { throw new window.TypeError('Invalid multipart form data'); };
    if (cursor < 0 || (cursor && !bytes.subarray(cursor - 2, cursor).equals(Buffer.from('\r\n')))) invalid();
    while (true) {
      cursor += delimiter.length;
      if (bytes.subarray(cursor, cursor + 2).equals(Buffer.from('--'))) return result;
      if (!bytes.subarray(cursor, cursor + 2).equals(Buffer.from('\r\n'))) invalid();
      cursor += 2;
      const end = bytes.indexOf('\r\n\r\n', cursor); if (end < 0) invalid();
      const headers = new Map();
      for (const line of bytes.subarray(cursor, end).toString('latin1').split('\r\n')) {
        const colon = line.indexOf(':'); if (colon < 1) invalid();
        headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
      }
      const start = end + 4;
      let next = bytes.indexOf(separator, start);
      while (next >= 0) {
        const suffix = bytes.subarray(next + separator.length, next + separator.length + 2).toString('ascii');
        if (suffix === '--' || suffix === '\r\n') break;
        next = bytes.indexOf(separator, next + separator.length);
      }
      if (next < 0) invalid();
      let disposition;
      try { disposition = new MIMEType(`x/${headers.get('content-disposition')}`); } catch { invalid(); }
      if (disposition.essence !== 'x/form-data' || !disposition.parameters.has('name')) invalid();
      const decode = value => Buffer.from(value, 'latin1').toString('utf8');
      const name = decode(disposition.parameters.get('name')), part = bytes.subarray(start, next);
      if (disposition.parameters.has('filename')) {
        result.append(name, new window.File([bytesInRealm(part).buffer], decode(disposition.parameters.get('filename')),
          { type: headers.get('content-type') ?? 'application/octet-stream' }));
      } else result.append(name, part.toString('utf8'));
      cursor = next + 2;
    }
  }
  function wrapRequest(raw, bufferedBytes, signal = null) {
    const request = Object.create(Request.prototype);
    const headers = fillHeaders(raw.headers, raw.mode === 'no-cors' ? 'request-no-cors' : 'request');
    for (const name of [...raw.headers.keys()]) raw.headers.delete(name);
    for (const [name, value] of headers) raw.headers.set(name, value);
    requestState.set(request, { raw, publicSignal: signal, bufferedBody: bufferedRecord(bufferedBytes), headers: wrapHeaders(raw.headers, raw.mode === 'no-cors' ? 'request-no-cors' : 'request') });
    return registerHeapWrapper(request,window);
  }
  class Request {
    constructor(input, init = {}) {
      if (arguments.length === 0) throw new window.TypeError('Request requires an input');
      init ??= {};
      try {
        const sourceState = requestState.get(input);
        const source = sourceState?.raw ?? (input instanceof NativeRequest ? input : new URL(String(input), window.document.baseURI).href);
        const mode = init.mode ?? (source instanceof NativeRequest ? source.mode : 'cors');
        const guarded = fillHeaders(init.headers ?? (source instanceof NativeRequest ? source.headers : undefined), mode === 'no-cors' ? 'request-no-cors' : 'request');
        const prepared = {};
        for (const key of Reflect.ownKeys(Object(init))) if (key !== 'duplex' && key !== 'signal' && Object.prototype.propertyIsEnumerable.call(init, key)) prepared[key] = init[key];
        const requestedSignal = init.signal;
        const publicSignal = requestedSignal == null ? sourceState?.publicSignal ?? null : abortSignals.validate(requestedSignal);
        prepared.signal = publicSignal === null ? null : abortSignals.native(publicSignal);
        prepared.headers = getHeaders(guarded).raw;
        if (prepared.method !== undefined) {
          if (typeof prepared.method === 'symbol') throw new window.TypeError('Cannot convert a Symbol value to a string');
          prepared.method = String(prepared.method).toUpperCase();
          if (!REQUEST_METHODS.has(prepared.method)) throw new window.TypeError();
        }
        if (mode === 'no-cors' && !SIMPLE_METHODS.has(prepared.method ?? (source instanceof NativeRequest ? source.method : 'GET'))) {
          throw new window.TypeError(`'${prepared.method ?? source.method}' is unsupported in no-cors mode`);
        }
        let streamBody = sourceState?.streamBody;
        let bufferedBytes = streamBody ? undefined : sourceState?.bufferedBody?.bytes;
        if (Object.hasOwn(init, 'body')) {
          if (prepared.body != null && isReadableSource(prepared.body)) { streamBody = prepared.body; prepared.body = null; }
          else { if (prepared.body != null) { streamBody = undefined; const body = bufferedInput(prepared.body); prepared.body = body.value; bufferedBytes = body.bytes; } }
        }
        if (!streamBody && bufferedBytes !== undefined && prepared.body == null) { assertBufferedBodyUsable(sourceState); prepared.body = new Uint8Array(bufferedBytes); }
        if (streamBody && ['GET', 'HEAD'].includes(prepared.method ?? (source instanceof NativeRequest ? source.method : 'GET'))) throw new window.TypeError('Request with GET/HEAD method cannot have body.');
        if (prepared.referrer && prepared.referrer !== 'about:client') prepared.referrer = new URL(String(prepared.referrer), window.document.baseURI).href;
        const wrapped = wrapRequest(new NativeRequest(source, prepared), bufferedBytes, publicSignal);
        const state = requestState.get(wrapped);
        if (streamBody) { state.streamBody = streamBody; state.streamUsed = false; if (streamBody === sourceState?.streamBody && sourceState.streamBytes) { state.streamBytes = sourceState.streamBytes; state.streamVersion = sourceState.streamVersion; } }
        requestState.set(this, state); registerHeapWrapper(this,window);
      } catch (error) { throw realmError(error); }
    }
    clone() {
      try {
        const s = getRequest(this);
        if (s.streamBody) { const bytes = extractStreamBody(s, { cache: true }); return wrapRequest(new NativeRequest(s.raw, { body: bytes, headers: getHeaders(s.headers).raw }), bytes, s.publicSignal); }
        assertBufferedBodyUsable(s);
        return wrapRequest(s.raw.clone(), s.bufferedBody?.bytes, s.publicSignal);
      } catch (error) { throw realmError(error); }
    }
    get headers() { return getRequest(this).headers; }
    get body() { const s = getRequest(this); return s.streamBody ?? bufferedStream(s); }
    get bodyUsed() { const s = getRequest(this); return s.streamBody ? s.streamUsed : s.raw.bodyUsed; }
    get [Symbol.toStringTag]() { return 'Request'; }
  }
  for (const name of ['url', 'method', 'mode', 'credentials', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive', 'destination', 'duplex']) {
    Object.defineProperty(Request.prototype, name, { configurable: true, enumerable: true, get() { return getRequest(this).raw[name]; } });
  }
  Object.defineProperty(Request.prototype, 'signal', { configurable: true, enumerable: true, get() { return getRequest(this).publicSignal; } });
  function wrapResponse(raw, view = {}) {
    const response = Object.create(Response.prototype);
    const { bufferedBytes, ...metadata } = view;
    responseState.set(response, { raw, ...metadata, bufferedBody: bufferedRecord(bufferedBytes), headers: wrapHeaders(view.headers ?? raw.headers, view.guard ?? 'immutable') });
    return registerHeapWrapper(response,window);
  }
  function abortableBody(raw, signal) {
    if (!raw.body) return raw;
    const source = raw.body;
    let reader, controller, finished = false;
    const cleanup = () => { signal.removeEventListener('abort', abort); bodyCleanups.delete(disposeBody); };
    const cancelSource = reason => {
      try { Promise.resolve(reader ? reader.cancel(reason) : source.cancel(reason)).catch(() => {}); } catch {}
    };
    const abort = () => {
      if (finished) return;
      finished = true; cleanup();
      if (active()) controller.error(signal.reason);
      cancelSource(signal.reason);
    };
    const disposeBody = () => { finished = true; cleanup(); cancelSource(); };
    const stream = new ReadableStream({
      start(value) {
        controller = value; bodyCleanups.add(disposeBody);
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
      },
      async pull(value) {
        try {
          reader ??= source.getReader();
          const result = await reader.read();
          if (finished || !active()) return;
          if (result.done) { finished = true; cleanup(); value.close(); }
          else value.enqueue(bytesInRealm(result.value));
        } catch (error) {
          if (finished || !active()) return;
          finished = true; cleanup(); value.error(error);
        }
      },
      cancel(reason) { finished = true; cleanup(); cancelSource(reason); },
    }, { highWaterMark: 0 });
    return new NativeResponse(stream, { status: raw.status, statusText: raw.statusText, headers: raw.headers });
  }
  function textStream(raw) {
    if (raw.bodyUsed) throw new window.TypeError('Body has already been read');
    const body = raw.body;
    if (!body) return new window.ReadableStream({ start(controller) { controller.close(); } });
    if (body.locked) throw new window.TypeError('Body stream is locked');
    const reader = nativeReader.call(body), decoder = new TextDecoder();
    reader.closed.catch(() => {});
    // Request the first real read now, marking the body disturbed before
    // returning the text stream, independently of later consumer demand.
    let next = reader.read(), finished = false;
    const release = () => { if (!finished) { finished = true; reader.releaseLock(); } };
    return new window.ReadableStream({
      async pull(controller) {
        try {
          while (!finished) {
            const result = await (next ?? reader.read()); next = undefined;
            if (result.done) {
              const tail = decoder.decode(); if (tail) controller.enqueue(tail);
              release(); controller.close(); return;
            }
            const text = decoder.decode(result.value, { stream: true });
            if (text) { controller.enqueue(text); return; }
          }
        } catch (error) { release(); controller.error(realmError(error)); }
      },
      async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } },
    });
  }
  class Response {
    constructor(body = null, init = {}) {
      init ??= {};
      try {
        const headers = fillHeaders(init.headers, 'response');
        const status = init.status, statusText = init.statusText;
        const prepared = bufferedInput(body);
        const streamBody = isReadableSource(prepared.value) ? prepared.value : undefined;
        const raw = new NativeResponse(streamBody ? new Uint8Array() : prepared.value, { status, statusText, headers: getHeaders(headers).raw });
        responseState.set(this, { raw, streamBody, streamUsed: false, bufferedBody: bufferedRecord(prepared.bytes), headers: wrapHeaders(raw.headers, 'response') }); registerHeapWrapper(this,window);
      } catch (error) { throw realmError(error); }
    }
    static error() { return wrapResponse(NativeResponse.error()); }
    static redirect(url, status = 302) {
      if (!arguments.length) throw new window.TypeError('redirect requires a URL');
      try { return wrapResponse(NativeResponse.redirect(new URL(String(url), window.document.baseURI).href, status)); }
      catch (error) { throw realmError(error); }
    }
    static json(data, init = {}) {
      const text = window.JSON.stringify(data);
      if (text === undefined) throw new window.TypeError('Value is not JSON serializable');
      const headers = new Headers(init.headers);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      return new Response(text, { ...init, headers });
    }
    clone() {
      const s = getResponse(this);
      if (s.streamBody) {
        if (s.streamUsed || readableLocked(s.streamBody) || (readableVersion(s.streamBody) ?? 0) > 0) throw new window.TypeError('Body is disturbed or locked');
        return wrapResponse(new NativeResponse(null, { status: s.raw.status, statusText: s.raw.statusText, headers: getHeaders(s.headers).raw }), { guard: getHeaders(s.headers).guard });
      }
      assertBufferedBodyUsable(s);
      const { raw, headers, bufferedBody, ...view } = s;
      try {
        let cloned = raw.clone();
        if (s.signal) {
          // Native cloning tees and may drain the source before either branch
          // is consumed. Give each unread branch its own abort algorithm.
          s.raw = abortableBody(raw, s.signal); cloned = abortableBody(cloned, s.signal);
        }
        return wrapResponse(cloned, { ...view, bufferedBytes: bufferedBody?.bytes, headers: new NativeHeaders(getHeaders(headers).raw), guard: getHeaders(headers).guard });
      }
      catch (error) { throw realmError(error); }
    }
    textStream() { const s = getResponse(this); materializeResponseStream(s); lockBufferedBody(s); return textStream(s.raw); }
    get headers() { return getResponse(this).headers; }
    get status() { const s = getResponse(this); return s.status ?? s.raw.status; }
    get statusText() { const s = getResponse(this); return s.statusText ?? s.raw.statusText; }
    get url() { const s = getResponse(this); return s.url ?? s.raw.url; }
    get type() { const s = getResponse(this); return s.type ?? s.raw.type; }
    get redirected() { const s = getResponse(this); return s.redirected ?? s.raw.redirected; }
    get ok() { return this.status >= 200 && this.status < 300; }
    get body() { const s = getResponse(this); return s.streamBody ?? bufferedStream(s); }
    get bodyUsed() { const s = getResponse(this); return s.streamBody ? s.streamUsed : s.raw.bodyUsed; }
    get [Symbol.toStringTag]() { return 'Response'; }
  }
  const OriginalParams = window.URLSearchParams;
  const Params = new Proxy(OriginalParams, { construct(target, args, newTarget) {
    try { return Reflect.construct(target, args, newTarget); } catch (error) { throw realmError(error); }
  } });
  Object.defineProperty(OriginalParams.prototype, 'constructor', { value: Params, writable: true, configurable: true });
  window.URLSearchParams = Params;
  for (const constructor of [Request, Response]) {
    for (const method of ['text', 'json', 'arrayBuffer', 'bytes', 'blob', 'formData']) Object.defineProperty(constructor.prototype, method,
      { configurable: true, writable: true, value() { return consume(this, method, constructor === Response); } });
  }
  Object.defineProperty(Request.prototype, 'textStream', { configurable: true, writable: true,
    value: function () {
      const s = getRequest(this); lockBufferedBody(s); materializeStreamBody(s); return textStream(s.raw);
    },
  });
  function cors(response, origin, credentials) {
    const allowed = response.headers.get('access-control-allow-origin');
    if (allowed !== origin && !(allowed === '*' && !credentials)) throw new window.TypeError('CORS origin is not allowed');
    if (credentials && response.headers.get('access-control-allow-credentials') !== 'true') throw new window.TypeError('CORS credentials are not allowed');
  }
  function filtered(response, cross, credentials) {
    const exposed = new Set((response.headers.get('access-control-expose-headers') ?? '').split(',').map(name => name.trim().toLowerCase()));
    return new NativeHeaders([...response.headers].filter(([name]) => !['set-cookie', 'set-cookie2'].includes(name) &&
      (!cross || SIMPLE_RESPONSE.has(name) || exposed.has(name) || (exposed.has('*') && !credentials))));
  }
  function referrerFor(request, destination) {
    const source = request.referrer === 'about:client' ? networkDocumentURL(page) : request.referrer;
    if (!source) return null;
    let from, to;
    try { from = new URL(source); to = new URL(destination); } catch { return null; }
    if (!['http:', 'https:'].includes(from.protocol) || !['http:', 'https:'].includes(to.protocol)) return null;
    if (request.referrer!=='about:client' && from.origin !== documentOrigin()) return null;
    from.username = ''; from.password = ''; from.hash = '';
    const same = from.origin === to.origin, downgrade = from.protocol === 'https:' && to.protocol === 'http:';
    switch (request.referrerPolicy || 'strict-origin-when-cross-origin') {
      case 'no-referrer': return null;
      case 'unsafe-url': return from.href;
      case 'same-origin': return same ? from.href : null;
      case 'origin': return `${from.origin}/`;
      case 'strict-origin': return downgrade ? null : `${from.origin}/`;
      case 'origin-when-cross-origin': return same ? from.href : `${from.origin}/`;
      case 'no-referrer-when-downgrade': return downgrade ? null : from.href;
      default: return downgrade ? null : same ? from.href : `${from.origin}/`;
    }
  }
  async function perform(request) {
    const s = getRequest(request), raw = s.raw;
    const origin = documentOrigin();
    const cross = url => ['http:', 'https:'].includes(new URL(url).protocol) && new URL(url).origin !== origin;
    if (raw.mode === 'same-origin' && cross(raw.url)) throw new window.TypeError('Cross-origin request blocked by same-origin mode');
    if (raw.signal.aborted) throw raw.signal.reason;
    const controller = new AbortController(); pending.add(controller);
    const signal = AbortSignal.any([controller.signal, raw.signal]);
    try {
      const headers = new NativeHeaders(getHeaders(s.headers).raw);
      const body = s.streamBody ? extractStreamBody(s) : raw.body === null ? undefined : new Uint8Array(await raw.arrayBuffer());
      if (!active()) return;
      if (raw.keepalive && body?.byteLength > 65536) throw new window.TypeError('Keepalive request body exceeds 64 KiB');
      const unsafe = [...headers].filter(([name, value]) => !safeHeader(name, value)).map(([name]) => name).sort();
      const preflight = !SIMPLE_METHODS.has(raw.method) || unsafe.length > 0;
      let redirectUnsafe = unsafe;
      const credentials = raw.credentials === 'include';
      if (raw.mode === 'cors' && cross(raw.url) && preflight) {
        const preflightHeaders = new NativeHeaders({ origin, 'access-control-request-method': raw.method });
        if (unsafe.length) preflightHeaders.set('access-control-request-headers', unsafe.join(', '));
        const response = await page.fetch(raw.url, { method: 'OPTIONS', headers: preflightHeaders,
          credentials: 'omit', signal, redirect: 'error' }, 'Fetch');
        if (!response.ok) throw new window.TypeError('CORS preflight failed');
        cors(response, origin, credentials);
        const methods = (response.headers.get('access-control-allow-methods') ?? '').split(',').map(method => method.trim());
        const names = (response.headers.get('access-control-allow-headers') ?? '').split(',').map(name => name.trim().toLowerCase());
        if ((!SIMPLE_METHODS.has(raw.method) && !methods.includes(raw.method) && !(methods.includes('*') && !credentials)) ||
            unsafe.some(name => !names.includes(name) && !(names.includes('*') && !credentials && name !== 'authorization'))) {
          throw new window.TypeError('CORS preflight did not allow the method or headers');
        }
      }
      if (!active()) return;
      if (signal.aborted) throw raw.signal.aborted ? raw.signal.reason : signal.reason;
      if (cross(raw.url) || !['GET', 'HEAD'].includes(raw.method)) headers.set('origin', origin);
      const referrer = referrerFor(raw, raw.url);
      if (referrer) headers.set('referer', referrer);
      const response = await page.fetch(raw.url, { method: raw.method, headers, body, signal, mode: raw.mode,
        credentials: raw.credentials, credentialsOrigin: origin, redirect: raw.redirect, cache: raw.cache,
        integrity: raw.integrity, keepalive: raw.keepalive, skipDefaultReferrer: true,
        onRedirect(response, next, previous, redirectHeaders) {
          if (raw.redirect === 'error') throw new window.TypeError('Redirects are forbidden for this request');
          if (raw.mode === 'same-origin' && cross(next)) throw new window.TypeError('Cross-origin redirect blocked by same-origin mode');
          if (raw.mode === 'cors') {
            if (cross(previous)) cors(response, origin, credentials);
            // Cross-origin transport strips authored Authorization before the next
            // hop. It therefore stops contributing to that hop's preflight.
            if (new URL(previous).origin !== new URL(next).origin) redirectUnsafe = redirectUnsafe.filter(name => name !== 'authorization');
            if (cross(next) && (!SIMPLE_METHODS.has(raw.method) || redirectUnsafe.length > 0)) throw new window.TypeError('Redirects requiring another CORS preflight are unsupported');
            if (cross(previous) && new URL(previous).origin !== new URL(next).origin) throw new window.TypeError('Opaque-origin CORS redirects are unsupported');
          }
          if (cross(next)) redirectHeaders?.set('origin', origin);
          const nextReferrer = referrerFor(raw, next);
          if (nextReferrer) redirectHeaders?.set('referer', nextReferrer); else redirectHeaders?.delete('referer');
        },
      }, 'Fetch');
      const url = response.url || response.finalUrl || raw.url;
      const redirected = response.redirected ?? false;
      if (raw.redirect === 'error' && [301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel(); throw new window.TypeError('Redirects are forbidden for this request');
      }
      if (raw.redirect === 'manual' && [301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        return wrapResponse(NativeResponse.error(), { type: 'opaqueredirect', redirected: false });
      }
      if (raw.mode === 'no-cors' && cross(url)) {
        await response.body?.cancel();
        return wrapResponse(NativeResponse.error(), { type: 'opaque', redirected: false });
      }
      if (raw.mode === 'cors' && cross(url)) cors(response, origin, credentials);
      const bufferedBytes = response.body ? new Uint8Array(await response.arrayBuffer()) : undefined;
      const bodyResponse = bufferedBytes === undefined ? response : new NativeResponse(bufferedBytes, { status: response.status, statusText: response.statusText, headers: response.headers });
      return wrapResponse(abortableBody(bodyResponse, raw.signal), { bufferedBytes, headers: filtered(response, cross(url), credentials),
        type: cross(url) ? 'cors' : 'basic', url, redirected, signal: raw.signal });
    } finally { pending.delete(controller); }
  }
  function fetch(input, init) {
    const epoch = requestEpoch;
    return new window.Promise((resolve, reject) => {
      if (!active()) return;
      let request;
      try {
        if (arguments.length === 0) throw new window.TypeError('fetch requires an input');
        request = new Request(input, init);
      } catch (error) { reject(error); return; }
      perform(request).then(value => { if (active() && epoch === requestEpoch) resolve(value); }, error => {
        if (!active() || epoch !== requestEpoch) return;
        const signal = getRequest(request).raw.signal;
        reject(signal.aborted ? signal.reason : realmError(error));
      });
    });
  }
  for (const [name, value] of Object.entries({ Headers, Request, Response, fetch })) {
    Object.defineProperty(window, name, { value, writable: true, configurable: true });
  }
  const previousClose = window.close;
  const close = function (...args) { dispose(); return previousClose.apply(this, args); };
  const cancelPending = () => { requestEpoch++; for (const controller of pending) controller.abort(); pending.clear(); };
  RETIRE_REQUESTS.set(window, cancelPending);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelPending();
    for (const cleanup of bodyCleanups) cleanup();
    documentSignal?.removeEventListener('abort', dispose);
    if (window.close === close) window.close = previousClose;
  };
  window.close = close;
  documentSignal?.addEventListener('abort', dispose, { once: true });
  INSTALLED.set(window, dispose);
  return dispose;
}
