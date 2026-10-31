// Successful Node allocation/producer callsites used by worker public APIs.
// These records, not copied Node handle symbols or prototypes, confer brands.
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { registerPlatformFactory, platformFactoryRecord } from './platform-factories.js';
const apply=Reflect.apply,construct=Reflect.construct,define=Object.defineProperty,getPrototype=Object.getPrototypeOf,setPrototype=Object.setPrototypeOf;
const size=Object.getOwnPropertyDescriptor(NativeBlob.prototype,'size').get,type=Object.getOwnPropertyDescriptor(NativeBlob.prototype,'type').get;
const name=Object.getOwnPropertyDescriptor(NativeFile.prototype,'name').get,modified=Object.getOwnPropertyDescriptor(NativeFile.prototype,'lastModified').get;
const slice=NativeBlob.prototype.slice,then=Promise.prototype.then;
const privateBlobPrototype=Object.create(getPrototype(NativeBlob.prototype),Object.getOwnPropertyDescriptors(NativeBlob.prototype));
const nativeForm=globalThis.FormData,formEntries=nativeForm?.prototype.entries;
const iteratorPrototype=formEntries?getPrototype(apply(formEntries,new nativeForm(),[])):null,iteratorNext=iteratorPrototype?.next;
const formAppend=nativeForm?.prototype.append,formSet=nativeForm?.prototype.set;
const readers=[globalThis.Request,globalThis.Response].filter(Boolean).map(C=>({prototype:C.prototype,blob:C.prototype.blob,formData:C.prototype.formData}));
const installed=new WeakMap();
let methodsInstalled=false;

/** Call only at a trusted successful native factory/producer return. */
export function registerNativeBlobFactory(value,{kind='Blob',globalObject=globalThis}={}){
 if(platformFactoryRecord(value))return value;
 const length=apply(size,value,[]),mime=apply(type,value,[]);
 const immutable=apply(slice,value,[0,length,mime]);setPrototype(immutable,privateBlobPrototype);
 const extra=kind==='File'?{name:apply(name,value,[]),lastModified:apply(modified,value,[])}:{};
 registerPlatformFactory(value,{kind,globalObject,read:()=>({kind,blob:immutable,type:mime,...extra})});return value;
}
function formValues(value){
 const values=new Set(),iterator=apply(formEntries,value,[]);
 while(true){const step=apply(iteratorNext,iterator,[]);if(step.done)break;values.add(step.value[1]);}
 return values;
}
function captureForm(value,realm,skip=new Set()){
 registerPlatformFactory(value,{kind:'FormData',globalObject:realm});
 const iterator=apply(formEntries,value,[]);
 while(true){const step=apply(iteratorNext,iterator,[]);if(step.done)break;const file=step.value[1];if(typeof file==='object'&&file!==null&&!skip.has(file)&&!platformFactoryRecord(file))registerNativeBlobFactory(file,{kind:'File',globalObject:realm});}
 return value;
}
export function installNativePlatformFactories(realm){
 if(installed.has(realm))return installed.get(realm);
 // DOM windows keep their actual generated constructors and setup hooks.
 if(realm.Blob!==NativeBlob)return null;
 const FunctionPrototype=realm.Function.prototype;
 let Blob,File,Form;
 const wrap=(Target,kind,parent)=>new Proxy(Target,{
  construct(target,args,newTarget){const value=construct(target,args,newTarget);if(kind==='FormData')return captureForm(value,realm);return registerNativeBlobFactory(value,{kind,globalObject:realm});},
  get(target,key,receiver){return key==='constructor'?realm.Function:Reflect.get(target,key,receiver);},
  getPrototypeOf(target){return Object.isExtensible(target)?parent():getPrototype(target);},
 });
 Blob=wrap(NativeBlob,'Blob',()=>FunctionPrototype);File=wrap(NativeFile,'File',()=>Blob);
 define(realm,'Blob',{value:Blob,configurable:true,writable:true});define(realm,'File',{value:File,configurable:true,writable:true});
 define(NativeBlob.prototype,'constructor',{value:Blob,writable:true,configurable:true});define(NativeFile.prototype,'constructor',{value:File,writable:true,configurable:true});
 if(nativeForm&&realm.FormData===nativeForm){Form=wrap(nativeForm,'FormData',()=>FunctionPrototype);define(realm,'FormData',{value:Form,configurable:true,writable:true});define(nativeForm.prototype,'constructor',{value:Form,writable:true,configurable:true});}
 if(!methodsInstalled){
  methodsInstalled=true;
  define(NativeBlob.prototype,'slice',{configurable:true,writable:true,value:function(...args){return registerNativeBlobFactory(apply(slice,this,args),{globalObject:realm});}});
  for(const {prototype,blob,formData}of readers){
   if(blob)define(prototype,'blob',{configurable:true,writable:true,value:function(...args){return apply(then,apply(blob,this,args),[value=>registerNativeBlobFactory(value,{globalObject:realm})]);}});
   if(formData)define(prototype,'formData',{configurable:true,writable:true,value:function(...args){return apply(then,apply(formData,this,args),[value=>captureForm(value,realm)]);}});
  }
  for(const[key,original]of[['append',formAppend],['set',formSet]])if(original)define(nativeForm.prototype,key,{configurable:true,writable:true,value:function(...args){
   const existing=formValues(this);existing.add(args[1]);
   const result=apply(original,this,args);
   // Native normalization may return the same supplied File: that is not a
   // fresh allocation and must not authenticate an unregistered lookalike.
   captureForm(this,realm,existing);return result;
  }});
 }
 const controller={Blob,File,FormData:Form};installed.set(realm,controller);return controller;
}
