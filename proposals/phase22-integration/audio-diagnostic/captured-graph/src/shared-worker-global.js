import vm from'node:vm';
import{registerPlatformFactory}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
// A raw actual VM global avoids Node Contextify's different receiver for
// unqualified accessor assignments. No Host sandbox becomes the public global.
export function createSharedWorkerContext(sandbox){const context=vm.createContext(vm.constants.DONT_CONTEXTIFY);Object.assign(context,sandbox);return context}
function scopeFactory(g,b){
 'use strict';const TypeError=g.TypeError,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,setPrototype=g.Object.setPrototypeOf;
 function WorkerGlobalScope(){throw new TypeError('Illegal Constructor')}
 function SharedWorkerGlobalScope(){throw new TypeError('Illegal Constructor')}
 const valid=value=>{if(value!==g)throw new TypeError('Illegal invocation')};
 setPrototype(WorkerGlobalScope,g.EventTarget);setPrototype(WorkerGlobalScope.prototype,g.EventTarget.prototype);define(WorkerGlobalScope.prototype,g.Symbol.toStringTag,{value:'WorkerGlobalScope',configurable:true});define(WorkerGlobalScope,'prototype',{writable:false});setPrototype(SharedWorkerGlobalScope,WorkerGlobalScope);
 const prototype={
  get name(){valid(this);return b.name},
  close(){if(this!==null&&this!==undefined)valid(this);b.close()},
  get onconnect(){valid(this);return b.events.getHandler(g,'connect')},
  set onconnect(value){valid(this);b.events.setHandler(g,'connect',value)},
 };
 define(prototype,'constructor',{value:SharedWorkerGlobalScope,writable:true,configurable:true});setPrototype(prototype,WorkerGlobalScope.prototype);define(prototype,g.Symbol.toStringTag,{value:'SharedWorkerGlobalScope',configurable:true});define(SharedWorkerGlobalScope,'prototype',{value:prototype,writable:false});
 for(const key of['name','close','onconnect'])define(g,key,descriptor(prototype,key));
 // Preserve the original engine global prototype. The raw Node global has an
 // Object constructor rather than Native's distinct typed intrinsic one; the
 // public Scope constructor supplies this independent interface's constructor.
 const intrinsic=b.intrinsic,engineConstructor=descriptor(intrinsic,'constructor').value;setPrototype(intrinsic,prototype);
 if(engineConstructor.prototype===intrinsic)define(engineConstructor,'name',{...descriptor(engineConstructor,'name'),value:'SharedWorkerGlobalScope'});else define(intrinsic,'constructor',{value:SharedWorkerGlobalScope,writable:true,configurable:true});setPrototype(g,intrinsic);
 for(const key of['postMessage','onmessage','onmessageerror','Worker'])delete g[key];
 define(g,'WorkerGlobalScope',{value:WorkerGlobalScope,writable:true,configurable:true});define(g,'SharedWorkerGlobalScope',{value:SharedWorkerGlobalScope,writable:true,configurable:true});
}
export function installSharedWorkerGlobal(realm,{context,events,name,close}){
 for(const kind of['WorkerGlobalScope','SharedWorkerGlobalScope'])registerPlatformFactoryKind(kind);
 const bridge=Object.assign(Object.create(null),{events,name,close,intrinsic:Object.getPrototypeOf(realm)});
 vm.runInContext(`(${scopeFactory.toString()})`,context)(realm,bridge);
 registerPlatformFactory(realm,{kind:'SharedWorkerGlobalScope',implementation:events.nativeTarget(realm),globalObject:realm});
}
