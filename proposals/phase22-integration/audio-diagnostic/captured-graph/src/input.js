import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import { requestDialogClose } from './dialogs.js';
import { createRequire } from 'node:module';
import { installFocus, advanceFocus } from './focus.js';

// CDP is privileged browser input. jsdom's public dispatchEvent correctly marks
// page-created events untrusted; its pinned internal dispatch path preserves
// the trusted flag for events created by this driver instead.
const require = createRequire(import.meta.url);
const {wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const { isSubmitButton } = require('jsdom/lib/jsdom/living/helpers/form-controls.js');

const METHODS = new Set(['Input.dispatchKeyEvent', 'Input.insertText', 'Input.dispatchMouseEvent']);
const TEXT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', 'email']);
const IMPLICIT_TYPES = new Set([...TEXT_TYPES, 'date', 'month', 'week', 'time', 'datetime-local', 'number']);
const KEY_TYPES = new Set(['keyDown', 'rawKeyDown', 'keyUp', 'char']);
const CONTROL_SELECTIONS = new WeakMap();
const POINTER_STATES = new WeakMap();
const MOUSE_TYPES = new Set(['mouseMoved', 'mousePressed', 'mouseReleased', 'mouseWheel']);
const BUTTONS = { none: 0, left: 0, middle: 1, right: 2, back: 3, forward: 4 };
const BUTTON_BITS = [1, 4, 2, 8, 16];
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function invalid(message, code = -32602) {
  return Object.assign(new Error(message), { code });
}

export function supportsInput(method) { return METHODS.has(method); }

export function installInput(window) {
  installFocus(window);
  if (typeof window.PointerEvent === 'function') return;
  class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      for (const [name, fallback] of Object.entries({
        pointerId: 0, width: 1, height: 1, pressure: 0, tangentialPressure: 0,
        tiltX: 0, tiltY: 0, twist: 0, pointerType: '', isPrimary: false,
        altitudeAngle: Math.PI / 2, azimuthAngle: 0,
      })) Object.defineProperty(this, name, { value: init[name] ?? fallback, enumerable: true });
    }
    getCoalescedEvents() { return window.Array.of(); }
    getPredictedEvents() { return window.Array.of(); }
    get [Symbol.toStringTag]() { return 'PointerEvent'; }
  }
  Object.defineProperty(window, 'PointerEvent', { value: PointerEvent, writable: true, configurable: true });
}

function dispatchDriverEvent(target, event) {
  const targetImpl = implForWrapper(target);
  const eventImpl = implForWrapper(event);
  eventImpl.isTrusted = true;
  return targetImpl._dispatch(eventImpl);
}

function modifiers(bits = 0) {
  return { altKey: !!(bits & 1), ctrlKey: !!(bits & 2), metaKey: !!(bits & 4), shiftKey: !!(bits & 8) };
}

function focused(window) {
  let target = window.document.activeElement ?? window.document.body ?? window.document.documentElement;
  const visited = new Set();
  while (target && !visited.has(target)) {
    visited.add(target);
    const root = implForWrapper(target)?._shadowRoot;
    const inner = root ? wrapperForImpl(root).activeElement : undefined;
    if (!inner) break;
    target = inner;
  }
  return target;
}

function keyboardWindow(page) {
  let window = page.dom.window;
  const visited = new Set();
  while (!visited.has(window)) {
    visited.add(window);
    const target = focused(window);
    if (!['iframe', 'frame'].includes(target?.localName)) break;
    const child = page.frames?.findElement(target);
    if (!child || child.closed || child.documentAbort.signal.aborted) break;
    window = child.dom.window;
  }
  return window;
}

function editableRoot(element) {
  for (let current = element; current?.nodeType === 1; current = current.parentElement) {
    const setting = current.getAttribute('contenteditable');
    if (setting?.toLowerCase() === 'false') return null;
    if (setting === '' || ['true', 'plaintext-only'].includes(setting?.toLowerCase())) return current;
  }
  return null;
}

