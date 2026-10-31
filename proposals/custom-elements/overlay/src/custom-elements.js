import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const {implForWrapper,wrapperForImpl}=utils;
const Registry=require('jsdom/lib/jsdom/living/generated/CustomElementRegistry.js');
const RegistryImpl=require('jsdom/lib/jsdom/living/custom-elements/CustomElementRegistry-impl.js').implementation;
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const attributes=require('jsdom/lib/jsdom/living/attributes.js');
const TemplateImpl=require('jsdom/lib/jsdom/living/nodes/HTMLTemplateElement-impl.js').implementation;
const Fragment=require('jsdom/lib/jsdom/living/generated/DocumentFragment.js');
const {HTMLConstructor}=require('jsdom/lib/jsdom/living/helpers/html-constructor.js');
const {getValidTagNames}=require('jsdom/lib/jsdom/living/helpers/create-element.js');
const {isShadowRoot}=require('jsdom/lib/jsdom/living/helpers/shadow-dom.js');
const {domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const {ceReactionsPreSteps,ceReactionsPostSteps,isValidCustomElementName}=require('jsdom/lib/jsdom/living/helpers/custom-elements.js');
const jsdomRequire=createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'));
const parse5=jsdomRequire('parse5');
const records=new WeakMap(),globals=new WeakMap(),adapters=new WeakSet();
const HTML='http://www.w3.org/1999/xhtml';
let patched=false;
const active=r=>r&&!r.disposed&&!r.page.closed&&!r.signal?.aborted&&r.window.document===r.document;
function recordFor(document){const r=globals.get(document?._globalObject);return active(r)?r:null;}
function reactions(callback){ceReactionsPreSteps();try{return callback();}finally{ceReactionsPostSteps();}}

// Main parser insertion is a real reaction boundary. Fragment upgrades remain
// queued until their enclosing public DOM operation, preserving foster parents
// and constructors which move their own element after fragment parsing.
export function prepareCustomElementParserAdapter(adapter){
 if(!adapter||adapter._fragment||adapters.has(adapter)||!recordFor(adapter._documentImpl))return;
 adapters.add(adapter);
 for(const key of['createElement','appendChild','insertBefore']){
  const original=adapter[key];
  adapter[key]=function(...args){return reactions(()=>original.apply(this,args));};
 }
}

function patch(){
 if(patched)return;patched=true;
 const whenDefined=RegistryImpl.prototype.whenDefined;
 RegistryImpl.prototype.whenDefined=function(name){
  const record=globals.get(this._globalObject);
  if(!active(record))return whenDefined.call(this,name);
  if(!isValidCustomElementName(name))return record.reject(new record.DOMException('Name argument is not a valid custom element name.','SyntaxError'));
  const definition=this._customElementDefinitions.find(value=>value.name===name);
  if(definition)return record.resolve(definition.objectReference);
  if(this._whenDefinedPromiseMap[name]===undefined){let resolve;const promise=new record.Promise(done=>{resolve=done});this._whenDefinedPromiseMap[name]={promise,resolve};}
  return this._whenDefinedPromiseMap[name].promise;
 };
 const create=DocumentImpl.prototype.createElement;
 DocumentImpl.prototype.createElement=function(...args){
  const result=create.apply(this,args);
  if(recordFor(this)&&result._isValue!==null&&result.getAttributeNS(null,'is')===null)attributes.setAttributeValue(result,'is',result._isValue);
  return result;
 };
 const owner=TemplateImpl.prototype._appropriateTemplateContentsOwnerDocument;
 TemplateImpl.prototype._appropriateTemplateContentsOwnerDocument=function(document){
  const result=owner.call(this,document),record=recordFor(document);
  if(record&&result._isInertTemplateDocument){
   const wrapper=wrapperForImpl(result);
   Object.setPrototypeOf(wrapper,record.htmlDocumentPrototype);
   // This separate inert Document is born complete, with no browsing context
   // or active parser; no synthetic ready-state event is dispatched.
   result._currentDocumentReadiness='complete';
  }
  return result;
 };
 for(const name of['HTMLElement','SVGElement']){
  const prototype=require(`jsdom/lib/jsdom/living/nodes/${name}-impl.js`).implementation.prototype;
  const initialize=prototype._initElementCSSInlineStyle;
  prototype._initElementCSSInlineStyle=function(){
   initialize.call(this);if(!recordFor(this._ownerDocument))return;
   const change=this._style._onChange,element=this;
   this._style._onChange=function(...args){return recordFor(element._ownerDocument)?reactions(()=>change.apply(this,args)):change.apply(this,args);};
  };
 }
 const preInsert=NodeImpl.prototype._preInsert;
 NodeImpl.prototype._preInsert=function(node,child){
  const targetDocument=this.nodeType===9?this:this._ownerDocument;
  if(isShadowRoot(node)&&node._ownerDocument!==targetDocument&&recordFor(targetDocument)){
   this._preInsertValidity(node,child);
   // A ShadowRoot stays attached to its existing host/document. Only its
   // actual children move. Real batch removal precedes adoption, so queued
   // disconnected/adopted/connected callbacks retain their causal order.
   const children=domSymbolTree.childrenToArray(node);
   const fragment=Fragment.createImpl(node._globalObject,[],{ownerDocument:node._ownerDocument});
   node._replaceAll(null);
   for(const value of children)fragment._append(value);
   preInsert.call(this,fragment,child);return node;
  }
  return preInsert.call(this,node,child);
 };
 const parse=parse5.parse;
 parse5.parse=function(markup,options){prepareCustomElementParserAdapter(options?.treeAdapter);return parse.call(this,markup,options);};
}

function factory(g,bridge){
 const TypeError=g.TypeError,wrappers=new Map(),pending=[];
 for(const[name,target]of bridge.interfaces){
  const Constructor=new Proxy(target,{construct(target,args,newTarget){return bridge.construct(target,args,newTarget,name);}});
  wrappers.set(target,Constructor);pending.push({name,target,Constructor});
 }
 for(const{name,target,Constructor}of pending){
  Object.defineProperty(g,name,{value:Constructor,writable:true,configurable:true});
  Object.defineProperty(target.prototype,'constructor',{value:Constructor,writable:true,configurable:true});
 }
 for(const{target}of pending){const parent=Object.getPrototypeOf(target);if(wrappers.has(parent))Object.setPrototypeOf(target,wrappers.get(parent));}
 Object.defineProperty(bridge.registryConstructor.prototype,'getName',{enumerable:true,writable:true,configurable:true,value:function getName(constructor){
  if(!arguments.length||typeof constructor!=='function')throw new TypeError('A constructor is required');
  return bridge.getName(this,constructor);
 }});
}

export function installCustomElements(page,window){
 if(records.has(window))return records.get(window).controller;
 patch();
 const document=window.document,implementation=implForWrapper(document),registry=implForWrapper(implementation._globalObject._customElementRegistry);
 const PromiseConstructor=window.Promise,resolve=PromiseConstructor.resolve,reject=PromiseConstructor.reject;
 const record={page,window,document,signal:page.documentAbort?.signal,Promise:PromiseConstructor,DOMException:window.DOMException,TypeError:window.TypeError,Error:window.Error,
  resolve:value=>Reflect.apply(resolve,PromiseConstructor,[value]),reject:value=>Reflect.apply(reject,PromiseConstructor,[value]),
  htmlDocumentPrototype:window.HTMLDocument.prototype,disposed:false};
 records.set(window,record);globals.set(implementation._globalObject,record);
 const constructors=window[utils.ctorRegistrySymbol];
 window.eval(`(${factory.toString()})`)(window,{
  interfaces:Object.keys(constructors).filter(name=>name==='HTMLElement'||/^HTML.*Element$/.test(name)).map(name=>[name,constructors[name]]),
  registryConstructor:constructors.CustomElementRegistry,
  getName(value,constructor){if(!Registry.is(value))throw new record.TypeError('Illegal invocation');const definition=implForWrapper(value)._customElementDefinitions.find(value=>value.objectReference===constructor);return definition?.name??null;},
  construct(target,args,newTarget,interfaceName){
   const definition=registry._customElementDefinitions.find(value=>value.objectReference===newTarget);
   if(definition&&definition.localName!==definition.name){
    if(!definition.constructionStack.length){if(interfaceName==='HTMLElement')throw new record.Error('Illegal Constructor');throw new record.TypeError('');}
    const element=definition.constructionStack.at(-1);
    if(element&&typeof element!=='symbol'&&element.getAttributeNS(null,'is')===null)attributes.setAttributeValue(element,'is',definition.name);
    // The existing DOM implementation and construction stack remain in
    // charge. Native permits a generic HTMLElement base for customized tags.
    const name=Object.keys(constructors).find(name=>getValidTagNames(HTML,name).includes(definition.localName));
    if(name){try{return HTMLConstructor(implementation._globalObject,name,newTarget);}catch(error){if(error instanceof globalThis.TypeError)throw new record.TypeError(error.message);throw error;}}
   }
   try{return Reflect.construct(target,args,newTarget);}catch(error){if(error instanceof globalThis.TypeError)throw new record.TypeError(error.message);throw error;}
  },
 });
 const dispose=()=>{record.disposed=true;record.signal?.removeEventListener('abort',dispose);};
 record.signal?.addEventListener('abort',dispose,{once:true});record.controller={dispose};return record.controller;
}
