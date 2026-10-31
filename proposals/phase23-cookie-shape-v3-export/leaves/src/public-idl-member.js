// Public nonconstructible entries are created in their real selected VM before
// publication. Their original operations and state remain Host-private.
import vm from 'node:vm';
import{createRequire}from'node:module';
import{getRuntimeBinding}from'./native-runtime.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const apply=Reflect.apply,define=Object.defineProperty;
export function captureIDLMemberFactory(window){
 const context=utils.implForWrapper(window.document)?._globalObject;
 // Genuine non-scriptable JSDOM is already Host. Do not invent a VM or load
 // a native public entry for that case. Raw owned contexts need their explicit
 // immutable RealmHandle/native-entry authority at the canonical dispatcher.
 if(!context||!vm.isContext(context))return(_name,_slot,operation)=>operation;
 const binding=getRuntimeBinding(),global=window;
 return(name,slot,operation)=>{
  if(typeof operation!=='function'||!['value','get','set'].includes(slot))throw new TypeError('A genuine IDL operation and descriptor slot are required');
  const value=binding.createEntry((_caller,receiver,args)=>apply(operation,receiver,args),global,slot==='value'?name:slot+' '+name);
  define(value,'length',{value:operation.length,configurable:true});
  return value;
 };
}
