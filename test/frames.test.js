import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM, ResourceLoader, VirtualConsole, CookieJar } from 'jsdom';
import { installFrames } from '../src/frames.js';
import { installNavigation } from '../src/navigation.js';
import { installModuleScripts } from '../src/modules.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  const end = Date.now() + 3000;
  while (!check()) { if (Date.now() >= end) throw new Error('Frame fixture timed out'); await tick(); }
}
const escape = source => source.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

function fixture(t, html = '', sources = {}, options = {}) {
  const page = new EventEmitter(), requests = [], events = [], errors = [];
  Object.assign(page, { id: 'root', frameId: 'root', loaderId: 'root-loader', executionContextId: 1,
    url: 'https://example.test/app/page.html', browser: { nextExecutionContext: 2, options: {} },
    context: { cookies: new CookieJar() }, documentAbort: new AbortController(), extraHTTPHeaders: new Headers(),
    timeout: 2000, javascript: true, userAgent: 'RedPanda-test', acceptLanguage: 'en-US', platform: 'Linux' });
  page.referrerFor = (url, source = page.url) => /^https?:/.test(source) ? source : null;
  page.fetch = async (input, init = {}, type) => {
    const url = input instanceof Request ? input.url : String(input); requests.push({ url, init, type });
    let entry = sources[url]; if (typeof entry === 'function') entry = await entry(init);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (typeof entry === 'string') entry = { source: entry };
    const response = new Response(entry?.source ?? '', { status: entry?.status ?? (entry ? 200 : 404),
      headers: { 'content-type': entry?.mime ?? (url.endsWith('.js') ? 'text/javascript' : 'text/html') } });
    Object.defineProperty(response, 'url', { value: entry?.url ?? url }); return response;
  };
  page.navigate = () => { throw new Error('A child navigated the root Page'); };
  for (const name of ['frameAttached', 'frameNavigationStarted', 'frameNavigated', 'frameContextCreated',
    'frameContextDestroyed', 'frameDOMContentLoaded', 'frameLoad', 'frameDetached', 'framePageError']) {
    page.on(name, payload => events.push({ name, payload }));
  }
  page.on('pageError', error => errors.push(error));
  class Loader extends ResourceLoader {
    fetch(url) {
      const controller = new AbortController();
      const request = page.fetch(url, { signal: controller.signal }, 'Document').then(async response => {
        request.response = { headers: Object.fromEntries(response.headers) }; request.href = response.url;
        return Buffer.from(await response.arrayBuffer());
      });
      request.abort = () => controller.abort(); return request;
    }
  }
  let registry;
  const dom = new JSDOM(html, { url: page.url, runScripts: 'dangerously', resources: new Loader(),
    cookieJar: page.context.cookies, virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      registry = installFrames(page, window, { prepareWindow(child, childWindow) {
        childWindow.installedBeforeParse = true;
        childWindow.fetch = (input, init) => child.fetch(input, init);
        installNavigation(child, childWindow);
        if (options.modules) installModuleScripts(child, childWindow);
        options.prepareWindow?.(child, childWindow);
      } });
    } });
  page.dom = dom;
  t.after(() => { page.documentAbort.abort(); registry.dispose(); dom.window.close(); });
  const frame = element => [...registry.frames.values()].find(value => value.dom?.window === element.contentWindow);
  return { page, dom, window: dom.window, document: dom.window.document, registry, events, errors, requests, frame };
}

test('srcdoc uses the real iframe realm and runs prepared adapters before child scripts', async t => {
  const source = '<p id="child">original</p><script>window.wasPrepared = installedBeforeParse; parent.childSawParent = parent === top;</script>';
  const f = fixture(t, `<iframe id="frame" srcdoc="${escape(source)}"></iframe>`);
  const element = f.document.getElementById('frame'), child = f.frame(element);
  assert.ok(child); assert.equal(child.dom.window, element.contentWindow);
  assert.equal(child.dom.window.document, element.contentDocument);
  assert.equal(child.evaluate('wasPrepared'), true); assert.equal(f.window.childSawParent, true);
  assert.equal(child.evaluate('document.querySelector("#child")'), element.contentDocument.getElementById('child'));
  child.callFunction('function(value) { this.textContent = value; }', element.contentDocument.getElementById('child'), ['updated']);
  assert.equal(element.contentDocument.getElementById('child').textContent, 'updated');
  assert.equal(child.url, 'about:srcdoc'); assert.equal(element.contentWindow.location.href, 'about:srcdoc');
  assert.equal(element.contentDocument.baseURI, f.page.url);
  assert.equal(f.registry.findContext(child.executionContextId).context, child.dom.getInternalVMContext());
  assert.equal(f.registry.findContext(1).window, f.window);
  await until(() => f.events.some(event => event.name === 'frameLoad'));
  assert.deepEqual(f.errors, []);
});

