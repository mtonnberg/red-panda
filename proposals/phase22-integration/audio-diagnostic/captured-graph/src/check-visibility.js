// Independent native-profile visibility checks over real DOM/computed styles.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Element = require('jsdom/lib/jsdom/living/generated/Element.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const installed = new WeakMap();

function check(element, options) {
  const document = element.ownerDocument, view = document?.defaultView;
  if (!view || view.document !== document) return false;
  // visibility is inherited through genuine slot/host state by the stylesheet
  // adapter. A visible descendant can override a hidden ancestor.
  if (options.visibility && ['hidden', 'collapse'].includes(view.getComputedStyle(element).visibility)) return false;
  for (let current = element; current;) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || (options.opacity && style.opacity === '0')) return false;
    const implementation = implForWrapper(current);
    if (implementation._assignedSlot) { current = wrapperForImpl(implementation._assignedSlot); continue; }
    const parent = current.parentElement;
    if (parent) {
      // An unassigned light child of a real shadow host and a replaced slot
      // fallback have no place in the composed tree. Inspect real internal
      // assignment so closed-root privacy does not change visibility.
      if (implForWrapper(parent)._shadowRoot) return false;
      if (parent.localName === 'slot' && parent.namespaceURI === 'http://www.w3.org/1999/xhtml' && implForWrapper(parent)._assignedNodes?.length) return false;
      current = parent;
    } else current = current.getRootNode().host ?? null;
  }
  return true;
}

function factory(g, bridge) {
  return function checkVisibility(options = undefined) {
    if (!bridge.isElement(this)) throw new g.TypeError('Illegal invocation');
    if (options !== null && options !== undefined && typeof options !== 'object' && typeof options !== 'function') throw new g.TypeError('invalid argument');
    // Native reads all supported dictionary members, in this order, even if a
    // previous option is true or display:none will determine the result.
    const checkOpacity = !!options?.checkOpacity;
    const checkVisibilityCSS = !!options?.checkVisibilityCSS;
    const opacityProperty = !!options?.opacityProperty;
    const visibilityProperty = !!options?.visibilityProperty;
    return bridge.check(this, { opacity: checkOpacity || opacityProperty, visibility: checkVisibilityCSS || visibilityProperty });
  };
}

export function installCheckVisibility(page, window) {
  if (installed.has(window)) return installed.get(window);
  const method = window.eval(`(${factory.toString()})`)(window, { isElement: Element.is, check });
  Object.defineProperty(window.Element.prototype, 'checkVisibility', { value: method, writable: true, enumerable: true, configurable: true });
  const controller = { method }; installed.set(window, controller); return controller;
}
