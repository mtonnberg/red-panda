import {cloneObjectKind} from './clone-object-kind.js';
import {types} from 'node:util';
import {cryptoKeyRecord,deserializeCryptoKey} from './web-crypto.js';
import {platformFactoryRecord} from './platform-factories.js';
const apply=Reflect.apply,keys=Object.keys,define=Object.defineProperty;
const typed=Object.getPrototypeOf(Uint8Array.prototype),getter=(p,k)=>Object.getOwnPropertyDescriptor(p,k).get;
const typedName=getter(typed,Symbol.toStringTag),typedBuffer=getter(typed,'buffer'),typedOffset=getter(typed,'byteOffset'),typedLength=getter(typed,'length');
const dataBuffer=getter(DataView.prototype,'buffer'),dataOffset=getter(DataView.prototype,'byteOffset'),dataLength=getter(DataView.prototype,'byteLength');
const bufferLength=getter(ArrayBuffer.prototype,'byteLength'),dateTime=Date.prototype.getTime;
const mapEntries=Map.prototype.entries,mapSet=Map.prototype.set,setValues=Set.prototype.values,setAdd=Set.prototype.add;
const regexpSource=getter(RegExp.prototype,'source'),regexpFlags=[['hasIndices','d'],['global','g'],['ignoreCase','i'],['multiline','m'],['dotAll','s'],['unicode','u'],['unicodeSets','v'],['sticky','y']].map(([name,flag])=>[Object.getOwnPropertyDescriptor(RegExp.prototype,name)?.get,flag]).filter(([get])=>get);
const names=['Object','Array','ArrayBuffer','Map','Set','Date','RegExp','DataView','Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float16Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','Error','EvalError','RangeError','ReferenceError','SyntaxError','TypeError','URIError'];
export function createIndexedDBClone(realm){
 const target=Object.create(null),host=Object.create(null);for(const name of names){if(typeof realm[name]==='function')target[name]=realm[name];if(typeof globalThis[name]==='function')host[name]=globalThis[name];}
 const Exception=realm.DOMException;
 const fail=()=>{throw new Exception('The object can not be cloned','DataCloneError');};
 function copy(value,toRealm,seen){
  if(typeof value==='symbol'||typeof value==='function')return fail();
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  if(types.isProxy(value)||types.isSharedArrayBuffer(value))return fail();
  if(toRealm&&types.isCryptoKey(value)){const result=deserializeCryptoKey(realm,{kind:'CryptoKey',key:value});seen.set(value,result);return result;}
  const crypto=cryptoKeyRecord(value);if(crypto){seen.set(value,crypto.key);return crypto.key;}
  if(types.isCryptoKey(value)){seen.set(value,value);return value;}
  if(platformFactoryRecord(value)||types.isPromise(value)||types.isWeakMap(value)||types.isWeakSet(value)||types.isExternal(value)||types.isGeneratorObject(value)||types.isMapIterator(value)||types.isSetIterator(value))return fail();
  const C=toRealm?target:host;
  if(types.isArrayBuffer(value)){const result=new C.ArrayBuffer(apply(bufferLength,value,[]));seen.set(value,result);new Uint8Array(result).set(new Uint8Array(value));return result;}
  if(ArrayBuffer.isView(value)){
   const data=types.isDataView(value),buffer=apply(data?dataBuffer:typedBuffer,value,[]),offset=apply(data?dataOffset:typedOffset,value,[]),length=apply(data?dataLength:typedLength,value,[]),name=data?'DataView':apply(typedName,value,[]);
   if(!C[name])return fail();const result=new C[name](copy(buffer,toRealm,seen),offset,length);seen.set(value,result);return result;
  }
  if(types.isDate(value)){const result=new C.Date(apply(dateTime,value,[]));seen.set(value,result);return result;}
  if(types.isRegExp(value)){const result=new C.RegExp(apply(regexpSource,value,[]),regexpFlags.filter(([get])=>apply(get,value,[])).map(([,flag])=>flag).join(''));seen.set(value,result);return result;}
  if(types.isMap(value)){const result=new C.Map();seen.set(value,result);for(const[key,item]of apply(mapEntries,value,[]))apply(mapSet,result,[copy(key,toRealm,seen),copy(item,toRealm,seen)]);return result;}
  if(types.isSet(value)){const result=new C.Set();seen.set(value,result);for(const item of apply(setValues,value,[]))apply(setAdd,result,[copy(item,toRealm,seen)]);return result;}
  if(types.isNativeError(value)){const name=['EvalError','RangeError','ReferenceError','SyntaxError','TypeError','URIError'].includes(value.name)?value.name:'Error';const result=new C[name](value.message);seen.set(value,result);if(Object.hasOwn(value,'cause'))define(result,'cause',{value:copy(value.cause,toRealm,seen),writable:true,configurable:true});return result;}
  if(types.isBoxedPrimitive(value)||types.isAnyArrayBuffer(value)||!['Object','Array'].includes(cloneObjectKind(value)))return fail();
  const result=Array.isArray(value)?new C.Array(value.length):new C.Object();seen.set(value,result);for(const key of keys(value))define(result,key,{value:copy(value[key],toRealm,seen),enumerable:true,writable:true,configurable:true});return result;
 }
 return Object.assign(Object.create(null),{toHost:value=>copy(value,false,new Map()),toRealm:value=>copy(value,true,new Map())});
}
