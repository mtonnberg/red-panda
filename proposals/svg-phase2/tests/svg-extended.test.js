import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { installSVG } from '../src/svg.js';
import { installStyles } from '../src/styles.js';

const NS = 'http://www.w3.org/2000/svg';
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
function fixture(t, html = '<svg width="200" height="100"></svg>') {
  const page = Object.assign(new EventEmitter(), { closed: false, documentAbort: new AbortController() });
  const dom = new JSDOM('<!doctype html><body>' + html, { runScripts: 'outside-only', beforeParse(w) { installStyles(page, w); installSVG(page, w); } });
  t.after(() => { page.closed = true; page.documentAbort.abort(); dom.window.close(); }); return dom.window;
}

test('SVG-exposed geometry aliases are DOM geometry values and generic SVG nodes have the measured class', t => {
  const w = fixture(t), root = w.document.querySelector('svg');
  for (const name of ['SVGPoint', 'SVGRect', 'SVGMatrix']) assert.equal(typeof w[name], 'undefined');
  const p = root.createSVGPoint(); assert.ok(p instanceof w.DOMPoint); assert.deepEqual(Object.getOwnPropertyNames(p), []);
  assert.ok(root.createSVGRect() instanceof w.DOMRect); assert.ok(root.createSVGMatrix() instanceof w.DOMMatrix);
  assert.ok(w.document.createElementNS(NS, 'unknown') instanceof w.SVGGenericElement);
  assert.ok(w.document.createElementNS(NS, 'RECT') instanceof w.SVGGenericElement);
  p.x = .1; assert.equal(p.x, .1); assert.throws(() => { p.x = Infinity; }, e => e instanceof w.TypeError);
});

test('native SVG angle units convert actual values, retain units and reject invalid conversion atomically', t => {
  const w = fixture(t), angle = w.document.querySelector('svg').createSVGAngle();
  assert.ok(angle instanceof w.SVGAngle); assert.equal(angle.unitType, 1); assert.equal(angle.value, 0);
  angle.valueAsString = '1rad'; near(angle.value, 180 / Math.PI); angle.value = 180; near(angle.valueInSpecifiedUnits, Math.PI);
  angle.convertToSpecifiedUnits(w.SVGAngle.SVG_ANGLETYPE_GRAD); near(angle.valueInSpecifiedUnits, 200); near(angle.value, 180);
  angle.newValueSpecifiedUnits(2, 90); assert.equal(angle.valueAsString, '90deg');
  angle.valueAsString = '-2.5turn'; assert.equal(angle.unitType, 0); assert.equal(angle.value, -900);
  assert.throws(() => angle.convertToSpecifiedUnits(0), e => e.name === 'NotSupportedError'); assert.equal(angle.value, -900);
  assert.throws(() => { angle.valueAsString = 'calc(1deg + 2deg)'; }, e => e.name === 'SyntaxError'); assert.equal(angle.value, -900);
  assert.throws(() => { angle.value = NaN; }, e => e instanceof w.TypeError);
});

test('preserveAspectRatio and text-path reflection stay live with readonly animation-side values', t => {
  const w = fixture(t), root = w.document.querySelector('svg'), ratio = root.preserveAspectRatio;
  assert.equal(ratio, root.preserveAspectRatio); assert.equal(ratio.baseVal, ratio.baseVal); assert.notEqual(ratio.baseVal, ratio.animVal);
  assert.equal(ratio.baseVal.align, 6); assert.equal(ratio.baseVal.meetOrSlice, 1);
  root.setAttribute('preserveAspectRatio', 'xMinYMax slice'); assert.equal(ratio.baseVal.align, 8); assert.equal(ratio.animVal.meetOrSlice, 2);
  ratio.baseVal.align = 3; assert.equal(root.getAttribute('preserveAspectRatio'), 'xMidYMin slice');
  ratio.baseVal.meetOrSlice = 1; assert.equal(root.getAttribute('preserveAspectRatio'), 'xMidYMin meet');
  assert.throws(() => { ratio.animVal.align = 2; }, e => e.name === 'NoModificationAllowedError');
  assert.throws(() => { ratio.baseVal.align = 0; }, e => e instanceof w.TypeError);
  const path = w.document.createElementNS(NS, 'textPath'); root.append(path); path.startOffset.baseVal.valueAsString = '25%';
  assert.equal(path.getAttribute('startOffset'), '25%'); assert.equal(path.method.baseVal, 1); assert.equal(path.spacing.baseVal, 2);
  path.method.baseVal = 2; path.spacing.baseVal = 1; assert.equal(path.getAttribute('method'), 'stretch'); assert.equal(path.getAttribute('spacing'), 'auto');
});

