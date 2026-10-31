// Independent Event extensions over the canonical private Event implementation.
// Public functions and receivers are created in the actual selected VM; all
// extension state and trusted allocation/dispatch authority remain Host-private.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {eventImplementation,implementationForWrapper,bindEventImplementation,preparePrivateEvent} from './dom-event-state.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {callDOMFactory,registerDOMAllocationKind,finishDOMWrapperSetup,domWrapperGlobal} from './dom-factory-scope.js';
import {registerPlatformFactoryKind,installPlatformFactoryHooks} from './platform-factory-hooks.js';
import {createDOMWrapperShell} from './dom-wrapper-realms.js';
installPlatformFactoryHooks();
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const DOMExceptionIDL=require('jsdom/lib/jsdom/living/generated/DOMException.js');
const EventIDL=require('jsdom/lib/jsdom/living/generated/Event.js');
const CompositionIDL=require('jsdom/lib/jsdom/living/generated/CompositionEvent.js'),InputIDL=require('jsdom/lib/jsdom/living/generated/InputEvent.js');
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const MouseImpl=require('jsdom/lib/jsdom/living/events/MouseEvent-impl.js').implementation;
const KeyboardImpl=require('jsdom/lib/jsdom/living/events/KeyboardEvent-impl.js').implementation;
const UIImpl=require('jsdom/lib/jsdom/living/events/UIEvent-impl.js').implementation;
const conversions=require('webidl-conversions');
const records=new WeakMap(),extensions=new WeakMap(),errorTypes=new WeakMap();
const define=Object.defineProperty,apply=Reflect.apply,floor=Math.floor;
const member=(object,key)=>object!=null&&key in object?object[key]:undefined;
const hasObject=v=>v!==null&&(typeof v==='object'||typeof v==='function');
const kinds=['BeforeUnloadEvent','SecurityPolicyViolationEvent','PromiseRejectionEvent'];
for(const kind of kinds)registerPlatformFactoryKind(kind);
for(const kind of ['Event','CustomEvent','ErrorEvent','FocusEvent','HashChangeEvent','KeyboardEvent','MessageEvent','MouseEvent','PopStateEvent','ProgressEvent','TouchEvent','UIEvent','CompositionEvent','InputEvent','BeforeUnloadEvent'])registerDOMAllocationKind(kind);
function convert(globalObject,type,value){return conversions[type](value,{globals:errorTypes.get(globalObject)??globalObject})}
function eventInit(globalObject,obj,ret){for(const key of ['bubbles','cancelable','composed'])ret[key]=!!member(obj,key)}
function uiInit(globalObject,obj,ret){eventInit(globalObject,obj,ret);const detail=member(obj,'detail');ret.detail=detail===undefined?0:convert(globalObject,'long',detail);const view=member(obj,'view');ret.view=view==null?null:utils.tryImplForWrapper(view);ret.which=0}
function mouseInit(globalObject,obj,ret){
 uiInit(globalObject,obj,ret);
 for(const key of ['altKey','button','buttons','clientX','clientY','ctrlKey','metaKey','relatedTarget','screenX','screenY','shiftKey']){
  const value=member(obj,key);
  if(key.endsWith('Key'))ret[key]=!!value;
  else if(key==='relatedTarget')ret[key]=value==null?null:require('jsdom/lib/jsdom/living/generated/EventTarget.js').convert(globalObject,value);
  else if(key==='button'||key==='buttons')ret[key]=value===undefined?0:convert(globalObject,key==='button'?'short':'unsigned short',value);
  // Native constructors use unrestricted double, rounded toward -Infinity;
  // legacy initMouseEvent retains its independent WebIDL long conversion.
  else ret[key]=value===undefined?0:floor(convert(globalObject,'unrestricted double',value));
 }
}
function keyboardInit(globalObject,obj,ret){
 uiInit(globalObject,obj,ret);
 for(const key of ['altKey','charCode','code','ctrlKey','isComposing','key','keyCode','location','metaKey','repeat','shiftKey']){
  const value=member(obj,key);
  if(['code','key'].includes(key))ret[key]=value===undefined?'':convert(globalObject,'DOMString',value);
  else if(['charCode','keyCode','location'].includes(key))ret[key]=value===undefined?0:convert(globalObject,'unsigned long',value);
  else ret[key]=!!value;
 }
}
// Canonical generated constructors keep their original dictionary validation,
// setup, wrapper identity and brands. The same conversion is also installed in
// the separately compiled utility generated-module graph.
export function configureEventDictionary(kind,module){
 if(kind==='MouseEventInit')module._convertInherit=mouseInit;
 if(kind==='KeyboardEventInit')module._convertInherit=keyboardInit;
}
for(const kind of ['MouseEventInit','KeyboardEventInit'])configureEventDictionary(kind,require('jsdom/lib/jsdom/living/generated/'+kind+'.js'));
function modifierState(key){
 switch(key){case'Control':return !!this.ctrlKey;case'Alt':case'AltGraph':return !!this.altKey;case'Shift':return !!this.shiftKey;case'Meta':return !!this.metaKey;case'Accel':return !!(this.ctrlKey||this.metaKey);default:return false}
}
MouseImpl.prototype.getModifierState=modifierState;KeyboardImpl.prototype.getModifierState=modifierState;
const originalCreateEvent=DocumentImpl.prototype.createEvent;
DocumentImpl.prototype.createEvent=function(type){
 const lower=type.toLowerCase(),globalObject=this._globalObject;
 if(lower==='compositionevent'||lower==='inputevent'){
  const implementation=(lower==='compositionevent'?CompositionIDL:InputIDL).createImpl(globalObject,['']);implementation._initializedFlag=false;return implementation;
 }
 if(lower==='beforeunloadevent'){
  const record=records.get(globalObject);if(!record)return apply(originalCreateEvent,this,[type]);
  const value=record.createBefore(),implementation=eventImplementation(value);implementation._initializedFlag=false;return implementation;
 }
 try{return apply(originalCreateEvent,this,[type])}catch(error){if(DOMExceptionIDL.is(error)&&implementationForWrapper(error).name==='NotSupportedError')throw DOMExceptionIDL.create(globalObject,['The operation is not supported','NotSupportedError']);throw error}
};
function dictionary(record,value){if(value==null)return null;if(!hasObject(value))throw new record.TypeError('invalid argument');return value}
function domString(record,value){return conversions.DOMString(value,{globals:record})}
function createExtension(record,receiver,kind,type,options){
 type=domString(record,type);options=dictionary(record,options);
 const init=Object.create(null);eventInit(record,options,init);
 const slot=Object.create(null);slot.kind=kind;
 if(kind==='PromiseRejectionEvent'){
  const promise=member(options,'promise');if(promise!=null&&!types.isPromise(promise))throw new record.TypeError('invalid argument');slot.promise=promise??null;
  slot.reason=member(options,'reason')??null;
 }else if(kind==='SecurityPolicyViolationEvent'){
  // Inherited EventInit is converted first, but Native uses these fixed initial
  // propagation flags. Subsequent initEvent follows the real Event algorithm.
  init.bubbles=true;init.cancelable=false;init.composed=true;
  for(const key of ['blockedURI','columnNumber','disposition','documentURI','effectiveDirective','lineNumber','originalPolicy','referrer','sample','sourceFile','statusCode','violatedDirective']){
   const value=member(options,key);
   if(key==='disposition'){const disposition=value===undefined?'enforce':domString(record,value);if(disposition!=='enforce'&&disposition!=='report')throw new record.TypeError('invalid argument');slot[key]=disposition}
   else if(['columnNumber','lineNumber','statusCode'].includes(key)){
    const number=value===undefined?0:conversions['unsigned long'](value,{globals:record});if(key==='statusCode'&&number>65535)throw new record.TypeError('invalid argument');slot[key]=number;
   }else slot[key]=value===undefined?'':domString(record,value);
  }
 }else slot.returnValue='';
 EventIDL.setup(receiver,record.globalObject,[type,init]);
 const implementation=eventImplementation(receiver)??implementationForWrapper(receiver);extensions.set(implementation,slot);
 registerPlatformFactory(receiver,{kind,implementation,globalObject:domWrapperGlobal(receiver,record.globalObject)});record.onConstruct?.(receiver,implementation,kind);return receiver;
}
function publicDefinitions(bridge,Event,TypeError){
 'use strict';
 const define=Object.defineProperty,setPrototype=Object.setPrototypeOf;
 function BeforeUnloadEvent(){throw new TypeError('Illegal Constructor')}
 function SecurityPolicyViolationEvent(type){if(!new.target||arguments.length<1)throw new TypeError('invalid argument');return bridge.construct(this,'SecurityPolicyViolationEvent',type,arguments[1])}
 function PromiseRejectionEvent(type){if(!new.target||arguments.length<1)throw new TypeError('invalid argument');return bridge.construct(this,'PromiseRejectionEvent',type,arguments[1])}
 const constructors={BeforeUnloadEvent,SecurityPolicyViolationEvent,PromiseRejectionEvent};
 for(const [kind,C]of Object.entries(constructors)){
  setPrototype(C,Event);setPrototype(C.prototype,Event.prototype);delete C.prototype.constructor;
  const keys=kind==='BeforeUnloadEvent'?['returnValue']:kind==='PromiseRejectionEvent'?['reason','promise']:['documentURI','referrer','blockedURI','violatedDirective','effectiveDirective','originalPolicy','sourceFile','sample','disposition','statusCode','lineNumber','columnNumber'];
  for(const key of keys){const get=Object.getOwnPropertyDescriptor({get [key](){return bridge.read(this,kind,key)}},key).get,property={get,enumerable:true,configurable:true};if(kind==='BeforeUnloadEvent')property.set=Object.getOwnPropertyDescriptor({set returnValue(value){bridge.write(this,value)}},'returnValue').set;define(C.prototype,key,property)}
  define(C.prototype,'constructor',{value:C,writable:true,configurable:true});define(C.prototype,Symbol.toStringTag,{value:kind,configurable:true});define(C,'prototype',{writable:false});
 }
 const which=Object.getOwnPropertyDescriptor({get which(){return bridge.which(this)}},'which').get;
 const layerX=Object.getOwnPropertyDescriptor({get layerX(){return bridge.layer(this,'clientX')}},'layerX').get;
 const layerY=Object.getOwnPropertyDescriptor({get layerY(){return bridge.layer(this,'clientY')}},'layerY').get;
 return[BeforeUnloadEvent,SecurityPolicyViolationEvent,PromiseRejectionEvent,which,layerX,layerY,({createEvent(type){return bridge.createEvent(this,arguments)}}).createEvent];
}
export function customEventInterface(implementation){return extensions.get(implementation)?.kind}
export function wrapCustomEvent(globalObject,implementation){
 const record=records.get(globalObject),slot=extensions.get(implementation);if(!record||!slot)return undefined;
 const value=createDOMWrapperShell(record.context??globalObject,record.constructors[slot.kind].prototype,slot.kind);preparePrivateEvent(value,globalObject);bindEventImplementation(value,implementation);registerPlatformFactory(value,{kind:slot.kind,implementation,globalObject});return value;
}
export function installEventAPIParity(globalObject,{context,Event=globalObject.Event,onConstruct,onFactoryConstruct}={}){
 let prior=records.get(globalObject);if(prior)return prior;
 context??=vm.isContext(globalObject)?globalObject:implementationForWrapper(globalObject)?._globalObject;
 const record=Object.assign(Object.create(null),{globalObject,context,TypeError:globalObject.TypeError,String:globalObject.String,Number:globalObject.Number,onConstruct,onFactoryConstruct});records.set(globalObject,record);errorTypes.set(globalObject,record);if(context){records.set(context,record);errorTypes.set(context,record)}
 const brand=(value,kind)=>{const implementation=eventImplementation(value),slot=implementation&&extensions.get(implementation);if(!slot||slot.kind!==kind)throw new record.TypeError('Illegal invocation');return slot};
 const bridge={createEvent:(receiver,args)=>createDocumentEvent(globalObject,receiver,eventFactoryType(globalObject,receiver,args)),construct:(receiver,kind,type,options)=>createExtension(record,receiver,kind,type,options),read:(value,kind,key)=>brand(value,kind)[key],write(value,next){const slot=brand(value,'BeforeUnloadEvent');slot.returnValue=domString(record,next)},which(value){const implementation=eventImplementation(value);if(!(implementation instanceof UIImpl))throw new record.TypeError('Illegal invocation');return implementation instanceof MouseImpl?implementation.button+1:implementation instanceof KeyboardImpl?implementation.keyCode:implementation.which},layer(value,key){const implementation=eventImplementation(value);if(!(implementation instanceof MouseImpl))throw new record.TypeError('Illegal invocation');return implementation[key]}};
 const result=vm.compileFunction('return ('+publicDefinitions.toString()+')(bridge,Event,TypeError)',['bridge','Event','TypeError'],vm.isContext(context)?{parsingContext:context}:{})(bridge,Event,record.TypeError);
 record.constructors=Object.create(null);for(let index=0;index<kinds.length;index++)record.constructors[kinds[index]]=result[index];[record.which,record.layerX,record.layerY,record.createEvent]=[result[3],result[4],result[5],result[6]];record.createBefore=()=>{const value=createDOMWrapperShell(globalObject,record.constructors.BeforeUnloadEvent.prototype,'BeforeUnloadEvent');try{return createExtension(record,value,'BeforeUnloadEvent','',undefined)}finally{finishDOMWrapperSetup(value)}};const registry=utils.initCtorRegistry(globalObject);
 for(const kind of kinds){const value=record.constructors[kind];define(globalObject,kind,{value,writable:true,configurable:true,enumerable:false});registry[kind]=value}
 define(globalObject.Document.prototype,'createEvent',{value:record.createEvent,writable:true,enumerable:true,configurable:true});
 define(globalObject.UIEvent.prototype,'which',{get:record.which,enumerable:true,configurable:true});
 for(const key of ['layerX','layerY'])define(globalObject.MouseEvent.prototype,key,{get:record[key],enumerable:true,configurable:true});
 return record;
}