function textOffset(window, root, node, offset) {
  if (!node || (node !== root && !root.contains(node))) return root.textContent.length;
  const range = window.document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function textPoint(window, root, offset) {
  const walker = window.document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  let text;
  let remaining = offset;
  while ((text = walker.nextNode())) {
    if (remaining <= text.data.length) return [text, remaining];
    remaining -= text.data.length;
  }
  return [root, root.childNodes.length];
}

function model(window, target) {
  if (!target || target.disabled || target.readOnly) return null;
  if (target.localName === 'textarea' || (target.localName === 'input' && TEXT_TYPES.has(target.type))) {
    const value = target.value;
    const remembered = CONTROL_SELECTIONS.get(target);
    const start = target.selectionStart ?? (remembered?.value === value ? remembered.start : value.length);
    const end = target.selectionEnd ?? (remembered?.value === value ? remembered.end : value.length);
    return { kind: 'control', root: target, value, start, end,
      direction: target.selectionDirection ?? remembered?.direction ?? 'none' };
  }
  const root = editableRoot(target);
  if (!root) return null;
  const selection = window.getSelection();
  const anchor = textOffset(window, root, selection?.anchorNode, selection?.anchorOffset ?? 0);
  const focus = textOffset(window, root, selection?.focusNode, selection?.focusOffset ?? 0);
  return { kind: 'editable', root, value: root.textContent,
    start: Math.min(anchor, focus), end: Math.max(anchor, focus), direction: focus < anchor ? 'backward' : 'forward' };
}

function setSelection(window, current, start, end = start, direction = 'none') {
  start = Math.max(0, Math.min(start, current.value.length));
  end = Math.max(start, Math.min(end, current.value.length));
  if (current.kind === 'control') {
    try { current.root.setSelectionRange(start, end, direction); } catch {
      // Email controls expose no DOM selection API, but keyboard editing still
      // has a caret. Keep it separately without changing public selectionStart.
      CONTROL_SELECTIONS.set(current.root, { value: current.root.value, start, end, direction });
    }
    return;
  }
  const [startNode, startOffset] = textPoint(window, current.root, start);
  const [endNode, endOffset] = textPoint(window, current.root, end);
  const selection = window.getSelection();
  if (direction === 'backward') selection.setBaseAndExtent(endNode, endOffset, startNode, startOffset);
  else selection.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
}

function boundary(value, offset, forward) {
  const positions = [...segmenter.segment(value)].map(part => part.index);
  positions.push(value.length);
  if (forward) return positions.find(position => position > offset) ?? value.length;
  return positions.filter(position => position < offset).at(-1) ?? 0;
}

function wordBoundary(value, offset, forward) {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value)];
  if (forward) {
    const word = parts.find(part => part.isWordLike && part.index + part.segment.length > offset);
    return word ? word.index + word.segment.length : value.length;
  }
  return parts.filter(part => part.isWordLike && part.index < offset).at(-1)?.index ?? 0;
}

function selectionForKey(current, key, flags) {
  const { value, start, end, direction } = current;
  const selecting = flags.shiftKey;
  const anchor = direction === 'backward' ? end : start;
  const focus = direction === 'backward' ? start : end;
  let next;
  if (key === 'ArrowLeft') {
    next = !selecting && start !== end ? start : flags.ctrlKey || flags.metaKey
      ? wordBoundary(value, focus, false) : boundary(value, focus, false);
  } else if (key === 'ArrowRight') {
    next = !selecting && start !== end ? end : flags.ctrlKey || flags.metaKey
      ? wordBoundary(value, focus, true) : boundary(value, focus, true);
  } else if (key === 'Home') {
    next = flags.ctrlKey || flags.metaKey || focus === 0 ? 0 : value.lastIndexOf('\n', focus - 1) + 1;
  } else if (key === 'End') {
    const lineEnd = value.indexOf('\n', focus);
    next = flags.ctrlKey || flags.metaKey || lineEnd < 0 ? value.length : lineEnd;
  } else return null;
  if (!selecting) return { start: next, end: next, direction: 'none' };
  return { start: Math.min(anchor, next), end: Math.max(anchor, next), direction: next < anchor ? 'backward' : 'forward' };
}

