import { platformFactoryRecord } from './platform-factories.js';
import { types as nodeTypes } from 'node:util';
import { randomUUID } from 'node:crypto';
import { installBlobReads } from './blob.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Pinned jsdom internals create genuine UA events and same-realm response
// documents. dispatchEvent(new Event(...)) intentionally remains untrusted.
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const { fireAnEvent } = require('jsdom/lib/jsdom/living/helpers/events.js');
const Event = require('jsdom/lib/jsdom/living/generated/Event.js');
const ProgressEvent = require('jsdom/lib/jsdom/living/generated/ProgressEvent.js');
const MIMEType = require('whatwg-mimetype');
const { parseURL, serializeURLOrigin } = require('whatwg-url');

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN = new Set(['accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt',
  'expect', 'host', 'keep-alive', 'origin', 'permissions-policy', 'referer', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'user-agent', 'via']);
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);
const SIMPLE_RESPONSE = new Set(['cache-control', 'content-language', 'content-length', 'content-type',
  'expires', 'last-modified', 'pragma']);
const PROGRESS_EVENTS = ['loadstart', 'progress', 'abort', 'error', 'load', 'timeout', 'loadend'];
const RESPONSE_TYPES = new Set(['', 'text', 'json', 'document', 'arraybuffer', 'blob']);
const INSTALLED = new WeakMap();

function mime(value, fallback = 'text/xml') {
  try { return new MIMEType(value ?? fallback); } catch { return new MIMEType(fallback); }
}

