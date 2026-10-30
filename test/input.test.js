import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Browser } from '../src/browser.js';
import { runInput, supportsInput, installInput } from '../src/input.js';

function fixture(html) {
  const browser = new Browser();
  const page = browser.createPage();
  page.dom.window.document.body.innerHTML = html;
  return { browser, page, session: { page }, window: page.dom.window,
    element: selector => page.dom.window.document.querySelector(selector) };
}

function key(session, name, params = {}) {
  runInput(session, 'Input.dispatchKeyEvent', { type: 'keyDown', key: name, ...params });
}

test('keyboard typing emits keydown, keypress, beforeinput, input and keyup in order', () => {
  const f = fixture('<input>');
  try {
    const input = f.element('input'); input.focus();
    const events = [];
    for (const type of ['keydown', 'keypress', 'beforeinput', 'input', 'keyup']) input.addEventListener(type, event => {
      events.push({ type, key: event.key, data: event.data, inputType: event.inputType, shift: event.shiftKey, trusted: event.isTrusted });
    });
    key(f.session, 'A', { code: 'KeyA', text: 'A', modifiers: 8, windowsVirtualKeyCode: 65 });
    runInput(f.session, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'A', code: 'KeyA', modifiers: 8 });
    assert.equal(input.value, 'A');
    assert.deepEqual(events.map(event => event.type), ['keydown', 'keypress', 'beforeinput', 'input', 'keyup']);
    assert.equal(events[0].shift, true); assert.equal(events[1].key, 'A');
    assert.equal(events[2].data, 'A'); assert.equal(events[3].inputType, 'insertText');
    assert.ok(events.every(event => event.trusted));
  } finally { f.browser.close(); }
});

test('page-created events stay untrusted while driver input is trusted and still cancelable', () => {
  const f = fixture('<input>');
  try {
    const input = f.element('input'); input.focus();
    const events = [];
    input.addEventListener('keydown', event => events.push({ type: event.type, trusted: event.isTrusted }));
    input.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    key(f.session, 'A', { text: 'A' });
    assert.deepEqual(events, [{ type: 'keydown', trusted: false }, { type: 'keydown', trusted: true }]);
    assert.equal(input.value, 'A');
    input.addEventListener('beforeinput', event => { assert.equal(event.isTrusted, true); event.preventDefault(); }, { once: true });
    runInput(f.session, 'Input.insertText', { text: 'canceled' });
    assert.equal(input.value, 'A');
  } finally { f.browser.close(); }
});

test('insertText replaces the selection and treats markup and Unicode as literal text', () => {
  const f = fixture('<textarea>before selected after</textarea>');
  try {
    const input = f.element('textarea'); input.focus(); input.setSelectionRange(7, 15);
    const events = []; input.addEventListener('keydown', () => events.push('key'));
    runInput(f.session, 'Input.insertText', { text: '<b>😀</b>' });
    assert.equal(input.value, 'before <b>😀</b> after');
    assert.equal(input.selectionStart, 16); assert.equal(input.selectionEnd, 16);
    assert.deepEqual(events, []);
  } finally { f.browser.close(); }
});

test('keydown and beforeinput cancellation prevent default editing', () => {
  const f = fixture('<input value="keep">');
  try {
    const input = f.element('input'); input.focus(); input.setSelectionRange(4, 4);
    input.addEventListener('keydown', event => event.preventDefault(), { once: true });
    key(f.session, 'x', { text: 'x' }); assert.equal(input.value, 'keep');
    input.addEventListener('beforeinput', event => event.preventDefault(), { once: true });
    runInput(f.session, 'Input.insertText', { text: 'rejected' }); assert.equal(input.value, 'keep');
    key(f.session, 'y', { text: 'y' }); assert.equal(input.value, 'keepy');
  } finally { f.browser.close(); }
});

test('backspace and delete preserve whole Unicode graphemes', () => {
  const f = fixture('<input>');
  try {
    const input = f.element('input'); input.value = 'A👩‍💻e\u0301B'; input.focus();
    input.setSelectionRange(input.value.length - 1, input.value.length - 1);
    key(f.session, 'Backspace'); assert.equal(input.value, 'A👩‍💻B');
    key(f.session, 'Backspace'); assert.equal(input.value, 'AB');
    input.setSelectionRange(0, 0); key(f.session, 'Delete'); assert.equal(input.value, 'B');
  } finally { f.browser.close(); }
});

