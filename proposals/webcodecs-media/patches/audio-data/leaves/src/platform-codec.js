import { audioDataRecord, validAudioDataRecord, deserializeAudioData } from './audio-data.js';
import { isCanvasCloneRejected } from './canvas.js';
import { imageDataRecord, validImageDataRecord, deserializeImageData } from './image-data.js';
import { encodedChunkData, validEncodedChunk, deserializeEncodedChunk } from './webcodecs-values.js';
import { installNativePlatformFactories } from './native-platform-factories.js';
import { platformFactoryRecord } from './platform-factories.js';
import { geometryFactoryData, validGeometryRecord, deserializeGeometry } from './geometry-platform.js';
import { Blob as NativeBlob } from 'node:buffer';
import { types } from 'node:util';

const nativeType=Object.getOwnPropertyDescriptor(NativeBlob.prototype,'type').get;
const nativeSize=Object.getOwnPropertyDescriptor(NativeBlob.prototype,'size').get;
const nativeBytes=NativeBlob.prototype.arrayBuffer;

/** This codec never recognizes authored object tags or marker properties.
 * A private envelope Map associates genuine source platform objects' fresh
 * graph placeholders with typed records. Native cloning preserves Map-key /
 * payload aliases. NativeBlob carries immutable bytes across actual threads.
 */
export function createPlatformCodec(realm){
 installNativePlatformFactories(realm);
 const Blob=realm.Blob,File=realm.File;
 const probe=typeof Blob==='function'?new Blob([]):null;
 const dom=probe&&!!platformFactoryRecord(probe)?.implementation;
 const isBytes=record=>record.kind==='Blob'||record.kind==='File';
 const Exception=realm.DOMException;
 const failure=message=>new Exception(message,'DataCloneError');
 function serialize(value){
  const provenance=platformFactoryRecord(value);
  if(isCanvasCloneRejected(value))throw failure('The object can not be cloned');
  if(types.isProxy(value)&&!provenance)throw failure('Proxy objects cannot be structured cloned');
  if(provenance?.kind==='VideoColorSpace')throw failure('The object can not be cloned');
  const encoded=encodedChunkData(value);if(encoded){if(!validEncodedChunk(encoded))throw failure('Invalid encoded chunk');return encoded;}
  const audio=audioDataRecord(value);if(audio){if(!validAudioDataRecord(audio))throw failure('The object can not be cloned');return audio;}
  const image=imageDataRecord(value);if(image){if(!validImageDataRecord(image))throw failure('Invalid ImageData clone');return image;}
  const geometry=geometryFactoryData(value);
  if(geometry){if(!validGeometryRecord(geometry))throw failure('The object can not be cloned');return geometry;}
  if(!probe)return null;
  if(provenance&&(provenance.kind==='Blob'||provenance.kind==='File')){
   if(provenance.read)return provenance.read();
   const implementation=provenance.implementation;
   const bytes=new Uint8Array(implementation._buffer),isFile=provenance.kind==='File';
   return{kind:isFile?'File':'Blob',blob:new NativeBlob([bytes],{type:implementation.type}),type:implementation.type,bytes,
    ...(isFile?{name:implementation.name,lastModified:implementation.lastModified}:{})};
  }

  return null;
 }
 function records(message){
  if(message.platforms===undefined)return null;
  if(!types.isMap(message.platforms))throw failure('Malformed platform graph');
  for(const[placeholder,record]of message.platforms){
   if(!placeholder||typeof placeholder!=='object'||!record||!['Blob','File','Geometry','EncodedChunk','ImageData','AudioData'].includes(record.kind))throw failure('Malformed platform node');
   if(record.kind==='EncodedChunk'){if(!validEncodedChunk(record))throw failure('Malformed encoded chunk');continue;}
   if(record.kind==='AudioData'){if(!validAudioDataRecord(record))throw failure('Malformed AudioData node');continue;}
   if(record.kind==='ImageData'){if(!validImageDataRecord(record))throw failure('Malformed ImageData node');continue;}
   if(record.kind==='Geometry'){if(!validGeometryRecord(record))throw failure('Malformed geometry node');continue;}
   if(record.blob!==undefined){try{nativeSize.call(record.blob);nativeType.call(record.blob)}catch{throw failure('Platform node has no immutable Blob bytes')}}
   else if(record.bytes===undefined||typeof record.type!=='string')throw failure('Platform node has no byte snapshot');
   if(record.bytes!==undefined&&!ArrayBuffer.isView(record.bytes))throw failure('Invalid platform byte snapshot');
   if(record.kind==='File'&&(typeof record.name!=='string'||typeof record.lastModified!=='number'))throw failure('Invalid File metadata');
  }
  return message.platforms;
 }
 function needsAsync(message){
  const map=records(message);return !!(dom&&map&&[...map.values()].some(record=>isBytes(record)&&record.bytes===undefined));
 }
 async function hydrate(message){
  const map=records(message);if(!dom||!map)return;
  await Promise.all([...map.values()].filter(record=>isBytes(record)&&record.bytes===undefined).map(async record=>{record.bytes=new Uint8Array(await nativeBytes.call(record.blob))}));
 }
 function needsBroadcastBytes(message){const map=records(message);return!!(map&&[...map.values()].some(record=>isBytes(record)&&record.bytes===undefined))}
 function stripNativeHandles(message){const map=records(message);if(map)for(const record of map.values()){if(!isBytes(record))continue;if(record.bytes===undefined)throw failure('Broadcast bytes are not ready');delete record.blob}return message}
 async function broadcastBody(message){
  const map=records(message);
  if(map)await Promise.all([...map.values()].filter(record=>isBytes(record)&&record.bytes===undefined).map(async record=>{record.bytes=new Uint8Array(await nativeBytes.call(record.blob))}));
  return stripNativeHandles(message);
 }
 function deserialize(record){
  if(record.kind==='AudioData'){try{return deserializeAudioData(realm,record)}catch{throw failure('Invalid AudioData receiver')}}
  if(record.kind==='ImageData'){try{return deserializeImageData(realm,record)}catch{throw failure('Invalid ImageData receiver')}}
  if(record.kind==='EncodedChunk'){try{return deserializeEncodedChunk(realm,record)}catch{throw failure('Invalid encoded chunk receiver')}}
  if(record.kind==='Geometry'){try{return deserializeGeometry(realm,record)}catch{throw failure('Invalid geometry receiver')}}
  if(!probe)throw failure('Receiver realm does not support Blob');
  if(record.kind==='File'&&typeof File!=='function')throw failure('Receiver realm does not support File');
  const type=record.type??nativeType.call(record.blob);
  let parts;
  if(dom){if(record.bytes===undefined)throw failure('Blob bytes require asynchronous event decoding');parts=[record.bytes]}
  else parts=[record.blob??record.bytes];
  return record.kind==='File'?new File(parts,record.name,{type,lastModified:record.lastModified}):new Blob(parts,{type});
 }
 return{serialize,records,needsAsync,hydrate,deserialize,needsBroadcastBytes,stripNativeHandles,broadcastBody};
}
