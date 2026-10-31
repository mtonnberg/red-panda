import {registerHeapWrapper} from './heap-registry.js';
import {computedTransform,computedFontSize} from './computed-values.js';
import {evaluateMedia} from './media.js';
import { selectorForSpecificity, getSelectorStateRevision, matchesInScope, createScopedMatcher, selectorSubjectTypes } from './selectors.js';
import { enhanceDeclaration, parseStyleSheet, nestedGroupContents, asRuleList, spliceRules, CSSRuleList,bindDeferredRules,hasStyleImports,discardStyleImports,detachRuleEntries,replaceRuleEntries,flatSheetState,deferredRuleStyle } from './cssom.js';
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
const stylesheetBackend=require('jsdom/lib/jsdom/living/helpers/stylesheets.js');
const { removeStylesheet } = stylesheetBackend;
const whatwgURL=require('whatwg-url');
const REPLACING_EXTERNAL=new WeakMap();
const { invalidateStyleCache } = require('jsdom/lib/jsdom/living/helpers/style-rules.js');
const UA = cssom.parse(require('jsdom/lib/jsdom/browser/default-stylesheet.js') + '\narea,base,datalist,head,link,meta,noscript,param,script,source,style,template,title,track { display: none; } details:not([open]) > :not(summary) { display: none; } [popover]:not(:popover-open):not(dialog[open]) { display:none; } dialog:popover-open {display:block;}\n');
const RECORDS = new WeakMap();
const SHEETS = new WeakMap();
const ADOPTED = new WeakMap();
const STYLE_NODES = new WeakMap();
const SELECTOR_PARTS=new WeakMap();
function ruleSelectorParts(rule){let retained=SELECTOR_PARTS.get(rule);if(!retained||retained.text!==rule.selectorText){retained={text:rule.selectorText,parts:splitTopLevel(rule.selectorText)};SELECTOR_PARTS.set(rule,retained);}return retained.parts;}
const IDENTITIES = new WeakMap();
let identity = 0;
const id = value => { if (!IDENTITIES.has(value)) IDENTITIES.set(value, ++identity); return IDENTITIES.get(value); };
const inherited = new Set(['color', 'visibility', 'pointer-events', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant', 'line-height', 'text-align', 'text-transform', 'text-indent', 'white-space', 'word-spacing', 'letter-spacing', 'word-wrap', 'overflow-wrap', 'cursor', 'direction', 'writing-mode', 'list-style-type', 'list-style-position', 'list-style-image', 'border-collapse', 'border-spacing', 'quotes']);
const initial = {
  color: 'rgb(0, 0, 0)', visibility: 'visible', 'pointer-events': 'auto', display: 'inline', position: 'static',
  float: 'none', clear: 'none', overflow: 'visible', 'overflow-x': 'visible', 'overflow-y': 'visible',
  width: 'auto', height: 'auto', 'min-width': '0px', 'min-height': '0px', 'max-width': 'none', 'max-height': 'none',
  opacity: '1', 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'background-blend-mode': 'normal',
  'z-index': 'auto', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', content: 'normal', gap: 'normal', 'column-gap': 'normal', 'border-radius': '0px', 'border-width': '0px', 'border-style': 'none',
  'border-top-left-radius': '0px', 'border-top-right-radius': '0px', 'border-bottom-left-radius': '0px', 'border-bottom-right-radius': '0px',
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

const characterDataPrototype=require('jsdom/lib/jsdom/living/nodes/CharacterData-impl.js').implementation.prototype;
const replaceCharacterData=characterDataPrototype.replaceData;
characterDataPrototype.replaceData=function(...args){const result=replaceCharacterData.apply(this,args);const record=recordFor(wrapperForImpl(this._ownerDocument));if(record)record.stateRevision++;return result;};
const registryPrototype=require('jsdom/lib/jsdom/living/custom-elements/CustomElementRegistry-impl.js').implementation.prototype;
const defineCustomElement=registryPrototype.define;
registryPrototype.define=function(...args){const result=defineCustomElement.apply(this,args);const record=recordFor(this._globalObject.document);if(record)record.stateRevision++;return result;};

const elementBackend=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation.prototype;
const attachShadowBackend=elementBackend.attachShadow;
elementBackend.attachShadow=function(...args){const result=attachShadowBackend.apply(this,args);const record=recordFor(wrapperForImpl(this._ownerDocument));if(record)record.scopeRevision=(record.scopeRevision??0)+1;return result;};

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
  if(bindDeferredRules(rules,sheet,parent,rule=>normalizeRules([rule],sheet,parent)))return;
  for (const rule of rules) {
    rule.parentStyleSheet = rule.type===2?null:sheet; rule.parentRule = parent;
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

const originalExternalCreate=stylesheetBackend.createStylesheet;
stylesheetBackend.removeStylesheet=function(sheet,element){
 const record=recordFor(wrapperForImpl(element._ownerDocument));
 const index=element._ownerDocument.styleSheets._list.indexOf(sheet);
 if(record&&element.localName==='link'&&element._attached)REPLACING_EXTERNAL.set(element,{record,sheet,index});
 return removeStylesheet(sheet,element);
};
stylesheetBackend.createStylesheet=function(text,element,baseURL){
 const record=recordFor(wrapperForImpl(element._ownerDocument));
 if(!record||record.disposed||element.localName!=='link')return originalExternalCreate(text,element,baseURL);
 const replacement=REPLACING_EXTERNAL.get(element);REPLACING_EXTERNAL.delete(element);
 const parsed=parse(record,text);
 // Keep the existing real import loader for its supported import path.
 if(hasStyleImports(parsed.cssRules)){originalExternalCreate(text,element,baseURL);if(element.sheet){upgradeSheet(record,element.sheet);element.sheet.ownerNode=wrapperForImpl(element);element.sheet.href=whatwgURL.serializeURL(baseURL);}return;}
 const retained=replacement?.record===record?replacement.sheet:null,sheet=retained?upgradeSheet(record,retained):upgradeSheet(record,parsed);
 if(retained){normalizeRules(parsed.cssRules,sheet);replaceRuleEntries(sheet.cssRules,parsed.cssRules,sheet,null,record.window);}
 sheet.ownerNode=wrapperForImpl(element);sheet.href=whatwgURL.serializeURL(baseURL);element.sheet=sheet;
 const list=element._ownerDocument.styleSheets._list,index=replacement?.index;
 if(!list.includes(sheet)){if(index>=0)list.splice(Math.min(index,list.length),0,sheet);else list.push(sheet);}
 invalidateStyleCache(element);
};

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
    if(record.originalSheetPrototype&&Object.getPrototypeOf(sheet)===record.originalSheetPrototype)Object.setPrototypeOf(sheet,record.sheetPrototype);
    sheet.cssRules = asRuleList(sheet.cssRules);
    if (!sheet.media) sheet.media = new cssom.MediaList();
    if (sheet.disabled === undefined) sheet.disabled = false;
    if (sheet.ownerNode === undefined) sheet.ownerNode = null;
    if (sheet.href === undefined) sheet.href = null;
    Object.defineProperties(sheet, {
      replaceSync: { configurable: true, writable: true, value(text) {
        if (this !== sheet) return operation(record, this, 'replaceSync', arguments);
        if (!arguments.length) throw new record.window.TypeError('replaceSync requires CSS text');
        if (metadata.locked) throw new record.window.DOMException('Only unlocked constructed stylesheets can be replaced', 'NotAllowedError');
        replaceRules(record, sheet, text);
      } },
      replace: { configurable: true, writable: true, value(text) {
        if (this !== sheet) return operation(record, this, 'replace', arguments);
        if (!arguments.length) return record.window.Promise.reject(new record.window.TypeError('replace requires CSS text'));
        if (metadata.locked) return record.window.Promise.reject(new record.window.DOMException('Only unlocked constructed stylesheets can be replaced', 'NotAllowedError'));
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
  const rules = parse(record,text).cssRules;discardStyleImports(rules);
  normalizeRules(rules,sheet);replaceRuleEntries(sheet.cssRules,rules,sheet,null,record.window);
}

function stateFor(root, record, fresh = false) {
  let state = ADOPTED.get(root);
  if (state?.document !== ownerDocument(root)) state = null;
  if (state && !fresh) return state;
  const target = new record.Array();
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
        const draft = record.Array.prototype.slice.call(array);
        const result = record.Array.prototype[property].apply(draft, args);
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

function mediaMatches(record,text) { return evaluateMedia(text,{width:record.window.innerWidth,height:record.window.innerHeight},{emptyMatches:true}); }

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
  const flat=flatSheetState(sheet);if(flat)return[id(sheet),Boolean(sheet.disabled),sheet.media?.mediaText??'',flat.version];
  return [id(sheet), Boolean(sheet.disabled), sheet.media?.mediaText ?? '', Array.from(sheet.cssRules, rule => rule.cssText)];
}

function inheritanceParent(element) {
  const implementation = implForWrapper(element);
  const assigned = implementation._assignedSlot;
  if (assigned) return wrapperForImpl(assigned);
  const parent = implementation.parentElement;
  if (parent) return wrapperForImpl(parent);
  const root = implementation.getRootNode({ composed: false });
  return root._host ? wrapperForImpl(root._host) : null;
}

function localToken(record, element) {
  const tokens = [getSelectorStateRevision(record.window), record.stateRevision, record.window.location.href, implForWrapper(record.document)._version, id(implForWrapper(record.document)._lastFocusedElement ?? record.document), record.window.innerWidth, record.window.innerHeight];
  const roots = new Set();
  for (let current = element; current; current = inheritanceParent(current)) {
    const root = rootOf(current); roots.add(root);
    tokens.push(id(current), implForWrapper(current)._version, current.checked ?? null, current.selected ?? null, implForWrapper(current)._style?.cssText ?? '');
  }
  for (const root of roots) {
    tokens.push(id(root), implForWrapper(root)._version);
    for (const { sheet, media } of scopeSheets(record, root)) tokens.push(media, sheetFingerprint(sheet));
  }
  return JSON.stringify(tokens);
}

// Native's position accessor uses a typed keyword candidate from the actual
// cascade, while CSSOM retains the authored declaration token stream. Unknown
// keywords/variables and inherited/reset keywords other than initial do not
// supply a position candidate; a genuine lower-ranked declaration can win.
function positionValue(value) {
  const keyword=value.trim().toLowerCase();
  if(keyword==='initial')return 'static';
  if(keyword==='-webkit-sticky')return 'sticky';
  return ['static','relative','absolute','fixed','sticky'].includes(keyword)?keyword:null;
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

// Parsing one property in an empty declaration is independent of element,
// selector and cascade rank. Cache only that immutable expansion, never winners.
const EXPANDED_VALUES=new Map();
function expandedEntries(property,value){
 const key=property+'\0'+value;if(EXPANDED_VALUES.has(key))return EXPANDED_VALUES.get(key);
 const expanded=new CSSStyleDeclaration();expanded.setProperty(property,value);
 let entries=property==='opacity'?[{name:property,entry:value}]:[...expanded._values].map(([name,entry])=>({name,entry}));
 if(property==='overflow'){
  const axes=overflowAxes(value);if(axes)entries.push({name:'overflow-x',entry:axes[0]},{name:'overflow-y',entry:axes[1]});
  else if(/var\(/.test(value))entries.push({name:'overflow-x',entry:value,overflowPart:0},{name:'overflow-y',entry:value,overflowPart:1});
  else entries=null;
 }
 if(EXPANDED_VALUES.size<1000)EXPANDED_VALUES.set(key,entries);return entries;
}

function cascade(record, element) {
  const values = new Map(); let order = 0;
  const matchSelector=createScopedMatcher(record.document,record.document.documentElement);record.badStyleSelectors??=new Set();
  const layerRoot={children:new Map(),rank:Number.MAX_SAFE_INTEGER},layerNodes=new WeakMap();
  const registerLayer=(parent,name,key)=>{
    if(!name){const node={children:new Map()};parent.children.set(key,node);return node;}
    if(!/^[\w-]+(?:\.[\w-]+)*$/.test(name))return null;
    for(const part of name.split('.')){if(!parent.children.has(part))parent.children.set(part,{children:new Map()});parent=parent.children.get(part);}return parent;
  };
  const collectLayers=(rules,parent=layerRoot,depth=0)=>{if(depth>32)return;for(const rule of rules){const group=nestedGroupContents(rule);
    if(group?.kind==='layerStatement'){for(const name of group.names)registerLayer(parent,name,rule);}
    else if(group?.kind==='layer'){const node=registerLayer(parent,group.name,rule);if(node){layerNodes.set(rule,node);collectLayers(group.rules,node,depth+1);}}
    else if(group?.kind==='media'){if(mediaMatches(record,group.media))collectLayers(group.rules,parent,depth+1);}
    else if(rule.type===4&&rule.cssRules){if(mediaMatches(record,rule.media?.mediaText??''))collectLayers(rule.cssRules,parent,depth+(rule.type===4?1:0));}
    else if(rule.type===1&&rule.cssRules)collectLayers(rule.cssRules,parent,depth+(rule.type===4?1:0));
  }};
  const authorSheets=scopeSheets(record,rootOf(element)).filter(({sheet,media})=>!sheet.disabled&&mediaMatches(record,media));
  for(const{sheet}of authorSheets)if(!flatSheetState(sheet))collectLayers(sheet.cssRules);
  let layerRank=0;const rankLayers=node=>{for(const child of node.children.values())rankLayers(child);if(node!==layerRoot)node.rank=++layerRank;};rankLayers(layerRoot);
  const offer = (style, score, origin, inline = false, layer=layerRoot) => {
    style = declaration(style);
    for (let index = 0; index < style.length; index++) {
      const property = style[index];
      let value = style.getPropertyValue(property);
      if (property === 'text-transform') { value = textTransformValue(value); if (value === null) continue; }
      if (property === 'position') { value = positionValue(value); if (value === null) continue; }
      const important = style.getPropertyPriority(property) === 'important';
      const entries=expandedEntries(property,value);if(!entries)continue;
      // cssstyle's pinned parsed value map includes genuine shorthand
      // expansions except overflow. Its independently expanded axes likewise
      // take part in source order, specificity and importance.
      for (const { name, entry, overflowPart } of entries) {
        const key = [important ? 1 : 0, important && origin === 0 ? 2 : origin, inline ? 1 : 0, important?-layer.rank:layer.rank, ...score, order++];
        const list = values.get(name) ?? []; list.push({ value: entry, key, origin, overflowPart }); values.set(name, list);
      }
    }
  };
  const resolveNested=(selector,parent)=>{
    if(!parent)return selector;
    let result='',ampersand=false,quote=null,brackets=0;
    for(let i=0;i<selector.length;i++){
      const c=selector[i];if(c==='\\'){result+=c+(selector[++i]??'');continue;}
      if(quote){result+=c;if(c===quote)quote=null;continue;}
      if(c==='"'||c==="'"){quote=c;result+=c;continue;}
      if(c==='[')brackets++;if(c===']')brackets--;
      if(c==='&'&&!brackets){result+=`:is(${parent})`;ampersand=true;}else result+=c;
    }
    return ampersand?result:`:is(${parent}) ${result}`;
  };
  const matchResults=new Map(),documentImpl=implForWrapper(record.document);
  let matchTree,matchState,matchDialogs,matchFocus,matchFragment;
  const selectorScore=selectorText=>{
    const tree=documentImpl._version,state=record.stateRevision,dialogs=getSelectorStateRevision(record.window),focus=documentImpl._lastFocusedElement,fragment=documentImpl._URL?.fragment;
    if(tree!==matchTree||state!==matchState||dialogs!==matchDialogs||focus!==matchFocus||fragment!==matchFragment){matchResults.clear();matchTree=tree;matchState=state;matchDialogs=dialogs;matchFocus=focus;matchFragment=fragment;}
    if(matchResults.has(selectorText))return matchResults.get(selectorText);
    let highest=null;
    record.selectorParts??=new Map();let parts=record.selectorParts.get(selectorText);if(!parts){parts=splitTopLevel(selectorText);record.selectorParts.set(selectorText,parts);}
    for(const selector of parts) {
      if(/:host|::slotted|::part/.test(selector)){record.unsupported.add(':host, ::slotted and ::part selectors');continue;}
      if(record.badStyleSelectors.has(selector))continue;
      try{if(matchSelector(selector,element)){const score=specificity(selector);if(!highest||compare(score,highest)>0)highest=score;}}
      catch(error){if(error?.name==='SyntaxError')record.badStyleSelectors.add(selector);record.unsupported.add('Selectors unsupported by the pinned DOM selector engine');}
    }
    matchResults.set(selectorText,highest);
    return highest;
  };
  const offerSelector=(selectorText,style,origin,layer=layerRoot)=>{const highest=selectorScore(selectorText);if(highest)offer(style,highest,origin,false,layer);};
  const walkFlat=(state,origin)=>{const matches=[];for(const[selector,entries]of state.groups){if(!selector)continue;const score=selectorScore(selector);if(score)for(const entry of entries)matches.push({...entry,score});}matches.sort((a,b)=>a.index-b.index);for(const{value,score}of matches){const style=deferredRuleStyle(value);if(style)offer(style,score,origin,false,layerRoot);}};

  const walk = (rules, origin, parent=null, layer=layerRoot, depth=0) => {
    if(depth>32)return;
    for (const rule of rules) {
      if(rule.selectorText&&rule.style) {
        const selector=parent?ruleSelectorParts(rule).map(part=>resolveNested(part,parent)).join(', '):rule.selectorText;
        offerSelector(selector,rule.style,origin,layer);
        if(rule.cssRules?.length)walk(rule.cssRules,origin,selector,layer,depth);
      } else if(nestedGroupContents(rule)) {
        const group=nestedGroupContents(rule);
        if(group.kind==='layer'){const child=layerNodes.get(rule);if(child){if(parent&&group.style)offerSelector(parent,group.style,origin,child);walk(group.rules,origin,parent,child,depth+1);}}
        else if(group.kind==='media'&&parent&&mediaMatches(record,group.media)){offerSelector(parent,group.style,origin,layer);walk(group.rules,origin,parent,layer,depth+1);}
      } else if(rule.type===4&&rule.cssRules) {
        if(mediaMatches(record,rule.media?.mediaText??rule.conditionText??''))walk(rule.cssRules,origin,parent,layer,depth+1);
      } else if(rule.cssRules&&rule.type!==7)record.unsupported.add('Cascade layers, @supports and other grouping rules');
    }
  };
  walk(uaRulesFor(element), 0);
  if (element.localName === 'a' && element.hasAttribute('href')) {
    const link = new CSSStyleDeclaration(); link.color = 'rgb(0, 0, 238)'; offer(link, [0, 1, 1], 0);
  }
  const root = rootOf(element);
  for(const{sheet}of authorSheets){const flat=flatSheetState(sheet);if(flat)walkFlat(flat,1);else walk(sheet.cssRules,1);}
  offer(implForWrapper(element)._style, [0, 0, 0], 1, true);
  const chosen = new Map();chosen.orderKeys=new Map();
  for (const [property, candidates] of values) {
    candidates.sort((a, b) => compare(b.key, a.key));
    let winner = candidates[0];
    if (winner.value.toLowerCase() === 'revert' || winner.value.toLowerCase() === 'revert-layer') winner = candidates.find(candidate => candidate.origin === 0);
    if(winner){chosen.set(property,winner.overflowPart===undefined?winner.value:{value:winner.value,overflowPart:winner.overflowPart});chosen.orderKeys.set(property,winner.key);}
  }
  return chosen;
}

normalizeRules(UA.cssRules, UA);
// The private UA sheet is immutable after normalization. Keep actual rule
// objects in source order, indexed only by parser-proven subject type.
const UA_TYPES=new WeakMap(),UA_CANDIDATES=new Map();
for(const rule of UA.cssRules)if(rule.selectorText)UA_TYPES.set(rule,selectorSubjectTypes(rule.selectorText));
function uaRulesFor(element){
 const impl=implForWrapper(element),fold=impl._ownerDocument._parsingMode==='html',name=fold?element.localName.replace(/[A-Z]/g,c=>c.toLowerCase()):element.localName,key=(fold?'h:':'x:')+name;
 let rules=UA_CANDIDATES.get(key);if(rules)return rules;
 rules=Array.from(UA.cssRules).filter(rule=>{const types=UA_TYPES.get(rule);return !types||types.some(type=>(fold?type.replace(/[A-Z]/g,c=>c.toLowerCase()):type)===name);});
 if(UA_CANDIDATES.size<1000)UA_CANDIDATES.set(key,rules);return rules;
}


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
  const chosen = cascade(record, element), result = new CSSStyleDeclaration(); memo.set(element, { token, style: result, specified: chosen });
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
  for (const [property,value] of custom) result.setProperty(property,value);
  const properties = [...new Set([...Object.keys(initial), ...chosen.keys()])].sort((a, b) => Number(shorthands.has(b)) - Number(shorthands.has(a)));
  const resolve = property => {
    const inheriting = inherited.has(property), fallback = initial[property] ?? '';
    const parentValue = parentStyle?.getPropertyValue(property) || fallback;
    const selection = chosen.get(property);
    let value = typeof selection === 'object' ? selection.value : selection;
    if (value === undefined) value = inheriting ? parentValue : fallback;
    // Native exposes declared variable token streams without substitution.
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
    if (property === 'transform' || property === '-webkit-transform') value = computedTransform(value);
    if (property === 'font-size') {
      const rootElement = record.document.documentElement;
      const rootSize = element === rootElement ? '16px' : compute(record,rootElement,memo).fontSize;
      value = computedFontSize(value,parentStyle?.fontSize,rootSize,{isRoot:element===rootElement});
    }
    if (['display','visibility','position','pointer-events','overflow','overflow-x','overflow-y','content-visibility'].includes(property)&&typeof value==='string')value=value.toLowerCase();
    if (property === 'font-weight') value = ({ normal: '400', bold: '700' })[value] ?? value;
    if (property.endsWith('color') && value) { try { value = getComputedOrUsedColor(value); } catch {} }
    // Cascade declarations have already passed their property grammar. Store
    // computed longhands directly: declaration setters can clear border widths
    // while serializing border-style:none, which is invalid for computed state.
    result._setProperty(property,value);
  }
  for(const shorthand of ['margin','padding','border-width','border-style','border-color']) {
    const values=['top','right','bottom','left'].map(side=>result.getPropertyValue(shorthand.startsWith('border-')?'border-'+side+'-'+shorthand.slice(7):shorthand+'-'+side));
    if(values.every(Boolean)){const [top,right,bottom,left]=values;result._setProperty(shorthand,top===right&&top===bottom&&top===left?top:top===bottom&&right===left?top+' '+right:right===left?top+' '+right+' '+bottom:values.join(' '));}
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

function computedStyle(record, element, pseudo = '') {
  record.views ??= new WeakMap();
  let views = record.views.get(element); if (!views) { views = new Map(); record.views.set(element, views); }
  if (views.has(pseudo)) return views.get(pseudo);
  let token, cached;
  const current = () => {
    const next = localToken(record, element);
    if (token !== next) { cached = compute(record, element, undefined, next); token = next; }
    return cached;
  };
  const readonly = () => { throw new record.window.DOMException('Computed styles are readonly', 'NoModificationAllowedError'); };
  const view = new Proxy(new CSSStyleDeclaration(), {
    get(target, property) {
      if (['setProperty', 'removeProperty'].includes(property)) return readonly;
      if (property === 'cssText') return '';
      if (property === Symbol.iterator) return function* () { const value = current(); for (let index = 0; index < value.length; index++) yield value[index]; };
      const value = Reflect.get(current(), property);
      return typeof value === 'function' && property !== 'constructor' ? value.bind(current()) : value;
    },
    set: readonly, deleteProperty: readonly, defineProperty: readonly,
  });
  registerHeapWrapper(view,record.window);
  views.set(pseudo,view); return view;
}

export function getStyleRevision(window) {
  const record = recordFor(window?.document);
  if (!record) return 0;
  const tokens = [getSelectorStateRevision(window), window.innerWidth, window.innerHeight, record.stateRevision, record.window.location.href, id(implForWrapper(record.document)._lastFocusedElement ?? record.document)];
  const discoveryKey=JSON.stringify([record.scopeRevision??0,implForWrapper(record.document)._version,...(record.scopeRoots??[]).map(root=>[id(root),implForWrapper(root)._version])]);
  if(discoveryKey!==record.scopeDiscoveryKey){
    const roots=[],slots=[];const discover=root=>{roots.push(root);for(const element of root.querySelectorAll('*')){const implementation=implForWrapper(element);if(element.localName==='slot')slots.push(implementation);if(implementation._shadowRoot)discover(wrapperForImpl(implementation._shadowRoot));}};discover(record.document);record.scopeRoots=roots;record.scopeSlots=slots;
    record.scopeDiscoveryKey=JSON.stringify([record.scopeRevision??0,implForWrapper(record.document)._version,...roots.map(root=>[id(root),implForWrapper(root)._version])]);
  }
  for(const root of record.scopeRoots){tokens.push(id(root),implForWrapper(root)._version);for(const{sheet,media}of scopeSheets(record,root))tokens.push(media,sheetFingerprint(sheet));}
  for(const slot of record.scopeSlots)tokens.push(id(slot),(slot._assignedNodes??[]).map(id));
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
  const record = { page, window, document, Array:window.Array, originalGetComputedStyle: window.getComputedStyle, originalStyleSheetGetter: function () {
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
  record.originalSheetPrototype=originalConstructor.prototype;record.sheetPrototype=CSSStyleSheet.prototype;
  window.CSSStyleSheet = CSSStyleSheet;
  window.getComputedStyle = function getComputedStyle(element, pseudo = null) {
    if (!ElementInterface.is(element)) throw new window.TypeError('getComputedStyle requires an Element');
    let key = pseudo == null ? '' : String(pseudo).toLowerCase();
    if (!key.startsWith(':')) key = '';
    else key = key.replace(/^:(before|after|first-letter|first-line)$/, '::$1');
    const owner = recordFor(element.ownerDocument);
    return owner ? computedStyle(owner, element, key) : record.originalGetComputedStyle.call(window, element);
  };
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true; RECORDS.delete(document);
    record.signal?.removeEventListener('abort', dispose); page.off?.('close', dispose);
    if (window.close === record.close) window.close = record.originalClose;
  };
  record.controller = { dispose, get revision() { return getStyleRevision(window); }, unsupported: record.unsupported };
  if (!record.signal?.aborted && !page.closed) RECORDS.set(document, record);
  const indeterminate=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'indeterminate');
  if(indeterminate?.set)Object.defineProperty(window.HTMLInputElement.prototype,'indeterminate',{...indeterminate,set(value){const result=indeterminate.set.call(this,value);const owner=recordFor(this.ownerDocument);if(owner)owner.stateRevision++;return result;}});

  record.close = function () { dispose(); return record.originalClose.call(window); }; window.close = record.close;
  record.signal?.addEventListener('abort', dispose, { once: true }); page.once?.('close', dispose);
  return record.controller;
}

// Internal SVG metrics resolve relative font values against actual ancestors.
// This exposes the existing cascade winner without changing CSSOM behavior.
export function getCascadedStyleValue(element, property) {
  if (!ElementInterface.is(element)) return undefined;
  const record = recordFor(element.ownerDocument);
  if (!record) return element.style?.getPropertyValue(property) || undefined;
  const value = cascade(record, element).get(property);
  if (typeof value === 'string' && /var\(/.test(value)) return computedStyle(record, element).getPropertyValue(property);
  return typeof value === 'object' ? value.value : value;
}

// Host-only projection over the same real cascade, used while building all
// surrogate boxes. It avoids allocating a full public CSS declaration for
// every node when only flow properties are needed.
const FLOW_PROPERTIES=['display','position','float','width','height','min-width','max-width','margin-left','margin-right','flex-grow','flex-shrink','flex-direction','flex-wrap','overflow-x','overflow-y','visibility','pointer-events','opacity','direction','font-size','white-space','text-wrap','text-wrap-mode'];
const FLOW_ENTRIES=FLOW_PROPERTIES.map(name=>[name,name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),initial[name]??'']);
export function getLayoutStyle(element,revision){
 const record=recordFor(element.ownerDocument);if(!record)return null;
 const token=revision===undefined?localToken(record,element):'layout-revision:'+revision;record.layoutMemo??=new WeakMap();const retained=record.layoutMemo.get(element);if(retained?.token===token)return retained.style;
 const parent=inheritanceParent(element),parentStyle=parent?getLayoutStyle(parent,revision):null,chosen=cascade(record,element),style=Object.create(null);
 for(const[name,key,fallback]of FLOW_ENTRIES){const parentValue=parentStyle?.[key]||fallback;let value=chosen.get(name);if(typeof value==='object')value=value.value;const keyword=value?.toLowerCase();if(value===undefined||keyword==='unset')value=inherited.has(name)?parentValue:fallback;else if(keyword==='inherit')value=parentValue;else if(keyword==='initial')value=fallback;if(['display','position','float','visibility','pointer-events'].includes(name))value=value.toLowerCase();style[key]=value;}
 const fontRoot=element===record.document.documentElement?'16px':record.layoutMemo.get(record.document.documentElement)?.style.fontSize??'16px';style.fontSize=computedFontSize(style.fontSize,parentStyle?.fontSize,fontRoot,{isRoot:element===record.document.documentElement});
 const flow=chosen.get('flex-flow');if(typeof flow==='string'){const parts=flow.toLowerCase().split(/\s+/),directions=['row','row-reverse','column','column-reverse'],wraps=['wrap','wrap-reverse','nowrap'];if(parts.length<=2&&parts.every(p=>directions.includes(p)||wraps.includes(p))){for(const[property,key,value]of[['flex-direction','flexDirection',parts.find(p=>directions.includes(p))??'row'],['flex-wrap','flexWrap',parts.find(p=>wraps.includes(p))??'nowrap']]){const explicit=chosen.orderKeys.get(property);if(!explicit||compare(chosen.orderKeys.get('flex-flow'),explicit)>0)style[key]=value;}}}
 const directions=style.direction==='rtl'?['marginRight','marginLeft']:['marginLeft','marginRight'];
 const physicalKeys={marginLeft:chosen.orderKeys.get('margin-left'),marginRight:chosen.orderKeys.get('margin-right')};
 for(const name of ['margin-inline','margin-inline-start','margin-inline-end']){const value=chosen.get(name);if(typeof value!=='string')continue;const parts=splitTopLevel(value.replace(/\t|\n|\r|\f/g,' '),' ').filter(Boolean);if(!parts.length||parts.length>2)continue;const pairs=name==='margin-inline'?[[directions[0],parts[0]],[directions[1],parts[1]??parts[0]]]:[[directions[name.endsWith('start')?0:1],parts[0]]];for(const[key,entry]of pairs){const order=chosen.orderKeys.get(name);if(!physicalKeys[key]||compare(order,physicalKeys[key])>0){style[key]=entry;physicalKeys[key]=order;}}}
 let x=style.overflowX==='overlay'?'auto':style.overflowX,y=style.overflowY==='overlay'?'auto':style.overflowY;if(![x,y].every(v=>v==='visible'||v==='clip')){x=x==='visible'?'auto':x==='clip'?'hidden':x;y=y==='visible'?'auto':y==='clip'?'hidden':y;}style.overflowX=x;style.overflowY=y;
 if(element===record.document.documentElement)style.display=({inline:'block','inline-block':'block','inline-flex':'flex','inline-grid':'grid',contents:'block'})[style.display]??style.display;
 record.layoutMemo.set(element,{token,style,specified:chosen});return style;
}
export function getSpecifiedStyle(element,name,revision){const record=recordFor(element.ownerDocument);if(!record)return element.style?.getPropertyValue(name)||undefined;getLayoutStyle(element,revision);return record.layoutMemo.get(element)?.specified.get(name);}
export function hasSpecifiedStyle(element,name,revision){const record=recordFor(element.ownerDocument);if(!record)return !!element.style?.getPropertyValue(name);getLayoutStyle(element,revision);return record.layoutMemo.get(element)?.specified.has(name)??false;}

export function getLayoutCacheRevision(window){return recordFor(window.document)?getStyleRevision(window):undefined;}

// Shared real flat-tree parent for consumers of inherited SVG presentation values.
export { inheritanceParent as getStyleInheritanceParent };
