// Native-profile attribute names over the genuine DOM attribute graph. The
// generated WebIDL methods still own brands, argument counts and conversions.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {platformFactoryRecord} from './platform-factories.js';
import {installPlatformFactoryHooks} from './platform-factory-hooks.js';
import {implementationForWrapper} from './dom-event-state.js';
installPlatformFactoryHooks();
const require=createRequire(import.meta.url);
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const NamedNodeMapImpl=require('jsdom/lib/jsdom/living/attributes/NamedNodeMap-impl.js').implementation;
const AttrImpl=require('jsdom/lib/jsdom/living/attributes/Attr-impl.js').implementation;
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const attributes=require('jsdom/lib/jsdom/living/attributes.js');
const DOMException=require('jsdom/lib/jsdom/living/generated/DOMException.js');
const {HTML_NS}=require('jsdom/lib/jsdom/living/helpers/namespaces.js');
const ownedGlobals=new WeakSet(),installed=new WeakSet(),declaredNames=new WeakMap();
const apply=Reflect.apply,wellFormed=String.prototype.toWellFormed,symbolDescription=Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get;
const namespacePrefixes=new Map([['http://www.w3.org/1999/xlink','xlink'],['http://www.w3.org/XML/1998/namespace','xml'],['http://www.w3.org/2000/xmlns/','xmlns']]);
let patched=false;
const owns=document=>!!document&&ownedGlobals.has(document._globalObject);
const text=value=>apply(wellFormed,String(value),[]);
const lower=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase());
const attributeName=(element,name)=>element._namespaceURI===HTML_NS&&element._ownerDocument._parsingMode==='html'?lower(name):name;
function invalid(globalObject){throw DOMException.create(globalObject,['Invalid attribute name','InvalidCharacterError']);}
function validate(globalObject,name){if(!name.length||/[\0\t\n\f\r />=]/.test(name))invalid(globalObject);return name;}
function set(element,name,value){
 name=attributeName(element,validate(element._globalObject,text(name)));value=text(value);
 const old=attributes.getAttributeByName(element,name);
 if(old)attributes.changeAttribute(element,old,value);
 else attributes.appendAttribute(element,element._ownerDocument._createAttribute({localName:name,value}));
}
function find(element,namespace,localName){
 localName=text(localName);const prefix=namespacePrefixes.get(namespace);
 return(prefix?attributes.getAttributeByName(element,prefix+':'+localName):null)??attributes.getAttributeByName(element,localName);
}
function attach(element,attr){
 if(attr._element!==null&&attr._element!==element)throw DOMException.create(element._globalObject,['Attribute is already in use','InUseAttributeError']);
 if(attr._element===element)return attr;
 // Native retains the Attr's immutable declared name while the actual HTML
 // element index and serialized name use the normalized spelling.
 const declared=declaredNames.get(attr)??attr._localName,physical=attributeName(element,declared);
 if(physical!==declared)declaredNames.set(attr,declared);
 attr._localName=physical;
 if(attr._ownerDocument!==element._ownerDocument)element._ownerDocument._adoptNode(attr);
 return attributes.setAttribute(element,attr);
}
function patch(){
 if(patched)return;patched=true;
 const element=ElementImpl.prototype,document=DocumentImpl.prototype,map=NamedNodeMapImpl.prototype;
 for(const name of ['getAttribute','getAttributeNode','hasAttribute','removeAttribute']){
  const original=element[name];element[name]=function(name){return apply(original,this,[owns(this._ownerDocument)?text(name):name]);};
 }
 const setAttribute=element.setAttribute; element.setAttribute=function(name,value){if(!owns(this._ownerDocument))return apply(setAttribute,this,arguments);set(this,name,value);};
 const toggle=element.toggleAttribute;element.toggleAttribute=function(name,force){
  if(!owns(this._ownerDocument))return apply(toggle,this,arguments);
  name=attributeName(this,validate(this._globalObject,text(name)));const old=attributes.getAttributeByName(this,name);
  if(old){if(force===undefined||force===false){attributes.removeAttribute(this,old);return false}return true}
  if(force===false)return false;attributes.appendAttribute(this,this._ownerDocument._createAttribute({localName:name,value:''}));return true;
 };
 const setNS=element.setAttributeNS;element.setAttributeNS=function(namespace,name,value){
  if(!owns(this._ownerDocument))return apply(setNS,this,arguments);
  name=text(name);const parts=name.split(':');if(parts.length>2||parts.some(part=>!part.length))invalid(this._globalObject);
  validate(this._globalObject,name);set(this,namespace===null?parts.at(-1):name,value);
 };
 for(const name of ['getAttributeNS','getAttributeNodeNS','hasAttributeNS','removeAttributeNS']){
  const original=element[name];element[name]=function(namespace,localName){
   if(!owns(this._ownerDocument))return apply(original,this,arguments);
   const attr=find(this,namespace===null?null:text(namespace),localName);
   if(name==='getAttributeNS')return attr?attr._value:null;
   if(name==='getAttributeNodeNS')return attr;
   if(name==='hasAttributeNS')return attr!==null;
   if(attr)attributes.removeAttribute(this,attr);
  };
 }
 const create=document.createAttribute;document.createAttribute=function(name){if(!owns(this))return apply(create,this,arguments);name=validate(this._globalObject,text(name));return this._createAttribute({localName:name});};
 const createNS=document.createAttributeNS;document.createAttributeNS=function(namespace,name){if(!owns(this))return apply(createNS,this,arguments);name=validate(this._globalObject,text(name));return this._createAttribute({localName:name});};
 for(const name of ['setAttributeNode','setAttributeNodeNS']){const original=element[name];element[name]=function(attr){return owns(this._ownerDocument)?attach(this,attr):apply(original,this,arguments);};}
 for(const name of ['setNamedItem','setNamedItemNS']){const original=map[name];map[name]=function(attr){return owns(this._element._ownerDocument)?attach(this._element,attr):apply(original,this,arguments);};}
 for(const name of ['name','localName','nodeName']){const descriptor=Object.getOwnPropertyDescriptor(AttrImpl.prototype,name);Object.defineProperty(AttrImpl.prototype,name,{...descriptor,get(){return declaredNames.get(this)??apply(descriptor.get,this,[]);}});}
 const clone=NodeImpl.prototype.cloneNode;NodeImpl.prototype.cloneNode=function(...args){const copy=apply(clone,this,args);if(this instanceof AttrImpl&&owns(this._ownerDocument)&&declaredNames.has(this))copy._localName=declaredNames.get(this);return copy;};
 const importNode=document.importNode;document.importNode=function(node,...args){const copy=apply(importNode,this,[node,...args]);if(owns(this)&&node instanceof AttrImpl&&declaredNames.has(node))copy._localName=declaredNames.get(node);return copy;};
 for(const name of ['getNamedItem','removeNamedItem']){const original=map[name];map[name]=function(name){return apply(original,this,[owns(this._element._ownerDocument)?text(name):name]);};}
 for(const name of ['getNamedItemNS','removeNamedItemNS']){
  const original=map[name];map[name]=function(namespace,localName){
   if(!owns(this._element._ownerDocument))return apply(original,this,arguments);
   const attr=find(this._element,namespace===null?null:text(namespace),localName);
   if(name==='getNamedItemNS')return attr;
   if(!attr)throw DOMException.create(this._globalObject,['Attribute was not found','NotFoundError']);
   attributes.removeAttribute(this._element,attr);return attr;
  };
 }
}
function forward(window,context,prototype,name,stringIndices,attrArgument=false){
 const descriptor=Object.getOwnPropertyDescriptor(prototype,name),original=descriptor.value,TypeError=vm.runInContext('TypeError',context);
 const invoke=(receiver,args)=>{
  const implementation=platformFactoryRecord(receiver)?.implementation;
  if(!implementation)throw new TypeError('Illegal invocation');
  const document=implementation instanceof DocumentImpl?implementation:implementation._ownerDocument??implementation._element?._ownerDocument;
  if(!owns(document))return apply(original,receiver,args);
  if(attrArgument&&args.length&&platformFactoryRecord(args[0])?.kind!=='Attr')throw new TypeError('Expected a genuine Attr');
  // Only primitive Symbols have Native's description shortcut. All authored
  // object coercion remains inside the original generated WebIDL operation.
  const values=Array.from(args);for(const index of stringIndices)if(index<values.length&&typeof values[index]==='symbol')values[index]=String(apply(symbolDescription,values[index],[]));
  return apply(original,receiver,values);
 };
 const parameters=Array.from({length:original.length},(_,index)=>'a'+index).join(',');
 const method=vm.compileFunction(`return ({${name}(${parameters}){return invoke(this,arguments)}}).${name};`,['invoke'],{parsingContext:context})(invoke);
 Object.defineProperty(prototype,name,{...descriptor,value:method});
}
export function installAttributeNames(window,{context}={}){
 context??=implementationForWrapper(window.document)._globalObject;
 if(installed.has(context))return;installed.add(context);patch();ownedGlobals.add(context);ownedGlobals.add(implementationForWrapper(window.document)._globalObject);
 for(const[name,indices]of [['setAttribute',[0,1]],['toggleAttribute',[0]],['getAttribute',[0]],['getAttributeNode',[0]],['hasAttribute',[0]],['removeAttribute',[0]],['setAttributeNS',[0,1,2]],['getAttributeNS',[0,1]],['getAttributeNodeNS',[0,1]],['hasAttributeNS',[0,1]],['removeAttributeNS',[0,1]]])forward(window,context,window.Element.prototype,name,indices);
 for(const[name,indices]of [['createAttribute',[0]],['createAttributeNS',[0,1]]])forward(window,context,window.Document.prototype,name,indices);
 for(const[name,indices]of [['getNamedItem',[0]],['removeNamedItem',[0]],['getNamedItemNS',[0,1]],['removeNamedItemNS',[0,1]]])forward(window,context,window.NamedNodeMap.prototype,name,indices);
 for(const name of ['setAttributeNode','setAttributeNodeNS'])forward(window,context,window.Element.prototype,name,[],true);
 for(const name of ['setNamedItem','setNamedItemNS'])forward(window,context,window.NamedNodeMap.prototype,name,[],true);
 // This member is absent from the measured Native Attr interface. Its real
 // backend prefix remains private and available to the DOM implementation.
 delete window.Attr.prototype.prefix;
}
