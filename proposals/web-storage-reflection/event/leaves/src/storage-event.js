import {createRequire} from 'node:module';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const require=createRequire(import.meta.url),EventIDL=require('jsdom/lib/jsdom/living/generated/Event.js'),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const events=new WeakMap(),installed=new WeakSet(),record=properties=>Object.assign(Object.create(null),properties);
function factory(g,bridge){
 const TypeError=g.TypeError,String=g.String,apply=Reflect.apply,define=Object.defineProperty,setPrototype=Object.setPrototypeOf;
 const description=Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get,Event=g.Event,eventPrototype=Event.prototype;
 const text=value=>bridge.normalize(typeof value==='symbol'?String(apply(description,value,[])):String(value));
 const nullable=value=>value==null?null:text(value),object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 const brand=value=>{if(!bridge.has(value))throw new TypeError('Illegal invocation')};
 function StorageEvent(type){
  if(new.target===undefined||arguments.length===0)throw new TypeError('invalid argument');
  const name=text(type),input=arguments[1];if(input!=null&&!object(input))throw new TypeError('invalid argument');
  const bubbles=input!=null&&'bubbles'in input?!!input.bubbles:false,cancelable=input!=null&&'cancelable'in input?!!input.cancelable:false,composed=input!=null&&'composed'in input?!!input.composed:false;
  let key=null,newValue=null,oldValue=null,url='';
  if(input!=null&&'key'in input)key=nullable(input.key);
  if(input!=null&&'newValue'in input)newValue=nullable(input.newValue);
  if(input!=null&&'oldValue'in input)oldValue=nullable(input.oldValue);
  if(input!=null&&'url'in input){const value=input.url;if(value!==undefined)url=text(value)}
  bridge.create(this,name,bubbles,cancelable,composed,key,oldValue,newValue,url);
 }
 const prototype=StorageEvent.prototype;setPrototype(prototype,eventPrototype);setPrototype(StorageEvent,Event);define(StorageEvent,'prototype',{writable:false});
 for(const field of['key','oldValue','newValue','url','storageArea']){
  const get=function(){brand(this);return bridge.read(this,field)};define(get,'name',{value:'get '+field,configurable:true});define(prototype,field,{get,enumerable:true,configurable:true});
 }
 function initStorageEvent(type){
  brand(this);if(arguments.length===0)throw new TypeError('invalid argument');
  const name=text(type),bubbles=!!arguments[1],cancelable=!!arguments[2],key=nullable(arguments[3]),oldValue=nullable(arguments[4]),newValue=nullable(arguments[5]),url=arguments[6]===undefined?'':text(arguments[6]);
  bridge.init(this,name,bubbles,cancelable,key,oldValue,newValue,url);
 }
 define(prototype,'initStorageEvent',{value:initStorageEvent,writable:true,enumerable:true,configurable:true});const constructor=Object.getOwnPropertyDescriptor(prototype,'constructor');delete prototype.constructor;define(prototype,'constructor',constructor);define(prototype,Symbol.toStringTag,{value:'StorageEvent',configurable:true});
 define(g,'StorageEvent',{value:StorageEvent,writable:true,configurable:true});
}
export function installStorageEvent(window){
 if(installed.has(window))return;installed.add(window);registerPlatformFactoryKind('StorageEvent');
 const bridge=Object.freeze(record({normalize:value=>String.prototype.toWellFormed.call(value),has:value=>events.has(value),
  create(value,type,bubbles,cancelable,composed,key,oldValue,newValue,url){
   EventIDL.setup(value,window,[type,{bubbles,cancelable,composed}],{isTrusted:false});
   const implementation=implForWrapper(value),state=record({implementation,key,oldValue,newValue,url});events.set(value,state);registerPlatformFactory(value,{kind:'StorageEvent',implementation:state,globalObject:window});
  },
  read(value,field){return field==='storageArea'?null:events.get(value)[field]},
  init(value,type,bubbles,cancelable,key,oldValue,newValue,url){const state=events.get(value),implementation=state.implementation;if(implementation._dispatchFlag)return;implementation.type=type;implementation.bubbles=bubbles;implementation.cancelable=cancelable;implementation.isTrusted=false;state.key=key;state.oldValue=oldValue;state.newValue=newValue;state.url=url},
 }));window.eval(`(${factory.toString()})`)(window,bridge);
}
