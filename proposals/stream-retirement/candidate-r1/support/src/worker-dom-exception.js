// Real selected-VM Error allocation and Host-private actual Node DOMException
// slots. Node's constructor returns its own Host Error and ignores newTarget's
// creation realm, so it is deliberately used only as the private backend.
import { registerPlatformFactoryKind } from './platform-factory-hooks.js';
import { registerPlatformFactory, platformFactoryRecord } from './platform-factories.js';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),generated=require('jsdom/lib/jsdom/living/generated/DOMException.js'),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const NativeException=globalThis.DOMException,apply=Reflect.apply;
const readers=Object.fromEntries(['name','message','code'].map(name=>[name,Object.getOwnPropertyDescriptor(NativeException.prototype,name).get]));
const constants=Object.getOwnPropertyNames(NativeException).filter(name=>/^[A-Z][A-Z0-9_]*$/.test(name)&&typeof Object.getOwnPropertyDescriptor(NativeException,name).value==='number').map(name=>[name,NativeException[name]]);
const installed=new WeakMap(),states=new WeakMap(),producers=new WeakMap();
function factory(g,bridge){
 'use strict';
 const define=g.Object.defineProperty,setPrototype=g.Object.setPrototypeOf,TypeError=g.TypeError,String=g.String,apply=g.Reflect.apply,construct=g.Reflect.construct,Error=g.Error;
 const description=g.Object.getOwnPropertyDescriptor(g.Symbol.prototype,'description').get;
 const text=value=>typeof value==='symbol'?apply(description,value,[])??'':String(value);
 function DOMException(){if(new.target===undefined)throw new TypeError('invalid argument');const message=arguments[0]===undefined?'':text(arguments[0]),name=arguments[1]===undefined?'Error':text(arguments[1]),value=construct(Error,[],new.target);delete value.stack;bridge.store(value,message,name);return value}
 const prototype=DOMException.prototype;delete prototype.constructor;define(DOMException,'prototype',{writable:false});setPrototype(prototype,g.Error.prototype);
 for(const name of['code','name','message']){const accessors={[`get ${name}`](){const result=bridge.read(this,name);if(!result.ok)throw new TypeError('Illegal invocation');return result.value}};define(prototype,name,{get:accessors[`get ${name}`],enumerable:true,configurable:true})}
 const methods={toString(){const name=bridge.read(this,'name'),message=bridge.read(this,'message');if(!name.ok||!message.ok)throw new TypeError('Illegal invocation');return name.value+': '+message.value}};define(prototype,'toString',{value:methods.toString,writable:true,enumerable:true,configurable:true});
 for(const[name,value]of bridge.constants){define(prototype,name,{value,enumerable:true});define(DOMException,name,{value,enumerable:true})}
 define(prototype,'constructor',{value:DOMException,writable:true,configurable:true});
 define(prototype,g.Symbol.toStringTag,{value:'DOMException',configurable:true});
 define(g,'DOMException',{value:DOMException,writable:true,configurable:true});return DOMException;
}
export function installWorkerDOMException(realm,{evaluate=source=>realm.eval(source)}={}){
 if(installed.has(realm))return installed.get(realm);
 registerPlatformFactoryKind('DOMException');
 const Exception=evaluate(`(${factory.toString()})`)(realm,{
  constants,
  store(value,message,name){const backend=new NativeException(message,name),state=Object.freeze(Object.assign(Object.create(null),{backend}));states.set(value,state);registerPlatformFactory(value,{kind:'DOMException',implementation:state,globalObject:realm})},
  read(value,name){const state=states.get(value);return state?{ok:true,value:apply(readers[name],state.backend,[])}:{ok:false}},
 });installed.set(realm,Exception);return Exception;
}
export function captureDOMExceptionFactory(realm){
 if(producers.has(realm))return producers.get(realm);
 const Exception=installed.get(realm)??realm.DOMException,registry=Object.getOwnPropertyDescriptor(realm,utils.ctorRegistrySymbol)?.value;
 // Already-converted scalar messages bypass generated DOMString conversion,
 // which otherwise consults an authored replacement of Window.String.
 let allocate;
 if(registry?.DOMException===Exception){
  const Error=realm.Error,construct=realm.Reflect.construct,define=realm.Object.defineProperty,remove=realm.Reflect.deleteProperty;
  const target=realm.eval('(function DOMException(){})');define(target,'prototype',{value:Exception.prototype,writable:false});
  allocate=(message,name)=>{
   const value=construct(Error,[],target);
   // The trusted generated init captures a stack via wrapper.constructor.
   // Initialization uses a captured constructor, then removes that temporary
   // own field before the public value can be observed.
   define(value,'constructor',{value:Exception,configurable:true});
   try{return generated.setup(value,realm,[message,name])}finally{remove(value,'constructor')}
  };
 }else allocate=(message,name)=>new Exception(message,name);
 const producer=(message,name)=>{const value=allocate(message,name);delete value.stack;return value};producers.set(realm,producer);return producer;
}
export function domExceptionRecord(value){
 const state=states.get(value);if(state)return{kind:'DOMException',name:apply(readers.name,state.backend,[]),message:apply(readers.message,state.backend,[])};
 // The pinned generated Window factory owns its real implementation slots.
 // No authored getter, implementation symbol, or tag is read for provenance.
 const factory=platformFactoryRecord(value),implementation=factory?.kind==='DOMException'?factory.implementation:null;
 return implementation&&typeof implementation.name==='string'&&typeof implementation.message==='string'?{kind:'DOMException',name:implementation.name,message:implementation.message}:null;
}
export function validDOMExceptionRecord(record){return record?.kind==='DOMException'&&typeof record.name==='string'&&typeof record.message==='string'}
export function deserializeDOMException(realm,record){if(!validDOMExceptionRecord(record))throw new TypeError('Invalid DOMException receiver');return captureDOMExceptionFactory(realm)(record.message,record.name)}
