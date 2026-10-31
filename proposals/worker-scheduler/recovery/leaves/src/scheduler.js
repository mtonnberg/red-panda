import {addAbortListener} from 'node:events';
// Independent timer-backed task execution calibrated against the pinned Native.
// Priority metadata/events are real; that target currently runs priority hints
// FIFO. Callback returns/errors settle actual receiving-realm Promises.
import {createRequire} from 'node:module';
import {createInvocationTrampoline} from './invocation.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
import {onFrameRetirement} from './frame-activity.js';
const require=createRequire(import.meta.url),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const installed=new WeakMap(),controllers=new WeakMap(),signals=new WeakMap(),events=new WeakMap(),schedulers=new WeakMap();
const apply=Reflect.apply,microtask=queueMicrotask;
const nodeAborted=Object.getOwnPropertyDescriptor(globalThis.AbortSignal.prototype,'aborted').get,nodeReason=Object.getOwnPropertyDescriptor(globalThis.AbortSignal.prototype,'reason').get,disposeSymbol=Symbol.dispose;
const slot=fields=>Object.assign(Object.create(null),fields);
function signalSource(value){const state=signals.get(value);if(state)return state.source;const p=platformFactoryRecord(value);return p?.kind==='AbortSignal'&&p.implementation? p.implementation:null}
function factory(g,b){
 const TypeError=g.TypeError,Error=g.Error,BaseController=g.AbortController,BaseSignal=g.AbortSignal,BaseEvent=g.Event,Promise=g.Promise,Number=g.Number;
 const define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,setPrototype=g.Object.setPrototypeOf,apply=g.Reflect.apply;
 const controllerSignal=own(BaseController.prototype,'signal').get,symbolDescription=own(g.Symbol.prototype,'description').get,String=g.String;
 const domString=value=>typeof value==='symbol'?apply(symbolDescription,value,[])??'':String(value);
 const allowed=value=>typeof value==='string'&&(value==='user-visible'||value==='user-blocking'||value==='background');
 const invalid=()=>new TypeError('invalid argument'),illegal=()=>new TypeError('Illegal invocation');
 function dictionary(value){if(value==null)return{};if(typeof value!=='object'&&typeof value!=='function')throw invalid();return value}
 class TaskPriorityChangeEvent extends BaseEvent{
  constructor(type,init=undefined){
   if(!arguments.length)throw invalid();
   type=domString(type);
   if(init!=null&&typeof init!=='object'&&typeof init!=='function')throw invalid();
   super(type,init);
   if(init==null)throw new TypeError('');
   if(typeof init!=='object'&&typeof init!=='function')throw invalid();
   const previous=init.previousPriority;if(!allowed(previous))throw invalid();b.event(this,previous);
  }
  get previousPriority(){if(!b.hasEvent(this))throw illegal();return b.previous(this)}
 }
 class TaskSignal extends BaseSignal{
  constructor(){throw new TypeError('Illegal Constructor')}
  get priority(){if(!b.hasSignal(this))throw illegal();return b.priority(this)}
  get onprioritychange(){if(!b.hasSignal(this))throw illegal();return b.handler(this)}
  set onprioritychange(value){if(!b.hasSignal(this))throw illegal();b.handlerSet(this,typeof value==='function'?value:null)}
 }
 class TaskController extends BaseController{
  constructor(options=undefined){
   const input=dictionary(options),value=input.priority,priority=value===undefined?'user-visible':value;
   if(!allowed(priority))throw invalid();
   super();const signal=apply(controllerSignal,this,[]);setPrototype(signal,TaskSignal.prototype);b.controller(this,signal,priority);
  }
  setPriority(priority){if(!b.hasController(this))throw illegal();if(!allowed(priority))throw invalid();if(b.changing(this))throw new Error('NotSupportedError');b.change(this,priority)}
 }
 class Scheduler{
  constructor(){throw new TypeError('Illegal Constructor')}
  postTask(callback,options=undefined){
   if(!b.hasScheduler(this)||typeof callback!=='function')return Promise.reject(invalid());
   if(options!=null&&typeof options!=='object'&&typeof options!=='function')return Promise.reject(new TypeError('invalid postTask options'));
   const input=options??{},delayValue=input.delay,delay=delayValue==null?0:Number(delayValue)>>>0,priority=input.priority;
   if(priority!=null&&!allowed(priority))return Promise.reject(new TypeError('invalid postTask options'));
   const signal=input.signal;if(signal!=null&&!b.validSignal(signal))return Promise.reject(new TypeError('invalid postTask options'));
   return new Promise((resolve,reject)=>b.enqueue(callback,delay,signal??null,resolve,reject));
  }
  yield(){
   if(!b.hasScheduler(this))return Promise.reject(invalid());
   const current=b.currentSignal();if(current&&b.aborted(current))return Promise.reject(b.reason(current));
   return new Promise((resolve,reject)=>b.yieldTask(resolve,reject,current));
  }
 }
 for(const C of[Scheduler,TaskController,TaskSignal,TaskPriorityChangeEvent]){
  const p=C.prototype;for(const key of g.Reflect.ownKeys(p)){if(key==='constructor')continue;const d=own(p,key);define(p,key,{...d,enumerable:true})}
  delete p.constructor;define(p,'constructor',{value:C,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:C.name,configurable:true});define(g,C.name,{value:C,writable:true,configurable:true});
 }
 define(g,'scheduler',{get(){return b.namespace(this)},enumerable:true,configurable:true});
 return{Scheduler,TaskController,TaskSignal,TaskPriorityChangeEvent};
}
export function installScheduler(page,realm,{context,mainWindow=realm,workerAbort,workerEvents,evaluate=source=>realm.eval(source)}={}){
 if(installed.has(realm))return installed.get(realm);
 const worker=!!workerAbort&&!!workerEvents;
 if(!realm.AbortSignal||!realm.Event||(!realm.document&&!worker))throw new TypeError('Scheduler requires a genuine document or Worker AbortSignal/EventTarget realm');
 for(const kind of['Scheduler','TaskController','TaskSignal','TaskPriorityChangeEvent'])registerPlatformFactoryKind(kind);
 const state=slot({current:null,tasks:new Set(),ready:[],front:[],pump:undefined,disposed:false});
 const timer=realm.setTimeout,clear=realm.clearTimeout,create=realm.Object.create,ObjectCtor=realm.Object,ErrorCtor=realm.TypeError;
 const aliases=new Set([realm,realm._globalObject,realm._globalProxy].filter(v=>v!==null&&(typeof v==='object'||typeof v==='function')));
 const add=realm.EventTarget.prototype.addEventListener,remove=realm.EventTarget.prototype.removeEventListener;
 const invocation=createInvocationTrampoline(context??implForWrapper(realm.document)._globalObject);
 const workerSources=new WeakMap();
 function sourceFor(value){
  if(!worker)return signalSource(value);
  const task=signals.get(value);if(task)return task.source;
  if(!workerAbort.hasSignal(value))return null;
  let source=workerSources.get(value);if(source)return source;
  const native=workerAbort.nativeSignal(value),algorithms=new Map();
  source=slot({});
  Object.defineProperties(source,{aborted:{get:()=>apply(nodeAborted,native,[])},reason:{get:()=>apply(nodeReason,native,[])}});
  source._addAlgorithm=callback=>{if(!algorithms.has(callback))algorithms.set(callback,addAbortListener(native,callback))};
  source._removeAlgorithm=callback=>{const subscription=algorithms.get(callback);if(subscription){subscription[disposeSymbol]();algorithms.delete(callback)}};
  workerSources.set(value,source);return source;
 }
 let classes,instance,capturingNamespace=false;
 const record=(value,kind,implementation)=>registerPlatformFactory(value,{kind,implementation,globalObject:realm});
 function cleanTask(task){task.active=false;if(task.timer!==undefined)apply(clear,realm,[task.timer]);task.timer=undefined;if(task.source&&task.abort)task.source._removeAlgorithm(task.abort);task.abort=null;state.tasks.delete(task)}
 function cancelPending(){if(state.pump!==undefined)apply(clear,realm,[state.pump]);state.pump=undefined;for(const task of state.tasks)cleanTask(task);state.tasks.clear();state.ready.length=state.front.length=0}
 const unretire=!worker&&realm===mainWindow?onFrameRetirement(mainWindow,cancelPending):()=>{};
 const dispose=()=>{if(state.disposed)return;state.disposed=true;cancelPending();unretire();page?.documentAbort?.signal.removeEventListener('abort',dispose)};
 page?.documentAbort?.signal.addEventListener('abort',dispose,{once:true});
 function pump(){
  state.pump=undefined;if(state.disposed)return;
  let task;while(!task||!task.active){task=state.front.shift()??state.ready.shift();if(!task)return}
  cleanTask(task);
  if(task.source?.aborted)task.reject(task.source.reason);
  else if(task.yielded)task.resolve();
  else{state.current=task.signal;let value,error,threw=false;try{value=invocation.invoke(task.callback,realm,[],{timeout:Math.min(page?.timeout??2000,2000),displayErrors:false})}catch(cause){error=cause;threw=true}
   if(task.source?.aborted)task.reject(task.source.reason);else if(threw)task.reject(error);else task.resolve(value);
  }
  requestPump();
 }
 function requestPump(){if(!state.disposed&&state.pump===undefined&&(state.front.length||state.ready.length))state.pump=apply(timer,realm,[pump,0])}
 function schedule(callback,delay,signal,resolve,reject,yielded=false){
  if(state.disposed)return;
  const source=signal?sourceFor(signal):null;if(source?.aborted){reject(source.reason);return}
  const task=slot({callback,source,signal,resolve,reject,yielded,remaining:delay,timer:undefined,abort:null,active:true});state.tasks.add(task);
  task.abort=()=>{cleanTask(task);reject(source.reason)};if(source)source._addAlgorithm(task.abort);
  const ready=()=>{(yielded?state.front:state.ready).push(task);requestPump()};
  if(!delay){ready();return}
  const fire=()=>{task.timer=undefined;task.remaining-=Math.min(task.remaining,2147483647);if(task.remaining>0)task.timer=apply(timer,realm,[fire,Math.min(task.remaining,2147483647)]);else ready()};
  task.timer=apply(timer,realm,[fire,Math.min(delay,2147483647)]);
 }
 const b={
  hasController:v=>controllers.has(v),hasSignal:v=>signals.has(v),priority:v=>signals.get(v).priority,changing:v=>signals.get(controllers.get(v)).changing,
  hasEvent:v=>events.has(v),previous:v=>events.get(v).previous,
  event(value,previous){const data=Object.freeze(slot({previous}));events.set(value,data);record(value,'TaskPriorityChangeEvent',data)},
  controller(value,signal,priority){const source=sourceFor(signal);if(!source)throw new ErrorCtor('A genuine AbortSignal is required');const data=slot({source,priority,changing:false,handler:null,relay:null});signals.set(signal,data);controllers.set(value,signal);record(signal,'TaskSignal',source);record(value,'TaskController',platformFactoryRecord(value)?.implementation)},
  change(value,priority){const signal=controllers.get(value),data=signals.get(signal);if(data.priority===priority)return;const previous=data.priority;data.priority=priority;data.changing=true;microtask(()=>{data.changing=false});try{const event=new classes.TaskPriorityChangeEvent('prioritychange',{previousPriority:previous}),eventImpl=worker?null:implForWrapper(event);if(worker){workerEvents.trust(event);workerEvents.dispatch(signal,event)}else{eventImpl.isTrusted=true;data.source._dispatch(eventImpl)}}finally{data.changing=false}},
  handler:v=>signals.get(v).handler,
  handlerSet(value,callback){const data=signals.get(value);data.handler=callback;if(!callback&&data.relay){apply(remove,value,['prioritychange',data.relay]);data.relay=null}else if(callback&&!data.relay){data.relay=event=>{if(data.handler)apply(data.handler,value,[event])};apply(add,value,['prioritychange',data.relay])}},
  hasScheduler:v=>schedulers.has(v),namespace(value){if(capturingNamespace)aliases.add(value);if(!aliases.has(value))throw new ErrorCtor('Illegal invocation');return instance},
  validSignal:value=>!!sourceFor(value),aborted:value=>sourceFor(value).aborted,reason:value=>sourceFor(value).reason,currentSignal:()=>state.current,
  yieldTask:(resolve,reject,signal)=>schedule(null,0,signal,resolve,reject,true),
  enqueue:schedule,
 };
 const created=evaluate(`(${factory.toString()})`)(realm,b);classes=Object.freeze(Object.assign(Object.create(null),created));instance=apply(create,ObjectCtor,[classes.Scheduler.prototype]);schedulers.set(instance,state);record(instance,'Scheduler',state);
 capturingNamespace=true;try{evaluate('scheduler')}finally{capturingNamespace=false}
 const api={dispose};installed.set(realm,api);return api;
}