function unsafeHeaders(headers) {
  const unsafe = [];
  for (const [name, value] of headers) {
    let safe = value.length <= 128;
    if (['accept', 'content-type'].includes(name)) safe &&= !/[\x00-\x08\x0a-\x1f\x7f"():<>?@[\]{}]/.test(value);
    if (['accept-language', 'content-language'].includes(name)) safe &&= /^[0-9A-Za-z *,\-.;=]*$/.test(value);
    else if (name === 'content-type') safe &&= ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'].includes(mime(value, 'application/octet-stream').essence);
    else if (name === 'range') safe &&= /^bytes=\d+-\d*$/.test(value);
    else if (name !== 'accept') safe = false;
    if (!safe) unsafe.push(name);
  }
  return unsafe.sort();
}

/** Install document-bound XMLHttpRequest using Page.fetch, including CDP events.
 *
 * HTTP(S) uses CORS with preflight and filtered response headers; data URLs are
 * readable directly. Cookies use the transport's per-hop credentialsOrigin.
 * Redirects requiring a fresh preflight or an opaque redirect origin are
 * rejected. Page.fetch buffers responses, so progress represents one completed
 * body, not streamed chunks.
 * Synchronous requests use a browser-owned actual transport thread. Returns a silent cleanup hook.
 */
export function installXHR(page, window) {
  if (INSTALLED.has(window)) return INSTALLED.get(window);
  const generation = page.documentGeneration;
  const documentSignal = page.documentAbort?.signal;
  const live = new Set();
  const states = new WeakMap();
  const handlers = new WeakMap();
  let disposed = false;
  const activeDocument = () => !disposed && !page.closed && !!window.document && page.documentGeneration === generation && !documentSignal?.aborted;
  const same = (s, op) => s.op === op && activeDocument();
  const domError = (message, name = 'InvalidStateError') => new window.DOMException(message, name);
  const state = xhr => {
    const s = states.get(xhr);
    if (!s) throw new window.TypeError('Illegal invocation');
    return s;
  };
  const emit = (target, type, progress) => fireAnEvent(type, implForWrapper(target),
    progress ? ProgressEvent : Event, { bubbles: false, cancelable: false, ...progress });
  const progress = (target, type, loaded = 0, total = 0, lengthComputable = false) =>
    emit(target, type, { loaded, total, lengthComputable });
  function clearResponse(s) {
    s.status = 0; s.statusText = ''; s.responseURL = ''; s.headers = new Headers();
    s.bytes = new Uint8Array(); s.text = ''; s.cached = undefined; s.document = undefined;
    s.mime = null; s.mimeValue = null;
  }
  function cancelOperation(op) {
    if (!op) return;
    op.done = true; clearTimeout(op.timer); op.controller.abort(); live.delete(op);
  }
  function terminal(xhr, s, op, kind) {
    if (!same(s, op) || op.done) return;
    cancelOperation(op); op.terminal = true; s.sending = false; clearResponse(s); s.readyState = 4;
    emit(xhr, 'readystatechange');
    if (!same(s, op)) return;
    if (op.uploadStarted && !op.uploadComplete) {
      op.uploadComplete = true;
      progress(s.upload, kind);
      if (!same(s, op)) return;
      progress(s.upload, 'loadend');
      if (!same(s, op)) return;
    }
    progress(xhr, kind);
    if (!same(s, op)) return;
    progress(xhr, 'loadend');
    op.terminal = false;
  }
  function scheduleTimeout(xhr, s, op) {
    clearTimeout(op.timer);
    if (!s.timeout || op.done) return;
    const remaining = s.timeout - (Date.now() - op.started);
    op.timer = setTimeout(() => terminal(xhr, s, op, 'timeout'), Math.max(0, remaining));
  }
  function fileBytes(blob) {
    return new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(reader.error ?? domError('Cannot read request Blob', 'NotReadableError'));
      reader.onabort = () => reject(domError('Reading request Blob was aborted', 'AbortError'));
      reader.readAsArrayBuffer(blob);
    });
  }
  installBlobReads(window);
  const typedPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer').get;
  const typedOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset').get;
  const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength').get;
  const dataBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, 'buffer').get;
  const dataOffset = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteOffset').get;
  const dataLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get;
  const paramsString = window.URLSearchParams.prototype.toString;
  const symbolDescription = Object.getOwnPropertyDescriptor(Symbol.prototype, 'description').get;
  function requestBodySync(body, headers) {
    if (body == null) return undefined;
    if (nodeTypes.isArrayBuffer(body)) return new Uint8Array(body).slice();
    if (nodeTypes.isArrayBufferView(body)) {
      const data = nodeTypes.isDataView(body), get = data ? [dataBuffer,dataOffset,dataLength] : [typedBuffer,typedOffset,typedLength];
      return new Uint8Array(get[0].call(body),get[1].call(body),get[2].call(body)).slice();
    }
    const record=platformFactoryRecord(body);
    if (record?.kind === 'Blob' || record?.kind === 'File') {
      const impl=record.implementation;
      if (!Buffer.isBuffer(impl?._buffer)) throw new window.TypeError('Invalid Blob');
      if (impl.type && !headers.has('content-type')) headers.set('content-type',impl.type);
      return Buffer.from(impl._buffer);
    }
    if (record?.kind === 'FormData') {
      const boundary='----red-panda-'+randomUUID(), chunks=[];
      const quote=value=>String(value).replace(/\r?\n|\r/g,'\r\n').replace(/\r/g,'%0D').replace(/\n/g,'%0A').replace(/"/g,'%22');
      for (const entry of record.implementation._entries) {
        const value=entry.value;
        chunks.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+quote(entry.name)+'"'));
        if (typeof value==='string') chunks.push(Buffer.from('\r\n\r\n'+value+'\r\n'));
        else chunks.push(Buffer.from('; filename="'+quote(value.name)+'"\r\nContent-Type: '+(value.type||'application/octet-stream')+'\r\n\r\n'),Buffer.from(value._buffer),Buffer.from('\r\n'));
      }
      chunks.push(Buffer.from('--'+boundary+'--\r\n'));
      if (!headers.has('content-type')) headers.set('content-type','multipart/form-data; boundary='+boundary);
      return Buffer.concat(chunks);
    }
    if (record?.kind === 'URLSearchParams') {
      if(!headers.has('content-type'))headers.set('content-type','application/x-www-form-urlencoded;charset=UTF-8');
      return paramsString.call(body);
    }
    if(!headers.has('content-type'))headers.set('content-type','text/plain;charset=UTF-8');
    return typeof body === 'symbol' ? String(symbolDescription.call(body)) : String(body);
  }
  async function requestBody(body, headers) {
    if (body === null || body === undefined) return undefined;
    if (body instanceof window.Document) {
      if (!headers.has('content-type')) headers.set('content-type', `${body.contentType};charset=UTF-8`);
      return new window.XMLSerializer().serializeToString(body);
    }
    if (body instanceof window.FormData) {
      const converted = new FormData();
      for (const [name, value] of body) {
        if (typeof value === 'string') converted.append(name, value);
        else converted.append(name, new Blob([await fileBytes(value)], { type: value.type }), value.name);
      }
      // A native Request chooses a boundary once so the preflight sees exactly
      // the Content-Type that the actual request will send.
      const prepared = new Request('http://multipart.invalid/', { method: 'POST', body: converted });
      if (!headers.has('content-type')) headers.set('content-type', prepared.headers.get('content-type'));
      return new Uint8Array(await prepared.arrayBuffer());
    }
    if (body instanceof window.Blob) {
      if (body.type && !headers.has('content-type')) headers.set('content-type', body.type);
      return fileBytes(body);
    }
    if (body instanceof window.URLSearchParams || body instanceof URLSearchParams) {
      if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
      return body.toString();
    }
    if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
    if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') return new Uint8Array(body).slice();
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
    else {
      const parsed = mime(headers.get('content-type'), 'application/octet-stream');
      if (parsed.parameters.has('charset')) { parsed.parameters.set('charset', 'UTF-8'); headers.set('content-type', parsed.toString()); }
    }
    return String(body);
  }
  function corsResponse(response, origin, credentials) {
    const allowed = response.headers.get('access-control-allow-origin');
    if (allowed !== origin && !(allowed === '*' && !credentials)) throw domError('CORS origin is not allowed', 'NetworkError');
    if (credentials && response.headers.get('access-control-allow-credentials') !== 'true') throw domError('CORS credentials are not allowed', 'NetworkError');
  }
  function exposedHeaders(response, cross, credentials) {
    const allowed = new Set(SIMPLE_RESPONSE);
    const extra = (response.headers.get('access-control-expose-headers') ?? '').split(',').map(name => name.trim().toLowerCase());
    extra.forEach(name => allowed.add(name));
    return new Headers([...response.headers].filter(([name]) => !['set-cookie', 'set-cookie2'].includes(name) &&
      (!cross || allowed.has(name) || (allowed.has('*') && !credentials))));
  }
  function responseDocument(s) {
    if (s.document !== undefined) return s.document;
    s.document = null;
    const parsed = s.mime ?? mime(null);
    const xml = parsed.isXML();
    if (!xml && !(s.responseType === 'document' && parsed.essence === 'text/html')) return null;
    let document = new window.DOMParser().parseFromString(s.text, xml ? 'application/xml' : 'text/html');
    if (xml && document.documentElement?.namespaceURI === 'http://www.mozilla.org/newlayout/xml/parsererror.xml' &&
        document.documentElement.localName === 'parsererror') return null;
    if (xml) {
      // jsdom DOMParser constructs a plain Document even for XML. Its public
      // DOMImplementation factory gives the correct XMLDocument interface.
      const xmlDocument = window.document.implementation.createDocument(null, '', null);
      for (const node of document.childNodes) xmlDocument.appendChild(xmlDocument.importNode(node, true));
      document = xmlDocument;
    }
    const impl = implForWrapper(document);
    impl._URL = parseURL(s.responseURL); impl._origin = serializeURLOrigin(impl._URL);
    impl.contentType = parsed.essence; impl._clearBaseURLCache();
    s.document = document;
    return document;
  }
  function performSync(xhr,s,op,headers,body) {
    try {
      if(s.responseType || s.timeout)throw domError('Synchronous Window XHR cannot use responseType or timeout','InvalidAccessError');
      const origin=implForWrapper(window.document)?._origin??window.location.origin,credentials=s.withCredentials;
      const cross=url=>['http:','https:'].includes(new URL(url).protocol)&&new URL(url).origin!==origin;
      const unsafe=unsafeHeaders(headers),preflight=!SIMPLE_METHODS.has(s.method)||unsafe.length>0||op.uploadListeners;
      const owner=page.registry?.page??page;
      const fetch=(url,init)=>page.browser.syncHTTP.fetch(owner,url,{...init,signal:op.controller.signal,frameId:page.frameId,loaderId:page.loaderId});
      if(cross(s.url)&&preflight){
        const preflightHeaders=new Headers({origin,'access-control-request-method':s.method});if(unsafe.length)preflightHeaders.set('access-control-request-headers',unsafe.join(', '));
        const response=fetch(s.url,{method:'OPTIONS',headers:preflightHeaders,credentials:'omit',onRedirect(){throw domError('CORS preflight redirects are unsupported','NetworkError')}});
        if(response.status<200||response.status>299)throw domError('CORS preflight failed','NetworkError');corsResponse(response,origin,credentials);
        const methods=(response.headers.get('access-control-allow-methods')??'').split(',').map(value=>value.trim());
        const names=(response.headers.get('access-control-allow-headers')??'').split(',').map(value=>value.trim().toLowerCase());
        if((!SIMPLE_METHODS.has(s.method)&&!methods.includes(s.method)&&!(methods.includes('*')&&!credentials))||unsafe.some(name=>!names.includes(name)&&!(names.includes('*')&&!credentials&&name!=='authorization')))throw domError('CORS preflight did not allow request','NetworkError');
      }
      const document=implForWrapper(window.document),source=window.location.protocol==='about:'?document._referrer:window.location.href;
      const referrer=page.referrerFor?.(s.url,source);if(referrer)headers.set('referer',referrer);
      if(cross(s.url)||!['GET','HEAD'].includes(s.method))headers.set('origin',origin);
      const response=fetch(s.url,{method:s.method,headers,body,credentials:credentials?'include':'same-origin',credentialsOrigin:origin,onRedirect(response,next,previous,redirectHeaders){
        if(cross(previous))corsResponse(response,origin,credentials);
        if(cross(next)&&preflight)throw domError('Redirect requires fresh preflight','NetworkError');
        if(cross(previous)&&new URL(previous).origin!==new URL(next).origin)throw domError('Redirect requires opaque CORS origin','NetworkError');
        if(cross(next))redirectHeaders.set('origin',origin);
      }});
      if(!same(s,op)||op.done)return;
      if(cross(response.url))corsResponse(response,origin,credentials);
      s.status=response.status;s.statusText=response.statusText;s.responseURL=s.url;s.headers=exposedHeaders(response,false,credentials);
      s.mime=s.overrideMime??mime(response.headers.get('content-type'));s.mimeValue=s.overrideMimeValue??response.headers.get('content-type')??'text/xml';s.bytes=response.bytes;
      s.text=new TextDecoder('utf-8',{ignoreBOM:true}).decode(response.bytes);
      cancelOperation(op);s.sending=false;s.readyState=4;emit(xhr,'readystatechange');if(!same(s,op))return;
      const length=response.headers.get('content-length'),computable=length!==null&&/^\d+$/.test(length),total=computable?Number(length):0;
      progress(xhr,'load',s.bytes.length,total,computable);if(same(s,op))progress(xhr,'loadend',s.bytes.length,total,computable);
    }catch(error){cancelOperation(op);s.sending=false;clearResponse(s);s.readyState=4;if(error.name==='InvalidAccessError')throw error;throw domError('A network error occurred','NetworkError')}
  }
  async function perform(xhr, s, op, inputBody) {
    try {
      const headers = new Headers(s.requestHeaders);
      if (!headers.has('accept')) headers.set('accept', '*/*');
      if (s.authorization && !headers.has('authorization')) headers.set('authorization', s.authorization);
      const body = ['GET', 'HEAD'].includes(s.method) ? undefined : await requestBody(inputBody, headers);
      if (!same(s, op) || op.done) return;
      // about:blank/srcdoc children inherit their document origin; the URL's
      // origin remains "null". Window.origin itself is replaceable by script.
      const origin = implForWrapper(window.document)?._origin ?? window.location.origin;
      const credentials = s.withCredentials;
      const isCross = url => ['http:', 'https:'].includes(new URL(url).protocol) && new URL(url).origin !== origin;
      const unsafe = unsafeHeaders(headers);
      const preflight = !SIMPLE_METHODS.has(s.method) || unsafe.length > 0 || op.uploadListeners;
      const options = { method: s.method, headers, body, signal: op.controller.signal,
        credentials: credentials ? 'include' : 'same-origin', credentialsOrigin: origin };
      if (isCross(s.url) && preflight) {
        const preflightHeaders = new Headers({ origin, 'access-control-request-method': s.method });
        if (unsafe.length) preflightHeaders.set('access-control-request-headers', unsafe.join(', '));
        const response = await page.fetch(s.url, { method: 'OPTIONS', headers: preflightHeaders,
          credentials: 'omit', signal: op.controller.signal,
          onRedirect() { throw domError('CORS preflight redirects are unsupported', 'NetworkError'); } }, 'XHR');
        if (!same(s, op) || op.done) return;
        if (!response.ok) throw domError('CORS preflight failed', 'NetworkError');
        corsResponse(response, origin, credentials);
        const methods = (response.headers.get('access-control-allow-methods') ?? '').split(',').map(value => value.trim());
        const names = (response.headers.get('access-control-allow-headers') ?? '').split(',').map(value => value.trim().toLowerCase());
        if ((!SIMPLE_METHODS.has(s.method) && !methods.includes(s.method) && !(methods.includes('*') && !credentials)) ||
            unsafe.some(name => !names.includes(name) && !(names.includes('*') && !credentials && name !== 'authorization'))) {
          throw domError('CORS preflight did not allow the method or headers', 'NetworkError');
        }
      }
      if (!same(s, op) || op.done) return;
      const referrer = page.referrerFor?.(s.url, window.location.href);
      if (referrer) headers.set('referer', referrer);
      if (isCross(s.url) || !['GET', 'HEAD'].includes(s.method)) headers.set('origin', origin);
      options.onRedirect = (response, next, previous, redirectHeaders) => {
        if (isCross(String(previous))) corsResponse(response, origin, credentials);
        if (isCross(String(next)) && preflight) throw domError('Redirects requiring a new CORS preflight are unsupported', 'NetworkError');
        if (isCross(String(previous)) && new URL(previous).origin !== new URL(next).origin) throw domError('Redirects requiring an opaque CORS origin are unsupported', 'NetworkError');
        if (isCross(String(next))) redirectHeaders?.set('origin', origin);
      };
      op.bodyLength = typeof body === 'string' ? Buffer.byteLength(body) : body?.byteLength ?? 0;
      const response = await page.fetch(s.url, options, 'XHR');
      if (!same(s, op) || op.done) return;
      const responseURL = response.url || response.finalUrl || s.url;
      const cross = isCross(responseURL);
      if (cross) corsResponse(response, origin, credentials);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!same(s, op) || op.done) return;
      if (op.uploadStarted && !op.uploadComplete) {
        op.uploadComplete = true;
        for (const kind of ['progress', 'load', 'loadend']) {
          progress(s.upload, kind, op.bodyLength, op.bodyLength, true);
          if (!same(s, op) || op.done) return;
        }
      }
      s.status = response.status; s.statusText = response.statusText; s.responseURL = responseURL;
      s.headers = exposedHeaders(response, cross, credentials);
      s.mime = s.overrideMime ?? mime(response.headers.get('content-type'));
      s.mimeValue = s.overrideMimeValue ?? response.headers.get('content-type') ?? 'text/xml';
      if (!s.overrideMime) {
        try { new MIMEType(s.mimeValue); } catch { s.mimeValue = 'text/xml'; }
      }
      s.bytes = bytes;
      s.readyState = 2; emit(xhr, 'readystatechange');
      if (!same(s, op) || op.done) return;
      // overrideMimeType and responseType are still mutable while HEADERS_RECEIVED.
      s.mime = s.overrideMime ?? s.mime; s.mimeValue = s.overrideMimeValue ?? s.mimeValue;
      const encoding = s.responseType === 'json' ? 'utf-8' : s.mime.parameters.get('charset') ?? 'utf-8';
      try { s.text = new TextDecoder(encoding).decode(bytes); } catch { s.text = new TextDecoder().decode(bytes); }
      const length = response.headers.get('content-length');
      const computable = length !== null && /^\d+$/.test(length) && !response.headers.has('content-encoding');
      const total = computable ? Number(length) : 0;
      if (bytes.byteLength) {
        s.readyState = 3; emit(xhr, 'readystatechange');
        if (!same(s, op) || op.done) return;
        progress(xhr, 'progress', bytes.byteLength, total, computable);
        if (!same(s, op) || op.done) return;
      }
      cancelOperation(op); s.sending = false; s.readyState = 4;
      emit(xhr, 'readystatechange');
      if (!same(s, op)) return;
      progress(xhr, 'load', bytes.byteLength, total, computable);
      if (!same(s, op)) return;
      progress(xhr, 'loadend', bytes.byteLength, total, computable);
    } catch {
      // Network, decoding/body-conversion and CORS failures all follow the XHR
      // network-error path; aborted/disposed/replaced operations cannot fire.
      terminal(xhr, s, op, 'error');
    }
  }

  class XMLHttpRequestEventTarget extends window.EventTarget {
    constructor() { super(); handlers.set(this, new Map()); }
    get [Symbol.toStringTag]() { return 'XMLHttpRequestEventTarget'; }
  }
  class XMLHttpRequestUpload extends XMLHttpRequestEventTarget {
    get [Symbol.toStringTag]() { return 'XMLHttpRequestUpload'; }
  }
  class XMLHttpRequest extends XMLHttpRequestEventTarget {
    constructor() {
      super();
      const s = { readyState: 0, responseType: '', withCredentials: false, timeout: 0, sending: false,
        overrideMime: null, requestHeaders: new Headers(), upload: new XMLHttpRequestUpload() };
      clearResponse(s); states.set(this, s);
    }
    open(method, url, async = true, username, password) {
      if (arguments.length < 2) throw new window.TypeError('open requires a method and URL');
      const s = state(this);
      if (!activeDocument()) throw domError('The document has been disposed');
      method = String(method);
      if (!TOKEN.test(method)) throw domError('Invalid HTTP method', 'SyntaxError');
      if (['CONNECT', 'TRACE', 'TRACK'].includes(method.toUpperCase())) throw domError('Forbidden HTTP method', 'SecurityError');
      if (!async && s.timeout) throw domError('Synchronous Window XHR cannot use timeout', 'InvalidAccessError');
      if (['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'].includes(method.toUpperCase())) method = method.toUpperCase();
      let parsed;
      try { parsed = new URL(String(url), window.document.baseURI); } catch { throw domError('Invalid request URL', 'SyntaxError'); }
      if (username !== undefined && username !== null) parsed.username = String(username);
      if (password !== undefined && password !== null) parsed.password = String(password);
      parsed.hash = '';
      let authorization;
      if (parsed.username || parsed.password) {
        try { authorization = `Basic ${Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')}`; }
        catch { throw domError('Invalid URL credentials', 'SyntaxError'); }
        parsed.username = ''; parsed.password = '';
      }
      cancelOperation(s.op); s.op = null; s.sending = false;
      s.method = method; s.url = parsed.href; s.authorization = authorization; s.async = Boolean(async);
      s.requestHeaders = new Headers(); clearResponse(s);
      if (s.readyState !== 1) { s.readyState = 1; emit(this, 'readystatechange'); }
    }
    setRequestHeader(name, value) {
      if (arguments.length < 2) throw new window.TypeError('setRequestHeader requires a name and value');
      const s = state(this);
      if (s.readyState !== 1 || s.sending) throw domError('Request is not OPENED or has already been sent');
      name = String(name); value = String(value).replace(/^[\t ]+|[\t ]+$/g, '');
      if (!TOKEN.test(name) || /[^\t\x20-\x7e\x80-\xff]/.test(value)) throw domError('Invalid HTTP header', 'SyntaxError');
      const lower = name.toLowerCase();
      if (FORBIDDEN.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-') ||
          (['x-http-method', 'x-http-method-override', 'x-method-override'].includes(lower) && value.split(',').some(v => ['CONNECT', 'TRACE', 'TRACK'].includes(v.trim().toUpperCase())))) return;
      s.requestHeaders.append(name, value);
    }
    send(body = null) {
      const s = state(this);
      if (s.readyState !== 1 || s.sending) throw domError('Request is not OPENED or has already been sent');
      if (!activeDocument()) throw domError('The document has been disposed', 'InvalidStateError');
      if (s.async === false && (s.responseType || s.timeout)) throw domError('Synchronous Window XHR cannot use responseType or timeout','InvalidAccessError');
      let syncHeaders, syncBody;
      if (s.async === false) {
        syncHeaders = new Headers(s.requestHeaders);
        if (!syncHeaders.has('accept')) syncHeaders.set('accept','*/*');
        if (s.authorization && !syncHeaders.has('authorization')) syncHeaders.set('authorization',s.authorization);
        syncBody = ['GET','HEAD'].includes(s.method) ? undefined : requestBodySync(body,syncHeaders);
      }
      s.sending = true;
      const op = { xhr: this, state: s, controller: new AbortController(), started: Date.now(), done: false,
        uploadListeners: Object.values(implForWrapper(s.upload)._eventListeners).some(listeners => listeners.length > 0),
        uploadStarted: body !== null && body !== undefined && !['GET', 'HEAD'].includes(s.method), uploadComplete: false };
      s.op = op; live.add(op);
      if (!s.async) { queueMicrotask(()=>{if(!op.done){cancelOperation(op);s.sending=false}}); return performSync(this,s,op,syncHeaders,syncBody); }
      scheduleTimeout(this, s, op);
      progress(this, 'loadstart');
      if (!same(s, op) || op.done) return;
      if (op.uploadStarted) progress(s.upload, 'loadstart');
      if (!same(s, op) || op.done) return;
      void perform(this, s, op, body);
    }
    abort() {
      const s = state(this), op = s.op;
      // Calling abort again from the terminal readystatechange/abort handler
      // must not suppress the outer abort and loadend events.
      if (op?.terminal) return;
      if (s.sending && op && !op.done) {
        terminal(this, s, op, 'abort');
        if (same(s, op)) s.readyState = 0;
      } else {
        cancelOperation(op); s.op = null; clearResponse(s); s.readyState = 0;
      }
    }
    overrideMimeType(value) {
      const s = state(this);
      if ([3, 4].includes(s.readyState)) throw domError('Cannot override MIME type after loading starts');
      const input = String(value);
      try { s.overrideMime = new MIMEType(input); s.overrideMimeValue = input; }
      catch { s.overrideMime = new MIMEType('application/octet-stream'); s.overrideMimeValue = 'application/octet-stream'; }
    }
    getResponseHeader(name) {
      const s = state(this);
      if (s.readyState < 2) return null;
      try { return s.headers.get(String(name)); } catch { return null; }
    }
    getAllResponseHeaders() {
      const s = state(this);
      return s.readyState < 2 ? '' : [...s.headers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => `${name}: ${value}\r\n`).join('');
    }
    get readyState() { return state(this).readyState; }
    get status() { return state(this).status; }
    get statusText() { return state(this).statusText; }
    get responseURL() { return state(this).responseURL; }
    get upload() { return state(this).upload; }
    get responseType() { return state(this).responseType; }
    set responseType(value) {
      const s = state(this);
      value = String(value);
      if (!RESPONSE_TYPES.has(value)) return;
      if (s.async === false) throw domError('Synchronous Window XHR cannot use responseType','InvalidAccessError');
      if ([3, 4].includes(s.readyState)) throw domError('Cannot change responseType after loading starts');
      s.responseType = value;
    }
    get responseText() {
      const s = state(this);
      if (!['', 'text'].includes(s.responseType)) throw domError('responseType is not text');
      return s.readyState >= 3 ? s.text : '';
    }
    get responseXML() {
      const s = state(this);
      if (!['', 'document'].includes(s.responseType)) throw domError('responseType is not document');
      return s.readyState === 4 && s.status ? responseDocument(s) : null;
    }
    get response() {
      const s = state(this);
      if (['', 'text'].includes(s.responseType)) return this.responseText;
      if (s.readyState !== 4 || !s.status) return null;
      if (s.cached !== undefined) return s.cached;
      if (s.responseType === 'json') {
        try { s.cached = window.JSON.parse(s.text); } catch { s.cached = null; }
      } else if (s.responseType === 'document') s.cached = responseDocument(s);
      else {
        const array = new window.Uint8Array(s.bytes.length); array.set(s.bytes);
        s.cached = s.responseType === 'blob' ? new window.Blob([array.buffer], { type: s.mimeValue }) : array.buffer;
      }
      return s.cached;
    }
    get timeout() { return state(this).timeout; }
    set timeout(value) {
      const s = state(this);
      if (s.async === false) throw domError('Synchronous Window XHR cannot use timeout','InvalidAccessError');
      const numeric = Number(value);
      s.timeout = Number.isFinite(numeric) ? Math.trunc(numeric) >>> 0 : 0;
      if (s.sending && s.op) scheduleTimeout(this, s, s.op);
    }
    get withCredentials() { return state(this).withCredentials; }
    set withCredentials(value) {
      const s = state(this);
      if (![0, 1].includes(s.readyState) || s.sending) throw domError('Cannot change credentials after sending');
      s.withCredentials = Boolean(value);
    }
    get [Symbol.toStringTag]() { return 'XMLHttpRequest'; }
  }
  for (const type of [...PROGRESS_EVENTS, 'readystatechange']) {
    Object.defineProperty(XMLHttpRequestEventTarget.prototype, `on${type}`, {
      configurable: true, enumerable: true,
      get() { return handlers.get(this)?.get(type) ?? null; },
      set(value) {
        const entries = handlers.get(this);
        if (!entries) throw new window.TypeError('Illegal invocation');
        const previous = entries.get(type);
        if (previous) this.removeEventListener(type, previous);
        entries.delete(type);
        if (typeof value === 'function') { entries.set(type, value); this.addEventListener(type, value); }
      },
    });
  }
  for (const [name, value] of Object.entries({ UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4 })) {
    for (const target of [XMLHttpRequest, XMLHttpRequest.prototype]) Object.defineProperty(target, name, { value, enumerable: true });
  }
  for (const constructor of [XMLHttpRequestEventTarget, XMLHttpRequestUpload, XMLHttpRequest]) {
    Object.defineProperty(window, constructor.name, { value: constructor, writable: true, configurable: true });
  }
  const previousClose = window.close;
  const close = function (...args) { dispose(); return previousClose.apply(this, args); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const op of live) cancelOperation(op);
    documentSignal?.removeEventListener('abort', dispose);
    if (window.close === close) window.close = previousClose;
  };
  window.close = close;
  documentSignal?.addEventListener('abort', dispose, { once: true });
  INSTALLED.set(window, dispose);
  return dispose;
}
