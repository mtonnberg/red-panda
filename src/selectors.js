// Independent selector parsing and state adapter. No native engine is imported.
import 'jsdom';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const nwsapi=require('nwsapi');
const {implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const NodeList=require('jsdom/lib/jsdom/living/generated/NodeList.js');
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const FragmentImpl=require('jsdom/lib/jsdom/living/nodes/DocumentFragment-impl.js').implementation;
const getAttribute=ElementImpl.prototype.getAttribute;
const RECORDS=new WeakMap();
const NAMESPACE_FALLBACK=Symbol('selector namespace handled by existing engine');
const HTML='http://www.w3.org/1999/xhtml';
const SPACE=/[\t\n\r\f ]/;
const lower=value=>/[A-Z]/.test(value)?value.replace(/[A-Z]/g,c=>c.toLowerCase()):value;
const htmlInsensitive=new Set(('accept accept-charset align alink axis bgcolor charset checked clear codetype color compact declare defer dir direction disabled enctype face frame hreflang http-equiv lang language link media method multiple nohref noresize noshade nowrap readonly rel rev rules scope scrolling selected shape target text type valign valuetype vlink').split(' '));
const simplePseudos=new Set(('scope root empty first-child last-child only-child first-of-type last-of-type only-of-type any-link link visited target defined hover active focus-within focus-visible focus enabled disabled read-only read-write placeholder-shown default autofill -webkit-autofill checked indeterminate required optional valid invalid in-range out-of-range playing paused seeking buffering stalled muted volume-locked open closed modal fullscreen picture-in-picture popover-open popover current past future').split(' '));
const logical=new Set(['is','where','not','has','matches']);
const functional=new Set(['is','where','not','has','matches','lang','dir','nth-child','nth-last-child','nth-of-type','nth-last-of-type']);
const pseudoElements=new Set(('before after first-line first-letter marker placeholder selection backdrop file-selector-button column scroll-marker scroll-button target-text spelling-error grammar-error details-content').split(' '));
const functionalElements=new Set(['part','slotted','cue','highlight','picker']);
const legacyElements=new Set(['before','after','first-line','first-letter']);
const internal='redpanda-internal-selector';

function fail(window,message='Invalid CSS selector') { throw window?new window.DOMException(message,'SyntaxError'):new SyntaxError(message); }
function escapeAt(text,index,window,inString=false) {
 const next=text[index+1];
 if(next===undefined)return {value:'\ufffd',end:index+1};
 if(next==='\n'){if(inString)return {value:'',end:index+2};fail(window,'A newline is not an identifier escape');}
 const hex=/^[0-9a-fA-F]{1,6}/.exec(text.slice(index+1));
 if(hex){let end=index+1+hex[0].length;if(SPACE.test(text[end]??''))end++;const n=parseInt(hex[0],16);return {value:n===0||n>0x10ffff||n>=0xd800&&n<=0xdfff?'\ufffd':String.fromCodePoint(n),end};}
 return {value:next,end:index+2};
}
function nameStart(text,index) {
 const c=text[index],n=text[index+1];
 if(c==='-')return n==='-' || n==='\\'&&text[index+2]!=='\n' || /[A-Za-z_\u0080-\uffff]/.test(n??'');
 return c==='\\'&&n!=='\n' || /[A-Za-z_\u0080-\uffff]/.test(c??'');
}
function readName(text,index,window) {
 if(!nameStart(text,index))fail(window,'Expected CSS identifier');
 let value='',end=index;
 while(end<text.length){const c=text[end];if(c==='\\'){const escaped=escapeAt(text,end,window);value+=escaped.value;end=escaped.end;}
 else if(/[A-Za-z0-9_\u0080-\uffff-]/.test(c)){value+=c;end++;}else break;}
 return {value,end,raw:text.slice(index,end)};
}
function readString(text,index,window) {
 const quote=text[index];let value='',end=index+1;
 for(;end<text.length;){const c=text[end];if(c===quote)return {value,end:end+1};if(c==='\n')fail(window,'A CSS string cannot contain an unescaped newline');
 if(c==='\\'){const escaped=escapeAt(text,end,window,true);value+=escaped.value;end=escaped.end;}else{value+=c;end++;}}
 fail(window,'Unterminated attribute string');
}
function skipSpace(text,index){while(SPACE.test(text[index]??''))index++;return index;}
function attribute(text,index,window) {
 const start=index++;index=skipSpace(text,index);
 if(text[index]==='|'||text[index]==='*'&&text[index+1]==='|')throw NAMESPACE_FALLBACK;
 const name=readName(text,index,window);index=skipSpace(text,name.end);
 if(text[index]==='|'&&text[index+1]!=='=')throw NAMESPACE_FALLBACK;
 if(text[index]===']')return {end:index+1,raw:text.slice(start,index+1),predicate:{kind:'attribute',name:name.value}};
 const op=/^(?:[~|^$*]?=)/.exec(text.slice(index));if(!op)fail(window,'Invalid attribute operator');index=skipSpace(text,index+op[0].length);
 const value=text[index]==='"'||text[index]==="'"?readString(text,index,window):readName(text,index,window);index=value.end;
 const afterValue=index;index=skipSpace(text,index);let flag='';
 if(text[index]!==']') {if(index===afterValue)fail(window,'Attribute flags need whitespace');const token=readName(text,index,window);flag=lower(token.value);if(!['i','s'].includes(flag))fail(window,'Unknown attribute comparison flag');index=skipSpace(text,token.end);}
 if(text[index]!==']')fail(window,'Unterminated attribute selector');
 return {end:index+1,raw:text.slice(start,index+1),predicate:{kind:'attribute',name:name.value,operator:op[0],value:value.value,flag}};
}
function typeSelector(text,index,window) {
 const start=index;let namespace=null,name;
 const read=()=>{if(text[index]==='*'){index++;return '*';}const token=readName(text,index,window);index=token.end;return token.value;};
 if(text[index]==='|'){namespace='';index++;name=read();}
 else {name=read();if(text[index]==='|'&&text[index+1]!=='='){if(name!=='*')fail(window,'Undeclared selector namespace');namespace='*';index++;name=read();}}
 return {end:index,raw:text.slice(start,index),predicate:{kind:'type',name,namespace}};
}

function block(text,index,window) {
 let depth=1;
 for(let i=index+1;i<text.length;){const c=text[i];if(c==='"'||c==="'"){i=readString(text,i,window).end;continue;}if(c==='\\'){i=escapeAt(text,i,window).end;continue;}
 if(c==='(')depth++;else if(c===')'&&!--depth)return {body:text.slice(index+1,i),end:i+1};i++;}
 fail(window,'Unterminated selector function');
}
function splitGroups(text,window) {
 const result=[];let start=0;
 for(let i=0;i<text.length;){const c=text[i];if(c==='['){i=attribute(text,i,window).end;continue;}if(c==='('){i=block(text,i,window).end;continue;}if(c==='\\'){i=escapeAt(text,i,window).end;continue;}
 if(c===','){result.push(text.slice(start,i));start=i+1;}i++;}
 result.push(text.slice(start));return result;
}
function pseudoElementAllowedAfter(name,last,argument) {
 if(last==='before'||last==='after')return (name==='is'||name==='where')&&argument!==null;
 if(last==='part')return ['hover','active','focus','focus-visible','focus-within'].includes(name)&&argument===null || name==='state'&&argument!==null&&argument.trim()!=='';
 if(last==='selection')return name==='window-inactive'&&argument===null;
 if(last==='scroll-marker')return name==='target-current'&&argument===null;
 if(last.startsWith('-webkit-scrollbar')||last==='file-selector-button')return ['hover','active','horizontal','vertical','decrement','increment','start','end','double-button','single-button','no-button','corner-present','window-inactive'].includes(name)&&argument===null;
 return false;
}
function preprocess(source,window) {
 let text=source.replace(/\r\n?|\f/g,'\n').replace(/\0/g,'\ufffd'),result='';
 for(let i=0;i<text.length;){const c=text[i];if(c==='"'||c==="'"){const s=readString(text,i,window);result+=text.slice(i,s.end);i=s.end;continue;}
 if(c==='\\'){const e=escapeAt(text,i,window);result+=text.slice(i,e.end);i=e.end;continue;}
 if(c==='/'&&text[i+1]==='*'){const end=text.indexOf('*/',i+2);if(end<0)break;i=end+2;continue;}
 result+=c;i++;}return result;
}

function parseSelector(source,{window,emitPredicate=()=>':'+internal+'(0)'}={}) {
 const text=preprocess(String(source),window);
 const list=(value,container='top',relative=false)=>{
  const groups=splitGroups(value,window);if(groups.some(group=>!group.trim()))fail(window,'Empty selector list item');
  const parsed=groups.map(group=>branch(group.trim(),container,relative));
  const retained=parsed.filter(item=>!item.discard);
  return {compiled:retained.length?retained.map(item=>item.compiled).join(','):emitPredicate({kind:'never'}),effective:retained.map(item=>item.effective).join(','),groups:parsed};
 };
 const branch=(value,container,relative)=>{
  let compiled='',effective='',pe=null,hasPE=false,canType=true,required=[];
  for(let i=0;i<value.length;){const c=value[i];
   if(SPACE.test(c)){const end=skipSpace(value,i);if(pe&&end<value.length&&value[end]!==':')fail(window,'Pseudo-elements cannot have descendant subjects');compiled+=value.slice(i,end);effective+=value.slice(i,end);required=[];canType=true;i=end;continue;}
   if(c==='['){if(pe)fail(window,'Attributes cannot follow a pseudo-element');const token=attribute(value,i,window);compiled+=emitPredicate(token.predicate);required.push(token.predicate);effective+=token.raw;canType=false;i=token.end;continue;}
   if(c===':'){
    const double=value[i+1]===':';const token=readName(value,i+(double?2:1),window);const name=lower(token.value);let end=token.end,arg=null;
    if(value[end]==='('){const fn=block(value,end,window);arg=fn.body;end=fn.end;}
    const isElement=double || legacyElements.has(name);
    if(isElement){
     if(!pseudoElements.has(name)&&!functionalElements.has(name)&&!(name.startsWith('-webkit-')&&name!=='-webkit-autofill'))fail(window,'Unknown pseudo-element');
     if(functionalElements.has(name)){if(arg===null||!arg.trim())fail(window,'Pseudo-element needs arguments');if(name==='picker'&&lower(arg.trim())!=='select')fail(window,'Unknown picker type');}
     else if(arg!==null)fail(window,'Pseudo-element is not functional');
     if(pe&&!((pe==='before'||pe==='after')&&name==='marker'||(pe==='part'||pe==='slotted')&&(name==='before'||name==='after')||pe==='column'&&name==='scroll-marker'))fail(window,'Invalid pseudo-element chain');
     if(container==='not'||container==='has')fail(window,'Pseudo-elements are forbidden in this selector function');
     hasPE=true;pe=name;compiled+=value.slice(i,end);effective+=value.slice(i,end);i=end;continue;
    }
    if(pe&&!pseudoElementAllowedAfter(name,pe,arg))fail(window,'Pseudo-class cannot follow this pseudo-element');
    if(name===internal)fail(window,'Unknown pseudo-class');
    if(logical.has(name)){
     if(arg===null)fail(window,'Selector function needs arguments');
     if(!arg.trim()){
      if(name!=='is'&&name!=='where')fail(window,'Selector function cannot be empty');
      compiled+=emitPredicate({kind:'never'});effective+=`:${name}()`;
     }else{const nested=list(arg,name,name==='has');compiled+=`:${name}(${nested.compiled})`;effective+=`:${name}(${nested.effective})`;}
    }else if(name==='empty'){
     if(arg!==null)fail(window,'State pseudo-class is not functional');compiled+=emitPredicate({kind:'empty'});effective+=value.slice(i,end);
    }else if(name==='modal'||name==='popover-open'||name==='popover'){
     if(arg!==null)fail(window,'State pseudo-class is not functional');compiled+=emitPredicate({kind:name==='modal'?'modal':'popover'});effective+=value.slice(i,end);
    }else{
     if(!simplePseudos.has(name)&&!functional.has(name)&&!pe)fail(window,'Unknown pseudo-class');
     if(functional.has(name)){if(arg===null||!arg.trim())fail(window,'Pseudo-class needs arguments');
      if(name.startsWith('nth-')&&!/^(?:even|odd|[+-]?\d+|[+-]?(?:\d+)?n(?:\s*[+-]\s*\d+)?)$/i.test(arg.trim()))fail(window,'Invalid nth expression');}
     else if(arg!==null&&!(pe&&name==='state'))fail(window,'Pseudo-class is not functional');
     compiled+=value.slice(i,end);effective+=value.slice(i,end);
    }
    canType=false;i=end;continue;
   }
   if(pe)fail(window,'A pseudo-element must be the final subject');
   if(c==='.'||c==='#'){const token=readName(value,i+1,window);const item={kind:c==='#'?'id':'class',name:token.value};required.push(item);compiled+=emitPredicate(item);effective+=c+token.raw;canType=false;i=token.end;continue;}
   if('>+~'.includes(c)){if(i===0&&!relative)fail(window,'Leading combinator');if(!value.slice(i+1).trim()||/^[>+~]/.test(value.slice(i+1).trim()))fail(window,'Unfinished combinator');compiled+=c;effective+=c;required=[];canType=true;i++;continue;}
   if(c==='*'||c==='|'||nameStart(value,i)){
    if(!canType)fail(window,'Multiple type selectors in one compound');const token=typeSelector(value,i,window);compiled+=token.predicate.name==='*'&&token.predicate.namespace===null?'*':emitPredicate(token.predicate);required.push(token.predicate);effective+=token.raw;canType=false;i=token.end;continue;
   }
   fail(window,'Unexpected selector token');
  }
  return {compiled:hasPE?emitPredicate({kind:'never'}):compiled,effective,required,discard:hasPE&&(container==='is'||container==='where')};
 };
 return list(text);
}

export function selectorForSpecificity(source) { try{return parseSelector(source).effective;}catch(error){if(error===NAMESPACE_FALLBACK)return source;throw error;} }

function predicate(record,element,item) {
 if(item.kind==='never')return false;
 if(item.kind==='empty'){for(const child of element.childNodes)if(child.nodeType===1||child.nodeType===3&&child.data.length)return false;return true;}
 // Native parses :modal but its observed public predicate stays false.
 if(item.kind==='modal')return record.providers.matchesModal?.(element)===true;
 if(item.kind==='popover')return record.providers.isPopoverOpen?.(element)===true;
 const impl=implForWrapper(element);
 if(item.kind==='type'){
  if(item.namespace===''&&impl._namespaceURI!==null)return false;
  const fold=(impl._namespaceURI===HTML||impl._namespaceURI==='http://www.w3.org/2000/svg')&&impl._ownerDocument._parsingMode==='html';
  return item.name==='*'||(fold?lower(impl._localName)===lower(item.name):impl._localName===item.name);
 }
 if(item.kind==='id'||item.kind==='class'){
  let actual=getAttribute.call(impl,item.kind==='id'?'id':'class');if(actual===null)return false;let expected=item.name;
  if(impl._ownerDocument._mode==='quirks'){actual=lower(actual);expected=lower(expected);}
  return item.kind==='id'?actual===expected:actual.split(/[\t\n\r\f ]+/).includes(expected);
 }
 const actual=getAttribute.call(impl,item.name);
 if(actual===null)return false;if(!item.operator)return true;
 let left=actual,right=item.value;
 const fold=item.flag==='i'||item.flag!=='s'&&impl._namespaceURI===HTML&&impl._ownerDocument._parsingMode==='html'&&htmlInsensitive.has(lower(item.name));
 if(fold){left=lower(left);right=lower(right);}
 switch(item.operator){case'=':return left===right;case'^=':return right!==''&&left.startsWith(right);case'$=':return right!==''&&left.endsWith(right);case'*=':return right!==''&&left.includes(right);case'~=':return right!==''&&!/[\t\n\r\f ]/.test(right)&&left.split(/[\t\n\r\f ]+/).includes(right);case'|=':return left===right||left.startsWith(right+'-');default:return false;}
}
function compiled(record,source) {
 let parsed=record.cache.get(source);if(parsed)return parsed;
 const emitted=[];parsed=parseSelector(source,{window:record.window,emitPredicate(item){const index=record.predicates.push(item)-1,text=`:${internal}(${index})`;emitted.push({item,text});return text;}});if(emitted.length===1&&parsed.compiled===emitted[0].text)parsed.primitive=emitted[0].item;const conjunction=emitted.map(entry=>entry.text).join('');if(conjunction&&(parsed.compiled===conjunction||parsed.compiled==='*'+conjunction))parsed.conjunction=emitted.map(entry=>entry.item);record.cache.set(source,parsed);return parsed;
}
function matcher(record){
 if(record.matcher){record.matcher.Snapshot.root=wrapperForImpl(record.documentImpl.documentElement);return record.matcher;}
 const engine=nwsapi({document:record.document,DOMException:record.window.DOMException});engine.configure({LOGERRORS:false,VERBOSITY:true,IDS_DUPES:true,MIXEDCASE:true,FORGIVING:false});
 engine.Snapshot.rpPredicate=(element,index)=>predicate(record,element,record.predicates[index]);
 engine.registerSelector(internal,new RegExp('^:'+internal+'\\((\\d+)\\)(.*)'),(match,source)=>({source:`if(s.rpPredicate(e,${Number(match[1])})){${source}}`,status:true}));
 const has=engine.Snapshot.has;engine.Snapshot.has=(...args)=>{const from=engine.Snapshot.from;try{return has(...args);}finally{engine.Snapshot.from=from;}};
 record.matcher=engine;return engine;
}
function match(record,selector,element,scope=element){
 const parsed=compiled(record,selector);if(!record.documentImpl.documentElement)return false;if(parsed.primitive)return predicate(record,element,parsed.primitive);if(parsed.conjunction)return parsed.conjunction.every(item=>predicate(record,element,item));if(parsed.groups.every(group=>group.required.some(item=>!predicate(record,element,item))))return false;
 const engine=matcher(record),previous=engine.Snapshot.from;engine.Snapshot.from=scope;
 try{return engine.match(parsed.compiled,element);}finally{engine.Snapshot.from=previous;}
}
function select(record,root,selector,first){
 const parsed=compiled(record,selector);if(!record.document.documentElement)return first?null:[];
 // Validate/compile even if the queried subtree has no candidate elements.
 const universal=parsed.compiled==='*';if(!universal)match(record,selector,record.document.documentElement,wrapperForImpl(root));
 const result=[];const scope=wrapperForImpl(root);
 for(const node of domSymbolTree.treeIterator(root)){if(node===root||node.nodeType!==1)continue;if(universal||match(record,selector,wrapperForImpl(node),scope)){if(first)return node;result.push(node);}}
 return first?null:result;
}
for(const Interface of [DocumentImpl,ElementImpl,FragmentImpl])for(const name of ['querySelector','querySelectorAll']){
 const original=Interface.prototype[name];Interface.prototype[name]=function(selector){const record=RECORDS.get(this._ownerDocument);if(!record)return original.call(this,selector);try{const nodes=select(record,this,selector,name==='querySelector');return name==='querySelector'?nodes:NodeList.createImpl(this._globalObject,[],{nodes});}catch(error){if(error===NAMESPACE_FALLBACK)return original.call(this,selector);throw error;}};
}
const getId=DocumentImpl.prototype.getElementById;DocumentImpl.prototype.getElementById=function(id){
 if(!RECORDS.has(this))return getId.call(this,id);if(id==='')return null;
 for(const node of domSymbolTree.treeIterator(this))if(node.nodeType===1&&getAttribute.call(node,'id')===id)return node;return null;
};
for(const name of ['matches','closest']){
 const original=ElementImpl.prototype[name];ElementImpl.prototype[name]=function(selector){const record=RECORDS.get(this._ownerDocument);if(!record)return original.call(this,selector);const scope=wrapperForImpl(this);if(name==='matches'){try{return match(record,selector,scope,scope);}catch(error){if(error===NAMESPACE_FALLBACK)return original.call(this,selector);throw error;}}
 try {compiled(record,selector);for(let node=this;node&&node.nodeType===1;node=domSymbolTree.parent(node))if(match(record,selector,wrapperForImpl(node),scope))return wrapperForImpl(node);return null;}
 catch(error){if(error===NAMESPACE_FALLBACK)return original.call(this,selector);if(error?.name==='SyntaxError')throw new record.window.Error(error.message);throw error;}
 };
}
export function installSelectors(page,window,providers={}) {
 const document=implForWrapper(window.document);const current=RECORDS.get(document);if(current)return current.controller;
 const signal=page?.documentAbort?.signal;
 if(page?.closed||signal?.aborted)throw new window.DOMException('Cannot register selectors on a closed document','InvalidStateError');
 const record={window,document:window.document,documentImpl:document,providers,cache:new Map(),predicates:[],matcher:null,disposed:false};RECORDS.set(document,record);
 const dispose=()=>{if(record.disposed)return;record.disposed=true;if(RECORDS.get(document)===record)RECORDS.delete(document);signal?.removeEventListener('abort',dispose);page?.off?.('close',dispose);};
 if(signal)signal.addEventListener('abort',dispose,{once:true});else page?.once?.('close',dispose);
 record.controller={dispose,selectorForSpecificity};return record.controller;
}

// Private state changes need no DOM mutation (for example an open popover).
// Styles/layout consume this host-only revision rather than inventing attributes.
export function getSelectorStateRevision(window) {
 const record=RECORDS.get(implForWrapper(window.document));
 if(!record?.providers.getStateRevision)return 0;
 const revision=record.providers.getStateRevision(window);
 if(!Number.isSafeInteger(revision)||revision<0)throw new TypeError('Selector state revision must be a nonnegative safe integer');
 return revision;
}

// Host stylesheet matching has the document root as its scoping root.
export function matchesInScope(element,selector,scope=element.ownerDocument.documentElement) {
 const record=RECORDS.get(implForWrapper(element.ownerDocument));
 if(!record)return element.matches(selector);
 try{return match(record,selector,element,scope);}catch(error){if(error===NAMESPACE_FALLBACK)return element.matches(selector);throw error;}
}

// Host cascade code may reuse its genuine document record and scoping root.
export function createScopedMatcher(document,scope=document.documentElement){const record=RECORDS.get(implForWrapper(document));if(!record)return(selector,element)=>element.matches(selector);return(selector,element)=>{try{return match(record,selector,element,scope);}catch(error){if(error===NAMESPACE_FALLBACK)return element.matches(selector);throw error;}};}

// Conservative stylesheet candidate index: only direct type requirements of
// every outer selector branch qualify. Logical functions remain unindexed.
export function selectorSubjectTypes(source){
 try{const parsed=parseSelector(source),types=[];for(const group of parsed.groups){const type=group.required.find(item=>item.kind==='type'&&item.name!=='*');if(!type)return null;types.push(type.name);}return types;}catch{return null;}
}
