import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installMutations, createInternalMutationObserver } from '../src/mutations.js';
import { installErrors } from '../src/errors.js';
import { installClassicScripts } from '../src/classic-scripts.js';

const checkpoint = () => new Promise(resolve => setImmediate(resolve));
function fixture(html = '<body><div id="root"><i id="child">old</i></div></body>', options = {}) {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController(), javascript: true });
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  let controller;
  const dom = new JSDOM(html, { url: 'https://mutations.test/', runScripts: 'dangerously', virtualConsole,
    beforeParse(window) {
      if (options.errors) installErrors(page, window);
      if (!options.native) controller = installMutations(page, window);
      if (options.classic) installClassicScripts(page, window);
    } });
  return { page, dom, window: dom.window, document: dom.window.document, controller, errors,
    close() { page.documentAbort.abort(); page.closed = true; dom.window.close(); } };
}

test('unobserved mutations and private invalidations cannot queue an early public checkpoint', async () => {
  const f = fixture();
  try {
    const privateRecords = [];
    const internal = createInternalMutationObserver(f.window, records => privateRecords.push(...records));
    internal.observe(f.document, { subtree: true, childList: true });
    f.window.eval(`globalThis.order=[];
      const parent=document.createElement('div');document.body.append(parent);
      new MutationObserver(()=>order.push('mutation')).observe(parent,{childList:true});
      Promise.resolve().then(()=>order.push('promise'));
      parent.append(document.createElement('i'));
      order.push('sync');`);
    await checkpoint();
    assert.deepEqual(Array.from(f.window.order), ['sync', 'promise', 'mutation']);
    assert.equal(privateRecords.length, 2);
    assert.equal(privateRecords.every(record => record instanceof f.window.MutationRecord), true);
  } finally { f.close(); }
});

test('actual native registrations preserve options, attribute filters, old values and record identity', async () => {
  const f = fixture();
  try {
    const target = f.document.querySelector('#child'), received = [];
    const observer = new f.window.MutationObserver(function (records, second) {
      received.push({ records, receiver: this, second });
    });
    observer.observe(target, { attributeFilter: ['data-x'], attributeOldValue: true });
    target.setAttribute('data-x', 'first'); target.setAttribute('ignored', 'x'); target.setAttribute('data-x', 'second');
    await checkpoint();
    assert.equal(received.length, 1); assert.equal(received[0].receiver, observer); assert.equal(received[0].second, observer);
    const records = received[0].records;
    assert.equal(records instanceof f.window.Array, true); assert.equal(records.length, 2);
    assert.equal(records[0] instanceof f.window.MutationRecord, true);
    assert.equal(records[0].target, target); assert.equal(records[0].attributeName, 'data-x');
    assert.equal(records[0].oldValue, null); assert.equal(records[1].oldValue, 'first');
    assert.equal(records[0].addedNodes instanceof f.window.NodeList, true);
    assert.equal(records[0].attributeNamespace, null);
    observer.observe(target, { attributes: true }); target.setAttribute('data-x', 'third');
    await checkpoint(); assert.equal(received[1].records[0].oldValue, null);
  } finally { f.close(); }
});

test('subtree character data and child-list records retain real siblings and static node snapshots', async () => {
  const f = fixture();
  try {
    const root = f.document.querySelector('#root'), child = f.document.querySelector('#child'), records = [];
    const observer = new f.window.MutationObserver(items => records.push(...items));
    observer.observe(root, { subtree: true, childList: true, characterDataOldValue: true });
    child.firstChild.data = 'new';
    const before = f.document.createElement('b'), after = f.document.createElement('em');
    root.insertBefore(before, child); root.append(after); root.removeChild(child);
    await checkpoint();
    assert.equal(records.length, 4); assert.equal(records[0].type, 'characterData'); assert.equal(records[0].oldValue, 'old');
    assert.equal(records[1].addedNodes[0], before); assert.equal(records[1].nextSibling, child);
    assert.equal(records[2].previousSibling, child); assert.equal(records[2].nextSibling, null);
    assert.equal(records[3].removedNodes[0], child); assert.equal(records[3].previousSibling, before); assert.equal(records[3].nextSibling, after);
    root.removeChild(before); assert.equal(records[1].addedNodes[0], before);
  } finally { f.close(); }
});