// Actual engine-owned rejection delivery differs from authored dictionary
// defaults: preserve the unhandled reason verbatim, then clear the late-event
// reason. This seam is Host-only and never marks an authored dispatch trusted.
export function createPromiseRejectionEvent(globalObject,type,promise,reason){
 const record=records.get(globalObject);if(!record)throw new TypeError('Event realm is not installed');
 const event=Reflect.construct(record.constructors.PromiseRejectionEvent,[type,{promise,cancelable:type==='unhandledrejection'}]);
 extensions.get(eventImplementation(event)).reason=type==='unhandledrejection'?reason:null;return event;
}

function documentBacking(record,value){const factory=platformFactoryRecord(value);if(!(factory?.implementation instanceof DocumentImpl))throw new record.TypeError('Illegal invocation');return factory.implementation}
export function eventFactoryType(globalObject,receiver,args){const record=records.get(globalObject);documentBacking(record,receiver);if(!args.length)throw new record.TypeError('invalid argument');return domString(record,args[0]).toLowerCase()}
export function createDocumentEvent(globalObject,receiver,type){const record=records.get(globalObject),implementation=documentBacking(record,receiver),event=callDOMFactory(record.context??globalObject,implementation,'createEvent',[type]),value=utils.wrapperForImpl(event);return record.onFactoryConstruct?.(value,event)??value}
