import vm from'node:vm';
import{createRequire}from'node:module';
import{registerPlatformFactory}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
import{registerProtocolPrototype}from'./protocol-classes.js';
import{captureDOMExceptionFactory}from'./worker-dom-exception.js';
import{captureWorkerCreator}from'./worker-apis.js';
import{onFrameRetirement}from'./frame-retirement-hooks.js';
import{openEventSourceTransport}from'./eventsource-transport.js';
import{eventSourcePolicy}from'./eventsource-policy.js';
const require=createRequire(import.meta.url),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const installed=new WeakMap(),states=new WeakMap(),apply=Reflect.apply,record=value=>Object.assign(Object.create(null),value);
function factory(g,b){
 'use strict';const TypeError=g.TypeError,String=g.String,EventTarget=g.EventTarget,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,setPrototype=g.Object.setPrototypeOf,construct=g.Reflect.construct,apply=g.Reflect.apply,description=descriptor(g.Symbol.prototype,'description').get,wellFormed=g.String.prototype.toWellFormed;
 const invalid=()=>{throw new TypeError('invalid argument')},brand=value=>{if(!b.has(value))throw new TypeError('Illegal invocation')},text=value=>apply(wellFormed,String(typeof value==='symbol'?apply(description,value,[]):value),[]);
 function EventSource(url){if(!new.target||!arguments.length)invalid();url=text(url);const init=arguments[1];let credentials=false;if(init!==undefined&&init!==null){if(typeof init!=='object'&&typeof init!=='function')invalid();credentials=!!init.withCredentials}b.create(this,url,credentials)}
 const p={};for(const[name,value]of Object.entries({CONNECTING:0,OPEN:1,CLOSED:2})){define(p,name,{value,enumerable:true});define(EventSource,name,{value,enumerable:true})}
 for(const name of['url','readyState','withCredentials']){const accessor={get [name](){brand(this);return b.get(this,name)}};define(p,name,{get:descriptor(accessor,name).get,enumerable:true,configurable:true})}
 for(const name of['onopen','onmessage','onerror']){const accessor={get [name](){brand(this);return b.handler(this,name.slice(2))},set [name](value){brand(this);b.handler(this,name.slice(2),typeof value==='function'?value:null,true)}};define(p,name,{get:descriptor(accessor,name).get,set:descriptor(accessor,name).set,enumerable:true,configurable:true})}
 const methods={close(){brand(this);b.close(this)}};define(p,'close',{value:methods.close,writable:true,enumerable:true,configurable:true});define(p,'constructor',{value:EventSource,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:'EventSource',configurable:true});setPrototype(p,EventTarget.prototype);setPrototype(EventSource,EventTarget);define(EventSource,'prototype',{value:p,writable:false});define(g,'EventSource',{value:EventSource,writable:true,configurable:true});b.prototype(p);
}
export function installEventSource(realm,{evaluate,baseURL,createTransport,signal,active=()=>!signal?.aborted,trustEvent=value=>value,dispatchTrusted,initializeTarget}={}){
 if(installed.has(realm))return installed.get(realm);registerPlatformFactoryKind('EventSource');const Exception=captureDOMExceptionFactory(realm),Event=realm.Event,MessageEvent=realm.MessageEvent,dispatch=realm.EventTarget.prototype.dispatchEvent,add=realm.EventTarget.prototype.addEventListener,remove=realm.EventTarget.prototype.removeEventListener,live=new Set();
 const bridge=record({has:value=>states.has(value),prototype:value=>registerProtocolPrototype(value,'EventSource'),
  create(value,input,credentials){let url;try{url=new URL(input,baseURL()).href}catch{throw Exception('The string did not match the expected pattern','SyntaxError')}initializeTarget(value);const state=record({url,withCredentials:credentials,transport:null,handlers:new Map()});states.set(value,state);registerPlatformFactory(value,{kind:'EventSource',implementation:state,globalObject:realm});
   state.transport=createTransport(url,credentials,(type,data)=>{if(!active())return;if(type==='error'&&data.readyState===2)live.delete(state);const event=type==='message'?new MessageEvent(data.type,{data:data.data,lastEventId:data.lastEventId,origin:data.origin}):new Event(type);trustEvent(event);if(dispatchTrusted)dispatchTrusted(value,event);else apply(dispatch,value,[event])});live.add(state);
  },get(value,name){const state=states.get(value);return name==='readyState'?state.transport.get('readyState'):state[name]},
  close(value){const state=states.get(value);state.transport.close();live.delete(state)},
  handler(value,type,callback,set){const state=states.get(value),old=state.handlers.get(type);if(!set)return old?.callback??null;if(old){if(callback){old.callback=callback;return}apply(remove,value,[type,old.relay]);state.handlers.delete(type);return}if(!callback)return;const entry=record({callback,relay:event=>apply(entry.callback,value,[event])});state.handlers.set(type,entry);apply(add,value,[type,entry.relay])},
 });
 const dispose=()=>{for(const state of live)state.transport.close();live.clear()};const api=record({dispose});installed.set(realm,api);evaluate(`(${factory.toString()})`)(realm,bridge);signal?.addEventListener('abort',dispose,{once:true});return api;
}
export function installWindowEventSource(page,realm,{mainWindow=realm,evaluate,initializeTarget}={}){
 const TargetIDL=require('jsdom/lib/jsdom/living/generated/EventTarget.js'),TargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
 const dispatchGenerated=TargetImpl.prototype._dispatch,creator=captureWorkerCreator(page,mainWindow),document=implForWrapper(mainWindow.document),base=document.baseURLSerialized,context=implForWrapper(mainWindow)?._globalObject,owned=new Set(),policy=eventSourcePolicy(page,{origin:creator().origin,referrer:page.url});
 const api=installEventSource(realm,{evaluate:evaluate??(source=>vm.runInContext(source,context)),baseURL:()=>Reflect.apply(base,document,[]),signal:page.documentAbort.signal,createTransport:(url,withCredentials,emit)=>openEventSourceTransport({url,withCredentials,emit,policy,owner:owned}),initializeTarget:initializeTarget??(value=>TargetIDL.setup(value,realm,[])),dispatchTrusted:(target,event)=>apply(dispatchGenerated,implForWrapper(target),[implForWrapper(event)]),trustEvent:event=>{const implementation=implForWrapper(event);if(!implementation)throw new TypeError('Real Event implementation required');implementation.isTrusted=true;return event}});
 onFrameRetirement(mainWindow,()=>setTimeout(()=>api.dispose(),0));return api;
}