test('programmatic UTF-16 selections cannot split an emoji during insertion', () => {
  const f = fixture('<input>');
  try {
    const input = f.element('input'); input.value = '😀X'; input.focus(); input.setSelectionRange(1, 1);
    runInput(f.session, 'Input.insertText', { text: 'A' }); assert.equal(input.value, '😀AX');
    input.value = '😀X'; input.setSelectionRange(1, 2);
    runInput(f.session, 'Input.insertText', { text: 'B' }); assert.equal(input.value, 'BX');
  } finally { f.browser.close(); }
});

test('arrow keys, shift selection and select-all determine the next insertion range', () => {
  const f = fixture('<input value="abcd">');
  try {
    const input = f.element('input'); input.focus(); input.setSelectionRange(4, 4);
    key(f.session, 'ArrowLeft', { modifiers: 8 }); key(f.session, 'ArrowLeft', { modifiers: 8 });
    assert.equal(input.selectionStart, 2); assert.equal(input.selectionEnd, 4);
    runInput(f.session, 'Input.insertText', { text: 'XY' }); assert.equal(input.value, 'abXY');
    key(f.session, 'a', { modifiers: 2, text: '' });
    runInput(f.session, 'Input.insertText', { text: 'new' }); assert.equal(input.value, 'new');
  } finally { f.browser.close(); }
});

test('raw keydown does not insert text, and Enter inserts a line break only in multiline editors', () => {
  const f = fixture('<textarea>a</textarea><input value="a">');
  try {
    const textarea = f.element('textarea'); textarea.focus(); textarea.setSelectionRange(1, 1);
    runInput(f.session, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'x', text: 'x' });
    assert.equal(textarea.value, 'a');
    key(f.session, 'Enter', { text: '\r' }); assert.equal(textarea.value, 'a\n');
    textarea.value = '\nA'; textarea.setSelectionRange(0, 0); key(f.session, 'Home'); assert.equal(textarea.selectionStart, 0);
    const input = f.element('input'); input.focus(); key(f.session, 'Enter', { text: '\r' }); assert.equal(input.value, 'a');
  } finally { f.browser.close(); }
});

test('read-only and disabled controls do not receive text edits', () => {
  const f = fixture('<input value="unchanged">');
  try {
    const input = f.element('input'); input.focus(); input.readOnly = true;
    runInput(f.session, 'Input.insertText', { text: 'ignored' }); key(f.session, 'Backspace');
    assert.equal(input.value, 'unchanged');
    input.readOnly = false; input.disabled = true;
    runInput(f.session, 'Input.insertText', { text: 'ignored' }); assert.equal(input.value, 'unchanged');
  } finally { f.browser.close(); }
});

test('contenteditable replacement uses DOM ranges and leaves surrounding markup intact', () => {
  const f = fixture('<div contenteditable="true" tabindex="0"><b>bold</b> tail</div>');
  try {
    const root = f.element('div'); root.focus();
    const text = root.firstChild.firstChild;
    const range = f.window.document.createRange(); range.setStart(text, 1); range.setEnd(text, 3);
    const selection = f.window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    runInput(f.session, 'Input.insertText', { text: '<😀>' });
    assert.equal(root.textContent, 'b<😀>d tail');
    assert.equal(root.querySelector('b').textContent, 'b<😀>d');
    assert.equal(root.querySelector('😀'), null);
  } finally { f.browser.close(); }
});

test('maxlength insertion does not split a surrogate pair and email input keeps a virtual caret', () => {
  const f = fixture('<input id="limited" maxlength="2"><input id="email" type="email">');
  try {
    const input = f.element('#limited'); input.focus();
    runInput(f.session, 'Input.insertText', { text: 'a😀' }); assert.equal(input.value, 'a');
    const email = f.element('#email'); email.focus();
    runInput(f.session, 'Input.insertText', { text: 'first@example.test' });
    key(f.session, 'a', { modifiers: 2 });
    runInput(f.session, 'Input.insertText', { text: 'second@example.test' });
    assert.equal(email.value, 'second@example.test'); assert.equal(email.selectionStart, null);
  } finally { f.browser.close(); }
});

