import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import { installWorkers } from '../src/workers.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deadline = (promise, milliseconds = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Worker fixture timed out')), milliseconds);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
function fixture(t, sources = {}) {
  const page = new EventEmitter(); page.documentAbort = new AbortController();
  const errors = [], requests = [];
  page.on('pageError', error => errors.push(error));
  page.referrerFor = (url, source) => source;
  page.fetch = async (url, init, type) => {
    requests.push({ url, init, type });
    let entry = sources[url]; if (typeof entry === 'function') entry = await entry(init);
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (typeof entry === 'string') entry = { source: entry };
    const response = new Response(entry?.source ?? '', { status: entry?.status ?? (entry ? 200 : 404),
      headers: { 'content-type': entry?.mime ?? 'text/javascript', ...(entry?.headers ?? {}) } });
    Object.defineProperty(response, 'url', { value: entry?.url ?? url }); return response;
  };
  const dom = new JSDOM('<body></body>', { url: 'https://example.test/app/page.html', runScripts: 'outside-only' });
  const workers = installWorkers(page, dom.window);
  t.after(() => { page.closed = true; page.documentAbort.abort(); workers.dispose(); dom.window.close(); });
  return { page, window: dom.window, workers, errors, requests };
}
function message(worker) { return deadline(new Promise((resolve, reject) => {
  worker.addEventListener('message', event => resolve(event.data), { once: true });
  worker.addEventListener('error', event => reject(event.error ?? new Error(event.message)), { once: true });
})); }

test('dedicated workers run in isolated threads and deliver queued messages in both directions', async t => {
  const f = fixture(t, { 'https://example.test/app/echo.js': `self.workerOnly = true;
    onmessage = event => postMessage({ echo: event.data, realm: [typeof process, typeof require, typeof document],
      isArray: event.data instanceof Array, location: String(location), name });` });
  const worker = new f.window.Worker('./echo.js', { name: 'echo' });
  const result = message(worker); worker.postMessage(f.window.Array.of('hello'));
  const data = await result;
  assert.deepEqual([...data.echo], ['hello']); assert.deepEqual([...data.realm], ['undefined', 'undefined', 'undefined']);
  assert.equal(data.isArray, true); assert.equal(data.echo instanceof f.window.Array, true);
  assert.equal(data.location, 'https://example.test/app/echo.js'); assert.equal(data.name, 'echo');
  assert.equal(f.window.workerOnly, undefined); assert.deepEqual(f.errors, []); worker.terminate();
});

test('structured clone preserves cycles, Map/Set, typed views and transferred ArrayBuffers', async t => {
  const f = fixture(t, { 'https://example.test/app/clone.js': `onmessage = event => {
    const data = event.data; data.bytes[0] += 1;
    postMessage({ data, checks: [data.self === data, data.map instanceof Map, data.bytes instanceof Uint8Array] }, [data.bytes.buffer]);
  };` });
  const worker = new f.window.Worker('./clone.js');
  const bytes = new f.window.Uint8Array([4, 5]);
  const value = { bytes, map: new f.window.Map([['x', 2]]), set: new f.window.Set([3]), date: new f.window.Date(123) }; value.self = value;
  const result = message(worker); worker.postMessage(value, { transfer: [bytes.buffer] });
  assert.equal(bytes.byteLength, 0);
  const data = await result;
  assert.deepEqual([...data.checks], [true, true, true]); assert.deepEqual([...data.data.bytes], [5, 5]);
  assert.equal(data.data.self, data.data); assert.equal(data.data.map instanceof f.window.Map, true);
  assert.equal(data.data.map.get('x'), 2); assert.equal(data.data.set.has(3), true); assert.equal(data.data.date.getTime(), 123);
  worker.terminate();
});

test('classic importScripts fetches and executes synchronously in supplied order', async t => {
  const f = fixture(t, {
    'https://example.test/app/main.js': "self.order = []; importScripts('./first.js', './second.js'); postMessage(order);",
    'https://example.test/app/first.js': "order.push('first'); self.value = 20;",
    'https://example.test/app/second.js': "order.push('second:' + (value + 2));",
  });
  const worker = new f.window.Worker('./main.js');
  assert.deepEqual([...(await message(worker))], ['first', 'second:22']);
  assert.equal(f.requests.length, 3); assert.ok(f.requests.every(request => request.type === 'Script'));
  assert.equal(f.requests[1].init.headers.get('referer'), 'https://example.test/app/main.js'); worker.terminate();
});

