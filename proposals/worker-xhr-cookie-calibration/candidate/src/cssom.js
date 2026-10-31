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
const CHANGES=new WeakMap();
const LENGTHS = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|top|right|bottom|left|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|scroll-(?:margin|padding)(?:-.+)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-width|column-(?:width|gap|rule-width)|outline(?:-width|-offset)?|shape-margin|perspective|text-indent|letter-spacing|word-spacing|flex-basis)$/;
const BASELINE = new Set(['align-items','align-content','align-self','justify-items','justify-content','justify-self','place-items','place-content','place-self']);
const PAIRS = new Set(['place-items','place-content','place-self','gap','overflow','overscroll-behavior','scroll-snap-align']);
const camelToDashed = name => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

function withoutComments(text) {
  if(!text.includes('/*'))return text;
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
  // Position's public CSSOM token stream retains direct setter whitespace;
  // stylesheet/cssText declaration parsing already trims its own boundaries.
  if(property==='position')return value;
  value=value.trim();
  if(property === 'opacity') value=value.replace(/^([+-]?)\.(?=\d)/, (_, sign) => sign + '0.');
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
    if(!setting&&(explicit||previous!==current)){CHANGES.set(style,(CHANGES.get(style)??0)+1);onChange?.call(style,current);}
  }
}