test('delivery follows native construction order even when first mutation order is reversed', async () => {
  const f = fixture();
  try {
    const a = f.document.querySelector('#root'), b = f.document.querySelector('#child'), order = [];
    const first = new f.window.MutationObserver(() => order.push('first'));
    const second = new f.window.MutationObserver(() => order.push('second'));
    first.observe(a, { attributes: true }); second.observe(b, { attributes: true });
    b.title = 'b'; a.title = 'a'; await checkpoint();
    assert.deepEqual(order, ['first', 'second']);
  } finally { f.close(); }
});

test('mutations during delivery run another checkpoint and disconnecting a later observer suppresses its records', async () => {
  const f = fixture();
  try {
    const target = f.document.querySelector('#child'), calls = [];
    const first = new f.window.MutationObserver(records => {
      calls.push(Array.from(records, record => record.attributeName));
      second.disconnect();
      if (calls.length === 1) target.setAttribute('second', 'x');
    });
    const second = new f.window.MutationObserver(() => calls.push(['unexpected']));
    first.observe(target, { attributes: true }); second.observe(target, { attributes: true });
    target.setAttribute('first', 'x'); await checkpoint();
    assert.deepEqual(calls, [['first'], ['second']]);
  } finally { f.close(); }
});

test('takeRecords drains actual records without canceling the native-observed checkpoint token', async () => {
  const f = fixture();
  try {
    f.window.eval(`globalThis.order=[];const target=document.getElementById('child');
      globalThis.observer=new MutationObserver(()=>order.push('mutation'));observer.observe(target,{attributes:true});
      target.setAttribute('first','x');globalThis.taken=observer.takeRecords();
      Promise.resolve().then(()=>order.push('promise'));target.setAttribute('second','x');`);
    assert.equal(f.window.taken.length, 1); assert.equal(f.window.taken instanceof f.window.Array, true);
    assert.equal(f.window.taken[0].attributeName, 'first');
    await checkpoint(); assert.deepEqual(Array.from(f.window.order), ['mutation', 'promise']);
    assert.equal(f.window.observer.takeRecords().length, 0);
  } finally { f.close(); }
});

test('disconnect discards pending records, allows re-observation, and keeps already queued ordering', async () => {
  const f = fixture();
  try {
    f.window.eval(`globalThis.order=[];globalThis.names=[];const target=document.getElementById('child');
      const observer=new MutationObserver(records=>{order.push('mutation');names.push(...records.map(r=>r.attributeName))});
      observer.observe(target,{attributes:true});target.setAttribute('discarded','x');observer.disconnect();
      target.setAttribute('ignored','x');Promise.resolve().then(()=>order.push('promise'));
      observer.observe(target,{attributes:true});target.setAttribute('kept','x');`);
    await checkpoint(); assert.deepEqual(Array.from(f.window.names), ['kept']);
    assert.deepEqual(Array.from(f.window.order), ['mutation', 'promise']);
  } finally { f.close(); }
});

test('native validation, brands, multiple targets and re-observation remain functional', async () => {
  const f = fixture();
  try {
    assert.throws(() => f.window.MutationObserver(() => {}), error => error instanceof f.window.TypeError);
    assert.throws(() => new f.window.MutationObserver(), error => error instanceof f.window.TypeError);
    assert.throws(() => new f.window.MutationObserver(1), error => error instanceof f.window.TypeError);
    const records = [], observer = new f.window.MutationObserver(items => records.push(...items));
    const root = f.document.querySelector('#root'), child = f.document.querySelector('#child');
    for (const options of [{}, { attributes: false, attributeOldValue: true }, { characterData: false, characterDataOldValue: true }]) {
      assert.throws(() => observer.observe(child, options), error => error instanceof f.window.TypeError);
    }
    assert.throws(() => observer.observe({}), error => error instanceof f.window.TypeError);
    assert.throws(() => f.window.MutationObserver.prototype.takeRecords.call({}), error => error instanceof f.window.TypeError);
    observer.observe(root, { attributes: true, subtree: true }); observer.observe(child, { attributes: true, attributeOldValue: true });
    child.id = 'changed'; await checkpoint(); assert.equal(records.length, 1); assert.equal(records[0].oldValue, 'child');
    assert.equal(observer instanceof f.window.MutationObserver, true); assert.equal(observer.constructor, f.window.MutationObserver);
    assert.equal(Object.prototype.toString.call(observer), '[object MutationObserver]');
  } finally { f.close(); }
});

