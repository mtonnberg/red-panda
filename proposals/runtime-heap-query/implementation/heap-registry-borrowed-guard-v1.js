import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { getHeapBinding } from './native-heap.js';
const require=createRequire(import.meta.url),canonical=new WeakMap(),publicValues=new WeakSet(),prototypeOwners=new WeakMap(),globals=new WeakMap(),windows=new WeakMap(),privateValues=new WeakSet(),privatePrototypes=new WeakSet(),implementationValues=new WeakSet();
const own=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,define=Reflect.defineProperty,isProxy=require('node:util').types.isProxy;
const hostIntrinsics=new WeakSet();
for(const key of Reflect.ownKeys(globalThis)){const descriptor=own(globalThis,key);if(descriptor&&'value'in descriptor&&typeof descriptor.value==='function'){const prototype=own(descriptor.value,'prototype');if(prototype&&'value'in prototype&&object(prototype.value))hostIntrinsics.add(prototype.value)}}
let installed=false,registrations=0;
function object(value){return value!==null&&value!==undefined&&(typeof value==='object'||typeof value==='function'||typeof value==='undefined')}
export function registerHeapWrapper(value,globalObject,replace){
 if(!object(value))return value;
 const binding=getHeapBinding(),targets=binding.proxyTargets(value);
 for(const target of targets){const previous=canonical.get(target);if(previous!==undefined&&previous!==value&&previous!==replace)throw Error('Heap wrapper identity conflict');canonical.set(target,value)}
 publicValues.add(value);privateValues.delete(value);for(const target of targets)privateValues.delete(target);registrations++;return value;
}
export function publishHeapObject(value){if(object(value)){publicValues.add(value);privateValues.delete(value)}return value}
export function privateHeapObject(value){if(object(value))privateValues.add(value);return value}
function privateImplementation(value){if(!object(value)||implementationValues.has(value))return;implementationValues.add(value);privateValues.add(value);if(isProxy(value))return;for(let prototype=Object.getPrototypeOf(value);prototype!==null;prototype=Object.getPrototypeOf(prototype)){if(isProxy(prototype))break;privatePrototypes.add(prototype)}}
export function registerHeapFactoryValue(value,{implementation,globalObject,replace}={}){if(implementation!==undefined)privateImplementation(implementation);return registerHeapWrapper(value,globalObject,replace)}
export function installHeapFactories(){
 if(installed)return;installed=true;
 // Tag only real parser-owned allocations. Public stylesheet factories publish
 // their final graph separately; the hidden jsdom UA sheet stays private.
 const cssom=require('rrweb-cssom'),parseCSS=cssom.parse;
 cssom.parse=function(...args){
  const result=Reflect.apply(parseCSS,this,args),seen=new WeakSet();
  function visit(value){if(!object(value)||seen.has(value))return;seen.add(value);privateHeapObject(value);
   for(const key of ['style','cssRules','media']){const descriptor=own(value,key);if(!descriptor||!('value'in descriptor))continue;const child=descriptor.value;if(!object(child))continue;privateHeapObject(child);if(key==='cssRules'&&Array.isArray(child))for(const rule of child)visit(rule)}
  }
  visit(result);return result;
 };
 const directory=path.dirname(require.resolve('jsdom/lib/jsdom/living/generated/utils.js'));
 const modules=readdirSync(directory).filter(name=>name.endsWith('.js')&&!['utils.js','HTMLFormElement.js','HTMLFormControlsCollection.js'].includes(name)).map(name=>path.join(directory,name));
 for(const name of ['whatwg-url/lib/URL.js','whatwg-url/lib/URLSearchParams.js'])modules.push(require.resolve(name));
 const utils=require('jsdom/lib/jsdom/living/generated/utils.js');
 for(const filename of modules){const IDL=require(filename);for(const name of ['setup','new']){const original=IDL[name];if(typeof original!=='function')continue;IDL[name]=function(...args){const result=Reflect.apply(original,this,args);if(name==='setup'){registerHeapWrapper(result,args[1]);const raw=args[0],descriptor=own(raw,utils.implSymbol);if(descriptor&&'value'in descriptor)privateImplementation(descriptor.value)}else if(object(result)){privateImplementation(result);const descriptor=own(result,utils.wrapperSymbol);if(descriptor&&'value'in descriptor)registerHeapWrapper(descriptor.value,args[0])}return result}}}
}
function markPrototype(prototype,owner){
 if(!object(prototype))return;publicValues.add(prototype);let entries=prototypeOwners.get(prototype);if(!entries){entries=new Set();prototypeOwners.set(prototype,entries)}entries.add(new WeakRef(owner));
 for(const key of keys(prototype)){const descriptor=own(prototype,key);if(!descriptor)continue;for(const value of [descriptor.value,descriptor.get,descriptor.set])if(typeof value==='function')publicValues.add(value)}
}
export function prepareHeapRealm(page,window){
 const intrinsic=own(window,'Object')?.value;
 const global=getHeapBinding().creationGlobal(intrinsic);if(global===null)throw Error('Actual heap realm is unavailable');
 const owner={page:new WeakRef(page),window:new WeakRef(window),id:page.executionContextId};globals.set(global,owner);windows.set(window,owner);publicValues.add(window);publicValues.add(window.document);
 for(const key of keys(window)){if(typeof key!=='string'||key.startsWith('_'))continue;const descriptor=own(window,key);if(!descriptor||!('value'in descriptor)||typeof descriptor.value!=='function')continue;const constructor=descriptor.value;publicValues.add(constructor);const targets=getHeapBinding().proxyTargets(constructor),actual=targets.length?targets[targets.length-1]:constructor;const prototype=own(actual,'prototype');if(prototype&&'value'in prototype)markPrototype(prototype.value,owner)}
}
export function registerHeapRealmAuthority({context,contextId,isActive}){
 if(!vm.isContext(context)||!Number.isSafeInteger(contextId)||typeof isActive!=='function')throw Error('ERR_HEAP_QUERY_REALM_ARGUMENT');
 const anchor=vm.runInContext('[]',context),global=getHeapBinding().creationGlobal(anchor),previous=globals.get(global);
 if(previous&&active(previous)&&previous.id!==contextId)throw Error('ERR_HEAP_QUERY_REALM_ALIAS');
 const owner={id:contextId,guard:isActive};globals.set(global,owner);
 return {dispose(){if(globals.get(global)===owner)globals.delete(global)}};
}
function active(owner){if(owner?.guard)return owner.guard()===true;const page=owner?.page.deref(),window=owner?.window.deref();return !!page&&!page.closed&&page.executionContextId===owner.id&&page.dom?.window===window&&!!window?.document}
export function authorizeHeapRealm(anchor,expectedContextId){const owner=globals.get(getHeapBinding().creationGlobal(anchor));return !!owner&&active(owner)&&(expectedContextId===undefined||owner.id===expectedContextId)}
export function authorizeHeapPrototype(prototype,anchor){
 if(privateValues.has(prototype)||(canonical.has(prototype)&&canonical.get(prototype)!==prototype))return false;
 const binding=getHeapBinding();if(binding.sameRealm(prototype,anchor))return true;
 const prototypeGlobal=binding.creationGlobal(prototype),selectedGlobal=binding.creationGlobal(anchor);
 if(prototypeGlobal!==selectedGlobal&&globals.has(prototypeGlobal))throw Object.assign(Error('ERR_HEAP_QUERY_UNSUPPORTED_BORROWED_PROTOTYPE'),{code:'ERR_HEAP_QUERY_UNSUPPORTED_BORROWED_PROTOTYPE'});
 if(hostIntrinsics.has(prototype))return false;
 if(publicValues.has(prototype))return true;
 if(privatePrototypes.has(prototype))return false;
 const owners=prototypeOwners.get(prototype);if(owners&&[...owners].some(reference=>active(reference.deref())))return true;
 // GetCreationContext can follow a foreign prototype map, so it cannot reject
 // an ordinary page-authored Object.create(DOMPrototype) value. Known private
 // implementation prototypes are denied by exact factory-owned identity.
 return true;
}
export function canonicalizeHeapResult(raw,{maxPublicResults=100000,deadline=Infinity}={}){
 const array=raw.objects,length=own(array,'length').value,seen=new Set();let count=0,filtered=0;
 for(let index=0;index<length;index++){
  if(performance.now()>deadline)throw Object.assign(Error('ERR_HEAP_QUERY_TIMEOUT'),{code:'ERR_HEAP_QUERY_TIMEOUT'});
  const value=own(array,String(index)).value,registered=canonical.has(value),publicValue=registered?canonical.get(value):value;
  // Only exact objects tagged private by their real host factory are omitted.
  // Creation-context inference would drop legitimate foreign-prototype objects.
  if(privateValues.has(publicValue)||(!registered&&privateValues.has(value))){filtered++;continue}
  if(seen.has(publicValue))continue;
  if(count===maxPublicResults)throw Object.assign(Error('ERR_HEAP_QUERY_PUBLIC_RESULT_LIMIT'),{code:'ERR_HEAP_QUERY_PUBLIC_RESULT_LIMIT'});
  seen.add(publicValue);if(!define(array,String(count++),{value:publicValue,enumerable:true,writable:true,configurable:true}))throw Error('Heap result could not be finalized');
 }
 if(!define(array,'length',{value:count}))throw Error('Heap result length could not be finalized');
 return {...raw,objects:array,publicMatches:count,filtered};
}
export function heapRegistryStatistics(){return {registrations}}
