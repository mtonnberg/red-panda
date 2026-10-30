import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installSVG } from '../src/svg.js';

const NS = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
function fixture(t) { const dom = new JSDOM('<body><svg width="200" height="100"><rect id="parsed"/><linearGradient id="gradient"/></svg></body>', { runScripts: 'outside-only', beforeParse(w) { installSVG({}, w); } }); t.after(() => dom.window.close()); return dom.window; }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);

test('typed SVG hierarchy belongs to actual parsed and newly-created nodes across clone and mutation', t => {
  const w = fixture(t), d = w.document, parsed = d.getElementById('parsed');
  assert.ok(parsed instanceof w.SVGRectElement); assert.ok(parsed instanceof w.SVGGeometryElement); assert.ok(parsed instanceof w.SVGGraphicsElement); assert.ok(parsed instanceof w.Element);
  assert.ok(parsed.cloneNode() instanceof w.SVGRectElement);
  for (const [name, Constructor, Parent] of [['linearGradient', w.SVGLinearGradientElement, w.SVGGradientElement], ['text', w.SVGTextElement, w.SVGTextPositioningElement], ['tspan', w.SVGTSpanElement, w.SVGTextContentElement], ['pattern', w.SVGPatternElement, w.SVGElement]]) {
    const element = d.createElementNS(NS, name); assert.ok(element instanceof Constructor); assert.ok(element instanceof Parent); assert.equal(element.localName, name); assert.throws(() => new Constructor(), e => e instanceof w.TypeError);
  }
  assert.equal(d.createElementNS(NS, 'RECT').constructor, w.SVGElement); assert.equal(typeof w.SVGMatrix, 'undefined'); assert.equal(typeof w.SVGUnitTypes, 'undefined');
  assert.equal(Object.getOwnPropertyDescriptor(w, 'SVGRectElement').enumerable, false);
});

test('animated href keeps SameObject identity and writes the real preferred backing attribute', t => {
  const w = fixture(t), d = w.document, use = d.createElementNS(NS, 'use');
  use.setAttributeNS(XLINK, 'xlink:href', '#old'); const href = use.href;
  assert.ok(href instanceof w.SVGAnimatedString); assert.equal(href, use.href); assert.equal(href.baseVal, '#old');
  href.baseVal = '#new'; assert.equal(use.getAttributeNS(XLINK, 'href'), '#new'); assert.equal(href.animVal, '#new');
  use.setAttribute('href', '#modern'); assert.equal(href.baseVal, '#modern'); href.baseVal = '#actual';
  assert.equal(use.getAttribute('href'), '#actual'); assert.equal(use.getAttributeNS(XLINK, 'href'), '#new');
  use.removeAttribute('href'); use.removeAttributeNS(XLINK, 'href'); use.setAttribute('xlink:href', '#literal');
  assert.equal(href.baseVal, '#literal'); href.baseVal = '#literal2'; assert.equal(use.getAttribute('xlink:href'), '#literal2');
  const rawGet = w.Element.prototype.getAttribute; use.getAttribute = () => 'authored'; use.setAttribute = () => {};
  assert.equal(href.baseVal, '#literal2'); href.baseVal = '#real-write'; assert.equal(rawGet.call(use, 'xlink:href'), '#real-write');
});

test('live SVG lengths convert actual units and enforce readonly animation values', async t => {
  const w = fixture(t), d = w.document, root = d.querySelector('svg'), rectangle = d.getElementById('parsed'), changes = [];
  new w.MutationObserver(records => changes.push(...records)).observe(rectangle, { attributes: true });
  rectangle.setAttribute('width', '10%'); const animated = rectangle.width, value = animated.baseVal;
  assert.equal(animated, rectangle.width); assert.equal(value, animated.baseVal); assert.equal(value.unitType, w.SVGLength.SVG_LENGTHTYPE_PERCENTAGE); assert.equal(value.value, 20);
  value.value = 25; assert.equal(rectangle.getAttribute('width'), '12.5%'); value.valueInSpecifiedUnits = 75; assert.equal(value.value, 150);
  value.valueAsString = '2cm'; near(value.value, 96 / 2.54 * 2); value.convertToSpecifiedUnits(w.SVGLength.SVG_LENGTHTYPE_PX); near(value.valueInSpecifiedUnits, 96 / 2.54 * 2);
  rectangle.setAttribute('width', '7px'); assert.equal(animated.animVal.value, 7);
  assert.throws(() => { animated.animVal.value = 8; }, e => e.name === 'NoModificationAllowedError');
  assert.throws(() => { value.valueAsString = 'invalid'; }, e => e.name === 'SyntaxError');
  const standalone = root.createSVGLength(); standalone.newValueSpecifiedUnits(8, 2); assert.equal(standalone.value, 192);
  await Promise.resolve(); assert.ok(changes.length >= 5); assert.ok(changes.every(record => record.target === rectangle));
});

