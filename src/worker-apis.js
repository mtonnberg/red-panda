import { installFileReaderSync } from './file-reader-sync.js';
import { installWebSocket } from './worker-websocket.js';
import { installWorkerXHR } from './worker-xhr.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const documentTrust = new WeakMap();
const trustworthyDocument=document=>isPotentiallyTrustworthy(document?._origin??'null')||documentTrust.get(document)===true;

export function isPotentiallyTrustworthy(input) {
  try {
    const url = new URL(input), host = url.hostname.toLowerCase();
    return ['https:', 'wss:'].includes(url.protocol) ||
      (['http:', 'ws:'].includes(url.protocol) && (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)));
  } catch { return false; }
}

/** Capture real Document identity before authored code. Resolve private current
 * state at construction, so redirects/legitimate base elements remain live.
 * Public origin/isSecureContext/baseURI overrides never select the principal.
 */
export function captureWorkerCreator(page, window, {opaqueTopLevelBlank=false}={}) {
  const document = implForWrapper(window.document), baseURL = document.baseURLSerialized;
  // Only the genuine top-level creation hook may seed an opaque blank document.
  // Capture before authored code: a History URL rewrite cannot grant this trust.
  if(!documentTrust.has(document))documentTrust.set(document,opaqueTopLevelBlank&&!page.parentFrameId&&document._origin==='null'&&document.URL==='about:blank');
  return () => {
    const origin = document._origin ?? 'null'; let secure = trustworthyDocument(document), owner = page;
    const seen = new Set();
    while (secure && owner?.parentFrameId && !seen.has(owner)) {
      seen.add(owner); owner = owner.registry?.findFrame(owner.parentFrameId);
      if (!owner?.dom?.window) { secure = false; break; }
      const ancestor = implForWrapper(owner.dom.window.document);
      secure = trustworthyDocument(ancestor);
    }
    return Object.freeze({ origin, secure, baseURL: Reflect.apply(baseURL, document, []) });
  };
}

/** Before authored worker code; secure is the real creator-context decision.
 * Service-worker integration passes dedicated:false and receives sockets only.
 */
export function installWorkerAPIs(realm, options = {}) {
  const { dedicated = true, secure = false, signal } = options;
  Object.defineProperty(realm, 'isSecureContext', { get: () => Boolean(secure), enumerable: true, configurable: true });
  const socket = installWebSocket(realm, options);
  const xhr = dedicated ? (installFileReaderSync(realm, options), installWorkerXHR(realm, options)) : null;
  const dispose = () => { socket.dispose(); xhr?.dispose(); signal?.removeEventListener('abort', dispose); };
  signal?.addEventListener('abort', dispose, { once: true }); return { dispose };
}
