import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installSVG } from '../src/svg.js';
import { installDOMIDL } from '../src/dom-idl.js';

function fixture(t) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { runScripts: 'outside-only', beforeParse(w) { installSVG({}, w); installDOMIDL({}, w); } });
  t.after(() => dom.window.close()); return dom.window;
}

test('part is a genuine SameObject DOMTokenList backed by the actual attribute and records', async t => {
  const w = fixture(t), element = w.document.createElement('div'), records = [];
  new w.MutationObserver(values => records.push(...values)).observe(element, { attributes: true, attributeOldValue: true });
  const list = element.part;
  assert.ok(list instanceof w.DOMTokenList); assert.equal(list, element.part);
  element.setAttribute('part', 'header footer'); assert.deepEqual([...list], ['header', 'footer']);
  list.add('selected'); assert.equal(element.getAttribute('part'), 'header footer selected');
  element.part = 'active active'; assert.equal(list.value, 'active active'); assert.deepEqual([...list], ['active']);
  list.toggle('active'); assert.equal(element.getAttribute('part'), '');
  await Promise.resolve(); assert.ok(records.length >= 3); assert.equal(records[0].target, element);
  assert.throws(() => list.add('two tokens'), e => e.name === 'InvalidCharacterError');
  assert.throws(() => list.supports('header'), e => e instanceof w.TypeError && e.message === '');
  assert.throws(() => Object.getOwnPropertyDescriptor(w.Element.prototype, 'part').get.call({}), e => e instanceof w.TypeError);
});

test('native-observed supported-token tables are case insensitive and not generic rel unions', t => {
  const w = fixture(t), d = w.document;
  const link = d.createElement('link'), anchor = d.createElement('a'), form = d.createElement('form');
  assert.equal(link.relList.supports('STYLESHEET'), true); assert.equal(link.relList.supports('noopener'), false);
  assert.equal(link.relList.supports('icon'), false); assert.equal(anchor.relList.supports('NOOPENER'), true);
  assert.equal(form.relList.supports('opener'), true); assert.equal(form.relList.supports('stylesheet'), false);
  form.rel = 'noopener'; assert.equal(form.relList.value, 'noopener'); form.relList.add('noreferrer'); assert.equal(form.rel, 'noopener noreferrer');
  const iframe = d.createElement('iframe'); assert.equal(iframe.sandbox.supports('ALLOW-SCRIPTS'), true); assert.equal(iframe.sandbox.supports('allow-unknown'), false);
  for (const [tag, property, attribute] of [['link', 'sizes', 'sizes'], ['output', 'htmlFor', 'for'], ['iframe', 'sandbox', 'sandbox'], ['area', 'relList', 'rel']]) {
    const element = d.createElement(tag), list = element[property]; element[property] = 'one two';
    assert.equal(element[property], list); assert.equal(element.getAttribute(attribute), 'one two');
    element.setAttribute(attribute, 'changed'); assert.equal(list.value, 'changed');
  }
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'a'); svg.relList = 'noopener';
  assert.ok(svg instanceof w.SVGAElement); assert.equal(svg.getAttribute('rel'), 'noopener');
});

test('legacy document color aliases reflect the current real body without authored-method interference', t => {
  const w = fixture(t), d = w.document, first = d.body;
  for (const [property, attribute] of [['fgColor', 'text'], ['linkColor', 'link'], ['vlinkColor', 'vlink'], ['alinkColor', 'alink'], ['bgColor', 'bgcolor']]) {
    assert.equal(Object.hasOwn(w.Document.prototype, property), true);
    d[property] = '#123'; assert.equal(first.getAttribute(attribute), '#123');
    d[property] = null; assert.equal(first.getAttribute(attribute), ''); d[property] = undefined; assert.equal(first.getAttribute(attribute), 'undefined');
  }
  first.getAttribute = () => 'authored'; d.fgColor = 'real'; assert.equal(d.fgColor, 'real');
  const replacement = d.createElement('body'); replacement.setAttribute('text', 'new'); d.body = replacement;
  assert.equal(d.fgColor, 'new'); replacement.remove(); assert.equal(d.fgColor, ''); assert.doesNotThrow(() => { d.fgColor = 'no-body'; });
  assert.throws(() => Object.getOwnPropertyDescriptor(w.Document.prototype, 'fgColor').get.call({}), e => e instanceof w.TypeError);
});
