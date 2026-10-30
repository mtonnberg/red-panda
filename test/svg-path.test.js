import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath, geometryFor, metricsFor, parsePoints } from '../src/svg-path.js';
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
const metrics = source => metricsFor(parsePath(source));

test('relative, implicit, close and multiple SVG subpaths produce genuine independent distances', () => {
  const path = metrics('M0 0 l3 4 h3 v-4 z M20 20 l0 10');
  near(path.length, 28); assert.deepEqual(path.pointAt(2.5), { x: 1.5, y: 2 }); assert.deepEqual(path.pointAt(100), { x: 20, y: 30 });
  assert.deepEqual(metrics('M10 10 L20 20 30').bounds, { x: 10, y: 10, width: 10, height: 10 });
  assert.deepEqual(metrics('M0 0 10 10 20 0').bounds, { x: 0, y: 0, width: 20, height: 10 });
  assert.equal(metrics('invalid').length, 0); assert.deepEqual(metrics('invalid').pointAt(10), { x: 0, y: 0 });
});

test('quadratic/cubic curve lengths follow measured adaptive subdivision with analytic extrema', () => {
  const quadratic = metrics('M0 0 Q10 20 20 0'); near(quadratic.length, 29.57866610568414); assert.deepEqual(quadratic.bounds, { x: 0, y: 0, width: 20, height: 10 });
  const cubic = metrics('M0 0 C0 10 10 10 10 0'); near(cubic.length, 19.999520629118503); near(cubic.pointAt(5).x, 1.0591648899705113);
  const overshoot = metrics('M0 0 C0 -50 0 150 0 100'); assert.equal(overshoot.length.toFixed(0), '132'); assert.equal(overshoot.bounds.y.toFixed(1), '-8.1'); near(overshoot.pointAt(4).y, -4);
  const smooth = metrics('M0 0 Q10 20 20 0 T40 0'); near(smooth.length, quadratic.length * 2);
});

test('elliptical arcs handle rotation, radius correction and endpoint clamping', () => {
  const arc = metrics('M10 0 A10 10 0 1 1 -10 0'); near(arc.length, 31.415138011443027); near(arc.pointAt(5).x, 8.775148431016659); assert.deepEqual(arc.pointAt(100), { x: -10, y: 0 });
  const rotated = metrics('M0 0 A80 20 45 1 1 100 100'); assert.ok(rotated.bounds.x < 0); assert.ok(rotated.bounds.width > 100); assert.ok(rotated.bounds.height >= 100);
  const corrected = metrics('M0 0 A1 1 0 0 1 10 0'); near(corrected.length, 15.7075690057215);
  near(metrics('M0 0 A0 10 0 0 1 3 4').length, 5);
});

test('shape perimeter calculations use actual attributes and point parsing retains scientific notation', () => {
  const shape = (tag, attrs) => metricsFor(geometryFor(tag, name => ['d', 'points'].includes(name) ? attrs[name] : attrs[name] ?? (['rx', 'ry'].includes(name) ? null : 0)));
  near(shape('circle', { cx:10, cy:20, r:5 }).length, 31.415138011442984);
  near(shape('ellipse', { cx:10, cy:20, rx:5, ry:10 }).length, 48.441025226080484);
  near(shape('rect', { width:30, height:40, rx:5, ry:10 }).length, 128.44102522608057);
  assert.equal(shape('polygon', { points:'0,0 3,0 3,4' }).length, 12); assert.equal(shape('polyline', { points:'0,0 3,0 3,4' }).length, 7);
  assert.deepEqual(parsePoints('1e1-2 .5,+4'), [{ x:10, y:-2 }, { x:.5, y:4 }]); assert.deepEqual(parsePoints('1 2 bad'), []);
});

test('adaptive curves follow all native scale controls at strict1e-9 precision', () => {
  const controls = [
    [.1, 2.957719276249771, 1.999232961352048],
    [1, 29.57866610568414, 19.999520629118503],
    [10, 295.78834404427397, 199.9997003943036],
    [100, 2957.884986000809, 1999.9992509858982],
  ];
  for (const [scale, quadratic, cubic] of controls) {
    const scaled = source => source.replace(/[-+]?(?:\d+\.?\d*|\.\d+)/g, number => String(Number(number) * scale));
    const q = metrics(scaled('M0 0 Q10 20 20 0')), c = metrics(scaled('M0 0 C0 10 10 10 10 0'));
    near(q.length, quadratic); near(c.length, cubic);
    near(q.pointAt(q.length / 2).x, 10 * scale); near(q.pointAt(q.length / 2).y, 10 * scale);
    near(c.pointAt(c.length / 2).x, 5 * scale); near(c.pointAt(c.length / 2).y, 7.5 * scale);
  }
});


test('relative Bezier tolerance reproduces native scale saturation and rigid-transform controls', () => {
  for (const [scale, expected] of [[20,591.5769766185527],[30,887.3654958002438],[40,1183.1539944003248],[100,2957.884986000809],[1000,29578.849860008104]]) {
    for (const [ox,oy,degrees] of [[0,0,0],[1000,1000,0],[0,0,45],[0,0,90]]) {
      const angle=degrees*Math.PI/180,at=(x,y)=>[ox+scale*(x*Math.cos(angle)-y*Math.sin(angle)),oy+scale*(x*Math.sin(angle)+y*Math.cos(angle))];
      const a=at(0,0),b=at(10,20),c=at(20,0);near(metrics(`M${a} Q${b} ${c}`).length,expected);
    }
  }
});
