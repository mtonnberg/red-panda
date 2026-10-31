import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const focusing = require('jsdom/lib/jsdom/living/helpers/focusing.js');
const { isDisabled, isInteractiveContent } = require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const LabelImpl = require('jsdom/lib/jsdom/living/nodes/HTMLLabelElement-impl.js').implementation;
const DOCUMENTS = new WeakSet();
// A frame in its parent's focus chain is a browsing-context proxy. It only
// receives its own focus/blur events when it was explicitly focused as a leaf.
const FRAME_PROXIES = new WeakSet();
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

function topDocument(document) {
  const seen = new Set();
  while (document?._defaultView?._frameElement && !seen.has(document)) {
    seen.add(document); document = document._defaultView._frameElement._ownerDocument;
  }
  return document;
}

function focusedChain(document) {
  const entries = [], seen = new Set(); let leaf = null;
  while (document && !seen.has(document)) {
    seen.add(document);
    const element = document._lastFocusedElement;
    if (!element) break;
    const child = ['iframe', 'frame'].includes(element._localName) ? element._contentDocument : null;
    const proxy = Boolean(child && (FRAME_PROXIES.has(element) || child._lastFocusedElement));
    entries.push({ document, element, proxy });
    if (!proxy) { leaf = element; break; }
    document = child;
  }
  return { entries, leaf };
}

function desiredChain(element) {
  const entries = [{ document: element._ownerDocument, element, proxy: false }], seen = new Set();
  for (let document = element._ownerDocument; document?._defaultView?._frameElement && !seen.has(document);) {
    seen.add(document);
    const frame = document._defaultView._frameElement;
    entries.unshift({ document: frame._ownerDocument, element: frame, proxy: true }); document = frame._ownerDocument;
  }
  return entries;
}

function clearEntries(entries) {
  for (const { document, element } of entries) {
    if (document._lastFocusedElement === element) document._lastFocusedElement = null;
    FRAME_PROXIES.delete(element);
  }
}

function focusEvents(element, entering, related) {
  focusing.fireFocusEventWithTargetAdjustment(entering ? 'focus' : 'blur', element, related);
  focusing.fireFocusEventWithTargetAdjustment(entering ? 'focusin' : 'focusout', element, related, { bubbles: true });
}

function focusElement(element) {
  if (!isFocusable(wrapperForImpl(element))) return;
  const desired = desiredChain(element);
  // Native checks eligibility inside the owning document. Its bounded profile
  // still permits a child control beneath a display-none or inert frame element.
  const root = topDocument(element._ownerDocument), previous = focusedChain(root);
  // Calling frame.focus() on an already active ancestor retains the child leaf.
  if (previous.entries.some(entry => entry.element === element)) return;
  let common = 0;
  while (common < previous.entries.length && common < desired.length &&
      previous.entries[common].element === desired[common].element && previous.entries[common].document === desired[common].document) common++;
  const previousLeaf = previous.leaf;
  clearEntries(previous.entries.slice(common));
  const related = previousLeaf?._ownerDocument === element._ownerDocument ? previousLeaf : null;
  if (previousLeaf && previous.entries.length > common) {
    focusEvents(previousLeaf, false, related ? element : null);
  }
  for (const entry of desired) {
    entry.document._lastFocusedElement = entry.element;
    if (entry.proxy) FRAME_PROXIES.add(entry.element);
    else FRAME_PROXIES.delete(entry.element);
  }
  focusEvents(element, true, related);
  element._ownerDocument.getSelection().collapse(element, 0);
}

function blurElement(element) {
  const previous = focusedChain(topDocument(element._ownerDocument));
  const index = previous.entries.findIndex(entry => entry.element === element);
  if (index < 0) return;
  clearEntries(previous.entries.slice(index));
  if (previous.leaf) {
    focusEvents(previous.leaf, false, null);
    previous.leaf._ownerDocument.getSelection().empty();
  }
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
    for (const name of ['HTMLElement', 'SVGElement']) {
      const prototype = require(`jsdom/lib/jsdom/living/nodes/${name}-impl.js`).implementation.prototype;
      const originalFocus = prototype.focus;
      const originalBlur = prototype.blur;
      prototype.focus = function (...args) {
        if (!DOCUMENTS.has(this._ownerDocument)) return originalFocus.apply(this, args);
        const root = this._shadowRoot;
        if (root && wrapperForImpl(root).delegatesFocus) {
          for (const candidate of wrapperForImpl(root).querySelectorAll('*')) {
            const target = implForWrapper(candidate);
            if (focusing.isFocusableAreaElement(target)) { target.focus(); return; }
          }
        }
        return focusElement(this);
      };
      prototype.blur = function (...args) {
        if (!DOCUMENTS.has(this._ownerDocument)) return originalBlur.apply(this, args);
        return blurElement(this);
      };
    }
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
