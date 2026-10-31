// Real Node cryptography, with independent realm-local Web IDL conversion and
// wrappers. No public metadata object is used to authorize a key operation.
import { webcrypto, createHash, createECDH, randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { registerPlatformFactoryKind } from './platform-factory-hooks.js';
import { registerPlatformFactory, platformFactoryRecord } from './platform-factories.js';
import { captureDOMExceptionFactory } from './worker-dom-exception.js';

const keyStates=new WeakMap(),subtles=new WeakSet(),cryptos=new WeakMap(),installed=new WeakMap();
const typed=Object.getPrototypeOf(Uint8Array.prototype),get=(p,k)=>Object.getOwnPropertyDescriptor(p,k).get;
const bufferLength=get(ArrayBuffer.prototype,'byteLength');
const typedBuffer=get(typed,'buffer'),typedOffset=get(typed,'byteOffset'),typedLength=get(typed,'byteLength');
const dataBuffer=get(DataView.prototype,'buffer'),dataOffset=get(DataView.prototype,'byteOffset'),dataLength=get(DataView.prototype,'byteLength');
const hashes=['SHA-1','SHA-256','SHA-384','SHA-512'];
const aes=['AES-CTR','AES-CBC','AES-GCM','AES-KW'],rsa=['RSA-OAEP','RSASSA-PKCS1-v1_5','RSA-PSS'],ec=['ECDSA','ECDH'];
const names=[...hashes,...aes,...rsa,...ec,'HMAC','HKDF','PBKDF2','Ed25519','X25519','Ed448','X448'];
const asciiLower=value=>value.replace(/[A-Z]/g,character=>character.toLowerCase());
const usageSets={HMAC:['sign','verify'],ECDSA:['sign','verify'],Ed25519:['sign','verify'],Ed448:['sign','verify'],ECDH:['deriveKey','deriveBits'],X25519:['deriveKey','deriveBits'],X448:['deriveKey','deriveBits'],HKDF:['deriveKey','deriveBits'],PBKDF2:['deriveKey','deriveBits'],'RSA-OAEP':['encrypt','decrypt','wrapKey','unwrapKey'],'RSA-PSS':['sign','verify'],'RSASSA-PKCS1-v1_5':['sign','verify'],'AES-KW':['wrapKey','unwrapKey']};
const supported={digest:hashes,generateKey:[...aes,...rsa,...ec,'HMAC','Ed25519','X25519'],importKey:[...aes,...rsa,...ec,'HMAC','HKDF','PBKDF2','Ed25519','X25519'],encrypt:['AES-CTR','AES-CBC','AES-GCM','RSA-OAEP'],decrypt:['AES-CTR','AES-CBC','AES-GCM','RSA-OAEP'],wrapKey:[...aes,'RSA-OAEP'],unwrapKey:[...aes,'RSA-OAEP'],sign:['HMAC','RSASSA-PKCS1-v1_5','RSA-PSS','ECDSA','Ed25519'],verify:['HMAC','RSASSA-PKCS1-v1_5','RSA-PSS','ECDSA','Ed25519'],deriveBits:['HKDF','PBKDF2','ECDH','X25519'],deriveKey:[...aes,'HMAC','HKDF','PBKDF2']};
supported.generateKey.push('Ed448','X448');
function schema(name,operation){
 if(operation==='generateKey'||operation==='deriveKey'){
  if(aes.includes(name))return[['length','u16',true]];
  if(name==='HMAC')return[['hash','hash',true],['length','u32',false]];
  if(rsa.includes(name))return[['hash','hash',true],['modulusLength','u32',true],['publicExponent','bigint',true]];
  if(ec.includes(name))return[['namedCurve','string',true]];
 }else if(operation==='importKey'){
  if(name==='HMAC')return[['hash','hash',true],['length','u32',false]];
  if(rsa.includes(name))return[['hash','hash',true]];
  if(ec.includes(name))return[['namedCurve','string',true]];
 }else if(['encrypt','decrypt','wrapKey','unwrapKey'].includes(operation)){
  if(name==='AES-CTR')return[['counter','buffer',true],['length','u8',true]];
  if(name==='AES-CBC')return[['iv','buffer',true]];
  if(name==='AES-GCM')return[['additionalData','buffer',false],['iv','buffer',true],['tagLength','u8',false]];
  if(name==='RSA-OAEP')return[['label','buffer',false]];
 }else if(operation==='sign'||operation==='verify'){
  if(name==='RSA-PSS')return[['saltLength','u32',true]];
  if(name==='ECDSA')return[['hash','hash',true]];
 }else if(operation==='deriveBits'){
  if(name==='HKDF')return[['hash','hash',true],['info','buffer',true],['salt','buffer',true]];
  if(name==='PBKDF2')return[['hash','hash',true],['iterations','u32',true],['salt','buffer',true]];
  if(name==='ECDH'||name==='X25519'||name==='X448')return[['public','key',true]];
 }
 return[];
}
function bufferInfo(value){
 if(types.isArrayBuffer(value))return{buffer:value,offset:0,length:bufferLength.call(value)};
 if(types.isSharedArrayBuffer(value))return null;
 if(types.isDataView(value)){const buffer=dataBuffer.call(value);if(types.isSharedArrayBuffer(buffer))return null;try{return{buffer,offset:dataOffset.call(value),length:dataLength.call(value)}}catch{return{buffer,offset:0,length:0}}}
 if(ArrayBuffer.isView(value)){const buffer=typedBuffer.call(value);if(types.isSharedArrayBuffer(buffer))return null;return{buffer,offset:typedOffset.call(value),length:typedLength.call(value)}}
 return null;
}
function snapshot(value){const info=bufferInfo(value);if(!info)throw new TypeError('invalid argument');return info.length?new Uint8Array(info.buffer,info.offset,info.length).slice():new Uint8Array()}
function entireDER(bytes){
 if(bytes[0]!==0x30||bytes.length<2)return false;
 let length=bytes[1],offset=2;
 if(length>=128){const count=length&127;if(!count||count>4||offset+count>bytes.length||bytes[offset]===0)return false;length=0;for(let i=0;i<count;i++)length=length*256+bytes[offset++];if(length<128)return false;}
 return offset+length===bytes.length;
}
function rsaInteger(value){
 if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))return null;
 const bytes=Buffer.from(value,'base64url');if(!bytes.length||!bytes[0]||bytes.toString('base64url')!==value)return null;
 return BigInt('0x'+bytes.toString('hex'));
}
function validRSAJwk(jwk){
 const n=rsaInteger(jwk.n),e=rsaInteger(jwk.e);if(n===null||e===null||e<3n||!(e&1n))return false;
 if(jwk.d===undefined)return true;
 const fields=['d','p','q','dp','dq','qi'],values=fields.map(name=>rsaInteger(jwk[name]));if(values.some(value=>value===null))return false;
 const[d,p,q,dp,dq,qi]=values;if(p<=1n||q<=1n||p*q!==n||d%(p-1n)!==dp||d%(q-1n)!==dq||(q*qi)%p!==1n)return false;
 const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next}return a};
 return(d*e)%((p-1n)*(q-1n)/gcd(p-1n,q-1n))===1n;
}
function validECJwk(jwk,curve){
 const parameters={'P-256':['prime256v1',32],'P-384':['secp384r1',48],'P-521':['secp521r1',66]}[curve];if(!parameters)return true;
 const decode=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))return null;const bytes=Buffer.from(value,'base64url');return bytes.length===parameters[1]&&bytes.toString('base64url')===value?bytes:null};
 const x=decode(jwk.x),y=decode(jwk.y);if(!x||!y)return false;if(jwk.d===undefined)return true;
 const d=decode(jwk.d);if(!d)return false;
 try{const key=createECDH(parameters[0]);key.setPrivateKey(d);const point=key.getPublicKey();return point.subarray(1,1+parameters[1]).equals(x)&&point.subarray(1+parameters[1]).equals(y)}catch{return false}
}
const domMessages={NotSupportedError:'The operation is not supported',OperationError:'The operation failed for an operation-specific reason',SyntaxError:'The string did not match the expected pattern',DataError:'Data provided to an operation does not meet requirements',InvalidAccessError:'The object does not support the operation or argument',TypeMismatchError:'The type of an object was incompatible with the expected type of the parameter associated to the object',QuotaExceededError:'The quota has been exceeded'};

