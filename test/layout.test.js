import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createLayout, installLayout } from '../src/layout.js';

const fixture = `<!doctype html><style>
  #sized {position:absolute;left:100px;top:150px;width:240px;height:80px;margin:20px;padding:5px;border:2px solid}
  #hidden {display:none} #nested {width:10px;height:12px}
</style><button id="sized">Sized</button><button id="plain">Plain</button>
<button id="hidden">Hidden</button><div id="container"><button id="nested">Nested</button></div>
<script>/* event capture occupies one text node in the native fixture */</script>`;
const evidence = JSON.parse(readFileSync(new URL('../docs/reference/geometry-extended-evidence.json', import.meta.url)));
const observed = JSON.parse(evidence.normalized_result.frames.map(frame => frame.data).join(''));
function setup(t) {
  const dom = new JSDOM(fixture);
  t.after(() => dom.window.close());
  const page = {}, layout = installLayout(page, dom.window);
  return { window: dom.window, document: dom.window.document, layout, page, element: id => dom.window.document.getElementById(id) };
}
const basic = rect => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, rect[key]]));

test('surrogate geometry matches captured native WebAPI, CDP quads and box regions', t => {
  const f = setup(t);
  for (const [selector, record] of Object.entries(observed.geometry)) {
    const node = f.document.querySelector(selector);
    assert.deepEqual(basic(node.getBoundingClientRect()), basic(record.web.bounding), selector);
    assert.deepEqual(Array.from(node.getClientRects(), basic), record.web.clientRects.map(basic));
    assert.deepEqual(f.layout.quads(node), record.quads.result.quads);
    assert.deepEqual(f.layout.boxModel(node), record.box.result.model);
    assert.equal(f.window.getComputedStyle(node).width, record.web.computedWidth);
    assert.equal(node.clientHeight, record.web.clientHeight);
  }
  assert.equal(f.page.layout, f.layout);
});

test('preorder changes and fractional dimensions match captured dynamic geometry', t => {
  const f = setup(t);
  const compare = label => {
    const tree = observed.mutations.find(value => value.label === label).tree;
    for (const record of tree.filter(value => value.rect)) {
      const node = record.id ? f.element(record.id) : f.document.querySelector(record.name);
      assert.deepEqual(basic(f.layout.rect(node)), record.rect, `${label}: ${record.id ?? record.name}`);
    }
  };
  compare('original preorder');
  const inserted = f.document.createElement('button'); inserted.id = 'inserted'; inserted.textContent = 'XYZ';
  f.document.body.prepend(inserted); compare('prepended button');
  f.document.body.insertBefore(f.document.createTextNode('   '), f.element('sized')); compare('whitespace before sized');
  Object.assign(f.element('plain').style, { width: '12.5px', height: '9.5px' }); compare('fractional explicit dimensions');
  assert.equal(f.layout.boxModel(f.element('plain')).width, 12);
  inserted.firstChild.data = 'A much longer button label than before'; compare('long control text with same node count');
  f.element('container').style.display = 'none'; compare('hidden ancestor');
});

test('hit testing matches captured centers and deepest-first element lists', t => {
  const f = setup(t);
  for (const hit of observed.hitTests) {
    const label = node => node.id || node.nodeName;
    assert.equal(f.document.elementFromPoint(hit.x, hit.y) && label(f.document.elementFromPoint(hit.x, hit.y)), hit.one ?? null);
    assert.deepEqual(f.document.elementsFromPoint(hit.x, hit.y).map(label), hit.all);
  }
  f.element('plain').style.pointerEvents = 'none';
  assert.equal(f.document.elementFromPoint(242.5, 47.5), f.document.body);
  f.element('plain').style.pointerEvents = '';
  f.element('plain').style.visibility = 'hidden';
  assert.equal(f.document.elementFromPoint(242.5, 47.5), f.document.body);
  assert.equal(f.layout.hitTest(Infinity, 0), null);
});

test('block boxes and intrinsic sibling advances are separate', t => {
  const f = setup(t);
  f.document.body.innerHTML = '<div id="text-div">text</div><span id="nested-span"><b>x</b></span><button id="wrapped-button"><b>x</b></button><div id="empty-div"></div><div id="inline-parent" style="display:inline"><b>x</b></div>';
  for (const record of observed.mutations.find(value => value.label === 'default element shapes').cases) {
    assert.equal(f.layout.rect(f.element(record.id)).width, record.rect.width, record.id);
  }
  assert.equal(f.layout.rect(f.element('nested-span')).x - f.layout.rect(f.element('text-div')).x, 5);
});

