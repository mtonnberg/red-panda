import { selectorForSpecificity, getSelectorStateRevision } from './selectors.js';
import { enhanceDeclaration, parseStyleSheet, asRuleList, spliceRules, CSSRuleList } from './cssom.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dependencyRequire = createRequire(require.resolve('jsdom/lib/jsdom/living/helpers/style-rules.js'));
const cssom = dependencyRequire('rrweb-cssom');
const { CSSStyleDeclaration } = dependencyRequire('cssstyle');
const ElementInterface = require('jsdom/lib/jsdom/living/generated/Element.js');
const DocumentInterface = require('jsdom/lib/jsdom/living/generated/Document.js');
const ShadowInterface = require('jsdom/lib/jsdom/living/generated/ShadowRoot.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const { getComputedOrUsedColor } = require('jsdom/lib/jsdom/living/helpers/colors.js');
const HTMLElementImpl = require('jsdom/lib/jsdom/living/nodes/HTMLElement-impl.js').implementation;
const SVGElementImpl = require('jsdom/lib/jsdom/living/nodes/SVGElement-impl.js').implementation;
const StyleElementImpl = require('jsdom/lib/jsdom/living/nodes/HTMLStyleElement-impl.js').implementation;
const { removeStylesheet } = require('jsdom/lib/jsdom/living/helpers/stylesheets.js');
const { invalidateStyleCache } = require('jsdom/lib/jsdom/living/helpers/style-rules.js');
const UA = cssom.parse(require('jsdom/lib/jsdom/browser/default-stylesheet.js') + '\nnoscript { display: none; }\n');
const RECORDS = new WeakMap();
const SHEETS = new WeakMap();
const ADOPTED = new WeakMap();
const STYLE_NODES = new WeakMap();
const IDENTITIES = new WeakMap();
let identity = 0;
const id = value => { if (!IDENTITIES.has(value)) IDENTITIES.set(value, ++identity); return IDENTITIES.get(value); };
const inherited = new Set(['color', 'visibility', 'pointer-events', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant', 'line-height', 'text-align', 'text-transform', 'text-indent', 'white-space', 'word-spacing', 'letter-spacing', 'word-wrap', 'overflow-wrap', 'cursor', 'direction', 'writing-mode', 'list-style-type', 'list-style-position', 'list-style-image', 'border-collapse', 'border-spacing', 'quotes']);
const initial = {
  color: 'rgb(0, 0, 0)', visibility: 'visible', 'pointer-events': 'auto', display: 'inline', position: 'static',
  float: 'none', clear: 'none', overflow: 'visible', 'overflow-x': 'visible', 'overflow-y': 'visible',
  width: 'auto', height: 'auto', 'min-width': '0px', 'min-height': '0px', 'max-width': 'none', 'max-height': 'none',
  opacity: '1', 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'background-blend-mode': 'normal',
  'box-sizing': 'content-box', isolation: 'auto', transform: 'none', '-webkit-transform': 'none',
  'font-family': 'serif', 'font-size': '16px', 'font-style': 'normal', 'font-weight': '400', 'font-variant': 'normal',
  'line-height': 'normal', 'text-align': 'start', 'text-transform': 'none', 'text-indent': '0px', 'white-space': 'normal',
  'word-spacing': '0px', 'letter-spacing': 'normal', 'word-wrap': 'normal', 'overflow-wrap': 'normal', cursor: 'auto',
  direction: 'ltr', 'writing-mode': 'horizontal-tb', 'list-style-type': 'disc', 'list-style-position': 'outside',
  'list-style-image': 'none', 'border-collapse': 'separate', 'border-spacing': '0px', quotes: 'auto',
  margin: '0px', padding: '0px', 'padding-block-start': '0px', 'padding-block-end': '0px',
};
const shorthands = new Set(['margin', 'padding', 'border', 'border-width', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'background', 'font', 'list-style', 'outline', 'text-decoration', 'overflow', 'flex', 'grid']);
for (const side of ['top', 'right', 'bottom', 'left']) {
  initial[`margin-${side}`] = '0px'; initial[`padding-${side}`] = '0px'; initial[side] = 'auto';
  initial[`border-${side}-width`] = '0px'; initial[`border-${side}-style`] = 'none'; initial[`border-${side}-color`] = 'currentcolor';
}

function recordFor(document) { return RECORDS.get(document); }
function rootOf(element) { return element.getRootNode(); }
function ownerDocument(root) { return root.nodeType === 9 ? root : root.ownerDocument; }
function notSupported(record, message) { return new record.window.DOMException(message, 'NotSupportedError'); }

// jsdom creates inline declarations before applying parsed attributes. Adapt the
// owned declaration at creation so setAttribute and parser-created style values
// follow exactly the same tokenization as later JS cssText assignments.
for (const Interface of [HTMLElementImpl, SVGElementImpl]) {
  const initialize = Interface.prototype._initElementCSSInlineStyle;
  Interface.prototype._initElementCSSInlineStyle = function () {
    initialize.call(this);
    const record = recordFor(wrapperForImpl(this._ownerDocument));
    if (record) enhanceDeclaration(this._style, record.window);
  };
}
// Dynamic form state does not necessarily mutate attributes or jsdom's tree
// version. Track it independently so shared ancestor results and layout remain
// live for :checked, :valid and selectors such as :has(input:checked).
for (const name of ['HTMLInputElement', 'HTMLOptionElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) {
  const prototype = require(`jsdom/lib/jsdom/living/nodes/${name}-impl.js`).implementation.prototype;
  const changed = element => { const record = recordFor(wrapperForImpl(element._ownerDocument)); if (record) record.stateRevision++; };
  for (const property of ['checked', 'selected', 'selectedIndex', 'value', 'valueAsNumber', 'valueAsDate']) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor?.set) Object.defineProperty(prototype, property, { ...descriptor, set(value) { const result = descriptor.set.call(this, value); changed(this); return result; } });
  }
  for (const method of ['_formReset', 'setCustomValidity']) {
    const original = prototype[method];
    if (typeof original === 'function') prototype[method] = function (...args) { const result = original.apply(this, args); changed(this); return result; };
  }
}

const updateStyleBlock = StyleElementImpl.prototype._updateAStyleBlock;
StyleElementImpl.prototype._updateAStyleBlock = function () {
  const record = recordFor(wrapperForImpl(this._ownerDocument));
  if (!record) return updateStyleBlock.call(this);
  if (this.sheet) removeStylesheet(this.sheet, this);
  if (!this.isConnected || !this._ownerDocument._defaultView) return;
  const type = this.getAttributeNS(null, 'type');
  if (type !== null && type !== '' && type.toLowerCase() !== 'text/css') return;
  const element = wrapperForImpl(this);
  const parsed = parse(record, element.textContent);
  // Keep jsdom's existing import loader for parser-compatible imported sheets.
  // Its requests, ownership and load/error events remain managed by the Page.
  if (Array.from(parsed.cssRules).some(rule => rule.type === 3)) {
    updateStyleBlock.call(this);
    if (this.sheet) { upgradeSheet(record, this.sheet); this.sheet.ownerNode = element; return; }
    record.unsupported.add('Imports in stylesheets requiring CSS syntax recovery');
  }
  const sheet = upgradeSheet(record, parsed); sheet.ownerNode = element;
  this.sheet = sheet;
  this._ownerDocument.styleSheets._add(sheet); invalidateStyleCache(this);
};

function declaration(style) {
  if (style instanceof CSSStyleDeclaration) return enhanceDeclaration(style);
  const result = enhanceDeclaration(new CSSStyleDeclaration());
  const listed = new Set(Array.from({ length: style.length ?? 0 }, (_, index) => style[index]));
  const names = new Set(listed);
  for (const key of Object.keys(style)) {
    if (!/^\d+$/.test(key) && !key.startsWith('_') && !['length', 'parentRule'].includes(key) && typeof style[key] === 'string') names.add(key);
  }
  for (const name of names) {
    const property = name.startsWith('--') ? name : listed.has(name) ? name.toLowerCase() : name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    result.setProperty(property, style.getPropertyValue?.(name) ?? style[name], style.getPropertyPriority?.(name) ?? '');
  }
  return result;
}

function normalizeRules(rules, sheet, parent = null) {
  for (const rule of rules) {
    rule.parentStyleSheet = sheet; rule.parentRule = parent;
    if (rule.style) {
      rule.style = declaration(rule.style);
      Object.defineProperty(rule.style, 'parentRule', { configurable: true, value: rule });
    }
    if (rule.cssRules) {
      rule.cssRules = asRuleList(rule.cssRules); normalizeRules(rule.cssRules, sheet, rule);
      if ([4, 12].includes(rule.type)) {
        const record = SHEETS.get(sheet)?.record;
        if (record) Object.defineProperties(rule, {
          insertRule: { configurable: true, value(text, index = 0) {
            if (this !== rule) throw new record.window.TypeError('Illegal grouping rule invocation');
            if (!arguments.length) throw new record.window.TypeError('insertRule requires a CSS rule');
            index = Number(index) >>> 0;
            if (index > rule.cssRules.length) throw new record.window.DOMException('Rule index is outside the grouping rule', 'IndexSizeError');
            const parsed = parse(record, text).cssRules;
            if (parsed.length !== 1 || parsed[0].type === 3) throw new record.window.DOMException('Expected one nested CSS rule', 'SyntaxError');
            normalizeRules(parsed, sheet, rule); spliceRules(rule.cssRules, index, 0, parsed[0]); return index;
          } },
          deleteRule: { configurable: true, value(index) {
            if (this !== rule) throw new record.window.TypeError('Illegal grouping rule invocation');
            if (!arguments.length) throw new record.window.TypeError('deleteRule requires an index');
            index = Number(index) >>> 0;
            if (index >= rule.cssRules.length) throw new record.window.DOMException('Rule index is outside the grouping rule', 'IndexSizeError');
            const removed = spliceRules(rule.cssRules, index, 1)[0]; removed.parentStyleSheet = null; removed.parentRule = null;
          } },
        });
      }
    }
  }
}

function parse(record, text) {
  return parseStyleSheet(String(text), { window: record.window, onUnsupported: value => record.unsupported.add(value) });
}

function operation(record, sheet, name, args) {
  const method = SHEETS.get(sheet)?.operations?.[name];
  if (!method) throw new record.window.TypeError('Illegal stylesheet invocation');
  return method.apply(sheet, args);
}

function upgradeSheet(record, sheet, constructed = false) {
  let metadata = SHEETS.get(sheet);
  const fresh = !metadata;
  if (!metadata) {
    metadata = { record, document: record.document, constructed, locked: false };
    SHEETS.set(sheet, metadata);
    sheet.cssRules = asRuleList(sheet.cssRules);
    if (!sheet.media) sheet.media = new cssom.MediaList();
    if (sheet.disabled === undefined) sheet.disabled = false;
    if (sheet.ownerNode === undefined) sheet.ownerNode = null;
    if (sheet.href === undefined) sheet.href = null;
    Object.defineProperties(sheet, {
      replaceSync: { configurable: true, writable: true, value(text) {
        if (this !== sheet) return operation(record, this, 'replaceSync', arguments);
        if (!arguments.length) throw new record.window.TypeError('replaceSync requires CSS text');
        if (!metadata.constructed || metadata.locked) throw new record.window.DOMException('Only unlocked constructed stylesheets can be replaced', 'NotAllowedError');
        replaceRules(record, sheet, text);
      } },
      replace: { configurable: true, writable: true, value(text) {
        if (this !== sheet) return operation(record, this, 'replace', arguments);
        if (!arguments.length) return record.window.Promise.reject(new record.window.TypeError('replace requires CSS text'));
        if (!metadata.constructed || metadata.locked) return record.window.Promise.reject(new record.window.DOMException('Only unlocked constructed stylesheets can be replaced', 'NotAllowedError'));
        text = String(text); metadata.locked = true;
        return record.window.Promise.resolve().then(() => {
          try { replaceRules(record, sheet, text); return sheet; }
          finally { metadata.locked = false; }
        });
      } },
      insertRule: { configurable: true, writable: true, value(text, index = 0) {
        if (this !== sheet) return operation(record, this, 'insertRule', arguments);
        if (!arguments.length) throw new record.window.TypeError('insertRule requires a CSS rule');
        if (metadata.locked) throw new record.window.DOMException('The stylesheet is being replaced', 'NotAllowedError');
        index = Number(index) >>> 0;
        // Native Lightpanda clamps insertion indexes (its documented CSS-in-JS
        // compatibility workaround); deletion remains range checked.
        index = Math.min(index, sheet.cssRules.length);
        const rules = parse(record, text).cssRules;
        if (rules.length !== 1) throw new record.window.DOMException('insertRule requires exactly one CSS rule', 'SyntaxError');
        if (metadata.constructed && rules[0].type === 3) throw new record.window.DOMException('Constructed stylesheets cannot import other sheets', 'SyntaxError');
        normalizeRules(rules, sheet); spliceRules(sheet.cssRules, index, 0, rules[0]);
        return index;
      } },
      deleteRule: { configurable: true, writable: true, value(index) {
        if (this !== sheet) return operation(record, this, 'deleteRule', arguments);
        if (!arguments.length) throw new record.window.TypeError('deleteRule requires an index');
        if (metadata.locked) throw new record.window.DOMException('The stylesheet is being replaced', 'NotAllowedError');
        index = Number(index) >>> 0;
        if (index >= sheet.cssRules.length) throw new record.window.DOMException('Rule index is outside the stylesheet', 'IndexSizeError');
        const removed = spliceRules(sheet.cssRules, index, 1)[0]; removed.parentStyleSheet = null; removed.parentRule = null;
      } },
    });
    metadata.operations = Object.fromEntries(['replaceSync', 'replace', 'insertRule', 'deleteRule'].map(name => [name, sheet[name]]));
  }
  if (fresh) normalizeRules(sheet.cssRules, sheet);
  return sheet;
}

function replaceRules(record, sheet, text) {
  const rules = Array.from(parse(record, text).cssRules).filter(rule => rule.type !== 3);
  normalizeRules(rules, sheet);
  for (const old of sheet.cssRules) old.parentStyleSheet = null;
  spliceRules(sheet.cssRules, 0, sheet.cssRules.length, ...rules);
}

function stateFor(root, record, fresh = false) {
  let state = ADOPTED.get(root);
  if (state?.document !== ownerDocument(root)) state = null;
  if (state && !fresh) return state;
  const target = new record.window.Array();
  state = { document: ownerDocument(root), target, list: null };
  const validate = sheet => {
    const metadata = SHEETS.get(sheet);
    if (!metadata?.constructed || metadata.document !== state.document) {
      throw new record.window.DOMException('Only stylesheets constructed in the same document can be adopted', 'NotAllowedError');
    }
  };
  const index = property => typeof property === 'string' && /^(?:0|[1-9]\d*)$/.test(property);
  state.list = new Proxy(target, {
    get(array, property, receiver) {
      if (['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'sort', 'fill', 'copyWithin'].includes(property)) return (...args) => {
        const draft = record.window.Array.prototype.slice.call(array);
        const result = record.window.Array.prototype[property].apply(draft, args);
        draft.forEach(validate); array.length = 0; array.length = draft.length;
        for (const key of Object.keys(draft)) array[key] = draft[key];
        return result === draft ? state.list : result;
      };
      return Reflect.get(array, property, receiver);
    },
    set(array, property, value) {
      if (index(property)) validate(value);
      return Reflect.set(array, property, value);
    },
    defineProperty(array, property, descriptor) {
      if (index(property)) {
        if (!('value' in descriptor)) throw new record.window.TypeError('Adopted stylesheet entries require a stylesheet value');
        validate(descriptor.value);
      }
      return Reflect.defineProperty(array, property, descriptor);
    },
    deleteProperty(array, property) {
      return Reflect.deleteProperty(array, property);
    },
  });
  state.replace = values => {
    if (values == null || typeof values[Symbol.iterator] !== 'function') throw new record.window.TypeError('adoptedStyleSheets requires an iterable');
    const next = [...values]; next.forEach(validate);
    const successor = stateFor(root, record, true); successor.target.push(...next);
  };
  ADOPTED.set(root, state);
  return state;
}

function splitTopLevel(text, separator = ',') {
  const result = []; let start = 0, depth = 0, quote = null;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '\\') { index++; continue; }
    if (quote) { if (character === quote) quote = null; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (character === separator && depth === 0) { result.push(text.slice(start, index).trim()); start = index + 1; }
  }
  result.push(text.slice(start).trim()); return result;
}

function compare(a, b) { for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] - b[index]; return 0; }
function maximum(values) { return values.reduce((best, value) => compare(best, value) < 0 ? value : best, [0, 0, 0]); }

function specificity(selector) {
  selector = selectorForSpecificity(selector);
  const score = [0, 0, 0];
  const identifier = start => {
    let end = start;
    while (end < selector.length && /[\w\u0080-\uffff-]/.test(selector[end])) end++;
    return end;
  };
  const balanced = start => {
    let depth = 1, quote = null, end = start;
    for (; end < selector.length; end++) {
      const character = selector[end];
      if (character === '\\') { end++; continue; }
      if (quote) { if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") quote = character;
      else if (character === '(' || character === '[') depth++;
      else if (character === ')' || character === ']') { if (--depth === 0) break; }
    }
    return end;
  };
  for (let index = 0; index < selector.length;) {
    const character = selector[index];
    if (character === '#' || character === '.') { score[character === '#' ? 0 : 1]++; index = identifier(index + 1); }
    else if (character === '[') { score[1]++; index = balanced(index + 1) + 1; }
    else if (character === ':') {
      const pseudoElement = selector[index + 1] === ':'; index += pseudoElement ? 2 : 1;
      const end = identifier(index), name = selector.slice(index, end).toLowerCase(); index = end;
      let argument = '';
      if (selector[index] === '(') { const close = balanced(index + 1); argument = selector.slice(index + 1, close); index = close + 1; }
      if (pseudoElement) score[2]++;
      else if (name !== 'where') {
        if (['is', 'not', 'has'].includes(name)) {
          const highest = maximum(splitTopLevel(argument).map(specificity)); highest.forEach((value, part) => { score[part] += value; });
        } else {
          score[1]++;
          if (name.startsWith('nth-') && /\bof\b/.test(argument)) {
            const highest = maximum(splitTopLevel(argument.replace(/^.*?\bof\s*/, '')).map(specificity)); highest.forEach((value, part) => { score[part] += value; });
          }
        }
      }
    } else if (/[a-zA-Z_\u0080-\uffff-]/.test(character)) {
      const end = identifier(index); if (selector[end] !== '|') score[2]++; index = end + (selector[end] === '|' ? 1 : 0);
    } else index++;
  }
  return score;
}

function mediaMatches(record, text) {
  if (!text || !text.trim()) return true;
  return splitTopLevel(text.toLowerCase()).filter(Boolean).some(query => {
    let negate = false; query = query.trim();
    if (query.startsWith('not ')) { negate = true; query = query.slice(4).trim(); }
    query = query.replace(/^only\s+/, '');
    let matches = true;
    const type = query.match(/^(all|screen|print)\b/);
    if (type) { matches = type[1] !== 'print'; query = query.slice(type[0].length).trim().replace(/^and\s+/, ''); }
    for (const condition of query.split(/\s+and\s+/).filter(Boolean)) {
      const bound = condition.match(/^\((min-|max-)?(width|height)\s*:\s*(\d+(?:\.\d+)?)px\)$/);
      if (!bound) { record.unsupported.add('Media queries beyond screen/print and pixel width/height bounds'); return false; }
      const dimension = bound[2] === 'width' ? record.window.innerWidth : record.window.innerHeight;
      const value = Number(bound[3]); matches &&= bound[1] === 'min-' ? dimension >= value : bound[1] === 'max-' ? dimension <= value : dimension === value;
    }
    return negate ? !matches : matches;
  });
}

function shadowStyleSheet(record, element) {
  const text = element.textContent;
  let cached = STYLE_NODES.get(element);
  if (!cached || cached.text !== text) {
    const sheet = upgradeSheet(record, parse(record, text)); sheet.ownerNode = element;
    cached = { text, sheet }; STYLE_NODES.set(element, cached);
  }
  return cached.sheet;
}

function scopeSheets(record, root) {
  const sheets = [];
  record.scopeCache ??= new WeakMap();
  const version = implForWrapper(root)._version;
  let cached = record.scopeCache.get(root);
  if (!cached || cached.version !== version) {
    cached = { version, elements: Array.from(root.querySelectorAll?.('style,link[rel~="stylesheet"]') ?? []) };
    record.scopeCache.set(root, cached);
  }
  const elements = cached.elements;
  for (const element of elements) {
    if (rootOf(element) !== root) continue;
    let sheet;
    if (element.localName === 'style' && root.nodeType === 11) sheet = shadowStyleSheet(record, element);
    else sheet = record.originalStyleSheetGetter.call(element);
    if (sheet) { upgradeSheet(record, sheet); sheet.ownerNode = element; sheets.push({ sheet, media: element.getAttribute('media') ?? '' }); }
  }
  for (const sheet of stateFor(root, record).target) if (sheet) sheets.push({ sheet, media: sheet.media?.mediaText ?? '' });
  return sheets;
}

function sheetFingerprint(sheet) {
  return [id(sheet), Boolean(sheet.disabled), sheet.media?.mediaText ?? '', Array.from(sheet.cssRules, rule => rule.cssText)];
}

function inheritanceParent(element) {
  const implementation = implForWrapper(element);
  const assigned = implementation._assignedSlot;
  if (assigned) return wrapperForImpl(assigned);
  return element.parentElement ?? rootOf(element).host ?? null;
}

function localToken(record, element) {
  const tokens = [getSelectorStateRevision(record.window), record.stateRevision, implForWrapper(record.document)._version, id(implForWrapper(record.document)._lastFocusedElement ?? record.document), record.window.innerWidth, record.window.innerHeight];
  const roots = new Set();
  for (let current = element; current; current = inheritanceParent(current)) {
    const root = rootOf(current); roots.add(root);
    tokens.push(id(current), implForWrapper(current)._version, current.checked ?? null, current.selected ?? null, current.style?.cssText ?? '');
  }
  for (const root of roots) {
    tokens.push(id(root), implForWrapper(root)._version);
    for (const { sheet, media } of scopeSheets(record, root)) tokens.push(media, sheetFingerprint(sheet));
  }
  return JSON.stringify(tokens);
}

function overflowAxes(value) {
  const parts = value.trim().toLowerCase().split(/\s+/);
  if (parts.length === 1 && ['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(parts[0])) return [parts[0], parts[0]];
  if (parts.length < 1 || parts.length > 2 || parts.some(part => !['auto', 'scroll', 'hidden', 'clip', 'visible', 'overlay'].includes(part))) return null;
  return [parts[0], parts[1] ?? parts[0]];
}

// Native text collection supports the case keyword while ignoring width/kana
// modifiers. Validate declarations before the cascade so invalid values expose
// a real lower-priority declaration, preserving raw inline serialization.
function textTransformValue(value) {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (tokens.length === 1 && ['none', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(tokens[0])) return tokens[0];
  let mode = null;
  for (const token of tokens) {
    if (token === 'full-width' || token === 'full-size-kana') continue;
    if (!['uppercase', 'lowercase', 'capitalize'].includes(token) || mode !== null) return null;
    mode = token;
  }
  return mode ?? 'none';
}

function cascade(record, element) {
  const values = new Map(); let order = 0;
  const offer = (style, score, origin, inline = false) => {
    style = declaration(style);
    for (let index = 0; index < style.length; index++) {
      const property = style[index];
      let value = style.getPropertyValue(property);
      if (property === 'text-transform') { value = textTransformValue(value); if (value === null) continue; }
      const important = style.getPropertyPriority(property) === 'important';
      const expanded = new CSSStyleDeclaration(); expanded.setProperty(property, value);
      const entries = property === 'opacity' ? [{ name: property, entry: value }] : [...expanded._values].map(([name, entry]) => ({ name, entry }));
      if (property === 'overflow') {
        const axes = overflowAxes(value);
        if (axes) entries.push({ name: 'overflow-x', entry: axes[0] }, { name: 'overflow-y', entry: axes[1] });
        else if (/var\(/.test(value)) {
          entries.push({ name: 'overflow-x', entry: value, overflowPart: 0 }, { name: 'overflow-y', entry: value, overflowPart: 1 });
        } else continue;
      }
      // cssstyle's pinned parsed value map includes genuine shorthand
      // expansions except overflow. Its independently expanded axes likewise
      // take part in source order, specificity and importance.
      for (const { name, entry, overflowPart } of entries) {
        const key = [important ? 1 : 0, important && origin === 0 ? 2 : origin, inline ? 1 : 0, ...score, order++];
        const list = values.get(name) ?? []; list.push({ value: entry, key, origin, overflowPart }); values.set(name, list);
      }
    }
  };
  const walk = (rules, origin) => {
    for (const rule of rules) {
      if (rule.selectorText && rule.style) {
        let highest = null;
        for (const selector of splitTopLevel(rule.selectorText)) {
          if (/:host|::slotted|::part/.test(selector)) { record.unsupported.add(':host, ::slotted and ::part selectors'); continue; }
          try { if (element.matches(selector)) { const score = specificity(selector); if (!highest || compare(score, highest) > 0) highest = score; } }
          catch { record.unsupported.add('Selectors unsupported by the pinned DOM selector engine'); }
        }
        if (highest) offer(rule.style, highest, origin);
      } else if (rule.type === 4 && rule.cssRules) {
        if (mediaMatches(record, rule.media?.mediaText ?? rule.conditionText ?? '')) walk(rule.cssRules, origin);
      } else if (rule.cssRules && rule.type !== 7) record.unsupported.add('Cascade layers, nesting, @supports and other grouping rules');
    }
  };
  walk(UA.cssRules, 0);
  if (element.localName === 'a' && element.hasAttribute('href')) {
    const link = new CSSStyleDeclaration(); link.color = 'rgb(0, 0, 238)'; offer(link, [0, 1, 1], 0);
  }
  const root = rootOf(element);
  for (const { sheet, media } of scopeSheets(record, root)) if (!sheet.disabled && mediaMatches(record, media)) walk(sheet.cssRules, 1);
  offer(element.style, [0, 0, 0], 1, true);
  const chosen = new Map();
  for (const [property, candidates] of values) {
    candidates.sort((a, b) => compare(b.key, a.key));
    let winner = candidates[0];
    if (winner.value.toLowerCase() === 'revert' || winner.value.toLowerCase() === 'revert-layer') winner = candidates.find(candidate => candidate.origin === 0);
    if (winner) chosen.set(property, winner.overflowPart === undefined ? winner.value : { value: winner.value, overflowPart: winner.overflowPart });
  }
  return chosen;
}

normalizeRules(UA.cssRules, UA);

function substitute(text, resolve) {
  let result = '', start = 0;
  while (true) {
    const match = /var\(/g; match.lastIndex = start; const found = match.exec(text);
    if (!found) return result + text.slice(start);
    result += text.slice(start, found.index);
    let end = found.index + 4, depth = 1, quote = null;
    for (; end < text.length; end++) {
      const character = text[end];
      if (character === '\\') { end++; continue; }
      if (quote) { if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") quote = character;
      else if (character === '(') depth++;
      else if (character === ')' && --depth === 0) break;
    }
    if (depth) return null;
    const parts = splitTopLevel(text.slice(found.index + 4, end));
    const name = parts.shift();
    if (!/^--[^\s]+$/.test(name)) return null;
    let value = resolve(name);
    if (value === null && parts.length) value = substitute(parts.join(','), resolve);
    if (value === null) return null;
    result += value; start = end + 1;
  }
}

function compute(record, element, memo = (record.computedMemo ??= new WeakMap()), token = localToken(record, element)) {
  const retained = memo.get(element);
  if (retained?.token === token) return retained.style;
  const parent = inheritanceParent(element);
  const parentStyle = parent ? compute(record, parent, memo) : null;
  const chosen = cascade(record, element), result = new CSSStyleDeclaration(); memo.set(element, { token, style: result });
  const custom = new Map(), resolved = new Map();
  if (parentStyle) for (let index = 0; index < parentStyle.length; index++) if (parentStyle[index].startsWith('--')) custom.set(parentStyle[index], parentStyle.getPropertyValue(parentStyle[index]));
  for (const [property, value] of chosen) if (property.startsWith('--')) {
    const keyword = value.toLowerCase();
    if (keyword === 'initial') custom.delete(property);
    else if (!['inherit', 'unset'].includes(keyword)) custom.set(property, value);
  }
  const resolveCustom = (name, stack = new Set()) => {
    if (resolved.has(name)) return resolved.get(name);
    if (!custom.has(name) || stack.has(name)) return null;
    const next = new Set(stack); next.add(name);
    const value = substitute(custom.get(name), key => resolveCustom(key, next)); resolved.set(name, value); return value;
  };
  for (const property of custom.keys()) { const value = resolveCustom(property); if (value !== null) result.setProperty(property, value); }
  const properties = [...new Set([...Object.keys(initial), ...chosen.keys()])].sort((a, b) => Number(shorthands.has(b)) - Number(shorthands.has(a)));
  const resolve = property => {
    const inheriting = inherited.has(property), fallback = initial[property] ?? '';
    const parentValue = parentStyle?.getPropertyValue(property) || fallback;
    const selection = chosen.get(property);
    let value = typeof selection === 'object' ? selection.value : selection;
    if (value === undefined) value = inheriting ? parentValue : fallback;
    if (property !== 'opacity' && /var\(/.test(value)) value = substitute(value, resolveCustom);
    if (selection?.overflowPart !== undefined && value !== null) value = overflowAxes(value)?.[selection.overflowPart] ?? null;
    const keyword = value?.trim().toLowerCase();
    if (value === null || keyword === 'unset') value = inheriting ? parentValue : fallback;
    else if (keyword === 'inherit') value = parentValue;
    else if (keyword === 'initial') value = fallback;
    if (value?.trim().toLowerCase() === 'currentcolor') return property === 'color' ? parentStyle?.color || initial.color : result.color || initial.color;
    return value;
  };
  const color = resolve('color');
  try { result.setProperty('color', getComputedOrUsedColor(color)); } catch { result.setProperty('color', color); }
  for (const property of properties) {
    if (property === 'color' || property.startsWith('--')) continue;
    let value = resolve(property);
    if (property === 'font-weight') value = ({ normal: '400', bold: '700' })[value] ?? value;
    if (property.endsWith('color') && value) { try { value = getComputedOrUsedColor(value); } catch {} }
    result.setProperty(property, inherited.has(property) ? parentStyle?.getPropertyValue(property) || initial[property] || '' : initial[property] || '');
    if (property === 'opacity') result._setProperty(property, value);
    else result.setProperty(property, value);
  }
  // CSS Overflow's computed-value coupling turns visible into auto and clip
  // into hidden when the opposite axis establishes a scrolling box.
  let x = result.overflowX === 'overlay' ? 'auto' : result.overflowX;
  let y = result.overflowY === 'overlay' ? 'auto' : result.overflowY;
  if (![x, y].every(value => value === 'visible' || value === 'clip')) {
    x = x === 'visible' ? 'auto' : x === 'clip' ? 'hidden' : x;
    y = y === 'visible' ? 'auto' : y === 'clip' ? 'hidden' : y;
  }
  result.overflowX = x; result.overflowY = y;
  result.overflow = x === y ? x : `${x} ${y}`;
  if (element === record.document.documentElement) {
    const blockified = ({ inline: 'block', 'inline-block': 'block', 'inline-flex': 'flex', 'inline-grid': 'grid', contents: 'block' })[result.display];
    if (blockified) result.display = blockified;
  }
  return result;
}

function computedStyle(record, element) {
  let token, cached;
  const current = () => {
    const next = localToken(record, element);
    if (token !== next) { cached = compute(record, element, undefined, next); token = next; }
    return cached;
  };
  const readonly = () => { throw new record.window.DOMException('Computed styles are readonly', 'NoModificationAllowedError'); };
  return new Proxy(new CSSStyleDeclaration(), {
    get(target, property) {
      if (['setProperty', 'removeProperty'].includes(property)) return readonly;
      if (property === 'cssText') return '';
      if (property === Symbol.iterator) return function* () { const value = current(); for (let index = 0; index < value.length; index++) yield value[index]; };
      const value = Reflect.get(current(), property);
      return typeof value === 'function' && property !== 'constructor' ? value.bind(current()) : value;
    },
    set: readonly, deleteProperty: readonly, defineProperty: readonly,
  });
}

export function getStyleRevision(window) {
  const record = recordFor(window?.document);
  if (!record) return 0;
  const tokens = [getSelectorStateRevision(window), window.innerWidth, window.innerHeight, record.stateRevision, id(implForWrapper(record.document)._lastFocusedElement ?? record.document)];
  const visit = root => {
    tokens.push(id(root), implForWrapper(root)._version);
    for (const { sheet, media } of scopeSheets(record, root)) tokens.push(media, sheetFingerprint(sheet));
    for (const element of root.querySelectorAll('*')) {
      const shadow = implForWrapper(element)._shadowRoot;
      if (shadow) visit(wrapperForImpl(shadow));
    }
  };
  visit(record.document);
  const signature = JSON.stringify(tokens);
  if (signature !== record.signature) { record.signature = signature; record.revision++; }
  return record.revision;
}

export function installStyles(page, window) {
  if (!page || !window?.document) throw new TypeError('Styles require a Page and document window');
  const document = window.document;
  const existing = recordFor(document);
  if (existing?.page === page && !existing.disposed) return existing.controller;
  existing?.controller.dispose();
  const originalStyleDescriptor = Object.getOwnPropertyDescriptor(window.HTMLStyleElement.prototype, 'sheet');
  const originalLinkDescriptor = Object.getOwnPropertyDescriptor(window.HTMLLinkElement.prototype, 'sheet');
  const originalDocumentSheets = Object.getOwnPropertyDescriptor(window.Document.prototype, 'styleSheets');
  const record = { page, window, document, originalGetComputedStyle: window.getComputedStyle, originalStyleSheetGetter: function () {
    return (this.localName === 'link' ? originalLinkDescriptor : originalStyleDescriptor).get.call(this);
  }, signal: page.documentAbort?.signal, originalClose: window.close, disposed: false, unsupported: new Set(), revision: 0, stateRevision: 0, signature: null };
  for (const element of document.querySelectorAll('*')) { const style = implForWrapper(element)._style; if (style) enhanceDeclaration(style, window); }
  const define = (prototype, property, descriptor) => Object.defineProperty(prototype, property, descriptor);
  const adoption = { configurable: true, enumerable: true,
    get() {
      if (!DocumentInterface.is(this) && !ShadowInterface.is(this)) throw new window.TypeError('Illegal invocation');
      return stateFor(this, record).list;
    },
    set(value) {
      if (!DocumentInterface.is(this) && !ShadowInterface.is(this)) throw new window.TypeError('Illegal invocation');
      stateFor(this, record).replace(value);
    },
  };
  window.CSSRuleList = CSSRuleList;
  for (const name of ['keys', 'values', 'entries']) delete window.StyleSheetList.prototype[name];
  define(window.StyleSheetList.prototype, Symbol.iterator, { configurable: true, writable: true, value: function* () { for (let index = 0; index < this.length; index++) yield upgradeSheet(record, this[index]); } });
  define(window.Document.prototype, 'adoptedStyleSheets', adoption); define(window.ShadowRoot.prototype, 'adoptedStyleSheets', adoption);
  define(window.HTMLStyleElement.prototype, 'sheet', { configurable: true, enumerable: true, get() {
    if (rootOf(this).nodeType === 11 && ShadowInterface.is(rootOf(this))) return shadowStyleSheet(record, this);
    const sheet = originalStyleDescriptor.get.call(this); return sheet ? upgradeSheet(record, sheet) : null;
  } });
  define(window.Document.prototype, 'styleSheets', { ...originalDocumentSheets, get() {
    const sheets = originalDocumentSheets.get.call(this); for (const sheet of sheets) upgradeSheet(record, sheet); return sheets;
  } });
  const originalConstructor = window.CSSStyleSheet;
  class CSSStyleSheet extends originalConstructor {
    constructor(options = {}) {
      super();
      if (options === null) options = {};
      if (!['object', 'function'].includes(typeof options)) throw new window.TypeError('CSSStyleSheet options must be a dictionary');
      upgradeSheet(record, this, true); this.disabled = Boolean(options.disabled);
      const media = options.media?.mediaText ?? options.media;
      if (media != null && String(media)) this.media.mediaText = String(media);
      this.ownerNode = null; this.ownerRule = null; this.href = null;
      if (options.baseURL !== undefined) throw notSupported(record, 'Constructed stylesheet baseURL options are not implemented');
    }
    replaceSync(text) { return operation(record, this, 'replaceSync', arguments); }
    replace(text) { return operation(record, this, 'replace', arguments); }
    insertRule(text, index = 0) { return operation(record, this, 'insertRule', arguments); }
    deleteRule(index) { return operation(record, this, 'deleteRule', arguments); }
    static [Symbol.hasInstance](sheet) { return sheet instanceof originalConstructor; }
  }
  window.CSSStyleSheet = CSSStyleSheet;
  window.getComputedStyle = function getComputedStyle(element, pseudo = null) {
    if (!ElementInterface.is(element)) throw new window.TypeError('getComputedStyle requires an Element');
    if (pseudo !== null && pseudo !== undefined && String(pseudo) !== '') throw notSupported(record, 'Computed pseudo-element styles are not implemented');
    const owner = recordFor(element.ownerDocument);
    return owner ? computedStyle(owner, element) : record.originalGetComputedStyle.call(window, element);
  };
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true; RECORDS.delete(document);
    record.signal?.removeEventListener('abort', dispose); page.off?.('close', dispose);
    if (window.close === record.close) window.close = record.originalClose;
  };
  record.controller = { dispose, get revision() { return getStyleRevision(window); }, unsupported: record.unsupported };
  if (!record.signal?.aborted && !page.closed) RECORDS.set(document, record);
  record.close = function () { dispose(); return record.originalClose.call(window); }; window.close = record.close;
  record.signal?.addEventListener('abort', dispose, { once: true }); page.once?.('close', dispose);
  return record.controller;
}
