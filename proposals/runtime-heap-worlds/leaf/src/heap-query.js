import vm from 'node:vm';
import { nameForVMContext,isOwnedVMContextName } from './context-names.js';
import { getHeapBinding } from './native-heap.js';
import { authorizeHeapRealm,authorizeHeapPrototype,canonicalizeHeapResult,assertHeapFactoryObservations } from './heap-registry.js';
const defaults={maxRawResults:100000,maxPublicResults:100000,maxVisited:2000000,maxPrototypeDepth:4096,timeoutMs:10000};
export function queryHeapObjects(prototype,context,options={},expectedContextId){
 assertHeapFactoryObservations();
 const name=nameForVMContext(context);if(!name||!isOwnedVMContextName(name))throw Error('ERR_HEAP_QUERY_UNOWNED_CONTEXT');
 const limits={...defaults},hard={maxRawResults:500000,maxPublicResults:500000,maxVisited:5000000,maxPrototypeDepth:16384,timeoutMs:60000};
 for(const key of Reflect.ownKeys(options)){const descriptor=Object.getOwnPropertyDescriptor(options,key);if(typeof key!=='string'||!Object.hasOwn(defaults,key)||!descriptor||!('value'in descriptor))throw Error('ERR_HEAP_QUERY_ARGUMENT');limits[key]=descriptor.value}
 for(const [key,value]of Object.entries(limits))if(!Number.isSafeInteger(value)||value<1||value>hard[key])throw Error('ERR_HEAP_QUERY_ARGUMENT: '+key);
 const anchor=vm.runInContext('[]',context),binding=getHeapBinding();if(!authorizeHeapRealm(anchor,expectedContextId))throw Error('ERR_HEAP_QUERY_UNSUPPORTED_REALM');if(!authorizeHeapPrototype(prototype,anchor))throw Error('ERR_HEAP_QUERY_UNOWNED_PROTOTYPE');
 const deadline=performance.now()+limits.timeoutMs;
 const raw=binding.queryObjects(prototype,anchor,limits.maxRawResults,limits.maxVisited,limits.maxPrototypeDepth,limits.timeoutMs);
 return canonicalizeHeapResult(raw,{maxPublicResults:limits.maxPublicResults,deadline,selectedAnchor:anchor});
}
export function runHeapQuery(session,params){
 if(!params||typeof params.prototypeObjectId!=='string'||(params.objectGroup!==undefined&&typeof params.objectGroup!=='string'))throw Object.assign(Error('Invalid parameters'),{code:-32602});
 const entry=session.objects.get(params.prototypeObjectId);if(!entry)throw Object.assign(Error('Invalid remote object id'),{code:-32000});
 const page=session.executionPage(entry.contextId);
 if(entry.contextId!==page.executionContextId)throw Object.assign(Error('Runtime.queryObjects requires an actual VM realm; isolated-world aliases are unsupported'),{code:-32601});
 let result;
 try { result=queryHeapObjects(entry.value,page.dom.getInternalVMContext(),session.heapQueryLimits,entry.contextId); }
 catch(error){const code=Object.getOwnPropertyDescriptor(error,'code')?.value;throw Object.assign(Error(error.message),{code:-32000,data:{kind:typeof code==='string'?code:'ERR_HEAP_QUERY_BACKEND'}})}
 if(page.closed||entry.contextId!==page.executionContextId)throw Object.assign(Error('Execution context was destroyed'),{code:-32000});
 return {objects:session.remote(result.objects,false,params.objectGroup,entry.contextId)};
}
