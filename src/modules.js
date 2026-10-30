import vm from 'node:vm';
import { createRequire } from 'node:module';

// This adapter intentionally targets the pinned jsdom dependency. Its deferred
// resource queue lets module evaluation begin before the real DOMContentLoaded.
const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const javascriptMIME = /^(?:text|application)\/(?:javascript|ecmascript|x-javascript)(?:\s*;|$)/i;

// Install in JSDOM.beforeParse; page.dom must be assigned before its queued
// parser-completion microtasks run. page.fetch, documentAbort and emit(pageError)
// are host-only dependencies and are never stored on the page's window.
// page.moduleReady waits initial evaluation, including top-level await. Native
// DOMContentLoaded/load wait graph initiation, so modules may await those events.
// Limits: import maps/JSON modules, CORS policy and ordering against classic
// external defer scripts are not implemented by this adapter. Classic dynamic
// import outside a SourceTextModule still needs its own VM import callback.
export function installModuleScripts(page, window) {
  const document = window.document;
  const signal = page.documentAbort?.signal;
  const cache = new Map(), metadata = new WeakMap(), evaluating = new WeakMap(), seen = new WeakSet();
  const tasks = new Set();
  let context, observer, started = false, disposed = false, inlineCount = 0, linkQueue = Promise.resolve();
  let resolveReady, releaseAbort;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const aborted = new Promise(resolve => { releaseAbort = resolve; });
  page.moduleReady = ready;
  const active = () => !disposed && !signal?.aborted && !page.closed;
  const check = () => { if (!active()) throw new DOMException('Document was disposed', 'AbortError'); };
  function dispose() { disposed = true; observer?.disconnect(); releaseAbort(); resolveReady(); }
  signal?.addEventListener('abort', dispose, { once: true });
  function report(error, script) {
    if (!active()) return;
    page.emit('pageError', error);
    const event = new window.ErrorEvent('error', { message: String(error.message ?? error), error, cancelable: true });
    window.dispatchEvent(event);
    script?.dispatchEvent(new window.Event('error'));
  }
  function moduleContext() {
    if (!context) {
      if (!page.dom || page.dom.window !== window) throw new Error('Module document has no matching VM context');
      context = page.dom.getInternalVMContext();
    }
    return context;
  }
  function resolveSpecifier(specifier, base) {
    if (!/^(?:[./]|[a-zA-Z][a-zA-Z\d+.-]*:)/.test(specifier)) throw new TypeError(`Unmapped bare module specifier: ${specifier}`);
    const url = new URL(specifier, base);
    if (!['http:', 'https:', 'data:'].includes(url.protocol)) throw new TypeError(`Unsupported module URL scheme: ${url.protocol}`);
    return url.href;
  }
  function compile(source, url, identifier = url, base = url) {
    check();
    if (typeof vm.SourceTextModule !== 'function') throw new Error('Page modules require Node --experimental-vm-modules');
    const module = new vm.SourceTextModule(source, {
      context: moduleContext(), identifier,
      initializeImportMeta(meta) {
        meta.url = url;
        meta.resolve = specifier => resolveSpecifier(String(specifier), base);
      },
      importModuleDynamically: async (specifier, referencingModule, attributes = {}) => {
        checkAttributes(attributes);
        const dependency = await load(resolveSpecifier(specifier, metadata.get(referencingModule).base), metadata.get(referencingModule).url);
        await evaluate(dependency);
        check();
        return dependency;
      },
    });
    metadata.set(module, { url, base });
    return module;
  }
  function checkAttributes(attributes) {
    const values = attributes?.attributes ?? attributes;
    if (values && Object.keys(values).length) throw new TypeError('Module import attributes are not supported');
  }
  function load(url, referrer = document.URL) {
    if (cache.has(url)) return cache.get(url);
    const pending = (async () => {
      check();
      const headers = { accept: '*/*' };
      const referer = page.referrerFor?.(url, referrer);
      if (referer) headers.referer = referer;
      const response = await page.fetch(url, { signal, headers }, 'Script');
      check();
      if (!response.ok) throw new Error(`Module load failed (${response.status}): ${url}`);
      const mime = response.headers.get('content-type') ?? '';
      if (!javascriptMIME.test(mime)) throw new TypeError(`Module has unsupported MIME type ${JSON.stringify(mime)}: ${url}`);
      const finalURL = response.url || url;
      const source = await response.text();
      check();
      if (finalURL !== url && cache.has(finalURL)) return cache.get(finalURL);
      const module = compile(source, finalURL);
      if (finalURL !== url) cache.set(finalURL, Promise.resolve(module));
      return module;
    })();
    cache.set(url, pending);
    // Fetches can begin before document-ordered execution reaches this script.
    pending.catch(() => {});
    return pending;
  }
  function link(module) {
    const pending = linkQueue.then(async () => {
      check();
      if (module.status === 'unlinked') await module.link((specifier, parent, attributes) => {
        checkAttributes(attributes);
        return load(resolveSpecifier(specifier, metadata.get(parent).base), metadata.get(parent).url);
      });
      if (module.status === 'errored') throw module.error;
      return module;
    });
    linkQueue = pending.catch(() => {});
    return pending;
  }
  function startEvaluation(module) {
    if (!evaluating.has(module)) {
      check();
      const result = module.evaluate().then(() => { check(); return module; });
      evaluating.set(module, result);
      result.catch(() => {});
    }
    return evaluating.get(module);
  }
  async function evaluate(module) { await link(module); return startEvaluation(module); }
  function prepare(script) {
    const base = document.baseURI;
    if (script.hasAttribute('src')) {
      const src = script.getAttribute('src');
      if (!src?.trim()) return Promise.reject(new TypeError('Module script src must not be empty'));
      return load(new URL(src, base).href);
    }
    return Promise.resolve().then(() => compile(script.textContent, document.URL,
      `${document.URL}#red-panda-inline-module-${++inlineCount}`, base));
  }
  function track(task) {
    tasks.add(task); task.then(() => tasks.delete(task), () => tasks.delete(task)); return task;
  }
  function execute(script, prepared) {
    return track((async () => {
      try {
        const module = await prepared;
        await evaluate(module);
        if (active() && script.hasAttribute('src')) script.dispatchEvent(new window.Event('load'));
      } catch (error) { report(error, script); }
    })());
  }
  function discover(root = document) {
    const candidates = root.nodeType === 1 && root.localName === 'script' ? [root] : [];
    candidates.push(...root.querySelectorAll?.('script') ?? []);
    return candidates.filter(script => {
      if (!script.isConnected || script.getAttribute('type')?.trim().toLowerCase() !== 'module' || seen.has(script)) return false;
      seen.add(script); return true;
    });
  }
  async function begin() {
    if (started) return;
    started = true;
    if (!active() || page.javascript === false) { resolveReady(); return; }
    // Fetch roots eagerly, then initiate their evaluations in document order.
    // Suspended top-level await does not hold DOMContentLoaded hostage.
    const scripts = discover(), prepared = scripts.map(script => Promise.resolve().then(() => prepare(script)));
    prepared.forEach(promise => promise.catch(() => {}));
    for (let index = 0; index < scripts.length; index++) {
      if (!active()) break;
      const script = scripts[index];
      if (script.hasAttribute('async')) {
        const initiated = prepared[index].then(link).then(module => { startEvaluation(module); return true; });
        impl._asyncQueue.push(initiated, () => Promise.resolve(), () => Promise.resolve());
        execute(script, prepared[index]); continue;
      }
      try {
        const module = await prepared[index];
        await link(module);
        check();
        startEvaluation(module);
        execute(script, Promise.resolve(module));
      } catch (error) { report(error, script); }
    }
    observer = new window.MutationObserver(records => {
      if (!active()) return;
      for (const record of records) {
        if (record.type === 'attributes') {
          for (const script of discover(record.target)) execute(script, Promise.resolve().then(() => prepare(script)));
        } else for (const node of record.addedNodes) {
          for (const script of discover(node)) execute(script, Promise.resolve().then(() => prepare(script)));
        }
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'type'] });
    for (const script of discover()) execute(script, Promise.resolve().then(() => prepare(script)));
    void (async () => {
      while (active() && tasks.size) await Promise.race([Promise.all([...tasks]), aborted]);
      resolveReady();
    })();
  }
  const impl = implForWrapper(document);
  if (!impl?._deferQueue) throw new Error('Pinned jsdom deferred script queue is unavailable');
  // Register before parsing, rather than listening for DOMContentLoaded after it
  // has already fired. All errors are observed; script failures do not wedge load.
  impl._deferQueue.push(Promise.resolve(), () => begin().catch(error => { report(error); resolveReady(); }), null, false);
  return { ready, start: begin, dispose };
}
