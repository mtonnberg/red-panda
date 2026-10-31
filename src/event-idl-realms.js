// Genuine public VM interface objects over captured canonical generated
// conversions/backends. Private installation state and operation closures are
// Host-owned; no public function can return a backend or a controller table.
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const records=new WeakMap(),HostObject=Object.prototype,HostFunction=Function.prototype;
const isArray=Array.isArray,isFrozen=Object.isFrozen;
const own=Reflect.ownKeys,descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,prototype=Object.getPrototypeOf,setPrototype=Object.setPrototypeOf,apply=Reflect.apply;
function recordFor(globalObject){
 const context=vm.isContext(globalObject)?globalObject:utils.implForWrapper(globalObject)?._globalObject;
 // A genuine JSDOM created without runScripts belongs to the Host realm.
 // Keep its original generated interface instead of inventing a VM context.
 if(!context||!vm.isContext(context))return null;
 let record=records.get(context);if(!record){record=Object.assign(Object.create(null),{context,Array:vm.runInContext('Array',context),TypeError:vm.runInContext('TypeError',context),objectPrototype:vm.runInContext('Object.prototype',context),functionPrototype:vm.runInContext('Function.prototype',context),interfaces:new Map()});records.set(context,record)}return record;
}
function member(record,interfaceName,key,kind,original,brand,globalObject){
 const invoke=(receiver,args)=>{
  if(interfaceName==='EventTarget'&&receiver==null)receiver=globalObject;
  if(!brand(receiver))throw new record.TypeError('Illegal invocation');
  const value=apply(original,receiver,args);
  if(isArray(value)&&((interfaceName==='Event'&&key==='composedPath')||(interfaceName==='MessageEvent'&&key==='ports'&&!isFrozen(value)))){
   const result=Reflect.construct(record.Array,[value.length]);for(let i=0;i<value.length;i++)define(result,i,{value:value[i],writable:true,enumerable:true,configurable:true});return result;
  }
  return value;
 };let source;
 if(kind==='get')source='return Object.getOwnPropertyDescriptor({get [key](){return invoke(this,[])}},key).get;';
 else if(kind==='set')source='return Object.getOwnPropertyDescriptor({set [key](value){invoke(this,[value])}},key).set;';
 else source='return ({[key](...args){return invoke(this,args)}})[key];';
 const value=vm.compileFunction("'use strict';"+source,['key','invoke'],{parsingContext:record.context})(key,invoke);
 for(const name of['name','length'])define(value,name,descriptor(original,name));return value;
}
export function installEventIDLRealm(globalObject,kind,original,constructOperation,brand){
 const record=recordFor(globalObject);if(!record)return original;
 // Strict ordinary construction supplies the genuine selected-VM receiver
 // and performs V8's prototype resolution exactly once before conversion.
 // Setup initializes that SAME receiver; a call without new never creates a
 // platform value. All operation/controller state remains Host-private.
 const construct=(receiver,newTarget,args)=>{if(newTarget===undefined)throw new record.TypeError('invalid argument');return constructOperation(receiver,args)};
 const value=vm.compileFunction("'use strict';return function "+kind+'(...args){return construct(this,new.target,args)}',['construct'],{parsingContext:record.context})(construct);
 const parent=prototype(original),base=prototype(original.prototype);
 setPrototype(value,parent===HostFunction?record.functionPrototype:record.interfaces.get(parent)??parent);
 setPrototype(value.prototype,base===HostObject?record.objectPrototype:base);
 delete value.prototype.constructor;
 const propertyOrder={Event:['type','bubbles','cancelable','composed','target','srcElement','currentTarget','eventPhase','defaultPrevented','timeStamp','preventDefault','stopPropagation','stopImmediatePropagation','composedPath','initEvent','returnValue','cancelBubble','NONE','CAPTURING_PHASE','AT_TARGET','BUBBLING_PHASE','constructor',Symbol.toStringTag],EventTarget:['dispatchEvent','addEventListener','removeEventListener','constructor',Symbol.toStringTag]}[kind]??own(original.prototype);
 for(const key of propertyOrder){
  const property=descriptor(original.prototype,key);
  if(key==='constructor')property.value=value;
  else for(const type of['value','get','set'])if(typeof property[type]==='function')property[type]=member(record,kind,key,type,property[type],brand,globalObject);
  define(value.prototype,key,property);
 }
 for(const key of own(original))if(key!=='prototype'){
  const property=descriptor(original,key);
  for(const type of['value','get','set'])if(typeof property[type]==='function')property[type]=member(record,kind,key,type,property[type],brand,globalObject);
  define(value,key,property);
 }
 define(value,'prototype',{...descriptor(original,'prototype'),value:value.prototype});
 record.interfaces.set(original,value);return value;
}
export function transformEventIDLInstall(source,kind){
 const start=source.indexOf('exports.install = '),signature=source.indexOf('    constructor(',start);
 if(start<0||signature<0)throw new Error('Unexpected generated Event installation: '+kind);
 const open=source.indexOf(') {',signature),end=/      return exports\.setup\(createShell\(globalObject, new\.target\.prototype\), globalObject, (?:args|\[\]|undefined)\);\n    }/g;
 end.lastIndex=open;const match=end.exec(source);if(!match)throw new Error('Unexpected generated Event constructor: '+kind);
 const parameters=source.slice(signature+'    constructor('.length,open),body=source.slice(open+3,match.index+match[0].length-'\n    }'.length).replaceAll('createShell(globalObject, new.target.prototype)','receiver');
 const assignment='  ctorRegistry[interfaceName] = '+kind+';';if(source.split(assignment).length!==2)throw new Error('Unexpected generated Event registry assignment: '+kind);
 return source.replace(assignment,`  ${kind} = installEventIDLRealm(globalObject, ${JSON.stringify(kind)}, ${kind}, function(receiver, received) { return Reflect.apply(function(${parameters}) {${body}\n  }, undefined, received); }, exports.is);\n`+assignment);
}