const AXES = new Map([['overflow',new Set(['auto','scroll','hidden','clip','visible','overlay'])],['overscroll-behavior',new Set(['auto','contain','none'])]]);
const CSS_WIDE = new Set(['inherit','initial','unset','revert','revert-layer']);
const canonicalProperty = property => { property=String(property);return property.startsWith('--')?property:property.toLowerCase(); };
function axisValue(style,name) {
  const x=BASE.getPropertyValue.call(style,name+'-x'), y=BASE.getPropertyValue.call(style,name+'-y');
  if(!x||!y||BASE.getPropertyPriority.call(style,name+'-x')!==BASE.getPropertyPriority.call(style,name+'-y'))return '';
  return x===y?x:x+' '+y;
}
function axisSet(style,name,value,priority='') {
  if(value===''){BASE.removeProperty.call(style,name+'-x');BASE.removeProperty.call(style,name+'-y');return;}
  const parts=value.toLowerCase().trim().split(/\s+/), allowed=AXES.get(name);
  if(parts.length>2||parts.some(part=>!allowed.has(part)&&!CSS_WIDE.has(part)&&!/^var\([^\s()]*\)$/.test(part))||parts.length===2&&parts.some(part=>CSS_WIDE.has(part)))return;
  style._setProperty(name+'-x',parts[0],priority);style._setProperty(name+'-y',parts[1]??parts[0],priority);
  // _setProperty deliberately stores empty priority too: property assignment clears importance.
  for(const axis of ['x','y']){if(priority)style._priorities.set(name+'-'+axis,priority);else style._priorities.delete(name+'-'+axis);}
}
function serializedDeclaration(style) {
  if(style._computed)return '';
  const output=[],done=new Set();
  for(let i=0;i<style.length;i++) {
    let name=style[i];if(done.has(name))continue;
    const base=name.replace(/-[xy]$/,'');
    if(AXES.has(base)&&axisValue(style,base)){done.add(base+'-x');done.add(base+'-y');name=base;}
    const value=style.getPropertyValue(name),priority=style.getPropertyPriority(name);
    output.push(`${name}: ${value}${priority?' !'+priority:''};`);
  }
  return output.join(' ');
}
const COMPAT = Object.create(BASE);
for(const [name,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(BASE))) {
  if(!descriptor.set || ['cssText','length'].includes(name))continue;
  const property=name==='cssFloat'?'float':camelToDashed(name);
  Object.defineProperty(COMPAT,name,{...descriptor,set(value){
    return change(this,()=>{
      const input=normalizeCSSValue(property,typeof value==='number'?String(value):value);
      const before = MUTATIONS.get(this);
      if ((property === 'opacity'||property==='position') && typeof input === 'string' && input !== '') this._setProperty(property, input);
      else descriptor.set.call(this,parserInput(input,property));
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
  cssText:{configurable:true,enumerable:true,get(){return serializedDeclaration(this);},set(value){
    change(this,()=>{
      this.length=0;this._values.clear();this._priorities.clear();
      for(const item of parseDeclarations(value??'')) {
        if(this.getPropertyPriority(item.property)==='important'&&item.priority!=='important')continue;
        this.setProperty(item.property,item.value,item.priority);
      }
    },{explicit:true});
  }},
  getPropertyValue:{configurable:true,writable:true,value(property){property=canonicalProperty(property);return AXES.has(property)?axisValue(this,property):BASE.getPropertyValue.call(this,property);}},
  getPropertyPriority:{configurable:true,writable:true,value(property){property=canonicalProperty(property);return AXES.has(property)?(axisValue(this,property)?BASE.getPropertyPriority.call(this,property+'-x'):''):BASE.getPropertyPriority.call(this,property);}},
  removeProperty:{configurable:true,writable:true,value(property){
    property=canonicalProperty(property);
    return change(this,()=>{const previous=this.getPropertyValue(property);if(AXES.has(property)){BASE.removeProperty.call(this,property+'-x');BASE.removeProperty.call(this,property+'-y');return previous;}return BASE.removeProperty.call(this,property);});
  }},
  setProperty:{configurable:true,writable:true,value(property,value,priority=''){
    property=canonicalProperty(property);priority=priority==null?'':String(priority);
    if(value != null && String(value) !== '' && priority && !/^important$/i.test(priority))return;
    return change(this,()=>{
      const normalized=normalizeCSSValue(property.startsWith('--')?property:property.toLowerCase(),value==null?'':String(value));
      const before=MUTATIONS.get(this), previousPriority=this.getPropertyPriority(property);
      if(AXES.has(property)){axisSet(this,property,normalized,priority.toLowerCase());return;}
      if(property==='-webkit-border-radius'){if(normalized==='')this.removeProperty(property);else this._setProperty(property,normalized,priority.toLowerCase());return;}
      if (['opacity','position'].includes(property.toLowerCase()) && normalized !== '') this._setProperty(property.toLowerCase(), normalized, priority.toLowerCase());
      else BASE.setProperty.call(this,property,normalized,priority.toLowerCase());
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

for(const [name,allowed] of AXES) {
  for(const spelling of [name]) {
    Object.defineProperty(COMPAT,spelling,{configurable:true,enumerable:true,get(){return this.getPropertyValue(name);},set(value){return change(this,()=>axisSet(this,name,value==null?'':String(value)));}});
  }
  const camel=name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  Object.defineProperty(COMPAT,camel,{configurable:true,enumerable:true,get(){return this.getPropertyValue(name);},set(value){return change(this,()=>axisSet(this,name,value==null?'':String(value)));}});
  for(const axis of ['x','y'])for(const spelling of [name+'-'+axis,camel+axis.toUpperCase()])Object.defineProperty(COMPAT,spelling,{configurable:true,enumerable:true,get(){return this.getPropertyValue(name+'-'+axis);},set(value){return change(this,()=>{const input=value==null?'':String(value).toLowerCase().trim(),property=name+'-'+axis;if(input==='')BASE.removeProperty.call(this,property);else if(allowed.has(input)||CSS_WIDE.has(input)) {this._setProperty(property,input);this._priorities.delete(property);}});}});
}
for(const spelling of ['cssFloat','float'])Object.defineProperty(COMPAT,spelling,{configurable:true,enumerable:true,get(){return this.getPropertyValue('float');},set(value){return change(this,()=>{if(value===null||value==='')BASE.removeProperty.call(this,'float');else {this._setProperty('float',String(value));this._priorities.delete('float');}});}});
for(const spelling of ['-webkit-border-radius','webkitBorderRadius','WebkitBorderRadius'])Object.defineProperty(COMPAT,spelling,{configurable:true,enumerable:true,get(){return this.getPropertyValue('-webkit-border-radius');},set(value){this.setProperty('-webkit-border-radius',value);}});

export function enhanceDeclaration(style, window) {
  if(!DECLARATIONS.has(style)) {Object.setPrototypeOf(style,COMPAT);DECLARATIONS.add(style);}
  if(window)style._global=window;
  return style;
}
// Parsed scalar facts may be reused, never a public declaration or its maps.
// Bounds apply to both each key and the complete Host-only cache.
const DECLARATION_FACTS=new Map();let declarationFactBytes=0;
export function createDeclaration(text='', options={}) {
  const source=String(text),key=(options.nesting?'n':'d')+'\0'+source,style=enhanceDeclaration(new CSSStyleDeclaration(),options.window),facts=DECLARATION_FACTS.get(key);
  if(facts){
    for(const[name,value]of facts.values)style._values.set(name,value);for(const[name,value]of facts.priorities)style._priorities.set(name,value);style._length=facts.names.length;
    for(let i=0;i<facts.names.length;i++)Object.defineProperty(style,i,{value:facts.names[i],writable:true,enumerable:true,configurable:true});
    return style;
  }
  for(const item of parseDeclarations(source,options)) {
    if(style.getPropertyPriority(item.property)==='important'&&item.priority!=='important')continue;
    style.setProperty(item.property,item.value,item.priority);
  }
  const values=[...style._values],priorities=[...style._priorities];
  if(source.length<=4096&&values.every(([name,value])=>typeof name==='string'&&typeof value==='string')&&priorities.every(([name,value])=>typeof name==='string'&&typeof value==='string')){
    const names=Array.from({length:style.length},(_,i)=>style[i]);
    while(DECLARATION_FACTS.size>=256||declarationFactBytes+key.length>524288){const oldest=DECLARATION_FACTS.keys().next().value;if(oldest===undefined)break;declarationFactBytes-=oldest.length;DECLARATION_FACTS.delete(oldest);}
    DECLARATION_FACTS.set(key,{names,values,priorities});declarationFactBytes+=key.length;
  }
  return style;
}

export class CSSRuleList {
  constructor(rules=[]) {
    const list=new Proxy(this,{get(target,key,receiver){if(typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key))return materializeRule(LISTS.get(receiver)[Number(key)]);return Reflect.get(target,key,receiver);},
      has(target,key){return typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)?Number(key)<LISTS.get(list).length:Reflect.has(target,key);},
      ownKeys(){return LISTS.get(list).map((_,i)=>String(i));},
      getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)&&Number(key)<LISTS.get(list).length)return{configurable:true,enumerable:true,value:materializeRule(LISTS.get(list)[Number(key)]),writable:false};return Reflect.getOwnPropertyDescriptor(target,key);},
      set(){return false;},deleteProperty(){return false;},defineProperty(){return false;}});
    LISTS.set(list,[...rules]);return list;
  }
  get length(){return LISTS.get(this).length;}
  *[Symbol.iterator](){for(let i=0;i<this.length;i++)yield this[i];}
  get [Symbol.toStringTag](){return 'CSSRuleList';}
}
export function asRuleList(rules) {return LISTS.has(rules)?rules:new CSSRuleList(rules);}
export function spliceRules(rules,...args){const removed=LISTS.get(rules).splice(...args),publicValues=removed.map(materializeRule),state=DEFERRED_LISTS.get(rules);if(state){for(const value of removed)if(DEFERRED_RULES.has(value)){state.published.delete(value);state.styled.delete(value);}state.version++;state.groups=null;}return publicValues;}

// A flat stylesheet has a real parsed backend for every rule. Its public
// CSSOM objects are constructed once on demand, never replaced by summaries.
const DEFERRED_RULES=new WeakSet(),DEFERRED_LISTS=new WeakMap();
function declarationRevision(style){return style&&DECLARATIONS.has(style)?String(MUTATIONS.get(style)??0)+':'+(CHANGES.get(style)??0)+':'+style.length:style?.cssText;}
function deferredRules(entries,window){const state={window,sheet:null,parent:null,published:new Set(),styled:new Set(),version:1,groups:null};const definitions=entries.map(entry=>{const value={owner:state,selector:entry.prelude,body:entry.body,rule:null,style:null,styleVersion:null};DEFERRED_RULES.add(value);return value});const list=new CSSRuleList(definitions);state.list=list;DEFERRED_LISTS.set(list,state);return list;}
function deferredStyle(value){if(value.rule)return value.rule.style;if(!value.style){value.style=createDeclaration(value.body,{window:value.owner.window,nesting:true});value.styleVersion=declarationRevision(value.style);value.owner.styled.add(value);}return value.style;}
function materializeRule(value){if(!value||!DEFERRED_RULES.has(value))return value;if(value.rule)return value.rule;const owner=value.owner,rule=new cssom.CSSStyleRule();rule.selectorText=value.selector;rule.style=deferredStyle(value);rule.cssRules=new CSSRuleList();rule.parentStyleSheet=owner.sheet;rule.parentRule=owner.parent;Object.defineProperty(rule.style,'parentRule',{configurable:true,value:rule});Object.defineProperty(rule,'cssText',styleTextDescriptor(owner.window));value.rule=rule;value.style=rule.style;value.styleVersion=declarationRevision(rule.style);owner.published.add(value);owner.styled.add(value);return rule;}
export function bindDeferredRules(rules,sheet,parent,normalize){const state=DEFERRED_LISTS.get(rules);if(!state)return false;state.sheet=sheet;state.parent=parent;for(const value of LISTS.get(rules)){if(DEFERRED_RULES.has(value)){value.owner=state;if(value.rule)normalize(value.rule);}else normalize(value);}return true;}
export function hasStyleImports(rules){return [...(LISTS.get(rules)??rules)].some(value=>!DEFERRED_RULES.has(value)&&value.type===3);}
export function discardStyleImports(rules){const values=LISTS.get(rules);for(let i=values.length-1;i>=0;i--)if(!DEFERRED_RULES.has(values[i])&&values[i].type===3)values.splice(i,1);}
export function detachRuleEntries(rules){for(const value of LISTS.get(rules)??rules){if(DEFERRED_RULES.has(value)){if(value.rule){value.rule.parentStyleSheet=null;value.rule.parentRule=null;}}else{value.parentStyleSheet=null;value.parentRule=null;}}}
export function replaceRuleEntries(target,source,sheet,parent,window){detachRuleEntries(target);const values=LISTS.get(source)??source,copy=values.slice();LISTS.set(target,copy);let state=DEFERRED_LISTS.get(target);if(!state){state={window,sheet,parent,published:new Set(),styled:new Set(),version:1,groups:null,list:target};DEFERRED_LISTS.set(target,state);}else{state.published.clear();state.styled.clear();state.version++;state.groups=null;state.sheet=sheet;state.parent=parent;}
 for(const value of copy)if(DEFERRED_RULES.has(value)){value.owner=state;if(value.rule){state.published.add(value);value.rule.parentStyleSheet=sheet;value.rule.parentRule=parent;}if(value.style)state.styled.add(value);}return target;}
export function flatSheetState(sheet){const list=sheet.cssRules,state=DEFERRED_LISTS.get(list);if(!state)return null;const values=LISTS.get(list);for(const value of state.published){const rule=value.rule;if(rule.cssRules?.length)return null;if(value.selector!==rule.selectorText){value.selector=rule.selectorText;state.version++;state.groups=null;}if(value.style!==rule.style){value.style=rule.style;value.styleVersion=declarationRevision(rule.style);state.version++;} }
 for(const value of state.styled){const version=declarationRevision(value.style);if(version!==value.styleVersion){value.styleVersion=version;state.version++;}}
 if(!state.groups){const groups=new Map();for(let index=0;index<values.length;index++){const value=values[index];if(!DEFERRED_RULES.has(value))return null;if(!groups.has(value.selector))groups.set(value.selector,[]);groups.get(value.selector).push({value,index});}state.groups=groups;}return state;}
export function deferredRuleStyle(value){return deferredStyle(value);}


const RULE_BLOCK_FACTS=new Map();let ruleBlockFactBytes=0;
function parseRuleBlocks(text) {
  const source=String(text),known=RULE_BLOCK_FACTS.get(source);if(known)return known;
  const result=[]; text=withoutComments(source);let start=0;
  for(let i=0;i<text.length;i++) {
    const c=text[i];if(c==='\\'){i++;continue;}
    if(c==='"'||c==="'"){let end=i+1;for(;end<text.length;end++){if(text[end]==='\\')end++;else if(text[end]===c)break;}i=end;continue;}
    if(c==='('||c==='['){i=balancedEnd(text,i);continue;}
    if(c===';'){const prelude=text.slice(start,i).trim();if(prelude.startsWith('@'))result.push({prelude,body:null,text:prelude+';'});start=i+1;}
    else if(c==='{'){const end=balancedEnd(text,i),prelude=text.slice(start,i).trim();if(prelude)result.push({prelude,body:text.slice(i+1,end),text:text.slice(start,Math.min(end+1,text.length)).trim()});i=end;start=i+1;}
  }
  if(source.length<=4096){
    while(RULE_BLOCK_FACTS.size>=256||ruleBlockFactBytes+source.length>524288){const oldest=RULE_BLOCK_FACTS.keys().next().value;if(oldest===undefined)break;ruleBlockFactBytes-=oldest.length;RULE_BLOCK_FACTS.delete(oldest);}
    for(const entry of result)Object.freeze(entry);Object.freeze(result);RULE_BLOCK_FACTS.set(source,result);ruleBlockFactBytes+=source.length;
  }
  return result;
}

const STYLE_TEXT_FACTORIES=new WeakMap();let hostStyleText;
function styleTextDescriptor(window){
  if(window&&STYLE_TEXT_FACTORIES.has(window))return STYLE_TEXT_FACTORIES.get(window);
  if(!window&&hostStyleText)return hostStyleText;
  const descriptor={configurable:true,enumerable:true,get(){const children=[...this.cssRules].map(rule=>rule.cssText).join(' ');const body=[this.style.cssText,children].filter(Boolean).join(' ');return `${this.selectorText} {${body?' '+body+' ':' '}}`;},set(value){const parsed=parseStyleSheet(value,{window}).cssRules[0];if(parsed?.type===1){this.selectorText=parsed.selectorText;this.style=parsed.style;this.cssRules=parsed.cssRules;Object.defineProperty(this.style,'parentRule',{configurable:true,value:this});}}};
  if(window)STYLE_TEXT_FACTORIES.set(window,descriptor);else hostStyleText=descriptor;return descriptor;
}
const NESTED_GROUPS=new WeakMap();
export const nestedGroupContents=rule=>NESTED_GROUPS.get(rule);

export function parseStyleSheet(text,{window,onUnsupported,nested=false}={}) {
  const sheet=new cssom.CSSStyleSheet();const rules=[],blocks=parseRuleBlocks(text);
  if(!nested&&blocks.every(entry=>!entry.prelude.startsWith('@')&&entry.body!==null&&parseRuleBlocks(entry.body).length===0)) {sheet.cssRules=deferredRules(blocks,window);return sheet;}
  for(const entry of blocks) {
    const {prelude,body}=entry;let rule;
    if(!prelude.startsWith('@') && body!==null) {
      rule=new cssom.CSSStyleRule();rule.selectorText=prelude;rule.style=createDeclaration(body,{nesting:true,window});rule.cssRules=parseStyleSheet(body,{window,onUnsupported,nested:true}).cssRules;
    } else if(/^@(?:-webkit-)?keyframes\s+/i.test(prelude) && body!==null) {
      rule=new cssom.CSSKeyframesRule();rule.name=prelude.replace(/^@(?:-webkit-)?keyframes\s+/i,'');if(/^@-webkit-/i.test(prelude))rule._vendorPrefix='-webkit-';
      rule.cssRules=new CSSRuleList(parseRuleBlocks(body).filter(item=>item.body!==null).map(item=>{const frame=new cssom.CSSKeyframeRule();frame.keyText=item.prelude;frame.style=createDeclaration(item.body,{window});return frame;}));
    } else if(nested && /^@media\b/i.test(prelude) && body!==null) {
      rule=new cssom.CSSRule();rule.type=4;
      const media=prelude.replace(/^@media\s*/i,'');
      NESTED_GROUPS.set(rule,{kind:'media',media,style:createDeclaration(body,{nesting:true,window}),rules:parseStyleSheet(body,{window,onUnsupported,nested:true}).cssRules});
      Object.defineProperty(rule,'cssText',{configurable:true,enumerable:true,value:entry.text});
    } else if(/^@(?:media|supports)\b/i.test(prelude) && body!==null) {
      if(/^@media\b/i.test(prelude)){rule=new cssom.CSSMediaRule();rule.media.mediaText=prelude.replace(/^@media\s*/i,'');}
      else{rule=new cssom.CSSSupportsRule();rule.conditionText=prelude.replace(/^@supports\s*/i,'');}
      rule.cssRules=parseStyleSheet(body,{window,onUnsupported}).cssRules;
    } else if(/^@font-face\s*$/i.test(prelude)&&body!==null) {
      rule=new cssom.CSSFontFaceRule();rule.style=createDeclaration(body,{window});
      // Descriptor grammars differ from ordinary element properties. Keep the
      // parser's declaration boundaries, including src and font descriptors.
      for(const item of parseDeclarations(body))if(!rule.style.getPropertyValue(item.property))rule.style._setProperty(item.property,item.value,item.priority);
    } else if(/^@layer(?:\s|$)/i.test(prelude)) {
      rule=new cssom.CSSRule();rule.type=0;Object.defineProperty(rule,'cssText',{configurable:true,enumerable:true,value:entry.text});
      const names=prelude.replace(/^@layer\s*/i,'').trim();
      NESTED_GROUPS.set(rule,body===null?{kind:'layerStatement',names:names.split(',').map(value=>value.trim())}:{kind:'layer',name:names,rules:parseStyleSheet(body,{window,onUnsupported,nested}).cssRules,style:nested?createDeclaration(body,{nesting:true,window}):null});
    } else if(/^@charset(?:\s|$)/i.test(prelude)&&body===null) {
      rule=new cssom.CSSRule();rule.type=2;Object.defineProperty(rule,'cssText',{configurable:true,enumerable:true,value:entry.text});
    } else if(/^@import\b/i.test(prelude)&&body===null) {
      try{rule=cssom.parse(entry.text).cssRules[0];}catch{continue;}
    } else if(prelude.startsWith('@')) {
      rule=new cssom.CSSRule();rule.type=0;Object.defineProperty(rule,'cssText',{configurable:true,enumerable:true,value:entry.text});onUnsupported?.('Unknown at-rules are retained without cascade semantics');
    }
    if(!rule)continue;
    if(rule.style){Object.defineProperty(rule.style,'parentRule',{configurable:true,value:rule});}
    if(rule.type===1)Object.defineProperty(rule,'cssText',styleTextDescriptor(window));
    rules.push(rule);
  }
  sheet.cssRules=new CSSRuleList(rules);return sheet;
}
