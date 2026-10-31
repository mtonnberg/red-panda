import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Pinned jsdom26 exposes immutable Blob/File bytes through its branded impl.
// No Node object-URL store or host filesystem URLs are exposed to documents.
const require = createRequire(import.meta.url);
const BlobInterface = require('jsdom/lib/jsdom/living/generated/Blob.js');
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const registries = new WeakMap(), documents = new WeakMap(), current = new WeakMap(), origins = new WeakMap();

export class BlobURLFetchError extends TypeError {
  constructor() { super('Failed to fetch object URL'); this.code = 'ERR_BLOB_URL_UNAVAILABLE'; }
}

function sandboxed(window) {
  try {
    const element = window.frameElement;
    return element?.hasAttribute('sandbox') && !element.getAttribute('sandbox').toLowerCase().split(/\s+/).includes('allow-same-origin');
  } catch { return false; }
}
function originFor(window) {
  const document = window.document;
  const previous = origins.get(document);
  let serialized;
  try { serialized = implForWrapper(document)._origin; } catch {}
  serialized ??= window.location.origin;
  const actualOrigin = serialized;
  // Frame windows exist before redirected HTTP responses commit their actual
  // origin. Observe that private document value, not mutable window.origin.
  // A sandbox's opaque identity is fixed for this document, even if its iframe
  // attributes are subsequently changed or a redirect commits a tuple origin.
  if (previous && (previous.sandboxed || previous.actualOrigin === actualOrigin)) return previous;
  const isSandboxed = previous?.sandboxed ?? sandboxed(window);
  let identity;
  if (isSandboxed) { serialized = 'null'; identity = {}; }
  else if (serialized !== 'null') identity = serialized;
  else {
    let parent;
    try { parent = window.parent !== window ? window.parent : null; } catch {}
    // Unsandboxed blank/srcdoc frames inherit even an opaque parent's identity.
    // Independent data: documents have separate identities despite both saying null.
    if (parent && ['about:blank', 'about:srcdoc'].includes(window.location.href)) {
      const inherited = originFor(parent); identity = inherited.identity; serialized = inherited.serialized;
    } else identity = {};
  }
  const result = { serialized, identity, actualOrigin, sandboxed: isSandboxed }; origins.set(document, result); return result;
}
function contextActive(page, context) {
  if (!context || page.context !== context) return false;
  return !page.browser?.contexts || page.browser.contexts.get(context.id) === context;
}
function active(owner) {
  return !owner.disposed && !owner.page.closed && !owner.signal?.aborted && contextActive(owner.page, owner.context);
}
function parsed(input) {
  let url;
  try { url = new URL(String(input)); } catch { return null; }
  return url.protocol === 'blob:' ? url : null;
}
function remove(record) {
  record.registry.delete(record.url); record.owner.urls.delete(record.url);
}
function refreshOrigin(owner) {
  if (owner.disposed) return owner.origin;
  const latest = originFor(owner.window);
  if (latest.identity !== owner.origin.identity || latest.serialized !== owner.origin.serialized) {
    for (const url of owner.urls) owner.registry.delete(url);
    owner.urls.clear();
  }
  owner.origin = latest; return latest;
}

/**
 * Install document-owned object URLs. Context/origin peers may resolve/revoke;
 * document disposal revokes only URLs created by that document. Returns a
 * controller whose dispose() is idempotent and whose size counts owned URLs.
 */
export function installBlobURLs(page, window) {
  if (!page?.context || !window?.document || !window.URL) throw new TypeError('A browser Page, context and DOM window are required');
  const previous = documents.get(window.document);
  if (previous) {
    if (previous.page !== page || previous.context !== page.context) throw new TypeError('Document already belongs to another object URL context');
    return previous.controller;
  }
  let registry = registries.get(page.context);
  if (!registry) { registry = new Map(); registries.set(page.context, registry); }
  const origin = originFor(window);
  const owner = { page, window, context: page.context, signal: page.documentAbort?.signal,
    registry, origin, urls: new Set(), disposed: false };
  function dispose() {
    if (owner.disposed) return;
    owner.disposed = true;
    for (const url of owner.urls) registry.delete(url);
    owner.urls.clear();
    owner.signal?.removeEventListener('abort', dispose);
    page.off?.('close', dispose);
  }
  const methods = {
    createObjectURL(blob) {
      if (!arguments.length) throw new window.TypeError("Failed to execute 'createObjectURL': 1 argument required");
      if (!active(owner)) throw new window.DOMException('The document is no longer active', 'InvalidStateError');
      const origin = refreshOrigin(owner);
      const implementation = BlobInterface.convert(window, blob, { context: 'The object URL argument' });
      const url = `blob:${origin.serialized}/${randomUUID()}`;
      const record = { url, registry, owner, origin: origin.identity,
        bytes: Buffer.from(implementation._buffer), mimeType: implementation.type };
      registry.set(url, record); owner.urls.add(url); return url;
    },
    revokeObjectURL(value) {
      if (!arguments.length) throw new window.TypeError("Failed to execute 'revokeObjectURL': 1 argument required");
      if (typeof value === 'symbol') throw new window.TypeError('Cannot convert a Symbol value to a string');
      const url = parsed(value);
      if (!url || !active(owner)) return;
      const origin = refreshOrigin(owner);
      // Native revocation uses the complete URL: adding a fragment is a no-op.
      const record = registry.get(url.href);
      if (record && record.origin === origin.identity) remove(record);
    },
  };
  Object.defineProperties(window.URL, Object.fromEntries(Object.entries(methods).map(([name, value]) =>
    [name, { value, writable: true, configurable: true, enumerable: true }])));
  const nativeClose = window.close;
  if (typeof nativeClose === 'function') window.close = function close(...args) { dispose(); return Reflect.apply(nativeClose, this, args); };
  owner.controller = { dispose, get size() { refreshOrigin(owner); return owner.urls.size; }, get disposed() { return owner.disposed; } };
  documents.set(window.document, owner); current.set(page, owner);
  owner.signal?.addEventListener('abort', dispose, { once: true });
  page.once?.('close', dispose);
  if (owner.signal?.aborted || page.closed) dispose();
  return owner.controller;
}

/**
 * Resolve synchronously and snapshot bytes before any await/network work.
 * A returned snapshot survives later revocation or creator disposal; later
 * resolutions fail. Every call returns a fresh Uint8Array safe to transfer.
 */
export function resolveBlobURL(page, input) {
  const owner = current.get(page), url = parsed(input);
  if (!owner || !url || !active(owner)) throw new BlobURLFetchError();
  refreshOrigin(owner);
  const requestedURL = url.href;
  url.hash = '';
  const record = owner.registry.get(url.href);
  if (record && active(record.owner)) refreshOrigin(record.owner);
  if (!record || owner.registry.get(url.href) !== record || record.origin !== owner.origin.identity || !active(record.owner)) {
    if (record && !active(record.owner)) remove(record);
    throw new BlobURLFetchError();
  }
  return { bytes: Uint8Array.from(record.bytes), mimeType: record.mimeType, url: requestedURL };
}