function insertableText(current, text, start, end) {
  let result = text.replace(/\r\n?/g, '\n');
  if (current.kind === 'control' && current.root.localName === 'input') result = result.replaceAll('\n', '');
  const maximum = current.kind === 'control' ? current.root.maxLength : -1;
  if (maximum >= 0) {
    const available = Math.max(0, maximum - (current.value.length - (end - start)));
    let trimmed = '';
    for (const point of result) {
      if (trimmed.length + point.length > available) break;
      trimmed += point;
    }
    result = trimmed;
  }
  return result;
}

function changeText(window, target, text, inputType, { deletion = false, forward = false, word = false } = {}) {
  let current = model(window, target);
  if (!current) return;
  const before = new window.InputEvent('beforeinput', { bubbles: true, composed: true, cancelable: true, inputType, data: deletion ? null : text });
  if (!dispatchDriverEvent(current.root, before)) return;
  current = model(window, target); // A handler may change the selection or value.
  if (!current) return;
  let { start, end } = current;
  const safePoint = (offset, after) => {
    const previous = current.value.charCodeAt(offset - 1), next = current.value.charCodeAt(offset);
    return previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF ? offset + (after ? 1 : -1) : offset;
  };
  if (start === end) start = end = safePoint(start, true);
  else { start = safePoint(start, false); end = safePoint(end, true); }
  if (deletion && start === end) {
    if (forward) end = word ? wordBoundary(current.value, end, true) : boundary(current.value, end, true);
    else start = word ? wordBoundary(current.value, start, false) : boundary(current.value, start, false);
  }
  const inserted = deletion ? '' : insertableText(current, text, start, end);
  if (start === end && !inserted) return;
  if (current.kind === 'control') {
    current.root.value = current.value.slice(0, start) + inserted + current.value.slice(end);
    const updated = { ...current, value: current.root.value };
    setSelection(window, updated, Math.min(start + inserted.length, updated.value.length));
  } else {
    const range = window.document.createRange();
    range.setStart(...textPoint(window, current.root, start));
    range.setEnd(...textPoint(window, current.root, end));
    range.deleteContents();
    if (inserted) range.insertNode(window.document.createTextNode(inserted));
    setSelection(window, { ...current, value: current.root.textContent }, start + inserted.length);
  }
  dispatchDriverEvent(current.root, new window.InputEvent('input', { bubbles: true, composed: true, inputType, data: deletion ? null : inserted }));
}

function dispatchKeyboard(window, target, type, params, flags) {
  const text = params.text ?? '';
  const keyCode = params.windowsVirtualKeyCode ?? params.nativeVirtualKeyCode ?? 0;
  const charCode = type === 'keypress' ? text.codePointAt(0) ?? 0 : 0;
  return dispatchDriverEvent(target, new window.KeyboardEvent(type, {
    key: params.key ?? '', code: params.code ?? '', location: params.location ?? (params.isKeypad ? 3 : 0),
    repeat: params.autoRepeat ?? false, ...flags, bubbles: true, composed: true, cancelable: true,
    keyCode: type === 'keypress' ? charCode : keyCode, charCode, which: type === 'keypress' ? charCode : keyCode,
  }));
}

function activateKeyboard(window, target, flags) {
  if (!target?.isConnected || target.matches?.(':disabled')) return;
  installInput(window);
  // Dispatch through the host event path so canceling click still prevents the
  // element's existing activation default (form submission, reset or a link).
  dispatchDriverEvent(target, new window.PointerEvent('click', {
    bubbles: true, cancelable: true, composed: true, view: window,
    button: 0, buttons: 0, detail: 0, ...flags, pointerId: -1, pointerType: '', isPrimary: false,
  }));
}

function enterDefault(window, target, flags) {
  if (!target?.isConnected || target.matches?.(':disabled') || editableRoot(target)) return;
  if (target.localName === 'button' || (target.localName === 'input' && ['submit', 'image', 'reset', 'button'].includes(target.type)) ||
      (target.localName === 'a' && target.hasAttribute('href'))) {
    activateKeyboard(window, target, flags); return;
  }
  if (target.localName !== 'input' || !IMPLICIT_TYPES.has(target.type) || !target.form) return;
  const form = target.form;
  const implementation = implForWrapper(form);
  const controls = implementation._getSubmittableElementNodes();
  const submitter = controls.find(isSubmitButton);
  if (submitter) {
    // A disabled first submit button blocks implicit submission; it does not
    // transfer its default-button status to the next enabled button.
    activateKeyboard(window, wrapperForImpl(submitter), flags);
    return;
  }
  const blockers = controls.filter(control => control._localName === 'input' && IMPLICIT_TYPES.has(control.type));
  if (blockers.length <= 1) implementation.requestSubmit();
}