test('blank, nested and frame elements form a stable actual browsing-context tree', async t => {
  const f = fixture(t, '<iframe id="outer"></iframe>');
  const outerElement = f.document.getElementById('outer'), outer = f.frame(outerElement);
  outer.dom.window.document.body.innerHTML = '<iframe id="inner"></iframe>';
  const innerElement = outer.dom.window.document.getElementById('inner'), inner = f.frame(innerElement);
  assert.equal(inner.parentFrameId, outer.frameId);
  assert.equal(inner.evaluate('parent'), outerElement.contentWindow); assert.equal(inner.evaluate('top'), f.window);
  assert.equal(f.registry.getTree().childFrames[0].childFrames[0].frame.id, inner.frameId);
  const frameElement = f.document.createElement('frame'); f.document.body.append(frameElement);
  assert.ok(f.frame(frameElement)); assert.equal(f.registry.getTree().childFrames.length, 2);
  assert.equal(f.registry.findFrame('root'), f.page); assert.equal(f.registry.findFrame(outer.frameId), outer);
});

test('HTTP frame documents execute their scripts and resolve child fetch against the child URL', async t => {
  const f = fixture(t, '<iframe id="frame" src="/child/index.html"></iframe>', {
    'https://example.test/child/index.html': '<script>window.prepared = installedBeforeParse; fetch("./data").then(response => response.text()).then(value => window.data = value);</script>',
    'https://example.test/child/data': 'child response',
  });
  const element = f.document.getElementById('frame'), child = f.frame(element);
  await until(() => element.contentWindow.data === 'child response');
  assert.equal(child.evaluate('prepared'), true); assert.equal(child.url, 'https://example.test/child/index.html');
  const request = f.requests.find(request => request.url.endsWith('/child/data'));
  assert.equal(request.init.frameId, child.frameId); assert.equal(request.init.headers.get('referer'), child.url);
  assert.equal(child.context, f.page.context); assert.equal(child.browser, f.page.browser);
});

test('src attribute navigation retains frame ID, replaces context, and invalidates old evaluations', async t => {
  const f = fixture(t, '<iframe id="frame" src="/first.html"></iframe>', {
    'https://example.test/first.html': '<p>first</p>', 'https://example.test/second.html': '<p>second</p>',
  });
  const element = f.document.getElementById('frame'), first = f.frame(element);
  await until(() => element.contentDocument.readyState === 'complete');
  element.src = '/second.html';
  const second = f.frame(element);
  await until(() => element.contentDocument.readyState === 'complete');
  assert.equal(second.frameId, first.frameId); assert.notEqual(second.executionContextId, first.executionContextId);
  assert.notEqual(second.loaderId, first.loaderId); assert.equal(f.registry.findContext(first.executionContextId), undefined);
  assert.throws(() => first.evaluate('1'), /no longer current/); assert.equal(second.evaluate('document.body.textContent'), 'second');
  assert.equal(f.events.filter(event => event.name === 'frameAttached').length, 1);
  assert.ok(f.events.some(event => event.name === 'frameContextDestroyed' && event.payload.executionContextId === first.executionContextId));
});

test('srcdoc changes create a new real child document while preserving reflected attributes', async t => {
  const f = fixture(t, '<iframe id="frame" src="/ignored.html" srcdoc="<p>first</p>"></iframe>');
  const element = f.document.getElementById('frame'), first = f.frame(element);
  assert.equal(f.requests.length, 0); assert.equal(first.evaluate('document.body.textContent'), 'first');
  element.srcdoc = '<p>second</p>';
  const second = f.frame(element); assert.equal(second.frameId, first.frameId);
  assert.equal(second.evaluate('document.body.textContent'), 'second'); assert.equal(element.getAttribute('src'), '/ignored.html');
  assert.equal(f.registry.findContext(first.executionContextId), undefined);
});

test('child facade and location navigation affect only their own iframe', async t => {
  const f = fixture(t, '<iframe id="frame" srcdoc="<p>initial</p>"></iframe>', {
    'https://example.test/next.html': '<p>next</p>', 'https://example.test/location.html': '<p>location</p>',
  });
  const element = f.document.getElementById('frame'), initial = f.frame(element);
  await initial.navigate('https://example.test/next.html');
  const next = f.frame(element); assert.equal(next.evaluate('document.body.textContent'), 'next');
  assert.equal(element.getAttribute('srcdoc'), '<p>initial</p>'); assert.equal(element.getAttribute('src'), null);
  next.evaluate('location.href = "/location.html"');
  await until(() => f.frame(element)?.url === 'https://example.test/location.html' && element.contentDocument.readyState === 'complete');
  assert.equal(f.frame(element).evaluate('document.body.textContent'), 'location');
  assert.equal(f.window.location.href, f.page.url); assert.equal(f.registry.getTree().frame.url, f.page.url);
});

