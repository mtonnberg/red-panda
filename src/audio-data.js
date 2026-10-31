import {types} from 'node:util';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';

const states=new WeakMap(),installed=new WeakMap(),tokens=new WeakMap(),nativeClone=globalThis.structuredClone;
const typed=Object.getPrototypeOf(Uint8Array.prototype),get=(p,k)=>Object.getOwnPropertyDescriptor(p,k).get;
const tb=get(typed,'buffer'),tl=get(typed,'byteLength'),to=get(typed,'byteOffset'),db=get(DataView.prototype,'buffer'),dl=get(DataView.prototype,'byteLength'),dof=get(DataView.prototype,'byteOffset');
const MAX_BYTES=64*1024*1024,FORMATS=Object.create(null);
for(const [base,bps]of[['u8',1],['s16',2],['s32',4],['f32',4]])for(const planar of[false,true])FORMATS[base+(planar?'-planar':'')]=Object.freeze({base,bps,planar});
Object.freeze(FORMATS);
const isData=value=>types.isArrayBuffer(value)||ArrayBuffer.isView(value);
function view(value){
 if(types.isArrayBuffer(value)){try{return new Uint8Array(value)}catch{return new Uint8Array()}}
 const dataView=types.isDataView(value),buffer=(dataView?db:tb).call(value);try{return new Uint8Array(buffer,(dataView?dof:to).call(value),(dataView?dl:tl).call(value))}catch{return new Uint8Array()}
}
const failure=(name,message='')=>({ok:false,name,message});
function selection(state,options){
 if(state.closed)return failure('InvalidStateError','The object is in an invalid state');
 const format=options.format??state.format,target=FORMATS[format];if(!target)return failure('TypeError');
 const offset=options.frameOffset,count=options.frameCount??state.numberOfFrames-offset,planes=target.planar?state.numberOfChannels:1;
 if(options.planeIndex>=planes||offset>=state.numberOfFrames||count>state.numberOfFrames-offset)return failure('RangeError');
 return{ok:true,format,target,offset,count,plane:options.planeIndex,size:count*(target.planar?1:state.numberOfChannels)*target.bps};
}
function readSample(data,format,index){const offset=index*format.bps;if(format.base==='u8')return data.getUint8(offset)-128;if(format.base==='s16')return data.getInt16(offset,true);if(format.base==='s32')return data.getInt32(offset,true);return data.getFloat32(offset,true)}
function convertSample(value,source,target){
 if(source==='f32'){
  if(target==='f32')return value;
  if(Number.isNaN(value))value=0;value=Math.max(-1,Math.min(1,value));
  const bits=target==='u8'?8:target==='s16'?16:32,converted=Math.trunc(value*(value<0?2**(bits-1):2**(bits-1)-1));return target==='u8'?converted+128:converted;
 }
 const bits=source==='u8'?8:source==='s16'?16:32;
 if(target==='f32')return value/(value<0?2**(bits-1):2**(bits-1)-1);
 const targetBits=target==='u8'?8:target==='s16'?16:32,converted=targetBits>=bits?value*2**(targetBits-bits):Math.floor(value/2**(bits-targetBits));return target==='u8'?converted+128:converted;
}
function copySamples(state,destination,selected){
 const src=FORMATS[state.format],dst=selected.target,source=new DataView(state.bytes.buffer,state.bytes.byteOffset,state.bytes.byteLength),target=new DataView(destination.buffer,destination.byteOffset,destination.byteLength),channels=state.numberOfChannels;
 for(let frame=0;frame<selected.count;frame++)for(let channel=0;channel<(dst.planar?1:channels);channel++){
  const c=dst.planar?selected.plane:channel,sourceIndex=src.planar?c*state.numberOfFrames+selected.offset+frame:(selected.offset+frame)*channels+c,targetIndex=dst.planar?frame:frame*channels+channel,offset=targetIndex*dst.bps;
  if(src.base===dst.base){const start=sourceIndex*src.bps;destination.set(state.bytes.subarray(start,start+src.bps),offset);continue;}
  const value=convertSample(readSample(source,src,sourceIndex),src.base,dst.base);
  if(dst.base==='u8')target.setUint8(offset,value);else if(dst.base==='s16')target.setInt16(offset,value,true);else if(dst.base==='s32')target.setInt32(offset,value,true);else target.setFloat32(offset,value,true);
 }
}
function factory(g,bridge){
 const TypeError=g.TypeError,RangeError=g.RangeError,Exception=g.DOMException,String=g.String,Number=g.Number;
 const create=g.Object.create,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,apply=g.Reflect.apply,Array=g.Array,from=Array.from,iterator=g.Symbol.iterator,description=descriptor(g.Symbol.prototype,'description').get;
 const trunc=g.Math.trunc,abs=g.Math.abs,fround=g.Math.fround,finite=Number.isFinite;
 const error=()=>new TypeError('invalid argument');
 const text=value=>typeof value==='symbol'?apply(description,value,[])??'':String(value);
 const dictionary=value=>{if(value==null)return{};if(typeof value!=='object'&&typeof value!=='function')throw error();return value};
 const member=(object,name,required=false)=>{const value=name in object?object[name]:undefined;if(required&&value===undefined)throw error();return value};
 const uint=value=>{const number=+value;if(!finite(number)||number<0||number>4294967295)throw error();return trunc(number)};
 const integer=value=>{const number=+value;if(!finite(number)||abs(trunc(number))>9007199254740991)throw error();return trunc(number)||0};
 const assert=value=>{if(!bridge.brand(value))throw new TypeError('Illegal invocation')};
 function check(result){if(result.ok)return result;if(result.name==='RangeError')throw new RangeError(result.message);if(result.name==='TypeError')throw new TypeError(result.message);throw new Exception(result.message,result.name)}
 function transfer(value){if(value===undefined)return[];if(value===null||typeof value[iterator]!=='function')throw error();const list=apply(from,Array,[value]);for(let i=0;i<list.length;i++)if(!bridge.isTransfer(list[i]))throw new TypeError('');return list}
 function options(value){const source=dictionary(value),f=member(source,'format'),format=f==null?undefined:text(f),n=member(source,'frameCount'),frameCount=n==null?undefined:uint(n),o=member(source,'frameOffset'),frameOffset=o===undefined?0:uint(o),planeIndex=uint(member(source,'planeIndex',true));if(format!==undefined&&!bridge.format(format))throw new TypeError('');return{format,frameCount,frameOffset,planeIndex}}
 function AudioData(init){
  if(new.target===undefined)throw error();const source=dictionary(init),data=member(source,'data',true);if(!bridge.isData(data))throw error();
  const format=text(member(source,'format',true)),channels=uint(member(source,'numberOfChannels',true)),frames=uint(member(source,'numberOfFrames',true)),sampleRate=fround(+member(source,'sampleRate',true)),timestamp=integer(member(source,'timestamp',true)),list=transfer(member(source,'transfer'));
  check(bridge.create(this,data,format,channels,frames,sampleRate,timestamp,list));
 }
 define(AudioData,'prototype',{writable:false});const p=AudioData.prototype;delete p.constructor;
 const accessors={get format(){assert(this);return bridge.read(this,'format')},get sampleRate(){assert(this);return bridge.read(this,'sampleRate')},get numberOfFrames(){assert(this);return bridge.read(this,'numberOfFrames')},get numberOfChannels(){assert(this);return bridge.read(this,'numberOfChannels')},get duration(){assert(this);return bridge.read(this,'duration')},get timestamp(){assert(this);return bridge.read(this,'timestamp')}};
 for(const name of['format','sampleRate','numberOfFrames','numberOfChannels','duration','timestamp'])define(p,name,{...descriptor(accessors,name),enumerable:true,configurable:true});
 const methods={allocationSize(value){assert(this);return check(bridge.allocation(this,options(value))).size},copyTo(destination,value){assert(this);if(!bridge.isData(destination))throw error();check(bridge.copy(this,destination,options(value)))},clone(){assert(this);return check(bridge.clone(this)).value},close(){assert(this);bridge.close(this)}};
 for(const name of['allocationSize','copyTo','clone','close'])define(p,name,{value:methods[name],writable:true,configurable:true,enumerable:true});
 define(p,'constructor',{value:AudioData,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:'AudioData',configurable:true});define(g,'AudioData',{value:AudioData,writable:true,configurable:true});
 return{construct(token){const value=create(AudioData.prototype);check(bridge.hydrate(value,token));return value}};
}
export function installAudioData(realm){
 if(installed.has(realm))return installed.get(realm);registerPlatformFactoryKind('AudioData');let api;
 api=realm.eval(`(${factory.toString()})`)(realm,{
  brand:value=>states.has(value),format:value=>Object.hasOwn(FORMATS,value),isData,isTransfer:types.isArrayBuffer,
  create(value,data,format,numberOfChannels,numberOfFrames,sampleRate,timestamp,transfer){
   const type=FORMATS[format],bytes=view(data),size=type?numberOfChannels*numberOfFrames*type.bps:0;
   if(!type||!numberOfChannels||!numberOfFrames||!(sampleRate>0)||!Number.isFinite(sampleRate)||!Number.isSafeInteger(size)||size>bytes.length)return failure('TypeError');
   if(size>MAX_BYTES)return failure('RangeError','AudioData exceeds the independent backend byte limit');
   const seen=new Set(),buffers=[];for(let i=0;i<transfer.length;i++){const buffer=transfer[i];if(seen.has(buffer))return failure('DataCloneError','The object can not be cloned');seen.add(buffer);try{new Uint8Array(buffer)}catch{return failure('DataCloneError','The object can not be cloned')}buffers.push(buffer)}
   const copied=bytes.slice(0,size);try{nativeClone(null,{transfer:buffers})}catch{return failure('DataCloneError','The object can not be cloned')}
   const duration=Math.min(2**64-1,Math.trunc(numberOfFrames*1e6/sampleRate)),state=Object.assign(Object.create(null),{format,numberOfChannels,numberOfFrames,sampleRate,timestamp,duration,bytes:copied,closed:false});states.set(value,state);
   registerPlatformFactory(value,{kind:'AudioData',implementation:state,globalObject:realm,read:()=>audioDataRecord(value)});return{ok:true};
  },
  read(value,key){const s=states.get(value);if(!['format','sampleRate','numberOfFrames','numberOfChannels','duration','timestamp'].includes(key))return undefined;if(s.closed)return key==='timestamp'?s.timestamp:key==='format'?null:0;return s[key]},
  allocation(value,options){return selection(states.get(value),options)},
  copy(value,destination,options){const state=states.get(value),selected=selection(state,options);if(!selected.ok)return selected;const target=view(destination);if(target.length<selected.size)return failure('RangeError');copySamples(state,target,selected);return{ok:true}},
  clone(value){const s=states.get(value);if(s.closed)return failure('InvalidStateError','The object is in an invalid state');const token=Object.create(null);tokens.set(token,{realm,record:audioDataRecord(value)});return{ok:true,value:api.construct(token)}},
  hydrate(value,token){const entry=tokens.get(token);if(!entry||entry.realm!==realm)return failure('TypeError');tokens.delete(token);const r=entry.record;if(!validAudioDataRecord(r))return failure('TypeError');const state=Object.assign(Object.create(null),{format:r.format,numberOfChannels:r.numberOfChannels,numberOfFrames:r.numberOfFrames,sampleRate:r.sampleRate,timestamp:r.timestamp,duration:Math.min(2**64-1,Math.trunc(r.numberOfFrames*1e6/r.sampleRate)),bytes:r.bytes.slice(),closed:false});states.set(value,state);registerPlatformFactory(value,{kind:'AudioData',implementation:state,globalObject:realm,read:()=>audioDataRecord(value)});return{ok:true}},
  close(value){const s=states.get(value);s.closed=true;s.bytes=null},
 });installed.set(realm,api);return api;
}
export function audioDataRecord(value){const s=states.get(value);if(!s)return null;if(s.closed)return{kind:'AudioData',closed:true,timestamp:s.timestamp};return{kind:'AudioData',closed:false,format:s.format,numberOfChannels:s.numberOfChannels,numberOfFrames:s.numberOfFrames,sampleRate:s.sampleRate,timestamp:s.timestamp,bytes:s.bytes.slice()}}
export function isAudioData(value){return states.has(value)}
export function validAudioDataRecord(r){const format=r&&FORMATS[r.format];return r?.kind==='AudioData'&&!r.closed&&!!format&&Number.isInteger(r.numberOfChannels)&&r.numberOfChannels>0&&r.numberOfChannels<=4294967295&&Number.isInteger(r.numberOfFrames)&&r.numberOfFrames>0&&r.numberOfFrames<=4294967295&&Number.isFinite(r.sampleRate)&&r.sampleRate>0&&Number.isSafeInteger(r.timestamp)&&types.isUint8Array(r.bytes)&&r.bytes.length<=MAX_BYTES&&r.bytes.length===r.numberOfChannels*r.numberOfFrames*format.bps}
export function deserializeAudioData(realm,r){const api=installed.get(realm);if(!api||!validAudioDataRecord(r))throw new TypeError('Invalid AudioData receiver');const token=Object.create(null);tokens.set(token,{realm,record:r});return api.construct(token)}