test('input methods validate parameters and require actual hit testing for coordinate input', () => {
  const f = fixture('<input>');
  try {
    assert.equal(supportsInput('Input.dispatchKeyEvent'), true);
    assert.equal(supportsInput('Input.dispatchMouseEvent'), true);
    for (const params of [{ type: 'unknown' }, { type: 'keyDown', text: 1 }, { type: 'keyDown', modifiers: 16 }, { type: 'keyDown', location: -1 }, { type: 'keyDown', autoRepeat: 1 }, { type: 'keyDown', commands: ['invented'] }]) {
      assert.throws(() => runInput(f.session, 'Input.dispatchKeyEvent', params), error => error.code === -32602);
    }
    assert.throws(() => runInput(f.session, 'Input.insertText', { text: 1 }), error => error.code === -32602);
    Object.defineProperty(f.window.document, 'elementFromPoint', { value: undefined, configurable: true });
    assert.throws(() => runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }), error => error.code === -32601);
    assert.throws(() => runInput(f.session, 'Input.unimplemented', {}), error => error.code === -32601);
  } finally { f.browser.close(); }
});

function click(session, x, y, options = {}) {
  runInput(session, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  runInput(session, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, ...options });
  runInput(session, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, ...options, ...(options.button === 'right' ? { buttons: 0 } : {}) });
}

test('mouse events use hit-test coordinates, preserve pointer precision and focus the hit element', () => {
  const f = fixture('<input id="old"><button id="hit" type="button">Hit</button>');
  try {
    const old = f.element('#old'), target = f.element('#hit'); old.focus();
    const tested = [];
    f.window.document.elementFromPoint = (x, y) => { tested.push([x, y]); return target; };
    const events = [];
    for (const type of ['pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      target.addEventListener(type, event => events.push({ type, target: event.target.id, x: event.clientX, y: event.clientY,
        button: event.button, buttons: event.buttons, detail: event.detail, trusted: event.isTrusted, pressure: event.pressure }));
    }
    click(f.session, 12.75, 23.5);
    assert.deepEqual(tested, [[12.75, 23.5], [12.75, 23.5], [12.75, 23.5]]);
    assert.deepEqual(events.map(event => event.type), ['pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
    assert.ok(events.every(event => event.target === 'hit' && event.trusted));
    assert.deepEqual(events.map(event => event.x), [12.75, 12, 12.75, 12, 12.75, 12, 12]);
    assert.deepEqual(events.map(event => event.buttons), [0, 0, 1, 1, 0, 0, 0]);
    assert.deepEqual(events.map(event => event.detail), [0, 0, 0, 1, 0, 1, 1]);
    assert.equal(events[0].button, -1); assert.equal(events[2].pressure, 0.5);
    assert.equal(f.window.document.activeElement, target);
  } finally { f.browser.close(); }
});

test('negative coordinates emit no events; a nonnegative miss hits HTML and blurs previous focus', () => {
  const f = fixture('<input id="old">');
  try {
    const old = f.element('input'); old.focus();
    let hitTests = 0; f.window.document.elementFromPoint = () => { hitTests++; return null; };
    const events = []; f.window.document.addEventListener('click', event => events.push(event.target.tagName));
    click(f.session, -1, -2); assert.equal(hitTests, 0); assert.deepEqual(events, []); assert.equal(f.window.document.activeElement, old);
    click(f.session, 100, 100); assert.deepEqual(events, ['HTML']); assert.equal(f.window.document.activeElement, f.window.document.body);
  } finally { f.browser.close(); }
});

test('canceling pointerdown suppresses compatibility mouse events and focus, but not click', () => {
  const f = fixture('<input id="old"><button type="button">Hit</button>');
  try {
    const target = f.element('button'), old = f.element('input'); old.focus(); f.window.document.elementFromPoint = () => target;
    const events = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) target.addEventListener(type, event => {
      events.push(type); if (type === 'pointerdown') event.preventDefault();
    });
    click(f.session, 5, 5);
    assert.deepEqual(events, ['pointerdown', 'pointerup', 'click']);
    assert.equal(f.window.document.activeElement, old);
  } finally { f.browser.close(); }
});

