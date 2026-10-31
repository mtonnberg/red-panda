import { types } from 'node:util';
import { registerPlatformFactory, platformFactoryRecord } from './platform-factories.js';

const installed=new WeakMap(),colorStates=new WeakMap(),chunkStates=new WeakMap(),nativeClone=globalThis.structuredClone;
const typed=Object.getPrototypeOf(Uint8Array.prototype);
const getter=(prototype,name)=>Object.getOwnPropertyDescriptor(prototype,name).get;
const typedBuffer=getter(typed,'buffer'),typedLength=getter(typed,'byteLength'),typedOffset=getter(typed,'byteOffset');
const viewBuffer=getter(DataView.prototype,'buffer'),viewLength=getter(DataView.prototype,'byteLength'),viewOffset=getter(DataView.prototype,'byteOffset');
const isBuffer=value=>types.isArrayBuffer(value)||types.isSharedArrayBuffer(value);
function allowedData(value){if(types.isArrayBuffer(value))return true;if(!ArrayBuffer.isView(value))return false;try{return !types.isSharedArrayBuffer((types.isDataView(value)?viewBuffer:typedBuffer).call(value))}catch{return false}}
function byteView(value){
 if(isBuffer(value)){try{return new Uint8Array(value)}catch{return new Uint8Array()}}
 const dataView=types.isDataView(value),buffer=(dataView?viewBuffer:typedBuffer).call(value);
 try{return new Uint8Array(buffer,(dataView?viewOffset:typedOffset).call(value),(dataView?viewLength:typedLength).call(value))}catch{return new Uint8Array()}
}

// Compiled inside the actual target VM. State and captured intrinsics are not
// exposed through authored symbols, constructor names or implementation fields.
function factory(g,bridge){
 const TypeError=g.TypeError,Exception=g.DOMException,Array=g.Array;
 const define=g.Object.defineProperty,keys=g.Reflect.ownKeys,apply=g.Reflect.apply,from=g.Array.from;
 const Number=g.Number,String=g.String,finite=Number.isFinite,trunc=g.Math.trunc,abs=g.Math.abs;
 const description=g.Object.getOwnPropertyDescriptor(g.Symbol.prototype,'description').get,iterator=g.Symbol.iterator;
 const includes=Array.prototype.includes;
 const error=message=>new TypeError(message),cloneError=()=>new Exception('The object can not be cloned','DataCloneError');
 const dictionary=value=>{if(value==null)return{};if(typeof value!=='object'&&typeof value!=='function')throw error('invalid argument');return value};
 const getColor=value=>{const state=bridge.color(value);if(!state)throw error('Illegal invocation');return state};
 const enumeration=(value,allowed)=>{const string=typeof value==='symbol'?apply(description,value,[])??'':String(value);if(!apply(includes,allowed,[string]))throw error('');return string};
 const integer=value=>{const number=+value;if(!finite(number)||abs(trunc(number))>9007199254740991)throw error('invalid argument');return trunc(number)||0};
 const primaries=['bt709','bt470bg','smpte170m','bt2020','smpte432'];
 const transfers=['bt709','smpte170m','iec61966-2-1','linear','pq','hlg'];
 const matrices=['rgb','bt709','bt470bg','smpte170m','bt2020-ncl'];
 class VideoColorSpace {
  constructor(init={}){
   const input=dictionary(init),fullRange=input.fullRange,matrix=input.matrix,primariesValue=input.primaries,transfer=input.transfer;
   const state={primaries:primariesValue==null?null:enumeration(primariesValue,primaries),transfer:transfer==null?null:enumeration(transfer,transfers),matrix:matrix==null?null:enumeration(matrix,matrices),fullRange:fullRange==null?null:!!fullRange};
   bridge.setColor(this,state);bridge.register(this,{kind:'VideoColorSpace',read:()=>({kind:'NonCloneableWebCodec'})});
  }
  get primaries(){return getColor(this).primaries}
  get transfer(){return getColor(this).transfer}
  get matrix(){return getColor(this).matrix}
  get fullRange(){return getColor(this).fullRange}
  toJSON(){const s=getColor(this);return{primaries:s.primaries,transfer:s.transfer,matrix:s.matrix,fullRange:s.fullRange}}
 }
 const shape=C=>{const p=C.prototype;for(const key of keys(p)){if(key==='constructor')continue;const d=g.Object.getOwnPropertyDescriptor(p,key);define(p,key,{...d,enumerable:true})}delete p.constructor;define(p,'constructor',{value:C,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:C.name,configurable:true});};
 shape(VideoColorSpace);
 function makeChunk(name){
  const stateFor=value=>{const state=bridge.chunk(value);if(!state)throw error('Illegal invocation');if(state.interface!==name)throw error('Illegal invocation');return state};
  const C=class {
   constructor(init){
    const input=dictionary(init),data=input.data;
    if(!bridge.isData(data))throw error('invalid argument');
    const durationValue=input.duration;
    const duration=durationValue==null?null:integer(durationValue);
    if(duration!==null&&duration<0)throw error('invalid argument');
    const timestampValue=input.timestamp;
    if(timestampValue===undefined)throw error('invalid argument');
    const timestamp=integer(timestampValue),transferValue=input.transfer;
    let transfer=[];
    if(transferValue!==undefined){if(transferValue==null||typeof transferValue[iterator]!=='function')throw error('invalid argument');transfer=apply(from,Array,[transferValue]);}
    const typeValue=input.type;
    if(typeValue===undefined)throw error('invalid argument');
    const type=enumeration(typeValue,['key','delta']);
    for(let index=0;index<transfer.length;index++)if(!bridge.isTransfer(transfer[index]))throw error('');
    const preparation=bridge.snapshot(data,transfer);
    if(!preparation.ok)throw cloneError();
    const state={interface:name,type,timestamp,duration,bytes:preparation.bytes};bridge.setChunk(this,state);
    bridge.register(this,{kind:name,read:()=>({kind:'EncodedChunk',interface:name,type,timestamp,duration,bytes:bridge.copy(state.bytes)})});
   }
   get type(){return stateFor(this).type}
   get timestamp(){return stateFor(this).timestamp}
   get duration(){return stateFor(this).duration}
   get byteLength(){return stateFor(this).bytes.length}
   copyTo(destination){const state=stateFor(this);if(!bridge.isData(destination))throw error('invalid argument');if(!bridge.write(destination,state.bytes))throw error('')}
  };
  define(C,'name',{value:name,configurable:true});shape(C);return C;
 }
 const EncodedAudioChunk=makeChunk('EncodedAudioChunk'),EncodedVideoChunk=makeChunk('EncodedVideoChunk');
 for(const C of[VideoColorSpace,EncodedAudioChunk,EncodedVideoChunk])define(g,C.name,{value:C,writable:true,configurable:true});
 return{construct(record){const C=record.interface==='EncodedAudioChunk'?EncodedAudioChunk:record.interface==='EncodedVideoChunk'?EncodedVideoChunk:null;if(!C)throw cloneError();return new C({data:record.bytes,timestamp:record.timestamp,duration:record.duration,type:record.type})}};
}

