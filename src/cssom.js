// Scoped CSSOM adaptation. Parsing is token based so strings, comments, URLs and
// balanced component values do not accidentally become declaration boundaries.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dependencyRequire = createRequire(require.resolve('jsdom/lib/jsdom/living/helpers/style-rules.js'));
const cssom = dependencyRequire('rrweb-cssom');
const { CSSStyleDeclaration } = dependencyRequire('cssstyle');
const BASE = CSSStyleDeclaration.prototype;
const DECLARATIONS = new WeakSet();
const LISTS = new WeakMap();
const MUTATIONS = new WeakMap();
const LENGTHS = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|top|right|bottom|left|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|scroll-(?:margin|padding)(?:-.+)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-width|column-(?:width|gap|rule-width)|outline(?:-width|-offset)?|shape-margin|perspective|text-indent|letter-spacing|word-spacing|flex-basis)$/;
const BASELINE = new Set(['align-items','align-content','align-self','justify-items','justify-content','justify-self','place-items','place-content','place-self']);
const PAIRS = new Set(['place-items','place-content','place-self','gap','overflow','overscroll-behavior','scroll-snap-align']);
const camelToDashed = name => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

function withoutComments(text) {
  let output = '', quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { output += c + (text[++i] ?? ''); continue; }
    if (quote) { output += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; output += c; continue; }
    if (/^url\(/i.test(text.slice(i)) && !/[\w-]/.test(text[i-1] ?? '')) { const end = balancedEnd(text, i+3); output += text.slice(i,end+1); i=end; continue; }
    if (c === '/' && text[i+1] === '*') { const end = text.indexOf('*/',i+2); if (end < 0) break; i = end+1; output += ' '; }
    else output += c;
  }
  return output;
}

function balancedEnd(text, start) {
  const pairs = { '(':')', '[':']', '{':'}' }; const stack = [pairs[text[start]]]; let quote = null;
  for (let i = start+1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return i; }
  }
  return text.length;
}

