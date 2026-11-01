// Genuine selected-VM publication of the measured manual Document entries.
// Original operations/backends stay Host-private; recorded Browser/utility
// documents use only successful private factory provenance for receiver checks.
import vm from'node:vm';
import{createRequire}from'node:module';
import{platformFactoryRecord}from'./platform-factories.js';
import{captureIDLMemberFactory}from'./public-idl-member.js';
const require=createRequire(import.meta.url),DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const apply=Reflect.apply,define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor,ordinaryHasInstance=Function.prototype[Symbol.hasInstance];
const isDocument=implementation=>apply(ordinaryHasInstance,DocumentImpl,[implementation]);
export function captureDocumentMemberFactory(window){
 const member=captureIDLMemberFactory(window),owner=platformFactoryRecord(window.document)?.implementation,ErrorConstructor=window.TypeError;
 // Standalone installers may predate factory observation. Preserve their real
 // existing operations rather than infer a private brand from authored slots.
 if(!isDocument(owner)||!vm.isContext(owner._globalObject))return member;
 return(name,slot,operation)=>{
  const guarded=({invoke(...args){
   if(!isDocument(platformFactoryRecord(this)?.implementation))throw new ErrorConstructor('Illegal invocation');
   return apply(operation,this,args);
  }}).invoke;
  define(guarded,'length',{value:operation.length,configurable:true});
  return member(name,slot,guarded);
 };
}
export function installDocumentXPathEntries(window){
 const member=captureDocumentMemberFactory(window),owner=platformFactoryRecord(window.document)?.implementation;
 const owned=isDocument(owner)&&vm.isContext(owner._globalObject);
 for(const name of ['createExpression','createNSResolver','evaluate']){
  const original=descriptor(window.Document.prototype,name);
  if(typeof original?.value!=='function')throw new TypeError('A genuine installed XPath Document operation is required');
  let operation=original.value;
  if(name==='evaluate'&&owned){
   // Document supplies its genuine receiver only for the measured absent/null
   // context. Explicit contexts and the evaluator API retain their own path.
   // captureDocumentMemberFactory checks the real Document before this runs.
   operation=({evaluate(...args){
    if(args[1]===null||args[1]===undefined)args[1]=this;
    return apply(original.value,this,args);
   }}).evaluate;
   define(operation,'length',{value:original.value.length,configurable:true});
  }
  const value=member(name,'value',operation);
  // Measured Native Document mixin functions are distinct from evaluator
  // methods and all have one required parameter. Backend arguments stay real.
  if(value!==original.value)define(value,'length',{value:1,configurable:true});
  define(window.Document.prototype,name,{...original,value});
 }
}
