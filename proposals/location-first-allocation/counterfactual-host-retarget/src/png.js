// Independent PNG/RFC1950 encoder over real 8-bit RGBA samples. The scanline,
// DEFLATE, Adler32 and chunk CRCs are generated; no reference image is stored.
import { deflateRawSync, constants } from 'node:zlib';
import { types } from 'node:util';
const MAX_BYTES=64*1024*1024;
const typed=Object.getPrototypeOf(Uint8Array.prototype),length=Object.getOwnPropertyDescriptor(typed,'length').get,subarray=typed.subarray;
const table=Uint32Array.from({length:256},(_,value)=>{for(let k=0;k<8;k++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0});
export function pngCRC(bytes){let value=0xffffffff;for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0}
function chunk(type,data){const kind=Buffer.from(type,'ascii'),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);kind.copy(result,4);data.copy(result,8);result.writeUInt32BE(pngCRC(Buffer.concat([kind,data])),result.length-4);return result}
export function encodeRGBAPNG(width,height,rgba){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>0x7fffffff||height>0x7fffffff)throw new RangeError('Invalid PNG dimensions');
 if(!types.isUint8Array(rgba)&&!types.isUint8ClampedArray(rgba))throw new TypeError('PNG samples must be actual 8-bit RGBA bytes');
 const size=width*height*4;if(!Number.isSafeInteger(size)||size>MAX_BYTES)throw new RangeError('PNG pixel limit exceeded');if(length.call(rgba)!==size)throw new RangeError('PNG sample length does not match dimensions');
 const stride=width*4,raw=Buffer.alloc(size+height);for(let row=0;row<height;row++){raw[row*(stride+1)]=0;raw.set(subarray.call(rgba,row*stride,(row+1)*stride),row*(stride+1)+1)}
 const compressed=deflateRawSync(raw,{level:6,strategy:constants.Z_RLE});
 // Explicit RFC1950 header: DEFLATE,32KiB window, compression level6 metadata,
 // no preset dictionary. The five check bits make the header divisible by31.
 const cmf=((15-8)<<4)|8,flags=2<<6,flg=flags+(31-(((cmf<<8)|flags)%31))%31;
 let a=1,b=0;for(const byte of raw){a=(a+byte)%65521;b=(b+a)%65521}const checksum=Buffer.alloc(4);checksum.writeUInt32BE(((b<<16)|a)>>>0);
 const idat=Buffer.concat([Buffer.from([cmf,flg]),compressed,checksum]),ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