test('point-list objects are real linked DOMPoints, copy already-owned points and keep stale objects detached', async t => {
  const w = fixture(t), root = w.document.querySelector('svg'), polygon = w.document.createElementNS(NS, 'polygon'), records = [];
  root.append(polygon); polygon.setAttribute('points', '1,2 3,4');
  new w.MutationObserver(values => records.push(...values)).observe(polygon, { attributes: true });
  const list = polygon.points, first = list.getItem(0); assert.equal(list, polygon.points); assert.equal(first, list.getItem(0)); assert.ok(first instanceof w.DOMPoint); assert.deepEqual(Object.getOwnPropertyNames(first), []);
  first.x = 9; assert.equal(polygon.getAttribute('points'), '9 2 3 4'); assert.equal(polygon.animatedPoints.getItem(0).x, 9);
  const p = root.createSVGPoint(); p.x = 7; p.y = 8; assert.equal(list.appendItem(p), p); const copied = list.appendItem(p); assert.notEqual(copied, p); p.x = 12;
  assert.equal(list.getItem(2).x, 12); assert.equal(copied.x, 7); assert.equal(list.removeItem(2), p);
  const anim = polygon.animatedPoints.getItem(0); polygon.setAttribute('points', '20 30'); assert.equal(list.length, 1); assert.equal(list.getItem(0).x, 20);
  first.x = 99; assert.equal(polygon.getAttribute('points'), '20 30'); assert.throws(() => { anim.y = 1; }, e => e.name === 'NoModificationAllowedError');
  assert.throws(() => polygon.animatedPoints.clear(), e => e.name === 'NoModificationAllowedError');
  assert.throws(() => list.appendItem({ x: 1, y: 2 }), e => e instanceof w.TypeError); assert.throws(() => list.appendItem(new w.DOMPointReadOnly()), e => e instanceof w.TypeError);
  await Promise.resolve(); assert.ok(records.length >= 5); assert.ok(records.every(record => record.target === polygon));
});

test('SVGPointList parses actual numeric prefixes, truncates unmatched coordinates and rejects malformed values', t => {
  const w = fixture(t), line = w.document.createElementNS(NS, 'polyline'), list = line.points;
  for (const [raw, length] of [['1 2 3', 1], ['1,2 3,4 5,', 2], ['1 2 bad 3 4', 0], ['1e1-2 .5,+4', 2]]) { line.setAttribute('points', raw); assert.equal(list.length, length); assert.equal(line.getAttribute('points'), raw); }
  assert.throws(() => list.getItem(99), e => e.name === 'IndexSizeError');
  const p = new w.DOMPoint(7, 8); assert.equal(list.initialize(p), p); assert.equal(line.getAttribute('points'), '7 8'); list.clear(); assert.equal(line.getAttribute('points'), '');
});

test('string lists retain logical items until external reparsing and use per-attribute delimiters', t => {
  const w = fixture(t), group = w.document.createElementNS(NS, 'g'), required = group.requiredExtensions, languages = group.systemLanguage;
  assert.ok(required instanceof w.SVGStringList); assert.equal(required, group.requiredExtensions); assert.equal(languages.length, 0); assert.equal(languages[Symbol.iterator], undefined);
  group.setAttribute('systemLanguage', 'en,, fr'); assert.equal(languages.length, 3); assert.equal(languages.getItem(1), '');
  languages.insertItemBefore('de', 1); assert.equal(group.getAttribute('systemLanguage'), 'en,de,,fr');
  required.appendItem('two words'); assert.equal(required.length, 1); assert.equal(required.getItem(0), 'two words'); assert.equal(group.getAttribute('requiredExtensions'), 'two words');
  group.setAttribute('requiredExtensions', 'two other words'); assert.equal(required.length, 3); assert.equal(required.removeItem(1), 'other');
  required.clear(); assert.equal(group.getAttribute('requiredExtensions'), null); languages.clear(); assert.equal(group.getAttribute('systemLanguage'), null);
  group.setAttribute('systemLanguage', ''); assert.equal(languages.length, 1); assert.equal(languages.getItem(0), '');
});