function factory(g,bridge){
 'use strict';
 const TypeError=g.TypeError,Exception=g.DOMException,Promise=g.Promise,Array=g.Array,Bytes=g.Uint8Array,String=g.String;
 const define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,keys=g.Object.keys,create=g.Object.create,apply=g.Reflect.apply,has=g.Reflect.has,finite=g.Number.isFinite,trunc=g.Math.trunc;
 const description=descriptor(g.Symbol.prototype,'description').get,iterator=g.Symbol.iterator;
 const string=value=>typeof value==='symbol'?apply(description,value,[])??'':String(value);
 const invalid=message=>new TypeError(message??'invalid argument');
 const failure=name=>bridge.exception(name);
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 const put=(target,key,value)=>define(target,key,{value,writable:true,enumerable:true,configurable:true});
 function copy(value,sort=false){
  if(bridge.isBytes(value)){const bytes=new Bytes(value.length);for(let i=0;i<value.length;i++)bytes[i]=value[i];return bytes}
  if(bridge.isBuffer(value)){const data=new Bytes(value.byteLength),source=bridge.bytes(value);for(let i=0;i<source.length;i++)data[i]=source[i];return data.buffer}
  if(bridge.isArray(value)){const result=new Array(value.length);for(let i=0;i<value.length;i++)put(result,i,copy(value[i],sort));return result}
  if(value===null||typeof value!=='object')return value;
  const result={},names=bridge.keys(value,sort);for(let i=0;i<names.length;i++)put(result,names[i],copy(value[names[i]],sort));return result;
 }
 function CryptoKey(){throw invalid('Illegal Constructor')}
 const keyPrototype=CryptoKey.prototype;delete keyPrototype.constructor;define(CryptoKey,'prototype',{writable:false});
 for(const name of['type','extractable','algorithm','usages']){const accessor={[`get ${name}`](){if(!bridge.hasKey(this))throw invalid('Illegal invocation');return bridge.readKey(this,name)}};define(keyPrototype,name,{get:accessor[`get ${name}`],enumerable:true,configurable:true})}
 define(keyPrototype,'constructor',{value:CryptoKey,writable:true,configurable:true});define(keyPrototype,g.Symbol.toStringTag,{value:'CryptoKey',configurable:true});
 function wrapKey(key){const value=create(keyPrototype),metadata=bridge.metadata(key);bridge.storeKey(value,key,copy(metadata.algorithm),copy(metadata.usages));return value}
 function present(value,name,required){const item=object(value)&&has(value,name)?value[name]:undefined;if(item===undefined&&required)throw invalid('algorithm has a missing or invalid member');return item}
 function number(value,bits){const n=+value;if(!finite(n)||n<0||n>2**bits-1)throw invalid('algorithm has a missing or invalid member');return trunc(n)}
 function algorithm(value,operation){
  let raw=object(value)?present(value,'name',false):value;
  if(object(value)&&raw===undefined)throw invalid('required member name is undefined');
  const name=bridge.name(string(raw),operation);if(!name)throw failure('NotSupportedError');
  const result=create(null);put(result,'name',name);const fields=bridge.schema(name,operation),buffers=[];
  for(let i=0;i<fields.length;i++){
   const[field,type,required]=fields[i];let item=present(value,field,required);if(item===undefined)continue;
   if(type==='hash')item=algorithm(item,'digest');
   else if(type==='string')item=string(item);
   else if(type==='buffer'){if(!bridge.buffer(item))throw invalid('algorithm has a missing or invalid member');put(buffers,buffers.length,field)}
   else if(type==='bigint'){if(!bridge.isBytes(item)||!bridge.buffer(item))throw invalid('algorithm has a missing or invalid member');put(buffers,buffers.length,field)}
   else if(type==='key'){if(!bridge.hasKey(item))throw invalid('algorithm has a missing or invalid member')}
   else item=number(item,+type.slice(1));
   put(result,field,item);
  }
  for(let i=0;i<buffers.length;i++){const field=buffers[i];put(result,field,bridge.snapshot(result[field]))}
  return result;
 }
 function usages(value){
  if(value==null||!object(value)&&typeof value!=='string')throw invalid();const method=value[iterator];if(typeof method!=='function')throw invalid();
  const result=[];const it=apply(method,value,[]),advance=it.next;while(true){const next=apply(advance,it,[]);if(!object(next))throw invalid();if(next.done)break;put(result,result.length,string(next.value))}return result;
 }
 function jwk(value){const result=create(null),fields=bridge.jwkFields;for(let i=0;i<fields.length;i++){const field=fields[i];if(!has(value,field))continue;const item=value[field];if(item===undefined)continue;put(result,field,field==='ext'?!!item:field==='key_ops'?usages(item):field==='oth'?item:string(item))}return result}
 function format(value){value=string(value);if(!bridge.format(value))throw invalid('invalid key format');return value}
 function checkBuffer(value,message){if(!bridge.buffer(value))throw invalid(message);return value}
 function key(value){if(!bridge.hasKey(value))throw invalid();return value}
 function prepare(operation,args){
  const result=[];const count={generateKey:3,importKey:5,exportKey:2,encrypt:3,decrypt:3,wrapKey:4,unwrapKey:7,sign:3,verify:4,deriveBits:2,deriveKey:5,digest:2}[operation];if(args.length<count)throw invalid();
  if(operation==='generateKey'){const u=usages(args[2]);return[algorithm(args[0],operation),!!args[1],u]}
  if(operation==='importKey'){
   const f=format(args[0]),data=args[1];if(!object(data))throw invalid('keyData is neither a BufferSource nor a JsonWebKey');
   const b=bridge.buffer(data);if(bridge.shared(data))throw invalid('expected an ArrayBuffer or ArrayBufferView');const u=usages(args[4]),a=algorithm(args[2],operation);
   if(f!=='jwk'&&!b)throw invalid('raw format expects a BufferSource');if(f==='jwk'&&b)throw invalid('jwk format expects a JsonWebKey');
   const input=b?bridge.snapshot(data):jwk(data);return[f,input,a,!!args[3],u];
  }
  if(operation==='exportKey')return[format(args[0]),key(args[1])];
  if(operation==='digest'){checkBuffer(args[1]);const a=algorithm(args[0],operation);return[a,bridge.snapshot(args[1])]}
  if(operation==='encrypt'||operation==='decrypt'||operation==='sign'){const k=key(args[1]);checkBuffer(args[2]);const a=algorithm(args[0],operation);return[a,k,bridge.snapshot(args[2])]}
  if(operation==='verify'){const k=key(args[1]);checkBuffer(args[2]);checkBuffer(args[3]);const a=algorithm(args[0],operation);return[a,k,bridge.snapshot(args[2]),bridge.snapshot(args[3])]}
  if(operation==='deriveBits'){const k=key(args[1]);const length=args[2]==null?null:number(args[2],32);return[algorithm(args[0],operation),k,length]}
  if(operation==='deriveKey'){const k=key(args[1]),u=usages(args[4]);return[algorithm(args[0],'deriveBits'),k,algorithm(args[2],operation),!!args[3],u]}
  if(operation==='wrapKey'){const f=format(args[0]),k=key(args[1]),w=key(args[2]);return[f,k,w,algorithm(args[3],operation)]}
  const f=format(args[0]);checkBuffer(args[1]);const k=key(args[2]),u=usages(args[6]),a=algorithm(args[3],operation),target=algorithm(args[4],'importKey');return[f,bridge.snapshot(args[1]),k,a,target,!!args[5],u];
 }
 function reify(value){if(bridge.nativeKey(value))return wrapKey(value);if(bridge.pair(value))return{publicKey:wrapKey(value.publicKey),privateKey:wrapKey(value.privateKey)};return copy(value,true)}
 function request(receiver,operation,args){return new Promise((resolve,reject)=>{try{if(!bridge.hasSubtle(receiver))throw invalid();const prepared=prepare(operation,args),result=bridge.operate(operation,prepared);if(result.async)result.promise.then(value=>{try{resolve(reify(value))}catch(e){reject(e)}},error=>reject(bridge.error(error)));else resolve(reify(result.value))}catch(error){reject(error)}})}
 function SubtleCrypto(){throw invalid('Illegal Constructor')}
 const p=SubtleCrypto.prototype;delete p.constructor;define(SubtleCrypto,'prototype',{writable:false});
 const methods={generateKey(algorithm,extractable,keyUsages){return request(this,'generateKey',arguments)},importKey(format,keyData,algorithm,extractable,keyUsages){return request(this,'importKey',arguments)},exportKey(format,key){return request(this,'exportKey',arguments)},encrypt(algorithm,key,data){return request(this,'encrypt',arguments)},decrypt(algorithm,key,data){return request(this,'decrypt',arguments)},wrapKey(format,key,wrappingKey,wrapAlgorithm){return request(this,'wrapKey',arguments)},unwrapKey(format,wrappedKey,unwrappingKey,unwrapAlgorithm,unwrappedKeyAlgorithm,extractable,keyUsages){return request(this,'unwrapKey',arguments)},sign(algorithm,key,data){return request(this,'sign',arguments)},verify(algorithm,key,signature,data){return request(this,'verify',arguments)},deriveBits(algorithm,baseKey){return request(this,'deriveBits',arguments)},deriveKey(algorithm,baseKey,derivedKeyType,extractable,keyUsages){return request(this,'deriveKey',arguments)},digest(algorithm,data){return request(this,'digest',arguments)}};
 for(const name of keys(methods))define(p,name,{value:methods[name],writable:true,enumerable:true,configurable:true});define(p,'constructor',{value:SubtleCrypto,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:'SubtleCrypto',configurable:true});
 const subtle=create(p);bridge.subtle(subtle);
 let crypto=g.crypto;
 if(typeof g.Crypto!=='function'||!object(crypto)){
  function Crypto(){throw invalid('Illegal Constructor')}
  const p=Crypto.prototype;const random={getRandomValues(array){if(!bridge.hasCrypto(this))throw invalid('Illegal invocation');return bridge.random(array)},randomUUID(){if(!bridge.hasCrypto(this))throw invalid('Illegal invocation');return bridge.uuid()}};
  for(const name of keys(random))define(p,name,{value:random[name],writable:true,enumerable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:'Crypto',configurable:true});define(g,'Crypto',{value:Crypto,writable:true,configurable:true});crypto=create(p);
 }
 bridge.crypto(crypto,subtle);const random={getRandomValues(array){if(!bridge.hasCrypto(this))throw invalid('Illegal invocation');if(!bridge.buffer(array))throw invalid();return bridge.random(array)}};define(g.Crypto.prototype,'getRandomValues',{value:random.getRandomValues,writable:true,enumerable:true,configurable:true});
 const accessors={get subtle(){if(!bridge.hasCrypto(this))throw invalid('Illegal invocation');return bridge.getSubtle(this)}};define(g.Crypto.prototype,'subtle',{...descriptor(accessors,'subtle'),enumerable:true,configurable:true});
 define(g,'SubtleCrypto',{value:SubtleCrypto,writable:true,configurable:true});define(g,'CryptoKey',{value:CryptoKey,writable:true,configurable:true});define(g,'crypto',{get(){return crypto},enumerable:true,configurable:true});
 return{wrap:wrapKey};
}

