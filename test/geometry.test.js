import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { installGeometry, GEOMETRY_SOURCE } from '../src/geometry.js';

function fixture(t) {
  const dom = new JSDOM('', { runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const rect = dom.window.DOMRect, readonlyRect = dom.window.DOMRectReadOnly;
  dom.window.structuredClone = structuredClone;
  const installed = installGeometry(dom.window);
  return { window: dom.window, installed, rect, readonlyRect };
}
const close = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);
function point(actual, expected) { ['x', 'y', 'z', 'w'].forEach((key, i) => close(actual[key], expected[i])); }

test('points have realm-local prototypes, mutable/read-only coordinates and dictionary defaults', t => {
  const { window: w } = fixture(t);
  const p = new w.DOMPoint(1, 2); assert.deepEqual({ ...p.toJSON() }, { x: 1, y: 2, z: 0, w: 1 });
  p.x = '5'; p.w = 0.5; assert.equal(p.x, 5); assert.equal(p.w, 0.5);
  assert.ok(p instanceof w.DOMPointReadOnly); assert.equal(Object.prototype.toString.call(p), '[object DOMPoint]');
  const readonly = w.DOMPointReadOnly.fromPoint({ x: 7 });
  assert.ok(!(readonly instanceof w.DOMPoint)); assert.equal(Reflect.set(readonly, 'x', 100), false); assert.equal(readonly.x, 7);
  assert.equal(Object.getPrototypeOf(p.toJSON()), w.Object.prototype);
  assert.throws(() => w.DOMPoint.fromPoint(3), error => error instanceof w.TypeError);
  assert.throws(() => new w.DOMPoint(1n), error => error instanceof w.TypeError);
});

test('existing jsdom DOMRect constructors are preserved and quads compute negative bounds', t => {
  const { window: w, rect, readonlyRect } = fixture(t);
  assert.equal(w.DOMRect, rect); assert.equal(w.DOMRectReadOnly, readonlyRect);
  const q = w.DOMQuad.fromRect({ x: 10, y: 20, width: -8, height: -5 });
  assert.deepEqual({ ...q.getBounds().toJSON() }, { x: 2, y: 15, width: 8, height: 5, top: 15, right: 10, bottom: 20, left: 2 });
  assert.ok(q.p1 instanceof w.DOMPoint); q.p1.x = -10; assert.equal(q.getBounds().left, -10);
  assert.equal(Reflect.set(q, 'p1', new w.DOMPoint()), false);
  const clone = w.DOMQuad.fromQuad(q); clone.p1.x = 30; assert.equal(q.p1.x, -10);
  assert.equal(Object.getPrototypeOf(q.toJSON().p1), w.Object.prototype);
});

test('matrix constructors distinguish 2D/3D sequences and preserve read-only inheritance', t => {
  const { window: w } = fixture(t);
  const identity = new w.DOMMatrix(); assert.equal(identity.isIdentity, true); assert.equal(identity.is2D, true);
  const m = new w.DOMMatrix([1, 2, 3, 4, 5, 6]); assert.deepEqual([m.a, m.b, m.c, m.d, m.e, m.f], [1, 2, 3, 4, 5, 6]);
  const matrix3d = new w.DOMMatrix(Array.from(identity.toFloat64Array())); assert.equal(matrix3d.is2D, false); assert.equal(matrix3d.isIdentity, true);
  assert.equal(new w.DOMMatrix(matrix3d).is2D, false);
  const readonly = w.DOMMatrixReadOnly.fromMatrix({ e: 5 });
  assert.ok(!(readonly instanceof w.DOMMatrix)); assert.ok(m instanceof w.DOMMatrixReadOnly);
  assert.equal(Reflect.set(readonly, 'a', 2), false); assert.equal(readonly.a, 1);
  assert.ok(readonly.translate() instanceof w.DOMMatrix);
  assert.ok(m.toFloat32Array() instanceof w.Float32Array);
});

test('matrix dictionaries validate aliases, 2D constraints and typed-array constructors', t => {
  const { window: w } = fixture(t);
  const m = w.DOMMatrix.fromMatrix({ a: 2, m11: 2, e: 4 }); assert.equal(m.m11, 2); assert.equal(m.m41, 4);
  assert.throws(() => w.DOMMatrix.fromMatrix({ a: 1, m11: 2 }), error => error instanceof w.TypeError);
  assert.throws(() => w.DOMMatrix.fromMatrix({ m43: 2, is2D: true }), error => error instanceof w.TypeError);
  assert.equal(w.DOMMatrix.fromMatrix({ is2D: false }).is2D, false);
  assert.equal(w.DOMMatrix.fromMatrix({ m43: 1 }).is2D, false);
  assert.throws(() => new w.DOMMatrix([1, 2, 3]), /6 or 16/);
  assert.throws(() => w.DOMMatrix.fromFloat32Array(new w.Float64Array(6)), error => error instanceof w.TypeError);
  assert.equal(w.DOMMatrix.fromFloat32Array(new w.Float32Array([1, 0, 0, 1, 3, 4])).f, 4);
});

test('matrix multiplication order, pre-multiplication and origin scaling use actual affine math', t => {
  const { window: w } = fixture(t);
  const m = new w.DOMMatrix().translate(10, 20).scale(2, 3);
  point(m.transformPoint({ x: 1, y: 2 }), [12, 26, 0, 1]);
  point(new w.DOMMatrix().scale(2).preMultiplySelf({ e: 10 }).transformPoint({ x: 1 }), [12, 0, 0, 1]);
  point(new w.DOMMatrix().scale(2, 3, 1, 4, 5).transformPoint({ x: 4, y: 5 }), [4, 5, 0, 1]);
  const source = new w.DOMMatrix().translate(2, 3), result = source.multiply({ a: 2 });
  assert.equal(source.a, 1); assert.equal(result.a, 2); assert.notEqual(source, result);
  assert.equal(source.translateSelf(1, 1), source);
});

test('3D transforms preserve homogeneous coordinates and invert a nonsingular 4x4 matrix', t => {
  const { window: w } = fixture(t);
  const m = new w.DOMMatrix().translate(3, -4, 5).rotate(20, 30, 40).scale(2, 3, 4);
  const original = new w.DOMPoint(2, -3, 4, 1), moved = original.matrixTransform(m);
  point(m.inverse().transformPoint(moved), [2, -3, 4, 1]); assert.equal(m.is2D, false);
  const perspective = new w.DOMMatrix('perspective(100px)');
  point(perspective.transformPoint({ x: 2, y: 3, z: 50 }), [2, 3, 50, 0.5]);
  const product = m.multiply(m.inverse()).toFloat64Array();
  product.forEach((value, index) => close(value, index % 5 === 0 ? 1 : 0));
});

test('axis rotations, vector rotations, skews and flips transform points rather than returning identity', t => {
  const { window: w } = fixture(t);
  point(new w.DOMMatrix().rotateAxisAngle(0, 1, 0, 90).transformPoint({ x: 1 }), [0, 0, -1, 1]);
  point(new w.DOMMatrix().rotateFromVector(0, 1).transformPoint({ x: 1 }), [0, 1, 0, 1]);
  point(new w.DOMMatrix().skewX(45).transformPoint({ y: 2 }), [2, 2, 0, 1]);
  point(new w.DOMMatrix().flipX().flipY().transformPoint({ x: 2, y: 3 }), [-2, -3, 0, 1]);
});

test('mutable 3D components make is2D sticky while unchanged zero components preserve it', t => {
  const { window: w } = fixture(t);
  for (const key of ['m13', 'm14', 'm23', 'm24', 'm31', 'm32', 'm34', 'm43']) {
    const m = new w.DOMMatrix(); m[key] = -0; assert.equal(m.is2D, true); m[key] = 5; m[key] = 0; assert.equal(m.is2D, false);
  }
  const m = new w.DOMMatrix(); m.m33 = 1; assert.equal(m.is2D, true); m.m33 = 2; assert.equal(m.is2D, false);
});

test('singular inverses are all NaN and non-finite CSS serialization fails explicitly', t => {
  const { window: w } = fixture(t), singular = new w.DOMMatrix([0, 0, 0, 0, 0, 0]);
  assert.equal(singular.invertSelf(), singular); assert.ok([...singular.toFloat64Array()].every(Number.isNaN)); assert.equal(singular.is2D, false);
  for (const value of [NaN, Infinity, -Infinity]) {
    const m = new w.DOMMatrix([1, 0, 0, 1, 0, value]); assert.throws(() => m.toString(), error => error.name === 'InvalidStateError');
  }
});

test('CSS parser composes supported transforms and rejects malformed or unresolved units', t => {
  const { window: w } = fixture(t);
  const m = new w.DOMMatrix('translate(10px, 20px) rotate(90deg) scale(2, 3)');
  point(m.transformPoint({ x: 1, y: 0 }), [10, 22, 0, 1]);
  assert.equal(new w.DOMMatrix('translateX(1in)').e, 96);
  assert.equal(new w.DOMMatrix('none').isIdentity, true); assert.equal(new w.DOMMatrix('').isIdentity, true);
  assert.equal(String(new w.DOMMatrix()), 'matrix(1, 0, 0, 1, 0, 0)');
  for (const source of ['garbage', 'translate(2em)', 'translate(10%)', 'rotate(20px)', 'matrix(1,2)', 'translate(1px,,2px)', 'perspective(0px)']) {
    assert.throws(() => new w.DOMMatrix(source), error => error.name === 'SyntaxError', source);
  }
  const existing = new w.DOMMatrix().translate(5); assert.throws(() => existing.setMatrixValue('bad'), /Invalid/); assert.equal(existing.e, 5);
});

test('geometry structured clone preserves subtypes, cycles, Map entries and buffer transfer', t => {
  const { window: w } = fixture(t), p = new w.DOMPoint(1, 2), ro = new w.DOMPointReadOnly(3, 4);
  const value = { p, ro, matrix: new w.DOMMatrixReadOnly([1, 0, 0, 1, 5, 6]), quad: w.DOMQuad.fromRect({ width: 5 }),
    map: new w.Map([[p, ro]]), bytes: new w.Uint8Array([8, 9]) };
  value.self = value; const clone = w.structuredClone(value, { transfer: [value.bytes.buffer] });
  assert.equal(clone.self, clone); assert.equal(value.bytes.byteLength, 0); assert.equal(clone.bytes instanceof w.Uint8Array, true);
  assert.ok(clone.p instanceof w.DOMPoint); assert.ok(clone.ro instanceof w.DOMPointReadOnly); assert.ok(!(clone.ro instanceof w.DOMPoint));
  assert.equal(clone.map.get(clone.p), clone.ro); assert.ok(clone.matrix instanceof w.DOMMatrixReadOnly); assert.ok(!(clone.matrix instanceof w.DOMMatrix));
  clone.p.x = 100; assert.equal(p.x, 1); assert.equal(clone.quad.getBounds().width, 5);
  assert.equal(Object.getPrototypeOf(clone), w.Object.prototype);
});

test('geometry structured clone preserves Error causes and treats prototype-named array properties as data', t => {
  const { window: w } = fixture(t), p = new w.DOMPoint(4, 5);
  const input = new w.RangeError('geometry cause', { cause: p });
  const copy = w.structuredClone(input); assert.ok(copy instanceof w.RangeError); assert.ok(copy.cause instanceof w.DOMPoint);
  assert.equal(copy.cause.x, 4);
  const array = new w.Array(3); Object.defineProperty(array, '__proto__', { value: p, enumerable: true });
  const result = w.structuredClone(array);
  assert.equal(Object.getPrototypeOf(result), w.Array.prototype); assert.ok(result.__proto__ instanceof w.DOMPoint);
  assert.equal(0 in result, false); assert.equal(result.length, 3);
});

test('geometry source executes directly in an isolated worker VM with real fallback rectangles', () => {
  const context = vm.createContext({ structuredClone, DOMException });
  vm.runInContext(GEOMETRY_SOURCE, context);
  assert.equal(vm.runInContext(`(() => { const rect = new DOMRect(10, 20, -5, -7);
    rect.width = -8; const readonly = DOMRectReadOnly.fromRect({ x: 1 });
    return rect.left === 2 && rect.top === 13 && rect instanceof DOMRectReadOnly && readonly.constructor.name === 'DOMRectReadOnly' &&
      Object.getPrototypeOf(new DOMPoint().toJSON()) === Object.prototype && new DOMMatrix().toFloat32Array() instanceof Float32Array &&
      typeof process === 'undefined'; })()`, context), true);
  assert.equal(vm.runInContext(`(() => { try { DOMMatrix.fromMatrix({a:1,m11:2}); } catch (error) { return error instanceof TypeError; } })()`, context), true);
  assert.equal(vm.runInContext(`structuredClone(new DOMPoint(5,6)) instanceof DOMPoint`, context), true);
});

test('geometry installation is idempotent and methods enforce their brands', t => {
  const { window: w, installed } = fixture(t); assert.equal(installGeometry(w), installed);
  assert.throws(() => w.DOMPoint.prototype.toJSON.call({}), error => error instanceof w.TypeError);
  assert.throws(() => w.DOMMatrix.prototype.toJSON.call({}), error => error instanceof w.TypeError);
  assert.throws(() => w.DOMQuad.prototype.getBounds.call({}), error => error instanceof w.TypeError);
});
