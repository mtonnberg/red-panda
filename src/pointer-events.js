// Independent PointerEvent values over the canonical private Mouse/Event
// implementation. Public definitions are actual selected-VM allocations.
// Actual Native controls establish the value schema and current-type virtual
// coordinate state. Latest causal corrections still await candidate validation.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {eventImplementation,implementationForWrapper,preparePrivateEvent,bindEventImplementation} from './dom-event-state.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind,installPlatformFactoryHooks} from './platform-factory-hooks.js';
import {createDOMWrapperShell} from './dom-wrapper-realms.js';
import {eventTargetImplementation} from './dom-event-target-state.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),MouseIDL=require('jsdom/lib/jsdom/living/generated/MouseEvent.js');
const TargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation,ordinaryHasInstance=Function.prototype[Symbol.hasInstance];
const realms=new WeakMap(),pointers=new WeakMap(),define=Object.defineProperty,apply=Reflect.apply,floor=Math.floor;
const roundTypes=new Set(['click','auxclick','contextmenu']),coordinates=['screenX','screenY','clientX','clientY'];
const pointerDefaults=Object.freeze({pointerId:0,width:1,height:1,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:'',isPrimary:false,altitudeAngle:Math.PI/2,azimuthAngle:0});
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function'),member=(value,key)=>value!=null&&key in value?value[key]:undefined;
registerPlatformFactoryKind('PointerEvent');
function text(record,value){return apply(record.String,undefined,[typeof value==='symbol'?apply(record.symbolDescription,value,[]):value])}
function numericPrimitive(record,value){
 if(!object(value))return value;
 const exotic=value[Symbol.toPrimitive];if(exotic!=null){if(typeof exotic!=='function')throw new record.TypeError('Cannot convert object to primitive value');const result=apply(exotic,value,['number']);if(!object(result))return result;throw new record.TypeError('Cannot convert object to primitive value')}
 for(const key of ['valueOf','toString']){const method=value[key];if(typeof method==='function'){const result=apply(method,value,[]);if(!object(result))return result}}throw new record.TypeError('Cannot convert object to primitive value');
}
function number(record,value){const primitive=numericPrimitive(record,value);if(typeof primitive==='bigint')throw new record.TypeError('Cannot convert a BigInt value to a number');return apply(record.Number,undefined,[primitive])}
function integer(record,value,bits=32,unsigned=false){const result=number(record,value);return bits===16?(unsigned?(result>>>0)&65535:(result<<16)>>16):result|0}
function dictionary(record,options){if(options==null)return null;if(!object(options))throw new record.TypeError('invalid argument');return options}
function targetBacking(record,value){const implementation=eventTargetImplementation(value)??realms.get(value)?.windowImplementation;if(!implementation||!apply(ordinaryHasInstance,TargetImpl,[implementation]))throw new record.TypeError('invalid argument');return implementation}
function viewBacking(record,value){const known=realms.get(value),implementation=known&&(known.windowImplementation??platformFactoryRecord(value)?.implementation);if(!implementation)throw new record.TypeError('invalid argument');return implementation}
function inheritedInit(record,options){
 const init=Object.create(null);
 for(const key of ['bubbles','cancelable','composed'])init[key]=!!member(options,key);
 const detail=member(options,'detail');init.detail=detail===undefined?0:integer(record,detail);
 const view=member(options,'view');init.view=view==null?null:viewBacking(record,view);init.which=0;
 for(const key of ['altKey','button','buttons','clientX','clientY','ctrlKey','metaKey','relatedTarget','screenX','screenY','shiftKey']){
  const value=member(options,key);
  if(key.endsWith('Key'))init[key]=!!value;
  else if(key==='relatedTarget')init[key]=value==null?null:targetBacking(record,value);
  else if(key==='button'||key==='buttons')init[key]=value===undefined?0:integer(record,value,16,key==='buttons');
  else init[key]=value===undefined?0:number(record,value);
 }
 return init;
}
function pointerInit(record,options){
 const values=Object.create(null);
 // Native reads inherited dictionary keys first, then owned keys in this
 // lexical order. Angles/tilt remain independent measured scalar fields.
 for(const key of Object.keys(pointerDefaults).sort()){
  const value=member(options,key),fallback=pointerDefaults[key];
  if(value===undefined){values[key]=fallback;continue}
  if(key==='pointerType'){const type=text(record,value);values[key]=['mouse','pen','touch'].includes(type)?type:'';}
  else if(key==='isPrimary')values[key]=!!value;
  else if(['pointerId','tiltX','tiltY','twist'].includes(key))values[key]=integer(record,value);
  else values[key]=number(record,value);
 }
 return values;
}
function installCoordinateState(implementation,slot){
 for(const key of coordinates){
  slot.raw[key]=implementation[key];
  // Actual backend accessors model its virtual coordinate state. The public
  // inherited Mouse getters still read this exact original implementation.
  define(implementation,key,{get(){const state=pointers.get(this);return roundTypes.has(this.type)?floor(state.raw[key]):state.raw[key]},set(value){pointers.get(this).raw[key]=value},enumerable:true,configurable:false});
 }
}
function construct(record,receiver,type,options){
 type=text(record,type);options=dictionary(record,options);
 const init=inheritedInit(record,options),view=init.view,values=pointerInit(record,options);
 // Window provenance was captured before setup. Avoid asking a legacy UI
 // helper to rediscover it through authored Window frontend properties.
 init.view=null;
 // Canonical setup initializes V8's original receiver exactly once. It creates
 // the genuine MouseEventImpl/EventImpl graph and private Event provenance.
 MouseIDL.setup(receiver,record.globalObject,[type,init]);
 const implementation=eventImplementation(receiver);implementation.view=view;const slot=Object.assign(Object.create(null),{values,raw:Object.create(null),offset:Object.assign(Object.create(null),{x:0,y:0})});
 pointers.set(implementation,slot);installCoordinateState(implementation,slot);
 // Native keeps zero offset state for these actual constructed and
 // application-dispatched values; no target geometry is invented here.
 for(const axis of ['X','Y'])define(implementation,'offset'+axis,{get(){return pointers.get(this).offset[axis.toLowerCase()]},enumerable:true,configurable:false});
 registerPlatformFactory(receiver,{kind:'PointerEvent',implementation,globalObject:record.globalObject});record.onConstruct?.(receiver,implementation);return receiver;
}
function publicDefinitions(bridge,MouseEvent,TypeError){
 'use strict';const define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor;
 function PointerEvent(type){if(!new.target||arguments.length<1)throw new TypeError('invalid argument');return bridge.construct(this,type,arguments[1])}
 const prototype={};Object.setPrototypeOf(PointerEvent,MouseEvent);Object.setPrototypeOf(prototype,MouseEvent.prototype);
 for(const key of ['pointerId','pointerType','width','height','pressure','tangentialPressure','tiltX','tiltY','twist','altitudeAngle','azimuthAngle','isPrimary'])define(prototype,key,{get:descriptor({get [key](){return bridge.read(this,key)}},key).get,enumerable:true,configurable:true});
 define(prototype,'constructor',{value:PointerEvent,writable:true,configurable:true});define(prototype,Symbol.toStringTag,{value:'PointerEvent',configurable:true});define(PointerEvent,'prototype',{value:prototype,writable:false});return PointerEvent;
}
export function pointerEventInterface(implementation){return pointers.has(implementation)?'PointerEvent':undefined}
export function wrapPointerEvent(globalObject,implementation){
 const record=realms.get(globalObject);if(!record||!pointers.has(implementation))return undefined;
 const value=createDOMWrapperShell(record.context,record.Constructor.prototype,'PointerEvent');preparePrivateEvent(value,globalObject);bindEventImplementation(value,implementation);registerPlatformFactory(value,{kind:'PointerEvent',implementation,globalObject});return value;
}
export function installPointerEvents(globalObject,{context,onConstruct,windowImplementation}={}){
 installPlatformFactoryHooks();let record=realms.get(globalObject);if(record&&context===undefined)return record.Constructor;
 context??=vm.isContext(globalObject)?globalObject:implementationForWrapper(globalObject)?._globalObject;
 if(!context)throw new TypeError('A genuine PointerEvent originating realm is required');
 record=realms.get(context);if(record)return record.Constructor;
 record=Object.assign(Object.create(null),{globalObject,context,windowImplementation:windowImplementation??implementationForWrapper(globalObject),TypeError:globalObject.TypeError,Number:globalObject.Number,String:globalObject.String,symbolDescription:Object.getOwnPropertyDescriptor(globalObject.Symbol.prototype,'description').get,onConstruct});
 const state=value=>{const implementation=eventImplementation(value),slot=implementation&&pointers.get(implementation);if(!slot)throw new record.TypeError('Illegal invocation');return slot};
 const bridge=Object.assign(Object.create(null),{construct:(receiver,type,options)=>construct(record,receiver,type,options),read:(value,key)=>state(value).values[key]});
 record.Constructor=vm.compileFunction('return ('+publicDefinitions.toString()+')(bridge,MouseEvent,TypeError)',['bridge','MouseEvent','TypeError'],vm.isContext(context)?{parsingContext:context}:{})(bridge,globalObject.MouseEvent,record.TypeError);
 realms.set(globalObject,record);realms.set(context,record);if(vm.isContext(context))realms.set(vm.runInContext('globalThis',context),record);define(globalObject,'PointerEvent',{value:record.Constructor,writable:true,configurable:true});utils.initCtorRegistry(globalObject).PointerEvent=record.Constructor;return record.Constructor;
}
export function createPointerEvent(globalObject,type,init){const Constructor=installPointerEvents(globalObject);return Reflect.construct(Constructor,[type,init])}
