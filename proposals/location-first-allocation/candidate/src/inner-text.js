// Independent HTMLElement text collection using real DOM/style state. The
// measured native profile uses tag-based line breaks, not a full CSS renderer.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HTMLElement = require('jsdom/lib/jsdom/living/generated/HTMLElement.js');
const ScriptElement = require('jsdom/lib/jsdom/living/generated/HTMLScriptElement.js');
const installed = new WeakMap();

// Public controls establish these simple case-pair ranges. No locale-sensitive
// or multi-character folding is imposed on the native implementation.
export function nativeTextTransform(text, mode) {
  if (mode !== 'uppercase' && mode !== 'lowercase') return text;
  const upper = mode === 'uppercase';
  return Array.from(text, character => {
    let code = character.codePointAt(0);
    const between = (a, b) => code >= a && code <= b;
    if (upper) {
      if (between(0x61,0x7a) || between(0xe0,0xf6) || between(0xf8,0xfe) || between(0x3b1,0x3c1) || between(0x3c3,0x3c9) || between(0x430,0x44f)) code -= 32;
      else if (code === 0xff) code = 0x178;
      else if (code === 0x3c2) code = 0x3a3;
      else if ((between(0x101,0x12f) || between(0x133,0x137) || between(0x14b,0x177)) && code % 2 === 1) code--;
      else if ((between(0x13a,0x148) || between(0x17a,0x17e)) && code % 2 === 0) code--;
      else if (between(0x450,0x45f)) code -= 80;
    } else {
      if (between(0x41,0x5a) || between(0xc0,0xd6) || between(0xd8,0xde) || between(0x391,0x3a1) || between(0x3a3,0x3a9) || between(0x410,0x42f)) code += 32;
      else if (code === 0x178) code = 0xff;
      else if ((between(0x100,0x12e) || between(0x132,0x136) || between(0x14a,0x176)) && code % 2 === 0) code++;
      else if ((between(0x139,0x147) || between(0x179,0x17d)) && code % 2 === 1) code++;
      else if (between(0x400,0x40f)) code += 80;
    }
    return String.fromCodePoint(code);
  }).join('');
}

const blocks = new Set(['address','article','aside','blockquote','body','caption','center','dd','details','div','dl','dt','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','html','li','main','nav','ol','optgroup','option','pre','section','select','summary','table','tr','ul']);
const nonText = new Set(['head','script','style','template','noscript']);
const replaced = new Set(['audio','canvas','embed','iframe','img','input','object','textarea','video']);
const parentElement = node => node.parentElement ?? (node.parentNode?.nodeType === 11 ? node.parentNode.host : null);

function collect(root) {
  const document = root.ownerDocument, view = document.defaultView;
  // A disconnected/non-rendered root returns its actual DOM textContent. The
  // subtree is not recursively visibility-filtered in this branch.
  if (!root.isConnected || !view || view.document !== document) return root.textContent;
  const styles = new Map();
  const style = element => {
    if (!styles.has(element)) styles.set(element, view.getComputedStyle(element));
    return styles.get(element);
  };
  for (let current = root; current; current = parentElement(current)) {
    if (style(current).display === 'none') return root.textContent;
  }
  const tokens = [];
  function visit(node, pre = false, transform = 'none') {
    if (node.nodeType === 3) { tokens.push({ text: nativeTextTransform(node.data, transform), pre }); return; }
    if (node.nodeType !== 1 || !HTMLElement.is(node)) return;
    const computed = style(node);
    if (computed.display === 'none' || replaced.has(node.localName) || nonText.has(node.localName)) return;
    const tag = node.localName, visible = !['hidden','collapse'].includes(computed.visibility);
    transform = computed.textTransform || transform;
    if (tag === 'br') { if (visible) tokens.push({ literal: '\n' }); return; }
    const required = tag === 'p' ? 2 : blocks.has(tag) ? 1 : 0;
    if (required) tokens.push({ required });
    pre ||= tag === 'pre';
    if (tag === 'tr') {
      const cells = [...node.children].filter(child => ['td','th'].includes(child.localName) && style(child).display !== 'none');
      cells.forEach((cell, index) => { if (index) tokens.push({ literal: '\t' }); visit(cell, pre, transform); });
    } else {
      for (const child of node.childNodes) {
        if (['select','optgroup'].includes(tag) && !(child.nodeType === 1 && ['option','optgroup'].includes(child.localName))) continue;
        if (child.nodeType === 3 && !visible) continue;
        visit(child, pre, transform);
      }
    }
    if (required) tokens.push({ required });
  }
  visit(root);
  let result = '', pendingSpace = false, required = 0;
  const flushBreaks = () => { if (result && required) result += '\n'.repeat(required); required = 0; pendingSpace = false; };
  for (const token of tokens) {
    if (token.required) { required = Math.max(required, token.required); pendingSpace = false; continue; }
    if (token.literal !== undefined) { flushBreaks(); result += token.literal; continue; }
    if (token.pre) { if (token.text) { flushBreaks(); result += token.text; } continue; }
    for (const character of token.text) {
      if (/[\x09-\x0d\x20]/.test(character)) { pendingSpace = true; continue; }
      if (required) flushBreaks();
      if (pendingSpace && result && !/[\n\t ]$/.test(result)) result += ' ';
      pendingSpace = false; result += character;
    }
  }
  return result;
}

function factory(g, bridge) {
  const brand = value => { if (!bridge.isHTMLElement(value)) throw new g.TypeError('Illegal invocation'); };
  const convert = value => value === null ? '' : typeof value === 'symbol' ? String(value.description) : '' + value;
  const descriptor = Object.getOwnPropertyDescriptor({
    get innerText() { brand(this); return bridge.collect(this); },
    set innerText(value) {
      brand(this);
      // The native public conversion treats a primitive Symbol as its
      // description; ordinary object-to-string conversion still rejects one.
      const text = convert(value);
      const document = this.ownerDocument, fragment = document.createDocumentFragment();
      const pieces = text.replace(/\r\n|\r/g, '\n').split('\n');
      pieces.forEach((piece, index) => { if (index) fragment.appendChild(document.createElement('br')); if (piece) fragment.appendChild(document.createTextNode(piece)); });
      this.replaceChildren(fragment);
    },
  }, 'innerText');
  Object.defineProperty(g.HTMLElement.prototype, 'innerText', { ...descriptor, configurable: true, enumerable: true });
  // The reference has a distinct script-text alias on HTMLScriptElement.
  const script = Object.getOwnPropertyDescriptor({
    get innerText() { if (!bridge.isScript(this)) throw new g.TypeError('Illegal invocation'); return this.text; },
    set innerText(value) { if (!bridge.isScript(this)) throw new g.TypeError('Illegal invocation'); this.text = value === null ? 'null' : convert(value); },
  }, 'innerText');
  Object.defineProperty(g.HTMLScriptElement.prototype, 'innerText', { ...script, configurable:true, enumerable:true });
  return { getter: descriptor.get, setter: descriptor.set };
}

export function installInnerText(page, window) {
  if (installed.has(window)) return installed.get(window);
  if (!window?.HTMLElement || typeof window.eval !== 'function') throw new TypeError('innerText requires a document realm');
  const controller = window.eval(`(${factory.toString()})`)(window, { isHTMLElement: HTMLElement.is, isScript:ScriptElement.is, collect });
  installed.set(window, controller); return controller;
}
