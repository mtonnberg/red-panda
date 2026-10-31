// Host-private backing for the original generated Event wrappers. No symbols,
// extra fronts, reflected-key filters or authored object tags confer authority.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {domWrapperGlobal} from './dom-factory-scope.js';

const require=createRequire(import.meta.url);
const utils=require('jsdom/lib/jsdom/living/generated/utils.js');
if(require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(readFileSync(require.resolve('jsdom/lib/jsdom/living/generated/utils.js'))).digest('hex')!=='3dce521ab525a11eb5d817a78bf3308a8ab2e16b73c5c288f81c8d6ad496fa2e')throw new Error('Pinned jsdom Event utilities source changed');
const EventImpl=require('jsdom/lib/jsdom/living/events/Event-impl.js').implementation;
const kinds=new Set(),values=new WeakMap(),backends=new WeakSet();
const contexts=new WeakMap(),getters=new WeakMap(),prepared=new WeakMap(),installed=new WeakSet();
const define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor,legacyImpl=utils.implForWrapper;

export function eventImplementation(value){return values.get(value)}
// Stable owned-module lookup: private Events first, current genuine utility
// graph for all other wrappers. Captured pre-install symbol readers stay old.
export function implementationForWrapper(value){return values.get(value)??utils.implForWrapper(value)}
export function bindEventImplementation(value,implementation){
 if(!implementation||!(implementation instanceof EventImpl))throw new TypeError('A genuine generated Event implementation is required');
 values.set(value,implementation);backends.add(implementation);return implementation;
}
function captureRealm(globalObject,selected){
 const context=selected??(vm.isContext(globalObject)?globalObject:contexts.get(globalObject)??legacyImpl(globalObject)?._globalObject??globalObject);
 if(vm.isContext(context)){
  contexts.set(globalObject,context);contexts.set(context,context);contexts.set(vm.runInContext('globalThis',context),context);return context;
 }
 // Genuine no-runScripts jsdom Windows use the actual Host intrinsics. Keep
 // that real Host origin; an invented VM would change standalone semantics.
 if(context===globalObject&&globalObject?._globalObject===globalObject&&globalObject.Object===Object){contexts.set(globalObject,globalObject);return globalObject;}
 throw new TypeError('An actual Event originating realm is required');
}
function trustGetter(context){
 let getter=getters.get(context);if(getter)return getter;
 // Capture the actual VM TypeError before authored code. The only values that
 // cross these private closures are a receiver and a boolean, never a backend.
 getter=vm.compileFunction(`'use strict';const TypeError=globalThis.TypeError;return Object.getOwnPropertyDescriptor({get isTrusted(){if(!has(this))throw new TypeError('Illegal invocation');return read(this)}},'isTrusted').get;`,['has','read'],vm.isContext(context)?{parsingContext:context}:{})(value=>values.has(value),value=>!!values.get(value).isTrusted);
 getters.set(context,getter);return getter;
}
export function preparePrivateEvent(value,globalObject){
 const selected=domWrapperGlobal(value,globalObject),context=contexts.get(selected)??captureRealm(selected),getter=trustGetter(context),existing=descriptor(value,'isTrusted');
 if(existing){if(prepared.get(value)!==existing.get)throw new TypeError('Event unforgeable already exists');return}
 define(value,'isTrusted',{get:getter,enumerable:true,configurable:false});prepared.set(value,getter);
}
export function installPrivateEventUtils(target=utils,context){
 if(installed.has(target))return;installed.add(target);const original=target.implForWrapper;
 target.implForWrapper=value=>{
  const event=values.get(value);if(event)return event;
  const implementation=original(value);
  // Legacy non-Event interfaces keep their existing backing. A copied Event
  // implementation symbol can never become an alternate Event authority.
  return backends.has(implementation)?null:implementation;
 };
 target.tryImplForWrapper=value=>target.implForWrapper(value)??value;
 target.eventImplementation=eventImplementation;
 target.bindEventImplementation=bindEventImplementation;
 target.preparePrivateEvent=preparePrivateEvent;
 target.captureEventRealm=globalObject=>{const actual=captureRealm(globalObject,context);trustGetter(actual);return actual};
 if(context){captureRealm(vm.runInContext('globalThis',context),context);trustGetter(context)}
}
// This module is loaded before callers capture the exported utility functions;
// generated Event factories themselves are transformed before any Window.
installPrivateEventUtils();
export function isPrivateEventKind(kind){return kinds.has(kind)}
export function transformPrivateEventSource(source,kind){
 const setup=`Object.defineProperty(wrapper, implSymbol, {\n    value: new Impl.implementation(globalObject, constructorArgs, privateData),\n    configurable: true\n  });`;
 const shell=`Object.defineProperty(wrapper, implSymbol, {\n    value: Object.create(Impl.implementation.prototype),\n    configurable: true\n  });`;
 const brand='utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation';
 if(source.split(setup).length!==2||source.split(shell).length!==2||source.split(brand).length!==2)throw new Error('Unexpected generated Event backing source: '+kind);
 kinds.add(kind);
 source=source.replace(setup,'utils.bindEventImplementation(wrapper, new Impl.implementation(globalObject, constructorArgs, privateData));').replace(shell,'utils.bindEventImplementation(wrapper, Object.create(Impl.implementation.prototype));');
 source=source.replace(brand,'utils.isObject(value) && utils.eventImplementation(value) instanceof Impl.implementation');
 for(const name of['wrapper','esValue','value'])source=source.replaceAll(name+'[implSymbol]','utils.eventImplementation('+name+')');
 if(kind==='Event'){
  const unforgeable='utils.define(wrapper, getUnforgeables(globalObject));',install='  const ctorRegistry = utils.initCtorRegistry(globalObject);';
  if(source.split(unforgeable).length!==2||source.split(install).length!==2)throw new Error('Unexpected generated Event unforgeable source');
  source=source.replace(unforgeable,'utils.preparePrivateEvent(wrapper, globalObject);');
  source=source.replace(install,'  utils.captureEventRealm(globalObject);\n'+install);
 }
 return source;
}
