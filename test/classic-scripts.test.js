// This focused unit fixture embeds asynchronous jsdom without Browser/SyncHTTP.
// Production blocking CSS is covered by owned external-thread Browser fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once, EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installClassicScripts } from '../src/classic-scripts.js';
import { installModuleScripts } from '../src/modules.js';
import { installFrames } from '../src/frames.js';

const require = createRequire(import.meta.url);
const ScriptImpl = require('jsdom/lib/jsdom/living/nodes/HTMLScriptElement-impl.js').implementation;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  const deadline = Date.now() + 3000;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Classic-script fixture timed out'); await tick(); }
}
async function fixture(t, markup, routes = {}, options = {}) {
  const requests = [], errors = [];
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://fixture.test').pathname; requests.push(name);
    const value = routes[name];
    if (typeof value === 'function') return value(request, response);
    response.writeHead(value === undefined ? 404 : 200, { 'content-type': 'text/javascript' }); response.end(value ?? 'missing');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = new EventEmitter(); Object.assign(page, { documentAbort: new AbortController(), javascript: options.javascript !== false, closed: false,
    id: 'root', frameId: 'root', loaderId: 'loader', executionContextId: 1, browser: { nextExecutionContext: 2, options: {} },
    extraHTTPHeaders: new Headers(), context: {}, timeout: 3000, userAgent: 'RedPanda-test' });
  page.referrerFor = () => null;
  page.fetch = (input, init) => fetch(new URL(String(input), origin), init);
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
  let controller;
  const dom = new JSDOM(markup.replaceAll('__ORIGIN__', origin), { url: `${origin}/index.html`, resources: 'usable',
    runScripts: options.javascript === false ? 'outside-only' : 'dangerously', virtualConsole,
    beforeParse(window) {
      if (options.modules) installModuleScripts(page, window);
      controller = installClassicScripts(page, window);
      if (options.frames) installFrames(page, window, { prepareWindow(child, childWindow) {
        if (options.modules) installModuleScripts(child, childWindow);
        installClassicScripts(child, childWindow);
      } });
    } });
  page.dom = dom;
  t.after(async () => {
    page.closed = true; page.documentAbort.abort(); controller.dispose(); dom.window.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  return { page, controller, window: dom.window, document: dom.window.document, requests, errors, origin,
    loaded: () => until(() => dom.window.document.readyState === 'complete') };
}

test('blocking external scripts pause actual parsing and hold Document.close until the source executes', async t => {
  let release;
  const f = await fixture(t, `<script src="/blocked.js"></script><p id="future">later</p><script>window.after = true;</script>`, {
    '/blocked.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('window.sawFuture = document.getElementById("future");'); }; },
  });
  await until(() => release);
  assert.equal(f.document.getElementById('future'), null); assert.equal(f.document.readyState, 'loading'); assert.equal(f.window.after, undefined);
  f.document.querySelector('script').dispatchEvent(new f.window.Event('load')); await tick();
  assert.equal(f.document.getElementById('future'), null);
  release(); await f.loaded();
  assert.equal(f.window.sawFuture, null); assert.equal(f.window.after, true); assert.ok(f.document.getElementById('future'));
  assert.deepEqual(f.errors, []);
});

test('force async defaults and setters reflect attributes without inventing parser visibility', async t => {
  const f = await fixture(t, `<script src="/bootstrap.js"></script><script></script><script>
    window.parserAsync = document.currentScript.async;
    const all = document.getElementsByTagName('script'); window.emptyAsync = all[all.length-2].async;
    const dynamic = document.createElement('script'); window.dynamicAsync = dynamic.async;
    dynamic.async = false; window.explicitFalse = [dynamic.async, dynamic.hasAttribute('async')];
    dynamic.async = true; window.explicitTrue = [dynamic.async, dynamic.hasAttribute('async')];
  </script>`, { '/bootstrap.js': '' });
  await f.loaded();
  assert.equal(f.window.parserAsync, false); assert.equal(f.window.emptyAsync, true); assert.equal(f.window.dynamicAsync, true);
  assert.deepEqual([...f.window.explicitFalse], [false, false]); assert.deepEqual([...f.window.explicitTrue], [true, true]);
});

test('connected empty scripts execute synchronously when direct text is appended or changed', async t => {
  const f = await fixture(t, `<script>
    window.results = [];
    const script = document.createElement('script'); document.head.append(script);
    window.results.push(window.lazy); script.append(document.createTextNode('window.lazy = 1;'));
    window.results.push(window.lazy); script.text = 'window.lazy = 2;'; window.results.push(window.lazy);
    const later = document.createElement('script'), text = document.createTextNode(''); later.append(text); document.head.append(later);
    text.data = 'window.textChanged = true;'; window.results.push(window.textChanged);
  </script>`);
  await f.loaded(); assert.deepEqual([...f.window.results], [undefined, 1, 1, true]);
});

test('dynamic inline execution preserves the inserting currentScript and existing already-started clone semantics', async t => {
  const f = await fixture(t, `<script id="parent">
    window.count = 0; const script = document.createElement('script'); script.id = 'child';
    script.textContent = 'window.count++; window.childCurrent = document.currentScript.id;';
    document.head.append(script); window.synchronousCount = count; window.parentCurrent = document.currentScript.id;
    document.head.append(script.cloneNode(true)); const wrapper = document.createElement('div'); wrapper.append(script.cloneNode(true)); document.head.append(wrapper);
  </script>`);
  await f.loaded(); assert.equal(f.window.synchronousCount, 1); assert.equal(f.window.count, 1);
  assert.equal(f.window.childCurrent, 'child'); assert.equal(f.window.parentCurrent, 'parent'); assert.equal(f.document.currentScript, null);
});

test('source assignment prepares an unstarted connected script exactly once and allows retry after an empty src', async t => {
  const f = await fixture(t, `<script>
    window.executions = 0; const s = document.createElement('script'); document.head.append(s);
    s.src = ''; s.src = '/once.js'; s.removeAttribute('src'); s.src = '/twice.js';
  </script>`, { '/once.js': 'window.executions++;', '/twice.js': 'window.executions += 100;' });
  await f.loaded(); assert.equal(f.window.executions, 1); assert.deepEqual(f.requests, ['/once.js']);
});

test('default dynamic external scripts execute when fetched while explicit async=false preserves order', async t => {
  let release;
  const f = await fixture(t, `<script>window.order = [];
    for (const name of ['slow','fast']) {const s=document.createElement('script');s.src='/'+name+'.js';document.head.append(s);}
  </script>`, {
    '/slow.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end("order.push('slow');"); }; },
    '/fast.js': "order.push('fast');",
  });
  await until(() => release && f.window.order.includes('fast'));
  assert.deepEqual([...f.window.order], ['fast']); release(); await f.loaded(); assert.deepEqual([...f.window.order], ['fast', 'slow']);

  let orderedRelease;
  const ordered = await fixture(t, `<script>window.order = [];
    for (const name of ['slow','fast']) {const s=document.createElement('script');s.async=false;s.src='/'+name+'.js';document.head.append(s);}
  </script>`, {
    '/slow.js': (request, response) => { orderedRelease = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end("order.push('slow');"); }; },
    '/fast.js': "order.push('fast');",
  });
  await until(() => orderedRelease && ordered.requests.length === 2);
  assert.deepEqual([...ordered.window.order], []); orderedRelease(); await ordered.loaded(); assert.deepEqual([...ordered.window.order], ['slow', 'fast']);
});

test('external errors resume parsing and executed exceptions still produce script load events', async t => {
  const f = await fixture(t, `<script>window.events=[];window.addEventListener('error',event=>event.preventDefault());</script>
    <script src="/missing.js" onerror="events.push('network-error')"></script>
    <script src="/throws.js" onload="events.push('load')" onerror="events.push('script-error')"></script>
    <script>window.after=true;</script>`, { '/throws.js': "throw new Error('script failure');" });
  await f.loaded(); assert.equal(f.window.after, true); assert.deepEqual([...f.window.events], ['network-error', 'load']);
});

test('module and import-map parsing remains deferred and uses the existing module scheduler', async t => {
  const f = await fixture(t, `<script type="importmap">{"imports":{"value":"./value.js"}}</script>
    <script type="module">import {value} from 'value';window.moduleValue=value;window.moduleSeesLater=!!document.getElementById('later');</script>
    <p id="later"></p><script>window.classicValue = 1;</script>`, { '/value.js': 'export const value = 42;' }, { modules: true });
  await f.page.moduleReady; await f.loaded();
  assert.equal(f.window.moduleValue, 42); assert.equal(f.window.classicValue, 1); assert.equal(f.window.moduleSeesLater, true);
});

test('document abort cancels a blocking fetch, suppresses stale script events and never resumes its parser', async t => {
  let received = false, closed = false;
  const f = await fixture(t, `<script src="/blocked.js" onerror="window.staleEvent=true"></script><p id="future"></p>`, {
    '/blocked.js': (request, response) => { received = true; response.on('close', () => { closed = true; }); },
  });
  await until(() => received); f.page.documentAbort.abort(); await until(() => closed);
  assert.equal(f.document.getElementById('future'), null); assert.equal(f.window.staleEvent, undefined);
});

test('disabled JavaScript does not fetch or execute scripts and private evaluator wrappers remain composable', async t => {
  const before = ScriptImpl.prototype._innerEval;
  const f = await fixture(t, '<script src="/source.js"></script><p id="future"></p><script>window.executed=true;</script>', { '/source.js': 'window.external=true;' }, { javascript: false });
  await f.loaded(); assert.deepEqual(f.requests, []); assert.equal(f.window.executed, undefined); assert.ok(f.document.getElementById('future'));
  assert.equal(ScriptImpl.prototype._innerEval, before);
});

test('duplicate script preload hints share an actual fetch and a blocking script adopts that body', async t => {
  let release;
  const f = await fixture(t, `<script>window.hintLoads=0;window.executions=0;window.trusted=[];</script>
    <link rel="preload" as="script" href="/shared.js" onload="hintLoads++;trusted.push(event.isTrusted)">
    <link rel="preload" as="script" href="/shared.js" onload="hintLoads++;trusted.push(event.isTrusted)">
    <script src="/shared.js"></script><p id="later"></p>`, {
    '/shared.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('window.executions++;'); }; },
  });
  await until(() => release); assert.equal(f.document.getElementById('later'), null); assert.equal(f.window.hintLoads, 0);
  assert.deepEqual(f.requests, ['/shared.js']); release(); await f.loaded();
  assert.equal(f.window.hintLoads, 2); assert.deepEqual([...f.window.trusted], [true, true]); assert.equal(f.window.executions, 1);
  assert.deepEqual(f.requests, ['/shared.js']);
});

test('an unused preload fetch neither executes its body nor delays document load', async t => {
  let release;
  const f = await fixture(t, `<link rel="preload" as="script" href="/unused.js" onload="window.hintLoaded=true"><p id="parsed"></p>`, {
    '/unused.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('window.unusedExecuted=true;'); }; },
  });
  await until(() => release); await f.loaded(); assert.ok(f.document.getElementById('parsed'));
  assert.equal(f.window.hintLoaded, undefined); assert.equal(f.window.unusedExecuted, undefined);
  release(); await until(() => f.window.hintLoaded); assert.equal(f.window.unusedExecuted, undefined);
});

test('preload failures emit actual errors, and mismatched request policy prevents body adoption', async t => {
  const failed = await fixture(t, '<link rel="preload" as="script" href="/missing.js" onerror="window.preloadError=true">');
  await until(() => failed.window.preloadError); assert.deepEqual(failed.requests, ['/missing.js']);
  const f = await fixture(t, `<script>window.executions=0;</script><link rel="preload" as="script" crossorigin="anonymous" href="/shared.js">
    <script src="/shared.js"></script>`, { '/shared.js': 'window.executions++;' });
  await f.loaded(); await until(() => f.requests.length === 2);
  assert.equal(f.window.executions, 1); assert.deepEqual(f.requests, ['/shared.js', '/shared.js']);
});

test('document disposal cancels unused preload requests owned outside the load-blocking queue', async t => {
  let received = false, closed = false;
  const f = await fixture(t, '<link rel="preload" as="script" href="/unused.js" onerror="window.staleEvent=true">', {
    '/unused.js': (request, response) => { received = true; response.on('close', () => { closed = true; }); },
  });
  await until(() => received); await f.loaded(); assert.equal(closed, false);
  f.page.documentAbort.abort(); await until(() => closed); assert.equal(f.window.staleEvent, undefined);
});

test('srcdoc child realms hold their own parser and preserve actual frame context identity', async t => {
  let release;
  const f = await fixture(t, `<iframe id="child" srcdoc="<script src='/child.js'></script><p id='future'>child</p>"></iframe>`, {
    '/child.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('window.sawFuture=document.getElementById("future");'); }; },
  }, { frames: true });
  await until(() => release);
  const element = f.document.getElementById('child'), childWindow = element.contentWindow;
  assert.equal(element.contentDocument.getElementById('future'), null); assert.equal(element.contentDocument.readyState, 'loading');
  release(); await until(() => element.contentDocument.readyState === 'complete');
  assert.equal(element.contentWindow, childWindow); assert.equal(childWindow.sawFuture, null); assert.ok(element.contentDocument.getElementById('future'));
});

test('unparseable source URLs cannot wedge parser completion', async t => {
  const f = await fixture(t, '<script src="http://["></script><p id="after">after</p>');
  await f.loaded(); assert.ok(f.document.getElementById('after')); assert.deepEqual(f.requests, []);
});

test('dynamic scripts delegate through an evaluator hook installed by another runtime adapter', async t => {
  const previous = ScriptImpl.prototype._innerEval, seen = [];
  const wrapper = function (text, filename) { seen.push(this.getAttributeNS(null, 'id')); return previous.call(this, text, filename); };
  ScriptImpl.prototype._innerEval = wrapper;
  try {
    const f = await fixture(t, `<script id="parent">const script=document.createElement('script');script.id='child';script.text='window.ran=true';document.head.append(script);</script>`);
    await f.loaded(); assert.equal(f.window.ran, true); assert.deepEqual(seen, ['parent', 'child']);
    assert.equal(ScriptImpl.prototype._innerEval, wrapper);
  } finally { ScriptImpl.prototype._innerEval = previous; }
});

test('closing the actual window cancels pending preload work without requiring an additional Page abort', async t => {
  let received = false, closed = false;
  const f = await fixture(t, '<link rel="preload" as="script" href="/unused.js">', {
    '/unused.js': (request, response) => { received = true; response.on('close', () => { closed = true; }); },
  });
  await until(() => received); await f.loaded(); f.window.close(); await until(() => closed);
  assert.equal(f.page.documentAbort.signal.aborted, false);
});

test('a parser inline script waits for an earlier external stylesheet instead of bypassing its queue', async t => {
  let release;
  const f = await fixture(t, '<link rel="stylesheet" href="/slow.css"><script>window.sawSheet = document.styleSheets.length;</script><p id="future"></p>', {
    '/slow.css': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/css' }); response.end('p { color: red }'); }; },
  });
  await until(() => release); assert.equal(f.window.sawSheet, undefined); assert.equal(f.document.getElementById('future'), null);
  release(); await f.loaded(); assert.equal(f.window.sawSheet, 1); assert.ok(f.document.getElementById('future'));
});
