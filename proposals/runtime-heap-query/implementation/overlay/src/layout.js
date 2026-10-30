import { registerHeapWrapper } from './heap-registry.js';
// Independent surrogate geometry for a headless DOM. This intentionally models
// the reference's measured simple boxes; it is not a CSS layout renderer.
import { getStyleRevision } from './styles.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const ZERO = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
const hiddenTags = new Set(['head', 'style', 'script', 'template', 'meta', 'link', 'title', 'base']);
const blockTags = new Set(['html', 'body', 'div', 'p', 'main', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'form', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote']);

function dimension(value) {
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i.test(value.trim())) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function rectValue(x, y, width, height) {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
}

function optionDimension(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return value;
}

export function createLayout(window, options = {}) {
  const rawComputedStyle = options.getComputedStyle ?? window.getComputedStyle.bind(window);
  let width = optionDimension(options.width ?? 1920, 'Viewport width');
  let height = optionDimension(options.height ?? 1080, 'Viewport height');
  let scrollX = 0, scrollY = 0;
  let cachedKey, cached;
  const identities = new WeakMap();
  let nextIdentity = 1;

  function snapshot() {
    const document = window.document;
    const nodes = [], order = new Map(), computed = new Map(), hidden = new Map(), sizes = new Map(), positions = new Map();
    const stack = [document], shadowRoots = [], tokens = [width, height, getStyleRevision(window)];
    while (stack.length || shadowRoots.length) {
      if (!stack.length) stack.push(shadowRoots.shift());
      const node = stack.pop();
      if (!identities.has(node)) identities.set(node, nextIdentity++);
      order.set(node, nodes.length); nodes.push(node);
      tokens.push(identities.get(node), node.nodeType, node.nodeValue);
      if (node.attributes) tokens.push([...node.attributes].flatMap(attribute => [attribute.name, attribute.value]));
      const shadow = implForWrapper(node)?._shadowRoot;
      if (shadow) shadowRoots.push(wrapperForImpl(shadow));
      for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push(node.childNodes[index]);
    }
    for (const sheet of document.styleSheets) {
      try { tokens.push([...sheet.cssRules].map(rule => rule.cssText)); } catch { tokens.push(null); }
    }
    const key = JSON.stringify(tokens);
    if (key === cachedKey) return cached;
    let documentHeight = nodes.length * 5;
    const style = node => {
      if (!computed.has(node)) computed.set(node, rawComputedStyle(node));
      return computed.get(node);
    };
    function isHidden(node) {
      if (hidden.has(node)) return hidden.get(node);
      const parent = node.parentNode ?? node.host;
      const ancestorHidden = parent && hidden.get(parent);
      const ownHidden = node.nodeType === 1 && (hiddenTags.has(node.localName) || node.hidden || style(node).display === 'none');
      const result = Boolean(ancestorHidden || ownHidden);
      hidden.set(node, result); return result;
    }
    function size(node) {
      if (sizes.has(node)) return sizes.get(node);
      let value;
      if (isHidden(node) || ![1, 3, 9].includes(node.nodeType)) value = ZERO;
      else if (node.nodeType === 3) value = /\S/.test(node.data) ? { width: 5, height: 5 } : { width: 0, height: 5 };
      else if (node.nodeType === 9) value = { width, height: documentHeight };
      else {
        const declaration = style(node);
        const explicitWidth = dimension(declaration.width);
        const explicitHeight = dimension(declaration.height);
        let childHeight = 0;
        for (const child of node.childNodes) childHeight += sizes.get(child)?.height ?? 0;
        childHeight = Math.max(5, childHeight);
        let advance = 0;
        for (const child of node.childNodes) advance += sizes.get(child)?.advance ?? sizes.get(child)?.width ?? 0;
        advance = explicitWidth ?? Math.max(5, advance);
        const block = blockTags.has(node.localName) && !['inline', 'inline-block'].includes(declaration.display);
        value = {
          advance,
          width: explicitWidth ?? (block ? width : advance),
          height: explicitHeight ?? (['html', 'body'].includes(node.localName) ? documentHeight : childHeight),
        };
      }
      sizes.set(node, value); return value;
    }
    function position(node) {
      if (positions.has(node)) return positions.get(node);
      if (isHidden(node)) { positions.set(node, ZERO); return ZERO; }
      const parent = node.parentNode ?? node.host;
      const parentX = parent ? positions.get(parent).x : 0;
      let x = parentX;
      for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) x += size(sibling).advance ?? size(sibling).width;
      const value = rectValue(x, order.get(node) * 5, size(node).width, size(node).height);
      positions.set(node, value); return value;
    }
    for (const node of nodes) isHidden(node);
    // Native document extents differ from individual computed boxes. The
    // measured root uses inline child advances and nested inline overflow;
    // stylesheet-only dimensions still affect individual element rectangles.
    let directHeight = 0;
    for (const child of document.body?.childNodes ?? []) {
      if (!isHidden(child)) directHeight += dimension(child.style?.height) ?? 5;
    }
    documentHeight = Math.max(documentHeight, directHeight);
    for (const node of nodes) {
      const inlineHeight = dimension(node.style?.height);
      if (inlineHeight !== undefined && !isHidden(node) && node.parentNode !== document.body && !['html', 'body'].includes(node.localName)) {
        documentHeight = Math.max(documentHeight, order.get(node) * 5 + inlineHeight);
      }
    }
    for (let index = nodes.length - 1; index >= 0; index--) size(nodes[index]);
    for (const node of nodes) position(node);
    function record(node) {
      if (!order.has(node) || isHidden(node)) return { rect: rectValue(0, 0, 0, 0), rendered: false };
      return { rect: position(node), rendered: true };
    }
    cachedKey = key;
    cached = { nodes, style, record };
    return cached;
  }

  function viewportRect(value) { return rectValue(value.x - scrollX, value.y - scrollY, value.width, value.height); }
  function rect(node) { const value = snapshot().record(node); return value.rendered ? viewportRect(value.rect) : value.rect; }
  function rects(node) { const value = snapshot().record(node); return value.rendered ? [viewportRect(value.rect)] : []; }
  function quads(node) {
    const value = rect(node);
    return [[value.left, value.top, value.right, value.top, value.right, value.bottom, value.left, value.bottom]];
  }
  function boxModel(node) {
    const value = rect(node), quad = [value.left, value.top, value.right, value.top, value.right, value.bottom, value.left, value.bottom];
    return { content: [...quad], padding: [...quad], border: [...quad], margin: [...quad], width: Math.trunc(value.width), height: Math.trunc(value.height) };
  }
  function elementsFromPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return [];
    const state = snapshot();
    return state.nodes.filter(node => {
      if (node.nodeType !== 1) return false;
      // Document hit testing retargets shadow content to its host. Shadow
      // rectangles remain available to privileged geometry/observer consumers.
      if (node.getRootNode() !== window.document) return false;
      const record = state.record(node), { rendered } = record, box = viewportRect(record.rect);
      const declaration = state.style(node);
      return rendered && declaration.visibility !== 'hidden' && declaration.visibility !== 'collapse' && declaration.pointerEvents !== 'none' &&
        box.width > 0 && box.height > 0 && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    }).reverse();
  }
  function hitTest(x, y) { return elementsFromPoint(x, y)[0] ?? null; }
  function intersection(node) {
    const bounds = rect(node);
    const left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
    const right = Math.min(width, bounds.right), bottom = Math.min(height, bounds.bottom);
    const intersectionRect = rectValue(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    const area = bounds.width * bounds.height;
    const isIntersecting = area > 0 && intersectionRect.width > 0 && intersectionRect.height > 0;
    return { boundingClientRect: bounds, intersectionRect, rootBounds: rectValue(0, 0, width, height), isIntersecting,
      intersectionRatio: area > 0 ? intersectionRect.width * intersectionRect.height / area : 0 };
  }
  function scrollTo(x = 0, y = 0) {
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const extent = documentSize();
    const nextX = Math.min(Math.max(0, number(x)), Math.max(0, extent.width - width));
    const nextY = Math.min(Math.max(0, number(y)), Math.max(0, extent.height - height));
    const changed = nextX !== scrollX || nextY !== scrollY;
    scrollX = nextX; scrollY = nextY;
    if (changed) window.dispatchEvent(new window.Event('scroll'));
  }
  function scrollIntoView(node, region) {
    const value = snapshot().record(node);
    if (!value.rendered) return;
    const box = rect(node);
    const offset = region?.y ?? 0, regionHeight = region?.height ?? box.height;
    if (box.top + offset < 0 || box.top + offset + regionHeight > height) scrollTo(scrollX, value.rect.y + offset);
  }
  function documentSize() {
    const state = snapshot();
    let documentWidth = width;
    for (const node of state.nodes) documentWidth = Math.max(documentWidth, state.record(node).rect.width);
    return { width: documentWidth,
      height: Math.max(height, state.record(window.document.documentElement).rect.height) };
  }
  return {
    rect, rects, quads, boxModel, elementsFromPoint, hitTest, intersection, scrollTo, scrollIntoView,
    scrollBy(x, y) { scrollTo(scrollX + Number(x || 0), scrollY + Number(y || 0)); },
    get scroll() { return { x: scrollX, y: scrollY }; },
    get documentSize() { return documentSize(); },
    get viewport() { return { width, height }; },
    setViewport(viewport) {
      const nextWidth = optionDimension(viewport.width ?? width, 'Viewport width');
      const nextHeight = optionDimension(viewport.height ?? height, 'Viewport height');
      width = nextWidth; height = nextHeight; scrollTo(scrollX, scrollY);
    },
    // Used by the window adapter without recursively reading its own overrides.
    rawComputedStyle,
  };
}

function clientRectList(window, values) {
  const list = { length: values.length, item: index => values[index] ?? null, [Symbol.iterator]: function* () { yield* values; } };
  values.forEach((value, index) => { list[index] = value; });
  Object.defineProperty(list, Symbol.toStringTag, { value: 'DOMRectList' });
  return list;
}

export function installLayout(page, window, options = {}) {
  const layout = createLayout(window, options);
  const domRect = value => new window.DOMRect(value.x, value.y, value.width, value.height);
  const define = (target, name, descriptor) => Object.defineProperty(target, name, { configurable: true, enumerable: true, ...descriptor });
  define(window.Element.prototype, 'getBoundingClientRect', { writable: true, value() { return domRect(layout.rect(this)); } });
  define(window.Element.prototype, 'getClientRects', { writable: true, value() { return clientRectList(window, layout.rects(this).map(domRect)); } });
  for (const [name, dimension] of [['offsetWidth', 'width'], ['offsetHeight', 'height']]) {
    define(window.HTMLElement.prototype, name, { get() { return Math.trunc(layout.rect(this)[dimension]); } });
  }
  for (const [name, dimension] of [['clientWidth', 'width'], ['clientHeight', 'height']]) {
    define(window.Element.prototype, name, { get() { return Math.trunc(this === window.document.documentElement ? layout.viewport[dimension] : layout.rect(this)[dimension]); } });
  }
  for (const [name, dimension] of [['scrollWidth', 'width'], ['scrollHeight', 'height']]) {
    define(window.Element.prototype, name, { get() { return Math.trunc(this === window.document.documentElement ? layout.documentSize[dimension] : layout.rect(this)[dimension]); } });
  }
  define(window.Document.prototype, 'elementFromPoint', { writable: true, value(x, y) { return layout.hitTest(Number(x), Number(y)); } });
  define(window.Document.prototype, 'elementsFromPoint', { writable: true, value(x, y) { return layout.elementsFromPoint(Number(x), Number(y)); } });
  define(window, 'innerWidth', { get: () => layout.viewport.width });
  define(window, 'innerHeight', { get: () => layout.viewport.height });
  for (const [name, axis] of [['scrollX', 'x'], ['pageXOffset', 'x'], ['scrollY', 'y'], ['pageYOffset', 'y']]) define(window, name, { get: () => layout.scroll[axis] });
  const scrollArguments = (x, y) => typeof x === 'object' && x !== null ? [x.left ?? layout.scroll.x, x.top ?? layout.scroll.y] : [x, y];
  window.scroll = window.scrollTo = (x, y) => layout.scrollTo(...scrollArguments(x, y));
  window.scrollBy = (x, y) => layout.scrollBy(...(typeof x === 'object' && x !== null ? [x.left ?? 0, x.top ?? 0] : [x, y]));
  define(window.Element.prototype, 'scrollIntoView', { writable: true, value() { layout.scrollIntoView(this); } });
  define(window.Element.prototype, 'scrollIntoViewIfNeeded', { writable: true, value() { layout.scrollIntoView(this); } });
  window.getComputedStyle = (node, pseudoElement) => {
    const original = layout.rawComputedStyle(node, pseudoElement);
    const computed = name => {
      if (name === 'width' || name === 'height') {
        return layout.rects(node).length ? `${layout.rect(node)[name]}px` : 'auto';
      }
      return original.getPropertyValue(name);
    };
    return registerHeapWrapper(new Proxy(original, {
      get(target, property) {
        if (property === 'width' || property === 'height') return computed(property);
        if (property === 'getPropertyValue') return name => computed(name);
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),window,original);
  };
  page.layout = layout;
  return layout;
}