test('worker fetch uses the host transport and creates usable browser response objects', async t => {
  const f = fixture(t, {
    'https://example.test/app/fetch.js': `onmessage = async () => { const response = await fetch('./data', { method: 'POST', headers: { 'x-worker': 'yes' }, body: 'payload' });
      postMessage({ text: await response.text(), status: response.status, header: response.headers.get('x-result'), url: response.url }); };`,
    'https://example.test/app/data': { source: 'response body', status: 201, headers: { 'x-result': 'ok' } },
  });
  const worker = new f.window.Worker('./fetch.js'); const result = message(worker); worker.postMessage('fetch');
  const data = await result;
  assert.equal(data.text, 'response body'); assert.equal(data.status, 201); assert.equal(data.header, 'ok');
  assert.equal(data.url, 'https://example.test/app/data');
  const request = f.requests.find(item => item.type === 'Fetch');
  assert.equal(request.init.method, 'POST'); assert.equal(request.init.headers.get('x-worker'), 'yes');
  assert.equal(new TextDecoder().decode(request.init.body), 'payload'); worker.terminate();
});

test('worker fetch AbortSignal cancels the owned transport request', async t => {
  let transportAborted = false;
  const f = fixture(t, {
    'https://example.test/app/abort.js': `const controller = new AbortController();
      setTimeout(() => controller.abort(), 25);
      fetch('./slow', { signal: controller.signal }).catch(error => postMessage(error.name));`,
    'https://example.test/app/slow': init => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { transportAborted = true; reject(init.signal.reason); }, { once: true });
    }),
  });
  const worker = new f.window.Worker('./abort.js'); assert.equal(await message(worker), 'AbortError');
  while (!transportAborted) await tick(); worker.terminate();
});

test('module workers link cached imports, dynamic imports and top-level await', async t => {
  const f = fixture(t, {
    'https://example.test/app/module.js': `import { value } from './dep.js';
      const dynamic = await import('./dynamic.js'); let importError;
      try { importScripts('./unused.js'); } catch (error) { importError = error.name; }
      onmessage = event => postMessage({ value: value + dynamic.value, echo: event.data, url: import.meta.url, importError });`,
    'https://example.test/app/dep.js': 'export const value = 20;',
    'https://example.test/app/dynamic.js': "import { value as other } from './dep.js'; await new Promise(resolve => setTimeout(resolve, 5)); export const value = other + 2;",
  });
  const worker = new f.window.Worker('./module.js', { type: 'module' }); const result = message(worker); worker.postMessage('hi');
  const data = await result; assert.equal(data.value, 42); assert.equal(data.echo, 'hi');
  assert.equal(data.url, 'https://example.test/app/module.js'); assert.equal(data.importError, 'TypeError');
  assert.equal(f.requests.filter(request => request.url.endsWith('/dep.js')).length, 1); worker.terminate();
});

test('concurrent worker dynamic imports share dependencies without racing module linking', async t => {
  const f = fixture(t, {
    'https://example.test/app/main.js': "const [a,b] = await Promise.all([import('./a.js'), import('./b.js')]); postMessage(a.value + b.value);",
    'https://example.test/app/a.js': "import { value as x } from './shared.js'; export const value = x;",
    'https://example.test/app/b.js': "import { value as x } from './shared.js'; export const value = x + 1;",
    'https://example.test/app/shared.js': 'export const value = 4;',
  });
  const worker = new f.window.Worker('./main.js', { type: 'module' });
  assert.equal(await message(worker), 9);
  assert.equal(f.requests.filter(request => request.url.endsWith('/shared.js')).length, 1); worker.terminate();
});

test('numeric timers bind this to worker self, pass arguments, support strings and cancel intervals', async t => {
  const f = fixture(t, { 'https://example.test/app/timers.js': `let count = 0;
    const interval = setInterval(() => count++, 1); const invalid = setTimeout(undefined);
    self.stringValue = 0; setTimeout('self.stringValue = 3;', 1);
    const id = setTimeout(function(a, b) { clearInterval(interval); postMessage({ numeric: typeof id, same: this === self, sum: a+b, count: count > 0, stringValue }); }, 15, 2, 4);` });
  const worker = new f.window.Worker('./timers.js'), data = await message(worker);
  assert.equal(data.numeric, 'number'); assert.equal(data.same, true); assert.equal(data.sum, 6);
  assert.equal(data.count, true); assert.equal(data.stringValue, 3); worker.terminate();
});

