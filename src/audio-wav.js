// Independent RIFF/WAVE parsing and real PCM conversion. No media samples or
// native decoding library are embedded. Unsupported encodings return null.
import {types} from 'node:util';
const U8=Uint8Array,F32=Float32Array,View=DataView,f=Math.fround,floor=Math.floor,min=Math.min,max=Math.max;
const length=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const byte=View.prototype.getUint8,u16=View.prototype.getUint16,u32=View.prototype.getUint32,i16=View.prototype.getInt16,i32=View.prototype.getInt32,f32=View.prototype.getFloat32,f64=View.prototype.getFloat64,apply=Reflect.apply;
const slot=fields=>Object.assign(Object.create(null),fields);
export function decodeAudioWav(input,outputRate){
 if(!types.isArrayBuffer(input))return null;
 let bytes;try{length.call(input);bytes=new U8(new U8(input))}catch{return null}
 const view=new View(bytes.buffer),get=(method,at)=>apply(method,view,[at,true]),tag=(at,name)=>{if(at+name.length>bytes.length)return false;for(let i=0;i<name.length;i++)if(bytes[at+i]!==name.charCodeAt(i))return false;return true};
 if(bytes.length<12||!tag(0,'RIFF')||!tag(8,'WAVE'))return null;
 let format=null,data=null;for(let at=12;at+8<=bytes.length;){const size=min(get(u32,at+4),bytes.length-at-8),start=at+8;if(tag(at,'fmt '))format=slot({start,size});else if(tag(at,'data')){data=slot({start,size});if(format)break}at=start+size+(size%2)}
 if(!format||format.size<16||!data)return null;
 const base=format.start,channels=get(u16,base+2),rate=f(get(u32,base+4)),alignment=get(u16,base+12),bits=get(u16,base+14);let encoding=get(u16,base);
 if(encoding===65534){if(format.size<26)return null;encoding=get(u16,base+24)}
 const width=bits/8;if(!channels||channels>32||!rate||alignment!==channels*width||encoding===1&&![8,16,24,32].includes(bits)||encoding===3&&![32,64].includes(bits)||![1,3].includes(encoding))return null;
 const frames=floor(data.size/alignment);if(!frames)return null;
 const count=rate===outputRate?frames:max(1,min(4294967295,floor(frames*outputRate/rate)));if(count*channels>33554432)return null;
 const read=(frame,channel)=>{const at=data.start+(frame*channels+channel)*width;if(encoding===3)return bits===32?get(f32,at):f(get(f64,at));if(bits===8)return f((get(byte,at)-128)/128);if(bits===16)return f(get(i16,at)/32768);if(bits===24){let value=bytes[at]+bytes[at+1]*256+bytes[at+2]*65536;if(value>=8388608)value-=16777216;return f(value/8388608)}return f(get(i32,at)/2147483648)};
 const step=rate/outputRate,output=[];for(let channel=0;channel<channels;channel++){const values=new F32(count);for(let i=0;i<count;i++){if(rate===outputRate){values[i]=read(i,channel);continue}const position=i*step,index=min(floor(position),frames-1),t=f(position-index),a=read(index,channel),b=read(min(index+1,frames-1),channel);values[i]=f(a+f(f(b-a)*t))}output.push(values)}
 return slot({channels:output,length:count,rate:outputRate});
}
