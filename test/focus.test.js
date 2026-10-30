import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installFocus, advanceFocus } from '../src/focus.js';

function fixture(html) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  installFocus(dom.window);
  return { window: dom.window, document: dom.window.document, element: selector => dom.window.document.querySelector(selector), close: () => dom.window.close() };
}

test('host focus preserves trusted FocusEvent order, related targets and repeat-focus behavior', () => {
  const f = fixture('<input id="first"><input id="second">');
  try {
    const first = f.element('#first'), second = f.element('#second'), events = [];
    for (const node of [first, second]) for (const type of ['focus', 'focusin', 'blur', 'focusout']) node.addEventListener(type, event => {
      assert.equal(event instanceof f.window.FocusEvent, true); assert.equal(event.isTrusted, true);
      assert.equal(event.cancelable, false); assert.equal(event.composed, true);
      assert.equal(event.bubbles, ['focusin', 'focusout'].includes(type));
      events.push([type, node.id, event.relatedTarget?.id ?? null]);
    });
    first.focus(); first.focus(); second.focus(); second.blur();
    assert.deepEqual(events, [
      ['focus', 'first', null], ['focusin', 'first', null], ['blur', 'first', 'second'], ['focusout', 'first', 'second'],
      ['focus', 'second', 'first'], ['focusin', 'second', 'first'], ['blur', 'second', null], ['focusout', 'second', null],
    ]);
    assert.equal(f.document.activeElement, f.document.body);
  } finally { f.close(); }
});

test('display-none and inert ancestors, disabled controls and hidden inputs reject focus even with tabindex', () => {
  const f = fixture('<input id="sentinel"><div style="display:none"><button id="hidden">Hidden</button></div><div inert><input id="inert"></div><button disabled tabindex="0" id="disabled">Disabled</button><input type="hidden" tabindex="0" id="hiddenInput"><div tabindex="nope" id="bad"></div>');
  try {
    const sentinel = f.element('#sentinel'); sentinel.focus(); let blurred = 0;
    sentinel.addEventListener('blur', () => blurred++);
    for (const selector of ['#hidden', '#inert', '#disabled', '#hiddenInput', '#bad']) {
      f.element(selector).focus(); assert.equal(f.document.activeElement, sentinel, selector);
    }
    f.document.createElement('button').focus(); assert.equal(f.document.activeElement, sentinel); assert.equal(blurred, 0);
    f.element('#hidden').parentElement.style.display = ''; f.element('#hidden').focus();
    assert.equal(f.document.activeElement, f.element('#hidden'));
    const inertParent = f.element('#inert').parentElement;
    assert.equal(inertParent.inert, true); inertParent.inert = false;
    assert.equal(inertParent.hasAttribute('inert'), false); f.element('#inert').focus();
    assert.equal(f.document.activeElement, f.element('#inert'));
  } finally { f.close(); }
});

test('contenteditable hosts focus without changing attributes and nested inherited editors need tabindex', async () => {
  const f = fixture('<input id="sentinel"><div id="editor"><span id="nested">Edit</span></div><div contenteditable="false" id="false"></div><div contenteditable="bogus" id="invalid"></div>');
  try {
    const editor = f.element('#editor'), nested = f.element('#nested');
    assert.equal(editor.contentEditable, 'inherit'); editor.contentEditable = 'TRUE';
    assert.equal(editor.contentEditable, 'true'); assert.equal(editor.isContentEditable, true); assert.equal(nested.isContentEditable, true);
    const changes = [];
    const observer = new f.window.MutationObserver(records => changes.push(...records));
    observer.observe(editor, { attributes: true, subtree: true });
    editor.focus(); assert.equal(f.document.activeElement, editor); assert.equal(editor.hasAttribute('tabindex'), false);
    f.element('#sentinel').focus(); nested.focus(); assert.equal(f.document.activeElement, f.element('#sentinel'));
    f.element('#false').focus(); f.element('#invalid').focus(); assert.equal(f.document.activeElement, f.element('#sentinel'));
    editor.contentEditable = 'plaintext-only'; assert.equal(editor.contentEditable, 'plaintext-only'); editor.focus();
    assert.equal(f.document.activeElement, editor);
    await Promise.resolve(); assert.ok(changes.every(change => change.attributeName !== 'tabindex'));
    observer.disconnect();
    assert.throws(() => { editor.contentEditable = 'not-valid'; }, error => error.name === 'SyntaxError');
    editor.contentEditable = 'false'; assert.equal(nested.isContentEditable, false);
    nested.tabIndex = -1; nested.focus(); assert.equal(f.document.activeElement, nested);
  } finally { f.close(); }
});