function keyEvent(window, params) {
  if (!KEY_TYPES.has(params.type)) throw invalid('Invalid key event type');
  for (const key of ['key', 'code', 'text', 'unmodifiedText', 'keyIdentifier']) {
    if (params[key] !== undefined && typeof params[key] !== 'string') throw invalid(`${key} must be a string`);
  }
  for (const key of ['modifiers', 'windowsVirtualKeyCode', 'nativeVirtualKeyCode', 'location']) {
    if (params[key] !== undefined && !Number.isInteger(params[key])) throw invalid(`${key} must be an integer`);
  }
  if (params.modifiers !== undefined && (params.modifiers < 0 || params.modifiers > 15)) throw invalid('Invalid key modifiers');
  if (params.location !== undefined && (params.location < 0 || params.location > 3)) throw invalid('Invalid key location');
  for (const key of ['autoRepeat', 'isKeypad', 'isSystemKey']) {
    if (params[key] !== undefined && typeof params[key] !== 'boolean') throw invalid(`${key} must be a boolean`);
  }
  if (params.commands !== undefined && (!Array.isArray(params.commands) || params.commands.some(command => command !== 'selectAll'))) {
    throw invalid('Unsupported editing command');
  }
  const flags = modifiers(params.modifiers);
  let target = focused(window);
  if (params.type === 'keyUp') { dispatchKeyboard(window, target, 'keyup', params, flags); return; }
  if (params.type !== 'char' && !dispatchKeyboard(window, target, 'keydown', params, flags)) return;
  target = focused(window);
  if (params.type !== 'char' && params.key === 'Escape') { requestDialogClose(window); return; }
  if (params.type !== 'char' && params.key === 'Tab') {
    if (!flags.altKey && !flags.ctrlKey && !flags.metaKey) advanceFocus(window, flags.shiftKey);
    return;
  }
  const current = model(window, target);
  const accelerator = (flags.ctrlKey && !flags.altKey) || flags.metaKey;
  if (current && (params.commands?.includes('selectAll') || (accelerator && params.key?.toLowerCase() === 'a'))) {
    setSelection(window, current, 0, current.value.length); return;
  }
  if (current) {
    const movement = selectionForKey(current, params.key, flags);
    if (movement) { setSelection(window, current, movement.start, movement.end, movement.direction); return; }
  }
  if (params.key === 'Backspace' || params.key === 'Delete') {
    changeText(window, target, '', params.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward',
      { deletion: true, forward: params.key === 'Delete', word: accelerator });
    return;
  }
  if (params.type === 'rawKeyDown' || accelerator) return;
  const text = params.text ?? '';
  if (!text) { if (params.type === 'char') dispatchKeyboard(window, target, 'keypress', params, flags); return; }
  if (!dispatchKeyboard(window, target, 'keypress', params, flags)) return;
  target = focused(window);
  const isEnter = params.key === 'Enter' || /^[\r\n]+$/.test(text);
  const editable = model(window, target);
  if (isEnter && !(editable?.kind === 'editable' || target.localName === 'textarea')) {
    enterDefault(window, target, flags); return;
  }
  changeText(window, target, isEnter ? '\n' : text, isEnter ? 'insertLineBreak' : 'insertText');
}

function pointerState(window) {
  let state = POINTER_STATES.get(window);
  if (!state) { state = { buttons: 0, pressed: new Map() }; POINTER_STATES.set(window, state); }
  return state;
}

function commonTarget(first, second) {
  if (!first?.isConnected || !second?.isConnected) return null;
  for (let node = first; node; node = node.parentElement) if (node === second || node.contains(second)) return node;
  return null;
}

function disabledControl(target) {
  const control = target.closest?.('button,input,select,textarea,option,optgroup');
  return control?.matches(':disabled') ?? false;
}

