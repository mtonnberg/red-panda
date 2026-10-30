import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { createRequire } from 'node:module';
import { types } from 'node:util';

const require=createRequire(import.meta.url);
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const BlobImpl=require('jsdom/lib/jsdom/living/file-api/Blob-impl.js').implementation;
const FileImpl=require('jsdom/lib/jsdom/living/file-api/File-impl.js').implementation;
const nativeType=Object.getOwnPropertyDescriptor(NativeBlob.prototype,'type').get;
const nativeSize=Object.getOwnPropertyDescriptor(NativeBlob.prototype,'size').get;
const nativeName=Object.getOwnPropertyDescriptor(NativeFile.prototype,'name').get;
const nativeModified=Object.getOwnPropertyDescriptor(NativeFile.prototype,'lastModified').get;
const nativeBytes=NativeBlob.prototype.arrayBuffer;
const hasInstance=Function.prototype[Symbol.hasInstance];

/** This codec never recognizes authored object tags or marker properties.
 * A private envelope Map associates genuine source platform objects' fresh
 * graph placeholders with typed records. Native cloning preserves Map-key /
 * payload aliases. NativeBlob carries immutable bytes across actual threads.
 */
export function createPlatformCodec(realm){
 const Blob=realm.Blob,File=realm.File;
 const probe=typeof Blob==='function'?new Blob([]):null;
 const dom=probe&&implForWrapper(probe) instanceof BlobImpl;
 const failure=message=>new realm.DOMException(message,'DataCloneError');
 function serialize(value){
  if(!probe)return null;
  const implementation=implForWrapper(value);
  if(implementation instanceof BlobImpl){
   const bytes=new Uint8Array(implementation._buffer),isFile=implementation instanceof FileImpl;
   return{kind:isFile?'File':'Blob',blob:new NativeBlob([bytes],{type:implementation.type}),type:implementation.type,bytes,
    ...(isFile?{name:implementation.name,lastModified:implementation.lastModified}:{})};
  }
  if(hasInstance.call(NativeBlob,value)){
   // Captured intrinsic getters validate the actual Node platform state and
   // ignore authored own size/type/name overrides. No private symbols are read.
   const type=nativeType.call(value);nativeSize.call(value);
   const isFile=hasInstance.call(NativeFile,value);
   return{kind:isFile?'File':'Blob',blob:value,type,
    ...(isFile?{name:nativeName.call(value),lastModified:nativeModified.call(value)}:{})};
  }
  return null;
 }
 function records(message){
  if(message.platforms===undefined)return null;
  if(!types.isMap(message.platforms))throw failure('Malformed platform graph');
  for(const[placeholder,record]of message.platforms){
   if(!placeholder||typeof placeholder!=='object'||!record||!['Blob','File'].includes(record.kind))throw failure('Malformed platform node');
   if(record.blob!==undefined){try{nativeSize.call(record.blob);nativeType.call(record.blob)}catch{throw failure('Platform node has no immutable Blob bytes')}}
   else if(record.bytes===undefined||typeof record.type!=='string')throw failure('Platform node has no byte snapshot');
   if(record.bytes!==undefined&&!ArrayBuffer.isView(record.bytes))throw failure('Invalid platform byte snapshot');
   if(record.kind==='File'&&(typeof record.name!=='string'||typeof record.lastModified!=='number'))throw failure('Invalid File metadata');
  }
  return message.platforms;
 }
 function needsAsync(message){
  const map=records(message);return !!(dom&&map&&[...map.values()].some(record=>record.bytes===undefined));
 }
 async function hydrate(message){
  const map=records(message);if(!dom||!map)return;
  await Promise.all([...map.values()].filter(record=>record.bytes===undefined).map(async record=>{record.bytes=new Uint8Array(await nativeBytes.call(record.blob))}));
 }
 function needsBroadcastBytes(message){const map=records(message);return!!(map&&[...map.values()].some(record=>record.bytes===undefined))}
 function stripNativeHandles(message){const map=records(message);if(map)for(const record of map.values()){if(record.bytes===undefined)throw failure('Broadcast bytes are not ready');delete record.blob}return message}
 async function broadcastBody(message){
  const map=records(message);
  if(map)await Promise.all([...map.values()].filter(record=>record.bytes===undefined).map(async record=>{record.bytes=new Uint8Array(await nativeBytes.call(record.blob))}));
  return stripNativeHandles(message);
 }
 function deserialize(record){
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
