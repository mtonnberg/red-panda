// Independent ImageData values backed by actual realm-local clamped bytes.
// Successful factory identities, not authored prototype/tag/symbol fields,
// provide private state and clone provenance.
import { types } from 'node:util';
import { registerPlatformFactory, platformFactoryRecord } from './platform-factories.js';
const states=new WeakMap(),installed=new WeakMap();
const typed=Object.getPrototypeOf(Uint8Array.prototype),length=Object.getOwnPropertyDescriptor(typed,'length').get;
const uint8Set=Uint8Array.prototype.set;
const MAX_BYTES=64*1024*1024;
function copyBytes(data){const size=length.call(data);if(size>MAX_BYTES)throw new RangeError('ImageData clone exceeds the independent backend byte limit');const bytes=new Uint8Array(size);uint8Set.call(bytes,data);return bytes}
function factory(g,bridge){
 const TypeError=g.TypeError,RangeError=g.RangeError,Exception=g.DOMException,Clamped=g.Uint8ClampedArray;
 const define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,apply=g.Reflect.apply,safeInteger=g.Number.isSafeInteger;
 const String=g.String,description=descriptor(g.Symbol.prototype,'description').get;
 const number=value=>(+value)>>>0;
 const text=value=>typeof value==='symbol'?apply(description,value,[])??'':String(value);
 const index=()=>new Exception('Index or size is negative or greater than the allowed amount','IndexSizeError');
 const invalid=()=>new Exception('The object is in an invalid state','InvalidStateError');
 const state=value=>{const found=bridge.state(value);if(!found)throw new TypeError('Illegal invocation');return found};
 function settings(value){
  if(value==null)return{colorSpace:'srgb',pixelFormat:'rgba-unorm8'};
  if(typeof value!=='object'&&typeof value!=='function')throw new TypeError('invalid argument');
  const c=value.colorSpace,colorSpace=c===undefined?'srgb':text(c);
  const p=value.pixelFormat,pixelFormat=p===undefined?'rgba-unorm8':text(p);
  return{colorSpace,pixelFormat};
 }
 function ImageData(sw,sh){
  if(new.target===undefined||arguments.length<2)throw new TypeError('invalid argument');
  const array=bridge.isData(sw);let width,height,data,options;
  if(array){
   width=number(sh);options=settings(arguments[3]);
   height=arguments[2]===undefined?undefined:number(arguments[2]);
   const n=bridge.length(sw);
   if(options.colorSpace!=='srgb'||options.pixelFormat!=='rgba-unorm8')throw new TypeError('');
   if(!n||n%4)throw invalid();
   if(!width||width>2147483647||n%(4*width))throw index();
   const derived=n/(4*width);if(height===undefined)height=derived;
   if(!height||height>2147483647||height!==derived)throw index();
   data=sw;
  }else{
   height=number(sh);options=settings(arguments[2]);width=number(sw);
   if(options.colorSpace!=='srgb'||options.pixelFormat!=='rgba-unorm8')throw new TypeError('');
   const n=width*height*4;
   if(!width||!height||width>2147483647||height>2147483647||!safeInteger(n)||n>2147483647)throw index();
   if(n>bridge.maxBytes)throw new RangeError('ImageData allocation exceeds the independent backend byte limit');
   data=new Clamped(n);
  }
  const value={width,height,data};bridge.store(this,value);
  bridge.register(this,()=>({kind:'ImageData',width,height,bytes:bridge.copy(data)}));
 }
 const p=ImageData.prototype;delete p.constructor;
 define(ImageData,'prototype',{writable:false});
 define(p,'colorSpace',{value:'srgb',enumerable:true});
 define(p,'pixelFormat',{value:'rgba-unorm8',enumerable:true});
 const accessors={get data(){return state(this).data},get width(){return state(this).width},get height(){return state(this).height}};
 for(const key of['data','width','height'])define(p,key,{...descriptor(accessors,key),enumerable:true,configurable:true});
 define(p,'constructor',{value:ImageData,writable:true,configurable:true});
 define(p,g.Symbol.toStringTag,{value:'ImageData',configurable:true});
 define(g,'ImageData',{value:ImageData,writable:true,configurable:true});
 return{construct(record){const data=new Clamped(record.bytes.length);for(let i=0;i<record.bytes.length;i++)data[i]=record.bytes[i];return new ImageData(data,record.width,record.height)}};
}
export function installImageData(realm){
 if(installed.has(realm))return installed.get(realm);
 const api=realm.eval(`(${factory.toString()})`)(realm,{
  state:value=>states.get(value),store:(value,state)=>states.set(value,state),
  isData:types.isUint8ClampedArray,length:value=>length.call(value),copy:copyBytes,maxBytes:MAX_BYTES,
  register(value,read){registerPlatformFactory(value,{kind:'ImageData',globalObject:realm,read})},
 });
 installed.set(realm,api);return api;
}
export function imageDataRecord(value){const provenance=platformFactoryRecord(value);return provenance?.kind==='ImageData'&&states.has(value)?provenance.read():null}
export function validImageDataRecord(record){return record?.kind==='ImageData'&&Number.isInteger(record.width)&&record.width>0&&record.width<=2147483647&&Number.isInteger(record.height)&&record.height>0&&record.height<=2147483647&&types.isUint8Array(record.bytes)&&record.bytes.length===record.width*record.height*4&&record.bytes.length<=MAX_BYTES}
export function deserializeImageData(realm,record){const api=installed.get(realm);if(!api||!validImageDataRecord(record))throw new TypeError('Invalid ImageData receiver');return api.construct(record)}
