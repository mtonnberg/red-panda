import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installModuleScripts } from '../src/modules.js';

const timeout = promise => Promise.race([promise, new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error('Module fixture timed out')), 3000); timer.unref();
})]);
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, html, sources = {}, options = {}) {
  const page = new EventEmitter();
  page.documentAbort = new AbortController(); page.javascript = options.javascript ?? true;
  const requests = [], errors = [];
  page.on('pageError', error => errors.push(error));
  page.fetch = async (url, init, type) => {
    requests.push({ url, init, type });
    let entry = sources[url];
    if (typeof entry === 'function') entry = await entry(init);
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (typeof entry === 'string') entry = { source: entry };
    const response = new Response(entry?.source ?? '', { status: entry?.status ?? (entry ? 200 : 404),
      headers: { 'content-type': entry?.mime ?? 'text/javascript' } });
    Object.defineProperty(response, 'url', { value: entry?.url ?? url });
    return response;
  };
  const dom = new JSDOM(html, { url: options.url ?? 'https://example.test/app/index.html',
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.fetch = (url, init = {}) => page.fetch(new URL(url, window.document.baseURI).href,
        { ...init, signal: page.documentAbort.signal }, 'Fetch');
      installModuleScripts(page, window);
    } });
  page.dom = dom;
  t.after(() => { page.closed = true; page.documentAbort.abort(); dom.window.close(); });
  return { page, window: dom.window, document: dom.window.document, errors, requests,
    ready: () => timeout(page.moduleReady) };
}

test('inline modules execute in the page realm with document order and isolated bindings', async t => {
  const f = fixture(t, `<script>window.order = ['classic'];</script>
    <script type="module">const local = 21; window.order.push('first'); window.fromModule = [local * 2];</script>
    <script type="module">window.order.push('second'); window.bindingType = typeof local;</script>`);
  await f.ready();
  assert.deepEqual([...f.window.order], ['classic', 'first', 'second']);
  assert.equal(f.window.fromModule instanceof f.window.Array, true);
  assert.equal(f.window.fromModule[0], 42); assert.equal(f.window.bindingType, 'undefined');
  assert.deepEqual(f.errors, []);
});

test('external relative imports share a per-document module cache and import.meta.url', async t => {
  const f = fixture(t, `<script type="module" src="./main.js"></script>
    <script type="module">import { value } from './dep.js'; window.second = value;</script>`, {
    'https://example.test/app/main.js': `import { value } from './dep.js'; window.answer = value;
      window.mainMeta = import.meta.url; window.resolved = import.meta.resolve('./dep.js');`,
    'https://example.test/app/dep.js': 'window.dependencyRuns = (window.dependencyRuns || 0) + 1; export const value = 42;',
  });
  await f.ready();
  assert.equal(f.window.answer, 42); assert.equal(f.window.second, 42); assert.equal(f.window.dependencyRuns, 1);
  assert.equal(f.window.mainMeta, 'https://example.test/app/main.js');
  assert.equal(f.window.resolved, 'https://example.test/app/dep.js');
  assert.equal(f.requests.filter(request => request.url.endsWith('/dep.js')).length, 1);
  assert.ok(f.requests.every(request => request.type === 'Script' && request.init.signal === f.page.documentAbort.signal));
  assert.deepEqual(f.errors, []);
});

test('module graphs support cycles, re-exports, dynamic import and top-level await', async t => {
  const f = fixture(t, `<script type="module">import { read } from './a.js';
    const namespace = await import('./dynamic.js'); window.result = read() + namespace.value;
    window.dynamicMeta = namespace.url;</script>`, {
    'https://example.test/app/a.js': "import { b } from './b.js'; export const a = 2; export const read = () => a + b;",
    'https://example.test/app/b.js': "import { a } from './a.js'; export const b = 3; export const getA = () => a;",
    'https://example.test/app/dynamic.js': "export { value } from './value.js'; export const url = import.meta.url;",
    'https://example.test/app/value.js': 'await new Promise(resolve => setTimeout(resolve, 10)); export const value = 7;',
  });
  await f.ready(); assert.equal(f.window.result, 12);
  assert.equal(f.window.dynamicMeta, 'https://example.test/app/dynamic.js'); assert.deepEqual(f.errors, []);
});

test('deferred modules begin before real DOMContentLoaded without deadlocking top-level await', async t => {
  const f = fixture(t, `<script>window.order = [];
    document.addEventListener('DOMContentLoaded', () => window.order.push('dom'));
    window.addEventListener('load', () => window.order.push('load'));</script>
    <script type="module">window.order.push('module');
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    window.order.push('after-dom');</script>
    <script type="module">window.order.push('next-module');</script>`);
  await f.ready(); await tick();
  assert.equal(f.window.order[0], 'module');
  assert.ok(f.window.order.indexOf('next-module') < f.window.order.indexOf('dom'));
  assert.ok(f.window.order.indexOf('after-dom') > f.window.order.indexOf('dom'));
  assert.equal(f.document.readyState, 'complete'); assert.deepEqual(f.errors, []);
});

test('a module awaiting window load does not prevent native load dispatch', async t => {
  const f = fixture(t, `<script type="module">
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    window.afterLoad = document.readyState;</script>`);
  await f.ready(); assert.equal(f.window.afterLoad, 'complete'); assert.deepEqual(f.errors, []);
});

