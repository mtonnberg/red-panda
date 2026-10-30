import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser.js';
import { runInput } from '../src/input.js';

const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
test('trusted keyboard input follows focus through actual nested iframe realms', async t => {
  const browser = new Browser({ loadResources: ['iframe'] }), page = browser.createPage();
  t.after(() => browser.close());
  const leaf = '<input id=field><input id=readonly readonly value=locked>';
  const middle = `<iframe srcdoc="${attribute(leaf)}"></iframe>`;
  await page.navigate(`data:text/html,${encodeURIComponent(`<input id=parent value=retained><iframe srcdoc="${attribute(middle)}"></iframe>`)}`);
  const firstElement = page.dom.window.document.querySelector('iframe');
  const first = page.frames.findElement(firstElement);
  const secondElement = first.dom.window.document.querySelector('iframe');
  const second = page.frames.findElement(secondElement), window = second.dom.window;
  const input = window.document.querySelector('#field'), events = [];
  for (const type of ['keydown', 'beforeinput', 'input', 'keyup']) input.addEventListener(type, event => events.push({
    type, trusted: event.isTrusted, realm: type === 'keydown' || type === 'keyup' ? event instanceof window.KeyboardEvent : event instanceof window.InputEvent,
  }));
  input.focus();
  assert.equal(page.dom.window.document.activeElement, firstElement);
  assert.equal(first.dom.window.document.activeElement, secondElement);
  runInput({ page }, 'Input.insertText', { text: 'Panda 🦊' });
  assert.equal(input.value, 'Panda 🦊');
  runInput({ page }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace' });
  runInput({ page }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace' });
  assert.equal(input.value, 'Panda ');
  assert.ok(events.length >= 6); assert.ok(events.every(event => event.trusted && event.realm));
  assert.equal(page.dom.window.document.querySelector('#parent').value, 'retained');
  window.document.querySelector('#readonly').focus();
  runInput({ page }, 'Input.insertText', { text: 'ignored' });
  assert.equal(window.document.querySelector('#readonly').value, 'locked');
  firstElement.remove();
  page.dom.window.document.querySelector('#parent').focus();
  runInput({ page }, 'Input.insertText', { text: '!' });
  assert.equal(page.dom.window.document.querySelector('#parent').value, '!retained');
  assert.equal(second.closed, true);
});

test('keyboard input reaches focused controls in open and closed shadow roots', async t => {
  const browser = new Browser(), page = browser.createPage(); t.after(() => browser.close());
  await page.navigate('data:text/html,<div id=host></div>');
  const window = page.dom.window, host = window.document.querySelector('#host');
  const root = host.attachShadow({ mode: 'closed' }); root.innerHTML = '<section></section>';
  const nested = root.querySelector('section').attachShadow({ mode: 'open' }); nested.innerHTML = '<input>';
  const input = nested.querySelector('input'); input.focus();
  assert.equal(window.document.activeElement, host);
  runInput({ page }, 'Input.insertText', { text: 'Shadow' }); assert.equal(input.value, 'Shadow');
  input.addEventListener('beforeinput', event => event.preventDefault(), { once: true });
  runInput({ page }, 'Input.insertText', { text: ' canceled' }); assert.equal(input.value, 'Shadow');
  runInput({ page }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'x', text: 'x' }); assert.equal(input.value, 'Shadowx');
});

async function focusFixture(t) {
  const browser = new Browser({ loadResources: ['iframe'] }), page = browser.createPage(); t.after(() => browser.close());
  await page.navigate(`data:text/html,${encodeURIComponent(`<input id=parent><iframe id=frame srcdoc="${attribute('<input id=child>')}"></iframe>`)}`);
  const window = page.dom.window, parent = window.document.getElementById('parent'), frame = window.document.getElementById('frame');
  const childWindow = frame.contentWindow, child = childWindow.document.getElementById('child'), events = [];
  for (const node of [parent, frame, child]) for (const type of ['focus', 'focusin', 'blur', 'focusout']) node.addEventListener(type, event => {
    assert.equal(event.isTrusted, true); assert.equal(event instanceof node.ownerDocument.defaultView.FocusEvent, true);
    assert.equal(childWindow.frameElement, frame);
    events.push([node.id, type, event.relatedTarget?.id ?? null, event.isTrusted]);
  });
  return { page, window, parent, frame, childWindow, child, events };
}

test('cross-document focus matches the native oracle without synthesizing frame proxy events', async t => {
  const f = await focusFixture(t);
  f.child.focus(); f.parent.focus(); f.child.focus(); f.child.focus();
  assert.deepEqual(f.events, [
    ['child', 'focus', null, true], ['child', 'focusin', null, true],
    ['child', 'blur', null, true], ['child', 'focusout', null, true],
    ['parent', 'focus', null, true], ['parent', 'focusin', null, true],
    ['parent', 'blur', null, true], ['parent', 'focusout', null, true],
    ['child', 'focus', null, true], ['child', 'focusin', null, true],
  ]);
  assert.equal(f.window.document.activeElement, f.frame); assert.equal(f.childWindow.document.activeElement, f.child);
  runInput({ page: f.page }, 'Input.insertText', { text: 'child' }); assert.equal(f.child.value, 'child'); assert.equal(f.parent.value, '');
});

test('explicit frame focus is distinct from entering an already focused child context', async t => {
  const f = await focusFixture(t);
  f.parent.focus(); f.frame.focus();
  assert.deepEqual(f.events, [
    ['parent', 'focus', null, true], ['parent', 'focusin', null, true],
    ['parent', 'blur', 'frame', true], ['parent', 'focusout', 'frame', true],
    ['frame', 'focus', 'parent', true], ['frame', 'focusin', 'parent', true],
  ]);
  f.events.length = 0; f.child.focus(); f.frame.focus();
  assert.deepEqual(f.events, [['child', 'focus', null, true], ['child', 'focusin', null, true]]);
  assert.equal(f.childWindow.document.activeElement, f.child);
  f.events.length = 0; f.parent.focus();
  assert.deepEqual(f.events, [
    ['child', 'blur', null, true], ['child', 'focusout', null, true],
    ['parent', 'focus', null, true], ['parent', 'focusin', null, true],
  ]);
});

test('child blur retains its context proxy while blurring the frame clears the active child context', async t => {
  const f = await focusFixture(t);
  f.child.focus(); f.events.length = 0; f.child.blur();
  assert.deepEqual(f.events, [['child', 'blur', null, true], ['child', 'focusout', null, true]]);
  assert.equal(f.window.document.activeElement, f.frame); assert.equal(f.childWindow.document.activeElement, f.childWindow.document.body);
  f.events.length = 0; f.parent.focus();
  assert.deepEqual(f.events, [['parent', 'focus', null, true], ['parent', 'focusin', null, true]]);
  f.child.focus(); f.events.length = 0; f.frame.blur();
  assert.deepEqual(f.events, [['child', 'blur', null, true], ['child', 'focusout', null, true]]);
  assert.equal(f.window.document.activeElement, f.window.document.body);
  assert.equal(f.childWindow.document.activeElement, f.childWindow.document.body);
});

test('sibling iframe transitions blur the old leaf and focus the new leaf with null related targets', async t => {
  const f = await focusFixture(t);
  const second = f.window.document.createElement('iframe'); second.srcdoc = '<input id=other>'; f.window.document.body.append(second);
  const other = second.contentDocument.getElementById('other');
  for (const type of ['focus', 'focusin', 'blur', 'focusout']) {
    second.addEventListener(type, () => assert.fail('A context proxy emitted an element event'));
    other.addEventListener(type, event => f.events.push(['other', type, event.relatedTarget?.id ?? null, event.isTrusted]));
  }
  f.child.focus(); f.events.length = 0; other.focus();
  assert.deepEqual(f.events, [
    ['child', 'blur', null, true], ['child', 'focusout', null, true],
    ['other', 'focus', null, true], ['other', 'focusin', null, true],
  ]);
  assert.equal(f.window.document.activeElement, second); assert.equal(f.childWindow.document.activeElement, f.childWindow.document.body);
});

test('nested frame proxies and closed-shadow focus survive parent transitions and explicit ancestor blur', async t => {
  const browser = new Browser({ loadResources: ['iframe'] }), page = browser.createPage(); t.after(() => browser.close());
  const leaf = '<div id=host></div>', middle = `<iframe id=inner srcdoc="${attribute(leaf)}"></iframe>`;
  await page.navigate(`data:text/html,${encodeURIComponent(`<input id=parent><iframe id=outer srcdoc="${attribute(middle)}"></iframe>`)}`);
  const window = page.dom.window, parent = window.document.getElementById('parent'), outer = window.document.getElementById('outer');
  const inner = outer.contentDocument.getElementById('inner'), host = inner.contentDocument.getElementById('host');
  const root = host.attachShadow({ mode: 'closed' }); root.innerHTML = '<input id=leaf>'; const input = root.querySelector('input'), events = [];
  for (const frame of [outer, inner]) for (const type of ['focus', 'focusin', 'blur', 'focusout']) frame.addEventListener(type, () => assert.fail('Proxy frame event'));
  for (const node of [parent, input]) for (const type of ['focus', 'focusin', 'blur', 'focusout']) node.addEventListener(type, event => {
    assert.equal(event.relatedTarget, null); assert.equal(event.isTrusted, true); events.push(`${node.id}:${type}`);
  });
  input.focus(); parent.focus(); input.focus(); input.focus();
  assert.deepEqual(events, ['leaf:focus', 'leaf:focusin', 'leaf:blur', 'leaf:focusout', 'parent:focus', 'parent:focusin',
    'parent:blur', 'parent:focusout', 'leaf:focus', 'leaf:focusin']);
  assert.equal(window.document.activeElement, outer); assert.equal(outer.contentDocument.activeElement, inner);
  assert.equal(inner.contentDocument.activeElement, host); assert.equal(root.activeElement, input);
  runInput({ page }, 'Input.insertText', { text: 'nested' }); assert.equal(input.value, 'nested');
  events.length = 0; inner.blur();
  assert.deepEqual(events, ['leaf:blur', 'leaf:focusout']); assert.equal(window.document.activeElement, outer);
  assert.equal(outer.contentDocument.activeElement, outer.contentDocument.body); assert.equal(root.activeElement, null);
});

test('native child eligibility remains local even when its embedding frame is hidden or inert', async t => {
  const f = await focusFixture(t);
  f.parent.focus(); f.frame.style.display = 'none'; f.child.focus();
  assert.equal(f.window.document.activeElement, f.frame); assert.equal(f.childWindow.document.activeElement, f.child);
  f.frame.style.display = ''; f.parent.focus(); f.frame.inert = true; f.child.focus();
  assert.equal(f.window.document.activeElement, f.frame); assert.equal(f.childWindow.document.activeElement, f.child);
});