// Each returned item is a component-value chunk bounded by a top-level semicolon.
// In a stylesheet, nested rule blocks end at their closing brace. Declaration
// cssText instead discards the entire invalid declaration through its semicolon.
export function parseDeclarations(source, { nesting = false } = {}) {
  const text = withoutComments(String(source)); const chunks = []; let chunk = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { chunk += c + (text[++i] ?? ''); continue; }
    if (c === '"' || c === "'") {
      let end = i+1; for (; end<text.length; end++) { if(text[end]==='\\')end++; else if(text[end]===c)break; }
      chunk += text.slice(i,end+1); i=end; continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      const end = balancedEnd(text,i);
      if (nesting && c === '{' && !/^\s*--[^:]+:/.test(chunk)) chunk = '';
      else chunk += text.slice(i,end+1);
      i=end; continue;
    }
    if (c === ';') { chunks.push(chunk); chunk = ''; } else chunk += c;
  }
  chunks.push(chunk); const declarations = [];
  for (const raw of chunks) {
    const colon=raw.indexOf(':'); if(colon<0)continue;
    const property=raw.slice(0,colon).trim();
    if(!/^(?:--[\w\u0080-\uffff-]+|-?[a-zA-Z][\w-]*)$/.test(property))continue;
    let value=raw.slice(colon+1).trim(); if(!value)continue;
    let priority=''; const important=/!\s*important\s*$/i.exec(value);
    if(important){value=value.slice(0,important.index).trim();priority='important';}
    if(!property.startsWith('--') && /[{}]/.test(value.replace(/(['"])(?:\\.|(?!\1).)*?\1/g,'')))continue;
    if(value)declarations.push({property:property.startsWith('--')?property:property.toLowerCase(),value,priority});
  }
  return declarations;
}

function normalizeAnchors(value) {
  return value.replace(/anchor-size\(/gi, 'anchor-size(').replace(/anchor-size\(([^()]*)\)/g, (whole,body) => {
    const comma=body.indexOf(','); const head=(comma<0?body:body.slice(0,comma)).trim().split(/\s+/);
    if(head.length===2 && /^(?:width|height|block|inline|self-block|self-inline)$/.test(head[0]) && /^--/.test(head[1])) head.reverse();
    return `anchor-size(${head.join(' ')}${comma<0?'':`, ${body.slice(comma+1).trim()}`})`;
  });
}

export function normalizeCSSValue(property, value) {
  if(typeof value !== 'string') return value;
  value=value.trim();
  if(LENGTHS.test(property) && /^[+-]?0(?:\.0+)?$/.test(value))value='0px';
  if(BASELINE.has(property))value=value.replace(/^first\s+baseline\b/i,'baseline');
  if(PAIRS.has(property)){const parts=value.split(/\s+/);if(parts.length===2&&parts[0]===parts[1])value=parts[0];}
  // Inner functions are normalized first, then the outer function's argument
  // prelude. Balanced scanning preserves nested fallback component values.
  if(LENGTHS.test(property) && /anchor-size\(/i.test(value)) {
    const visit = text => {
      let result='';
      for(let i=0;i<text.length;i++) {
        const found=/^anchor-size\(/i.exec(text.slice(i));
        if(!found){result+=text[i];continue;}
        const start=i+found[0].length-1,end=balancedEnd(text,start);
        if(end===text.length){result+=text.slice(i);break;}
        let body=visit(text.slice(start+1,end));
        body=body.replace(/^\s*(width|height|block|inline|self-block|self-inline)\s+(--[\w-]+)(?=\s*(?:,|$))/, '$2 $1');
        result+=normalizeAnchors(`anchor-size(${body})`); i=end;
      }
      return result;
    };
    value=visit(value);
  }
  return value;
}

function transformURLs(value, transform) {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\') { result += c + (value[++i] ?? ''); continue; }
    if (c === '"' || c === "'") {
      let end = i+1; for (; end < value.length; end++) { if (value[end] === '\\') end++; else if (value[end] === c) break; }
      result += value.slice(i,end+1); i=end; continue;
    }
    if (/^url\(/i.test(value.slice(i)) && !/[\w-]/.test(value[i-1] ?? '')) {
      const end = balancedEnd(value,i+3);
      if (end < value.length) { result += transform(value.slice(i,end+1),value.slice(i+4,end).trim()); i=end; continue; }
    }
    result += c;
  }
  return result;
}

// The pinned shorthand parser rejects whitespace even in a quoted URL. Use a
// percent-encoded token for its grammar check and restore the authored token
// in both the shorthand and its expanded longhands before notifying observers.
function encodeURLForParser(body) {
  return body.replace(/\\.|[ ()']/g, token => token.length > 1 ? token : `%${token.charCodeAt(0).toString(16).toUpperCase()}`);
}
function parserInput(value, property) {
  if (!/^(?:background(?:-image)?|border-image(?:-source)?|list-style(?:-image)?|mask(?:-image)?)$/.test(property)) return value;
  if (typeof value !== 'string') return value;
  return transformURLs(value, (whole, body) => {
    const quoted = /^(["'])([\s\S]*)\1$/.exec(body);
    if (!quoted || /[\r\n\f]/.test(quoted[2])) return whole;
    const encoded = encodeURLForParser(quoted[2]);
    return `url(${quoted[1]}${encoded}${quoted[1]})`;
  });
}

function restoreUnquotedURLs(style,input,property) {
  const unquoted = new Set(), authored = new Map();
  transformURLs(input, (whole, body) => {
    if (/^[^\s'"()]+$/.test(body)) unquoted.add(body);
    const quoted = /^(["'])([\s\S]*)\1$/.exec(body);
    if(quoted && encodeURLForParser(quoted[2])!==quoted[2])authored.set(encodeURLForParser(quoted[2]),whole);
    return whole;
  });
  if (!unquoted.size && !authored.size) return;
  for (const [name,value] of style._values) {
    if ((name !== property && !name.startsWith(property+'-')) || typeof value !== 'string') continue;
    style._values.set(name, transformURLs(value, (whole, body) => {
      const quoted = /^(["'])([\s\S]*)\1$/.exec(body);
      if(quoted && authored.has(quoted[2]))return authored.get(quoted[2]);
      return quoted && unquoted.has(quoted[2]) ? `url(${quoted[2]})` : whole;
    }));
  }
}

function change(style, callback, { explicit = false } = {}) {
  if(style._readonly)throw new style._global.DOMException('Computed styles are readonly','NoModificationAllowedError');
  const previous=style.cssText, setting=style._setInProgress, onChange=style._onChange;
  // Pinned cssstyle's removeProperty notifies even inside a shorthand/setProperty
  // batch. Silence intermediate writes, then commit the actual final declaration
  // once. Explicit cssText assignment commits even an identical declaration.
  style._setInProgress=true;style._onChange=null;
  try{return callback();}finally{
    style._setInProgress=setting;style._onChange=onChange;
    const current=style.cssText;
    if(!setting&&(explicit||previous!==current))onChange?.call(style,current);
  }
}

const COMPAT = Object.create(BASE);
for(const [name,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(BASE))) {
  if(!descriptor.set || ['cssText','length'].includes(name))continue;
  const property=name==='cssFloat'?'float':camelToDashed(name);
  Object.defineProperty(COMPAT,name,{...descriptor,set(value){
    return change(this,()=>{
      const input=normalizeCSSValue(property,typeof value==='number'?String(value):value);
      const before = MUTATIONS.get(this);
      descriptor.set.call(this,parserInput(input,property));
      if(typeof input==='string' && LENGTHS.test(property) && /^anchor-size\(/i.test(input) && balancedEnd(input,input.indexOf('('))===input.length-1)this._setProperty(property,input);
      if(typeof input==='string' && MUTATIONS.get(this)!==before)restoreUnquotedURLs(this,input,property);
    });
  }});
}
Object.defineProperties(COMPAT, {
  _setProperty:{configurable:true,value(property,value,priority){
    if(typeof value==='string')MUTATIONS.set(this,(MUTATIONS.get(this)??0)+1);
    return BASE._setProperty.call(this,property,value,priority);
  }},
  cssText:{configurable:true,enumerable:true,get:Object.getOwnPropertyDescriptor(BASE,'cssText').get,set(value){
    change(this,()=>{
      this.length=0;this._values.clear();this._priorities.clear();
      for(const item of parseDeclarations(value??'')) {
        if(this.getPropertyPriority(item.property)==='important'&&item.priority!=='important')continue;
        this.setProperty(item.property,item.value,item.priority);
      }
    },{explicit:true});
  }},
  removeProperty:{configurable:true,writable:true,value(property){
    property=String(property);if(!property.startsWith('--'))property=property.toLowerCase();
    return change(this,()=>BASE.removeProperty.call(this,property));
  }},
  setProperty:{configurable:true,writable:true,value(property,value,priority=''){
    property=String(property);priority=priority==null?'':String(priority);
    if(value != null && String(value) !== '' && priority && !/^important$/i.test(priority))return;
    return change(this,()=>{
      const normalized=normalizeCSSValue(property.startsWith('--')?property:property.toLowerCase(),value==null?'':String(value));
      const before=MUTATIONS.get(this), previousPriority=this.getPropertyPriority(property);
      BASE.setProperty.call(this,property,normalized,priority.toLowerCase());
      if(MUTATIONS.get(this)===before && normalized!=='') {
        if(previousPriority)this._priorities.set(property,previousPriority);else this._priorities.delete(property);
        return;
      }
      if(priority && this.getPropertyValue(property))this._priorities.set(property,priority.toLowerCase());
      if(typeof normalized==='string')restoreUnquotedURLs(this,normalized,property.toLowerCase());
    });
  }},
  [Symbol.iterator]:{configurable:true,value:function*(){for(let i=0;i<this.length;i++)yield this[i];}},
});

export function enhanceDeclaration(style, window) {
  if(!DECLARATIONS.has(style)) {Object.setPrototypeOf(style,COMPAT);DECLARATIONS.add(style);}
  if(window)style._global=window;
  return style;
}
export function createDeclaration(text='', options={}) {
  const style=enhanceDeclaration(new CSSStyleDeclaration(),options.window);
  for(const item of parseDeclarations(text,options)) {
    if(style.getPropertyPriority(item.property)==='important'&&item.priority!=='important')continue;
    style.setProperty(item.property,item.value,item.priority);
  }
  return style;
}

export class CSSRuleList {
  constructor(rules=[]) {
    const list=new Proxy(this,{get(target,key,receiver){if(typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key))return LISTS.get(receiver)[Number(key)];return Reflect.get(target,key,receiver);},
      has(target,key){return typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)?Number(key)<LISTS.get(list).length:Reflect.has(target,key);},
      ownKeys(){return LISTS.get(list).map((_,i)=>String(i));},
      getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)&&Number(key)<LISTS.get(list).length)return{configurable:true,enumerable:true,value:LISTS.get(list)[Number(key)],writable:false};return Reflect.getOwnPropertyDescriptor(target,key);},
      set(){return false;},deleteProperty(){return false;},defineProperty(){return false;}});
    LISTS.set(list,[...rules]);return list;
  }
  get length(){return LISTS.get(this).length;}
  *[Symbol.iterator](){for(let i=0;i<this.length;i++)yield this[i];}
  get [Symbol.toStringTag](){return 'CSSRuleList';}
}
export function asRuleList(rules) {return LISTS.has(rules)?rules:new CSSRuleList(rules);}
export function spliceRules(rules,...args){return LISTS.get(rules).splice(...args);}

function parseRuleBlocks(text) {
  const result=[]; text=withoutComments(String(text));let start=0;
  for(let i=0;i<text.length;i++) {
    const c=text[i];if(c==='\\'){i++;continue;}
    if(c==='"'||c==="'"){let end=i+1;for(;end<text.length;end++){if(text[end]==='\\')end++;else if(text[end]===c)break;}i=end;continue;}
    if(c==='('||c==='['){i=balancedEnd(text,i);continue;}
    if(c===';'){const prelude=text.slice(start,i).trim();if(prelude.startsWith('@'))result.push({prelude,body:null,text:prelude+';'});start=i+1;}
    else if(c==='{'){const end=balancedEnd(text,i),prelude=text.slice(start,i).trim();if(prelude)result.push({prelude,body:text.slice(i+1,end),text:text.slice(start,Math.min(end+1,text.length)).trim()});i=end;start=i+1;}
  }
  return result;
}

export function parseStyleSheet(text,{window,onUnsupported}={}) {
  const sheet=new cssom.CSSStyleSheet();const rules=[];
  for(const entry of parseRuleBlocks(text)) {
    const {prelude,body}=entry;let rule;
    if(!prelude.startsWith('@') && body!==null) {
      rule=new cssom.CSSStyleRule();rule.selectorText=prelude;rule.style=createDeclaration(body,{nesting:true,window});rule.cssRules=new CSSRuleList();
    } else if(/^@(?:-webkit-)?keyframes\s+/i.test(prelude) && body!==null) {
      rule=new cssom.CSSKeyframesRule();rule.name=prelude.replace(/^@(?:-webkit-)?keyframes\s+/i,'');if(/^@-webkit-/i.test(prelude))rule._vendorPrefix='-webkit-';
      rule.cssRules=new CSSRuleList(parseRuleBlocks(body).filter(item=>item.body!==null).map(item=>{const frame=new cssom.CSSKeyframeRule();frame.keyText=item.prelude;frame.style=createDeclaration(item.body,{window});return frame;}));
    } else if(/^@(?:media|supports)\b/i.test(prelude) && body!==null) {
      if(/^@media\b/i.test(prelude)){rule=new cssom.CSSMediaRule();rule.media.mediaText=prelude.replace(/^@media\s*/i,'');}
      else{rule=new cssom.CSSSupportsRule();rule.conditionText=prelude.replace(/^@supports\s*/i,'');}
      rule.cssRules=parseStyleSheet(body,{window,onUnsupported}).cssRules;
    } else if(/^@font-face\s*$/i.test(prelude)&&body!==null) {
      rule=new cssom.CSSFontFaceRule();rule.style=createDeclaration(body,{window});
      // Descriptor grammars differ from ordinary element properties. Keep the
      // parser's declaration boundaries, including src and font descriptors.
      for(const item of parseDeclarations(body))if(!rule.style.getPropertyValue(item.property))rule.style._setProperty(item.property,item.value,item.priority);
    } else if(/^@import\b/i.test(prelude)&&body===null) {
      try{rule=cssom.parse(entry.text).cssRules[0];}catch{continue;}
    } else if(prelude.startsWith('@')) {
      rule=new cssom.CSSRule();rule.type=0;Object.defineProperty(rule,'cssText',{configurable:true,enumerable:true,value:entry.text});onUnsupported?.('Unknown at-rules are retained without cascade semantics');
    }
    if(!rule)continue;
    if(rule.style){Object.defineProperty(rule.style,'parentRule',{configurable:true,value:rule});}
    if(rule.type===1)Object.defineProperty(rule,'cssText',{configurable:true,enumerable:true,get(){return `${this.selectorText} {${this.style.length?` ${this.style.cssText} `:' '}}`;},set(value){const parsed=parseStyleSheet(value,{window}).cssRules[0];if(parsed?.type===1){this.selectorText=parsed.selectorText;this.style=parsed.style;Object.defineProperty(this.style,'parentRule',{configurable:true,value:this});}}});
    rules.push(rule);
  }
  sheet.cssRules=new CSSRuleList(rules);return sheet;
}