test('mousedown cancellation prevents focus and canceled clicks roll back checkbox activation', () => {
  const f = fixture('<input id="old"><input id="hit" type="checkbox">');
  try {
    const old = f.element('#old'), target = f.element('#hit'); old.focus(); f.window.document.elementFromPoint = () => target;
    target.addEventListener('mousedown', event => event.preventDefault());
    target.addEventListener('click', event => event.preventDefault(), { once: true });
    click(f.session, 5, 5);
    assert.equal(target.checked, false); assert.equal(f.window.document.activeElement, old);
    const changes = []; target.addEventListener('change', event => changes.push(event.isTrusted));
    click(f.session, 5, 5); assert.equal(target.checked, true); assert.deepEqual(changes, [true]);
  } finally { f.browser.close(); }
});

test('press and release over different siblings click their common ancestor rather than the focused element', () => {
  const f = fixture('<button type="button">Press</button><input type="checkbox">');
  try {
    const button = f.element('button'), input = f.element('input');
    f.window.document.elementFromPoint = x => x < 10 ? button : input;
    const clicks = []; f.window.document.addEventListener('click', event => clicks.push(event.target.tagName));
    runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', buttons: 1, clickCount: 1 });
    runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 15, y: 5, button: 'left', buttons: 0, clickCount: 1 });
    assert.deepEqual(clicks, ['BODY']); assert.equal(input.checked, false);
  } finally { f.browser.close(); }
});

test('right clicks, double clicks and default clickCount preserve event details and modifier flags', () => {
  const f = fixture('<button type="button">Hit</button>');
  try {
    const target = f.element('button'); f.window.document.elementFromPoint = () => target;
    const events = [];
    for (const type of ['pointerdown', 'mousedown', 'contextmenu', 'pointerup', 'mouseup', 'auxclick', 'click', 'dblclick']) {
      target.addEventListener(type, event => events.push({ type, button: event.button, buttons: event.buttons, detail: event.detail, ctrl: event.ctrlKey }));
    }
    click(f.session, 5, 5, { button: 'right', buttons: 2, modifiers: 2 });
    assert.deepEqual(events.map(event => event.type), ['pointerdown', 'mousedown', 'contextmenu', 'pointerup', 'mouseup', 'auxclick']);
    assert.equal(events[2].detail, 0); assert.equal(events[5].button, 2); assert.ok(events.every(event => event.ctrl));
    events.length = 0; click(f.session, 5, 5, { clickCount: 2 });
    assert.deepEqual(events.slice(-2).map(event => [event.type, event.detail]), [['click', 2], ['dblclick', 2]]);
    events.length = 0;
    runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5 });
    runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5 });
    assert.equal(events.some(event => event.type === 'click'), false);
  } finally { f.browser.close(); }
});

test('wheel dispatch honors cancellation and scrolls only modeled overflow extents', () => {
  const f = fixture('<div style="overflow:auto"><span>Target</span></div>');
  try {
    const scroller = f.element('div'), target = f.element('span');
    f.window.document.elementFromPoint = () => target;
    for (const [name, value] of Object.entries({ clientWidth: 100, scrollWidth: 200, clientHeight: 100, scrollHeight: 300 })) {
      Object.defineProperty(scroller, name, { value, configurable: true });
    }
    const events = []; target.addEventListener('wheel', event => events.push({ trusted: event.isTrusted, x: event.deltaX, y: event.deltaY }));
    target.addEventListener('wheel', event => event.preventDefault(), { once: true });
    runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: 1, y: 1, deltaX: 150, deltaY: 250 });
    assert.equal(scroller.scrollTop, 0); assert.equal(scroller.scrollLeft, 0);
    runInput(f.session, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: 1, y: 1, deltaX: 150, deltaY: 250 });
    assert.equal(scroller.scrollTop, 200); assert.equal(scroller.scrollLeft, 100);
    assert.deepEqual(events, [{ trusted: true, x: 150, y: 250 }, { trusted: true, x: 150, y: 250 }]);
  } finally { f.browser.close(); }
});

