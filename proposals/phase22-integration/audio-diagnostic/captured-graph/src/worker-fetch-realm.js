import{types}from'node:util';
import{createRequire}from'node:module';
import{Blob as NativeBlob}from'node:buffer';
import{registerPlatformFactory,platformFactoryRecord}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
import{registerNativeBlobFactory,installNativeBlobStreamFactory}from'./native-platform-factories.js';
import{guardWorkerHeaders,forbiddenWorkerHeader,simpleWorkerHeader}from'./worker-fetch-headers.js';
import{registerWasmResponse,installWasmStreaming}from'./wasm-streaming.js';
const NH=globalThis.Headers,NR=globalThis.Request,NS=globalThis.Response,nodeThen=Promise.prototype.then;
const MIMEType=createRequire(import.meta.url)('whatwg-mimetype');
const apply=Reflect.apply,descriptor=Object.getOwnPropertyDescriptor;
const requests=new WeakMap(),responses=new WeakMap(),headers=new WeakMap(),iterators=new WeakMap();
const H=Object.fromEntries(['append','delete','get','getSetCookie','has','set','keys','values','entries'].map(k=>[k,NH.prototype[k]]));
const requestGet=Object.fromEntries(['url','method','cache','credentials','redirect','mode','referrer','referrerPolicy','body','bodyUsed','signal','headers'].map(k=>[k,descriptor(NR.prototype,k).get]));
const responseGet=Object.fromEntries(['ok','status','statusText','type','body','bodyUsed','url','redirected','headers'].map(k=>[k,descriptor(NS.prototype,k).get]));
const methods={Request:Object.fromEntries(['clone','text','arrayBuffer','blob','formData'].map(k=>[k,NR.prototype[k]])),Response:Object.fromEntries(['clone','text','arrayBuffer','blob','formData'].map(k=>[k,NS.prototype[k]]))};
const responseStatics={error:NS.error,redirect:NS.redirect,json:NS.json},reader=ReadableStream.prototype.getReader,read=ReadableStreamDefaultReader.prototype.read;
const paramsString=URLSearchParams.prototype.toString;
const blobSlice=NativeBlob.prototype.slice,blobSize=descriptor(NativeBlob.prototype,'size').get;
const formEntries=globalThis.FormData.prototype.entries,formNext=Object.getPrototypeOf(apply(formEntries,new globalThis.FormData(),[])).next;
const nativeIteratorNext=Object.getPrototypeOf(new NH().entries()).next;
const typed=Object.getPrototypeOf(Uint8Array.prototype),buffer=descriptor(typed,'buffer').get,length=descriptor(typed,'byteLength').get,offset=descriptor(typed,'byteOffset').get;
const dbuffer=descriptor(DataView.prototype,'buffer').get,dlength=descriptor(DataView.prototype,'byteLength').get,doffset=descriptor(DataView.prototype,'byteOffset').get;
function realmFactory(g,b){'use strict';
 const P=g.Promise,parse=g.JSON.parse,define=g.Object.defineProperty,keys=g.Reflect.ownKeys,own=g.Object.getOwnPropertyDescriptor,create=g.Object.create,Array=g.Array,arrayFrom=g.Array.from,apply=g.Reflect.apply,TypeError=g.TypeError;
 const invalid=()=>{throw new TypeError('invalid argument')};
 const promise=(task,convert=v=>v)=>new P((resolve,reject)=>{try{b.settle(task(),value=>{try{resolve(convert(value))}catch(error){reject(b.error(error))}},error=>reject(b.error(error)))}catch(error){reject(b.error(error))}});
 function Headers(init){if(!new.target)invalid();b.headers(this,init)}
 function Request(input){if(!new.target||!arguments.length)invalid();b.request(this,input,arguments[1])}
 function Response(){if(!new.target)invalid();b.response(this,arguments[0],arguments[1])}
 function HeadersIterator(){throw new TypeError('Illegal Constructor')}
 define(Headers,'length',{value:0,configurable:true});
 const hp=Headers.prototype,rp=Request.prototype,sp=Response.prototype,ip=HeadersIterator.prototype;
 for(const C of[Headers,Request,Response,HeadersIterator]){delete C.prototype.constructor;define(C,'prototype',{writable:false})}
 const hm={append(name,value){if(arguments.length<2)invalid();b.header(this,'append',[name,value])},delete(name){if(!arguments.length)invalid();b.header(this,'delete',[name])},get(name){if(!arguments.length)invalid();return b.header(this,'get',[name])},getSetCookie(){return apply(arrayFrom,Array,[b.header(this,'getSetCookie',[])])},has(name){if(!arguments.length)invalid();return b.header(this,'has',[name])},set(name,value){if(arguments.length<2)invalid();b.header(this,'set',[name,value])},keys(){return iterator(this,'keys')},values(){return iterator(this,'values')},entries(){return iterator(this,'entries')},forEach(callback){if(typeof callback!=='function')invalid();const it=iterator(this,'entries'),thisArg=arguments[1];for(let step;(step=it.next()).done===false;)apply(callback,thisArg,[step.value[1],step.value[0],this])}};
 function iterator(value,kind){const result=create(ip);b.iterator(result,value,kind);return result}
 const im={next(){const s=b.next(this);return s.done?{done:true}:{done:false,value:s.pair?[s.value[0],s.value[1]]:s.value}},[Symbol.iterator](){if(!b.hasIterator(this))invalid();return this}};
 const bodyMethods=kind=>({text(){return promise(()=>b.consume(this,'text',kind))},json(){return promise(()=>b.consume(this,'text',kind),value=>parse(value))},arrayBuffer(){return promise(()=>b.consume(this,'arrayBuffer',kind),value=>b.arrayBuffer(value))},bytes(){return promise(()=>b.consume(this,'arrayBuffer',kind),value=>b.bytes(value))},blob(){return promise(()=>b.consume(this,'blob',kind))},formData(){return promise(()=>b.consume(this,'formData',kind))},textStream(){return b.textStream(this,kind)},clone(){return b.clone(this,kind)}});
 const requestBody=bodyMethods('Request'),responseBody=bodyMethods('Response');
 for(const[k,v]of Object.entries(hm))define(hp,k,{value:v,writable:true,enumerable:true,configurable:true});
 for(const k of keys(im))define(ip,k,{value:im[k],writable:true,enumerable:true,configurable:true});
 const getter=(p,key,kind)=>{const d={get(){return b.get(this,key,kind)},enumerable:true,configurable:true};define(d.get,'name',{value:'get '+key,configurable:true});define(p,key,d)};
 for(const key of ['url','method','headers','cache','credentials','redirect','mode','signal','bodyUsed','body'])getter(rp,key,'Request');
 for(const key of ['blob','text','json','arrayBuffer','bytes','formData','textStream','clone'])define(rp,key,{value:requestBody[key],writable:true,enumerable:true,configurable:true});
 for(const key of ['referrer','referrerPolicy'])getter(rp,key,'Request');
 for(const key of ['ok','status','statusText','type'])getter(sp,key,'Response');
 for(const key of ['text','json'])define(sp,key,{value:responseBody[key],writable:true,enumerable:true,configurable:true});
 for(const key of ['headers','body','bodyUsed','url','redirected'])getter(sp,key,'Response');
 for(const key of ['arrayBuffer','blob','bytes','formData','textStream','clone'])define(sp,key,{value:responseBody[key],writable:true,enumerable:true,configurable:true});
 const statics={error(){return b.staticResponse('error',[])},redirect(url){if(!arguments.length)invalid();return b.staticResponse('redirect',[url,arguments[1]])},json(data){if(!arguments.length)invalid();return b.staticResponse('json',[data,arguments[1]])}};
 for(const[k,v]of Object.entries(statics))define(Response,k,{value:v,writable:true,enumerable:true,configurable:true});
 define(hp,Symbol.iterator,{value:hm.entries,writable:true,configurable:true});
 for(const[C,name]of[[Headers,'Headers'],[Request,'Request'],[Response,'Response'],[HeadersIterator,'HeadersIterator']]){define(C.prototype,'constructor',{value:C,writable:true,configurable:true});if(name!=='HeadersIterator')define(C.prototype,Symbol.toStringTag,{value:name,configurable:true})}
 const functions={fetch(input){const args=apply(arrayFrom,Array,[arguments]);return promise(()=>{if(!args.length)invalid();return b.fetch(args[0],args[1])})}};
 for(const[name,value]of Object.entries({Headers,Request,Response,fetch:functions.fetch}))define(g,name,{value,writable:true,configurable:true});
 return{allocate(kind){return create(({Headers,Request,Response})[kind].prototype)}};
}
export function installWorkerFetchRealm(g,{evaluate,fetch,streams,abort,baseURL,lifetime}={}){
 installNativeBlobStreamFactory(g);
 const TypeError=g.TypeError,RangeError=g.RangeError,SyntaxError=g.SyntaxError,Uint8=g.Uint8Array,typedSet=Uint8.prototype.set,Readable=g.ReadableStream;
 let factory;const state=(map,v,message='Illegal invocation')=>{const s=map.get(v);if(!s)throw new TypeError(message);return s};
 const convertError=error=>{if(!types.isNativeError(error))return error;const p=Object.getPrototypeOf(error);if(p===globalThis.RangeError.prototype)return new RangeError('');if(p===globalThis.SyntaxError.prototype)return new SyntaxError(error.message);if(p===globalThis.TypeError.prototype){let m=error.message;if(/invalid header name/i.test(m))m='Invalid header name';else if(/invalid header value/i.test(m))m='Invalid header value';else if(/already (?:been )?read|Body is unusable|already been consumed/i.test(m))m='Body has already been read';return new TypeError(m)}return error};
 const guarded=task=>{try{return task()}catch(error){throw convertError(error)}};
 const record=(map,value,s,kind)=>{map.set(value,s);registerPlatformFactory(value,{kind,globalObject:g});return value};
 const headerWrap=(raw,guard='none')=>record(headers,factory.allocate('Headers'),{raw,guard},'Headers');
 const copyBytes=value=>{const bytes=types.isAnyArrayBuffer(value)?new Uint8Array(value):value,out=new Uint8(apply(length,bytes,[]));apply(typedSet,out,[bytes]);return out};
 const bodyValue=value=>{
  const producer=platformFactoryRecord(value);if(producer&&['Blob','File'].includes(producer.kind)&&producer.read)return producer.read().blob;
  if(producer?.kind==='FormData'||producer?.kind==='ReadableStream'||streams.has(value,'ReadableStream'))return value;
  if(types.isSharedArrayBuffer(value))throw new TypeError('invalid argument');
  if(types.isArrayBuffer(value))return new Uint8Array(value).slice();
  if(ArrayBuffer.isView(value)){const data=types.isDataView(value),b=apply(data?dbuffer:buffer,value,[]),n=apply(data?dlength:length,value,[]),at=apply(data?doffset:offset,value,[]);if(types.isSharedArrayBuffer(b))throw new TypeError('invalid argument');return new Uint8Array(b,at,n).slice()}
  if(value==null)return value;
  if(typeof value==='object'){try{return new URLSearchParams(apply(paramsString,value,[]))}catch{}}
  return String(value);
 };
 const initHeaders=(input,guard)=>guardWorkerHeaders(new NH(headers.get(input)?.raw??input??undefined),guard);
 const dictionary=init=>{if(init==null)return{};if(!['object','function'].includes(typeof init))throw new TypeError('invalid argument');return init};
  function responseWrap(raw,view={},headerSource){const value=factory.allocate('Response');responseBind(value,raw,view,headerSource);return value}
 function responseBind(value,raw,view={},headerSource){const s={raw,view,kind:'Response',headers:headerWrap(headerSource??apply(responseGet.headers,raw,[]),view.guard??'response')};record(responses,value,s,'Response');registerWasmResponse(value,ErrorClass=>{const status=view.status??apply(responseGet.status,raw,[]),mime=apply(H.get,headers.get(s.headers).raw,['content-type'])??'';if((()=>{try{return new MIMEType(mime).essence}catch{return ''}})()!=='application/wasm')throw new ErrorClass("Incorrect response MIME type. Expected 'application/wasm'.");if(status<200||status>299)throw new ErrorClass('HTTP status code is not ok');if(apply(responseGet.bodyUsed,raw,[]))throw new ErrorClass('Body has already been read');const body=apply(responseGet.body,raw,[]);if(body?.locked)throw new ErrorClass('Body is disturbed or locked');const h=new NH(headers.get(s.headers).raw);h.set('content-type','application/wasm');return new NS(body,{status,headers:h})});return value}
 function prepare(input,init){
  init=dictionary(init);const captured={};for(const key of ['method','headers','body','referrer','referrerPolicy','mode','credentials','cache','redirect','integrity','keepalive','signal','duplex']){const value=init[key];if(value!==undefined)captured[key]=value}init=captured;const source=requests.get(input),mode=init.mode??(source?apply(requestGet.mode,source.raw,[]):'cors'),headersInput=init.headers??source?.headers;
  const signal=init.signal===undefined?(source?.signal??null):init.signal;
  if(signal!==null&&!abort.hasSignal(signal))throw new TypeError('invalid argument');
  const prepared={...init,headers:initHeaders(headersInput,mode==='no-cors'?'request-no-cors':'request')};if('body'in init)prepared.body=bodyValue(init.body);
  if(signal!==null)prepared.signal=abort.nativeSignal(signal);else delete prepared.signal;
  if((platformFactoryRecord(init.body)?.kind==='ReadableStream'||streams.has(init.body,'ReadableStream'))&&!prepared.duplex)prepared.duplex='half';
  let from;if(source)from=apply(methods.Request.clone,source.raw,[]);else{try{from=new URL(String(input),baseURL()).href}catch{throw new TypeError('')}}
  return{raw:new NR(from,prepared),signal};
 }
 const bridge={
  settle(value,resolve,reject){if(types.isPromise(value))apply(nodeThen,value,[resolve,reject]);else resolve(value)},error:convertError,bytes:copyBytes,arrayBuffer:value=>apply(buffer,copyBytes(value),[]),fetch:(input,init)=>fetch(input,init),hasIterator:v=>iterators.has(v),
  headers(value,init){guarded(()=>record(headers,value,{raw:new NH(headers.get(init)?.raw??init??undefined),guard:'none'},'Headers'))},
  header(value,key,args){return guarded(()=>{const s=state(headers,value);if(['append','set','delete'].includes(key)){if(s.guard==='immutable')throw new TypeError('');const check=new NH();apply(H.set,check,[args[0],key==='delete'?'':args[1]]);const[n,v]=[...check][0];if(s.guard==='response'&&['set-cookie','set-cookie2'].includes(n))return;if(s.guard.startsWith('request')&&forbiddenWorkerHeader(n,v))return;if(s.guard==='request-no-cors'&&(key==='delete'?!['accept','accept-language','content-language','content-type','range'].includes(n):!simpleWorkerHeader(n,key==='append'&&s.raw.has(n)?s.raw.get(n)+', '+v:v)))return;return apply(H[key],s.raw,key==='delete'?[n]:[n,v])}return apply(H[key],s.raw,args)})},
  iterator(value,source,kind){const s=state(headers,source);iterators.set(value,{iterator:apply(H[kind],s.raw,[]),pair:kind==='entries'})},
  next(value){const s=state(iterators,value),step=apply(nativeIteratorNext,s.iterator,[]);return{done:step.done,value:step.value,pair:s.pair}},
  request(value,input,init){guarded(()=>{const s=prepare(input,init);s.kind='Request';s.headers=headerWrap(apply(requestGet.headers,s.raw,[]),apply(requestGet.mode,s.raw,[])==='no-cors'?'request-no-cors':'request');record(requests,value,s,'Request')})},
  response(value,body,init){guarded(()=>{init=dictionary(init);const status=init.status,statusText=init.statusText,head=init.headers;const prepared={status,statusText,headers:initHeaders(head,'response')};responseBind(value,new NS(bodyValue(body??null),prepared))})},
  staticResponse(key,args){return guarded(()=>{if(key==='error')return responseWrap(apply(responseStatics.error,NS,[]),{guard:'immutable'});if(key==='redirect'){const url=new URL(String(args[0]),baseURL()).href;return responseWrap(apply(responseStatics.redirect,NS,[url,args[1]??302]),{guard:'immutable'})}const init=dictionary(args[1]);return responseWrap(apply(responseStatics.json,NS,[args[0],{status:init.status,statusText:init.statusText,headers:initHeaders(init.headers,'response')}]))})},
  get(value,key,kind){const s=state(kind==='Request'?requests:responses,value);if(key==='headers')return s.headers;if(kind==='Request'&&key==='signal')return s.signal;if(kind==='Response'&&Object.hasOwn(s.view,key))return s.view[key];const result=apply((kind==='Request'?requestGet:responseGet)[key],s.raw,[]);return key==='body'?streams.adoptProduced(result):result},
  clone(value,kind){return guarded(()=>{const s=state(kind==='Request'?requests:responses,value);const raw=apply(methods[s.kind].clone,s.raw,[]);if(s.kind==='Response')return responseWrap(raw,{...s.view},new NH(headers.get(s.headers).raw));const out=factory.allocate('Request');record(requests,out,{raw,signal:s.signal,kind:'Request',headers:headerWrap(apply(requestGet.headers,raw,[]),headers.get(s.headers).guard)},'Request');return out})},
  consume(value,key,kind){const s=state(kind==='Request'?requests:responses,value,'invalid argument');const result=apply(methods[s.kind][key],s.raw,[]);if(key==='blob')return apply(nodeThen,result,[v=>registerNativeBlobFactory(apply(blobSlice,v,[0,apply(blobSize,v,[]),apply(H.get,headers.get(s.headers).raw,['content-type'])??'']),{globalObject:g})]);if(key==='formData')return apply(nodeThen,result,[value=>{registerPlatformFactory(value,{kind:'FormData',globalObject:g});const iterator=apply(formEntries,value,[]);for(;;){const step=apply(formNext,iterator,[]);if(step.done)break;if(step.value[1]!==null&&typeof step.value[1]==='object')registerNativeBlobFactory(step.value[1],{kind:'File',globalObject:g})}return value}]);return result},
  textStream(value,kind){const s=state(kind==='Request'?requests:responses,value,'invalid argument');const body=apply((s.kind==='Request'?requestGet:responseGet).body,s.raw,[]);if(!body)return new Readable({start(c){c.close()}});if(body.locked||apply((s.kind==='Request'?requestGet:responseGet).bodyUsed,s.raw,[]))throw new TypeError('Body has already been read');const r=apply(reader,body,[]),decoder=new TextDecoder();let next=apply(read,r,[]);return new Readable({async pull(c){try{const step=await(next??apply(read,r,[]));next=null;if(step.done){const tail=decoder.decode();if(tail)c.enqueue(tail);c.close();r.releaseLock()}else{const text=decoder.decode(step.value,{stream:true});if(text)c.enqueue(text)}}catch(error){c.error(convertError(error))}},cancel(reason){return r.cancel(reason)}})},
 };
 for(const kind of['Headers','Request','Response'])registerPlatformFactoryKind(kind);
 factory=evaluate(`(${realmFactory.toString()})`)(g,bridge);installWasmStreaming(g);
 return{
  prepare:(input,init)=>guarded(()=>prepare(input,init)),
  response(result){const opaque=['opaque','opaqueredirect','error'].includes(result.type),raw=opaque?apply(responseStatics.error,NS,[]):new NS(result.bodyNull||[204,205,304].includes(result.status)?null:result.bytes,result);return responseWrap(raw,{type:result.type??'basic',url:result.url??'',redirected:result.redirected??false,...(opaque?{status:0,statusText:'',ok:false,guard:result.type==='error'?'immutable':'response'}:{})},opaque?new NH():undefined)},
 };
}
