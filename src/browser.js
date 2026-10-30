import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { JSDOM, CookieJar, ResourceLoader, VirtualConsole } from 'jsdom';
import { installInput } from './input.js';
import { installLayout } from './layout.js';
import { installIntersection } from './intersection.js';
import { installNavigation } from './navigation.js';
import { installModuleScripts } from './modules.js';

export const VERSION = '0.1.0';
const now = () => performance.now() / 1000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function until(predicate, { timeout = 10000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  while (true) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout}ms`);
    await delay(Math.min(interval, Math.max(1, deadline - Date.now())));
  }
}

export function withTimeout(promise, timeout, message = 'Operation timed out') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); }),
  ]).finally(() => clearTimeout(timer));
}

class PageResources extends ResourceLoader {
  constructor(page) { super({ userAgent: page.userAgent }); this.page = page; }
  fetch(url, options = {}) {
    const abort = new AbortController();
    const headers = new Headers();
    if (options.accept) headers.set('accept', options.accept);
    const referrer = this.page.referrerFor(url, options.referrer);
    if (referrer) headers.set('referer', referrer);
    const type = options.element?.localName === 'script' ? 'Script' : options.element?.localName === 'link' ? 'Stylesheet' : 'Other';
    const request = this.page.fetch(url, { headers, signal: abort.signal }, type).then(async response => {
      request.response = { statusCode: response.status, headers: Object.fromEntries(response.headers) };
      request.href = response.url;
      // The shared transport already updated the CookieJar, including separate
      // Set-Cookie headers. Avoid jsdom re-importing their combined header value.
      delete request.response.headers['set-cookie'];
      if (!response.ok) throw new Error(`Resource was not loaded. Status: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    });
    request.abort = () => abort.abort();
    request.getHeader = name => headers.get(name) ?? this.page.extraHTTPHeaders.get(name);
    return request;
  }
}

export class Browser extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.contexts = new Map([['default', { id: 'default', cookies: new CookieJar() }]]);
    this.pages = new Map();
    this.nextExecutionContext = 1;
  }
  createContext() {
    const id = randomUUID();
    this.contexts.set(id, { id, cookies: new CookieJar() });
    return id;
  }
  createPage(contextId = 'default') {
    const context = this.contexts.get(contextId);
    if (!context) throw new Error('Unknown browser context');
    const page = new Page(this, context);
    this.pages.set(page.id, page);
    page.once('close', () => { this.pages.delete(page.id); this.emit('targetDestroyed', page); });
    this.emit('targetCreated', page);
    return page;
  }
  disposeContext(id) {
    if (id === 'default' || !this.contexts.has(id)) throw new Error('Unknown disposable browser context');
    for (const page of [...this.pages.values()]) if (page.context.id === id) page.close();
    this.contexts.delete(id);
  }
  close() { for (const page of [...this.pages.values()]) page.close(); }
}

export class Page extends EventEmitter {
  constructor(browser, context) {
    super();
    this.browser = browser;
    this.context = context;
    this.id = randomUUID();
    this.frameId = this.id;
    this.loaderId = randomUUID();
    this.executionContextId = browser.nextExecutionContext++;
    this.url = 'about:blank';
    this.userAgent = browser.options.userAgent ?? `RedPanda/${VERSION}`;
    this.acceptLanguage = 'en-US';
    this.platform = 'Linux x86_64';
    this.extraHTTPHeaders = new Headers();
    this.timeout = browser.options.timeout ?? 10000;
    this.javascript = browser.options.javascript !== false;
    this.activeRequests = new Set();
    this.lastActivity = Date.now();
    this.history = [];
    this.historyIndex = -1;
    this.nextHistoryId = 1;
    this.documentId = randomUUID();
    this.documentGeneration = 0;
    this.documentAbort = new AbortController();
    this.closed = false;
    this.navigationGeneration = 0;
    this.newDocumentScripts = new Map();
    this.dom = this.createDOM('<!doctype html><html><head></head><body></body></html>');
  }

