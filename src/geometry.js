import { createGeometryBridge, registerGeometryRealm } from './geometry-platform.js';
const installedGeometry = new WeakMap();
// Keep this factory self-contained: its source also runs inside worker VM realms.
// CSS transforms support numeric matrices, absolute lengths, angles and the
// elementary transform functions below. Relative lengths, percentages and calc()
// reject with SyntaxError instead of returning an invented matrix. Geometry
// classes use real 4x4 math; descriptor/WebIDL edge cases are not exhaustive.
function geometryFactory(g, platform) {
  const BaseWeakMap=g.WeakMap??globalThis.WeakMap,apply=(g.Reflect??globalThis.Reflect).apply,weakGet=BaseWeakMap.prototype.get,weakSet=BaseWeakMap.prototype.set,weakHas=BaseWeakMap.prototype.has,weakDelete=BaseWeakMap.prototype.delete;
  class WeakMap extends BaseWeakMap { get(key){return apply(weakGet,this,[key]);} set(key,value){return apply(weakSet,this,[key,value]);} has(key){return apply(weakHas,this,[key]);} delete(key){return apply(weakDelete,this,[key]);} }
  const mutablePoint = {}, mutableRect = {}, mutableMatrix = {};
  const publish = (value, kind, read) => platform?.register(value, kind, read);
  const points = new WeakMap(), matrices = new WeakMap(), quads = new WeakMap(), rects = new WeakMap();
  const pointLinks = new WeakMap(), matrixLinks = new WeakMap();
  const number = value => +value;
  const dictionary = value => {
    if (value == null) return {};
    if (!['object', 'function'].includes(typeof value)) throw new TypeError('Expected a geometry dictionary');
    return value;
  };
  const component = (value, key, fallback) => { const member = value[key]; return member === undefined ? fallback : number(member); };
  const brand = (map, object) => { if (!map.has(object)) throw new TypeError('Invalid geometry receiver'); return map.get(object); };
  const Exception=g.DOMException,RealmError=g.Error;
  const error = (name, message) => typeof Exception === 'function' ? new Exception(message, name) : Object.assign(new RealmError(message), { name });
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const names = Array.from({ length: 16 }, (_, i) => `m${Math.floor(i / 4) + 1}${i % 4 + 1}`);
  const aliases = { a: 0, b: 1, c: 4, d: 5, e: 12, f: 13 };
  const extra = new Map([[2, 0], [3, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 1], [11, 0], [14, 0], [15, 1]]);
  const isFlat = values => [...extra].every(([index, expected]) => values[index] === expected);
  const pointValues = value => { value = dictionary(value); return ['x', 'y', 'z', 'w'].map((key, i) => component(value, key, i === 3 ? 1 : 0)); };
  const matrixValues = input => {
    const object = dictionary(input), values = identity();
    for (let i = 0; i < 16; i++) if (object[names[i]] !== undefined) values[i] = number(object[names[i]]);
    for (const [alias, index] of Object.entries(aliases)) {
      if (object[alias] === undefined) continue;
      const value = number(object[alias]);
      if (object[names[index]] !== undefined && value !== values[index] && !(Number.isNaN(value) && Number.isNaN(values[index]))) throw new TypeError(`Conflicting ${alias} and ${names[index]} matrix members`);
      values[index] = value;
    }
    const flat = isFlat(values);
    if (object.is2D !== undefined && Boolean(object.is2D) && !flat) throw new TypeError('A 2D matrix cannot contain 3D components');
    return { values, is2D: object.is2D === undefined ? flat : Boolean(object.is2D) };
  };
  const multiply = (a, b) => Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, column = Math.floor(i / 4);
    let sum = 0; for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
    return sum;
  });
  const copy = matrix => { const state = brand(matrices, matrix), result = new DOMMatrix(); matrices.set(result, { values: [...state.values], is2D: state.is2D }); return result; };
  const append = (matrix, values, is2D = true) => {
    const state = brand(matrices, matrix); state.values = multiply(state.values, values); state.is2D &&= is2D; return matrix;
  };

  class DOMPointReadOnly {
    constructor(x = 0, y = 0, z = 0, w = 1) { points.set(this, [number(x), number(y), number(z), number(w)]); if (arguments[4] !== mutablePoint) publish(this, 'DOMPointReadOnly', () => { const values=points.get(this); return [values[0],values[1],values[2],values[3]]; }); }
    static fromPoint(point = {}) { return new DOMPointReadOnly(...pointValues(point)); }
    matrixTransform(matrix = {}) { return DOMMatrixReadOnly.fromMatrix(matrix).transformPoint(this); }
    toJSON() { const [x, y, z, w] = brand(points, this); return { x, y, z, w }; }
  }
  class DOMPoint extends DOMPointReadOnly {
    constructor(x = 0, y = 0, z = 0, w = 1) { super(x,y,z,w,mutablePoint); publish(this, 'DOMPoint', () => { const values=points.get(this); return [values[0],values[1],values[2],values[3]]; }); }
    static fromPoint(point = {}) { return new DOMPoint(...pointValues(point)); }
  }
  for (const [index, key] of ['x', 'y', 'z', 'w'].entries()) {
    const get = function () { const values = brand(points, this), link = pointLinks.get(this); link?.beforeRead?.(); return values[index]; };
    Object.defineProperty(DOMPointReadOnly.prototype, key, { configurable: true, enumerable: true, get });
    Object.defineProperty(DOMPoint.prototype, key, { configurable: true, enumerable: true, get, set(value) { const values = brand(points, this), link = pointLinks.get(this); if (link?.readonly) throw error('NoModificationAllowedError', 'The object can not be modified'); value = number(value); if (link?.restricted && !Number.isFinite(value)) throw new TypeError(''); link?.beforeRead?.(); values[index] = value; link?.afterWrite?.(index, value); } });
  }

  class DOMRectReadOnlyFallback {
    constructor(x = 0, y = 0, width = 0, height = 0) { rects.set(this, [number(x), number(y), number(width), number(height)]); if (arguments[4] !== mutableRect) publish(this, 'DOMRectReadOnly', () => { const values=rects.get(this);return [values[0],values[1],values[2],values[3]]; }); }
    static fromRect(rect = {}) { rect = dictionary(rect); return new DOMRectReadOnlyFallback(...['x', 'y', 'width', 'height'].map(key => component(rect, key, 0))); }
    get top() { brand(rects, this); return Math.min(this.y, this.y + this.height); }
    get right() { brand(rects, this); return Math.max(this.x, this.x + this.width); }
    get bottom() { brand(rects, this); return Math.max(this.y, this.y + this.height); }
    get left() { brand(rects, this); return Math.min(this.x, this.x + this.width); }
    toJSON() { brand(rects, this); return { x: this.x, y: this.y, width: this.width, height: this.height, top: this.top, right: this.right, bottom: this.bottom, left: this.left }; }
  }
  class DOMRectFallback extends DOMRectReadOnlyFallback {
    constructor(x = 0, y = 0, width = 0, height = 0) { super(x,y,width,height,mutableRect); publish(this, 'DOMRect', () => { const values=rects.get(this);return [values[0],values[1],values[2],values[3]]; }); }
    static fromRect(rect = {}) { rect = dictionary(rect); return new DOMRectFallback(...['x', 'y', 'width', 'height'].map(key => component(rect, key, 0))); }
  }
  Object.defineProperty(DOMRectReadOnlyFallback, 'name', { value: 'DOMRectReadOnly' });
  Object.defineProperty(DOMRectFallback, 'name', { value: 'DOMRect' });
  for (const [index, key] of ['x', 'y', 'width', 'height'].entries()) {
    const get = function () { return brand(rects, this)[index]; };
    Object.defineProperty(DOMRectReadOnlyFallback.prototype, key, { configurable: true, enumerable: true, get });
    Object.defineProperty(DOMRectFallback.prototype, key, { configurable: true, enumerable: true, get, set(value) { brand(rects, this)[index] = number(value); } });
  }
  if (!g.DOMRectReadOnly) g.DOMRectReadOnly = DOMRectReadOnlyFallback;
  if (!g.DOMRect) g.DOMRect = DOMRectFallback;

  class DOMQuad {
    constructor(p1 = {}, p2 = {}, p3 = {}, p4 = {}) { quads.set(this, [p1, p2, p3, p4].map(value => DOMPoint.fromPoint(value))); }
    static fromRect(rect = {}) {
      rect = dictionary(rect); const x = component(rect, 'x', 0), y = component(rect, 'y', 0), width = component(rect, 'width', 0), height = component(rect, 'height', 0);
      return new DOMQuad({ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height });
    }
    static fromQuad(quad = {}) { quad = dictionary(quad); return new DOMQuad(quad.p1, quad.p2, quad.p3, quad.p4); }
    getBounds() {
      const values = brand(quads, this), xs = values.map(point => point.x), ys = values.map(point => point.y);
      const x = Math.min(...xs), y = Math.min(...ys); return new g.DOMRect(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
    }
    toJSON() { const [p1, p2, p3, p4] = brand(quads, this).map(point => point.toJSON()); return { p1, p2, p3, p4 }; }
  }
  for (let index = 0; index < 4; index++) Object.defineProperty(DOMQuad.prototype, `p${index + 1}`, { configurable: true, enumerable: true, get() { return brand(quads, this)[index]; } });

  class DOMMatrixReadOnly {
    constructor(init) {
      if (init === undefined) { matrices.set(this, { values: identity(), is2D: true }); if(arguments[1]!==mutableMatrix)publish(this,'DOMMatrixReadOnly'); return; }
      if (typeof init !== 'string' && init != null && typeof init[Symbol.iterator] === 'function') {
        const sequence = Array.from(init, number);
        if (![6, 16].includes(sequence.length)) throw new TypeError('A matrix sequence must contain 6 or 16 numbers');
        const values = sequence.length === 16 ? sequence : identity();
        if (sequence.length === 6) for (const [i, index] of [0, 1, 4, 5, 12, 13].entries()) values[index] = sequence[i];
        matrices.set(this, { values, is2D: sequence.length === 6 }); if(arguments[1]!==mutableMatrix)publish(this,'DOMMatrixReadOnly'); return;
      }
      matrices.set(this, parseTransform('' + init)); if(arguments[1]!==mutableMatrix)publish(this,'DOMMatrixReadOnly');
    }
    static fromMatrix(other = {}) { const result = new DOMMatrixReadOnly(); matrices.set(result, matrixValues(other)); return result; }
    static fromFloat32Array(array) { return floatMatrix(DOMMatrixReadOnly, array, 'Float32Array'); }
    static fromFloat64Array(array) { return floatMatrix(DOMMatrixReadOnly, array, 'Float64Array'); }
    get is2D() { return brand(matrices, this).is2D; }
    get isIdentity() { return brand(matrices, this).values.every((value, i) => value === (i % 5 === 0 ? 1 : 0)); }
    translate(tx = 0, ty = 0, tz = 0) { return copy(this).translateSelf(tx, ty, tz); }
    scale(scaleX = 1, scaleY, scaleZ = 1, originX = 0, originY = 0, originZ = 0) { return copy(this).scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ); }
    scale3d(scale = 1, originX = 0, originY = 0, originZ = 0) { return copy(this).scale3dSelf(scale, originX, originY, originZ); }
    scaleNonUniform(scaleX = 1, scaleY = 1) { return this.scale(scaleX, scaleY); }
    rotate(rotX = 0, rotY, rotZ) { return copy(this).rotateSelf(rotX, rotY, rotZ); }
    rotateFromVector(x = 0, y = 0) { return copy(this).rotateFromVectorSelf(x, y); }
    rotateAxisAngle(x = 0, y = 0, z = 0, angle = 0) { return copy(this).rotateAxisAngleSelf(x, y, z, angle); }
    skewX(angle = 0) { return copy(this).skewXSelf(angle); }
    skewY(angle = 0) { return copy(this).skewYSelf(angle); }
    multiply(other = {}) { return copy(this).multiplySelf(other); }
    flipX() { return this.scale(-1, 1); }
    flipY() { return this.scale(1, -1); }
    inverse() { return copy(this).invertSelf(); }
    transformPoint(point = {}) {
      const values = brand(matrices, this).values, input = pointValues(point);
      return new DOMPoint(...Array.from({ length: 4 }, (_, row) => input.reduce((sum, value, column) => sum + values[column * 4 + row] * value, 0)));
    }
    toFloat32Array() { return new Float32Array(brand(matrices, this).values); }
    toFloat64Array() { return new Float64Array(brand(matrices, this).values); }
    toString() {
      const { values, is2D } = brand(matrices, this);
      if (!values.every(Number.isFinite)) throw error('InvalidStateError', 'A non-finite matrix cannot be serialized as CSS');
      return is2D ? `matrix(${[0, 1, 4, 5, 12, 13].map(i => values[i]).join(', ')})` : `matrix3d(${values.join(', ')})`;
    }
    toJSON() {
      brand(matrices, this); const result = {};
      for (const key of [...Object.keys(aliases), ...names, 'is2D', 'isIdentity']) result[key] = this[key];
      return result;
    }
  }
  function floatMatrix(Constructor, array, type) {
    if (Object.prototype.toString.call(array) !== `[object ${type}]`) throw new TypeError(`Expected ${type}`);
    return new Constructor(array);
  }
  class DOMMatrix extends DOMMatrixReadOnly {
    constructor(init) { super(init,mutableMatrix); publish(this,'DOMMatrix'); }
    static fromMatrix(other = {}) { const result = new DOMMatrix(); matrices.set(result, matrixValues(other)); return result; }
    static fromFloat32Array(array) { return floatMatrix(DOMMatrix, array, 'Float32Array'); }
    static fromFloat64Array(array) { return floatMatrix(DOMMatrix, array, 'Float64Array'); }
    multiplySelf(other = {}) { const state = matrixValues(other); return append(this, state.values, state.is2D); }
    preMultiplySelf(other = {}) {
      const current = brand(matrices, this), otherState = matrixValues(other);
      current.values = multiply(otherState.values, current.values); current.is2D &&= otherState.is2D; return this;
    }
    translateSelf(tx = 0, ty = 0, tz = 0) {
      [tx, ty, tz] = [tx, ty, tz].map(number); const values = identity(); [values[12], values[13], values[14]] = [tx, ty, tz];
      return append(this, values, tz === 0);
    }
    scaleSelf(sx = 1, sy, sz = 1, ox = 0, oy = 0, oz = 0) {
      sx = number(sx); sy = sy === undefined ? sx : number(sy); [sz, ox, oy, oz] = [sz, ox, oy, oz].map(number);
      const values = identity(); [values[0], values[5], values[10]] = [sx, sy, sz];
      this.translateSelf(ox, oy, oz); append(this, values, sz === 1 && oz === 0); return this.translateSelf(-ox, -oy, -oz);
    }
    scale3dSelf(scale = 1, ox = 0, oy = 0, oz = 0) { return this.scaleSelf(scale, scale, scale, ox, oy, oz); }
    rotateSelf(rx = 0, ry, rz) {
      if (ry === undefined && rz === undefined) { rz = rx; rx = 0; ry = 0; }
      else { ry ??= 0; rz ??= 0; }
      [rx, ry, rz] = [rx, ry, rz].map(number);
      if (rz !== 0) this.rotateAxisAngleSelf(0, 0, 1, rz);
      if (ry !== 0) this.rotateAxisAngleSelf(0, 1, 0, ry);
      if (rx !== 0) this.rotateAxisAngleSelf(1, 0, 0, rx);
      return this;
    }
    rotateFromVectorSelf(x = 0, y = 0) { return this.rotateSelf(Math.atan2(number(y), number(x)) * 180 / Math.PI); }
    rotateAxisAngleSelf(x = 0, y = 0, z = 0, angle = 0) {
      brand(matrices, this); [x, y, z, angle] = [x, y, z, angle].map(number);
      const length = Math.hypot(x, y, z); if (length === 0) return this;
      if (x !== 0 || y !== 0) brand(matrices, this).is2D = false;
      if (angle === 0 && Number.isFinite(length)) return this;
      x /= length; y /= length; z /= length;
      const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180), t = 1 - c;
      return append(this, [t*x*x+c, t*x*y+s*z, t*x*z-s*y, 0,
        t*x*y-s*z, t*y*y+c, t*y*z+s*x, 0, t*x*z+s*y, t*y*z-s*x, t*z*z+c, 0, 0, 0, 0, 1], x === 0 && y === 0);
    }
    skewXSelf(angle = 0) { const values = identity(); values[4] = Math.tan(number(angle) * Math.PI / 180); return append(this, values); }
    skewYSelf(angle = 0) { const values = identity(); values[1] = Math.tan(number(angle) * Math.PI / 180); return append(this, values); }
    invertSelf() {
      const state = brand(matrices, this), rows = Array.from({ length: 4 }, (_, row) => [...Array.from({ length: 4 }, (_, column) => state.values[column * 4 + row]), ...identity().slice(row * 4, row * 4 + 4)]);
      let valid = state.values.every(Number.isFinite);
      for (let column = 0; column < 4 && valid; column++) {
        let pivot = column;
        for (let row = column + 1; row < 4; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
        if (rows[pivot][column] === 0) { valid = false; break; }
        [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
        const divisor = rows[column][column]; rows[column] = rows[column].map(value => value / divisor);
        for (let row = 0; row < 4; row++) if (row !== column) {
          const factor = rows[row][column]; rows[row] = rows[row].map((value, index) => value - factor * rows[column][index]);
        }
      }
      const inverse = Array.from({ length: 16 }, (_, i) => rows[i % 4][Math.floor(i / 4) + 4]);
      if (!valid || !inverse.every(Number.isFinite)) { state.values = Array(16).fill(NaN); state.is2D = false; }
      else state.values = inverse;
      return this;
    }
    setMatrixValue(value) { brand(matrices, this); if (!arguments.length) throw new TypeError('setMatrixValue requires a transform string'); const state = parseTransform('' + value); matrices.set(this, state); return this; }
  }
  for (const [key, index] of [...names.map((name, index) => [name, index]), ...Object.entries(aliases)]) {
    const get = function () { return brand(matrices, this).values[index]; };
    Object.defineProperty(DOMMatrixReadOnly.prototype, key, { configurable: true, enumerable: true, get });
    Object.defineProperty(DOMMatrix.prototype, key, { configurable: true, enumerable: true, get, set(value) {
      const state = brand(matrices, this); value = number(value); state.values[index] = value;
      if (extra.has(index) && value !== extra.get(index)) state.is2D = false;
    } });
  }

  function parseTransform(source) {
    source = source.trim(); if (!source || source.toLowerCase() === 'none') return { values: identity(), is2D: true };
    const result = new DOMMatrix(), token = /([a-zA-Z][a-zA-Z0-9]*)\s*\(([^()]*)\)/gy;
    const fail = () => { throw error('SyntaxError', 'Invalid or unsupported CSS transform'); };
    const scalar = (value, kind = 'number') => {
      const match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)([a-z%]*)$/i.exec(value);
      if (!match) return fail(); const value_ = Number(match[1]), unit = match[2].toLowerCase();
      if (!Number.isFinite(value_)) return fail();
      if (kind === 'number') return unit ? fail() : value_;
      if (!unit && value_ === 0) return 0;
      const units = kind === 'angle' ? { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 } : { px: 1, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, in: 96, pt: 96 / 72, pc: 16 };
      return Object.hasOwn(units, unit) ? value_ * units[unit] : fail();
    };
    let cursor = 0;
    while (cursor < source.length) {
      while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
      if (cursor >= source.length) break;
      token.lastIndex = cursor; const match = token.exec(source); if (!match) return fail(); cursor = token.lastIndex;
      const name = match[1].toLowerCase(), body = match[2].trim();
      if (!body || (body.includes(',') && body.split(',').some(value => !value.trim()))) return fail();
      const args = body.split(',').map(value => value.trim());
      if (args.some(value => /\s/.test(value))) return fail();
      const arity = (...counts) => { if (!counts.includes(args.length)) fail(); };
      const n = index => scalar(args[index]), l = index => scalar(args[index], 'length'), a = index => scalar(args[index], 'angle');
      if (name === 'matrix' || name === 'matrix3d') { arity(name === 'matrix' ? 6 : 16); result.multiplySelf(new DOMMatrix(args.map(value => scalar(value)))); }
      else if (name === 'translate') { arity(1, 2); result.translateSelf(l(0), args.length === 2 ? l(1) : 0); }
      else if (name === 'translate3d') { arity(3); result.translateSelf(l(0), l(1), l(2)); matrices.get(result).is2D = false; }
      else if (['translatex', 'translatey', 'translatez'].includes(name)) { arity(1); result.translateSelf(name === 'translatex' ? l(0) : 0, name === 'translatey' ? l(0) : 0, name === 'translatez' ? l(0) : 0); if (name === 'translatez') matrices.get(result).is2D = false; }
      else if (name === 'scale') { arity(1, 2); result.scaleSelf(n(0), args.length === 2 ? n(1) : undefined); }
      else if (name === 'scale3d') { arity(3); result.scaleSelf(n(0), n(1), n(2)); matrices.get(result).is2D = false; }
      else if (['scalex', 'scaley', 'scalez'].includes(name)) { arity(1); result.scaleSelf(name === 'scalex' ? n(0) : 1, name === 'scaley' ? n(0) : 1, name === 'scalez' ? n(0) : 1); if (name === 'scalez') matrices.get(result).is2D = false; }
      else if (['rotate', 'rotatez', 'rotatex', 'rotatey'].includes(name)) { arity(1); result.rotateAxisAngleSelf(name === 'rotatex' ? 1 : 0, name === 'rotatey' ? 1 : 0, ['rotate', 'rotatez'].includes(name) ? 1 : 0, a(0)); if (['rotatex', 'rotatey'].includes(name)) matrices.get(result).is2D = false; }
      else if (name === 'rotate3d') { arity(4); result.rotateAxisAngleSelf(n(0), n(1), n(2), a(3)); matrices.get(result).is2D = false; }
      else if (name === 'skewx' || name === 'skewy') { arity(1); result[name === 'skewx' ? 'skewXSelf' : 'skewYSelf'](a(0)); }
      else if (name === 'skew') { arity(1, 2); const values = identity(); values[4] = Math.tan(a(0) * Math.PI / 180); values[1] = args.length === 2 ? Math.tan(a(1) * Math.PI / 180) : 0; append(result, values); }
      else if (name === 'perspective') { arity(1); const distance = l(0); if (distance <= 0) fail(); const values = identity(); values[11] = -1 / distance; append(result, values, false); }
      else fail();
    }
    return { values: [...matrices.get(result).values], is2D: result.is2D };
  }

  for (const Constructor of [DOMPointReadOnly, DOMPoint, DOMQuad, DOMMatrixReadOnly, DOMMatrix, DOMRectReadOnlyFallback, DOMRectFallback]) {
    Object.defineProperty(Constructor.prototype, Symbol.toStringTag, { configurable: true, value: Constructor.name });
  }
  Object.assign(g, { DOMPointReadOnly, DOMPoint, DOMQuad, DOMMatrixReadOnly, DOMMatrix });

  const originalClone = g.structuredClone;
  if (typeof originalClone === 'function' && !platform?.nativeClone) {
    g.structuredClone = function structuredCloneGeometry(value, options) {
      const markers = new Map(), seen = new Map();
      const put = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
      const copyError = input => {
        const Constructor = [Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError].find(Type => Type.name === input.name) ?? Error;
        const result = new Constructor(input.message); if (typeof input.stack === 'string') result.stack = input.stack; return result;
      };
      function encode(input) {
        if (input === null || typeof input !== 'object') return input;
        if (seen.has(input)) return seen.get(input);
        let type, data;
        const registered = platform?.serialize(input);
        if (registered) { if (registered.interface === 'DOMMatrix' || registered.interface === 'DOMMatrixReadOnly') throw error('DataCloneError','The object can not be cloned'); type='platform-geometry';data=registered; }
        else if (points.has(input)) { type = input instanceof DOMPoint ? 'point' : 'point-ro'; data = [...points.get(input)]; }
        else if (matrices.has(input)) { throw error('DataCloneError','The object can not be cloned'); }
        else if (quads.has(input)) { type = 'quad'; data = input.toJSON(); }
        else if (!platform && input instanceof g.DOMRectReadOnly) { type = input instanceof g.DOMRect ? 'rect' : 'rect-ro'; data = [input.x, input.y, input.width, input.height]; }
        if (type) { const record = {}; seen.set(input, record); markers.set(record, { type, data }); return record; }
        let result; const inputKind=platform?.classify(input);
        if (Array.isArray(input)) { result = new Array(input.length); seen.set(input, result); for (const key of Object.keys(input)) put(result, key, encode(input[key])); }
        else if (inputKind ? inputKind==='Map' : Object.prototype.toString.call(input) === '[object Map]') { result = new Map(); seen.set(input, result); for (const [key, value] of input) result.set(encode(key), encode(value)); }
        else if (inputKind ? inputKind==='Set' : Object.prototype.toString.call(input) === '[object Set]') { result = new Set(); seen.set(input, result); for (const value of input) result.add(encode(value)); }
        else if (inputKind ? inputKind==='Error' : Object.prototype.toString.call(input) === '[object Error]') { result = copyError(input); seen.set(input, result); if (Object.hasOwn(input, 'cause')) Object.defineProperty(result, 'cause', { value: encode(input.cause), writable: true, configurable: true }); }
        else if (inputKind ? inputKind==='Object' : Object.prototype.toString.call(input) === '[object Object]') { result = {}; seen.set(input, result); for (const key of Object.keys(input)) Object.defineProperty(result, key, { value: encode(input[key]), enumerable: true, configurable: true, writable: true }); }
        else return input;
        return result;
      }
      const encoded = encode(value), payload = originalClone.call(g, { value: encoded, markers }, options);
      const copies = new Map();
      function decode(input) {
        if (input === null || typeof input !== 'object') return input;
        if (copies.has(input)) return copies.get(input);
        const marker = payload.markers.get(input);
        let result;
        if (marker) {
          const { type, data } = marker;
          if (type === 'platform-geometry') result = platform.deserialize(data);
          else if (type === 'point' || type === 'point-ro') result = new (type === 'point' ? DOMPoint : DOMPointReadOnly)(...data);
          else if (type === 'rect' || type === 'rect-ro') result = new (type === 'rect' ? g.DOMRect : g.DOMRectReadOnly)(...data);
          else if (type === 'quad') result = DOMQuad.fromQuad(data);
          else { result = type === 'matrix' ? new DOMMatrix() : new DOMMatrixReadOnly(); matrices.set(result, { values: Array.from(data.values), is2D: data.is2D }); }
        } else if (Array.isArray(input)) { result = new Array(input.length); copies.set(input, result); for (const key of Object.keys(input)) put(result, key, decode(input[key])); }
        else {
          const kind=platform?.classify(input),tag=kind?`[object ${kind}]`:Object.prototype.toString.call(input);
          if (tag === '[object Map]') { result = new Map(); copies.set(input, result); for (const [key, value] of input) result.set(decode(key), decode(value)); }
          else if (tag === '[object Set]') { result = new Set(); copies.set(input, result); for (const value of input) result.add(decode(value)); }
          else if (tag === '[object ArrayBuffer]') { result = new ArrayBuffer(input.byteLength); new Uint8Array(result).set(new Uint8Array(input)); }
          else if (ArrayBuffer.isView(input)) { const buffer = decode(input.buffer); result = tag === '[object DataView]' ? new DataView(buffer, input.byteOffset, input.byteLength) : new g[input.constructor.name](buffer, input.byteOffset, input.length); }
          else if (tag === '[object Date]') result = new Date(input.getTime());
          else if (tag === '[object RegExp]') result = new RegExp(input.source, input.flags);
          else if (tag === '[object Error]') { result = copyError(input); copies.set(input, result); if (Object.hasOwn(input, 'cause')) Object.defineProperty(result, 'cause', { value: decode(input.cause), writable: true, configurable: true }); }
          else if (tag === '[object Object]') { result = {}; copies.set(input, result); for (const key of Object.keys(input)) Object.defineProperty(result, key, { value: decode(input[key]), enumerable: true, writable: true, configurable: true }); }
          else result = input;
        }
        copies.set(input, result); return result;
      }
      return decode(payload.value);
    };
  }
  function accessMatrix(object, operation, write = false) {
    const state = brand(matrices, object), link = matrixLinks.get(object);
    if (!link || link.busy) return operation();
    if (write && link.readonly) throw error('NoModificationAllowedError', 'The object can not be modified');
    link.busy = true;
    try {
      const before = link.beforeRead?.(); if (before) { state.values = [...before]; state.is2D = true; }
      const result = operation();
      if (write) { const after = link.afterWrite?.([...brand(matrices, object).values]); if (after) { const updated = brand(matrices, object); updated.values = [...after]; updated.is2D = true; } }
      return result;
    } finally { link.busy = false; }
  }
  for (const Prototype of [DOMMatrixReadOnly.prototype, DOMMatrix.prototype]) for (const key of Reflect.ownKeys(Prototype)) {
    if (key === 'constructor') continue; const descriptor = Object.getOwnPropertyDescriptor(Prototype, key), next = { ...descriptor };
    if (descriptor.get) next.get = function () { return accessMatrix(this, () => descriptor.get.call(this)); };
    if (descriptor.set) next.set = function (value) { return accessMatrix(this, () => descriptor.set.call(this, value), true); };
    if (typeof descriptor.value === 'function') next.value = function (...args) { return accessMatrix(this, () => descriptor.value.apply(this, args), typeof key === 'string' && (key.endsWith('Self') || key === 'setMatrixValue')); };
    Object.defineProperty(Prototype, key, next);
  }
  const controller = { DOMPointReadOnly, DOMPoint, DOMQuad, DOMMatrixReadOnly, DOMMatrix, DOMRect: g.DOMRect, DOMRectReadOnly: g.DOMRectReadOnly,
    bindPoint(object, link) { brand(points, object); if (!(object instanceof DOMPoint)) throw new TypeError('invalid argument'); pointLinks.set(object, link); },
    pointValues(object) { const values = brand(points, object); pointLinks.get(object)?.beforeRead?.(); return [...values]; },
    updatePoint(object, values) { const state = brand(points, object); for (let i = 0; i < 4; i++) state[i] = values[i]; },
    isMutablePoint(object) { return points.has(object) && object instanceof DOMPoint; },
    bindMatrix(object, link) { brand(matrices, object); if (!(object instanceof DOMMatrix)) throw new TypeError('invalid argument'); matrixLinks.set(object, link); },
  };
  return controller;
}

export const GEOMETRY_SOURCE = `(${geometryFactory.toString()})(globalThis)`;

export function installGeometry(realm) {
  if (typeof realm?.eval !== 'function') throw new TypeError('Geometry installation requires a realm eval function; workers can evaluate GEOMETRY_SOURCE in their VM context');
  if (installedGeometry.has(realm)) return installedGeometry.get(realm);
  const controller = realm.eval(`(${geometryFactory.toString()})`)(realm, createGeometryBridge(realm));
  registerGeometryRealm(realm, controller); installedGeometry.set(realm, controller); return controller;
}

// A host-private kernel reuses the independent 4x4 implementation without
// consulting authored Window constructors or altering public realm globals.
export function createGeometryKernel() { return geometryFactory({ DOMException }); }
