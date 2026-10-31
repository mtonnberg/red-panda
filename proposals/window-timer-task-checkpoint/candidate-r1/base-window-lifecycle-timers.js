// Actual document task/cancellation owners. Public VM methods never expose the
// Host records; a reflected global, symbol, prototype or Proxy cannot brand one.
import vm from 'node:vm';
import {implementationForWrapper} from './dom-event-state.js';
import {createInvocationTrampoline} from './invocation.js';
import {installErrors} from './errors.js';
import {onFrameRetirement} from './frame-activity.js';
import {fetchStopAuthority} from './fetch.js';
import {xhrStopAuthority,xhrRetirementAuthority} from './xhr.js';
const owners=new WeakMap(),pages=new WeakMap(),apply=Reflect.apply,primitive=value=>value===null||typeof value!=='object'&&typeof value!=='function';
function publicMethods(bridge){'use strict';return{
 setTimeout(handler,delay=0,...args){return bridge.timer(this,false,arguments.length,handler,delay,args)},
 setInterval(handler,delay=0,...args){return bridge.timer(this,true,arguments.length,handler,delay,args)},
 clearTimeout(handle){return bridge.clear(this,arguments.length,handle)},
 clearInterval(handle){return bridge.clear(this,arguments.length,handle)},
 stop(){return bridge.stop(this)},
}}
function numericPrimitive(value,TypeError){
 if(primitive(value))return value;
 const exotic=value[Symbol.toPrimitive];
 if(exotic!==undefined&&exotic!==null){if(typeof exotic!=='function')throw new TypeError('Cannot convert object to primitive value');const result=apply(exotic,value,['number']);if(primitive(result))return result;throw new TypeError('Cannot convert object to primitive value')}
 for(const key of['valueOf','toString']){const method=value[key];if(typeof method==='function'){const result=apply(method,value,[]);if(primitive(result))return result}}
 throw new TypeError('Cannot convert object to primitive value');
}
function number(value,caller){const input=numericPrimitive(value,caller.TypeError);if(typeof input==='bigint')throw new caller.TypeError('Cannot convert a BigInt value to a number');return apply(caller.Number,undefined,[input])}
function delayNumber(value,caller){return number(value,caller)|0}
function handleNumber(value,caller){if(typeof value==='bigint'){const integer=BigInt.asUintN(64,value);if(integer>4294967295n)throw new caller.TypeError('invalid argument');return Number(integer)}return number(value,caller)>>>0}
export function installWindowLifecycleTimers(page,window){
 const context=implementationForWrapper(window)._globalObject;
 if(owners.has(context))return;
 const document=implementationForWrapper(window.document),record=Object.assign(Object.create(null),{page,window,context,document,fetchStops:fetchStopAuthority(window),xhrStops:xhrStopAuthority(window),retireXHR:xhrRetirementAuthority(window),source:{timeout:window.setTimeout,interval:window.setInterval,clear:window.clearTimeout,stop:window.stop},TypeError:window.TypeError,Error:window.Error,Number:window.Number,String:window.String,timers:new Map(),intervals:0,children:new Set(),signal:page.documentAbort.signal,disposed:false,errors:installErrors(page,window),invocation:createInvocationTrampoline(context),options:{timeout:Math.min(page.timeout??2000,2000),displayErrors:false}});
 owners.set(context,record);owners.set(window,record);owners.set(vm.runInContext('globalThis',context),record);pages.set(page,record);
 const parent=page.registry?.findFrame(page.parentFrameId);record.parent=parent?pages.get(parent):undefined;record.parent?.children.add(record);
 const owner=value=>{const result=value==null?record:owners.get(value);if(!result)throw new record.TypeError('Illegal invocation');return result};
 function cancel(target,id){const timer=target.timers.get(id);if(timer){target.timers.delete(id);if(timer.repeat)target.intervals--}apply(target.source.clear,target.window,[id])}
 const bridge=Object.assign(Object.create(null),{
  timer(receiver,repeat,count,callback,delay,args){
   const target=owner(receiver);if(!count)throw new record.TypeError('invalid argument');delay=delayNumber(delay,record);
   let script;if(typeof callback!=='function'){if(typeof callback==='symbol')throw new record.TypeError('invalid argument');const text=apply(record.String,undefined,[callback]);try{script=new vm.Script(text,{filename:record.document.URL,displayErrors:false})}catch{throw new record.Error('CompilationError')}}
   if(repeat&&target.intervals>=2048)throw new record.Error('TooManyTimeout');
   const state=Object.assign(Object.create(null),{id:undefined,repeat});
   const invoke=()=>{if(!repeat)target.timers.delete(state.id);if(target.disposed)return;try{if(script)return script.runInContext(record.context,target.options);return target.invocation.invoke(callback,record.window,args,target.options)}catch(error){record.errors.report(error)}};
   state.id=apply(target.source[repeat?'interval':'timeout'],target.window,[invoke,delay]);
   if(state.id){target.timers.set(state.id,state);if(repeat)target.intervals++}return state.id;
  },
  clear(receiver,count,value){const target=owner(receiver);if(!count)throw new record.TypeError('invalid argument');cancel(target,handleNumber(value,record))},
  stop(receiver){
   const target=owner(receiver),cohort=[],visit=current=>{if(current.disposed)return;cohort.push(current);for(const child of current.children)visit(child)};visit(target);
   // Capture every custom load cohort before any abort handler can start a new
   // request. The original per-document resource manager retains its real
   // script/error/parser queue; stop does not dispose or cancel page timers.
   const loads=cohort.map(current=>({current,fetches:current.fetchStops?.()??[],xhrs:current.xhrStops?.()??[]}));
   for(const{current}of loads)apply(current.source.stop,current.window,[]);
   for(const{fetches,xhrs}of loads){for(const cancel of fetches)cancel();for(const cancel of xhrs)cancel()}
  },
 });
 const methods=vm.compileFunction('return ('+publicMethods.toString()+')(bridge)',['bridge'],{parsingContext:context})(bridge);
 for(const[name,value]of Object.entries(methods))Object.defineProperty(window,name,{value,writable:true,enumerable:true,configurable:true});
 const cancelTimers=()=>{for(const id of [...record.timers.keys()])cancel(record,id);record.timers.clear();record.intervals=0};
 const retire=()=>{cancelTimers();record.retireXHR?.();record.parent?.children.delete(record);record.parent=undefined};onFrameRetirement(window,retire);
 const dispose=()=>{if(record.disposed)return;retire();record.disposed=true;record.invocation.dispose();record.children.clear();if(pages.get(page)===record)pages.delete(page);record.signal.removeEventListener('abort',dispose)};
 record.signal.addEventListener('abort',dispose,{once:true});
}
