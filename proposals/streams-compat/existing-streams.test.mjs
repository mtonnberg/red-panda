import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import vm from 'node:vm';
import { gunzipSync, inflateSync, inflateRawSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { Browser } from '../../src/browser.js';
import { installStreams, STREAM_CONSTRUCTORS } from './candidate/streams.js';

function realm() {
  const dom = new JSDOM('<title>streams</title>', { runScripts: 'outside-only' });
  const window = dom.window, controller = installStreams(null, window);
  return { window, controller, close() { controller.dispose(); window.close(); } };
}
async function collect(readable) {
  const values = [], reader = readable.getReader();
  try { while (true) { const result = await reader.read(); if (result.done) return values; values.push(result.value); } }
  finally { reader.releaseLock(); }
}
function from(window, values) { return new window.ReadableStream({ start(c) { for (const value of values) c.enqueue(value); c.close(); } }); }

test('measured stream constructors, illegal constructors and absent BYOB/Node extras', () => {
  const { window: w, close } = realm();
  try {
    for (const name of STREAM_CONSTRUCTORS) { assert.equal(typeof w[name], 'function', name); assert.ok(w[name] instanceof w.Function); }
    for (const name of ['ReadableStreamBYOBReader', 'ReadableByteStreamController', 'ReadableStreamBYOBRequest']) assert.equal(typeof w[name], 'undefined');
    for (const name of ['ReadableStreamDefaultReader', 'ReadableStreamDefaultController', 'WritableStreamDefaultWriter', 'WritableStreamDefaultController', 'TransformStreamDefaultController']) {
      assert.throws(() => new w[name](), error => error instanceof w.TypeError && error.message === 'Illegal Constructor');
    }
    assert.equal(typeof w.ReadableStream.prototype.tee, 'function'); // Node Fetch clone needs this extension.
    assert.equal(typeof w.ReadableStream.prototype[Symbol.asyncIterator], 'function');
    assert.equal(new w.ReadableStream().getReader().closed, undefined);
    assert.equal(typeof w.WritableStream.prototype.abort, 'undefined');
  } finally { close(); }
});

test('readers have actual locks, realm records/promises, callbacks and source backpressure', async () => {
  const { window: w, close } = realm();
  try {
    let pulls = 0, captured, receiver;
    const source = { start(controller) { captured = controller; receiver = this; }, pull(c) { pulls++; c.enqueue(pulls); } };
    const stream = new w.ReadableStream(source, { highWaterMark: 1 });
    assert.equal(receiver, source); assert.ok(captured instanceof w.ReadableStreamDefaultController);
    await Promise.resolve(); await Promise.resolve(); assert.equal(pulls, 1); assert.equal(captured.desiredSize, 0);
    const reader = stream.getReader(); assert.ok(reader instanceof w.ReadableStreamDefaultReader); assert.equal(stream.locked, true);
    assert.throws(() => stream.getReader(), w.TypeError);
    const reading = reader.read(); assert.ok(reading instanceof w.Promise);
    const result = await reading; assert.ok(result instanceof w.Object); assert.equal(result.done, false); assert.equal(result.value, 1);
    await Promise.resolve(); assert.equal(pulls, 2); assert.equal(captured.desiredSize, 0);
    reader.releaseLock(); assert.equal(stream.locked, false);
  } finally { close(); }
});

test('readable cancellation preserves actual reason and propagates underlying source rejection', async () => {
  const { window: w, close } = realm();
  try {
    const reason = new w.Error('cancel reason'); let received;
    const stream = new w.ReadableStream({ cancel(value) { received = value; } });
    const reader = stream.getReader(), pending = reader.read();
    await reader.cancel(reason); assert.equal(received, reason); assert.equal((await pending).done, true);
    assert.equal(stream.locked, false);
    reader.releaseLock();
    const rejected = new w.ReadableStream({ cancel() { throw reason; } });
    await assert.rejects(rejected.cancel(), error => error === reason);
  } finally { close(); }
});

test('native reader.cancel releases synchronously before async cleanup and settles pending reads', async () => {
  const { window: w, close } = realm();
  try {
    let release, seen;
    const stream = new w.ReadableStream({ cancel(value) { seen = value; return new Promise(resolve => { release = resolve; }); } });
    const reader = stream.getReader(), pending = reader.read();
    const cancelling = reader.cancel('stop');
    assert.equal(stream.locked, false); assert.equal(seen, 'stop');
    assert.equal((await pending).done, true); release(); await cancelling;
    await assert.rejects(reader.read(), w.TypeError);
    for (const type of ['bytes', 'other']) {
      let controller;
      const source = new w.ReadableStream({ type, start(c) { controller = c; c.enqueue('notbytes'); c.close(); } });
      assert.ok(controller instanceof w.ReadableStreamDefaultController);
      const byobIgnored = source.getReader({ mode: 'byob' });
      assert.ok(byobIgnored instanceof w.ReadableStreamDefaultReader);
      assert.equal((await byobIgnored.read(new w.Uint8Array(1))).value, 'notbytes');
    }
  } finally { close(); }
});

test('WritableStream real backpressure, ready/closed state and error propagation', async () => {
  const { window: w, close } = realm();
  try {
    let release, entered; const values = [];
    const stream = new w.WritableStream({ write(value, controller) {
      assert.ok(controller instanceof w.WritableStreamDefaultController); entered = value;
      return new Promise(resolve => { release = () => { values.push(value); resolve(); }; });
    } }, { highWaterMark: 1 });
    const writer = stream.getWriter(); assert.ok(writer instanceof w.WritableStreamDefaultWriter);
    const writing = writer.write('one'); assert.ok(writing instanceof w.Promise); assert.equal(writer.desiredSize, 0);
    let ready = false; writer.ready.then(() => { ready = true; });
    await Promise.resolve(); await Promise.resolve(); assert.equal(entered, 'one'); assert.equal(ready, false);
    release(); await writing; await writer.ready; assert.equal(ready, true); assert.deepEqual(values, ['one']);
    const closed = writer.closed; assert.ok(closed instanceof w.Promise); await writer.close(); await closed;
    await assert.rejects(writer.write('late'), w.TypeError); writer.releaseLock(); assert.equal(stream.locked, false);
    const reason = new w.Error('sink failed'); const broken = new w.WritableStream({ write() { throw reason; } }).getWriter();
    const failure = broken.closed.catch(error => error); await assert.rejects(broken.write('x'), error => error === reason); assert.equal(await failure, reason);
  } finally { close(); }
});

test('transform pipelines operate on actual chunks and flush; async iteration cancels early', async () => {
  const { window: w, close } = realm();
  try {
    let controller;
    const transform = new w.TransformStream({ transform(value, c) { controller = c; c.enqueue(value.toUpperCase()); }, flush(c) { c.enqueue('END'); } });
    assert.deepEqual(await collect(from(w, ['one', 'two']).pipeThrough(transform)), ['ONE', 'TWO', 'END']);
    assert.ok(controller instanceof w.TransformStreamDefaultController);
    let cancelled = false;
    const stream = new w.ReadableStream({ pull(c) { c.enqueue('first'); }, cancel() { cancelled = true; } });
    const values = []; for await (const value of stream) { values.push(value); break; }
    assert.deepEqual(values, ['first']); assert.equal(cancelled, true); assert.equal(stream.locked, false);
  } finally { close(); }
});

test('ordinary chunks keep their identities and sink errors cancel the actual upstream source', async () => {
  const { window: w, close } = realm();
  try {
    const chunk = new w.Object(), callback = w.Function('return 1'), bytes = new w.Uint8Array([1, 2]);
    const values = await collect(from(w, [chunk, callback, bytes]));
    assert.equal(values[0], chunk); assert.equal(values[1], callback); assert.equal(values[2], bytes);
    const reason = new w.Error('sink fails'); let cancelled;
    const source = new w.ReadableStream({ pull(c) { c.enqueue('one'); }, cancel(value) { cancelled = value; } });
    await assert.rejects(source.pipeTo(new w.WritableStream({ write() { throw reason; } })), error => error === reason);
    assert.equal(cancelled, reason); assert.equal(source.locked, false);
  } finally { close(); }
});

test('pipeTo AbortSignal cancels source and aborts sink with same reason and releases locks', async () => {
  const { window: w, close } = realm();
  try {
    let cancelled, aborted, start;
    const entered = new Promise(resolve => { start = resolve; });
    const source = new w.ReadableStream({ cancel(reason) { cancelled = reason; } });
    const destination = new w.WritableStream({ start() { start(); }, abort(reason) { aborted = reason; } });
    const abort = new w.AbortController(), reason = new w.Error('stop piping');
    const piping = source.pipeTo(destination, { signal: abort.signal }); assert.ok(piping instanceof w.Promise);
    await entered; abort.abort(reason); await assert.rejects(piping, error => error === reason);
    assert.equal(cancelled, reason); assert.equal(aborted, reason); assert.equal(source.locked, false); assert.equal(destination.locked, false);
  } finally { close(); }
});

test('text codecs preserve split UTF-8 bytes and native per-chunk surrogate replacement', async () => {
  const { window: w, close } = realm();
  try {
    const encoder = new w.TextEncoder(); assert.equal(encoder.encoding, 'utf-8');
    const encoded = encoder.encode('hé😀'); assert.ok(encoded instanceof w.Uint8Array); assert.equal(new TextDecoder().decode(encoded), 'hé😀');
    const target = new w.Uint8Array(4), result = encoder.encodeInto('😀x', target);
    assert.ok(result instanceof w.Object); assert.equal(result.read, 2); assert.equal(result.written, 4);
    const output = await collect(from(w, ['€\ud83d', '\ude00']).pipeThrough(new w.TextEncoderStream()));
    for (const chunk of output) assert.ok(chunk instanceof w.Uint8Array);
    assert.equal(Buffer.concat(output).toString(), '€��'); // Native encodes split surrogate chunks independently.
    const decoder = new w.TextDecoderStream('utf-8', { fatal: true });
    assert.equal(decoder.encoding, 'utf-8'); assert.equal(decoder.fatal, true); assert.equal(decoder.ignoreBOM, false);
    const decoded = await collect(from(w, [new w.Uint8Array([0xe2]), new w.Uint8Array([0x82, 0xac])]).pipeThrough(decoder));
    assert.deepEqual(decoded, ['€']);
    await assert.rejects(collect(from(w, [new w.Uint8Array([0xff])]).pipeThrough(new w.TextDecoderStream('utf-8', { fatal: true }))), w.TypeError);
  } finally { close(); }
});

test('compression produces real gzip/deflate/raw bytes; decompression reverses independent zlib output', async () => {
  const { window: w, close } = realm();
  try {
    const original = 'Actual text €😀 with repetition. '.repeat(40), bytes = new w.TextEncoder().encode(original);
    for (const [format, inflate] of [['gzip', gunzipSync], ['deflate', inflateSync], ['deflate-raw', inflateRawSync]]) {
      const compression = new w.CompressionStream(format); assert.ok(compression.readable instanceof w.ReadableStream); assert.ok(compression.writable instanceof w.WritableStream);
      const compressed = Buffer.concat(await collect(from(w, [bytes.subarray(0, 13), bytes.subarray(13)]).pipeThrough(compression)));
      assert.equal(inflate(compressed).toString(), original); assert.ok(compressed.length < bytes.length);
      const decoded = await collect(from(w, [compressed.subarray(0, 4), compressed.subarray(4)]).pipeThrough(new w.DecompressionStream(format)).pipeThrough(new w.TextDecoderStream()));
      assert.equal(decoded.join(''), original);
    }
    for (const format of ['br', 'GZIP', '', undefined]) assert.throws(() => new w.CompressionStream(format), w.TypeError);
    await assert.rejects(collect(from(w, [new w.Uint8Array([1, 2, 3])]).pipeThrough(new w.DecompressionStream('gzip'))));
  } finally { close(); }
});

test('queuing strategies use actual byte sizes and reject invalid watermarks', () => {
  const { window: w, close } = realm();
  try {
    const bytes = new w.ByteLengthQueuingStrategy({ highWaterMark: 5 }), count = new w.CountQueuingStrategy({ highWaterMark: 2 });
    assert.ok(bytes.size instanceof w.Function); assert.equal(bytes.highWaterMark, 5); assert.equal(bytes.size(new w.Uint8Array(7)), 7); assert.equal(count.size('any'), 1);
    assert.throws(() => new w.ReadableStream({}, { highWaterMark: -1 }), w.RangeError);
  } finally { close(); }
});

test('Fetch response bodies retain native Node identity and adopt real realm methods', async () => {
  const server = http.createServer((req, res) => res.end('owned response €'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`http://127.0.0.1:${server.address().port}/`);
    const w = page.dom.window, controller = installStreams(page, w);
    const response = await w.fetch('/');
    assert.ok(response.body instanceof w.ReadableStream);
    controller.adopt(response.body); assert.equal(response.body.constructor, w.ReadableStream);
    const reader = response.body.getReader(); assert.ok(reader instanceof w.ReadableStreamDefaultReader);
    const reading = reader.read(); assert.ok(reading instanceof w.Promise);
    const chunk = await reading; assert.ok(chunk.value instanceof w.Uint8Array); assert.equal(new TextDecoder().decode(chunk.value), 'owned response €');
    assert.equal((await reader.read()).done, true); reader.releaseLock();
    const abort = new w.AbortController();
    const aborted = await w.fetch('/', { signal: abort.signal }); controller.adopt(aborted.body);
    abort.abort();
    await assert.rejects(aborted.body.getReader().read(), error => error instanceof w.DOMException && error.name === 'AbortError');
    const synthetic = new w.Response(from(w, [new w.TextEncoder().encode('real stream body')]));
    assert.equal(await synthetic.text(), 'real stream body');
    const clone = new w.Response(from(w, [new w.TextEncoder().encode('clone')]));
    // Fetch's internal tee remains available even though the public native
    // reference does not expose ReadableStream.prototype.tee.
    const clone2 = clone.clone(); assert.equal(await clone.text(), 'clone'); assert.equal(await clone2.text(), 'clone');
  } finally { browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
});

test('dispose rejects pending operations, cancels actual sources and aborts owned sinks once', async () => {
  const { window: w, controller, close } = realm();
  try {
    let cancelled = 0, aborted = 0;
    const stream = new w.ReadableStream({ cancel() { cancelled++; } }), reader = stream.getReader();
    const reading = reader.read();
    new w.WritableStream({ abort() { aborted++; } }).getWriter();
    controller.dispose(); controller.dispose();
    await assert.rejects(reading, error => error.name === 'AbortError');
    await Promise.resolve(); assert.equal(cancelled, 1); assert.equal(aborted, 1); assert.equal(controller.disposed, true);
    assert.throws(() => new w.ReadableStream(), error => error.name === 'AbortError');
  } finally { close(); }
});

test('repeated adoption keeps live native stream identity and disposes its actual source once', async () => {
  const { window: w, controller, close } = realm();
  try {
    let cancellations = 0;
    const raw = new ReadableStream({ cancel() { cancellations++; } });
    assert.equal(controller.adopt(raw), raw); assert.equal(controller.adopt(raw), raw);
    const reader = raw.getReader();
    assert.equal(controller.adopt(reader), reader); assert.equal(controller.adopt(reader), reader);
    const pending = reader.read();
    await Promise.resolve();
    assert.equal(raw.locked, true); assert.equal(raw.constructor, w.ReadableStream);
    controller.dispose();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(cancellations, 1);
  } finally { close(); }
});

test('document abort and Worker VM realms install independently with real streaming transforms', async () => {
  const context = vm.createContext({ DOMException }), w = vm.runInContext('globalThis', context);
  const abort = new AbortController(), controller = installStreams(null, w, { signal: abort.signal });
  try {
    const result = await vm.runInContext(`(async()=>{const s=new ReadableStream({start(c){c.enqueue('worker €');c.close()}});const r=s.pipeThrough(new TextEncoderStream()).pipeThrough(new TextDecoderStream()).getReader();const p=r.read();return {text:(await p).value,promise:p instanceof Promise,record:(await r.read()) instanceof Object,ctor:r instanceof ReadableStreamDefaultReader}})()`, context);
    assert.equal(result.text, 'worker €'); assert.equal(result.promise, true); assert.equal(result.record, true); assert.equal(result.ctor, true);
    abort.abort(); assert.equal(controller.disposed, true);
    assert.throws(() => vm.runInContext('new TransformStream()', context), error => error.name === 'AbortError');
  } finally { controller.dispose(); }
});