  createDOM(html, historyState = null) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => this.emit('pageError', error));
    for (const type of ['log', 'info', 'warn', 'error', 'debug']) {
      virtualConsole.on(type, (...args) => this.emit('console', { type, args }));
    }
    return new JSDOM(html, {
      url: this.url,
      cookieJar: this.context.cookies,
      runScripts: this.javascript ? 'dangerously' : 'outside-only',
      resources: this.javascript ? new PageResources(this) : undefined,
      virtualConsole,
      pretendToBeVisual: true,
      beforeParse: window => {
        installInput(window);
        installIntersection(this, window, installLayout(this, window, this.viewport));
        // Fetch is missing from jsdom. Preserve the page's URL and cookie jar.
        const generation = this.documentGeneration;
        const navigationSignal = this.documentAbort.signal;
        window.fetch = (input, init = {}) => new window.Promise((resolve, reject) => {
          const callerSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
          const signal = navigationSignal && callerSignal ? AbortSignal.any([navigationSignal, callerSignal]) : navigationSignal ?? callerSignal;
          const active = () => !this.closed && this.documentGeneration === generation;
          // A disposed document must never resume page callbacks. Observe the native
          // rejection even after teardown, while leaving its realm promise unsettled.
          this.fetch(input, { ...init, signal }, 'Fetch').then(
            value => { if (active()) resolve(value); },
            error => { if (active()) reject(error); },
          );
        });
        window.Headers = Headers;
        window.Request = Request;
        window.Response = Response;
        window.AbortController = AbortController;
        window.AbortSignal = AbortSignal;
        window.TextEncoder = TextEncoder;
        window.TextDecoder = TextDecoder;
        window.structuredClone = structuredClone;
        this.installHistory(window, historyState);
        installNavigation(this, window);
        installModuleScripts(this, window);
        Object.defineProperty(window.navigator, 'userAgent', { get: () => this.userAgent });
        Object.defineProperty(window.navigator, 'language', { get: () => this.acceptLanguage.split(',')[0].split(';')[0].trim() });
        Object.defineProperty(window.navigator, 'languages', { get: () => Object.freeze(this.acceptLanguage.split(',').map(value => value.split(';')[0].trim()).filter(Boolean)) });
        Object.defineProperty(window.navigator, 'platform', { get: () => this.platform });
        for (const { source } of this.newDocumentScripts.values()) {
          try { window.eval(source); } catch (error) { this.emit('pageError', error); }
        }
      },
    });
  }

  requestStarted(url, type = 'Document', method = 'GET', headers = {}, redirectResponse) {
    const id = type === 'Document' ? this.loaderId : randomUUID();
    this.activeRequests.add(id);
    this.lastActivity = Date.now();
    this.emit('request', { id, url, type, method, headers, timestamp: now(), redirectResponse });
    return id;
  }

  installHistory(window, state) {
    const nativePush = window.history.pushState.bind(window.history);
    const nativeReplace = window.history.replaceState.bind(window.history);
    const nativeState = Object.getOwnPropertyDescriptor(window.History.prototype, 'state').get.bind(window.history);
    if (state !== null) nativeReplace(structuredClone(state), '', window.location.href);
    this.nativeHistoryReplace = nativeReplace;
    Object.defineProperty(window.history, 'length', { get: () => Math.max(1, this.history.length) });
    Object.defineProperty(window.history, 'state', { get: () => nativeState() ?? null });
    for (const [name, native] of [['pushState', nativePush], ['replaceState', nativeReplace]]) {
      window.history[name] = (...args) => {
        const input = [...args];
        if (input.length) input[0] = structuredClone(input[0]);
        const result = native(...input);
        this.commitHistory(window.location.href, window.history.state, name === 'pushState' ? 'push' : 'replace');
        this.url = window.location.href;
        this.emit('withinDocument', { url: this.url, navigationType: 'historyApi' });
        return result;
      };
    }
    window.addEventListener('hashchange', () => this.reconcileURL(window));
    for (const [name, fixedDelta] of [['back', -1], ['forward', 1], ['go', undefined]]) {
      window.history[name] = (delta = 0) => {
        const distance = fixedDelta ?? Math.trunc(Number(delta) || 0);
        if (!Number.isFinite(distance)) return;
        window.setTimeout(() => {
          if (this.closed || this.dom.window !== window) return;
          const action = distance === 0 ? this.navigate(this.url, { historyMode: 'reload' }) : this.traverseHistory(this.historyIndex + distance);
          action.catch(error => this.emit('pageError', error));
        }, 0);
      };
    }
  }

  commitHistory(url, state = null, mode = 'push') {
    const entry = { id: this.nextHistoryId++, url, state: structuredClone(state), documentId: this.documentId };
    if (mode === 'replace' && this.historyIndex >= 0) this.history[this.historyIndex] = entry;
    else {
      this.history.splice(this.historyIndex + 1);
      this.history.push(entry);
      this.historyIndex = this.history.length - 1;
    }
  }

  reconcileURL(window = this.dom.window, { historyMode = 'push' } = {}) {
    if (this.closed || window !== this.dom.window || window.location.href === this.url) return;
    this.url = window.location.href;
    this.commitHistory(this.url, window.history.state, historyMode);
    this.emit('withinDocument', { url: this.url, navigationType: 'fragment' });
  }

  navigationHistory() {
    return { currentIndex: this.historyIndex, entries: this.history.map(({ id, url }) => ({ id, url, userTypedURL: url, title: '', transitionType: 'other' })) };
  }

  async traverseHistory(index, { forceReload = false } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= this.history.length) return false;
    const entry = this.history[index];
    if (!forceReload && entry.documentId === this.documentId) {
      const previousURL = this.url;
      this.nativeHistoryReplace(structuredClone(entry.state), '', entry.url);
      this.historyIndex = index;
      this.url = entry.url;
      const hashChanged = new URL(previousURL).hash !== new URL(this.url).hash;
      this.emit('withinDocument', { url: this.url, navigationType: hashChanged ? 'fragment' : 'historyApi' });
      const window = this.dom.window;
      window.dispatchEvent(new window.PopStateEvent('popstate', { state: structuredClone(entry.state) }));
      if (hashChanged) {
        window.dispatchEvent(new window.HashChangeEvent('hashchange', { oldURL: previousURL, newURL: this.url }));
      }
    } else await this.navigate(entry.url, { historyMode: 'traverse', historyIndex: index });
    return true;
  }
  requestFinished(id, url, status, size = 0, headers = {}, type = 'Other') {
    this.activeRequests.delete(id);
    this.lastActivity = Date.now();
    this.emit('response', { id, url, status, size, headers, type, timestamp: now() });
  }
  requestFailed(id, error) {
    this.activeRequests.delete(id);
    this.lastActivity = Date.now();
    this.emit('requestFailed', { id, message: error.message, timestamp: now() });
  }

  setExtraHTTPHeaders(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Headers must be an object');
    const headers = new Headers();
    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== 'string') throw new Error('Header values must be strings');
      headers.set(name, value);
    }
    this.extraHTTPHeaders = headers;
  }

  setUserAgentOverride({ userAgent, acceptLanguage, platform }) {
    if (typeof userAgent !== 'string' || (acceptLanguage !== undefined && typeof acceptLanguage !== 'string') ||
        (platform !== undefined && typeof platform !== 'string')) throw new Error('Invalid user agent override');
    // Validate HTTP values before changing any live state.
    new Headers({ 'user-agent': userAgent, ...(acceptLanguage !== undefined ? { 'accept-language': acceptLanguage } : {}) });
    this.userAgent = userAgent;
    if (acceptLanguage !== undefined) this.acceptLanguage = acceptLanguage;
    if (platform !== undefined) this.platform = platform;
  }

  referrerFor(target, source = this.url) {
    let origin, destination;
    try { origin = new URL(source); destination = new URL(target); } catch { return null; }
    if (!['http:', 'https:'].includes(origin.protocol) || !['http:', 'https:'].includes(destination.protocol) ||
        (origin.protocol === 'https:' && destination.protocol === 'http:')) return null;
    origin.hash = ''; origin.username = ''; origin.password = '';
    return origin.origin === destination.origin ? origin.href : `${origin.origin}/`;
  }

  async fetch(input, init = {}, type = 'Fetch') {
    const inputUrl = input instanceof Request ? input.url : String(input);
    let url = new URL(inputUrl, this.url).href;
    if (!['http:', 'https:', 'data:'].includes(new URL(url).protocol)) {
      throw new Error('Only HTTP, HTTPS and data URLs are supported');
    }
    const headers = new Headers();
    if (input instanceof Request) input.headers.forEach((value, key) => headers.set(key, value));
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    // CDP defaults override conflicting page-supplied headers, as observed in
    // the reference browser after Network.enable.
    this.extraHTTPHeaders.forEach((value, key) => headers.set(key, value));
    headers.set('user-agent', this.userAgent);
    if (!headers.has('accept-language')) headers.set('accept-language', this.acceptLanguage);
    if (type === 'Fetch' && !headers.has('referer')) {
      const referrer = this.referrerFor(url);
      if (referrer) headers.set('referer', referrer);
    }
    let method = init.method ?? (input instanceof Request ? input.method : 'GET');
    let body = init.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(method) ? await input.arrayBuffer() : undefined);
    const useCookies = init.credentials !== 'omit';
    const deadline = AbortSignal.timeout(this.timeout);
    const signal = init.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    let redirectResponse;
    for (let redirects = 0; redirects <= 20; redirects++) {
      if (useCookies) {
        const cookies = await this.context.cookies.getCookieString(url);
        if (cookies) headers.set('cookie', cookies); else headers.delete('cookie');
      }
      const id = this.requestStarted(url, type, method, Object.fromEntries(headers), redirectResponse);
      try {
        const response = await fetch(url, { ...init, method, body, headers, signal, redirect: 'manual' });
        if (useCookies) for (const cookie of response.headers.getSetCookie()) {
          await this.context.cookies.setCookie(cookie, url, { ignoreError: true });
        }
        const location = response.headers.get('location');
        if (location && [301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects === 20) throw new Error('Too many redirects');
          const next = new URL(location, url);
          if (!['http:', 'https:'].includes(next.protocol)) throw new Error('Unsupported redirect protocol');
          if (next.origin !== new URL(url).origin) {
            headers.delete('authorization'); headers.delete('cookie');
          }
          if (headers.has('referer')) {
            const referrer = this.referrerFor(next.href, headers.get('referer'));
            if (referrer) headers.set('referer', referrer); else headers.delete('referer');
          }
          if (response.status === 303 || ([301, 302].includes(response.status) && method.toUpperCase() === 'POST')) {
            method = 'GET'; body = undefined; headers.delete('content-type'); headers.delete('content-length');
          }
          await response.body?.cancel();
          this.activeRequests.delete(id);
          redirectResponse = { url, status: response.status, statusText: response.statusText,
            headers: Object.fromEntries(response.headers), mimeType: response.headers.get('content-type') ?? 'text/html',
            connectionReused: false, connectionId: 0, encodedDataLength: 0, securityState: 'neutral' };
          url = next.href;
          continue;
        }
        const chunks = [];
        let size = 0;
        const reader = response.body?.getReader();
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('Response exceeds 16 MiB limit'); }
          chunks.push(value);
        }
        const bytes = Buffer.concat(chunks);
        const buffered = new Response([101, 204, 205, 304].includes(response.status) || method === 'HEAD' ? null : bytes,
          { status: response.status, statusText: response.statusText, headers: response.headers });
        for (const [key, value] of Object.entries({ url, finalUrl: url, requestId: id, redirected: redirects > 0 })) {
          Object.defineProperty(buffered, key, { value });
        }
        this.responseBodies ??= new Map();
        if (this.responseBodies.size >= 100) this.responseBodies.delete(this.responseBodies.keys().next().value);
        this.responseBodies.set(id, bytes.toString('utf8'));
        this.requestFinished(id, url, response.status, bytes.length, Object.fromEntries(response.headers), type);
        return buffered;
      } catch (error) { this.requestFailed(id, error); throw error; }
    }
  }

  async navigate(url, { waitUntil = 'load', waitMs = 0, selector, script, historyMode = 'push', historyIndex, onCommit, referrer } = {}) {
    if (this.closed) throw new Error('Page is closed');
    const generation = ++this.navigationGeneration;
    const deadline = Date.now() + this.timeout;
    const remaining = () => Math.max(1, deadline - Date.now());
    this.navigationAbort?.abort();
    this.navigationAbort = new AbortController();
    const target = new URL(url, this.url).href;
    let navigationWindow, redirect, captureRedirect;
    this.loaderId = randomUUID();
    this.emit('navigationStarted');
    try {
      let html;
      let response;
      if (target.split('#')[0] === 'about:blank') html = '<!doctype html><html><head></head><body></body></html>';
      else {
        const referrerSource = referrer === undefined ? this.url : referrer;
        const referer = this.referrerFor(target, referrerSource);
        response = await this.fetch(target, { signal: this.navigationAbort.signal, ...(referer ? { headers: { referer } } : {}) }, 'Document');
        const reader = response.body?.getReader();
        const chunks = [];
        let size = 0;
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error('Document exceeds 16 MiB limit'); }
          chunks.push(value);
        }
        const source = Buffer.concat(chunks).toString('utf8');
        const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        // Plain-text and API responses must not become executable HTML documents.
        const textDocument = mime && !['text/html', 'application/xhtml+xml'].includes(mime);
        const escaped = textDocument ? source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') : source;
        html = textDocument ? `<!doctype html><html><head><meta charset="utf-8"></head><body><pre>\n${escaped}</pre></body></html>` : source;
        this.responseBodies ??= new Map();
        this.responseBodies.set(response.requestId, source);
        this.responseHeaders = [...response.headers].map(([name, value]) => ({ name, value }));
      }
      if (generation !== this.navigationGeneration || this.closed) throw new Error('Navigation superseded');
      this.documentGeneration++;
      this.documentAbort.abort();
      this.documentAbort = new AbortController();
      this.dom.window.close();
      this.responseHeaders = response ? [...response.headers].map(([name, value]) => ({ name, value })) : [];
      this.url = response?.finalUrl ?? target;
      this.status = response?.status ?? 200;
      this.executionContextId = this.browser.nextExecutionContext++;
      this.emit('contextsCleared');
      this.documentId = randomUUID();
      let state = null;
      if (historyMode === 'traverse' || (historyMode === 'reload' && this.historyIndex >= 0)) {
        const index = historyMode === 'reload' ? this.historyIndex : historyIndex;
        const entry = this.history[index];
        if (!entry) throw new Error('History entry no longer exists');
        const oldDocumentId = entry.documentId;
        for (const candidate of this.history) if (candidate.documentId === oldDocumentId) candidate.documentId = this.documentId;
        this.historyIndex = index;
        entry.url = this.url;
        state = structuredClone(entry.state);
      } else this.commitHistory(this.url, null, historyMode === 'replace' ? 'replace' : 'push');
      let resolveRedirect;
      const requested = new Promise(resolve => { resolveRedirect = resolve; });
      captureRedirect = pending => {
        if (!navigationWindow || pending.window === navigationWindow) { redirect = pending; resolveRedirect(); }
      };
      this.on('navigationRequested', captureRedirect);
      this.dom = this.createDOM(html, state);
      navigationWindow = this.dom.window;
      const moduleReady = this.moduleReady;
      this.emit('navigated');
      this.emit('contextCreated');
      onCommit?.();
      const documentReady = new Promise(resolve => {
        if (this.dom.window.document.readyState !== 'loading') resolve();
        else this.dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
      const loaded = new Promise(resolve => {
        if (this.dom.window.document.readyState === 'complete') resolve();
        else this.dom.window.addEventListener('load', resolve, { once: true });
      });
      documentReady.then(() => { if (generation === this.navigationGeneration && !redirect) this.emit('domContentLoaded'); });
      loaded.then(async () => { await moduleReady; if (generation === this.navigationGeneration && !redirect) this.emit('load'); });
      const ready = waitUntil === 'domcontentloaded' ? documentReady : Promise.all([loaded, moduleReady]);
      await withTimeout(Promise.race([ready, requested]), remaining(), 'Page load timed out');
      if (redirect) await withTimeout(redirect.promise, remaining(), 'Page navigation chain timed out');
      if (waitUntil === 'networkidle0' || waitUntil === 'networkidle2') {
        const allowed = waitUntil === 'networkidle2' ? 2 : 0;
        await until(() => this.activeRequests.size <= allowed && Date.now() - this.lastActivity >= 500, { timeout: remaining() });
      }
      if (selector) await until(() => this.dom.window.document.querySelector(selector), { timeout: remaining() });
      if (script) await until(() => this.evaluate(script), { timeout: remaining() });
      if (waitMs > 0) await delay(waitMs);
      return { url: this.url, status: this.status };
    } catch (error) {
      if (generation === this.navigationGeneration) this.emit('navigationError', error);
      throw error;
    } finally { if (captureRedirect) this.off('navigationRequested', captureRedirect); }
  }

  evaluate(expression) {
    if (this.closed) throw new Error('Page is closed');
    try { return vm.runInContext(expression, this.dom.getInternalVMContext(), { timeout: Math.min(this.timeout, 2000) }); }
    finally { this.reconcileURL(); }
  }
  callFunction(declaration, thisArg, args) {
    const key = `__redpanda_${randomUUID().replaceAll('-', '')}`;
    this.dom.window[key] = { thisArg, args };
    try {
      return this.evaluate(`(${declaration}\n).apply(globalThis[${JSON.stringify(key)}].thisArg, globalThis[${JSON.stringify(key)}].args)`);
    } finally { delete this.dom.window[key]; }
  }
  dump(format = 'html') {
    const document = this.dom.window.document;
    if (format === 'html') return this.dom.serialize();
    if (format === 'links') return JSON.stringify([...document.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim(), href: a.href })), null, 2);
    if (format === 'structured_data') {
      return JSON.stringify({
        url: this.url, title: document.title,
        meta: [...document.querySelectorAll('meta[name],meta[property]')].map(m => ({ name: m.name || m.getAttribute('property'), content: m.content })),
        jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent); } catch { return { invalidJson: s.textContent }; } }),
      }, null, 2);
    }
    const body = document.body.cloneNode(true);
    body.querySelectorAll('script,style,noscript,template').forEach(node => node.remove());
    if (format === 'text') return body.textContent.trim();
    if (format !== 'markdown') throw new Error(`Unknown dump format: ${format}`);
    const render = node => {
      if (node.nodeType === 3) return node.textContent.replace(/\s+/g, ' ');
      if (node.nodeType !== 1) return '';
      const tag = node.localName;
      const content = [...node.childNodes].map(render).join('');
      if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${content.trim()}\n\n`;
      if (tag === 'a') return `[${content.trim()}](${new URL(node.getAttribute('href') || '', this.url).href})`;
      if (tag === 'img') return node.alt ? `![${node.alt}](${node.src})` : '';
      if (tag === 'br') return '\n';
      if (tag === 'li') return `\n- ${content.trim()}`;
      if (tag === 'pre') return `\n\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
      if (tag === 'code' && node.parentElement?.localName !== 'pre') return `\`${content}\``;
      if (tag === 'strong' || tag === 'b') return `**${content}**`;
      if (tag === 'em' || tag === 'i') return `*${content}*`;
      return ['p', 'div', 'section', 'article', 'main', 'ul', 'ol', 'blockquote'].includes(tag) ? `\n\n${content}\n\n` : content;
    };
    return render(body).replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.navigationGeneration++;
    this.navigationAbort?.abort();
    this.documentAbort.abort();
    this.dom.window.close();
    this.emit('close');
    this.removeAllListeners();
  }
}
