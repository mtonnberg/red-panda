import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const focusing = require('jsdom/lib/jsdom/living/helpers/focusing.js');
const { isDisabled, isInteractiveContent } = require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const LabelImpl = require('jsdom/lib/jsdom/living/nodes/HTMLLabelElement-impl.js').implementation;
const DOCUMENTS = new WeakSet();
const HTML = 'http://www.w3.org/1999/xhtml';
const originalFocusable = focusing.isFocusableAreaElement;
let patched = false;

function editing(element) {
  for (let current = element; current; current = current.parentElement) {
    const value = current.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return false;
    if (value === '' || value === 'true' || value === 'plaintext-only') return true;
  }
  return element?.ownerDocument?.designMode?.toLowerCase() === 'on';
}

function editingHost(element) {
  return editing(element) && !editing(element.parentElement);
}

function nativeKind(element) {
  if (['button', 'input', 'select', 'textarea', 'iframe'].includes(element.localName)) return true;
  if (['a', 'area'].includes(element.localName)) return element.hasAttribute('href');
  return element.localName === 'summary' && element.parentElement?.localName === 'details' &&
    [...element.parentElement.children].find(child => child.localName === 'summary') === element;
}

function renderedAndInteractive(element) {
  const window = element.ownerDocument?.defaultView;
  if (!window || !element.isConnected) return false;
  for (let current = element; current;) {
    if (current.hasAttribute('inert') || window.getComputedStyle(current).display === 'none') return false;
    // A shadow host can hide or make its descendants inert even though it is
    // outside their parentElement chain.
    current = current.parentElement ?? current.getRootNode()?.host ?? null;
  }
  return !isDisabled(implForWrapper(element)) && !(element.localName === 'input' && element.type === 'hidden');
}

export function isFocusable(element) {
  if (!element || element.nodeType !== 1 || !renderedAndInteractive(element)) return false;
  const implementation = implForWrapper(element);
  if (element.namespaceURI !== HTML) return originalFocusable(implementation);
  const explicit = !Number.isNaN(Number.parseInt(element.getAttribute('tabindex'), 10));
  if (explicit || nativeKind(element) || editingHost(element)) return true;
  return false;
}

function installProperties(window) {
  const prototype = window.HTMLElement.prototype;
  if (!('inert' in prototype)) Object.defineProperty(prototype, 'inert', {
    configurable: true, enumerable: true,
    get() { return this.hasAttribute('inert'); },
    set(value) { this.toggleAttribute('inert', Boolean(value)); },
  });
  if (!('contentEditable' in prototype)) Object.defineProperty(prototype, 'contentEditable', {
    configurable: true, enumerable: true,
    get() {
      const value = this.getAttribute('contenteditable')?.toLowerCase();
      if (value === '') return 'true';
      return ['true', 'false', 'plaintext-only'].includes(value) ? value : 'inherit';
    },
    set(value) {
      const normalized = String(value).toLowerCase();
      if (!['true', 'false', 'plaintext-only', 'inherit'].includes(normalized)) {
        throw new window.DOMException('Invalid contentEditable value', 'SyntaxError');
      }
      this.setAttribute('contenteditable', normalized);
    },
  });
  if (!('isContentEditable' in prototype)) Object.defineProperty(prototype, 'isContentEditable', {
    configurable: true, enumerable: true, get() { return editing(this); },
  });
}

export function installFocus(window) {
  if (!window?.document) throw new TypeError('Focus requires a document window');
  if (!patched) {
    patched = true;
    focusing.isFocusableAreaElement = implementation => {
      if (!DOCUMENTS.has(implementation._ownerDocument)) return originalFocusable(implementation);
      // jsdom uses this predicate for blur as well. A focused control that was
      // just hidden or disabled must still be able to relinquish focus.
      if (implementation._ownerDocument._lastFocusedElement === implementation) return true;
      return isFocusable(wrapperForImpl(implementation));
    };
    const originalActivation = LabelImpl.prototype._activationBehavior;
    LabelImpl.prototype._activationBehavior = function (event) {
      if (!DOCUMENTS.has(this._ownerDocument)) return originalActivation.call(this, event);
      const control = this.control;
      if (!control || isDisabled(control)) return;
      const label = wrapperForImpl(this);
      const target = wrapperForImpl(event.target);
      const wrapper = wrapperForImpl(control);
      if (target && wrapper.contains(target)) return;
      for (let node = target; node && node !== label; node = node.parentElement) {
        if (node.nodeType === 1 && isInteractiveContent(implForWrapper(node))) return;
      }
      if (isFocusable(wrapper)) control.focus();
      const window = wrapper.ownerDocument.defaultView;
      const Constructor = window.PointerEvent ?? window.MouseEvent;
      const forwarded = implForWrapper(new Constructor('click', {
        bubbles: true, cancelable: true, composed: true, view: window,
        detail: 0, button: 0, pointerId: -1, pointerType: '',
      }));
      // This is still ordinary host activation: _dispatch runs pre-activation,
      // cancellation and defaults. Preserve whether the originating click was
      // trusted rather than upgrading a page-created click to driver input.
      forwarded.isTrusted = event.isTrusted;
      control._dispatch(forwarded);
    };
  }
  DOCUMENTS.add(implForWrapper(window.document));
  installProperties(window);
}

function sequentialIndex(element) {
  const attribute = element.getAttribute('tabindex');
  if (attribute !== null && !Number.isNaN(Number.parseInt(attribute, 10))) return element.tabIndex;
  return 0;
}

// The browser has one top-level keyboard traversal cycle. Frame documents and
// shadow-root traversal are separate contexts and are not flattened here.
export function advanceFocus(window, backwards = false) {
  const document = window.document;
  const candidates = [...document.querySelectorAll('*')].filter(element => isFocusable(element) && sequentialIndex(element) >= 0);
  const order = candidates.map((element, index) => ({ element, index, tab: sequentialIndex(element) }))
    .sort((a, b) => (a.tab > 0 ? a.tab : Infinity) - (b.tab > 0 ? b.tab : Infinity) || a.index - b.index)
    .map(entry => entry.element);
  if (!order.length) { document.activeElement?.blur(); return null; }
  const active = document.activeElement;
  const current = order.indexOf(active);
  let next;
  if (current >= 0) next = order[(current + (backwards ? -1 : 1) + order.length) % order.length];
  else if (active && active !== document.body && active !== document.documentElement && sequentialIndex(active) < 0) {
    const normal = order.filter(element => sequentialIndex(element) === 0);
    next = backwards ? normal.at(-1) ?? order.at(-1) : normal[0] ?? order[0];
  } else next = backwards ? order.at(-1) : order[0];
  next.focus();
  return document.activeElement;
}
