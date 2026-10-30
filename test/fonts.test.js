import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installFonts } from '../src/fonts.js';

function fixture(t, html = '') {
  const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse: window => installFonts(window) });
  t.after(() => dom.window.close()); return dom.window;
}

test('font faces expose measured fixed metadata without fetching or decoding their source', async t => {
  const w = fixture(t); let descriptorRead = false;
  const face = new w.FontFace('Test', 'url(http://127.0.0.1:9/missing.woff)', { get style() { descriptorRead = true; throw new Error('read'); } });
  assert.equal(face.family, 'Test'); assert.equal(face.status, 'loaded'); assert.equal(descriptorRead, false);
  assert.deepEqual(Object.fromEntries(['style', 'weight', 'stretch', 'unicodeRange', 'variant', 'featureSettings', 'display'].map(key => [key, face[key]])), {
    style: 'normal', weight: 'normal', stretch: 'normal', unicodeRange: 'U+0-10FFFF', variant: 'normal', featureSettings: 'normal', display: 'auto',
  });
  assert.equal(Object.prototype.toString.call(face), '[object FontFace]');
  assert.equal(Reflect.set(face, 'family', 'Other'), false); assert.equal(face.family, 'Test');
  assert.equal(new w.FontFace('Invalid', 'invalid CSS').status, 'loaded');
  assert.equal(new w.FontFace('Binary', new w.Uint8Array([1, 2]).buffer).status, 'loaded');
  assert.equal(face.variationSettings, undefined);
});

test('face loaded and load return fresh page-realm promises resolving undefined', async t => {
  const w = fixture(t), face = new w.FontFace('F', 'invalid');
  assert.ok(face.loaded instanceof w.Promise); assert.ok(face.load() instanceof w.Promise);
  assert.notEqual(face.loaded, face.loaded); assert.notEqual(face.load(), face.loaded);
  assert.equal(await face.loaded, undefined); assert.equal(await face.load(), undefined);
  assert.equal(face.status, 'loaded');
});

test('document fonts is stable per document and ready resolves without outstanding font work', async t => {
  const w = fixture(t), fonts = w.document.fonts;
  assert.equal(fonts, w.document.fonts); assert.ok(fonts instanceof w.FontFaceSet); assert.ok(fonts instanceof w.EventTarget);
  assert.equal(fonts.status, 'loaded'); assert.equal(fonts.size, 0);
  assert.ok(fonts.ready instanceof w.Promise); assert.notEqual(fonts.ready, fonts.ready); assert.equal(await fonts.ready, undefined);
  assert.equal(Object.prototype.toString.call(fonts), '[object FontFaceSet]');
  const other = w.document.implementation.createHTMLDocument('other');
  assert.notEqual(other.fonts, fonts); assert.equal(other.fonts, other.fonts);
});

test('font-set load emits synchronous trusted plain loading events then resolves undefined', async t => {
  const w = fixture(t), fonts = w.document.fonts, order = [];
  for (const type of ['loading', 'loadingdone', 'loadingerror']) fonts.addEventListener(type, event => order.push({
    type: event.type, status: fonts.status, trusted: event.isTrusted, constructor: event.constructor.name, target: event.target === fonts,
    fontfaces: event.fontfaces,
  }));
  const promise = fonts.load('italic bold 16px MissingFont');
  order.push('returned'); assert.ok(promise instanceof w.Promise); assert.equal(await promise, undefined);
  assert.deepEqual(order, [
    { type: 'loading', status: 'loaded', trusted: true, constructor: 'Event', target: true, fontfaces: undefined },
    { type: 'loadingdone', status: 'loaded', trusted: true, constructor: 'Event', target: true, fontfaces: undefined }, 'returned',
  ]);
});

test('add matches metadata-only native membership and unsupported set methods remain absent', t => {
  const w = fixture(t), fonts = w.document.fonts, face = new w.FontFace('F', 'invalid');
  assert.equal(fonts.add(face), fonts); assert.equal(fonts.add(face), fonts); assert.equal(fonts.size, 0);
  for (const key of ['has', 'delete', 'clear', 'forEach', 'values', 'entries', 'onloading', 'onloadingdone', 'onloadingerror']) assert.equal(fonts[key], undefined, key);
  assert.equal(fonts[Symbol.iterator], undefined); assert.equal(fonts.check('not a valid font'), true);
  assert.equal(fonts.check(Symbol()), true);
  assert.throws(() => new w.FontFaceSet([]), error => error instanceof w.TypeError && /Illegal Constructor/.test(error.message));
});

test('arguments and receivers are checked while ignored descriptors and check values are not coerced', t => {
  const w = fixture(t), fonts = w.document.fonts;
  assert.throws(() => new w.FontFace('F'), error => error instanceof w.TypeError);
  assert.throws(() => new w.FontFace('F', { toString() { throw new Error('source read'); } }), /source read/);
  assert.equal(new w.FontFace(12, null).family, '12');
  assert.throws(() => fonts.add({}), error => error instanceof w.TypeError);
  assert.throws(() => fonts.add(), error => error instanceof w.TypeError);
  assert.throws(() => fonts.check(), /invalid argument/); assert.throws(() => fonts.load(), /invalid argument/);
  assert.equal(fonts.check({ toString() { throw new Error('must not coerce'); } }), true);
  assert.throws(() => w.FontFaceSet.prototype.check.call({}), /Illegal invocation/);
  assert.throws(() => w.FontFace.prototype.load.call({}), /Illegal invocation/);
  const getter = Object.getOwnPropertyDescriptor(w.FontFace.prototype, 'family').get;
  assert.throws(() => getter.call({}), /Illegal invocation/);
  assert.throws(() => Object.getOwnPropertyDescriptor(w.Document.prototype, 'fonts').get.call({}), error => error instanceof w.TypeError);
});

test('cross-realm face objects retain their brand while documents keep independent font sets', t => {
  const a = fixture(t), b = fixture(t), face = new a.FontFace('Foreign', 'invalid');
  assert.notEqual(a.document.fonts, b.document.fonts); assert.equal(b.document.fonts.add(face), b.document.fonts);
  assert.equal(Object.getOwnPropertyDescriptor(b.FontFace.prototype, 'family').get.call(face), 'Foreign');
  assert.equal(Object.getPrototypeOf(a.document.fonts.ready), a.Promise.prototype);
});

test('beforeParse installation supports parser scripts and repeated installation preserves identity', t => {
  const w = fixture(t, '<script>window.fontsAvailable = document.fonts.ready instanceof Promise;</script>');
  assert.equal(w.fontsAvailable, true); assert.equal(installFonts(w), installFonts(w));
  assert.equal(Object.getPrototypeOf(w.FontFace.prototype), w.Object.prototype);
});