test('PointerEvent constructor and page-dispatched mouse events remain untrusted', () => {
  const f = fixture('<button type="button">Hit</button>');
  try {
    installInput(f.window);
    const target = f.element('button'); f.window.document.elementFromPoint = () => target;
    const pointer = new f.window.PointerEvent('pointerdown', { pointerId: 9, pointerType: 'pen', pressure: 0.7 });
    assert.equal(pointer instanceof f.window.MouseEvent, true); assert.equal(pointer.pointerId, 9); assert.equal(pointer.isTrusted, false);
    assert.equal(pointer.getCoalescedEvents() instanceof f.window.Array, true);
    assert.equal(Object.prototype.toString.call(pointer), '[object PointerEvent]');
    const trusted = []; target.addEventListener('click', event => trusted.push(event.isTrusted));
    target.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true })); click(f.session, 5, 5);
    assert.deepEqual(trusted, [false, true]);
  } finally { f.browser.close(); }
});

test('Enter activation honors keydown, keypress, click and submit cancellation before queuing form navigation', () => {
  const f = fixture('<form action="http://127.0.0.1:9582/submitted"><input name="q" value="red panda"><button id="go">Go</button></form>');
  try {
    const input = f.element('input'), button = f.element('button'), form = f.element('form'); input.focus();
    const events = [];
    for (const type of ['keydown', 'keypress', 'click', 'submit']) form.addEventListener(type, event => {
      events.push({ type, trusted: event.isTrusted, target: event.target, submitter: event.submitter, detail: event.detail });
    });
    for (const [target, type] of [[input, 'keydown'], [input, 'keypress'], [button, 'click'], [form, 'submit']]) {
      target.addEventListener(type, event => event.preventDefault(), { once: true });
      key(f.session, 'Enter', { text: '\r', windowsVirtualKeyCode: 13 });
      assert.equal(f.page.pendingNavigation, undefined, `${type} cancellation`);
    }
    events.length = 0;
    key(f.session, 'Enter', { text: '\r', windowsVirtualKeyCode: 13 });
    const pending = f.page.pendingNavigation;
    assert.equal(pending.url, 'http://127.0.0.1:9582/submitted?q=red+panda');
    assert.deepEqual(events.map(event => event.type), ['keydown', 'keypress', 'click', 'submit']);
    assert.ok(events.every(event => event.trusted)); assert.equal(events[2].target, button);
    assert.equal(events[2].detail, 0); assert.equal(events[3].submitter, button);
    pending.cancel();
  } finally { f.browser.close(); }
});

test('implicit Enter submits one text field without a button and blocks multiple fields or a disabled default button', () => {
  for (const [controls, submits] of [
    ['<input id="field" readonly name="q" value="value">', true],
    ['<input id="field" type="number" name="n" value="1">', true],
    ['<input id="field"><input>', false],
    ['<input id="field"><button disabled>Disabled</button><button>Other</button>', false],
    ['<input id="field" type="checkbox">', false],
  ]) {
    const f = fixture(`<form action="http://127.0.0.1:9582/submitted">${controls}</form>`);
    try {
      f.element('#field').focus(); key(f.session, 'Enter', { text: '\r' });
      assert.equal(Boolean(f.page.pendingNavigation), submits, controls);
      f.page.pendingNavigation?.cancel();
    } finally { f.browser.close(); }
  }
});

