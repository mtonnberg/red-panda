import vm from 'node:vm';
// Private backing for canonical EventTarget wrappers. Inherited Node targets
// use successful factory provenance, never authored implementation symbols.
import {createRequire}from'node:module';
import {platformFactoryRecord}from'./platform-factories.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),EventTargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const ordinaryHasInstance=Function.prototype[Symbol.hasInstance],apply=Reflect.apply;
const isTarget=implementation=>apply(ordinaryHasInstance,EventTargetImpl,[implementation]);
const values=new WeakMap(),backends=new WeakSet(),installed=new WeakSet();
export function hasEventTargetImplementation(value){return eventTargetImplementation(value)!==undefined}
export function directEventTargetImplementation(value){return values.get(value)}
export function eventTargetImplementation(value){const own=values.get(value);if(own)return own;const implementation=platformFactoryRecord(value)?.implementation;return isTarget(implementation)?implementation:undefined}
export function bindEventTargetImplementation(value,implementation,globalObject){if(!isTarget(implementation))throw new TypeError('A genuine EventTarget implementation is required');values.set(value,implementation);if(value===globalObject&&vm.isContext(globalObject))values.set(vm.runInContext('globalThis',globalObject),implementation);backends.add(implementation);return implementation}
export function installPrivateEventTargetUtils(target=utils){if(installed.has(target))return;installed.add(target);const original=target.implForWrapper;target.implForWrapper=value=>{const implementation=values.get(value);if(implementation)return implementation;const legacy=original(value);return backends.has(legacy)?null:legacy};target.tryImplForWrapper=value=>target.implForWrapper(value)??value;target.eventTargetImplementation=eventTargetImplementation;target.hasEventTargetImplementation=hasEventTargetImplementation;target.bindEventTargetImplementation=bindEventTargetImplementation}
installPrivateEventTargetUtils();
export function transformPrivateEventTargetSource(source){
 const setup='Object.defineProperty(wrapper, implSymbol, {\n    value: new Impl.implementation(globalObject, constructorArgs, privateData),\n    configurable: true\n  });',allocate='Object.defineProperty(wrapper, implSymbol, {\n    value: Object.create(Impl.implementation.prototype),\n    configurable: true\n  });',brand='utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation';
 for(const expression of[setup,allocate,brand])if(source.split(expression).length!==2)throw new Error('Pinned generated EventTarget backing changed');
 source=source.replace(setup,'utils.bindEventTargetImplementation(wrapper, new Impl.implementation(globalObject, constructorArgs, privateData), globalObject);\n  if (wrapper === globalObject) Object.defineProperty(wrapper, implSymbol, {value: utils.eventTargetImplementation(wrapper), configurable: true});').replace(allocate,'utils.bindEventTargetImplementation(wrapper, Object.create(Impl.implementation.prototype));').replace(brand,'utils.isObject(value) && utils.hasEventTargetImplementation(value)');
 for(const name of['wrapper','esValue','value'])source=source.replaceAll(name+'[implSymbol]','utils.eventTargetImplementation('+name+')');return source;
}
