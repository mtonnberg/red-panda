import {createRequire} from 'node:module';
import {StorageArea} from './storage-area.js';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
import {captureDOMExceptionFactory} from './worker-dom-exception.js';
const require=createRequire(import.meta.url),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const contexts=new WeakMap(),trees=new WeakMap(),installed=new WeakMap(),wrappers=new WeakMap();
const quota=5*1024*1024,normalize=value=>String.prototype.toWellFormed.call(value);
const privateRecord=properties=>Object.assign(Object.create(null),properties);
function write(state,key,value,exception){
 const area=state.area,previous=area.items.get(key),bytes=area.bytes-(previous===undefined?0:Buffer.byteLength(previous,'utf8'))+Buffer.byteLength(value,'utf8');
 if(bytes>quota)throw exception('The quota has been exceeded','QuotaExceededError');
 area.set(key,value);area.bytes=bytes;
}
function remove(area,key){const previous=area.items.get(key);if(previous!==undefined){area.bytes-=Buffer.byteLength(previous,'utf8');area.remove(key)}}
function storageFactory(g,bridge){
 const TypeError=g.TypeError,Number=g.Number,String=g.String;
 const apply=Reflect.apply,define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor;
 const symbolDescription=descriptor(Symbol.prototype,'description').get;
 const text=value=>bridge.normalize(typeof value==='symbol'?String(apply(symbolDescription,value,[])):String(value));
 const brand=value=>{if(!bridge.has(value))throw new TypeError('Illegal invocation');return value};
 const required=count=>{if(!count)throw new TypeError('invalid argument')};
 function Storage(){throw new TypeError('Illegal Constructor')}
 const prototype=Storage.prototype;define(Storage,'prototype',{writable:false});
 function length(){return bridge.size(brand(this))}
 define(length,'name',{value:'get length',configurable:true});
 define(prototype,'length',{get:length,enumerable:true,configurable:true});
 const method=(name,value)=>define(prototype,name,{value,writable:true,enumerable:true,configurable:true});
 method('getItem',function getItem(key){brand(this);required(arguments.length);return bridge.get(this,text(key))});
 method('setItem',function setItem(key,value){brand(this);required(arguments.length>=2);key=text(key);value=text(value);bridge.set(this,key,value)});
 method('removeItem',function removeItem(key){brand(this);required(arguments.length);bridge.remove(this,text(key))});
 method('clear',function clear(){bridge.clear(brand(this))});
 method('key',function key(index){brand(this);required(arguments.length);return bridge.key(this,Number(index)>>>0)});
 const constructor=descriptor(prototype,'constructor');delete prototype.constructor;define(prototype,'constructor',constructor);
 define(prototype,Symbol.toStringTag,{value:'Storage',configurable:true});
 define(g,'Storage',{value:Storage,writable:true,configurable:true});
 const propertySet=function(value,key,item){brand(value);bridge.set(value,text(key),text(item))};
 bridge.install(prototype,propertySet,Storage);
 for(const kind of ['localStorage','sessionStorage']){
  const get=function(){return bridge.area(kind)};define(get,'name',{value:'get '+kind,configurable:true});define(g,kind,{get,enumerable:true,configurable:true});
 }
}
function principal(window){const controller=installed.get(window),document=controller.document,origin=document._origin;if(origin!=='null')return origin;if(controller.parent&&document._URL.scheme==='about'&&['blank','srcdoc'].includes(document._URL.path))return principal(controller.parent);return document}
export function installWebStorage(page,window){
 if(installed.has(window))return;
 const context=page.context,root=page.registry?.page??page,token=root.documentAbort;
 let areas=contexts.get(context);if(!areas){areas=privateRecord({tuples:new Map(),opaque:new WeakMap()});contexts.set(context,areas)}
 let tree=trees.get(token);if(!tree){tree=new Map();trees.set(token,tree)}
 const parent=window.parent!==window?window.parent:null,exception=captureDOMExceptionFactory(window);
 let prototype,propertySet,realmAnchor;
 const stateFor=kind=>{
  const origin=principal(window),registry=typeof origin==='string'?areas.tuples:areas.opaque;let pair=registry.get(origin);
  if(!pair){pair=privateRecord({localStorage:new StorageArea(),sessionStorage:new StorageArea()});registry.set(origin,pair)}
  let views=tree.get(origin);if(!views){views=Object.create(null);tree.set(origin,views)}
  if(views[kind])return views[kind];
  let value;const state=privateRecord({area:pair[kind]});
  const handlers=Object.freeze(privateRecord({has:key=>state.area.items.has(normalize(key)),get:key=>state.area.items.get(normalize(key)),keys:()=>state.area.keys(),set:(key,item,caller)=>(installed.get(caller)?.propertySet??propertySet)(value,key,item),remove:key=>remove(state.area,normalize(key))}));
  value=page.browser.collectionsBinding.createStorage(handlers,prototype,realmAnchor);wrappers.set(value,state);registerPlatformFactory(value,{kind:'Storage',implementation:state,globalObject:window});views[kind]=value;return value;
 };
 installed.set(window,privateRecord({parent,document:implForWrapper(window.document)}));
 registerPlatformFactoryKind('Storage');
 const bridge=Object.freeze(privateRecord({normalize,has:value=>wrappers.has(value),area:stateFor,size:value=>wrappers.get(value).area.items.size,
  get:(value,key)=>wrappers.get(value).area.items.get(key)??null,set:(value,key,item)=>write(wrappers.get(value),key,item,exception),remove:(value,key)=>remove(wrappers.get(value).area,key),clear:value=>wrappers.get(value).area.clear(),key:(value,index)=>wrappers.get(value).area.keys()[index]??null,
  install:(p,s,a)=>{prototype=p;propertySet=s;realmAnchor=a;installed.get(window).propertySet=s},
 }));
 window.eval(`(${storageFactory.toString()})`)(window,bridge);
}