export function installWebCodecsValues(realm){
 if(installed.has(realm))return installed.get(realm);
 const api=realm.eval(`(${factory.toString()})`)(realm,{
  color:value=>colorStates.get(value),setColor:(value,state)=>colorStates.set(value,state),
  chunk:value=>chunkStates.get(value),setChunk:(value,state)=>chunkStates.set(value,state),
  register(value,record){registerPlatformFactory(value,{...record,globalObject:realm})},
  isData:allowedData,
  isTransfer:value=>types.isArrayBuffer(value),
  copy:bytes=>bytes.slice(),
  snapshot(data,transfer){
   const seen=new Set(),buffers=[];for(let index=0;index<transfer.length;index++){const buffer=transfer[index];if(seen.has(buffer))return{ok:false};seen.add(buffer);try{new Uint8Array(buffer)}catch{return{ok:false}}buffers.push(buffer)}
   const bytes=byteView(data).slice();
   try{nativeClone(null,{transfer:buffers});return{ok:true,bytes}}catch{return{ok:false}}
  },
  write(destination,bytes){try{const view=byteView(destination);if(view.length<bytes.length)return false;view.set(bytes);return true}catch{return false}},
 });
 installed.set(realm,api);return api;
}
export function encodedChunkData(value){const provenance=platformFactoryRecord(value);return provenance&&['EncodedAudioChunk','EncodedVideoChunk'].includes(provenance.kind)?provenance.read():null}
export function validEncodedChunk(record){return !!record&&record.kind==='EncodedChunk'&&['EncodedAudioChunk','EncodedVideoChunk'].includes(record.interface)&&['key','delta'].includes(record.type)&&Number.isSafeInteger(record.timestamp)&&(record.duration===null||Number.isSafeInteger(record.duration)&&record.duration>=0)&&types.isUint8Array(record.bytes)}
export function deserializeEncodedChunk(realm,record){const api=installed.get(realm);if(!api||!validEncodedChunk(record))throw Error('Invalid encoded chunk receiver');return api.construct(record)}
