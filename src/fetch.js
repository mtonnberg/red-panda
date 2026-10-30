import { createRequire } from 'node:module';

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
const INSTALLED = new WeakMap();
const HEADER_STATE = new WeakMap(), REQUEST_STATE = new WeakMap(), RESPONSE_STATE = new WeakMap();
const FORBIDDEN = new Set(['accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt',
  'expect', 'host', 'keep-alive', 'origin', 'permissions-policy', 'referer', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'user-agent', 'via']);
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);
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
 * Streaming upload bodies reject explicitly; ordinary request bodies and all
 * network responses use the shared buffered transport.
 * Returns an idempotent silent disposal hook.
 */
export function installFetch(page, window) {
  if (INSTALLED.has(window)) return INSTALLED.get(window);
  const generation = page.documentGeneration;
  const documentSignal = page.documentAbort?.signal;
  const headersState = HEADER_STATE, requestState = REQUEST_STATE, responseState = RESPONSE_STATE;
  const pending = new Set();
  const bodyCleanups = new Set();
  let disposed = false;
  const active = () => !disposed && !page.closed && !!window.document && page.documentGeneration === generation && !documentSignal?.aborted;
  const documentOrigin = () => implForWrapper(window.document)?._origin ?? window.location.origin;
  function realmError(error) {
    if (error instanceof window.Error || error instanceof window.DOMException) return error;
    if (error instanceof globalThis.DOMException) return new window.DOMException(error.message, error.name);
    if (error?.name === 'SyntaxError') return new window.SyntaxError(error.message);
    if (error?.name === 'RangeError') return new window.RangeError(error.message);
    return new window.TypeError(error?.message ?? String(error));
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
    if (!allowStream && Object.prototype.toString.call(body) === '[object ReadableStream]') {
      throw new window.TypeError('ReadableStream request bodies are unsupported by this buffered transport');
    }
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
    if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') return new Uint8Array(body).slice();
    if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
    return body;
  }
  function fillHeaders(init, guard = 'none') {
    const result = new Headers(); headersState.get(result).guard = guard;
    const source = new NativeHeaders(init);
    for (const [name, value] of source) result.append(name, value);
    return result;
  }
  function wrapHeaders(raw, guard) {
    const result = Object.create(Headers.prototype);
    headersState.set(result, { raw, guard }); return result;
  }
  class Headers {
    constructor(init) {
      try { headersState.set(this, { raw: new NativeHeaders(init), guard: 'none' }); }
      catch (error) { throw realmError(error); }
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
      } catch (error) { throw realmError(error); }
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
    const read = kind === 'json' ? 'text' : kind === 'bytes' ? 'arrayBuffer' : kind;
    let reading;
    try { reading = s.raw[read](); } catch (error) { reading = Promise.reject(error); }
    return promise(async () => {
      if (kind === 'json') return window.JSON.parse(await reading);
      if (kind === 'arrayBuffer' || kind === 'bytes') {
        const array = bytesInRealm(await reading); return kind === 'bytes' ? array : array.buffer;
      }
      if (kind === 'blob') {
        const blob = await reading; return new window.Blob([bytesInRealm(await blob.arrayBuffer()).buffer], { type: blob.type });
      }
      if (kind === 'formData') {
        const native = await reading, result = new window.FormData();
        for (const [name, value] of native) {
          if (typeof value === 'string') result.append(name, value);
          else result.append(name, new window.File([bytesInRealm(await value.arrayBuffer()).buffer], value.name,
            { type: value.type, lastModified: value.lastModified }));
        }
        return result;
      }
      return reading;
    }, s.signal);
  }
  function wrapRequest(raw) {
    const request = Object.create(Request.prototype);
    const headers = fillHeaders(raw.headers, raw.mode === 'no-cors' ? 'request-no-cors' : 'request');
    for (const name of [...raw.headers.keys()]) raw.headers.delete(name);
    for (const [name, value] of headers) raw.headers.set(name, value);
    requestState.set(request, { raw, headers: wrapHeaders(raw.headers, raw.mode === 'no-cors' ? 'request-no-cors' : 'request') });
    return request;
  }
  class Request {
    constructor(input, init = {}) {
      if (arguments.length === 0) throw new window.TypeError('Request requires an input');
      init ??= {};
      try {
        const source = requestState.get(input)?.raw ?? (input instanceof NativeRequest ? input : new URL(String(input), window.document.baseURI).href);
        const mode = init.mode ?? (source instanceof NativeRequest ? source.mode : 'cors');
        const guarded = fillHeaders(init.headers ?? (source instanceof NativeRequest ? source.headers : undefined), mode === 'no-cors' ? 'request-no-cors' : 'request');
        const prepared = { ...init, headers: getHeaders(guarded).raw };
        if (Object.hasOwn(init, 'body')) prepared.body = bodyValue(init.body);
        if (prepared.referrer && prepared.referrer !== 'about:client') prepared.referrer = new URL(String(prepared.referrer), window.document.baseURI).href;
        const wrapped = wrapRequest(new NativeRequest(source, prepared));
        requestState.set(this, requestState.get(wrapped));
      } catch (error) { throw realmError(error); }
    }
    clone() { try { return wrapRequest(getRequest(this).raw.clone()); } catch (error) { throw realmError(error); } }
    get headers() { return getRequest(this).headers; }
    get body() { return getRequest(this).raw.body; }
    get bodyUsed() { return getRequest(this).raw.bodyUsed; }
    get [Symbol.toStringTag]() { return 'Request'; }
  }
  for (const name of ['url', 'method', 'mode', 'credentials', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'keepalive', 'signal', 'destination', 'duplex']) {
    Object.defineProperty(Request.prototype, name, { configurable: true, enumerable: true, get() { return getRequest(this).raw[name]; } });
  }
  function wrapResponse(raw, view = {}) {
    const response = Object.create(Response.prototype);
    responseState.set(response, { raw, ...view, headers: wrapHeaders(view.headers ?? raw.headers, view.guard ?? 'immutable') });
    return response;
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
  class Response {
    constructor(body = null, init = {}) {
      init ??= {};
      try {
        const headers = fillHeaders(init.headers, 'response');
        const raw = new NativeResponse(bodyValue(body, true), { ...init, headers: getHeaders(headers).raw });
        responseState.set(this, { raw, headers: wrapHeaders(raw.headers, 'response') });
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
      const { raw, headers, ...view } = s;
      try {
        let cloned = raw.clone();
        if (s.signal) {
          // Native cloning tees and may drain the source before either branch
          // is consumed. Give each unread branch its own abort algorithm.
          s.raw = abortableBody(raw, s.signal); cloned = abortableBody(cloned, s.signal);
        }
        return wrapResponse(cloned, { ...view, headers: new NativeHeaders(getHeaders(headers).raw), guard: getHeaders(headers).guard });
      }
      catch (error) { throw realmError(error); }
    }
    get headers() { return getResponse(this).headers; }
    get status() { const s = getResponse(this); return s.status ?? s.raw.status; }
    get statusText() { const s = getResponse(this); return s.statusText ?? s.raw.statusText; }
    get url() { const s = getResponse(this); return s.url ?? s.raw.url; }
    get type() { const s = getResponse(this); return s.type ?? s.raw.type; }
    get redirected() { const s = getResponse(this); return s.redirected ?? s.raw.redirected; }
    get ok() { return this.status >= 200 && this.status < 300; }
    get body() { return getResponse(this).raw.body; }
    get bodyUsed() { return getResponse(this).raw.bodyUsed; }
    get [Symbol.toStringTag]() { return 'Response'; }
  }
  for (const constructor of [Request, Response]) {
    for (const method of ['text', 'json', 'arrayBuffer', 'bytes', 'blob', 'formData']) Object.defineProperty(constructor.prototype, method,
      { configurable: true, writable: true, value() { return consume(this, method, constructor === Response); } });
  }
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
    const source = request.referrer === 'about:client' ? window.location.href : request.referrer;
    if (!source) return null;
    let from, to;
    try { from = new URL(source); to = new URL(destination); } catch { return null; }
    if (!['http:', 'https:'].includes(from.protocol) || !['http:', 'https:'].includes(to.protocol)) return null;
    if (from.origin !== documentOrigin()) return null;
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
      const body = raw.body === null ? undefined : new Uint8Array(await raw.arrayBuffer());
      if (!active()) return;
      if (raw.keepalive && body?.byteLength > 65536) throw new window.TypeError('Keepalive request body exceeds 64 KiB');
      const unsafe = [...headers].filter(([name, value]) => !safeHeader(name, value)).map(([name]) => name).sort();
      const preflight = !SIMPLE_METHODS.has(raw.method) || unsafe.length > 0;
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
            if (cross(next) && preflight) throw new window.TypeError('Redirects requiring another CORS preflight are unsupported');
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
      return wrapResponse(abortableBody(response, raw.signal), { headers: filtered(response, cross(url), credentials),
        type: cross(url) ? 'cors' : 'basic', url, redirected, signal: raw.signal });
    } finally { pending.delete(controller); }
  }
  function fetch(input, init) {
    return new window.Promise((resolve, reject) => {
      if (!active()) return;
      let request;
      try {
        if (arguments.length === 0) throw new window.TypeError('fetch requires an input');
        request = new Request(input, init);
      } catch (error) { reject(error); return; }
      perform(request).then(value => { if (active()) resolve(value); }, error => {
        if (!active()) return;
        reject(request.signal.aborted ? request.signal.reason : realmError(error));
      });
    });
  }
  for (const [name, value] of Object.entries({ Headers, Request, Response, fetch })) {
    Object.defineProperty(window, name, { value, writable: true, configurable: true });
  }
  const previousClose = window.close;
  const close = function (...args) { dispose(); return previousClose.apply(this, args); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const controller of pending) controller.abort(); pending.clear();
    for (const cleanup of bodyCleanups) cleanup();
    documentSignal?.removeEventListener('abort', dispose);
    if (window.close === close) window.close = previousClose;
  };
  window.close = close;
  documentSignal?.addEventListener('abort', dispose, { once: true });
  INSTALLED.set(window, dispose);
  return dispose;
}
