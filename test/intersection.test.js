import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, until } from '../src/browser.js';

async function setup(t) {
  const browser = new Browser(); t.after(() => browser.close());
  const page = browser.createPage();
  await page.navigate('data:text/html,<!doctype html><div id="root"><button id="target">Target</button></div>');
  return { page, window: page.dom.window, target: page.dom.window.document.getElementById('target') };
}

test('intersection options validate conversion order, normalize margins and retain sorted duplicate thresholds', async t => {
  const { window: w } = await setup(t);
  const observer = new w.IntersectionObserver(() => {}, { rootMargin: '10px/**/5%', threshold: [0.75, 0.25, 0.75] });
  assert.equal(observer.rootMargin, '10px 5% 10px 5%');
  assert.equal(observer.scrollMargin, '0px 0px 0px 0px');
  assert.deepEqual(observer.thresholds, [0.25, 0.75, 0.75]);
  assert.equal(new w.IntersectionObserver(() => {}, { trackVisibility: true }).delay, 100);
  assert.throws(() => new w.IntersectionObserver(() => {}, { threshold: NaN, rootMargin: 'bad' }), { name: 'TypeError' });
  assert.throws(() => new w.IntersectionObserver(() => {}, { threshold: 2, rootMargin: 'bad' }), { name: 'SyntaxError' });
  assert.throws(() => new w.IntersectionObserver(() => {}, { threshold: 2 }), { name: 'RangeError' });
  assert.throws(() => observer.observe(w.document.createTextNode('bad')), { name: 'TypeError' });
});

test('intersection delivery uses live geometry and observes changes without reporting unchanged frames', async t => {
  const { window: w, page, target } = await setup(t);
  const entries = [];
  const observer = new w.IntersectionObserver(batch => entries.push(...batch), { threshold: [0, 1] });
  observer.observe(target);
  await until(() => entries.length === 1);
  assert.equal(entries[0].target, target);
  assert.equal(entries[0].intersectionRatio, 1);
  assert.ok(entries[0].boundingClientRect instanceof w.DOMRectReadOnly);
  assert.deepEqual(entries[0].boundingClientRect.toJSON(), target.getBoundingClientRect().toJSON());
  target.style.display = 'none';
  await until(() => entries.length === 2);
  assert.equal(entries[1].isIntersecting, false);
  observer.disconnect();
  target.style.display = '';
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(entries.length, 2);
  assert.equal(page.layout.hitTest(2, target.getBoundingClientRect().top + 2), target);
});

test('detached documents remain silent until adoption and unobserve cancels pending observation', async t => {
  const { window: w } = await setup(t);
  const entries = [];
  const target = w.document.implementation.createHTMLDocument('').body.appendChild(w.document.createElement('button'));
  const observer = new w.IntersectionObserver(batch => entries.push(...batch));
  observer.observe(target);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(entries.length, 0);
  w.document.body.append(target);
  await until(() => entries.length === 1);
  observer.unobserve(target);
  target.style.display = 'none';
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(entries.length, 1);
  observer.disconnect();
});

test('observer delivery honors registration order, disconnection during delivery and reported exceptions', async t => {
  const { window: w, target } = await setup(t);
  const order = [];
  let third;
  const first = new w.IntersectionObserver(() => { order.push('first'); third.disconnect(); throw new w.DOMException('reported', 'SyntaxError'); });
  const second = new w.IntersectionObserver(() => order.push('second'));
  third = new w.IntersectionObserver(() => order.push('third'));
  w.addEventListener('error', event => { order.push(event.message); event.preventDefault(); });
  first.observe(target); second.observe(target); third.observe(target);
  await until(() => order.length === 3);
  assert.deepEqual(order, ['first', 'reported', 'second']);
  first.disconnect(); second.disconnect();
});