function focusFromPointer(window, target) {
  for (let node = target; node; node = node.parentElement) {
    if (node.matches?.('button,input,select,textarea,a[href],area[href],iframe,[tabindex],[contenteditable]') && !node.matches(':disabled')) {
      node.focus?.();
      if (window.document.activeElement === node) return;
    }
  }
  const active = window.document.activeElement;
  if (active && active !== window.document.body && active !== window.document.documentElement) active.blur?.();
}

function mouseInit(params, button, buttons, detail, precise = false) {
  const x = precise ? params.x : Math.trunc(params.x);
  const y = precise ? params.y : Math.trunc(params.y);
  return { bubbles: true, composed: true, cancelable: true, ...modifiers(params.modifiers),
    clientX: x, clientY: y, screenX: x, screenY: y, button, buttons, detail };
}

function pointerEvent(window, target, type, params, button, buttons, { detail = 0, precise = true } = {}) {
  const event = new window.PointerEvent(type, {
    ...mouseInit(params, button, buttons, detail, precise), pointerId: 1, isPrimary: true,
    pointerType: params.pointerType ?? 'mouse', pressure: params.force ?? (buttons ? 0.5 : 0),
    tangentialPressure: params.tangentialPressure ?? 0, tiltX: params.tiltX ?? 0,
    tiltY: params.tiltY ?? 0, twist: params.twist ?? 0,
  });
  // CDP pointer motion and presses retain device precision independently of
  // MouseEvent's public dictionary conversion. Clicks keep integer coordinates.
  if (precise) {
    const implementation = implForWrapper(event);
    implementation.clientX = implementation.screenX = params.x;
    implementation.clientY = implementation.screenY = params.y;
  }
  return dispatchDriverEvent(target, event);
}

function mouseEvent(window, target, type, params, button, buttons, detail = 0) {
  return dispatchDriverEvent(target, new window.MouseEvent(type, mouseInit(params, button, buttons, detail)));
}

function scrollWheelDefault(window, target, deltaX, deltaY) {
  const changed = new Set();
  for (const [axis, delta] of [['X', deltaX], ['Y', deltaY]]) {
    if (!delta) continue;
    for (let node = target; node; node = node.parentElement) {
      const scrollSize = axis === 'X' ? node.scrollWidth : node.scrollHeight;
      const clientSize = axis === 'X' ? node.clientWidth : node.clientHeight;
      if (!Number.isFinite(scrollSize) || !Number.isFinite(clientSize) || clientSize <= 0 || scrollSize <= clientSize) continue;
      const style = window.getComputedStyle(node);
      const overflow = (axis === 'X' ? style.overflowX : style.overflowY) || style.overflow;
      if (!/^(auto|scroll|overlay)$/.test(overflow) && node !== window.document.scrollingElement) continue;
      const property = axis === 'X' ? 'scrollLeft' : 'scrollTop';
      const current = Number(node[property]) || 0;
      const next = Math.max(0, Math.min(scrollSize - clientSize, current + delta));
      if (current === next) continue; // Let an ancestor consume remaining wheel movement.
      node[property] = next;
      changed.add(node);
      break;
    }
  }
  for (const node of changed) dispatchDriverEvent(node, new window.Event('scroll'));
}