test('linked SVG matrices expose real affine alias writes and flatten actual 3D matrix operations', t => {
  const w = fixture(t), root = w.document.querySelector('svg'), group = w.document.createElementNS(NS, 'g'); root.append(group); group.setAttribute('transform', 'translate(2 3)');
  const transform = group.transform.baseVal.getItem(0), matrix = transform.matrix;
  assert.deepEqual(Object.getOwnPropertyNames(matrix), []); matrix.m41 = 7; matrix.m11 = 2; assert.equal(group.getAttribute('transform'), 'matrix(2 0 0 1 7 3)');
  matrix.m13 = 4; matrix.m33 = 5; assert.equal(matrix.m13, 0); assert.equal(matrix.m33, 1); assert.equal(matrix.is2D, true);
  assert.equal(matrix.setMatrixValue('translate3d(1px, 2px, 3px)'), matrix); assert.equal(matrix.e, 1); assert.equal(matrix.f, 2); assert.equal(matrix.m43, 0); assert.equal(matrix.is2D, true);
  const old = group.getAttribute('transform'); matrix.toJSON(); matrix.toString(); matrix.inverse(); assert.equal(group.getAttribute('transform'), old);
  const readonly = group.transform.animVal.getItem(0).matrix; assert.throws(() => readonly.translateSelf(1, 2), e => e.name === 'NoModificationAllowedError'); assert.throws(() => { readonly.m41 = 9; }, e => e.name === 'NoModificationAllowedError');
  const source = new w.DOMMatrix(); source.m13 = 8; source.e = 12; const copied = root.createSVGTransformFromMatrix(source); assert.equal(copied.matrix.m13, 0); assert.equal(copied.matrix.e, 12); source.e = 20; assert.equal(copied.matrix.e, 12);
});

test('SVG transformations copy items already held by another list and stale matrices cannot mutate replacements', t => {
  const w = fixture(t), root = w.document.querySelector('svg'), a = w.document.createElementNS(NS, 'g'), b = w.document.createElementNS(NS, 'g'); root.append(a, b);
  const source = root.createSVGTransform(); source.setTranslate(3, 4); assert.equal(a.transform.baseVal.appendItem(source), source);
  const copied = b.transform.baseVal.appendItem(source); assert.notEqual(copied, source); assert.equal(a.transform.baseVal.length, 1); source.matrix.e = 8; assert.equal(copied.matrix.e, 3);
  const stale = source.matrix; a.setAttribute('transform', 'scale(4)'); assert.equal(a.transform.baseVal.length, 1); stale.e = 13; assert.equal(stale.e, 13); assert.equal(a.transform.baseVal.getItem(0).matrix.e, 0);
});

test('DOMMatrix constructor applies CSS comma grammar while SVG transform attributes keep SVG separators', t => {
  const w = fixture(t), group = w.document.createElementNS(NS, 'g');
  for (const source of ['translate(3px 4px)', 'translate(3 4)', 'matrix(1 0 0 1 5 6)', 'translate(3px-4px)']) assert.throws(() => new w.DOMMatrix(source), e => e.name === 'SyntaxError');
  const matrix = new w.DOMMatrix('translate(3px, 4px) scale(2, 3)'); assert.equal(matrix.e, 3); assert.equal(matrix.d, 3);
  group.setAttribute('transform', 'translate(3 4) scale(2 3)'); assert.equal(group.transform.baseVal.length, 2); assert.equal(group.transform.baseVal.getItem(0).matrix.f, 4);
});

test('SVG lengths resolve actual viewport ancestry and presentation font values with CSS priority', t => {
  const w = fixture(t, '<style>svg .sheet { font-size: 25px; }</style><svg width="200" height="100" font-size="20"><svg width="50%" height="50%"><rect width="50%" x="2em"/></svg><text class="sheet" font-size="30">x</text></svg>');
  const root = w.document.querySelector('svg'), nested = root.querySelector('svg'), rectangle = nested.querySelector('rect');
  assert.equal(nested.width.baseVal.value, 100); assert.equal(rectangle.width.baseVal.value, 50); assert.equal(rectangle.x.baseVal.value, 40);
  nested.setAttribute('font-size', '30px'); assert.equal(rectangle.x.baseVal.value, 60); nested.style.fontSize = '10px'; assert.equal(rectangle.x.baseVal.value, 20);
  const text = root.querySelector('text'); assert.equal(text.getComputedTextLength(), 15); text.style.fontSize = '40px'; assert.equal(text.getComputedTextLength(), 24);
  const path = w.document.createElementNS(NS, 'path'); path.setAttribute('pathLength', '25%'); assert.equal(path.pathLength.baseVal, 0);
});