test('raw Enter and Enter without text do not activate; char Enter and focused buttons use normal host activation', () => {
  const f = fixture('<form action="http://127.0.0.1:9582/submitted"><input required><button id="go" formnovalidate>Go</button><button type="reset" id="reset">Reset</button></form>');
  try {
    const go = f.element('#go'); go.focus();
    key(f.session, 'Enter');
    runInput(f.session, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', text: '\r' });
    assert.equal(f.page.pendingNavigation, undefined);
    runInput(f.session, 'Input.dispatchKeyEvent', { type: 'char', key: 'Enter', text: '\r' });
    assert.ok(f.page.pendingNavigation); f.page.pendingNavigation.cancel();
    const input = f.element('input'); input.value = 'changed'; f.element('#reset').focus();
    key(f.session, 'Enter', { text: '\r' }); assert.equal(input.value, '');
  } finally { f.browser.close(); }
});

test('implicit form submission retains native validation and never submits textarea or contenteditable Enter', () => {
  const f = fixture('<form action="http://127.0.0.1:9582/submitted"><input required><textarea>a</textarea><div contenteditable id="editor">Edit</div><button>Go</button></form>');
  try {
    const input = f.element('input'); let invalid = 0; input.addEventListener('invalid', () => invalid++);
    input.focus(); key(f.session, 'Enter', { text: '\r' }); assert.equal(invalid, 1); assert.equal(f.page.pendingNavigation, undefined);
    const textarea = f.element('textarea'); textarea.focus(); textarea.setSelectionRange(1, 1);
    key(f.session, 'Enter', { text: '\r' }); assert.equal(textarea.value, 'a\n');
    const editor = f.element('#editor'); editor.focus();
    runInput(f.session, 'Input.insertText', { text: 'X' }); key(f.session, 'Enter', { text: '\r' });
    assert.ok(editor.textContent.includes('X\n')); assert.equal(editor.hasAttribute('tabindex'), false);
    assert.equal(f.page.pendingNavigation, undefined);
  } finally { f.browser.close(); }
});

test('Tab and Shift+Tab move real focus after uncanceled keydown and keyup targets the new control', () => {
  const f = fixture('<button id="normal">Normal</button><button tabindex="2" id="two">Two</button><button tabindex="1" id="one">One</button><input disabled><input hidden><div inert><button>Inert</button></div>');
  try {
    const events = [];
    f.window.document.addEventListener('keydown', event => events.push(['down', event.target.id || event.target.tagName]));
    f.window.document.addEventListener('keyup', event => events.push(['up', event.target.id]));
    runInput(f.session, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab' });
    runInput(f.session, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
    assert.equal(f.window.document.activeElement, f.element('#one'));
    assert.deepEqual(events, [['down', 'BODY'], ['up', 'one']]);
    f.element('#one').addEventListener('keydown', event => event.preventDefault(), { once: true });
    key(f.session, 'Tab'); assert.equal(f.window.document.activeElement, f.element('#one'));
    key(f.session, 'Tab'); assert.equal(f.window.document.activeElement, f.element('#two'));
    key(f.session, 'Tab', { modifiers: 8 }); assert.equal(f.window.document.activeElement, f.element('#one'));
    key(f.session, 'Tab', { modifiers: 8 }); assert.equal(f.window.document.activeElement, f.element('#normal'));
    key(f.session, 'Tab', { modifiers: 2 }); assert.equal(f.window.document.activeElement, f.element('#normal'));
  } finally { f.browser.close(); }
});

test('driver label activation focuses its control and preserves trust through the forwarded cancelable click', () => {
  const f = fixture('<label for="control">Label</label><input id="control" type="checkbox">');
  try {
    const label = f.element('label'), input = f.element('input');
    f.window.document.elementFromPoint = () => label;
    const events = [];
    input.addEventListener('click', event => {
      events.push({ trusted: event.isTrusted, detail: event.detail, pointer: event instanceof f.window.PointerEvent });
      event.preventDefault();
    });
    click(f.session, 5, 5);
    assert.equal(f.window.document.activeElement, input); assert.equal(input.checked, false);
    assert.deepEqual(events, [{ trusted: true, detail: 0, pointer: true }]);
  } finally { f.browser.close(); }
});

test('keyboard Enter performs an actual HTTP POST navigation through installed form hooks', async () => {
  let received;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    response.setHeader('content-type', 'text/html');
    if (request.url === '/form') response.end('<form action="/submitted" method="post"><input name="q" value="red panda"><button>Go</button></form>');
    else { received = { method: request.method, body: Buffer.concat(chunks).toString() }; response.end('<title>Keyboard submitted</title>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = new Browser();
  try {
    const page = browser.createPage(); await page.navigate(`http://127.0.0.1:${server.address().port}/form`);
    page.dom.window.document.querySelector('input').focus();
    key({ page }, 'Enter', { text: '\r' }); await page.pendingNavigation.promise;
    assert.deepEqual(received, { method: 'POST', body: 'q=red+panda' });
    assert.equal(page.evaluate('document.title'), 'Keyboard submitted'); assert.match(page.url, /\/submitted$/);
  } finally { browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
