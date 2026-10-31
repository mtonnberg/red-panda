import { createRequire } from 'node:module';
import { registerPlatformFactoryKind } from './platform-factory-hooks.js';
import { types } from 'node:util';
import { encodedChunkData } from './webcodecs-values.js';
import { registerPlatformFactory, platformFactoryRecord } from './platform-factories.js';

const require=createRequire(import.meta.url);
const {fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');
const installed=new WeakMap(),states=new WeakMap(),eventTargets=new WeakMap();
const typed=Object.getPrototypeOf(Uint8Array.prototype),get=(p,k)=>Object.getOwnPropertyDescriptor(p,k).get;
const tb=get(typed,'buffer'),tl=get(typed,'byteLength'),to=get(typed,'byteOffset'),db=get(DataView.prototype,'buffer'),dl=get(DataView.prototype,'byteLength'),dof=get(DataView.prototype,'byteOffset');
function snapshotBytes(value){
 if(types.isArrayBuffer(value)){try{return new Uint8Array(value).slice()}catch{return new Uint8Array()}}
 if(!ArrayBuffer.isView(value))return null;
 const view=types.isDataView(value),buffer=(view?db:tb).call(value);if(types.isSharedArrayBuffer(buffer))return null;
 try{return new Uint8Array(buffer,(view?dof:to).call(value),(view?dl:tl).call(value)).slice()}catch{return new Uint8Array()}
}

// No media codec backend is registered. Support queries reflect this actual
// capability; queued configuration closes with NotSupportedError, never output.
function factory(g,bridge){
 const TypeError=g.TypeError,Exception=g.DOMException,Promise=g.Promise,EventTarget=g.EventTarget;
 const own=g.Object.hasOwn,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,ownKeys=g.Reflect.ownKeys,apply=g.Reflect.apply;
 const Number=g.Number,String=g.String,trunc=g.Math.trunc,finite=Number.isFinite,trim=String.prototype.trim;
 const symbolDescription=descriptor(g.Symbol.prototype,'description').get,toStringTag=g.Symbol.toStringTag;
 const U8=g.Uint8Array,u8Set=U8.prototype.set;
 const typeError=message=>new TypeError(message),invalidState=()=>new Exception('The object is in an invalid state','InvalidStateError');
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 const put=(target,key,value)=>define(target,key,{value,enumerable:true,writable:true,configurable:true});
 const string=value=>typeof value==='symbol'?apply(symbolDescription,value,[])??'':String(value);
 const exception=(support,argument=false)=>typeError(support?'invalid configuration':argument?'invalid argument':'');
 const dictionary=(value,support)=>{if(value==null)return{};if(!object(value))throw exception(support,true);return value};
 const has=(value,key)=>key in value;
 const includes=(list,value)=>{for(let i=0;i<list.length;i++)if(list[i]===value)return true;return false};
 const enums={hardwareAcceleration:['no-preference','prefer-software','prefer-hardware'],bitrateMode:['constant','variable','quantizer'],latencyMode:['quality','realtime'],alpha:['keep','discard']};
 const colorEnums={primaries:['bt709','bt470bg','smpte170m','bt2020','smpte432'],transfer:['bt709','smpte170m','iec61966-2-1','linear','pq','hlg'],matrix:['rgb','bt709','bt470bg','smpte170m','bt2020-ncl']};
 const fields={
  AudioDecoder:['codec','description','numberOfChannels','sampleRate'],
  VideoDecoder:['codec','codedHeight','codedWidth','colorSpace','description','displayAspectHeight','displayAspectWidth','flip','hardwareAcceleration','optimizeForLatency','rotation'],
  AudioEncoder:['aac','bitrate','bitrateMode','codec','flac','numberOfChannels','opus','sampleRate'],
  VideoEncoder:['alpha','av1','avc','bitrate','bitrateMode','codec','contentHint','displayHeight','displayWidth','framerate','hardwareAcceleration','height','hevc','latencyMode','scalabilityMode','width'],
 };
 const nested={
  opus:{application:'audio',complexity:undefined,format:'opus',frameDuration:20000,packetlossperc:0,signal:'auto',usedtx:false,useinbandfec:false},
  aac:{format:'aac'},flac:{blockSize:0,compressLevel:5},av1:{forceScreenContentTools:false},avc:{format:'avc'},hevc:{format:'hevc'},
 };
 const nestedFields={opus:['application','complexity','format','frameDuration','packetlossperc','signal','usedtx','useinbandfec'],aac:['format'],flac:['blockSize','compressLevel'],av1:['forceScreenContentTools'],avc:['format'],hevc:['format']};
 const boolFields=['flip','optimizeForLatency','fullRange','usedtx','useinbandfec','forceScreenContentTools'];
 const uintFields=['numberOfChannels','sampleRate','codedHeight','codedWidth','displayAspectHeight','displayAspectWidth','displayHeight','displayWidth','height','width','complexity','frameDuration','packetlossperc','blockSize','compressLevel'];
 bridge.constants(fields,enums,colorEnums,nested,nestedFields,boolFields,uintFields);
 function convert(value,key,support){
  if(includes(boolFields,key))return !!value;
  if(includes(uintFields,key)){const number=+value;return finite(number)&&number>=0&&number<=4294967295?trunc(number):-1;}
  if(key==='bitrate'){const number=+value;return finite(number)&&number>=0&&number<=9007199254740991?trunc(number):-1;}
  if(key==='framerate'||key==='rotation')return +value;
  if(key==='description'){const bytes=bridge.bytes(value);if(bytes===null)throw exception(support,true);const result=new U8(bytes.length);apply(u8Set,result,[bytes]);return result.buffer;}
  return string(value);
 }
 function parseNested(input,key,support){
  const source=dictionary(input,support),result={},list=key==='colorSpace'?['fullRange','matrix','primaries','transfer']:nestedFields[key];
  for(let i=0;i<list.length;i++){const name=list[i];let value=has(source,name)?source[name]:undefined;
   if(value==null){if(key!=='colorSpace')value=nested[key][name];else continue;}
   if(value!==undefined)put(result,name,convert(value,name,support));
  }
  return result;
 }
 function parse(config,name,support){
  const source=dictionary(config,support),copy={},list=fields[name],required=(name==='AudioDecoder'||name==='AudioEncoder')?['codec','numberOfChannels','sampleRate']:name==='VideoEncoder'?['codec','height','width']:['codec'];
  for(let i=0;i<list.length;i++){const key=list[i];let value=has(source,key)?source[key]:undefined;
   if(value===undefined){if(includes(required,key))throw exception(support,true);if(key==='hardwareAcceleration')value='no-preference';else if(key==='bitrateMode')value='variable';else if(key==='alpha')value='discard';else if(key==='latencyMode')value='quality';else if(key==='flip'||key==='optimizeForLatency')value=false;else if(key==='rotation')value=0;else continue;}
   if(value===null&&!includes(required,key))continue;
   put(copy,key,key==='colorSpace'||own(nested,key)?parseNested(value,key,support):convert(value,key,support));
  }
  return copy;
 }
 function validate(config,name,support){
  const fail=()=>{throw exception(support)};
  if(!apply(trim,config.codec,[]).length)fail();
  if((name==='AudioDecoder'||name==='AudioEncoder')&&(!(config.numberOfChannels>0)||!(config.sampleRate>0)))fail();
  if(name==='AudioDecoder'&&config.codec==='opus'&&config.numberOfChannels>2)fail();
  if(name==='AudioEncoder'&&config.codec==='opus'&&own(config,'bitrate')&&(config.bitrate<6000||config.bitrate>510000))fail();
  if(name==='VideoEncoder'&&(!(config.width>0)||!(config.height>0)))fail();
  const dimensions=['codedHeight','codedWidth','displayAspectHeight','displayAspectWidth','displayHeight','displayWidth'];for(let i=0;i<dimensions.length;i++){const key=dimensions[i];if(own(config,key)&&!(config[key]>0))fail();}
  if(name==='VideoDecoder'&&((own(config,'codedHeight')!==own(config,'codedWidth'))||(own(config,'displayAspectHeight')!==own(config,'displayAspectWidth'))))fail();
  if(own(config,'bitrate')&&!(config.bitrate>0))fail();
  if(own(config,'framerate')&&!finite(config.framerate)||own(config,'rotation')&&!finite(config.rotation))fail();
  const enumKeys=['hardwareAcceleration','bitrateMode','latencyMode','alpha'];for(let i=0;i<enumKeys.length;i++){const key=enumKeys[i];if(own(config,key)&&!includes(enums[key],config[key]))fail();}
  if(own(config,'colorSpace')){const colorKeys=['matrix','primaries','transfer'];for(let i=0;i<colorKeys.length;i++){const key=colorKeys[i];if(has(config.colorSpace,key)&&!includes(colorEnums[key],config.colorSpace[key]))fail();}}
  const opus=own(config,'opus')?config.opus:null;if(opus){
   if(!includes(['audio','voip','lowdelay'],opus.application)||!includes(['opus','ogg'],opus.format)||!includes(['auto','music','voice'],opus.signal))fail();
   if(own(opus,'complexity')&&(opus.complexity<0||opus.complexity>10)||opus.packetlossperc<0||opus.packetlossperc>100||!includes([2500,5000,10000,20000,40000,60000,80000,100000,120000],opus.frameDuration))fail();
  }
  if(own(config,'aac')&&!includes(['aac','adts'],config.aac.format)||own(config,'avc')&&!includes(['avc','annexb'],config.avc.format)||own(config,'hevc')&&!includes(['hevc','annexb'],config.hevc.format))fail();
  if(own(config,'flac')&&(config.flac.blockSize<0||config.flac.compressLevel<0||config.flac.compressLevel>8))fail();
 }
 function receiver(value,name){if(!bridge.brand(value,name))throw typeError('Illegal invocation')}
 function make(name){
  const decoder=name.endsWith('Decoder'),queueName=decoder?'decodeQueueSize':'encodeQueueSize';
  const C=class extends EventTarget{
   constructor(init){
    const source=dictionary(init,false),error=has(source,'error')?source.error:undefined;
    if(typeof error!=='function')throw typeError('invalid argument');
    const output=has(source,'output')?source.output:undefined;if(typeof output!=='function')throw typeError('invalid argument');
    super();bridge.create(this,name,error,output);
   }
   get state(){receiver(this,name);return bridge.read(this,'state')}
   get ondequeue(){receiver(this,name);return bridge.read(this,'handler')}
   set ondequeue(value){receiver(this,name);bridge.handler(this,typeof value==='function'?value:null)}
   configure(config){receiver(this,name);const copy=parse(config,name,false);validate(copy,name,false);if(bridge.read(this,'state')==='closed')throw invalidState();bridge.configure(this,copy)}
   flush(){return new Promise((resolve,reject)=>{if(!bridge.brand(this,name)){reject(typeError('invalid argument'));return}if(bridge.read(this,'state')!=='configured')reject(invalidState());else bridge.flush(this,resolve,reject)})}
   reset(){receiver(this,name);if(bridge.read(this,'state')==='closed')throw invalidState();bridge.reset(this,false)}
   close(){receiver(this,name);if(bridge.read(this,'state')==='closed')throw invalidState();bridge.reset(this,true)}
   static isConfigSupported(config){return new Promise((resolve,reject)=>{try{const copy=parse(config,name,true);validate(copy,name,true);resolve({supported:false,config:copy})}catch(error){reject(error)}})}
  };
  define(C,'name',{value:name,configurable:true});define(C,'isConfigSupported',{...descriptor(C,'isConfigSupported'),enumerable:true});
  define(C.prototype,queueName,{get(){receiver(this,name);return bridge.read(this,'queueSize')},enumerable:true,configurable:true});
  const operation=decoder?'decode':'encode';define(C.prototype,operation,{enumerable:true,configurable:true,writable:true,value:{[operation](input){
   receiver(this,name);const data=decoder?bridge.chunk(input):bridge.media(input,name==='AudioEncoder'?'AudioData':'VideoFrame');
   if(!data||decoder&&data.interface!==(name==='AudioDecoder'?'EncodedAudioChunk':'EncodedVideoChunk'))throw typeError('invalid argument');
   if(bridge.read(this,'state')!=='configured')throw invalidState();
   if(decoder&&bridge.read(this,'keyRequired')&&data.type!=='key')throw new Exception('Data provided to an operation does not meet requirements','DataError');
   bridge.enqueue(this,data);
  }}[operation]});
  // WebIDL enumeration order differs from class source order.
  const order=['state',queueName,'ondequeue','configure',operation,'flush','reset','close'];
  const descriptors=[];for(let i=0;i<order.length;i++){descriptors[i]=descriptor(C.prototype,order[i]);delete C.prototype[order[i]];}
  delete C.prototype.constructor;for(let i=0;i<order.length;i++)define(C.prototype,order[i],{...descriptors[i],enumerable:true});
  define(C.prototype,'constructor',{value:C,writable:true,configurable:true});define(C.prototype,toStringTag,{value:name,configurable:true});
  define(g,name,{value:C,writable:true,configurable:true});return C;
 }
 return{AudioDecoder:make('AudioDecoder'),VideoDecoder:make('VideoDecoder'),AudioEncoder:make('AudioEncoder'),VideoEncoder:make('VideoEncoder')};
}

function hidden(properties){return Object.assign(Object.create(null),properties)}
function copyConfiguration(value){
 if(value===null||typeof value!=='object')return value;
 if(types.isArrayBuffer(value)){try{return new Uint8Array(value).slice().buffer}catch{return new ArrayBuffer(0)}}
 const copy=Object.create(null);for(const key of Reflect.ownKeys(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(descriptor&&'value'in descriptor)Object.defineProperty(copy,key,{value:copyConfiguration(descriptor.value),enumerable:true,writable:true,configurable:true})}return copy;
}
export function installWebCodecsProcessors(realm,{trustEvent}={}){
 if(installed.has(realm))return installed.get(realm);
 for(const kind of['AudioDecoder','VideoDecoder','AudioEncoder','VideoEncoder'])registerPlatformFactoryKind(kind);
 const Event=realm.Event,Exception=realm.DOMException,dispatch=realm.EventTarget.prototype.dispatchEvent,add=realm.EventTarget.prototype.addEventListener,remove=realm.EventTarget.prototype.removeEventListener;
 const setTimer=realm.setTimeout,clearTimer=realm.clearTimeout;
 const timer=callback=>Reflect.apply(setTimer,realm,[callback,0]),cancel=id=>{if(id!==null)Reflect.apply(clearTimer,realm,[id])};
 const emit=value=>{const implementation=eventTargets.get(value);if(implementation)fireAnEvent('dequeue',implementation);else{const event=new Event('dequeue');Reflect.apply(dispatch,value,[trustEvent?trustEvent(event):event])}};
 const runtime=hidden({timer,cancel,emit,Exception,add,remove});
 const dequeue=state=>{if(state.dequeueTask!==null)return;state.dequeueTask=state.runtime.timer(()=>{state.dequeueTask=null;state.runtime.emit(state.value)})};
 const discard=(state,next,error)=>{
  state.runtime.cancel(state.configurationTask);state.configurationTask=null;state.work.length=0;
  if(state.queueSize>0){state.queueSize=0;dequeue(state)}
  state.state=next;state.keyRequired=true;const pending=state.flushes;state.flushes=[];
  for(const flush of pending)flush.reject(error);
 };
 const api=realm.eval(`(${factory.toString()})`)(realm,{
  constants(...values){const seen=new WeakSet();function freeze(value){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(d&&'value'in d)freeze(d.value)}Object.freeze(value)}for(const value of values)freeze(value)},
  brand:(value,name)=>states.get(value)?.interface===name,
  read:(value,key)=>['state','queueSize','keyRequired','handler'].includes(key)?states.get(value)[key]:undefined,
  bytes:snapshotBytes,chunk:encodedChunkData,
  media(value,kind){const provenance=platformFactoryRecord(value);if(provenance?.kind!==kind||typeof provenance.read!=='function')return null;const record=provenance.read();return record?.closed?null:record},
  create(value,kind,error,output){
   const implementation=platformFactoryRecord(value)?.implementation;if(implementation)eventTargets.set(value,implementation);
   const state=hidden({value,runtime,interface:kind,state:'unconfigured',queueSize:0,keyRequired:true,error,output,handler:null,listener:null,configurationTask:null,dequeueTask:null,flushes:[],work:[]});
   states.set(value,state);registerPlatformFactory(value,{kind,globalObject:realm,implementation:state});
  },
  handler(value,handler){
   const state=states.get(value);if(!handler&&state.listener){Reflect.apply(state.runtime.remove,value,['dequeue',state.listener]);state.listener=null}state.handler=handler;
   if(handler&&!state.listener){state.listener=event=>{if(state.handler)Reflect.apply(state.handler,value,[event])};Reflect.apply(state.runtime.add,value,['dequeue',state.listener])}
  },
  configure(value,config){
   const state=states.get(value);state.state='configured';state.keyRequired=true;state.work.push(hidden({kind:'configure',config:copyConfiguration(config)}));
   if(state.configurationTask===null)state.configurationTask=state.runtime.timer(()=>{
    state.configurationTask=null;if(state.state!=='configured')return;
    const error=new state.runtime.Exception('The operation is not supported','NotSupportedError');discard(state,'closed',error);Reflect.apply(state.error,undefined,[error]);
   });
  },
  enqueue(value,data){const state=states.get(value);state.queueSize++;state.keyRequired=false;state.work.push(hidden({kind:'input',data}))},
  flush(value,resolve,reject){const state=states.get(value);state.keyRequired=true;state.flushes.push(hidden({resolve,reject}))},
  reset(value,closed){const state=states.get(value);discard(state,closed?'closed':'unconfigured',new state.runtime.Exception('The operation was aborted','AbortError'))},
 });
 installed.set(realm,api);return api;
}
