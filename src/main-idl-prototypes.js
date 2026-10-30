// Optional, bounded before-author correction for existing fresh IDL objects.
// No Window/constructor/wrapper identity is replaced. Host [[Realm]] remains
// unchanged except the explicitly realm-compiled sequence method below.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const interfaces=require('jsdom/lib/jsdom/living/interfaces.js');
const installed=new WeakSet(),hostObject=Object.prototype,hostFunction=Function.prototype;
const prototypeOf=Object.getPrototypeOf,setPrototype=Object.setPrototypeOf,descriptor=Object.getOwnPropertyDescriptor;
export function alignMainIDLPrototypes(window){
 if(installed.has(window))return;installed.add(window);
 const registry=window[utils.ctorRegistrySymbol],objectPrototype=window.Object.prototype,functionPrototype=window.Function.prototype;
 const functions=new Set(),prototypes=new Set();
 for(const[name,constructor]of Object.entries(registry)){
  // Only pinned generated interfaces installed freshly by Window bootstrap.
  // CSS classes and host Abort/Fetch constructors are outside this registry.
  if(typeof constructor!=='function'||!interfaces.getInterfaceWrapper(name))continue;
  functions.add(constructor);const prototype=descriptor(constructor,'prototype')?.value;if(!prototype||prototypes.has(prototype))continue;prototypes.add(prototype);
  if(prototypeOf(prototype)===hostObject)setPrototype(prototype,objectPrototype);
  for(const key of Reflect.ownKeys(prototype)){const item=descriptor(prototype,key);for(const value of [item.value,item.get,item.set])if(typeof value==='function')functions.add(value);}
 }
 for(const fn of functions)if(prototypeOf(fn)===hostFunction)setPrototype(fn,functionPrototype);
 const property=descriptor(window.Element.prototype,'getAttributeNames');
 const context=utils.implForWrapper(window.document)._globalObject;
 const wrapper=vm.compileFunction('return ({getAttributeNames(...args){const values=apply(original,this,args);return apply(from,ArrayConstructor,[values]);}}).getAttributeNames;',['original','apply','from','ArrayConstructor'],{parsingContext:context})(property.value,window.Reflect.apply,window.Array.from,window.Array);
 for(const key of ['name','length'])Object.defineProperty(wrapper,key,descriptor(property.value,key));
 Object.defineProperty(window.Element.prototype,'getAttributeNames',{...property,value:wrapper});
}