test('removed descendants retain native absence of transient attribute and character-data records', async () => {
  const f = fixture();
  try {
    const root = f.document.querySelector('#root'), child = f.document.querySelector('#child'), records = [];
    const observer = new f.window.MutationObserver(items => records.push(...items));
    observer.observe(root, { childList: true, attributes: true, characterData: true, subtree: true });
    child.remove(); child.title = 'removed'; child.firstChild.data = 'removed';
    await checkpoint(); assert.equal(records.length, 1); assert.equal(records[0].type, 'childList');
    child.title = 'later'; await checkpoint(); assert.equal(records.length, 1);
  } finally { f.close(); }
});

test('callback failures use trusted global reporting and do not prevent other deliveries', async () => {
  const f = fixture(undefined, { errors: true });
  try {
    const seen = []; f.window.addEventListener('error', event => { seen.push(event); event.preventDefault(); });
    const target = f.document.querySelector('#child'), calls = [];
    const first = new f.window.MutationObserver(() => { throw new f.window.Error('observer failure'); });
    const second = new f.window.MutationObserver(() => calls.push('second'));
    first.observe(target, { attributes: true }); second.observe(target, { attributes: true }); target.title = 'trigger';
    await checkpoint(); assert.deepEqual(calls, ['second']); assert.equal(seen.length, 1); assert.equal(seen[0].isTrusted, true);
    assert.equal(seen[0].error instanceof f.window.Error, true); assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});

test('abort, close and explicit disposal drop queued records and release Page listeners', async () => {
  for (const action of ['abort', 'close', 'dispose']) {
    const f = fixture();
    try {
      let count = 0; const target = f.document.querySelector('#child');
      const observer = new f.window.MutationObserver(() => count++);
      observer.observe(target, { attributes: true }); target.title = 'queued';
      if (action === 'abort') f.page.documentAbort.abort();
      else if (action === 'close') f.window.close();
      else f.controller.dispose();
      await checkpoint(); assert.equal(count, 0, action); assert.equal(observer.takeRecords().length, 0, action);
      target.title = 'after'; await checkpoint(); assert.equal(count, 0, action);
      assert.equal(f.page.listenerCount('close'), 0, action);
    } finally { f.close(); }
  }
});

test('unregistered realms retain jsdom behavior and borrowed methods operate on public queues', async () => {
  const f = fixture(), other = fixture(undefined, { native: true });
  try {
    const observer = new f.window.MutationObserver(() => {}), target = f.document.querySelector('#child');
    other.window.MutationObserver.prototype.observe.call(observer, target, { attributes: true }); target.title = 'borrowed';
    const records = other.window.MutationObserver.prototype.takeRecords.call(observer);
    assert.equal(records.length, 1); assert.equal(records instanceof f.window.Array, true);
    let count = 0; const native = new other.window.MutationObserver(() => count++);
    native.observe(other.document.body, { attributes: true }); other.document.body.title = 'native';
    await checkpoint(); assert.equal(count, 1);
  } finally { f.close(); other.close(); }
});

test('dynamic inline scripts preserve synchronous execution followed by Promise then interested mutation delivery', async () => {
  const f = fixture(`<head></head><script>
    globalThis.order=[];const parent=document.createElement('div');document.head.append(parent);
    new MutationObserver(()=>order.push('mutation')).observe(parent,{childList:true});
    Promise.resolve().then(()=>order.push('promise'));setTimeout(()=>order.push('timer'),0);
    for(let i=0;i<2;i++){const script=document.createElement('script');script.textContent='order.push("inline-'+i+'")';parent.append(script);order.push('after-'+i);}
  </script>`, { classic: true });
  try {
    assert.deepEqual(Array.from(f.window.order), ['inline-0', 'after-0', 'inline-1', 'after-1']);
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.deepEqual(Array.from(f.window.order), ['inline-0', 'after-0', 'inline-1', 'after-1', 'promise', 'mutation', 'timer']);
    assert.equal(f.errors.length, 0);
  } finally { f.close(); }
});
