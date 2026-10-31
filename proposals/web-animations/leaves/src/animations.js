// Independent, Native-calibrated Web Animations state/tasks. The target does
// not evaluate keyframes or expose effect/timeline constructors; no pixels,
// interpolated styles, or advertised media timing are fabricated here.
import {createRequire} from 'node:module';
import {platformFactoryRecord,registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
import {onFrameRetirement} from './frame-activity.js';
const require=createRequire(import.meta.url);
const EventTarget=require('jsdom/lib/jsdom/living/generated/EventTarget.js');
const Event=require('jsdom/lib/jsdom/living/generated/Event.js');
const Element=require('jsdom/lib/jsdom/living/generated/Element.js');
const installed=new WeakMap(),animations=new WeakMap(),playbackEvents=new WeakMap();
const hidden=value=>Object.assign(Object.create(null),value),apply=Reflect.apply,setPrototype=Object.setPrototypeOf;

function factory(g,bridge){
 const TypeError=g.TypeError,Exception=g.DOMException,Array=g.Array,Object=g.Object,define=Object.defineProperty,prototype=Object.getPrototypeOf,apply=g.Reflect.apply;
 const String=g.String,symbolDescription=Object.getOwnPropertyDescriptor(g.Symbol.prototype,'description').get;
 const text=value=>typeof value==='symbol'?apply(symbolDescription,value,[])??'':String(value);
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 const illegal=()=>{throw new TypeError('Illegal invocation')};
 const check=value=>{if(!bridge.hasAnimation(value))illegal()};
 const read=(value,key)=>{check(value);return bridge.read(value,key)};
 function Animation(){throw new TypeError('Illegal Constructor')}
 const animationPrototype={
  play(){check(this);bridge.action(this,'play')},
  pause(){check(this);bridge.action(this,'pause')},
  cancel(){check(this);bridge.action(this,'cancel',new Exception('The operation was aborted','AbortError'))},
  finish(){check(this);bridge.action(this,'finish')},
  reverse(){check(this)},
  get playState(){return read(this,'playState')},
  pending:false,
  get finished(){check(this);return bridge.promise(this,'finished')},
  get ready(){check(this);return bridge.promise(this,'ready')},
  get effect(){return read(this,'effect')},
  set effect(value){check(this);if(value!=null&&!object(value))throw new TypeError('invalid argument');bridge.set(this,'effect',value??null)},
  get timeline(){return read(this,'timeline')},
  set timeline(value){check(this);if(value!=null&&!object(value))throw new TypeError('invalid argument');bridge.set(this,'timeline',value??null)},
  get startTime(){return read(this,'startTime')},
  set startTime(value){check(this);bridge.set(this,'startTime',value==null?null:+value)},
  get onfinish(){return read(this,'onfinish')},
  set onfinish(value){check(this);bridge.handler(this,'finish',typeof value==='function'?value:null)},
  get oncancel(){return read(this,'oncancel')},
  set oncancel(value){check(this);bridge.handler(this,'cancel',typeof value==='function'?value:null)},
 };
 Object.setPrototypeOf(animationPrototype,g.EventTarget.prototype);Object.setPrototypeOf(Animation,g.EventTarget);
 define(Animation,'prototype',{value:animationPrototype,writable:false});
 define(animationPrototype,'pending',{value:false,writable:false,enumerable:true,configurable:false});
 define(animationPrototype,'constructor',{value:Animation,writable:true,configurable:true});define(animationPrototype,g.Symbol.toStringTag,{value:'Animation',configurable:true});
 function AnimationPlaybackEvent(type){
  if(new.target===undefined||arguments.length===0)throw new TypeError('invalid argument');
  const name=text(type),input=arguments[1];if(input!=null&&!object(input))throw new TypeError('invalid argument');
  const bubbles=input!=null&&'bubbles'in input?!!input.bubbles:false,cancelable=input!=null&&'cancelable'in input?!!input.cancelable:false,composed=input!=null&&'composed'in input?!!input.composed:false;
  let currentTime=null,timelineTime=null;
  if(input!=null&&'currentTime'in input){const value=input.currentTime;currentTime=value==null?null:+value}
  if(input!=null&&'timelineTime'in input){const value=input.timelineTime;timelineTime=value==null?null:+value}
  return bridge.event(name,bubbles,cancelable,composed,currentTime,timelineTime,prototype(this));
 }
 const playbackPrototype={
  get currentTime(){if(!bridge.hasEvent(this))illegal();return bridge.eventTime(this,'currentTime')},
  get timelineTime(){if(!bridge.hasEvent(this))illegal();return bridge.eventTime(this,'timelineTime')},
 };
 Object.setPrototypeOf(playbackPrototype,g.Event.prototype);Object.setPrototypeOf(AnimationPlaybackEvent,g.Event);
 define(AnimationPlaybackEvent,'prototype',{value:playbackPrototype,writable:false});
 define(playbackPrototype,'constructor',{value:AnimationPlaybackEvent,writable:true,configurable:true});define(playbackPrototype,g.Symbol.toStringTag,{value:'AnimationPlaybackEvent',configurable:true});
 bridge.prototypes(animationPrototype,playbackPrototype);
 define(g,'Animation',{value:Animation,writable:true,configurable:true});define(g,'AnimationPlaybackEvent',{value:AnimationPlaybackEvent,writable:true,configurable:true});
 function animate(){if(!bridge.isElement(this))illegal();return bridge.animate()}
 function getAnimations(){if(!bridge.isElement(this))illegal();return new Array()}
 define(g.Element.prototype,'animate',{value:animate,writable:true,configurable:true,enumerable:true});define(g.Element.prototype,'getAnimations',{value:getAnimations,writable:true,configurable:true,enumerable:true});
}

export function installAnimations(page,realm){
 if(installed.has(realm))return;
 registerPlatformFactoryKind('Animation');registerPlatformFactoryKind('AnimationPlaybackEvent');
 const Promise=realm.Promise,preventDefault=realm.Event.prototype.preventDefault,add=realm.EventTarget.prototype.addEventListener,remove=realm.EventTarget.prototype.removeEventListener;
 const setTimer=realm.setTimeout,clearTimer=realm.clearTimeout;
 const runtime=hidden({realm,Promise,animationPrototype:null,playbackPrototype:null,disposed:false,automatic:new Set(),events:new Set()});
 const task=(callback,automatic=false)=>{
  if(runtime.disposed)return;
  const tasks=automatic?runtime.automatic:runtime.events;let id;
  id=apply(setTimer,realm,[()=>{tasks.delete(id);if(!runtime.disposed)callback()},automatic?10:0]);tasks.add(id);
 };
 function event(type,bubbles,cancelable,composed,currentTime,timelineTime,prototype,trusted=false){
  const value=Event.create(realm,[type,{bubbles,cancelable,composed}],{isTrusted:trusted});setPrototype(value,prototype);
  const implementation=platformFactoryRecord(value)?.implementation;
  const state=hidden({currentTime,timelineTime});playbackEvents.set(value,state);registerPlatformFactory(value,{kind:'AnimationPlaybackEvent',implementation:state,globalObject:realm});
  return{value,implementation};
 }
 runtime.emit=(state,type)=>task(()=>{const e=event(type,false,false,false,null,null,runtime.playbackPrototype,true);state.target._dispatch(e.implementation)});
 runtime.automaticTask=callback=>task(callback,true);
 const finish=state=>{if(state.playState==='finished')return;state.playState='finished';state.finishedResolve?.(state.value);state.runtime.emit(state,'finish')};
 const play=state=>{if(state.playState==='running')return;state.playState='running';state.runtime.automaticTask(()=>{if(state.playState==='running')finish(state)})};
 const makePromise=(state,key)=>{
  // First getter's actual VM owns this genuine Promise; state stays Host-only.
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
  if(key==='ready'){state.ready=promise;resolve(state.value)}
  else{state.finished=promise;state.finishedResolve=resolve;state.finishedReject=reject;if(state.playState==='finished')resolve(state.value)}
  return promise;
 };
 const bridge=hidden({
  hasAnimation:value=>animations.has(value),hasEvent:value=>playbackEvents.has(value),
  isElement:value=>Boolean(platformFactoryRecord(value)&&Element.is(value)),
  prototypes(animation,playback){runtime.animationPrototype=animation;runtime.playbackPrototype=playback},
  read(value,key){const state=animations.get(value);return key==='playState'||key==='startTime'||key==='effect'||key==='timeline'||key==='onfinish'||key==='oncancel'?state[key]:undefined},
  set(value,key,data){if(key==='startTime'||key==='effect'||key==='timeline')animations.get(value)[key]=data},
  promise(value,key){const state=animations.get(value);return key==='ready'||key==='finished'?state[key]??makePromise(state,key):undefined},
  animate(){
   const value=EventTarget.create(realm,[],{}),target=platformFactoryRecord(value)?.implementation;setPrototype(value,runtime.animationPrototype);
   const state=hidden({value,target,runtime,playState:'idle',startTime:null,effect:null,timeline:null,ready:null,finished:null,finishedResolve:null,finishedReject:null,onfinish:null,oncancel:null,finishListener:null,cancelListener:null});
   animations.set(value,state);registerPlatformFactory(value,{kind:'Animation',implementation:state,globalObject:realm});play(state);return value;
  },
  action(value,kind,error){
   const state=animations.get(value);
   if(kind==='play')play(state);else if(kind==='pause')state.playState='paused';else if(kind==='finish')finish(state);else if(kind==='cancel'&&state.playState!=='idle'){
    state.playState='idle';
    if(state.finished){page.browser.runtimeBinding.markPromiseHandled(state.finished);state.finishedReject(error)}
    state.finished=null;state.finishedResolve=null;state.finishedReject=null;state.runtime.emit(state,'cancel');
   }
  },
  handler(value,type,callback){
   const state=animations.get(value),field=type==='finish'?'onfinish':'oncancel',listener=type==='finish'?'finishListener':'cancelListener';
   if(!callback&&state[listener]){apply(remove,value,[type,state[listener]]);state[listener]=null}state[field]=callback;
   if(callback&&!state[listener]){state[listener]=e=>{const result=apply(state[field],value,[e]);if(result===false)apply(preventDefault,e,[])};apply(add,value,[type,state[listener]])}
  },
  event:(...args)=>event(...args).value,
  eventTime(value,key){return key==='currentTime'||key==='timelineTime'?playbackEvents.get(value)[key]:undefined},
 });
 realm.eval(`(${factory.toString()})`)(realm,bridge);
 const clear=tasks=>{for(const id of tasks)apply(clearTimer,realm,[id]);tasks.clear()};
 onFrameRetirement(realm,()=>{clear(runtime.automatic);clear(runtime.events)});
 page.documentAbort?.signal.addEventListener('abort',()=>{runtime.disposed=true;clear(runtime.automatic);clear(runtime.events)},{once:true});
 installed.set(realm,runtime);
}