function dispatchMouse(window, params) {
  if (!MOUSE_TYPES.has(params.type)) throw invalid('Invalid mouse event type');
  for (const name of ['x', 'y']) if (typeof params[name] !== 'number' || !Number.isFinite(params[name])) throw invalid(`${name} must be finite`);
  if (params.button !== undefined && !Object.hasOwn(BUTTONS, params.button)) throw invalid('Invalid mouse button');
  for (const [name, maximum] of [['modifiers', 15], ['buttons', 31], ['clickCount', 2147483647]]) {
    if (params[name] !== undefined && (!Number.isInteger(params[name]) || params[name] < 0 || params[name] > maximum)) throw invalid(`Invalid ${name}`);
  }
  for (const name of ['deltaX', 'deltaY', 'force', 'tangentialPressure', 'tiltX', 'tiltY', 'twist']) {
    if (params[name] !== undefined && (typeof params[name] !== 'number' || !Number.isFinite(params[name]))) throw invalid(`Invalid ${name}`);
  }
  for (const [name, minimum, maximum] of [['force', 0, 1], ['tangentialPressure', -1, 1], ['tiltX', -90, 90], ['tiltY', -90, 90], ['twist', 0, 359]]) {
    if (params[name] !== undefined && (params[name] < minimum || params[name] > maximum)) throw invalid(`Invalid ${name}`);
  }
  if (params.twist !== undefined && !Number.isInteger(params.twist)) throw invalid('Invalid twist');
  if (params.pointerType !== undefined && !['mouse', 'pen'].includes(params.pointerType)) throw invalid('Invalid pointerType');
  if (typeof window.document.elementFromPoint !== 'function') throw invalid('Mouse input requires document.elementFromPoint hit testing', -32601);
  const state = pointerState(window);
  const button = BUTTONS[params.button ?? 'none'];
  const bit = BUTTON_BITS[button];
  const buttons = params.buttons ?? (params.type === 'mousePressed' ? state.buttons | bit : params.type === 'mouseReleased' ? state.buttons & ~bit : state.buttons);
  state.buttons = buttons;
  if (params.x < 0 || params.y < 0) {
    if (params.type === 'mouseReleased') state.pressed.delete(button);
    return;
  }
  const target = window.document.elementFromPoint(params.x, params.y) ?? window.document.documentElement;
  if (!target || target.nodeType !== 1 || target.ownerDocument !== window.document) throw invalid('Hit testing did not return a document element');
  installInput(window);
  const detail = params.clickCount ?? 0;
  if (params.type === 'mouseMoved') {
    pointerEvent(window, target, 'pointermove', params, -1, buttons);
    mouseEvent(window, target, 'mousemove', params, 0, buttons);
    return;
  }
  if (params.type === 'mouseWheel') {
    const deltaX = params.deltaX ?? 0, deltaY = params.deltaY ?? 0;
    const allowed = dispatchDriverEvent(target, new window.WheelEvent('wheel', {
      ...mouseInit(params, button, buttons, 0), deltaX, deltaY, deltaZ: 0, deltaMode: 0,
    }));
    if (allowed) scrollWheelDefault(window, target, deltaX, deltaY);
    return;
  }
  if (params.type === 'mousePressed') {
    const allowed = pointerEvent(window, target, 'pointerdown', params, button, buttons);
    const disabled = disabledControl(target);
    state.pressed.set(button, { target, suppressMouse: !allowed || disabled, disabled });
    if (allowed && !disabled && mouseEvent(window, target, 'mousedown', params, button, buttons, detail)) focusFromPointer(window, target);
    if (button === 2 && !disabled) pointerEvent(window, target, 'contextmenu', params, button, buttons, { precise: false });
    return;
  }
  const pressed = state.pressed.get(button);
  state.pressed.delete(button);
  pointerEvent(window, target, 'pointerup', params, button, buttons);
  if (!pressed?.suppressMouse && !disabledControl(target)) mouseEvent(window, target, 'mouseup', params, button, buttons, detail);
  const clicked = commonTarget(pressed?.target, target);
  if (!clicked || detail === 0 || pressed.disabled || disabledControl(clicked)) return;
  pointerEvent(window, clicked, button === 0 ? 'click' : 'auxclick', params, button, buttons, { detail, precise: false });
  if (button === 0 && detail === 2) mouseEvent(window, clicked, 'dblclick', params, button, buttons, detail);
}

export function runInput(session, method, params = {}) {
  if (!supportsInput(method)) throw invalid(`Unsupported CDP method: ${method}`, -32601);
  if (session.page.closed) throw invalid('Page is closed');
  const window = method === 'Input.dispatchMouseEvent' ? session.page.dom.window : keyboardWindow(session.page);
  if (method === 'Input.insertText') {
    if (typeof params.text !== 'string') throw invalid('text must be a string');
    changeText(window, focused(window), params.text, 'insertText');
  } else if (method === 'Input.dispatchMouseEvent') dispatchMouse(window, params);
  else keyEvent(window, params);
  return {};
}
