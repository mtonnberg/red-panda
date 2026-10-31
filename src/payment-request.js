// Independent no-payment-service profile. Authored requests never enter an
// interactive checkout, so there is no approval, response, or payment output.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
import {registerProtocolPrototype} from './protocol-classes.js';
import {captureDOMExceptionFactory} from './worker-dom-exception.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const Target=require('jsdom/lib/jsdom/living/generated/EventTarget.js'),Event=require('jsdom/lib/jsdom/living/generated/Event.js');
const TargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const {setupForSimpleEventAccessors}=require('jsdom/lib/jsdom/living/helpers/create-event-accessor.js');
const requests=new WeakMap(),events=new WeakMap(),installed=new WeakSet(),apply=Reflect.apply;
const handlers=['shippingaddresschange','shippingoptionchange','paymentmethodchange'];
const targetBackend=Object.create(TargetImpl.prototype);
setupForSimpleEventAccessors(targetBackend,handlers);
const record=value=>Object.assign(Object.create(null),value);
function paymentRealm(g,b){
 'use strict';
 const TypeError=g.TypeError,RangeError=g.RangeError,Promise=g.Promise,String=g.String,EventTarget=g.EventTarget,Event=g.Event;
 const define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,setPrototype=g.Object.setPrototypeOf,apply=g.Reflect.apply,construct=g.Reflect.construct;
 const description=descriptor(g.Symbol.prototype,'description').get,wellFormed=g.String.prototype.toWellFormed,iterator=g.Symbol.iterator,regexpTest=g.RegExp.prototype.test;
 const matches=(pattern,value)=>apply(regexpTest,pattern,[value]);
 const object=x=>x!==null&&(typeof x==='object'||typeof x==='function'),nil=x=>x===null||x===undefined;
 const invalid=()=>{throw new TypeError('invalid argument')},illegal=()=>{throw new TypeError('Illegal invocation')};
 const text=x=>apply(wellFormed,String(typeof x==='symbol'?apply(description,x,[]):x),[]);
 const dictionary=x=>{if(!object(x))invalid();return x};
 const required=(x,k,convert)=>{if(!(k in x))invalid();return convert(x[k])};
 const optional=(x,k,convert,fallback=null)=>{if(!(k in x))return fallback;const v=x[k];return nil(v)?fallback:convert(v)};
 function sequence(x,convert){
  if(!object(x))invalid();const method=x[iterator];if(typeof method!=='function')invalid();const it=apply(method,x,[]);if(!object(it))invalid();const next=it.next;if(typeof next!=='function')invalid();const result=[];
  for(;;){const step=apply(next,it,[]);if(!object(step))invalid();if(step.done)return result;define(result,String(result.length),{value:convert(step.value),writable:true,enumerable:true,configurable:true})}
 }
 const amount=x=>{dictionary(x);return{currency:required(x,'currency',text),value:required(x,'value',text)}};
 const item=x=>{dictionary(x);return{amount:required(x,'amount',amount),label:required(x,'label',text)}};
 const method=x=>{dictionary(x);return{supportedMethods:required(x,'supportedMethods',text)}};
 const shipping=x=>{dictionary(x);return{amount:required(x,'amount',amount),id:required(x,'id',text),label:required(x,'label',text),selected:optional(x,'selected',x=>!!x,false)}};
 const modifier=x=>{dictionary(x);return{additionalDisplayItems:optional(x,'additionalDisplayItems',x=>sequence(x,item)),supportedMethods:required(x,'supportedMethods',text),total:optional(x,'total',item)}};
 function details(x){dictionary(x);return{displayItems:optional(x,'displayItems',x=>sequence(x,item)),id:optional(x,'id',x=>typeof x==='string'?text(x):null),modifiers:optional(x,'modifiers',x=>sequence(x,modifier)),shippingOptions:optional(x,'shippingOptions',x=>sequence(x,shipping)),total:required(x,'total',item)}}
 function options(x){if(nil(x))return{requestShipping:false,shippingType:'shipping'};dictionary(x);return{requestShipping:optional(x,'requestShipping',x=>!!x,false),shippingType:(()=>{if(!('shippingType' in x))return'shipping';const value=x.shippingType;if(value===undefined)return'shipping';if(value!=='shipping'&&value!=='delivery'&&value!=='pickup')invalid();return value})()}}
 const length=x=>{if(b.bytes(x)>1024)throw new TypeError('Value cannot be longer than 1024 characters')};
 const count=x=>{if(x.length>1024)throw new TypeError('At most 1024 entries allowed')};
 const validMethod=x=>{if(!b.method(x))throw new RangeError('')};
 function validItem(x,total=false){length(x.label);length(x.amount.currency);length(x.amount.value);if(x.amount.currency.length!==3||!matches(/^[a-zA-Z]{3}$/,x.amount.currency))throw new RangeError('');if(!matches(/^-?[0-9]+(?:\.[0-9]+)?(?![\s\S])/,x.amount.value))throw new TypeError('Invalid amount value');if(total&&x.amount.value[0]==='-')throw new TypeError('Total amount value should be non-negative')}
 function validItems(x){if(x===null)return;count(x);for(let i=0;i<x.length;i++)validItem(x[i])}
 function PaymentRequest(methodData,init){
  if(!new.target||arguments.length<2)invalid();const methods=sequence(methodData,method),d=details(init),o=options(arguments[2]);
  if(d.id!==null)length(d.id);if(methods.length===0)throw new TypeError('At least one payment method is required');count(methods);
  for(let i=0;i<methods.length;i++){validMethod(methods[i].supportedMethods);for(let j=0;j<i;j++)if(methods[i].supportedMethods===methods[j].supportedMethods)throw new RangeError('')}
  validItem(d.total,true);validItems(d.displayItems);let selected=null;
  if(o.requestShipping&&d.shippingOptions!==null){count(d.shippingOptions);for(let i=0;i<d.shippingOptions.length;i++){const option=d.shippingOptions[i];validItem(option);length(option.id);for(let j=0;j<i;j++)if(option.id===d.shippingOptions[j].id)throw new TypeError('Cannot have duplicate shipping option identifiers');if(option.selected)selected=option.id}}
  if(d.modifiers!==null){count(d.modifiers);for(let i=0;i<d.modifiers.length;i++){const m=d.modifiers[i];if(m.total!==null)validItem(m.total,true);validItems(m.additionalDisplayItems);validMethod(m.supportedMethods)}}
  const result=b.utility?construct(EventTarget,[],new.target):this;b.request(result,d.id,selected,o.requestShipping?o.shippingType:null);return result;
 }
 function operation(receiver,op){return new Promise((resolve,reject)=>{if(!b.hasRequest(receiver)){reject(new TypeError('invalid argument'));return}const error=b.operation(receiver,op);if(error)reject(b.exception(error==='NotSupportedError'?'The operation is not supported':'The object is in an invalid state',error));else resolve(false)})}
 const requestPrototype={show(){return operation(this,'show')},abort(){return operation(this,'abort')},canMakePayment(){return operation(this,'canMakePayment')},hasEnrolledInstrument(){return operation(this,'hasEnrolledInstrument')},get id(){if(!b.hasRequest(this))illegal();return b.read(this,'id')},get shippingAddress(){if(!b.hasRequest(this))illegal();return null},get shippingOption(){if(!b.hasRequest(this))illegal();return b.read(this,'shippingOption')},get shippingType(){if(!b.hasRequest(this))illegal();return b.read(this,'shippingType')}};
 for(const name of['onshippingaddresschange','onshippingoptionchange','onpaymentmethodchange']){const accessors={get [name](){if(!b.hasRequest(this))illegal();return b.handler(this,name)},set [name](value){if(!b.hasRequest(this))illegal();b.handler(this,name,typeof value==='function'?value:null,true)}};define(requestPrototype,name,{get:descriptor(accessors,name).get,set:descriptor(accessors,name).set,enumerable:true,configurable:true})}
 function PaymentResponse(){throw new TypeError('Illegal Constructor')}
 function eventOptions(x,methodChange){
  if(nil(x))x={};dictionary(x);const init={bubbles:optional(x,'bubbles',x=>!!x,false),cancelable:optional(x,'cancelable',x=>!!x,false),composed:optional(x,'composed',x=>!!x,false)};let methodDetails=null,methodName='';
  if(methodChange){methodDetails=optional(x,'methodDetails',x=>{if(!object(x))invalid();return x});methodName='methodName' in x?(()=>{const value=x.methodName;return value===undefined?'':text(value)})():''}
  return{init,methodDetails,methodName};
 }
 function initializeEvent(receiver,target,type,options,change){const converted=text(type),o=eventOptions(options,change),result=b.utility?construct(Event,[converted,o.init],target):receiver;b.event(result,converted,o.init,change,o.methodName,o.methodDetails);return result}
 function PaymentRequestUpdateEvent(type){if(!new.target||!arguments.length)invalid();return initializeEvent(this,new.target,type,arguments[1],false)}
 function PaymentMethodChangeEvent(type){if(!new.target||!arguments.length)invalid();return initializeEvent(this,new.target,type,arguments[1],true)}
 const updatePrototype={updateWith(detailsPromise){if(!b.hasEvent(this,false))illegal();if(!arguments.length)invalid();throw b.exception('The object is in an invalid state','InvalidStateError')}};
 const changePrototype={get methodName(){if(!b.hasEvent(this,true))illegal();return b.eventRead(this,'methodName')},get methodDetails(){if(!b.hasEvent(this,true))illegal();return b.eventRead(this,'methodDetails')}};
 function install(C,p,parent){setPrototype(p,parent.prototype);setPrototype(C,parent);define(p,'constructor',descriptor(C.prototype,'constructor'));define(p,g.Symbol.toStringTag,{value:C.name,configurable:true});define(C,'prototype',{value:p,writable:false});define(g,C.name,{value:C,writable:true,configurable:true});b.prototype(p,C.name)}
 install(PaymentRequest,requestPrototype,EventTarget);install(PaymentResponse,{},EventTarget);install(PaymentRequestUpdateEvent,updatePrototype,Event);install(PaymentMethodChangeEvent,changePrototype,PaymentRequestUpdateEvent);
}
function validMethod(value){
 if(/^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*(?![\s\S])/.test(value))return true;
 let url;try{url=new URL(value)}catch{return false}if(url.username||url.password)return false;if(url.protocol==='https:')return true;
 if(url.protocol!=='http:')return false;const host=url.hostname.toLowerCase().replace(/\.$/,'');return host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||/^127\./.test(host);
}
export function installPaymentRequest(realm,{secure=false,context,evaluate,utility=false,wrap=utils.tryWrapperForImpl}={}){
 for(const kind of['PaymentRequest','PaymentResponse','PaymentRequestUpdateEvent','PaymentMethodChangeEvent'])registerPlatformFactoryKind(kind);
 if(!secure||installed.has(realm))return;installed.add(realm);
 const exception=captureDOMExceptionFactory(realm);
 const bridge=record({utility,exception,bytes:value=>Buffer.byteLength(value),method:validMethod,hasRequest:value=>requests.has(value),hasEvent:(value,change)=>events.has(value)&&(!change||events.get(value).change),
  request(value,id,shippingOption,shippingType){if(!utility)Target.setup(value,realm,[]);const backend=utils.implForWrapper(value);Object.setPrototypeOf(backend,targetBackend);const state=record({id:id??randomUUID(),shippingOption,shippingType,closed:false,backend,handlerCallbacks:new Map()});requests.set(value,state);registerPlatformFactory(value,{kind:'PaymentRequest',implementation:state,globalObject:realm})},
  operation(value,op){const state=requests.get(value);if(op==='abort'||state.closed)return'InvalidStateError';if(op==='show'){state.closed=true;return'NotSupportedError'}return null},
  read:(value,key)=>requests.get(value)[key],
  handler(value,key,next,set=false){const state=requests.get(value),backend=state.backend,type=key.slice(2);if(!set)return backend[key]?.objectReference??null;
   if(next===null){const existing=state.handlerCallbacks.get(type);if(existing){apply(TargetImpl.prototype.removeEventListener,backend,[type,existing,false]);state.handlerCallbacks.delete(type);backend._registeredHandlers.delete(type)}backend[key]=null;return}
   const callback=function(event){return apply(next,value,[wrap(event)])};callback.objectReference=next;const fresh=!backend._registeredHandlers?.has(type);backend[key]=callback;if(fresh){const listeners=backend._eventListeners[type];state.handlerCallbacks.set(type,listeners[listeners.length-1].callback)}
  },
  event(value,type,init,change,methodName,methodDetails){if(!utility)Event.setup(value,realm,[type,init]);const state=record({change,methodName,methodDetails});events.set(value,state);registerPlatformFactory(value,{kind:change?'PaymentMethodChangeEvent':'PaymentRequestUpdateEvent',implementation:state,globalObject:realm})},
  eventRead:(value,key)=>events.get(value)[key],prototype:registerProtocolPrototype,
 });
 const create=evaluate?evaluate(`(${paymentRealm.toString()})`):vm.compileFunction(`return (${paymentRealm.toString()})`,[],{parsingContext:context??utils.implForWrapper(realm.document)._globalObject})();create(realm,bridge);
}
