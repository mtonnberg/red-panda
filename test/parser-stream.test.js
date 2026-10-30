import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createParserStream } from '../src/parser-stream.js';
import { installMutations } from '../src/mutations.js';
import { installModuleScripts } from '../src/modules.js';
import { installFrames } from '../src/frames.js';
import { installClassicScripts } from '../src/classic-scripts.js';

const require = createRequire(import.meta.url);
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'));
const parse5 = jsdomRequire('parse5');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  const end = Date.now() + 5000;
  while (!check()) { if (Date.now() > end) throw new Error('Parser stream test timed out'); await tick(); }
}

async function fixture(t, html, routes = {}, options = {}) {
  const requests = [], errors = [], server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://fixture.test').pathname; requests.push(name);
    if (typeof routes[name] === 'function') return routes[name](request, response);
    response.writeHead(routes[name] === undefined ? 404 : 200, { 'content-type': 'text/javascript' }); response.end(routes[name] ?? 'missing');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  const page = new EventEmitter(); Object.assign(page, { id: 'root', frameId: 'root', loaderId: 'loader', executionContextId: 1,
    documentAbort: new AbortController(), javascript: options.javascript !== false, closed: false,
    browser: { nextExecutionContext: 2, options: {} }, context: {}, timeout: 5000, extraHTTPHeaders: new Headers() });
  page.fetch = (url, init) => fetch(new URL(String(url), origin), init); page.referrerFor = () => null;
  page.on('pageError', error => errors.push(error.message));
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
  const prepare = (owner, window) => {
    options.beforeInstall?.(owner, window);
    installMutations(owner, window); installModuleScripts(owner, window);
    installClassicScripts(owner, window); options.prepare?.(owner, window);
  };
  const dom = new JSDOM(html, { url: `${origin}/page.html`, resources: 'usable',
    runScripts: options.javascript === false ? 'outside-only' : 'dangerously', virtualConsole,
    beforeParse(window) {
      prepare(page, window);
      if (options.frames) installFrames(page, window, { prepareWindow: prepare });
    } });
  page.dom = dom;
  t.after(async () => {
    page.closed = true; page.documentAbort.abort(); dom.window.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { page, dom, window: dom.window, document: dom.window.document, requests, errors,
    loaded: () => until(() => dom.window.document.readyState === 'complete') };
}

test('small documents preserve one synchronous parse and complete exactly once', async () => {
  const parser = new parse5.Parser(), completed = [];
  const stream = createParserStream(parser, '<p>small</p>', { onComplete: () => completed.push(true) });
  stream.start(); assert.equal(parser.stopped, true); assert.equal(stream.state.chunks, 1);
  assert.deepEqual(completed, [true]); assert.equal((await stream.completion).status, 'complete');
  stream.start(); stream.resume(); assert.deepEqual(completed, [true]);
});

test('real tokenizer chunks preserve markup, entities and UTF16 split boundaries', async () => {
  const source = '<!doctype html><p title="🦊 &amp; &#x1F600;">a𐐀b &notin; &amp;</p><script>const string="𐐀";</script>';
  const parser = new parse5.Parser(), stream = createParserStream(parser, source, { chunkSize: 3, threshold: 0 });
  stream.start(); const result = await stream.completion;
  assert.equal(result.status, 'complete'); assert.ok(result.chunks > 10);
  assert.equal(parse5.serialize(parser.document), parse5.serialize(parse5.parse(source)));
});

test('a real paused tokenizer resumes its buffered remainder before receiving more source', async () => {
  let first = true;
  const parser = new parse5.Parser({}, undefined, null, () => { if (first) { first = false; parser.tokenizer.pause(); } });
  const source = '<script>first</script><p>buffered</p>' + '<i></i>'.repeat(2000);
  const stream = createParserStream(parser, source, { chunkSize: 1024, threshold: 0 });
  stream.start(); assert.equal(stream.state.paused, true); assert.equal(stream.state.chunks, 1);
  assert.ok(!parse5.serialize(parser.document).includes('buffered'));
  stream.resume(); stream.resume(); await stream.completion;
  assert.equal(parse5.serialize(parser.document), parse5.serialize(parse5.parse(source)));
});

test('genuine public observer deliveries slice parser insertions while readyState remains loading', async t => {
  const bootstrap = `<script>window.batches=[];window.count=0;window.mo=new MutationObserver(records=>{
    let added=0;for(const record of records)for(const node of record.addedNodes)if(node.nodeName==='I')added++;
    window.count+=added;window.batches.push({records:records.length,added,state:document.readyState});
  });mo.observe(document,{childList:true,subtree:true});</script>`;
  const f = await fixture(t, bootstrap + '<div>' + '<i></i>'.repeat(3000) + '</div><script type="module">window.finished=true;</script>');
  assert.equal(f.document.readyState, 'loading'); assert.ok(f.document.querySelectorAll('i').length < 3000);
  await f.loaded(); await f.page.moduleReady;
  assert.equal(f.window.count, 3000); assert.equal(f.document.querySelectorAll('i').length, 3000);
  const batches = [...f.window.batches].filter(batch => batch.added);
  assert.ok(batches.length >= 3); assert.ok(batches[0].added < 3000);
  assert.ok(batches.slice(0, 3).every(batch => batch.state === 'loading'));
  assert.equal(f.window.finished, true); assert.deepEqual(f.errors, []);
});

test('ordinary small page scripts still execute synchronously in their original realm', async t => {
  const f = await fixture(t, '<script>window.sync = document.currentScript instanceof HTMLScriptElement;</script><p id="last"></p>');
  assert.equal(f.window.sync, true); assert.ok(f.document.getElementById('last')); await f.loaded();
});

test('large source keeps a real external blocker, then continues feeding beyond its current chunk', async t => {
  let release;
  const f = await fixture(t, '<script src="/block.js"></script><p id="after"></p>' + '<i></i>'.repeat(4000) + '<script>window.atEnd=true;</script>', {
    '/block.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('window.beforeAfter=document.getElementById("after");'); }; },
  });
  await until(() => release); assert.equal(f.document.getElementById('after'), null); assert.equal(f.document.readyState, 'loading');
  release(); await f.loaded(); assert.equal(f.window.beforeAfter, null); assert.equal(f.window.atEnd, true);
  assert.equal(f.document.querySelectorAll('i').length, 4000); assert.deepEqual(f.requests, ['/block.js']);
});

test('stylesheet blockers and inline document.write retain ordering through subsequent chunks', async t => {
  let release;
  const f = await fixture(t, `<link rel="stylesheet" href="/slow.css"><script>
    window.order=['script'];document.write('<b id="written">write</b>');
    window.writtenVisible=!!document.getElementById('written');window.sheets=document.styleSheets.length;
  </script>` + '<i></i>'.repeat(4000) + '<script>order.push("end");</script>', {
    '/slow.css': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/css' }); response.end('b{color:red}'); }; },
  });
  await until(() => release); assert.equal(f.window.order, undefined); assert.equal(f.document.readyState, 'loading');
  release(); await f.loaded(); assert.equal(f.window.writtenVisible, true); assert.equal(f.window.sheets, 1);
  assert.deepEqual([...f.window.order], ['script', 'end']); assert.equal(f.document.getElementById('written').textContent, 'write');
});

test('disabled JavaScript streams the real document without fetching or executing scripts', async t => {
  let observed;
  const f = await fixture(t, '<script src="/never.js"></script>' + '<i></i>'.repeat(4000) + '<script>window.executed=true;</script>', {
    '/never.js': 'window.executed=true;',
  }, { javascript: false, prepare(page, window) { observed = new window.MutationObserver(() => {}); observed.observe(window.document, { childList: true, subtree: true }); } });
  await f.loaded(); assert.equal(f.window.executed, undefined); assert.deepEqual(f.requests, []); assert.equal(f.document.querySelectorAll('i').length, 4000); observed.disconnect();
});

test('aborting a pending feed prevents future DOM work and never invents EOF completion', async () => {
  const controller = new AbortController(), parser = new parse5.Parser(), complete = [];
  const stream = createParserStream(parser, '<i></i>'.repeat(4000), { signal: controller.signal, onComplete: () => complete.push(true) });
  stream.start(); const fed = stream.state.charsFed; controller.abort(); await tick();
  assert.equal((await stream.completion).status, 'aborted'); assert.equal(stream.state.charsFed, fed);
  assert.equal(parser.stopped, false); assert.deepEqual(complete, []);
});

test('closing an actual streamed window cancels continuation tasks and stale script execution', async t => {
  const f = await fixture(t, '<i></i>'.repeat(4000) + '<script>window.stale=true;</script>');
  const document = f.document;
  assert.ok(document.querySelectorAll('i').length > 0);
  assert.ok(document.querySelectorAll('i').length < 4000);
  f.window.close(); const afterClose = document.querySelectorAll('*').length;
  await tick(); await tick();
  assert.equal(f.window.stale, undefined); assert.equal(document.querySelectorAll('*').length, afterClose);
  assert.equal(f.page.closed, false); assert.equal(f.page.documentAbort.signal.aborted, false);
});

test('captured document identity prevents queued parser work even when the adapter close hook is bypassed', async t => {
  let rawClose;
  const f = await fixture(t, '<i></i>'.repeat(4000) + '<script>window.stale=true;</script>', {}, {
    beforeInstall(page, window) { rawClose = window.close.bind(window); },
  });
  const document = f.document;
  assert.ok(document.querySelectorAll('i').length > 0);
  rawClose(); const afterClose = document.querySelectorAll('*').length;
  assert.equal(f.window.document, undefined);
  await tick(); await tick();
  assert.equal(document.querySelectorAll('*').length, afterClose); assert.equal(f.window.stale, undefined);
  assert.equal(f.page.closed, false); assert.equal(f.page.documentAbort.signal.aborted, false);
});

test('closing a window aborts an actual unused delayed script preload without stale resource events', async t => {
  let received = false, disconnected = false, events = 0;
  const f = await fixture(t, '<link rel="preload" as="script" href="/unused.js" onload="reportPreload()" onerror="reportPreload()">', {
    '/unused.js': (request, response) => {
      received = true; response.on('close', () => { disconnected = true; });
      // Keep the real body response pending until window.close cancels it.
    },
  }, { prepare(page, window) { window.reportPreload = () => { events++; }; } });
  await until(() => received); await f.loaded(); assert.equal(disconnected, false);
  f.window.close(); const afterClose = f.document.querySelectorAll('*').length;
  await until(() => disconnected); await tick(); await tick();
  assert.equal(events, 0); assert.equal(f.document.querySelectorAll('*').length, afterClose);
  assert.equal(f.page.closed, false); assert.equal(f.page.documentAbort.signal.aborted, false);
});

test('srcdoc frame streaming uses actual child contexts and waits for a real blocker', async t => {
  let release;
  const source = '<script src="/child.js"></script>' + '<i></i>'.repeat(4000) + '<p id="end"></p>';
  const escaped = source.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const f = await fixture(t, `<iframe id="frame" srcdoc="${escaped}"></iframe>`, {
    '/child.js': (request, response) => { release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end('window.childRan=true;'); }; },
  }, { frames: true });
  await until(() => release); const frame = f.document.getElementById('frame'), window = frame.contentWindow;
  assert.equal(frame.contentDocument.getElementById('end'), null); release();
  await until(() => frame.contentDocument.readyState === 'complete');
  assert.equal(frame.contentWindow, window); assert.equal(window.childRan, true); assert.equal(frame.contentDocument.querySelectorAll('i').length, 4000);
});

test('controller validation fails explicitly and a pre-aborted source performs no parse work', async () => {
  assert.throws(() => createParserStream({}, ''), /parse5 parser/);
  assert.throws(() => createParserStream(new parse5.Parser(), '', { chunkSize: 0 }), /chunk size/);
  const signal = AbortSignal.abort(), parser = new parse5.Parser(), stream = createParserStream(parser, '<p>never</p>', { signal });
  stream.start(); assert.equal((await stream.completion).status, 'aborted'); assert.equal(stream.state.chunks, 0);
});