test('base URLs and redirected module URLs resolve imports in the correct scope', async t => {
  const f = fixture(t, `<base href="/assets/"><script type="module">import { value } from './value.js';
    window.inlineValue = value; window.inlineMeta = import.meta.url;</script><script type="module" src="./redirect.js"></script>`, {
    'https://example.test/assets/value.js': 'export const value = 8;',
    'https://example.test/assets/redirect.js': { url: 'https://example.test/final/main.js',
      source: "import { value } from './value.js'; window.redirectValue = value; window.redirectMeta = import.meta.url;" },
    'https://example.test/final/value.js': 'export const value = 9;',
  });
  await f.ready(); assert.equal(f.window.inlineValue, 8); assert.equal(f.window.redirectValue, 9);
  assert.equal(f.window.inlineMeta, 'https://example.test/app/index.html');
  assert.equal(f.window.redirectMeta, 'https://example.test/final/main.js'); assert.deepEqual(f.errors, []);
});

test('module failures report page errors, dispatch script errors and allow later scripts', async t => {
  const f = fixture(t, `<script>window.failed = 0;</script>
    <script type="module" src="missing.js" onerror="window.failed++"></script>
    <script type="module">throw new Error('module boom');</script>
    <script type="module">window.afterFailure = true;</script>`);
  await f.ready(); assert.equal(f.window.afterFailure, true); assert.equal(f.window.failed, 1);
  assert.equal(f.errors.length, 2);
  assert.ok(f.errors.some(error => error.message.includes('404')));
  assert.ok(f.errors.some(error => error.message === 'module boom'));
});

test('unsupported MIME, bare imports and import attributes fail explicitly', async t => {
  const f = fixture(t, `<script type="module" src="wrong.js"></script>
    <script type="module">import 'package';</script>
    <script type="module">import value from './data.json' with { type: 'json' };</script>`, {
    'https://example.test/app/wrong.js': { source: 'window.wrong = true;', mime: 'text/plain' },
  });
  await f.ready(); assert.equal(f.errors.length, 3); assert.equal(f.window.wrong, undefined);
  assert.ok(f.errors.some(error => /MIME/.test(error.message)));
  assert.ok(f.errors.some(error => /bare module/.test(error.message)));
  assert.ok(f.errors.some(error => /attributes/.test(error.message)));
});

test('dynamically inserted module elements execute once and emit load', async t => {
  const f = fixture(t, '<body></body>', {
    'https://example.test/app/dynamic.js': 'window.dynamicRuns = (window.dynamicRuns || 0) + 1;',
  });
  await f.ready();
  const script = f.document.createElement('script'); script.type = 'module'; script.src = './dynamic.js';
  const loaded = new Promise(resolve => script.addEventListener('load', resolve, { once: true }));
  f.document.body.append(script); await timeout(loaded);
  assert.equal(f.window.dynamicRuns, 1);
  script.remove(); f.document.body.append(script); await tick(); assert.equal(f.window.dynamicRuns, 1);
  assert.deepEqual(f.errors, []);
});

test('aborting the document cancels pending fetch work and settles readiness without late errors', async t => {
  let release;
  const f = fixture(t, '<script type="module" src="slow.js"></script>', {
    'https://example.test/app/slow.js': () => new Promise(resolve => { release = resolve; }),
  });
  while (!release) await tick();
  f.page.documentAbort.abort(); await f.ready();
  release({ source: 'window.late = true;' }); await tick(); await tick();
  assert.equal(f.window.late, undefined); assert.deepEqual(f.errors, []);
});

test('module caches are isolated between page documents', async t => {
  const source = { 'https://example.test/app/dep.js': 'window.runs = (window.runs || 0) + 1;' };
  const a = fixture(t, '<script type="module" src="dep.js"></script>', source);
  const b = fixture(t, '<script type="module" src="dep.js"></script>', source);
  await Promise.all([a.ready(), b.ready()]);
  assert.equal(a.window.runs, 1); assert.equal(b.window.runs, 1);
  assert.equal(a.requests.length, 1); assert.equal(b.requests.length, 1);
});

test('async external roots allow DOMContentLoaded while load awaits their evaluation start', async t => {
  let release;
  const f = fixture(t, `<script>window.order = [];
    document.addEventListener('DOMContentLoaded', () => window.order.push('dom'));
    window.addEventListener('load', () => window.order.push('load'));</script>
    <script async type="module" src="slow.js"></script>
    <script type="module">window.order.push('deferred');</script>`, {
    'https://example.test/app/slow.js': () => new Promise(resolve => { release = resolve; }),
  });
  while (!release || !f.window.order.includes('dom')) await tick();
  assert.deepEqual([...f.window.order], ['deferred', 'dom']);
  release({ source: "window.order.push('async');" });
  await f.ready(); await tick();
  assert.deepEqual([...f.window.order], ['deferred', 'dom', 'async', 'load']);
  assert.deepEqual(f.errors, []);
});

test('external roots preserve execution order despite out-of-order transport completion', async t => {
  let release;
  const f = fixture(t, `<script>window.order = [];</script>
    <script type="module" src="first.js"></script><script type="module" src="second.js"></script>`, {
    'https://example.test/app/first.js': () => new Promise(resolve => { release = resolve; }),
    'https://example.test/app/second.js': "window.order.push('second');",
  });
  while (!release || f.requests.length < 2) await tick();
  assert.deepEqual([...f.window.order], []);
  release({ source: "window.order.push('first');" });
  await f.ready(); assert.deepEqual([...f.window.order], ['first', 'second']);
});

test('invalid src URLs fail one script without preventing later module execution', async t => {
  const f = fixture(t, `<script type="module" src="http://["></script>
    <script type="module">window.afterInvalidURL = true;</script>`);
  await f.ready(); assert.equal(f.window.afterInvalidURL, true); assert.equal(f.errors.length, 1);
});

test('disabled JavaScript skips module execution and fetches', async t => {
  const f = fixture(t, '<script type="module" src="main.js"></script>', {}, { javascript: false });
  await f.ready(); assert.deepEqual(f.requests, []); assert.deepEqual(f.errors, []);
});
