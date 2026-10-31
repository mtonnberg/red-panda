// Real selected-VM Abort frontends with strong private wrapper brands and real
// private Node cancellation state. Public methods never inspect authored slots.
import{registerPlatformFactory}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
const NativeController=globalThis.AbortController,NativeSignal=globalThis.AbortSignal,apply=Reflect.apply;
const nativeAny=NativeSignal.any;
const abort=NativeController.prototype.abort,signalGetter=Object.getOwnPropertyDescriptor(NativeController.prototype,'signal').get;
const aborted=Object.getOwnPropertyDescriptor(NativeSignal.prototype,'aborted').get,reason=Object.getOwnPropertyDescriptor(NativeSignal.prototype,'reason').get;
const installed=new WeakMap(),controllers=new WeakMap(),signals=new WeakMap();
const slot=fields=>Object.assign(Object.create(null),fields);
function factory(g,b){
 const create=g.Object.create,finite=g.Number.isFinite,trunc=g.Math.trunc,TypeError=g.TypeError,Exception=g.DOMException,Target=g.EventTarget,define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,Array=g.Array,iterator=g.Symbol.iterator;
 const invalid=()=>new TypeError('invalid argument'),illegal=()=>new TypeError('Illegal invocation'),defaultReason=()=>new Exception('signal is aborted without reason','AbortError');
 function AbortController(){if(!new.target)throw invalid();b.controller(this)}
 const cp=AbortController.prototype;delete cp.constructor;define(AbortController,'prototype',{writable:false});
 define(cp,'signal',{get(){if(!b.hasController(this))throw illegal();return b.signal(this)},enumerable:true,configurable:true});
 const cm={abort(){if(!b.hasController(this))throw illegal();b.abort(this,arguments[0]===undefined?defaultReason():arguments[0])}};define(cp,'abort',{value:cm.abort,writable:true,enumerable:true,configurable:true});
 class AbortSignal extends Target{
  constructor(){throw new TypeError('Illegal Constructor')}
  get aborted(){if(!b.hasSignal(this))throw illegal();return b.aborted(this)}
  get reason(){if(!b.hasSignal(this))throw illegal();return b.reason(this)}
  get onabort(){if(!b.hasSignal(this))throw illegal();return b.handler(this)}
  set onabort(value){if(!b.hasSignal(this))throw illegal();b.handlerSet(this,typeof value==='function'?value:null)}
  throwIfAborted(){if(!b.hasSignal(this))throw illegal();if(b.aborted(this))throw b.reason(this)}
  static abort(){return b.staticAbort(arguments[0]===undefined?defaultReason():arguments[0])}
  static timeout(milliseconds){if(!arguments.length)throw invalid();const n=+milliseconds;if(!finite(n)||n<0||n>9007199254740991)throw new TypeError('');return b.timeout(trunc(n))}
  static any(values){if(!arguments.length||values===null||(typeof values!=='object'&&typeof values!=='function')||typeof values[iterator]!=='function')throw invalid();const list=[];for(const value of values){if(!b.hasSignal(value))throw invalid();define(list,list.length,{value,writable:true,enumerable:true,configurable:true})}return b.any(list)}
 }
 for(const C of[AbortController,AbortSignal]){const p=C.prototype;for(const key of g.Reflect.ownKeys(p)){if(key==='constructor')continue;const d=own(p,key);if(d.get)define(d.get,'name',{value:'get '+String(key),configurable:true});if(d.set)define(d.set,'name',{value:'set '+String(key),configurable:true});define(p,key,{...d,enumerable:true})}delete p.constructor;define(p,'constructor',{value:C,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:C.name,configurable:true});define(g,C.name,{value:C,writable:true,configurable:true})}
 return{AbortController,AbortSignal,allocate(prototype){return create(prototype)}};
}
export function installWorkerAbort(realm,{events,evaluate=source=>realm.eval(source),signal:lifetime,active=()=>!lifetime?.aborted}={}){
 if(installed.has(realm))return installed.get(realm);if(!events)throw new TypeError('Actual Worker event backend is required');
 for(const kind of['AbortController','AbortSignal'])registerPlatformFactoryKind(kind);
 const TimeoutException=realm.DOMException,timer=realm.setTimeout,clear=realm.clearTimeout,timers=new Set(),ErrorCtor=realm.TypeError;let classes,disposed=false;
 function makeSignal(native){const value=classes.allocate(classes.AbortSignal.prototype),state=Object.freeze(slot({native}));signals.set(value,state);events.registerTarget(value,native,'AbortSignal');registerPlatformFactory(value,{kind:'AbortSignal',implementation:state,globalObject:realm});return value}
 function node(value){const state=signals.get(value);if(!state)throw new ErrorCtor('Illegal invocation');return state.native}
 const bridge={
  hasController:v=>controllers.has(v),hasSignal:v=>signals.has(v),
  controller(value){const native=new NativeController(),state=slot({native,signal:makeSignal(apply(signalGetter,native,[]))});controllers.set(value,state);registerPlatformFactory(value,{kind:'AbortController',implementation:state,globalObject:realm})},
  signal:value=>controllers.get(value).signal,aborted:value=>apply(aborted,node(value),[]),reason:value=>apply(reason,node(value),[]),abort:(value,why)=>apply(abort,controllers.get(value).native,[why]),
  handler:v=>events.getHandler(v,'abort'),handlerSet:(v,fn)=>events.setHandler(v,'abort',fn),
  staticAbort(why){const native=new NativeController();apply(abort,native,[why]);return makeSignal(apply(signalGetter,native,[]))},
  timeout(milliseconds){const native=new NativeController(),value=makeSignal(apply(signalGetter,native,[]));let remaining=milliseconds;const schedule=()=>{if(disposed||!active())return;const chunk=Math.min(remaining,2147483647);let handle;handle=apply(timer,realm,[()=>{timers.delete(handle);remaining-=chunk;if(remaining>0)schedule();else apply(abort,native,[new TimeoutException('signal timed out','TimeoutError')])},chunk]);timers.add(handle)};schedule();return value},
  any(list){const sources=[];for(let i=0;i<list.length;i++)sources.push(node(list[i]));return makeSignal(apply(nativeAny,NativeSignal,[sources]))},
 };
 classes=Object.freeze(Object.assign(Object.create(null),evaluate(`(${factory.toString()})`)(realm,bridge)));events.configureSignals(value=>signals.get(value)?.native??null);
 const dispose=()=>{if(disposed)return;disposed=true;for(const t of timers)apply(clear,realm,[t]);timers.clear();lifetime?.removeEventListener('abort',dispose)};lifetime?.addEventListener('abort',dispose,{once:true});
 const api={nativeSignal:node,hasSignal:v=>signals.has(v),dispose};installed.set(realm,api);return api;
}