test('resource enums and numbers are live attribute values with native defaults and single precision', t => {
  const w = fixture(t), d = w.document, gradient = d.getElementById('gradient'), stop = d.createElementNS(NS, 'stop');
  assert.equal(gradient.gradientUnits.baseVal, 2); gradient.gradientUnits.baseVal = 1; assert.equal(gradient.getAttribute('gradientUnits'), 'userSpaceOnUse');
  gradient.setAttribute('gradientUnits', 'objectBoundingBox'); assert.equal(gradient.gradientUnits.animVal, 2);
  assert.throws(() => { gradient.gradientUnits.baseVal = 17; }, e => e instanceof w.TypeError);
  assert.equal(gradient.x2.baseVal.valueAsString, '100%'); assert.equal(gradient.x2.baseVal.value, 200);
  stop.setAttribute('offset', '120%'); assert.equal(stop.offset.baseVal, Math.fround(1.2));
  stop.offset.baseVal = .3; assert.equal(stop.getAttribute('offset'), '0.3'); assert.equal(stop.offset.animVal, Math.fround(.3));
  Object.defineProperty(stop.offset, 'baseVal', { value: 99 }); assert.equal(stop.offset.animVal, Math.fround(.3));
  const mask = d.createElementNS(NS, 'mask'); assert.equal(mask.width.baseVal.valueAsString, '120%'); assert.equal(mask.maskUnits.baseVal, 2);
});

test('transform lists preserve real matrices, item ownership and actual attribute mutations', async t => {
  const w = fixture(t), root = w.document.querySelector('svg'), rectangle = w.document.getElementById('parsed'), changes = [];
  new w.MutationObserver(records => changes.push(...records)).observe(rectangle, { attributes: true });
  rectangle.setAttribute('transform', 'translate(2 3) scale(3)'); const list = rectangle.transform.baseVal;
  assert.equal(list, rectangle.transform.baseVal); const first = list.getItem(0), matrix = first.matrix;
  assert.ok(matrix instanceof w.DOMMatrix); assert.equal(first.type, w.SVGTransform.SVG_TRANSFORM_TRANSLATE); assert.equal(matrix.e, 2); matrix.e = 12;
  assert.equal(rectangle.getAttribute('transform'), 'matrix(1 0 0 1 12 3) scale(3 3)');
  const old = rectangle.getAttribute('transform'); matrix.toString(); assert.equal(rectangle.getAttribute('transform'), old);
  const consolidated = list.consolidate(); assert.equal(list.length, 1); assert.equal(consolidated.matrix.a, 3); assert.equal(consolidated.matrix.e, 12);
  const standalone = root.createSVGTransform(); standalone.setRotate(30, 4, 5); near(standalone.matrix.a, Math.cos(Math.PI / 6)); near(standalone.angle, 30);
  list.appendItem(standalone); const other = w.document.createElementNS(NS, 'rect'); other.transform.baseVal.appendItem(standalone);
  assert.equal(list.length, 1); assert.equal(other.transform.baseVal.getItem(0), standalone);
  rectangle.setAttribute('transform', 'translate(9)'); assert.notEqual(list.getItem(0), consolidated); assert.equal(list.getItem(0).matrix.e, 9);
  const animation = rectangle.transform.animVal; assert.equal(animation.getItem(0).matrix.e, 9); assert.doesNotThrow(() => animation.getItem(0).matrix.toString());
  assert.throws(() => { animation.getItem(0).matrix.e = 1; }, e => e.name === 'NoModificationAllowedError'); assert.throws(() => animation.clear(), e => e.name === 'NoModificationAllowedError');
  await Promise.resolve(); assert.ok(changes.length >= 4);
});