export function installWebCrypto(realm,{evaluate=source=>realm.eval(source)}={}){
 if(installed.has(realm))return installed.get(realm);
 for(const name of['Crypto','SubtleCrypto','CryptoKey'])registerPlatformFactoryKind(name);
 const TypeError=realm.TypeError,exception=captureDOMExceptionFactory(realm);
 const fail=(name,message)=>name==='TypeError'?new TypeError(message??'invalid argument'):exception(domMessages[name]??'',name);
 const backendKey=value=>keyStates.get(value)?.key;
 function plain(value){if(keyStates.has(value))return backendKey(value);if(ArrayBuffer.isView(value)||types.isAnyArrayBuffer(value))return value;if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return Array.prototype.map.call(value,plain);const result=Object.create(null);for(const name of Object.keys(value))result[name]=plain(value[name]);return result}
 function nativeFormat(format,keyOrAlgorithm){if(format==='raw-private'||format==='raw-seed')throw fail('NotSupportedError');if(format!=='raw-secret'&&format!=='raw-public')return format;const algorithm=keyOrAlgorithm.name??keyOrAlgorithm.algorithm.name;if(format==='raw-secret'&&(aes.includes(algorithm)||['HMAC','HKDF','PBKDF2'].includes(algorithm)))return'raw';if(format==='raw-public'&&[...ec,'Ed25519','X25519','Ed448','X448'].includes(algorithm))return'raw';throw fail('NotSupportedError')}
 function preflight(operation,args){
  const generating=operation==='generateKey',importing=operation==='importKey';
  if(generating||importing){const a=args[generating?0:2],u=args[generating?2:4],allowed=usageSets[a.name]??['encrypt','decrypt','wrapKey','unwrapKey'];if(u.some(value=>!allowed.includes(value)))throw fail('SyntaxError');if(a.name==='Ed448'||a.name==='X448')throw fail(u.length?'NotSupportedError':'SyntaxError');if(a.modulusLength>4096||generating&&a.name==='HMAC'&&a.length>65536)throw fail('OperationError');}
  if(operation==='deriveKey'){
   const base=backendKey(args[1]);if(base.algorithm.name!==args[0].name||!base.usages.includes('deriveKey'))throw fail('InvalidAccessError');
   if(args[2].name==='HMAC'&&args[2].length===0)throw fail('TypeError','HMAC length must not be zero');
  }
  if((operation==='deriveBits'||operation==='deriveKey')&&args[0].name==='PBKDF2'){
   const a=args[0],target=operation==='deriveKey'?args[2]:null,bits=target?(target.name==='HKDF'||target.name==='PBKDF2'?null:target.length??(target.hash?.name==='SHA-384'||target.hash?.name==='SHA-512'?1024:512)):args[2],size={'SHA-1':160,'SHA-256':256,'SHA-384':384,'SHA-512':512}[a.hash.name];if(!bits||a.iterations>2**24||Math.ceil(bits/size)*a.iterations>2**24)throw fail('OperationError');
  }
  if(operation==='exportKey'){
   const k=backendKey(args[1]);if(k.algorithm.name==='HKDF'||k.algorithm.name==='PBKDF2')throw fail('NotSupportedError');if(!k.extractable)throw fail('InvalidAccessError');
   if(k.type==='private'&&((args[0]==='raw'||args[0]==='raw-public')&&!rsa.includes(k.algorithm.name)||args[0]==='spki')||k.type==='public'&&args[0]==='pkcs8')throw fail('InvalidAccessError');args[0]=nativeFormat(args[0],k);
  }
  if(operation==='importKey'){
   args[0]=nativeFormat(args[0],args[2]);
   if((args[0]==='spki'||args[0]==='pkcs8')&&!entireDER(args[1]))throw fail('DataError');
   if(args[0]==='jwk'&&rsa.includes(args[2].name)&&!validRSAJwk(args[1]))throw fail('DataError');
   if(args[0]==='jwk'&&ec.includes(args[2].name)&&!validECJwk(args[1],args[2].namedCurve))throw fail('DataError');
  }
  if(operation==='wrapKey'){
   const wrapper=backendKey(args[2]),target=backendKey(args[1]);if(wrapper.algorithm.name!==args[3].name||!wrapper.usages.includes('wrapKey'))throw fail('InvalidAccessError');
   if(target.algorithm.name==='HKDF'||target.algorithm.name==='PBKDF2')throw fail('NotSupportedError');if(!target.extractable)throw fail('InvalidAccessError');
   if(target.type==='private'&&(args[0]==='raw'||args[0]==='raw-public')&&!rsa.includes(target.algorithm.name))throw fail('InvalidAccessError');args[0]=nativeFormat(args[0],target);
  }
  if(operation==='unwrapKey'){const wrapper=backendKey(args[2]);if(wrapper.algorithm.name!==args[3].name||!wrapper.usages.includes('unwrapKey'))throw fail('InvalidAccessError');args[0]=nativeFormat(args[0],args[4]);if(args[3].name==='AES-KW'&&(args[1].byteLength<24||args[1].byteLength%8))throw fail('OperationError');}
 }
 const api=evaluate(`(${factory.toString()})`)(realm,{
  exception:name=>fail(name),message:name=>domMessages[name]??'',name(value,operation){const found=names.find(name=>asciiLower(name)===asciiLower(value));return supported[operation]?.includes(found)?found:null},schema,
  buffer:value=>!!bufferInfo(value),snapshot,isBuffer:types.isArrayBuffer,isBytes:types.isUint8Array,isArray:Array.isArray,bytes:value=>new Uint8Array(value),keys:(value,sort)=>sort?Object.keys(value).sort():Object.keys(value),
  shared:value=>types.isSharedArrayBuffer(value)||ArrayBuffer.isView(value)&&types.isSharedArrayBuffer(types.isDataView(value)?dataBuffer.call(value):typedBuffer.call(value)),
  format:value=>['raw','jwk','spki','pkcs8','raw-secret','raw-public','raw-private','raw-seed'].includes(value),
  hasKey:value=>keyStates.has(value),hasSubtle:value=>subtles.has(value),hasCrypto:value=>cryptos.has(value),nativeKey:types.isCryptoKey,pair:value=>!!value&&types.isCryptoKey(value.publicKey)&&types.isCryptoKey(value.privateKey),
  metadata:key=>({algorithm:key.algorithm,usages:key.usages}),
  storeKey(value,key,algorithm,usages){const state=Object.freeze(Object.assign(Object.create(null),{key,algorithm,usages}));keyStates.set(value,state);registerPlatformFactory(value,{kind:'CryptoKey',implementation:state,globalObject:realm,read:()=>({kind:'CryptoKey',key})})},
  readKey(value,name){const state=keyStates.get(value);return name==='algorithm'||name==='usages'?state[name]:state.key[name]},
  subtle(value){subtles.add(value);registerPlatformFactory(value,{kind:'SubtleCrypto',globalObject:realm})},crypto(value,subtle){cryptos.set(value,subtle)},getSubtle:value=>cryptos.get(value),
  jwkFields:['alg','crv','d','dp','dq','e','ext','k','key_ops','kty','n','p','q','qi','use','x','y'],
  random(value){if(!ArrayBuffer.isView(value))throw fail('TypeError');try{webcrypto.getRandomValues(value);return value}catch(error){throw fail(error.name,error.message)}},uuid:randomUUID,
  error:error=>fail(error.name==='TypeError'?'TypeError':error.name,error.name==='TypeError'?'invalid argument':undefined),
  operate(operation,args){
   preflight(operation,args);
   if(operation==='digest'){const bytes=createHash(args[0].name.toLowerCase().replace('-','')).update(args[1]).digest();return{async:false,value:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}
   if(operation==='verify'&&args[0].name==='RSA-PSS'){
    const key=backendKey(args[1]);if(key.algorithm.name!=='RSA-PSS'||key.type!=='public'||!key.usages.includes('verify'))throw fail('InvalidAccessError');
    const hashBytes={'SHA-1':20,'SHA-256':32,'SHA-384':48,'SHA-512':64}[key.algorithm.hash.name],encodedBytes=Math.ceil((key.algorithm.modulusLength-1)/8);
    // No RSA-PSS encoding can contain a salt longer than emLen-hLen-2.
    // Native verification treats this invalid parameter as a failed check.
    if(args[0].saltLength>encodedBytes-hashBytes-2)return{async:false,value:false};
   }
   const values=Array.prototype.map.call(args,plain);
   if(operation==='wrapKey'&&values[0]==='jwk'){
    // A real temporary HMAC key carries the canonical JWK bytes into Node's
    // wrapping implementation. Node still validates the actual wrapping key
    // and performs the actual cipher, including restricted CTR counter bits.
    const promise=(async()=>{const key=values[2],algorithm=values[3];if(!key.usages.includes('wrapKey')||key.algorithm.name!==algorithm.name)throw fail('InvalidAccessError');const target=values[1];if(target.algorithm.name==='HKDF'||target.algorithm.name==='PBKDF2')throw fail('NotSupportedError');const jwk=await webcrypto.subtle.exportKey('jwk',target),ordered=Object.fromEntries(Object.keys(jwk).sort().map(name=>[name,jwk[name]]));let text=JSON.stringify(ordered);if(algorithm.name==='AES-KW')while(Buffer.byteLength(text)%8)text+=' ';const container=await webcrypto.subtle.importKey('raw',Buffer.from(text),{name:'HMAC',hash:'SHA-256'},true,['sign']);return webcrypto.subtle.wrapKey('raw',container,key,algorithm)})();
    return{async:true,promise};
   }
   const promise=webcrypto.subtle[operation](...values);return{async:true,promise:operation==='wrapKey'&&values[3].name==='AES-KW'?promise.catch(error=>{if(error.name==='DataError')throw fail('OperationError');throw error}):promise};
  },
 });installed.set(realm,api);return api;
}

export function cryptoKeyRecord(value){const record=platformFactoryRecord(value);return record?.kind==='CryptoKey'&&keyStates.has(value)?record.read():null}
export function validCryptoKeyRecord(record){return record?.kind==='CryptoKey'&&types.isCryptoKey(record.key)&&supported.importKey.includes(record.key.algorithm.name)}
export function deserializeCryptoKey(realm,record){if(!validCryptoKeyRecord(record)||!installed.has(realm))throw new TypeError('Invalid CryptoKey receiver');return installed.get(realm).wrap(record.key)}
