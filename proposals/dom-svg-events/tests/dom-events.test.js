import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installDOMEvents } from '../src/dom-events.js';

function fixture(t) { const dom = new JSDOM('<body><main><button>target</button></main></body>', { runScripts: 'outside-only' }); installDOMEvents({}, dom.window); t.after(() => dom.window.close()); return dom.window; }
const pause = () => new Promise(resolve => setTimeout(resolve, 15));

test('DragEvent dispatches as a genuine cancelable MouseEvent with its actual retained store', t => {
  const w = fixture(t), target = w.document.querySelector('button'), store = new w.DataTransfer();
  store.setData('TEXT', 'dragged'); const event = new w.DragEvent('drop', { bubbles: true, cancelable: true, clientX: -1.9, clientY: 7.8, dataTransfer: store });
  assert.ok(event instanceof w.MouseEvent); assert.equal(event.clientX, -2); assert.equal(event.clientY, 7); assert.equal(event.dataTransfer, store); assert.equal(event.isTrusted, false);
  const seen = []; target.parentNode.addEventListener('drop', e => { seen.push(e.target); e.dataTransfer.setData('text/plain', 'handled'); e.preventDefault(); });
  assert.equal(target.dispatchEvent(event), false); assert.deepEqual(seen, [target]); assert.equal(store.getData('text'), 'handled');
  assert.throws(() => new w.DragEvent('x', { dataTransfer: {} }), e => e instanceof w.TypeError);
  assert.equal(Number.isNaN(new w.DragEvent('x', { clientX: NaN }).clientX), true);
});

test('DataTransfer retains live genuine FileList, independent items and native-observed duplicate formats', async t => {
  const w = fixture(t), store = new w.DataTransfer(), files = store.files, items = store.items;
  const file = new w.File(['bytes'], 'actual.txt', { type: 'text/plain' });
  const first = items.add('first', 'TEXT/PLAIN'), second = items.add('second', 'text/plain'), entry = items.add(file);
  assert.ok(files instanceof w.FileList); assert.equal(store.files, files); assert.equal(store.items, items);
  assert.deepEqual(Array.from(store.types), ['text/plain', 'text/plain', 'Files']); assert.equal(files[0], file); assert.equal(entry.getAsFile(), file);
  assert.deepEqual([...items], [first, second, entry]); assert.notEqual(store.types, store.types); assert.equal(Object.isFrozen(store.types), false);
  store.setData('TEXT', 'changed'); assert.equal(store.getData('text/plain'), 'changed');
  const delivered = []; first.getAsString(value => delivered.push(value)); store.clearData();
  await Promise.resolve(); assert.deepEqual(delivered, []); await pause(); assert.deepEqual(delivered, ['changed']);
  assert.equal(first.kind, 'string'); assert.equal(first.type, 'text/plain'); assert.equal(files.length, 1); assert.equal(items.length, 1);
  items.clear(); assert.equal(files.length, 0); assert.equal(entry.getAsFile(), file);
  assert.equal(store.dropEffect, 'none'); store.dropEffect = 'move'; store.dropEffect = 'invalid'; assert.equal(store.dropEffect, 'move');
  assert.throws(() => new w.DataTransferItem(), e => e instanceof w.TypeError); assert.throws(() => Object.getOwnPropertyDescriptor(w.DataTransfer.prototype, 'items').get.call({}), e => e instanceof w.TypeError);
});

test('legacy createEvent returns real uninitialized branded events with native default state', t => {
  const w = fixture(t), target = w.document.querySelector('button');
  for (const [name, Constructor] of [['DragEvent', w.DragEvent], ['dragevent', w.DragEvent], ['TouchEvent', w.TouchEvent], ['touchevent', w.TouchEvent], ['TextEvent', w.TextEvent], ['textevent', w.TextEvent]]) {
    const event = w.document.createEvent(name); assert.ok(event instanceof Constructor); assert.equal(event.type, ''); assert.equal(event.isTrusted, false);
    assert.throws(() => target.dispatchEvent(event), e => e.name === 'InvalidStateError');
    event.initEvent('initialized', true, true); assert.equal(target.dispatchEvent(event), true);
  }
  assert.equal(w.document.createEvent('DragEvent').dataTransfer, null); assert.equal(w.document.createEvent('TouchEvent').touches.length, 0);
  const text = w.document.createEvent('TextEvent'); assert.equal(text.data, '');
  text.initTextEvent('textInput', true, true, w, 'real input'); assert.equal(text.data, 'real input'); assert.equal(text.view, w);
  target.addEventListener('textInput', event => { event.initTextEvent('changed', false, false, null, 'ignored'); }); target.dispatchEvent(text);
  assert.equal(text.type, 'textInput'); assert.equal(text.data, 'real input');
  text.initTextEvent('x', false, false, null, null); assert.equal(text.data, 'undefined'); assert.throws(() => new w.TextEvent(), e => e instanceof w.TypeError);
});

test('Touch dictionaries preserve getter order, readonly coordinates and genuine TouchList identity', t => {
  const w = fixture(t), order = [], values = { identifier: 4294967297, target: w.document, force: .3, radiusX: .3, clientX: .3 };
  const touch = new w.Touch(new Proxy(values, { get(target, key) { order.push(key); return target[key]; } }));
  assert.deepEqual(order, ['clientX', 'clientY', 'force', 'identifier', 'pageX', 'pageY', 'radiusX', 'radiusY', 'rotationAngle', 'screenX', 'screenY', 'target']);
  assert.equal(touch.identifier, 1); assert.equal(touch.force, Math.fround(.3)); assert.equal(touch.clientX, .3); assert.equal(Reflect.set(touch, 'clientX', 9), false);
  const event = new w.TouchEvent('touchstart', { touches: [touch], changedTouches: [touch], ctrlKey: true });
  assert.equal(event.touches, event.touches); assert.equal(event.touches[0], touch); assert.equal(event.touches.item(0), touch); assert.equal(event.touches.item(1), null); assert.equal(event.touches.item(null), touch);
  assert.equal(event.touches[Symbol.iterator], undefined); assert.equal(Reflect.set(event.touches, '0', {}), false); assert.deepEqual(Object.keys(event.touches), ['0']); assert.equal(event.ctrlKey, true);
  for (const value of [-1, NaN, Infinity, undefined]) assert.throws(() => event.touches.item(value), e => e instanceof w.TypeError);
  assert.throws(() => new w.TouchEvent('x', { touches: [{}] }), e => e instanceof w.TypeError);
  assert.throws(() => new w.Touch({ identifier: 1, target: {}, clientX: 0 }), e => e instanceof w.TypeError);
  assert.throws(() => new w.Touch({ identifier: 1, target: w.document, radiusX: 1e40 }), e => e instanceof w.TypeError);
  for (const name of ['DragEvent', 'DataTransfer', 'TextEvent', 'Touch', 'TouchEvent']) assert.equal(Object.getOwnPropertyDescriptor(w, name).enumerable, false);
});