test('text metrics use actual collapsed UTF-16 text, inherited font size and measured fallback advances', t => {
  const w = fixture(t, '<svg font-size="20"><text id="run">Hello<tspan>🌍</tspan></text></svg>'), text = w.document.getElementById('run');
  assert.equal(text.getNumberOfChars(), 7); assert.equal(text.getComputedTextLength(), 80);
  assert.equal(text.getSubStringLength(5, 1), 20); assert.equal(text.getSubStringLength(6, 1), 20); assert.equal(text.getSubStringLength(4, 99), 32);
  assert.throws(() => text.getSubStringLength(7, 0), e => e.name === 'IndexSizeError');
  text.textContent = '  e\u0301  中  '; assert.equal(text.getNumberOfChars(), 4); assert.equal(text.getComputedTextLength(), 38.6);
  text.style.fontSize = '10px'; assert.equal(text.getComputedTextLength(), 19.3);
  text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); assert.equal(text.getNumberOfChars(), 9);
  text.style.display = 'none'; assert.equal(text.getBBox().width, 0); assert.ok(text.getComputedTextLength() > 0);
  text.remove(); assert.equal(text.getBBox().width, 0); assert.ok(text.getComputedTextLength() > 0);
});

test('geometry methods read actual authored paths, exclude transforms and enforce genuine receiver brands', t => {
  const w = fixture(t), root = w.document.querySelector('svg'), path = w.document.createElementNS(NS, 'path'); root.append(path);
  path.setAttribute('d', 'M0 0 L3 4 L6 4'); assert.equal(path.getTotalLength(), 8); assert.deepEqual({ ...path.getPointAtLength(2.5).toJSON() }, { x:1.5, y:2, z:0, w:1 });
  path.setAttribute('transform', 'scale(3)'); path.pathLength.baseVal = 100; assert.equal(path.getTotalLength(), 8);
  path.setAttribute('d', 'M0 0 C0 100 100 100 100 0'); assert.deepEqual({ ...path.getBBox().toJSON() }, { x:0, y:0, width:100, height:75, top:0, right:100, bottom:75, left:0 });
  assert.throws(() => path.getPointAtLength(Infinity), e => e instanceof w.TypeError); assert.throws(() => path.getPointAtLength(), e => e instanceof w.TypeError);
  const group = w.document.createElementNS(NS, 'g'); assert.throws(() => w.SVGGeometryElement.prototype.getTotalLength.call(group), e => e instanceof w.TypeError);
  assert.throws(() => w.SVGTextContentElement.prototype.getNumberOfChars.call(path), e => e instanceof w.TypeError);
  path.remove(); assert.equal(path.getCTM(), null); assert.ok(path.getTotalLength() > 0);
});

test('SVG-produced geometry uses captured native interface constructors after authored globals change', t => {
  const w = fixture(t), root = w.document.querySelector('svg'), line = w.document.createElementNS(NS, 'line'); root.append(line); line.setAttribute('x2', '5');
  const Point = w.DOMPoint, Rect = w.DOMRect, Matrix = w.DOMMatrix, source = new Matrix([2, 0, 0, 2, 3, 4]);
  w.DOMPoint = w.DOMRect = w.DOMMatrix = w.SVGSVGElement = function Authored() { throw new Error('authored constructor ran'); };
  Matrix.fromMatrix = () => { throw new Error('authored static ran'); };
  assert.ok(root.createSVGPoint() instanceof Point); assert.ok(root.createSVGRect() instanceof Rect); assert.ok(root.createSVGMatrix() instanceof Matrix);
  assert.ok(line.getPointAtLength(2) instanceof Point); assert.ok(line.getBBox() instanceof Rect); assert.ok(line.getCTM() instanceof Matrix);
  const transform = root.createSVGTransformFromMatrix(source); assert.equal(transform.matrix.e, 3); assert.equal(transform.matrix.a, 2);
});
