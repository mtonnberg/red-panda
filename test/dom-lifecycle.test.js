import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installDOMLifecycle } from '../src/dom-lifecycle.js';

function fixture(t) { const page = { closed: false, documentAbort: new AbortController() }; const dom = new JSDOM('<body><section id="a"></section><section id="b"></section></body>', { runScripts: 'outside-only', beforeParse(w) { installDOMLifecycle(page, w); } }); t.after(() => { page.closed = true; page.documentAbort.abort(); dom.window.close(); }); return dom.window; }
function register(w) { const log = []; w.customElements.define('actual-move', class extends w.HTMLElement { connectedCallback() { log.push(['connected', this]); } disconnectedCallback() { log.push(['disconnected', this]); } adoptedCallback() { log.push(['adopted', this]); } }); return log; }

test('same-document connected moves preserve actual identity and mutation records without lifecycle churn', async t => {
  const w = fixture(t), d = w.document, log = register(w), a = d.getElementById('a'), b = d.getElementById('b'), node = d.createElement('actual-move'), child = d.createElement('actual-move'), records = [];
  node.append(child); a.append(node); assert.deepEqual(log.map(x => x[0]), ['connected', 'connected']);
  new w.MutationObserver(values => records.push(...values)).observe(d.body, { childList: true, subtree: true });
  b.append(node); assert.equal(node.parentNode, b); assert.equal(node.firstChild, child); assert.equal(node.isConnected, true); assert.equal(log.length, 2);
  a.prepend(node); b.replaceChildren(node); assert.equal(log.length, 2);
  await Promise.resolve(); assert.ok(records.some(record => Array.from(record.removedNodes).includes(node))); assert.ok(records.some(record => Array.from(record.addedNodes).includes(node)));
});

test('genuine detach, fragment, disconnected and cross-document transitions retain lifecycle callbacks', t => {
  const w = fixture(t), d = w.document, log = register(w), node = d.createElement('actual-move');
  d.body.append(node); node.remove(); d.body.append(node); assert.deepEqual(log.map(x => x[0]), ['connected', 'disconnected', 'connected']);
  const fragment = d.createDocumentFragment(); fragment.append(node); d.body.append(fragment); assert.deepEqual(log.slice(-2).map(x => x[0]), ['disconnected', 'connected']);
  const detached = d.createElement('div'); detached.append(node); assert.equal(log.at(-1)[0], 'disconnected'); d.body.append(node); assert.equal(log.at(-1)[0], 'connected');
  const other = d.implementation.createHTMLDocument('other'); other.body.append(node); assert.equal(node.ownerDocument, other); assert.deepEqual(log.slice(-3).map(x => x[0]), ['disconnected', 'adopted', 'connected']);
});

test('ShadowRoot onslotchange observes actual distribution, real targets and handler replacement', async t => {
  const w = fixture(t), host = w.document.createElement('div'); w.document.body.append(host); const shadow = host.attachShadow({ mode: 'open' }); shadow.innerHTML = '<slot></slot>';
  const slot = shadow.querySelector('slot'), seen = [], listener = [], targets = [];
  shadow.addEventListener('slotchange', event => { listener.push(event); targets.push(event.target); });
  const handler = function(event) { seen.push([this, event]); }; shadow.onslotchange = handler; assert.equal(shadow.onslotchange, handler);
  const child = w.document.createElement('span'); host.append(child); await Promise.resolve(); await Promise.resolve();
  assert.equal(seen.length, 1); assert.equal(listener.length, 1); assert.equal(seen[0][0], shadow); assert.equal(seen[0][1], listener[0]); assert.equal(targets[0], slot); assert.equal(listener[0].isTrusted, true); assert.deepEqual(slot.assignedNodes(), [child]);
  shadow.onslotchange = null; child.remove(); await Promise.resolve(); await Promise.resolve(); assert.equal(seen.length, 1); assert.equal(listener.length, 2);
  assert.throws(() => Object.getOwnPropertyDescriptor(w.ShadowRoot.prototype, 'onslotchange').get.call({}), e => e instanceof w.TypeError);
});
