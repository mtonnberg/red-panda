import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { types } from 'node:util';

const require = createRequire(import.meta.url);
const Blob = require('jsdom/lib/jsdom/living/generated/Blob.js');
const FormData = require('jsdom/lib/jsdom/living/generated/FormData.js');
const URLSearchParams = require('whatwg-url/lib/URLSearchParams.js');
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const MIMEType = require('whatwg-mimetype');
const OWNERS = new WeakMap(), INSTALLED = new WeakMap();
const LIMIT = 65536;

function safelisted(type) {
  if (!type) return true;
  if (type.length > 128 || /[\x00-\x08\x0a-\x1f\x7f"():<>?@[\]{}]/.test(type)) return false;
  try { return ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'].includes(new MIMEType(type).essence); }
  catch { return false; }
}
function bodySnapshot(body, window) {
  if (body === undefined || body === null) return { bytes: Buffer.alloc(0), type: null, absent: true };
  if (Object.prototype.toString.call(body) === '[object ReadableStream]') throw new window.TypeError('sendBeacon does not support ReadableStream bodies');
  if (Blob.is(body)) { const impl = implForWrapper(body); return { bytes: Buffer.from(impl._buffer), type: impl.type || null }; }
  if (FormData.is(body)) {
    const boundary = `----redpanda-${randomUUID().replaceAll('-', '')}`, chunks = [];
    const normalize = value => String(value).replace(/\r\n|\r|\n/g, '\r\n');
    const quoted = value => normalize(value).replaceAll('\r', '%0D').replaceAll('\n', '%0A').replaceAll('"', '%22');
    for (const { name, value } of implForWrapper(body)._entries) {
      let header = `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(name)}"`;
      if (typeof value === 'string') chunks.push(Buffer.from(`${header}\r\n\r\n${normalize(value)}\r\n`));
      else {
        // FormData's pinned entries contain branded File implementations.
        header += `; filename="${quoted(value.name)}"\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`;
        chunks.push(Buffer.from(header), Buffer.from(value._buffer), Buffer.from('\r\n'));
      }
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { bytes: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
  }
  if (URLSearchParams.is(body)) {
    const value = new globalThis.URLSearchParams(URLSearchParams.convert(window, body)._list).toString();
    return { bytes: Buffer.from(value), type: 'application/x-www-form-urlencoded;charset=UTF-8' };
  }
  if (types.isSharedArrayBuffer(body) || (ArrayBuffer.isView(body) && types.isSharedArrayBuffer(body.buffer))) throw new window.TypeError('SharedArrayBuffer beacon bodies are unsupported');
  if (types.isArrayBuffer(body)) {
    try { return { bytes: Buffer.from(new Uint8Array(body)), type: null }; }
    catch { throw new window.TypeError('Cannot send a detached ArrayBuffer'); }
  }
  if (ArrayBuffer.isView(body)) {
    try { return { bytes: Buffer.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)), type: null }; }
    catch { throw new window.TypeError('Cannot send a detached buffer view'); }
  }
  // The measured native BodyInit conversion serializes a Symbol's description,
  // including the literal "undefined" for a Symbol without a description.
  if (typeof body === 'symbol') body = body.description;
  return { bytes: Buffer.from(String(body)), type: 'text/plain;charset=UTF-8' };
}
function cors(response, origin) {
  if (response.headers.get('access-control-allow-origin') !== origin || response.headers.get('access-control-allow-credentials') !== 'true') {
    throw new TypeError('Beacon CORS credentials or origin are not allowed');
  }
}

/** Install Window-only navigator.sendBeacon.
 * Disabled resource policy still validates URL/body and the per-body 64-KiB
 * limit, but sends no request and reserves no in-flight budget. Enabled requests
 * share a per-document budget until settled, use POST/include credentials, and
 * preflight non-safelisted Content-Type. Bodies snapshot synchronously.
 * Frame beacons survive frame removal by using the root transport; top-document
 * navigation/close cancels them, as observed in the native resource policy.
 * Returns {dispose,whenIdle,pending,inflightBytes,errors} for host diagnostics.
 * No delivery result or callback is exposed to page code.
 */
export function installBeacon(page, window, { enabled = false } = {}) {
  if (INSTALLED.has(window)) return INSTALLED.get(window);
  if (!window.document || !window.navigator || !window.Navigator) throw new TypeError('sendBeacon requires a Window realm');
  const root = page.registry?.page ?? page, signal = page.documentAbort?.signal;
  const rootSignal = root.documentAbort?.signal, generation = page.documentGeneration;
  const owner = { page, root, window, enabled, pending: new Set(), controllers: new Set(), bytes: 0, errors: [], disposed: false };
  OWNERS.set(window.navigator, owner);
  const live = () => !owner.disposed && !page.closed && !signal?.aborted && !!window.document && page.documentGeneration === generation;
  async function deliver(url, snapshot, metadata, controller) {
    const combined = rootSignal ? AbortSignal.any([rootSignal, controller.signal]) : controller.signal;
    combined.throwIfAborted();
    const headers = new Headers({ origin: metadata.origin });
    if (snapshot.type) headers.set('content-type', snapshot.type);
    const referrer = root.referrerFor?.(url, metadata.referrer);
    if (referrer) headers.set('referer', referrer);
    const cross = value => new URL(value).origin !== metadata.origin;
    const needsCors = !safelisted(snapshot.type);
    const common = { signal: combined, credentials: 'include', credentialsOrigin: metadata.origin,
      keepalive: true, frameId: metadata.frameId, loaderId: metadata.loaderId, skipDefaultReferrer: true };
    if (needsCors && cross(url)) {
      const response = await root.fetch(url, { ...common, method: 'OPTIONS', body: undefined, credentials: 'omit',
        headers: { origin: metadata.origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
        redirect: 'error',
      }, 'Ping');
      if (!response.ok) throw new TypeError('Beacon CORS preflight failed');
      cors(response, metadata.origin);
      const allowed = (response.headers.get('access-control-allow-headers') ?? '').split(',').map(name => name.trim().toLowerCase());
      if (!allowed.includes('content-type')) throw new TypeError('Beacon CORS preflight denied Content-Type');
    }
    combined.throwIfAborted();
    let origin = metadata.origin, method = 'POST', hasType = needsCors;
    const response = await root.fetch(url, { ...common, method: 'POST', headers,
      body: snapshot.absent ? undefined : snapshot.bytes, mode: needsCors ? 'cors' : 'no-cors',
      onRedirect(response, next, previous, redirectHeaders) {
        if (needsCors && new URL(previous).origin !== origin) cors(response, origin);
        const dropsBody = response.status === 303 || ([301, 302].includes(response.status) && method === 'POST');
        if (dropsBody) { method = 'GET'; hasType = false; }
        if (needsCors && new URL(next).origin !== origin && hasType) throw new TypeError('Beacon redirects requiring another preflight are unsupported');
        if (new URL(previous).origin !== origin && new URL(previous).origin !== new URL(next).origin) origin = 'null';
        redirectHeaders?.set('origin', origin);
        const nextReferrer = root.referrerFor?.(next, metadata.referrer);
        if (nextReferrer) redirectHeaders?.set('referer', nextReferrer); else redirectHeaders?.delete('referer');
      },
    }, 'Ping');
    if (needsCors && new URL(response.url || response.finalUrl || url).origin !== origin) cors(response, origin);
    await response.body?.cancel();
  }
  owner.invoke = (url, data, count) => {
    if (!count) throw new window.TypeError('sendBeacon requires a URL');
    if (typeof url === 'symbol') throw new window.TypeError('Cannot convert a Symbol to a URL');
    let parsed;
    try { parsed = new URL(String(url), window.document?.baseURI ?? page.url); }
    catch { throw new window.TypeError('Invalid beacon URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new window.TypeError('Beacon URL must use HTTP or HTTPS');
    const snapshot = bodySnapshot(data, window);
    if (snapshot.bytes.length > LIMIT) return false;
    if (!live()) return false;
    if (!owner.enabled) return true;
    if (owner.bytes + snapshot.bytes.length > LIMIT) return false;
    // URL credentials are accepted by the observed API, but are not exposed in
    // the transport URL. HTTP authentication challenge negotiation is not added.
    parsed.username = ''; parsed.password = ''; parsed.hash = '';
    const metadata = { origin: implForWrapper(window.document)._origin ?? window.location.origin,
      referrer: window.location.href, frameId: page.frameId ?? page.id, loaderId: page.loaderId };
    const controller = new AbortController(); owner.controllers.add(controller); owner.bytes += snapshot.bytes.length;
    const pending = deliver(parsed.href, snapshot, metadata, controller).catch(error => {
      if (owner.errors.length >= 32) owner.errors.shift(); owner.errors.push(error);
    }).finally(() => { owner.bytes -= snapshot.bytes.length; owner.controllers.delete(controller); owner.pending.delete(pending); });
    owner.pending.add(pending); return true;
  };
  function sendBeacon(url, data = undefined) {
    const receiver = OWNERS.get(this);
    if (!receiver) throw new window.TypeError('Illegal invocation');
    return receiver.invoke(url, data, arguments.length);
  }
  Object.defineProperty(window.Navigator.prototype, 'sendBeacon', { value: sendBeacon, writable: true, configurable: true, enumerable: true });
  function dispose() {
    if (owner.disposed) return;
    owner.disposed = true;
    // Removing a frame must not cancel already queued beacons. A root document
    // teardown, in contrast, cancels the page's entire keepalive transport.
    if (root === page) for (const controller of owner.controllers) controller.abort();
    signal?.removeEventListener('abort', dispose);
    if (window.close === close) window.close = previousClose;
  }
  const previousClose = window.close;
  const close = function (...args) { dispose(); return previousClose.apply(this, args); };
  window.close = close;
  signal?.addEventListener('abort', dispose, { once: true });
  const api = { dispose, whenIdle: () => Promise.all([...owner.pending]), get pending() { return owner.pending.size; },
    get inflightBytes() { return owner.bytes; }, get errors() { return [...owner.errors]; } };
  INSTALLED.set(window, api); return api;
}
