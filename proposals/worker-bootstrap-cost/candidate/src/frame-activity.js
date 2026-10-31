import {onFrameRetirement,notifyFrameRetirement} from './frame-retirement-hooks.js';
export {onFrameRetirement} from './frame-retirement-hooks.js';
import {retireDeviceRequests} from './device-permissions.js';
// A retired browsing context retains its actual VM and DOM. The original
// main-world tasks present at retirement are canceled; later calls remain valid.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
import { createInvocationTrampoline } from './invocation.js';
import { retireFetchRequests } from './fetch.js';
const activities=new WeakMap(),apply=Reflect.apply;
function activityFactory(g,bridge){
  const finite=Number.isFinite,trunc=Math.trunc;
  const long=value=>{value=+value;return finite(value)?trunc(value)|0:0;};
  const methods={
    setTimeout(handler,delay=0,...args){if(typeof handler!=='function')handler=''+handler;return bridge.timer(false,handler,long(delay),args);},
    setInterval(handler,delay=0,...args){if(typeof handler!=='function')handler=''+handler;return bridge.timer(true,handler,long(delay),args);},
    clearTimeout(handle=0){bridge.clear(long(handle));},clearInterval(handle=0){bridge.clear(long(handle));},
    requestAnimationFrame(callback){if(typeof callback!=='function')throw new TypeError('invalid argument');return bridge.frame(callback);},
    cancelAnimationFrame(handle){const value=+handle;bridge.cancelFrame(finite(value)?trunc(value)>>>0:0);},
  };
  for(const[name,value]of Object.entries(methods))Object.defineProperty(g,name,{value,writable:true,configurable:true,enumerable:true});
  Object.defineProperty(g,'closed',{configurable:true,enumerable:true,get(){return bridge.closed();}});
}
export function installFrameActivity(page,window){
  if(!activities.has(window)){const getter=vm.compileFunction('return {get closed(){return state();}}',['state'],{parsingContext:implForWrapper(window)._globalObject})(()=>Boolean(page.retired||page.closed));Object.defineProperty(window,'closed',{...Object.getOwnPropertyDescriptor(getter,'closed'),configurable:true,enumerable:true});}
  if(!page.registry||activities.has(window))return;
  const source={setTimeout:window.setTimeout,setInterval:window.setInterval,clear:window.clearTimeout,request:window.requestAnimationFrame,cancel:window.cancelAnimationFrame};
  const context=implForWrapper(window)._globalObject,invocation=createInvocationTrampoline(context),timers=new Set(),frames=new Set(),signal=page.documentAbort.signal;
  const options={timeout:Math.min(page.timeout,2000),displayErrors:false};let disposed=false;
  const bridge={
    timer(repeat,callback,delay,args){let id;const invoke=()=>{if(!repeat)timers.delete(id);if(disposed)return;if(typeof callback==='function')return invocation.invoke(callback,window,args,options);return vm.runInContext(callback,context,options);};id=apply(source[repeat?'setInterval':'setTimeout'],window,[invoke,delay]);timers.add(id);return id;},
    clear(id){timers.delete(id);apply(source.clear,window,[id]);},
    frame(callback){let id;id=apply(source.request,window,[timestamp=>{frames.delete(id);if(!disposed)return invocation.invoke(callback,window,[timestamp],options);}]);frames.add(id);return id;},
    cancelFrame(id){frames.delete(id);apply(source.cancel,window,[id]);},
    closed:()=>Boolean(page.retired||page.closed),
  };
  vm.compileFunction(`(${activityFactory.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:context})(bridge);
  const cancel=()=>{for(const id of timers)apply(source.clear,window,[id]);timers.clear();for(const id of frames)apply(source.cancel,window,[id]);frames.clear();retireFetchRequests(window);retireDeviceRequests(window);};
  const dispose=()=>{if(disposed)return;cancel();disposed=true;signal.removeEventListener('abort',dispose);};
  signal.addEventListener('abort',dispose,{once:true});activities.set(window,{cancel,dispose});
}
export function retireFrameActivity(window){activities.get(window)?.cancel();notifyFrameRetirement(window);}
