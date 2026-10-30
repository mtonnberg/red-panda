// Explicit prototype checks, prepared while runtime diagnostics are paused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installListenerOwnership } from './listener-ownership.mjs';

test('explicit host records survive erasure while authored listeners and handler values are removed', t => {
  const dom = new JSDOM('<body><button></button>', { runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window, ownership = installListenerOwnership(w), events = [];
  ownership.add(w, 'probe', () => events.push('host'));
  w.addEventListener('probe', () => events.push('public'));
  w.onmessage = () => events.push('window-handler');
  w.document.body.onclick = () => events.push('body-handler');
  ownership.eraseAuthoredListeners(); w.dispatchEvent(new w.Event('probe'));
  assert.deepEqual(events, ['host']); assert.equal(w.onmessage, null); assert.equal(w.document.body.onclick, null);
  w.onmessage = () => events.push('new-handler'); w.dispatchEvent(new w.Event('message'));
  assert.deepEqual(events, ['host', 'new-handler']);
});

test('erasure mutates arrays observed by an ongoing dispatch', t => {
  const dom = new JSDOM(''); t.after(() => dom.window.close()); const w = dom.window;
  const ownership = installListenerOwnership(w), events = [];
  w.addEventListener('probe', () => { events.push('first'); ownership.eraseAuthoredListeners(); });
  w.addEventListener('probe', () => events.push('removed-later'));
  ownership.add(w, 'probe', () => events.push('host'));
  w.dispatchEvent(new w.Event('probe')); assert.deepEqual(events, ['first', 'host']);
});

test('closed shadow descendants are erased without disconnecting actual mutation observers', async t => {
  const dom = new JSDOM('<body><div></div>'); t.after(() => dom.window.close()); const w = dom.window;
  const ownership = installListenerOwnership(w), root = w.document.querySelector('div').attachShadow({ mode: 'closed' });
  const button = w.document.createElement('button'); root.append(button); let events = 0;
  button.addEventListener('probe', () => events++); root.addEventListener('probe', () => events++);
  const records = [], observer = new w.MutationObserver(batch => records.push(...batch));
  observer.observe(w.document, { childList: true, subtree: true });
  ownership.eraseAuthoredListeners(); button.dispatchEvent(new w.Event('probe', { bubbles: true }));
  const paragraph = w.document.createElement('p'); w.document.body.append(paragraph);
  await Promise.resolve(); assert.equal(events, 0); assert.ok(records.some(record => [...record.addedNodes].includes(paragraph)));
  observer.disconnect();
});

test('an ownership scope cannot mark an unrelated Window listener as internal', t => {
  const a = new JSDOM(''), b = new JSDOM(''); t.after(() => { a.window.close(); b.window.close(); });
  const ownA = installListenerOwnership(a.window), ownB = installListenerOwnership(b.window); let events = 0;
  ownA.scope(() => b.window.addEventListener('probe', () => events++));
  ownB.eraseAuthoredListeners(); b.window.dispatchEvent(new b.window.Event('probe')); assert.equal(events, 0);
});
