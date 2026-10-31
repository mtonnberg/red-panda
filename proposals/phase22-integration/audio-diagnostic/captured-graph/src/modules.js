import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createInternalMutationObserver } from './mutations.js';

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
// Import maps support inline imports/scopes registered before the first module
// graph starts. External maps and late map registration fail explicitly.
// Limits: JSON modules, CORS policy and ordering against classic
// external defer scripts are not implemented by this adapter. Classic dynamic
// import outside a SourceTextModule still needs its own VM import callback.
export function installModuleScripts(page, window) {
  const document = window.document;
  const signal = page.documentAbort?.signal;
  const cache = new Map(), metadata = new WeakMap(), evaluating = new WeakMap(), seen = new WeakSet();
  const imports = new Map(), scopes = new Map();
  const cycles = new Set();
  let parseCycle;
  let context, observer, disposed = false, graphStarted = false, inlineCount = 0, linkQueue = Promise.resolve();
  let releaseAbort;
  const aborted = new Promise(resolve => { releaseAbort = resolve; });
  Object.defineProperty(window.HTMLScriptElement, 'supports', { configurable: true, writable: true,
    value: function supports(type) {
      if (!arguments.length) throw new TypeError('HTMLScriptElement.supports requires a script type');
      return ['classic', 'module', 'importmap'].includes('' + type);
    } });
  const active = () => !disposed && !signal?.aborted && !page.closed;
  const check = () => { if (!active()) throw new DOMException('Document was disposed', 'AbortError'); };
  function dispose() { disposed = true; observer?.disconnect(); releaseAbort(); for (const cycle of cycles) cycle.resolveReady(); }
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
  function urlLike(specifier, base) {
    if (/^(?:\/|\.\/|\.\.\/)/.test(specifier)) return new URL(specifier, base);
    try { return new URL(specifier); } catch { return undefined; }
  }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function normalizeMappings(values, base, script) {
    if (!object(values)) throw new TypeError('Import-map specifier maps must be objects');
    const result = new Map();
    for (const [key, address] of Object.entries(values)) {
      if (!key) { report(new TypeError('Import-map specifier keys must not be empty'), script); continue; }
      let normalized;
      try { normalized = urlLike(key, base)?.href ?? key; }
      catch { report(new TypeError(`Invalid import-map specifier key: ${key}`), script); continue; }
      let target = null;
      if (address !== null) {
        try {
          if (typeof address !== 'string') throw new TypeError();
          target = urlLike(address, base)?.href;
          if (!target || (normalized.endsWith('/') && !target.endsWith('/'))) throw new TypeError();
        } catch { target = null; report(new TypeError(`Invalid import-map address for ${key}`), script); }
      }
      result.set(normalized, target);
    }
    return result;
  }
  function registerMap(script) {
    try {
      if (script.hasAttribute('src')) throw new TypeError('External import maps are not supported');
      if (graphStarted) throw new TypeError('Import maps registered after module execution starts are not supported');
      const parsed = JSON.parse(script.textContent);
      if (!object(parsed)) throw new TypeError('Import maps must contain a JSON object');
      const base = document.baseURI;
      const nextImports = parsed.imports === undefined ? new Map() : normalizeMappings(parsed.imports, base, script);
      if (parsed.scopes !== undefined && !object(parsed.scopes)) throw new TypeError('Import-map scopes must be an object');
      const nextScopes = new Map();
      for (const [prefix, values] of Object.entries(parsed.scopes ?? {})) {
        let scope;
        try { scope = new URL(prefix, base).href; }
        catch { report(new TypeError(`Invalid import-map scope: ${prefix}`), script); continue; }
        nextScopes.set(scope, normalizeMappings(values, base, script));
      }
      const merge = (target, source) => { for (const [key, value] of source) if (!target.has(key)) target.set(key, value); };
      merge(imports, nextImports);
      for (const [prefix, values] of nextScopes) {
        if (!scopes.has(prefix)) scopes.set(prefix, new Map());
        merge(scopes.get(prefix), values);
      }
    } catch (error) { report(error, script); }
  }
  function mappedSpecifier(specifier, map) {
    let key = map.has(specifier) ? specifier : [...map.keys()].filter(key => key.endsWith('/') && specifier.startsWith(key)).sort((a, b) => b.length - a.length)[0];
    if (key === undefined) return undefined;
    const target = map.get(key);
    if (target === null) throw new TypeError(`Import map blocked module specifier: ${specifier}`);
    if (key === specifier) return target;
    const result = new URL(specifier.slice(key.length), target).href;
    if (!result.startsWith(target)) throw new TypeError(`Import-map prefix resolution escaped its target: ${specifier}`);
    return result;
  }
  function resolveSpecifier(specifier, base) {
    specifier = String(specifier);
    const candidate = urlLike(specifier, base);
    const normalized = candidate?.href ?? specifier;
    let resolved;
    for (const prefix of [...scopes.keys()].sort((a, b) => b.length - a.length)) {
      if (base !== prefix && !(prefix.endsWith('/') && base.startsWith(prefix))) continue;
      resolved = mappedSpecifier(normalized, scopes.get(prefix));
      if (resolved !== undefined) break;
    }
    resolved ??= mappedSpecifier(normalized, imports);
    if (resolved === undefined && !candidate) throw new TypeError(`Unmapped bare module specifier: ${specifier}`);
    const url = new URL(resolved ?? candidate.href);
    if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) throw new TypeError(`Unsupported module URL scheme: ${url.protocol}`);
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
  function track(task, cycle) {
    cycle.tasks.add(task); task.then(() => cycle.tasks.delete(task), () => cycle.tasks.delete(task)); return task;
  }
  function execute(script, prepared, cycle = parseCycle) {
    return track((async () => {
      try {
        const module = await prepared;
        await evaluate(module);
        if (active() && script.hasAttribute('src')) script.dispatchEvent(new window.Event('load'));
      } catch (error) { report(error, script); }
    })(), cycle);
  }
  function discover(root = document, includeParser = false) {
    const candidates = root.nodeType === 1 && root.localName === 'script' ? [root] : [];
    candidates.push(...root.querySelectorAll?.('script') ?? []);
    return candidates.filter(script => {
      if (!script.isConnected || !['module', 'importmap'].includes(script.getAttribute('type')?.trim().toLowerCase()) || seen.has(script)) return false;
      if (!includeParser && !parseCycle.started && implForWrapper(script)._parserInserted) return false;
      seen.add(script); return true;
    });
  }
  async function begin(cycle = parseCycle) {
    if (cycle.started || cycle !== parseCycle) return;
    cycle.started = true;
    if (!active() || page.javascript === false) { cycle.resolveReady(); return; }
    // Fetch roots eagerly, then initiate their evaluations in document order.
    // Suspended top-level await does not hold DOMContentLoaded hostage.
    const scripts = discover(document, true), prepared = scripts.map(script => script.getAttribute('type').trim().toLowerCase() === 'importmap' ? Promise.resolve() : Promise.resolve().then(() => prepare(script)));
    prepared.forEach(promise => promise.catch(() => {}));
    for (let index = 0; index < scripts.length; index++) {
      if (!active() || cycle !== parseCycle) break;
      const script = scripts[index];
      if (script.getAttribute('type').trim().toLowerCase() === 'importmap') { registerMap(script); continue; }
      graphStarted = true;
      if (script.hasAttribute('async')) {
        const initiated = prepared[index].then(link).then(module => { startEvaluation(module); return true; });
        impl._asyncQueue.push(initiated, () => Promise.resolve(), () => Promise.resolve());
        execute(script, prepared[index], cycle); continue;
      }
      try {
        const module = await prepared[index];
        await link(module);
        check();
        if (cycle !== parseCycle) break;
        startEvaluation(module);
        execute(script, Promise.resolve(module), cycle);
      } catch (error) { report(error, script); }
    }
    if (!observer) {
    observer = createInternalMutationObserver(window, records => {
      if (!active()) return;
      for (const record of records) {
        if (record.type === 'attributes') {
          for (const script of discover(record.target)) startScript(script);
        } else for (const node of record.addedNodes) {
          for (const script of discover(node)) startScript(script);
        }
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'type'] });
    }
    for (const script of discover()) startScript(script);
    void (async () => {
      while (active() && cycle.tasks.size) await Promise.race([Promise.all([...cycle.tasks]), aborted]);
      cycle.resolveReady();
    })();
  }
  function startScript(script) {
    if (script.getAttribute('type').trim().toLowerCase() === 'importmap') registerMap(script);
    else { graphStarted = true; execute(script, Promise.resolve().then(() => prepare(script))); }
  }
  const impl = implForWrapper(document);
  if (!impl?._deferQueue) throw new Error('Pinned jsdom deferred script queue is unavailable');
  // Register before parsing, rather than listening for DOMContentLoaded after it
  // has already fired. All errors are observed; script failures do not wedge load.
  function beginParseCycle(queue, token = null) {
    if (parseCycle && !parseCycle.started) parseCycle.resolveReady();
    let resolve;
    const cycle = { token, started: false, tasks: new Set(), done: false, ready: new Promise(done => { resolve = done; }),
      resolveReady() { if (!cycle.done) { cycle.done = true; cycles.delete(cycle); resolve(); } } };
    cycles.add(cycle); parseCycle = cycle; page.moduleReady = cycle.ready;
    queue.push(Promise.resolve(), () => begin(cycle).catch(error => { report(error); cycle.resolveReady(); }), null, false);
    return cycle.ready;
  }
  beginParseCycle(impl._deferQueue);
  return { get ready() { return parseCycle.ready; }, start: () => begin(parseCycle), beginParseCycle, dispose };
}
