import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import { installMessaging } from '../src/messaging.js';

function fixture(t) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://messaging.test/', runScripts: 'outside-only' });
  const page = new EventEmitter(); Object.assign(page, { documentGeneration: 1, documentAbort: new AbortController(), closed: false });
  const bridge = installMessaging(page, dom.window);
  t.after(() => { page.closed = true; page.documentAbort.abort(); bridge.dispose(); dom.window.close(); });
  return { page, window: dom.window, bridge };
}
function deadline(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Messaging fixture timed out')), 5000);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
const message = port => deadline(new Promise(resolve => { port.onmessage = resolve; }));

test('real channel ports queue until start; onmessage starts automatically and UA events are trusted', async t => {
  const { window, bridge } = fixture(t), channel = new window.MessageChannel();
  assert.ok(channel instanceof window.Object); assert.ok(channel.port1 instanceof window.MessagePort); assert.ok(channel.port2 instanceof window.EventTarget);
  assert.notEqual(channel.port1, channel.port2); assert.equal(channel.port1, channel.port1); assert.throws(() => new window.MessagePort(), window.TypeError);
  const events = []; channel.port2.addEventListener('message', event => events.push(event));
  channel.port1.postMessage('queued'); await delay(15); assert.equal(events.length, 0);
  const received = deadline(new Promise(resolve => channel.port2.addEventListener('message', resolve, { once: true })));
  channel.port2.start(); const event = await received;
  assert.equal(event.data, 'queued'); assert.equal(event.currentTarget, null); assert.equal(event.target, channel.port2);
  assert.ok(event instanceof window.MessageEvent); assert.equal(event.isTrusted, true); assert.equal(event.cancelable, false); assert.equal(event.bubbles, false);
  assert.equal(event.source, null); assert.equal(event.origin, ''); assert.ok(event.ports instanceof window.Array); assert.equal(Object.isFrozen(event.ports), true);
  const reply = message(channel.port1); channel.port2.postMessage('reply'); assert.equal((await reply).data, 'reply');
  channel.port1.close(); channel.port2.close(); assert.equal(bridge.size, 0);
});

test('native structured clone preserves graph cycles, Map/Set, sparse arrays and shared typed buffers in the receiving realm', async t => {
  const { window } = fixture(t), channel = new window.MessageChannel();
  const buffer = new window.ArrayBuffer(12), bytes = new window.Uint8Array(buffer, 2, 4), view = new window.DataView(buffer, 4, 4);
  bytes.set([1, 2, 3, 4]);
  const value = { bytes, view, map: new window.Map(), set: new window.Set(), date: new window.Date(123), regex: new window.RegExp('a+', 'gi'), error: new window.TypeError('cloned') };
  value.self = value; value.map.set(value, bytes); value.set.add(value); value.sparse = new window.Array(3); value.sparse[2] = value;
  const result = message(channel.port2); channel.port1.postMessage(value); bytes[0] = 99;
  const data = (await result).data;
  assert.ok(data instanceof window.Object); assert.equal(data.self, data); assert.ok(data.map instanceof window.Map); assert.equal(data.map.get(data), data.bytes);
  assert.ok(data.set instanceof window.Set); assert.equal(data.set.has(data), true); assert.ok(data.bytes instanceof window.Uint8Array); assert.ok(data.view instanceof window.DataView);
  assert.equal(data.bytes.buffer, data.view.buffer); assert.ok(data.bytes.buffer instanceof window.ArrayBuffer); assert.deepEqual([...data.bytes], [1, 2, 3, 4]);
  assert.equal(data.bytes.byteOffset, 2); assert.equal(data.view.byteOffset, 4); assert.ok(data.date instanceof window.Date); assert.equal(data.date.getTime(), 123);
  assert.ok(data.regex instanceof window.RegExp); assert.equal(data.regex.flags, 'gi'); assert.ok(data.error instanceof window.TypeError); assert.equal(data.error.message, 'cloned');
  assert.ok(data.sparse instanceof window.Array); assert.equal(0 in data.sparse, false); assert.equal(data.sparse[2], data);
});

test('port and ArrayBuffer transfer really detach the source and preserve event ports/data identity', async t => {
  const { window } = fixture(t), carrier = new window.MessageChannel(), inner = new window.MessageChannel();
  const bytes = new window.Uint8Array([4, 5, 6]); const received = message(carrier.port2);
  carrier.port1.postMessage({ nested: new window.Map([['port', inner.port2]]), bytes }, { transfer: [inner.port2, bytes.buffer] });
  assert.equal(bytes.byteLength, 0);
  const event = await received, moved = event.data.nested.get('port');
  assert.equal(event.ports.length, 1); assert.equal(event.ports[0], moved); assert.notEqual(moved, inner.port2); assert.ok(moved instanceof window.MessagePort);
  assert.deepEqual([...event.data.bytes], [4, 5, 6]);
  assert.throws(() => carrier.port1.postMessage(null, [inner.port2]), { name: 'DataCloneError' });
  inner.port2.close(); // Closing the detached wrapper cannot close the moved endpoint.
  const echoed = message(inner.port1); moved.postMessage('through native moved port'); assert.equal((await echoed).data, 'through native moved port');
  const channel = new window.MessageChannel(), withoutData = message(carrier.port2);
  carrier.port1.postMessage('ports-only', [channel.port1]);
  const portsOnly = await withoutData; assert.equal(portsOnly.data, 'ports-only'); assert.equal(portsOnly.ports.length, 1);
});

test('queued native messages follow a started port when ownership transfers', async t => {
  const { window } = fixture(t), channel = new window.MessageChannel(), carrier = new window.MessageChannel();
  const lost = []; channel.port2.onmessage = event => lost.push(event.data);
  channel.port1.postMessage('first'); channel.port1.postMessage('second');
  const transferred = message(carrier.port2); carrier.port1.postMessage(null, [channel.port2]);
  const moved = (await transferred).ports[0]; channel.port1.postMessage('third');
  const values = [];
  await deadline(new Promise(resolve => { moved.onmessage = event => { values.push(event.data); if (values.length === 3) resolve(); }; }));
  assert.deepEqual(values, ['first', 'second', 'third']); assert.deepEqual(lost, []);
});

test('invalid clone/transfer fails atomically and closed ports still serialize/detach transferables', async t => {
  const { window } = fixture(t), carrier = new window.MessageChannel(), inner = new window.MessageChannel();
  const buffer = new window.ArrayBuffer(4);
  assert.throws(() => carrier.port1.postMessage(inner.port1), { name: 'DataCloneError' });
  assert.throws(() => carrier.port1.postMessage(null, [carrier.port1]), { name: 'DataCloneError' });
  assert.throws(() => carrier.port1.postMessage(null, [inner.port1, inner.port1]), { name: 'DataCloneError' });
  assert.throws(() => carrier.port1.postMessage(null, [{}]), { name: 'DataCloneError' });
  assert.throws(() => carrier.port1.postMessage({ callback() {} }, [buffer, inner.port1]), { name: 'DataCloneError' }); assert.equal(buffer.byteLength, 4);
  assert.throws(() => carrier.port1.postMessage(window.document.body), { name: 'DataCloneError' });
  assert.throws(() => carrier.port1.postMessage(new window.Blob(['unsupported'])), { name: 'DataCloneError' });
  carrier.port1.close(); assert.throws(() => carrier.port1.postMessage(Symbol()), { name: 'DataCloneError' });
  carrier.port1.postMessage(null, [inner.port1, buffer]); assert.equal(buffer.byteLength, 0);
  assert.throws(() => carrier.port1.postMessage(null, [inner.port1]), { name: 'DataCloneError' });
});

test('structuredClone adopts receiving intrinsics and performs real local port transfer', async t => {
  const { window } = fixture(t), channel = new window.MessageChannel();
  const buffer = new window.ArrayBuffer(3); new window.Uint8Array(buffer).set([1, 2, 3]);
  const original = { port: channel.port2, buffer, values: new window.Set([1]) }; original.self = original;
  const cloned = window.structuredClone(original, { transfer: [channel.port2, buffer] });
  assert.equal(buffer.byteLength, 0); assert.equal(cloned.self, cloned); assert.ok(cloned.values instanceof window.Set); assert.ok(cloned.buffer instanceof window.ArrayBuffer);
  assert.ok(cloned.port instanceof window.MessagePort); assert.notEqual(cloned.port, channel.port2);
  const reply = message(channel.port1); cloned.port.postMessage('cloned actual endpoint'); assert.equal((await reply).data, 'cloned actual endpoint');
});

test('bridge transfers real endpoints into another thread and receives worker-created ports back', async t => {
  const { window, bridge } = fixture(t), channel = new window.MessageChannel();
  const moduleURL = new URL('../src/messaging.js', import.meta.url).href;
  const thread = new Worker(`
    const { parentPort } = require('node:worker_threads'); const vm = require('node:vm');
    (async () => {
      const { createMessagingRealm } = await import(${JSON.stringify(moduleURL)});
      const context = vm.createContext({ DOMException });
      vm.runInContext('class EventTarget { constructor(){this.listeners=new Map()} addEventListener(t,f){const a=this.listeners.get(t)||[];a.push(f);this.listeners.set(t,a)} removeEventListener(t,f){this.listeners.set(t,(this.listeners.get(t)||[]).filter(x=>x!==f))} dispatchEvent(e){e.target=this;e.currentTarget=this;for(const f of this.listeners.get(e.type)||[])f.call(this,e)} }; class MessageEvent { constructor(type, init){this.type=type;Object.assign(this,init)} };Object.assign(globalThis,{EventTarget,MessageEvent});', context);
      const realm = vm.runInContext('globalThis', context), bridge = createMessagingRealm(realm);
      Object.assign(realm, { MessageChannel: bridge.MessageChannel, MessagePort: bridge.MessagePort });
      parentPort.on('message', envelope => {
        const event = bridge.receive(envelope), port = event.ports[0];
        port.onmessage = message => port.postMessage({ echoed: message.data, inThread: true, realmArray: event.data instanceof realm.Array });
        const created = new realm.MessageChannel();
        created.port2.onmessage = message => created.port2.postMessage({ viaWorkerCreated: message.data });
        const reply = bridge.prepare({ created: created.port1 }, [created.port1]);
        parentPort.postMessage(reply.message, reply.transfer); reply.commit();
        port.postMessage('ready');
      });
      parentPort.postMessage({ ready: true });
    })().catch(error => { throw error; });
  `, { eval: true });
  t.after(() => thread.terminate());
  await deadline(once(thread, 'message'));
  const workerCreated = deadline(once(thread, 'message')), ready = message(channel.port1);
  const prepared = bridge.prepare(window.Array.of('sent to actual thread'), [channel.port2]);
  thread.postMessage(prepared.message, prepared.transfer); prepared.commit();
  assert.equal((await ready).data, 'ready');
  const reply = message(channel.port1); channel.port1.postMessage('round trip');
  const result = (await reply).data; assert.equal(result.echoed, 'round trip'); assert.equal(result.inThread, true); assert.equal(result.realmArray, true);
  const returned = bridge.receive((await workerCreated)[0]); assert.equal(returned.ports[0], returned.data.created);
  const back = message(returned.data.created); returned.data.created.postMessage('created there');
  assert.equal((await back).data.viaWorkerCreated, 'created there');
});

test('document disposal closes owned ports and suppresses queued delivery without closing transferred ownership', async t => {
  const source = fixture(t), destination = fixture(t), carrier = new source.window.MessageChannel();
  const prepared = source.bridge.prepare({ first: carrier.port1, second: carrier.port2 }, [carrier.port1, carrier.port2]);
  const native = structuredClone(prepared.message, { transfer: prepared.transfer }); prepared.commit();
  const moved = destination.bridge.receive(native).data, doomed = new source.window.MessageChannel();
  let callbacks = 0; doomed.port1.onmessage = () => callbacks++;
  doomed.port2.postMessage('queued before disposal'); source.page.documentAbort.abort(); await delay(25);
  assert.equal(callbacks, 0); assert.equal(source.bridge.size, 0);
  assert.throws(() => new source.window.MessageChannel(), { name: 'InvalidStateError' });
  assert.ok(moved.first instanceof destination.window.MessagePort); assert.equal(destination.bridge.size, 2);
  const reply = message(moved.first); moved.second.postMessage('ownership survived'); assert.equal((await reply).data, 'ownership survived');
  destination.window.close(); assert.equal(destination.bridge.size, 0);
});

test('started ports do not retain the host event loop', async () => {
  const moduleURL = new URL('../src/messaging.js', import.meta.url).href;
  const code = `import {JSDOM} from 'jsdom';import {installMessaging} from ${JSON.stringify(moduleURL)};const dom=new JSDOM('',{runScripts:'outside-only'});const bridge=installMessaging({documentGeneration:0,documentAbort:new AbortController()},dom.window);const channel=new dom.window.MessageChannel();channel.port1.onmessage=()=>{};channel.port2.onmessage=()=>{};console.log('unref complete');`;
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url), timeout: 4000 });
  assert.match(result.stdout, /unref complete/);
});