test('scrolling uses measured document extent, top alignment and viewport coordinates', t => {
  const f = setup(t);
  f.document.body.innerHTML = '';
  for (let index = 0; index < 250; index++) f.document.body.append(f.document.createElement('div'));
  const target = f.document.createElement('button'); target.textContent = 'target'; f.document.body.append(target);
  const absoluteY = f.layout.rect(target).y;
  const maxScroll = f.layout.documentSize.height - f.window.innerHeight;
  f.layout.scrollIntoView(target);
  assert.equal(f.window.scrollY, maxScroll);
  assert.equal(target.getBoundingClientRect().y, absoluteY - maxScroll);
  assert.equal(f.document.documentElement.scrollTop, 0);
  assert.equal(f.document.documentElement.clientHeight, 1080);
  assert.equal(f.document.documentElement.scrollHeight, f.layout.documentSize.height);
  for (let index = 0; index < 500; index++) f.document.body.append(f.document.createElement('div'));
  f.window.scrollTo(0, 0); target.scrollIntoView();
  assert.equal(f.window.scrollY, absoluteY);
  assert.equal(target.getBoundingClientRect().y, 0);
  assert.equal(f.layout.intersection(target).intersectionRatio, 1);
  f.window.scrollBy({ top: -10 }); assert.equal(f.window.scrollY, absoluteY - 10);
  f.window.scrollTo({ top: -100 }); assert.equal(f.window.scrollY, 0);
  f.window.scrollTo(9999, 1e9); assert.equal(f.window.scrollX, 0);
  assert.equal(f.window.scrollY, f.layout.documentSize.height - 1080);
});

test('viewport changes, stylesheet updates and replacement nodes invalidate geometry', t => {
  const f = setup(t);
  f.layout.setViewport({ width: 800, height: 600 });
  assert.equal(f.window.innerWidth, 800); assert.equal(f.document.documentElement.clientHeight, 600);
  assert.equal(f.layout.rect(f.element('container')).width, 800);
  f.document.querySelector('style').textContent += '#plain { width: 20px; }';
  assert.equal(f.layout.rect(f.element('plain')).width, 20);
  const old = f.element('plain'), clone = old.cloneNode(true); old.replaceWith(clone);
  assert.equal(f.layout.rects(old).length, 0); assert.equal(f.layout.rect(clone).width, 20);
  assert.throws(() => f.layout.setViewport({ width: -1 }), /positive finite/);
});

test('hidden and detached elements have no client rectangles and zero bounds', t => {
  const f = setup(t), hidden = f.element('hidden');
  assert.equal(Object.prototype.toString.call(hidden.getClientRects()), '[object DOMRectList]');
  assert.equal(hidden.getClientRects().item(0), null);
  assert.equal(hidden.getBoundingClientRect() instanceof f.window.DOMRect, true);
  const detached = f.document.createElement('div');
  assert.deepEqual(basic(f.layout.rect(detached)), { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(f.window.getComputedStyle(hidden).getPropertyValue('width'), 'auto');
  assert.equal(hidden.offsetWidth, 0);
});

test('standalone layout does not patch the supplied window', t => {
  const dom = new JSDOM('<button>test</button>'); t.after(() => dom.window.close());
  const original = dom.window.Element.prototype.getBoundingClientRect;
  const layout = createLayout(dom.window);
  assert.equal(layout.rect(dom.window.document.querySelector('button')).width, 5);
  assert.equal(dom.window.Element.prototype.getBoundingClientRect, original);
});

test('intrinsic parent heights, document scroll extents and horizontal scrolling match native sizing probes', t => {
  const records = JSON.parse(readFileSync(new URL('../docs/reference/geometry-sizing-observations.json', import.meta.url))).cases;
  for (const record of records) {
    const dom = new JSDOM(record.html); t.after(() => dom.window.close());
    installLayout({}, dom.window); dom.window.scrollTo(100, 100);
    const boxes = [...dom.window.document.querySelectorAll('*')].map(node => ({ tag: node.tagName,
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight }));
    assert.deepEqual(boxes, record.result.boxes);
    assert.equal(dom.window.scrollX, record.result.scrollX); assert.equal(dom.window.scrollY, record.result.scrollY);
  }
});

test('hit-test viewport checks round coordinates before checking the bounds', t => {
  const dom = new JSDOM('<!doctype html><div>One</div>'); t.after(() => dom.window.close());
  installLayout({}, dom.window);
  assert.equal(dom.window.document.elementFromPoint(-.4, 10), dom.window.document.documentElement);
  assert.equal(dom.window.document.elementFromPoint(-.6, 10), null);
  assert.equal(dom.window.document.elementFromPoint(1919.6, 10), null);
});
