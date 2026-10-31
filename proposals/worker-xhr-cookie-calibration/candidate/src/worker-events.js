import {addAbortListener} from 'node:events';
// Genuine selected-VM Event/EventTarget frontends over private real Node state.
// No Node prototype is grafted onto a public VM constructor or wrapper.
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const NativeEvent=globalThis.Event,NativeTarget=globalThis.EventTarget,apply=Reflect.apply;
const signalAborted=Object.getOwnPropertyDescriptor(globalThis.AbortSignal.prototype,'aborted').get,disposeSymbol=Symbol.dispose;
const props=['type','bubbles','cancelable','composed','target','currentTarget','eventPhase','defaultPrevented','timeStamp','cancelBubble','returnValue','isTrusted'];
const readers=Object.fromEntries(props.map(k=>[k,Object.getOwnPropertyDescriptor(NativeEvent.prototype,k)?.get]));
const methods=Object.fromEntries(['preventDefault','stopPropagation','stopImmediatePropagation','composedPath'].map(k=>[k,NativeEvent.prototype[k]]));
const add=NativeTarget.prototype.addEventListener,remove=NativeTarget.prototype.removeEventListener,dispatch=NativeTarget.prototype.dispatchEvent;
const installed=new WeakMap(),eventStates=new WeakMap(),targetStates=new WeakMap();
const slot=fields=>Object.assign(Object.create(null),fields);
function factory(g,b){
 const create=g.Object.create,TypeError=g.TypeError,String=g.String,define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,apply=g.Reflect.apply,Array=g.Array,freeze=g.Object.freeze;
 const description=own(g.Symbol.prototype,'description').get,text=v=>typeof v==='symbol'?apply(description,v,[])??'':String(v);
 const invalid=()=>new TypeError('invalid argument'),illegal=()=>new TypeError('Illegal invocation');
 const validEvent=v=>{if(!b.event(v))throw illegal()},validTarget=v=>{if(!b.target(v))throw illegal()};
 const dict=v=>{if(v==null)return{};if(typeof v!=='object'&&typeof v!=='function')throw invalid();return v};
 const immutableArray=list=>{const out=new Array(list.length);for(let i=0;i<list.length;i++)define(out,i,{value:list[i],writable:true,enumerable:true,configurable:true});return out};
 function Event(type,init=undefined){if(!new.target||!arguments.length)throw invalid();type=text(type);const o=dict(init),bubbles=!!o.bubbles,cancelable=!!o.cancelable,composed=!!o.composed;b.eventStore(this,type,bubbles,cancelable,composed)}
 const ep=Event.prototype;delete ep.constructor;define(Event,'prototype',{writable:false});
 for(const key of['type','bubbles','cancelable','composed','target','srcElement','currentTarget','eventPhase','defaultPrevented','timeStamp'])define(ep,key,{get(){validEvent(this);return b.eventRead(this,key)},enumerable:true,configurable:true});
 const em={preventDefault(){validEvent(this);b.eventCall(this,'preventDefault')},stopPropagation(){validEvent(this);b.eventCall(this,'stopPropagation')},stopImmediatePropagation(){validEvent(this);b.eventCall(this,'stopImmediatePropagation')},composedPath(){validEvent(this);return immutableArray(b.path(this))},initEvent(type,bubbles=false,cancelable=false){validEvent(this);if(!arguments.length)throw invalid();b.init(this,text(type),!!bubbles,!!cancelable)}};
 for(const[name,value]of Object.entries(em))define(ep,name,{value,writable:true,enumerable:true,configurable:true});
 define(ep,'returnValue',{get(){validEvent(this);return!b.eventRead(this,'defaultPrevented')},set(value){validEvent(this);if(!value)b.eventCall(this,'preventDefault')},enumerable:true,configurable:true});
 define(ep,'cancelBubble',{get(){validEvent(this);return b.eventRead(this,'cancelBubble')},set(value){validEvent(this);if(value)b.eventCall(this,'stopPropagation')},enumerable:true,configurable:true});
 for(const[name,value]of Object.entries({NONE:0,CAPTURING_PHASE:1,AT_TARGET:2,BUBBLING_PHASE:3})){define(ep,name,{value,enumerable:true});define(Event,name,{value,enumerable:true})}
 class MessageEvent extends Event{
  constructor(type,init=undefined){if(!arguments.length)throw invalid();super(type,init);const o=dict(init),data=o.data??null,lastEventId=o.lastEventId===undefined?'':text(o.lastEventId),origin=o.origin===undefined?'':text(o.origin),raw=o.ports,source=o.source??null;const ports=[];if(raw!==undefined){if(raw==null||typeof raw[g.Symbol.iterator]!=='function')throw invalid();for(const value of raw)define(ports,ports.length,{value,writable:true,enumerable:true,configurable:true})}b.message(this,data,origin,lastEventId,source,freeze(ports))}
  get data(){validEvent(this);return b.extra(this,'data')}get origin(){validEvent(this);return b.extra(this,'origin')}get lastEventId(){validEvent(this);return b.extra(this,'lastEventId')}get source(){validEvent(this);return b.extra(this,'source')}get ports(){validEvent(this);return b.extra(this,'ports')}
 }
 class ErrorEvent extends Event{
  constructor(type,init=undefined){if(!arguments.length)throw invalid();super(type,init);const o=dict(init),colno=o.colno===undefined?0:(+o.colno)>>>0,error=o.error??null,filename=o.filename===undefined?'':text(o.filename),lineno=o.lineno===undefined?0:(+o.lineno)>>>0,message=o.message===undefined?'':text(o.message);b.error(this,message,filename,lineno,colno,error)}
  get message(){validEvent(this);return b.extra(this,'message')}get filename(){validEvent(this);return b.extra(this,'filename')}get lineno(){validEvent(this);return b.extra(this,'lineno')}get colno(){validEvent(this);return b.extra(this,'colno')}get error(){validEvent(this);return b.extra(this,'error')}
 }
 function options(v){if(v==null||typeof v!=='object'&&typeof v!=='function')return{capture:!!v,once:false,passive:false,signal:null};const capture=!!v.capture,once=!!v.once,passive=!!v.passive,signal=v.signal??null;if(signal!==null&&!b.signal(signal))throw invalid();return{capture,once,passive,signal}}
 function EventTarget(){if(!new.target)throw invalid();b.targetStore(this)}
 const tp=EventTarget.prototype;delete tp.constructor;define(EventTarget,'prototype',{writable:false});
 const tm={dispatchEvent(event){validTarget(this);if(!arguments.length||!b.event(event))throw invalid();return b.dispatch(this,event)},addEventListener(type,callback){validTarget(this);if(arguments.length<2)throw invalid();type=text(type);if(callback==null)return;if(typeof callback!=='function'&&typeof callback!=='object')throw invalid();b.add(this,type,callback,options(arguments[2]))},removeEventListener(type,callback){validTarget(this);if(arguments.length<2)throw invalid();type=text(type);const o=arguments[2],capture=typeof o==='object'&&o!==null?!!o.capture:!!o;b.remove(this,type,callback,capture)}};
 for(const[name,value]of Object.entries(tm))define(tp,name,{value,writable:true,enumerable:true,configurable:true});
 for(const C of[Event,EventTarget,MessageEvent,ErrorEvent]){const p=C.prototype;for(const key of g.Reflect.ownKeys(p)){if(key==='constructor')continue;const d=own(p,key);if(d.get)define(d.get,'name',{value:'get '+String(key),configurable:true});if(d.set)define(d.set,'name',{value:'set '+String(key),configurable:true});if(d.configurable)define(p,key,{...d,enumerable:typeof key==='string'})}delete p.constructor;define(p,'constructor',{value:C,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:C.name,configurable:true});define(g,C.name,{value:C,writable:true,configurable:true})}
 return{Event,EventTarget,MessageEvent,ErrorEvent,allocate(prototype){return create(prototype)}};
}
export function installWorkerEvents(realm,{evaluate=source=>realm.eval(source),reportError=()=>{},active=()=>true}={}){
 if(installed.has(realm))return installed.get(realm);
 for(const kind of['Event','MessageEvent','ErrorEvent','EventTarget'])registerPlatformFactoryKind(kind);
 const nativeEvents=new WeakMap(),nativeTargets=new WeakMap(),live=new Set(),Exception=realm.DOMException,TypeError=realm.TypeError,ArrayType=realm.Array,define=Object.defineProperty;let signalAdapter=value=>null,classes;
 const receiver=state=>state.receiver??state.publicValue;
 function eventState(value){const state=eventStates.get(value);if(!state)throw new TypeError('Illegal invocation');return state}
 function targetState(value){const state=targetStates.get(value);if(!state)throw new TypeError('Illegal invocation');return state}
 function trustOwn(value){const accessors=evaluate('(function(bridge,value){return{get isTrusted(){return bridge(value)}}})')(v=>{const s=eventStates.get(v);return s.trusted===null?apply(readers.isTrusted,s.backend,[]):s.trusted},value);define(value,'isTrusted',{get:Object.getOwnPropertyDescriptor(accessors,'isTrusted').get,enumerable:true})}
 function registerEvent(value,backend){const data=slot({backend,trusted:null,pendingTrust:false,inDispatch:0,passive:0,allowed:null,completed:false,timeStamp:apply(readers.timeStamp,backend,[]),extra:slot({})});eventStates.set(value,data);nativeEvents.set(backend,value);trustOwn(value);registerPlatformFactory(value,{kind:'Event',implementation:data,globalObject:realm});return value}
 function adopt(backend){let value=nativeEvents.get(backend);if(!value){value=classes.allocate(classes.Event.prototype);registerEvent(value,backend)}return value}
 function removeEntry(state,entry){apply(remove,state.backend,[entry.type,entry.native,{capture:entry.capture}]);if(entry.abort)entry.abort[disposeSymbol]();state.listeners.delete(entry)}
 function addEntry(value,type,callback,options){const state=targetState(value),capture=options.capture;for(const e of state.listeners)if(e.type===type&&e.callback===callback&&e.capture===capture)return;const signal=options.signal?signalAdapter(options.signal):null;if(signal&&apply(signalAborted,signal,[]))return;
  const entry=slot({type,callback,capture,once:options.once,signal,passive:options.passive,abort:null,native:null});entry.native=backend=>{if(!active()||signal&&apply(signalAborted,signal,[]))return;const event=adopt(backend),es=eventState(event);if(!es.allowed)es.allowed=new Set(state.listeners);if(!es.allowed.has(entry))return;es.inDispatch++;if(entry.passive)es.passive++;if(entry.once)removeEntry(state,entry);try{if(typeof callback==='function')apply(callback,receiver(state),[event]);else{const fn=callback.handleEvent;if(typeof fn==='function')apply(fn,callback,[event]);else throw new TypeError('invalid argument')}}catch(error){reportError(error)}finally{if(entry.passive)es.passive--;es.inDispatch--;if(!es.inDispatch)es.completed=true}};
  state.listeners.add(entry);apply(add,state.backend,[type,entry.native,{capture,passive:options.passive,...(signal?{signal}:{})}]);if(signal)entry.abort=addAbortListener(signal,()=>removeEntry(state,entry))
 }
 function dispatchEvent(value,event){const ts=targetState(value),es=eventState(event);if(es.inDispatch)throw new Exception('The object is in an invalid state','InvalidStateError');const previous=es.backend;es.backend=new NativeEvent(apply(readers.type,previous,[]),{bubbles:apply(readers.bubbles,previous,[]),cancelable:apply(readers.cancelable,previous,[]),composed:apply(readers.composed,previous,[])});if(apply(readers.defaultPrevented,previous,[]))apply(methods.preventDefault,es.backend,[]);nativeEvents.set(es.backend,event);es.completed=false;es.trusted=es.pendingTrust?true:false;es.pendingTrust=false;es.allowed=new Set(ts.listeners);es.inDispatch++;try{return apply(dispatch,ts.backend,[es.backend])}finally{es.inDispatch--;es.allowed=null;es.completed=true}}
 const bridge={
  event:v=>eventStates.has(v),target:v=>targetStates.has(v),
  eventStore(value,type,bubbles,cancelable,composed){registerEvent(value,new NativeEvent(type,{bubbles,cancelable,composed}))},
  eventRead(value,key){const s=eventState(value);if(key==='timeStamp')return s.timeStamp;if(key==='cancelBubble'&&s.completed&&!s.inDispatch)return false;if(key==='currentTarget'&&!s.inDispatch)return null;if(key==='eventPhase'&&!s.inDispatch)return 0;if(key==='srcElement')key='target';if(key==='target'||key==='currentTarget'){const target=apply(readers[key],s.backend,[]),state=nativeTargets.get(target);return state?receiver(state):null}return apply(readers[key],s.backend,[])},
  trusted:v=>{const s=eventState(v);return s.trusted===null?apply(readers.isTrusted,s.backend,[]):s.trusted},
  eventCall(value,name){const s=eventState(value);if(name==='preventDefault'&&s.passive)return;if((name==='stopPropagation'||name==='stopImmediatePropagation')&&!s.inDispatch)s.completed=false;apply(methods[name],s.backend,[])},path(value){eventState(value);return[]},
  init(value,type,bubbles,cancelable){const s=eventState(value);if(s.inDispatch)return;s.backend=new NativeEvent(type,{bubbles,cancelable,composed:apply(readers.composed,s.backend,[])});s.trusted=false;s.pendingTrust=false;s.completed=false;nativeEvents.set(s.backend,value)},
  message(value,data,origin,lastEventId,source,ports){const s=eventState(value);s.extra=slot({data,origin,lastEventId,source,ports});registerPlatformFactory(value,{kind:'MessageEvent',implementation:s,globalObject:realm})},
  error(value,message,filename,lineno,colno,error){const s=eventState(value);s.extra=slot({message,filename,lineno,colno,error});registerPlatformFactory(value,{kind:'ErrorEvent',implementation:s,globalObject:realm})},extra(v,k){const extra=eventState(v).extra;if(!Object.hasOwn(extra,k))throw new TypeError('Illegal invocation');return extra[k]},
  targetStore(value){api.registerTarget(value,new NativeTarget())},signal:value=>!!signalAdapter(value),dispatch:dispatchEvent,add:addEntry,remove(value,type,callback,capture){const s=targetState(value);for(const entry of s.listeners)if(entry.type===type&&entry.callback===callback&&entry.capture===capture)removeEntry(s,entry)},
 };
 const api={
  registerTarget(value,backend,kind='EventTarget'){const state=slot({backend,publicValue:value,receiver:null,listeners:new Set(),handlers:new Map()});targetStates.set(value,state);nativeTargets.set(backend,state);live.add(new WeakRef(value));registerPlatformFactory(value,{kind,implementation:state,globalObject:realm});return value},
  portEvent(type,data,ports){const array=new ArrayType(ports.length);for(let i=0;i<ports.length;i++)Object.defineProperty(array,String(i),{value:ports[i],writable:true,enumerable:true,configurable:true});const event=new classes.MessageEvent(type,{data});eventState(event).extra.ports=array;return api.trust(event)},
  connectEvent(ports){const event=api.portEvent('connect','',ports);eventState(event).extra.source=ports[0];return event},
  configureSignals(callback){signalAdapter=callback},nativeTarget:value=>targetState(value).backend,
  trust(value){const s=eventState(value);s.trusted=true;s.pendingTrust=true;return value},
  setReceiver(value,receiverValue){targetState(value).receiver=receiverValue},
  getHandler(value,type){return targetState(value).handlers.get(type)?.callback??null},
  setHandler(value,type,callback){const s=targetState(value),existing=s.handlers.get(type);callback=typeof callback==='function'?callback:null;if(existing){if(callback){existing.callback=callback;return}removeEntry(s,existing.entry);s.handlers.delete(type);return}if(!callback)return;const h=slot({callback,entry:null}),relay=event=>{const result=apply(h.callback,receiver(s),[event]);if(type==='error'&&result===true)apply(methods.preventDefault,eventState(event).backend,[])};addEntry(value,type,relay,{capture:false,once:false,passive:false,signal:null});h.entry=[...s.listeners].find(e=>e.callback===relay);s.handlers.set(type,h)},
  dispatch:dispatchEvent,
  dispose(){for(const ref of live){const value=ref.deref();if(!value)continue;const s=targetStates.get(value);for(const e of s.listeners)removeEntry(s,e);s.handlers.clear()}live.clear()},
 };
 const made=evaluate(`(${factory.toString()})`)(realm,bridge);classes=Object.freeze(Object.assign(Object.create(null),made));installed.set(realm,api);return api;
}