test('detaching a parent removes descendant contexts and aborts each child document', async t => {
  const f = fixture(t, '<iframe id="outer" srcdoc="<iframe></iframe>"></iframe>');
  const element = f.document.getElementById('outer'), outer = f.frame(element);
  const nested = f.frame(element.contentDocument.querySelector('iframe'));
  element.remove();
  assert.equal(f.registry.findFrame(outer.frameId), undefined); assert.equal(f.registry.findFrame(nested.frameId), undefined);
  assert.equal(f.registry.findContext(nested.executionContextId), undefined);
  assert.equal(outer.documentAbort.signal.aborted, true); assert.equal(nested.documentAbort.signal.aborted, true);
  assert.equal(f.registry.getTree().childFrames, undefined);
  assert.equal(f.events.filter(event => event.name === 'frameDetached').length, 2);
});

test('root document abort clears registered frame contexts and leaves unrelated jsdom documents unmodified', t => {
  const f = fixture(t, '<iframe id="frame"></iframe>');
  const child = f.frame(f.document.getElementById('frame'));
  f.page.documentAbort.abort();
  assert.equal(f.registry.findContext(1), undefined); assert.equal(f.registry.findFrame(child.frameId), undefined);
  assert.throws(() => child.evaluate('1'), /no longer current/); assert.throws(() => f.registry.getTree(), /no longer current/);
  const unrelated = new JSDOM('<iframe srcdoc="<p>unregistered</p>"></iframe>'); t.after(() => unrelated.window.close());
  assert.equal(unrelated.window.document.querySelector('iframe').contentDocument.body.textContent, '');
});

test('module scripts in child documents use their actual iframe VM context', async t => {
  const source = '<script type="module">await Promise.resolve(); document.body.dataset.module = String(installedBeforeParse); window.moduleArray = [];</script>';
  const f = fixture(t, `<iframe id="frame" srcdoc="${escape(source)}"></iframe>`, {}, { modules: true });
  const element = f.document.getElementById('frame'), child = f.frame(element);
  await child.moduleReady;
  assert.equal(element.contentDocument.body.dataset.module, 'true');
  assert.equal(child.evaluate('moduleArray instanceof Array'), true); assert.equal(child.evaluate('moduleArray'), element.contentWindow.moduleArray);
});

test('redirected frame documents resolve scripts and fetch relative to their final URL', async t => {
  const f = fixture(t, '<iframe id="frame" src="/redirect.html"></iframe>', {
    'https://example.test/redirect.html': { url: 'https://example.test/final/index.html', source: '<script src="./script.js"></script>' },
    'https://example.test/final/script.js': 'window.finalLocation = location.href;',
  });
  const element = f.document.getElementById('frame'), child = f.frame(element);
  await until(() => element.contentWindow.finalLocation);
  assert.equal(child.url, 'https://example.test/final/index.html');
  assert.equal(child.evaluate('finalLocation'), child.url);
  assert.ok(f.requests.some(request => request.url === 'https://example.test/final/script.js'));
  assert.equal(f.events.filter(event => event.name === 'frameNavigated').at(-1).payload.frame.url, child.url);
});

test('removing a frame aborts its pending native document resource', async t => {
  let aborted = false;
  const f = fixture(t, '<iframe id="frame" src="/slow.html"></iframe>', {
    'https://example.test/slow.html': init => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { aborted = true; reject(init.signal.reason); }, { once: true });
    }),
  });
  f.document.getElementById('frame').remove(); await until(() => aborted);
  assert.equal(f.registry.frames.size, 1);
});

test('same-document fragment navigation retains the child VM context', async t => {
  const f = fixture(t, '<iframe id="frame" src="/child.html"></iframe>', { 'https://example.test/child.html': '<p>child</p>' });
  const element = f.document.getElementById('frame'), child = f.frame(element);
  await until(() => element.contentDocument.readyState === 'complete');
  await child.navigate('#fragment');
  assert.equal(f.frame(element), child); assert.equal(child.evaluate('location.hash'), '#fragment');
  assert.equal(f.registry.findElement(element), child);
  await assert.rejects(child.navigate('/post', { method: 'POST', body: 'data' }), /not implemented/);
});

test('nested document requests use their child frame identity and explicit referrer suppression is retained', async t => {
  const f = fixture(t, '<iframe id="outer" srcdoc="<iframe src=\'/nested.html\'></iframe>"></iframe>', {
    'https://example.test/nested.html': '<p>nested</p>', 'https://example.test/data': 'data',
  });
  const outer = f.document.getElementById('outer'), inner = outer.contentDocument.querySelector('iframe');
  const child = f.registry.findElement(inner);
  await until(() => inner.contentDocument.readyState === 'complete');
  const request = f.requests.find(request => request.url.endsWith('/nested.html'));
  assert.equal(request.type, 'Document'); assert.equal(request.init.frameId, child.frameId); assert.equal(request.init.loaderId, child.loaderId);
  await child.fetch('/data', { skipDefaultReferrer: true });
  assert.equal(f.requests.at(-1).init.headers.has('referer'), false);
});