test('label activation focuses its control before forwarding click and respects cancelation and interactive descendants', () => {
  const f = fixture('<input id="sentinel"><label for="control">Label <button type="button" id="nested">Nested</button></label><input id="control">');
  try {
    const sentinel = f.element('#sentinel'), control = f.element('#control'), label = f.element('label'), events = [];
    control.addEventListener('focus', () => events.push('focus'));
    control.addEventListener('click', event => {
      events.push('click'); assert.equal(event.isTrusted, false); assert.equal(event.detail, 0); assert.equal(event.composed, true);
    });
    sentinel.focus(); label.addEventListener('click', event => event.preventDefault(), { once: true });
    label.click(); assert.equal(f.document.activeElement, sentinel); assert.deepEqual(events, []);
    label.click(); assert.equal(f.document.activeElement, control); assert.deepEqual(events, ['focus', 'click']);
    sentinel.focus(); f.element('#nested').click(); assert.equal(f.document.activeElement, sentinel);
    assert.deepEqual(events, ['focus', 'click']);
    control.disabled = true; label.click(); assert.equal(f.document.activeElement, sentinel);
  } finally { f.close(); }
});

test('visibility-hidden programmatic focus matches the bounded native behavior and a newly hidden active control can blur', () => {
  const f = fixture('<button style="visibility:hidden">Visibility</button>');
  try {
    const button = f.element('button'); button.focus(); assert.equal(f.document.activeElement, button);
    button.style.display = 'none'; button.blur(); assert.equal(f.document.activeElement, f.document.body);
  } finally { f.close(); }
});

test('sequential focus orders positive tabindex then normal controls, skips exclusions and wraps both ways', () => {
  const f = fixture('<button id="normal">Normal</button><input type="radio" name="r" id="radio1"><input type="radio" name="r" id="radio2" checked><button disabled tabindex="1">No</button><input hidden><div inert><button>Inert</button></div><div tabindex="-1">Negative</div><button id="two" tabindex="2">Two</button><button id="one" tabindex="1">One</button><div contenteditable id="editor">Edit</div>');
  try {
    const seen = [];
    for (let index = 0; index < 7; index++) seen.push(advanceFocus(f.window).id);
    assert.deepEqual(seen, ['one', 'two', 'normal', 'radio1', 'radio2', 'editor', 'one']);
    assert.equal(advanceFocus(f.window, true).id, 'editor'); assert.equal(advanceFocus(f.window, true).id, 'radio2');
    f.element('[tabindex="-1"]').focus(); assert.equal(advanceFocus(f.window).id, 'normal');
  } finally { f.close(); }
});

test('unregistered jsdom documents keep their original focus eligibility', () => {
  const f = fixture('<input>'); const other = new JSDOM('<button style="display:none">Original</button>');
  try {
    other.window.document.querySelector('button').focus();
    assert.equal(other.window.document.activeElement, other.window.document.querySelector('button'));
  } finally { f.close(); other.window.close(); }
});

test('closed-shadow focus uses the actual leaf and retargets same-document related targets', () => {
  const f = fixture('<div id="host"></div><input id="parent">');
  try {
    const host = f.element('#host'), parent = f.element('#parent'), root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<input id="leaf">'; const leaf = root.querySelector('input'), events = [];
    leaf.addEventListener('blur', event => events.push(['leaf-blur', event.relatedTarget === parent]));
    parent.addEventListener('focus', event => events.push(['parent-focus', event.relatedTarget === host]));
    leaf.focus(); assert.equal(f.document.activeElement, host); assert.equal(root.activeElement, leaf);
    parent.focus(); assert.equal(root.activeElement, null); assert.deepEqual(events, [['leaf-blur', true], ['parent-focus', true]]);
    // Native host.blur() does not unfocus its retargeted shadow descendant.
    leaf.focus(); host.blur(); assert.equal(f.document.activeElement, host); assert.equal(root.activeElement, leaf);
    leaf.blur(); assert.equal(f.document.activeElement, f.document.body); assert.equal(root.activeElement, null);
  } finally { f.close(); }
});
