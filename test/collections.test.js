import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildCollections } from '../native/build-collections.mjs';
import { installCollections, loadCollectionsBinding } from '../src/collections.js';

let directory, addon, binding;
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'red-panda-collections-'));
  addon = path.join(directory, 'collections.node');
  await buildCollections({ output: addon }); binding = loadCollectionsBinding(addon);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function fixture(t, html = '') {
  const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse: window => installCollections(window, { binding }) });
  t.after(() => dom.window.close()); return dom.window;
}

test('native collection supplies actual HTMLDDA semantics while retaining callability and identity', t => {
  const window = fixture(t, '<div id="first">First</div>');
  const result = window.eval(`(() => { const all = document.all; return [typeof all, !!all, all == null,
    all == undefined, all === undefined, all.constructor.name, all instanceof HTMLAllCollection,
    all(0) === document.documentElement, all('first') === document.getElementById('first')]; })()`);
  assert.deepEqual([...result], ['undefined', false, true, true, false, 'HTMLAllCollection', true, true, true]);
  assert.equal(Object.prototype.toString.call(window.document.all), '[object HTMLAllCollection]');
  assert.throws(() => new window.HTMLAllCollection(), /Illegal constructor/);
});

test('all indexes every element in document order and stays live across mutation', t => {
  const window = fixture(t, '<div id="first"></div><svg><rect id="svg"></rect></svg>');
  const { document } = window, all = document.all;
  assert.equal(all[0], document.documentElement); assert.equal(all[1], document.head);
  assert.deepEqual(Array.from(all), [...document.querySelectorAll('*')]);
  const length = all.length, extra = document.createElement('p'); document.body.append(extra);
  assert.equal(all.length, length + 1); assert.equal(all[length], extra);
  extra.remove(); assert.equal(all.length, length); assert.equal(all[length], undefined);
  assert.equal(all.item(length), null); assert.equal(all.item(-1), null); assert.equal(all(), null);
});

test('named lookup distinguishes IDs from eligible HTML name attributes', t => {
  const window = fixture(t, `<div id="a" name="alpha"></div><input name="field"><a name="anchor"></a>
    <span name="span"></span><svg><rect id="svg" name="svg-name"></rect></svg>`);
  const all = window.document.all;
  assert.equal(all.a, window.document.getElementById('a'));
  assert.equal(all('a'), all.namedItem('a')); assert.equal(all.field.tagName, 'INPUT'); assert.equal(all.anchor.tagName, 'A');
  assert.equal(all.namedItem('alpha'), null); assert.equal(all.alpha, undefined);
  assert.equal(all.namedItem('span'), null); assert.equal(all.namedItem('svg-name'), null);
  assert.equal(all.namedItem('svg'), window.document.getElementById('svg'));
});

test('duplicate named matches return a live HTMLCollection without counting a node twice', t => {
  const window = fixture(t, '<input id="same" name="same"><a name="same"></a>');
  const all = window.document.all, matches = all.namedItem('same');
  assert.equal(matches.constructor.name, 'HTMLCollection'); assert.equal(matches.length, 2);
  const extra = window.document.createElement('input'); extra.name = 'same'; window.document.body.append(extra);
  assert.equal(matches.length, 3); assert.equal(matches[2], extra);
  extra.name = 'different'; assert.equal(matches.length, 2);
});

test('named properties are present and unenumerable while indexes are enumerable', t => {
  const window = fixture(t, '<div id="a"></div><input name="field"><div name="ineligible"></div>');
  const all = window.document.all;
  assert.equal('a' in all, true); assert.equal(Object.hasOwn(all, 'a'), true);
  assert.equal('field' in all, true); assert.equal('ineligible' in all, false);
  assert.equal(Object.hasOwn(all, 'missing'), false);
  assert.equal(Object.getOwnPropertyDescriptor(all, 'a').enumerable, false);
  assert.equal(Object.getOwnPropertyDescriptor(all, '0').enumerable, true);
  assert.ok(Reflect.ownKeys(all).includes('a')); assert.ok(!Object.keys(all).includes('a'));
  assert.deepEqual(Object.keys(all), Array.from({ length: all.length }, (_, index) => String(index)));
});

test('prototype members win named visibility and methods enforce their receiver brand', t => {
  const window = fixture(t, '<div id="length"></div><div id="constructor"></div><div id="item"></div>');
  const all = window.document.all;
  assert.equal(typeof all.length, 'number'); assert.equal(all.constructor, window.HTMLAllCollection); assert.equal(typeof all.item, 'function');
  assert.equal(all.namedItem('length'), window.document.getElementById('length'));
  assert.throws(() => all.item.call({}, 0), /Invalid HTMLAllCollection receiver/);
  assert.throws(() => all.namedItem.call({}, 'x'), /Invalid HTMLAllCollection receiver/);
  assert.throws(() => all.namedItem(), /requires a name/);
  assert.throws(() => all.item(Symbol()), /Symbol/);
  assert.equal(typeof new window.Document().all, 'undefined');
});

test('collections are available to parser scripts and installation is idempotent', t => {
  const window = fixture(t, '<script>window.detected = [typeof document.all, document.all[0].tagName];</script>');
  assert.deepEqual([...window.detected], ['undefined', 'HTML']);
  assert.equal(installCollections(window), installCollections(window, { binding }));
});

test('RadioNodeList value setter refreshes membership before choosing a newly inserted radio', t => {
  const window = fixture(t, '<form><input type="radio" name="group" value="old"><input type="radio" name="group" value="other"></form>');
  const form = window.document.querySelector('form'), list = form.elements.namedItem('group');
  const radio = window.document.createElement('input'); radio.type = 'radio'; radio.name = 'group'; radio.value = 'new';
  form.append(radio); list.value = 'new';
  assert.equal(radio.checked, true); assert.equal(list.value, 'new');
  const first = window.document.createElement('input'); first.type = 'radio'; first.name = 'group';
  form.prepend(first); list.value = 'on'; assert.equal(first.checked, true); assert.equal(radio.checked, false);
});

test('binding loader rejects runtime mismatches and altered binaries before loading', async () => {
  const manifestFile = `${addon}.json`, original = await readFile(manifestFile, 'utf8');
  const manifest = JSON.parse(original);
  await writeFile(manifestFile, JSON.stringify({ ...manifest, node: 'v0.0.0' }));
  assert.throws(() => loadCollectionsBinding(addon), /does not match the running Node/);
  await writeFile(manifestFile, JSON.stringify({ ...manifest, binarySHA256: 'invalid' }));
  assert.throws(() => loadCollectionsBinding(addon), /binary digest/);
  await writeFile(manifestFile, original);
});