test('worker errors dispatch cancelable ErrorEvents and allow recovery from callback exceptions', async t => {
  const f = fixture(t, { 'https://example.test/app/error.js': `onmessage = event => { if (event.data === 'throw') throw new Error('worker boom'); postMessage('recovered'); };` });
  const worker = new f.window.Worker('./error.js');
  const error = deadline(new Promise(resolve => worker.addEventListener('error', event => { event.preventDefault(); resolve(event); }, { once: true })));
  worker.postMessage('throw'); const event = await error;
  assert.equal(event.message, 'worker boom'); assert.equal(event.filename, 'https://example.test/app/error.js');
  assert.equal(event.error instanceof f.window.Error, true); assert.deepEqual(f.errors, []);
  const result = message(worker); worker.postMessage('ok'); assert.equal(await result, 'recovered'); worker.terminate();
});

test('termination interrupts an infinite worker loop and page abort disposes all owned workers', async t => {
  const f = fixture(t, { 'https://example.test/app/infinite.js': "postMessage('started'); while (true) {}",
    'https://example.test/app/idle.js': 'onmessage = event => postMessage(event.data);' });
  const infinite = new f.window.Worker('./infinite.js'); assert.equal(await message(infinite), 'started');
  infinite.terminate(); assert.equal(f.workers.size, 0);
  const idle = new f.window.Worker('./idle.js'); const result = message(idle); idle.postMessage('ready'); await result;
  f.page.documentAbort.abort(); assert.equal(f.workers.size, 0);
  assert.throws(() => new f.window.Worker('./idle.js'), error => error.name === 'InvalidStateError');
});

test('worker close prevents later messages and terminates its timers', async t => {
  const f = fixture(t, { 'https://example.test/app/close.js': "postMessage('before'); close(); postMessage('after'); setTimeout(() => postMessage('timer'), 1);" });
  const worker = new f.window.Worker('./close.js'), messages = [];
  worker.onmessage = event => messages.push(event.data);
  while (!messages.length || f.workers.size) await tick();
  assert.deepEqual(messages, ['before']);
});

test('unsupported workers, URL origins and non-buffer transfers fail explicitly', t => {
  const f = fixture(t);
  assert.throws(() => new f.window.SharedWorker('./shared.js'), error => error.name === 'NotSupportedError');
  assert.throws(() => new f.window.Worker('https://elsewhere.test/a.js'), error => error.name === 'SecurityError');
  assert.throws(() => new f.window.Worker('blob:example'), error => error.name === 'NotSupportedError');
  assert.throws(() => new f.window.Worker('./x.js', { type: 'bad' }), /Worker type/);
  const worker = new f.window.Worker('./x.js');
  assert.throws(() => worker.postMessage('x', [{}]), error => error.name === 'DataCloneError'); worker.terminate();
});

test('an owned worker does not keep an otherwise idle browser process alive', async () => {
  const source = `import { JSDOM } from 'jsdom'; import { EventEmitter } from 'node:events';
    import { installWorkers } from ${JSON.stringify(new URL('../src/workers.js', import.meta.url).href)};
    const page = new EventEmitter(); page.documentAbort = new AbortController();
    page.fetch = async () => new Response("postMessage('started'); while(true) {}", { headers: { 'content-type': 'text/javascript' } });
    const dom = new JSDOM('', { url: 'https://example.test/', runScripts: 'outside-only' });
    const owner = installWorkers(page, dom.window);
    const timer = setTimeout(() => { owner.dispose(); process.exitCode = 1; }, 3000);
    const worker = new dom.window.Worker('/worker.js');
    worker.onmessage = () => { clearTimeout(timer); process.stdout.write('started'); };`;
  const result = await promisify(execFile)(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', source],
    { cwd: new URL('..', import.meta.url), timeout: 5000 });
  assert.equal(result.stdout, 'started');
});
