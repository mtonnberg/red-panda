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
function portMessage(port) { return deadline(new Promise(resolve => {
  port.addEventListener('message', resolve, { once: true }); port.start();
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

test('workers expose geometry constructors and clone geometry in their own realm', async t => {
  const f = fixture(t, { 'https://example.test/app/geometry.js': `
    const matrix = new DOMMatrix().translate(5, 7).scale(2);
    const point = new DOMPoint(3, 4).matrixTransform(matrix);
    const cloned = structuredClone({ point, rect: new DOMRect(1, 2, 3, 4) });
    let matrixError; try { structuredClone(matrix); } catch (error) { matrixError = error.name; }
    postMessage({ point: cloned.point.toJSON(), rect: cloned.rect.toJSON(),
      ownRealm: [cloned.point instanceof DOMPoint, matrixError === 'DataCloneError',
        cloned.rect instanceof DOMRect], matrix: Array.from(matrix.toFloat64Array()) });
  ` });
  const worker = new f.window.Worker('./geometry.js');
  const data = await message(worker);
  assert.deepEqual({ ...data.point }, { x: 11, y: 15, z: 0, w: 1 });
  assert.deepEqual([...data.ownRealm], [true, true, true]);
  assert.equal(data.rect.width, 3); assert.equal(data.rect.bottom, 6);
  assert.equal(data.matrix[12], 5); assert.deepEqual(f.errors, []);
  worker.terminate();
});

test('worker dynamic imports reject HTTP failures with the native load error contract', async t => {
  const f = fixture(t, { 'https://example.test/app/missing-import.js': `
    import('./not-found.js').then(() => postMessage('unexpected success'),
      error => postMessage({ name: error.name, message: error.message, string: String(error) }));
  ` });
  const worker = new f.window.Worker('./missing-import.js');
  assert.deepEqual({ ...(await message(worker)) }, { name: 'TypeError', message: 'Abort', string: 'TypeError: Abort' });
  assert.equal(f.requests.find(request => request.url.endsWith('/not-found.js')).type, 'Script');
  assert.deepEqual(f.errors, []); worker.terminate();
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
    const id = setTimeout(function(a, b) { clearInterval(interval); postMessage({ numeric: typeof id, same: this === self, sum: a+b, count: count > 0, stringValue, timeoutLength:setTimeout.length, intervalLength:setInterval.length }); }, 15, 2, 4);` });
  const worker = new f.window.Worker('./timers.js'), data = await message(worker);
  assert.equal(data.numeric, 'number'); assert.equal(data.same, true); assert.equal(data.sum, 6);
  assert.equal(data.count, true); assert.equal(data.stringValue, 3); worker.terminate();
  assert.equal(data.timeoutLength, 1); assert.equal(data.intervalLength, 1);
});

test('classic workers dynamically import actual cached modules in their own realm', async t => {
  const f = fixture(t, {
    'https://example.test/app/classic-import.js': `(async()=>{const first=await import('./dynamic.js');const second=await import('./dynamic.js');postMessage({value:first.multiply(6,7),same:first===second,leaked:typeof moduleOnly})})().catch(error=>postMessage({error:error.message}));`,
    'https://example.test/app/dynamic.js': 'const moduleOnly=true;export const multiply=(a,b)=>a*b;',
  });
  const worker = new f.window.Worker('./classic-import.js'); const data = await message(worker);
  assert.equal(data.value, 42, data.error); assert.equal(data.same, true); assert.equal(data.leaked, 'undefined');
  assert.equal(f.requests.filter(request => request.url.endsWith('/dynamic.js')).length, 1); worker.terminate();
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

test('dedicated worker URL origins and non-transferable values fail explicitly', t => {
  const f = fixture(t);
  assert.throws(() => new f.window.Worker('https://elsewhere.test/a.js'), error => error.name === 'SecurityError');
  assert.throws(() => new f.window.Worker('file:///not-a-worker.js'), error => error.name === 'NotSupportedError');
  assert.throws(() => new f.window.Worker('./x.js', { type: 'bad' }), /Worker type/);
  const worker = new f.window.Worker('./x.js');
  assert.throws(() => worker.postMessage('x', [{}]), error => error.name === 'DataCloneError'); worker.terminate();
});

test('dedicated workers receive transferred native ports with realm values and trusted events exactly once', async t => {
  const f = fixture(t, { 'https://example.test/app/ports.js': `
    onmessage = event => {
      const port = event.data.port; let count = 0;
      port.onmessage = message => port.postMessage({ echoed: message.data, count: ++count,
        trusted: message.isTrusted, currentTarget: message.currentTarget === port,
        realm: message.data.bytes instanceof Uint8Array });
      postMessage({ ready: true, samePort: event.ports[0] === port, portType: port instanceof MessagePort,
        trusted: event.isTrusted, portsArray: event.ports instanceof Array, frozen: Object.isFrozen(event.ports),
        hidden: [typeof __createTrustedMessage, typeof __emitMessage, typeof trustedEvents] });
    };` });
  const worker = new f.window.Worker('./ports.js'), channel = new f.window.MessageChannel();
  let workerEvent;
  worker.addEventListener('message', event => { workerEvent = event; }, { once: true });
  const ready = message(worker); worker.postMessage({ port: channel.port2 }, [channel.port2]);
  const startup = await ready;
  assert.equal(startup.samePort, true); assert.equal(startup.portType, true); assert.equal(startup.trusted, true);
  assert.equal(startup.portsArray, true); assert.equal(startup.frozen, true); assert.deepEqual([...startup.hidden], ['undefined', 'undefined', 'undefined']);
  assert.equal(workerEvent.isTrusted, true);
  let delivered = 0; channel.port1.addEventListener('message', () => delivered++);
  const echoed = portMessage(channel.port1); channel.port1.postMessage({ bytes: new f.window.Uint8Array([4, 5]) });
  const result = (await echoed).data;
  assert.equal(result.count, 1); assert.equal(result.trusted, true); assert.equal(result.currentTarget, true); assert.equal(result.realm, true);
  assert.ok(result.echoed.bytes instanceof f.window.Uint8Array); assert.deepEqual([...result.echoed.bytes], [4, 5]);
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(delivered, 1); assert.deepEqual(f.errors, []); worker.terminate();
});

test('worker-created channels transfer their endpoints back to the page and remain entangled across threads', async t => {
  const f = fixture(t, { 'https://example.test/app/created-port.js': `
    const channel = new MessageChannel();
    channel.port2.onmessage = event => channel.port2.postMessage({ echoed: event.data, createdInWorker: true });
    postMessage({ port: channel.port1 }, { transfer: [channel.port1] });` });
  const worker = new f.window.Worker('./created-port.js');
  const received = await deadline(new Promise((resolve, reject) => {
    worker.onmessage = resolve; worker.onerror = event => reject(event.error);
  }));
  assert.equal(received.ports.length, 1); assert.equal(received.data.port, received.ports[0]);
  assert.ok(received.data.port instanceof f.window.MessagePort); assert.equal(received.isTrusted, true);
  const reply = portMessage(received.data.port); received.data.port.postMessage('actual worker endpoint');
  assert.equal((await reply).data.echoed, 'actual worker endpoint'); worker.terminate();
});

test('worker structuredClone transfers ports locally and reports detached-port clone errors', async t => {
  const f = fixture(t, { 'https://example.test/app/local-port.js': `
    const channel = new MessageChannel();
    const cloned = structuredClone({ port: channel.port2 }, { transfer: [channel.port2] });
    let failure;
    try { postMessage('invalid transfer', [channel.port2]); } catch(error) { failure = error.name; }
    channel.port1.onmessage = event => postMessage({ value: event.data, cloneType: cloned.port instanceof MessagePort, failure });
    cloned.port.postMessage('local native channel');` });
  const worker = new f.window.Worker('./local-port.js'), result = await message(worker);
  assert.equal(result.value, 'local native channel'); assert.equal(result.cloneType, true); assert.equal(result.failure, 'DataCloneError');
  assert.deepEqual(f.errors, []); worker.terminate();
});

test('separate actual workers communicate directly through transferred channel endpoints', async t => {
  const f = fixture(t, {
    'https://example.test/app/port-a.js': `onmessage = event => { const port = event.ports[0];port.onmessage = reply => postMessage({ reply: reply.data });port.postMessage('from worker A'); };`,
    'https://example.test/app/port-b.js': `onmessage = event => { const port = event.ports[0];port.onmessage = message => port.postMessage(message.data + ' through worker B'); };`,
  });
  const first = new f.window.Worker('./port-a.js'), second = new f.window.Worker('./port-b.js'), channel = new f.window.MessageChannel();
  const result = message(first); first.postMessage(null, [channel.port1]); second.postMessage(null, [channel.port2]);
  assert.equal((await result).reply, 'from worker A through worker B'); assert.deepEqual(f.errors, []); first.terminate(); second.terminate();
});

test('disabled worker resources still serialize and detach transferable ports and buffers', t => {
  const f = fixture(t); const disabled = installWorkers(f.page, f.window, { enabled: false }); t.after(() => disabled.dispose());
  const worker = new f.window.Worker('./disabled.js'), channel = new f.window.MessageChannel(), bytes = new f.window.Uint8Array([1, 2]);
  worker.postMessage({ port: channel.port1, bytes }, [channel.port1, bytes.buffer]); assert.equal(bytes.byteLength, 0);
  assert.throws(() => worker.postMessage(null, [channel.port1]), { name: 'DataCloneError' }); assert.equal(f.requests.length, 0);
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
