import 'jsdom';
import {createRequire} from 'node:module';

// Keep jsdom's generated Storage proxies and their actual private records.
// Native's quota counts UTF-8 value bytes (keys do not consume quota). Its two
// areas are context/origin persistent; wrappers are shared within a live tree
// and recreated on full top-level navigation. See proposals/webstorage.
const require=createRequire(import.meta.url);
const StorageIDL=require('jsdom/lib/jsdom/living/generated/Storage.js');
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const StorageImpl=require('jsdom/lib/jsdom/living/webstorage/Storage-impl.js').implementation;
const contexts=new WeakMap(),trees=new WeakMap(),installed=new WeakMap(),records=new WeakMap(),wrappers=new WeakMap();
const quota=5*1024*1024,wellFormed=String.prototype.toWellFormed;
let patched=false;
const normalize=value=>Reflect.apply(wellFormed,value,[]);
function write(state,key,value,Exception=state.Exception){
 const area=state.area,previous=area.items.get(key);
 const bytes=area.bytes-(previous===undefined?0:Buffer.byteLength(previous,'utf8'))+Buffer.byteLength(value,'utf8');
 if(bytes>quota)throw new Exception('The quota has been exceeded','QuotaExceededError');
 area.items.set(key,value);area.bytes=bytes;
 // Native does not dispatch storage events for these shared live-frame areas.
}
function patch(){
 if(patched)return;patched=true;
 for(const name of ['setItem','removeItem','clear']){
  const original=StorageImpl.prototype[name];
  StorageImpl.prototype[name]=function(...args){
   const state=records.get(this);if(!state)return Reflect.apply(original,this,args);
   const area=state.area;
   if(name==='clear'){area.items.clear();area.bytes=0;return;}
   const key=normalize(args[0]);
   if(name==='setItem')return write(state,key,normalize(args[1]));
   const previous=area.items.get(key);
   if(previous!==undefined){area.bytes-=Buffer.byteLength(previous,'utf8');area.items.delete(key);}
  };
 }
}
function storageFactory(g,bridge){
 const TypeError=g.TypeError,Exception=g.DOMException,Number=g.Number,String=g.String;
 const apply=Reflect.apply,define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor;
 const symbolDescription=descriptor(Symbol.prototype,'description').get;
 const text=value=>bridge.normalize(typeof value==='symbol'?String(apply(symbolDescription,value,[])):String(value));
 const brand=value=>{const state=bridge.state(value);if(!state)throw new TypeError('invalid argument');return state;};
 const required=count=>{if(!count)throw new TypeError('invalid argument');};
 const methods={
  get length(){return bridge.size(brand(this));},
  getItem(key){const state=brand(this);required(arguments.length);return bridge.getItem(state,text(key));},
  setItem(key,value){const state=brand(this);required(arguments.length>=2);key=text(key);value=text(value);bridge.setItem(state,key,value,Exception);},
  removeItem(key){const state=brand(this);required(arguments.length);bridge.removeItem(state,text(key));},
  clear(){bridge.clear(brand(this));},
  key(index){const state=brand(this);required(arguments.length);return bridge.key(state,Number(index)>>>0);},
 };
 const prototype=g.Storage.prototype,constructor=descriptor(prototype,'constructor'),tag=descriptor(prototype,Symbol.toStringTag);
 for(const key of Reflect.ownKeys(prototype))delete prototype[key];
 for(const key of ['length','getItem','setItem','removeItem','clear','key'])define(prototype,key,{...descriptor(methods,key),enumerable:true});
 define(prototype,'constructor',constructor);define(prototype,Symbol.toStringTag,tag);
 const getters={get localStorage(){return bridge.area('localStorage');},get sessionStorage(){return bridge.area('sessionStorage');}};
 for(const kind of ['localStorage','sessionStorage'])define(g,kind,{...descriptor(getters,kind),enumerable:true,configurable:true});
}
function principal(window){
 const controller=installed.get(window),document=controller.document,origin=document._origin;
 if(origin!=='null')return origin;
 // Blank/srcdoc frames inherit even opaque parents; independent data documents
 // retain their actual document identity rather than the string "null".
 if(controller.parent&&document._URL.scheme==='about'&&['blank','srcdoc'].includes(document._URL.path))return principal(controller.parent);
 return document;
}
export function installWebStorage(page,window){
 if(installed.has(window))return;
 patch();
 const context=page.context,root=page.registry?.page??page,token=root.documentAbort;
 let areas=contexts.get(context);if(!areas){areas={tuples:new Map(),opaque:new WeakMap()};contexts.set(context,areas);}
 let tree=trees.get(token);if(!tree){tree=new Map();trees.set(token,tree);}
 const native={localStorage:window._localStorage,sessionStorage:window._sessionStorage};
 const parent=window.parent!==window?window.parent:null;
 const Exception=window.DOMException;
 const stateFor=kind=>{
  const origin=principal(window),registry=typeof origin==='string'?areas.tuples:areas.opaque;let pair=registry.get(origin);
  if(!pair){pair={localStorage:{items:new Map(),bytes:0},sessionStorage:{items:new Map(),bytes:0}};registry.set(origin,pair);}
  let views=tree.get(origin);if(!views){views={};tree.set(origin,views);}
  if(views[kind])return views[kind];
  const original=native[kind],originalImpl=implForWrapper(original);
  // A redirected frame can expose its provisional window to a preload before
  // committing its final origin. Never retarget an already published wrapper.
  const wrapper=records.has(originalImpl)?StorageIDL.create(originalImpl._globalObject,[],{associatedWindow:window,storageArea:pair[kind].items,url:originalImpl._url,type:kind,storageQuota:quota}):original;
  const implementation=implForWrapper(wrapper),state={area:pair[kind],implementation,Exception};
  implementation._items=state.area.items;
  records.set(implementation,state);wrappers.set(wrapper,state);views[kind]=wrapper;
  return wrapper;
 };
 installed.set(window,{parent,document:implForWrapper(window.document)});
 const removeItem=StorageImpl.prototype.removeItem,clear=StorageImpl.prototype.clear;
 const bridge={normalize,state:value=>wrappers.get(value),area:stateFor,size:state=>state.area.items.size,
  getItem:(state,key)=>state.area.items.get(key)??null,
  setItem:write,
  removeItem:(state,key)=>Reflect.apply(removeItem,state.implementation,[key]),
  clear:state=>Reflect.apply(clear,state.implementation,[]),
  key:(state,index)=>index>=state.area.items.size?null:[...state.area.items.keys()][index],
 };
 window.eval(`(${storageFactory.toString()})`)(window,bridge);
}
