import { randomBytes } from 'node:crypto';
const entries = FormData.prototype.entries;
const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type').get;
const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get;
const fileName = Object.getOwnPropertyDescriptor(File.prototype, 'name').get;
const blobBytes = Blob.prototype.arrayBuffer;
export const readWorkerBlobBytes = blob => Reflect.apply(blobBytes,blob,[]);
export const workerBlobType = blob => Reflect.apply(blobType,blob,[]);
export const workerBlobSize = blob => Reflect.apply(blobSize,blob,[]);
const normalize = value => String(value).replace(/\r\n|\r|\n/g, '\r\n');
const escape = value => normalize(value).replaceAll('\r','%0D').replaceAll('\n','%0A').replaceAll('"','%22');

function parts(form) {
  const boundary = `----redpanda-${randomBytes(12).toString('hex')}`, values = [];
  for (const [name,value] of Reflect.apply(entries,form,[])) {
    let header=`--${boundary}\r\nContent-Disposition: form-data; name="${escape(name)}"`;
    if(typeof value==='string') values.push({header:header+'\r\n\r\n',text:normalize(value)});
    else {
      header+=`; filename="${escape(Reflect.apply(fileName,value,[]))}"\r\nContent-Type: ${Reflect.apply(blobType,value,[])||'application/octet-stream'}\r\n\r\n`;
      values.push({header,blob:value});
    }
  }
  return {boundary,values};
}
function collect(boundary,values,maxBytes) {
  const chunks=[];let length=0;
  const append=value=>{const bytes=typeof value==='string'?Buffer.from(value):value;length+=bytes.length;if(length>maxBytes)throw new DOMException('Multipart upload exceeds its buffered byte limit','QuotaExceededError');chunks.push(bytes)};
  for(const value of values){append(value.header);append(value.bytes??value.text);append('\r\n')}
  append(`--${boundary}--\r\n`);
  return {bytes:new Uint8Array(Buffer.concat(chunks,length)),contentType:`multipart/form-data; boundary=${boundary}`};
}
export function encodeWorkerMultipartSync(form,readBlob,{maxBytes=8*1024*1024}={}) {
  const {boundary,values}=parts(form);
  for(const value of values)if(value.blob)value.bytes=new Uint8Array(readBlob(value.blob));
  return collect(boundary,values,maxBytes);
}
export async function encodeWorkerMultipart(form,{maxBytes=64*1024*1024}={}) {
  const {boundary,values}=parts(form);
  for(const value of values)if(value.blob)value.bytes=new Uint8Array(await readWorkerBlobBytes(value.blob));
  return collect(boundary,values,maxBytes);
}
