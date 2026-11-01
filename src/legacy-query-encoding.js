// Private URL-parser query encoding over actual dependency codecs. No public
// URL constructors/prototypes or already-percent-escaped input are rewritten.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
const require=createRequire(import.meta.url);
const url=require('whatwg-url');
const {utf8PercentEncodeString}=require('whatwg-url/lib/percent-encoding.js');
let privateParser,codecFactories;
const EXPECTED={
 'whatwg-url/lib/url-state-machine.js':'42b04c1134efa5940fcc87963fe38536befa98462cb0fd112ba4e92e2cd720d7',
 'iconv-lite/encodings/dbcs-codec.js':'ee0cfbf10e4dc34906bf8a4aa0aaa991f8a50ac08966eaf65a31acfc5b33b8d1',
 'iconv-lite/encodings/sbcs-codec.js':'d622479bee6d119d8df4d126f14acc2882213554ee46fbf27f2dc68970e315c7',
};
function sourceFor(name){
 const filename=require.resolve(name),source=readFileSync(filename,'utf8');
 if(createHash('sha256').update(source).digest('hex')!==EXPECTED[name])throw Error('Unsupported legacy query codec/parser source: '+name);
 return{filename,source};
}
function factories(){
 if(codecFactories)return codecFactories;
 sourceFor('iconv-lite/encodings/dbcs-codec.js');sourceFor('iconv-lite/encodings/sbcs-codec.js');
 const iconv=require('iconv-lite'),DBCS=require('iconv-lite/encodings/dbcs-codec.js')._dbcs,SBCS=require('iconv-lite/encodings/sbcs-codec.js')._sbcs;
 return codecFactories={iconv,DBCS,SBCS,cache:new Map()};
}
function encoderFor(encoding){
 const {iconv,DBCS,SBCS,cache}=factories();
 if(cache.has(encoding))return cache.get(encoding);
 let factory=null,codec;
 if(encoding==='x-user-defined'){factory=scalar=>{const cp=scalar.codePointAt(0);return cp<=0x7f?Buffer.from([cp]):cp>=0xf780&&cp<=0xf7ff?Buffer.from([cp-0xf780+0x80]):null;};cache.set(encoding,factory);return factory;}
 try{codec=iconv.getCodec(encoding);}catch{cache.set(encoding,null);return null;}
 if(Object.getPrototypeOf(codec)===DBCS.prototype){
  // A genuine encoder's fallback is consulted by the pinned codec ONLY after
  // its actual mapping/algorithm has returned UNASSIGNED. '?' is valid data.
  // Do not infer failure from output bytes or decode/encode roundtrips (yen,
  // overline and other actual encoder aliases need not roundtrip).
  factory=scalar=>{
   const encoder=new codec.encoder({},codec),fallback=encoder.defaultCharSingleByte;
   let failed=false;
   Object.defineProperty(encoder,'defaultCharSingleByte',{get(){failed=true;return fallback;}});
   const head=encoder.write(scalar),tail=encoder.end();
   return failed?null:tail?.length?Buffer.concat([head,tail]):head;
  };
 }else if(Object.getPrototypeOf(codec)===SBCS.prototype){
  // The real producer's decode table defines assigned characters; its encode
  // table also contains the fallback byte for unassigned characters. U+FFFD
  // table holes are not assignments.
  const assigned=new Set();
  for(let offset=0;offset<codec.decodeBuf.length;offset+=2){const cp=codec.decodeBuf.readUInt16LE(offset);if(cp!==0xfffd)assigned.add(cp);}
  factory=scalar=>assigned.has(scalar.codePointAt(0))?new codec.encoder({},codec).write(scalar):null;
 }
 cache.set(encoding,factory);return factory;
}
function queryBytes(input,encoding,predicate){
 if(encoding==='utf-8'||encoding==='UTF-8'||encoding==='UTF-16LE'||encoding==='UTF-16BE')return utf8PercentEncodeString(input,predicate);
 const encode=encoderFor(encoding);
 // Preserve the old UTF8 behavior for dependency encoders this bounded adapter
 // cannot execute (notably stateful ISO-2022-JP); this is an explicit gap.
 if(!encode)return utf8PercentEncodeString(input,predicate);
 let output='';
 for(const source of input){
  const cp=source.codePointAt(0);
  // All admitted legacy encodings are ASCII-compatible; preserve raw escapes
  // and punctuation without materializing an encoder for ASCII input.
  if(cp<=0x7f){output+=predicate(cp)?'%'+cp.toString(16).toUpperCase().padStart(2,'0'):source;continue;}
  const scalar=cp>=0xd800&&cp<=0xdfff?'\ufffd':source,bytes=encode(scalar);
  if(bytes===null){output+='%26%23'+scalar.codePointAt(0)+'%3B';continue;}
  for(const byte of bytes)output+=predicate(byte)?'%'+byte.toString(16).toUpperCase().padStart(2,'0'):String.fromCharCode(byte);
 }
 return output;
}
function parser(){
 if(privateParser)return privateParser;
 const{filename,source}=sourceFor('whatwg-url/lib/url-state-machine.js');
 const before='this.url.query += utf8PercentEncodeString(this.buffer, queryPercentEncodePredicate);';
 if(source.split(before).length!==2)throw Error('Unsupported legacy query parser seam');
 const compiled=vm.compileFunction(source.replace(before,'this.url.query += encodeQuery(this.buffer, this.encodingOverride, queryPercentEncodePredicate);'),['exports','require','module','__filename','__dirname','encodeQuery'],{filename});
 const module={exports:{}};
 compiled(module.exports,createRequire(filename),module,filename,path.dirname(filename),queryBytes);
 return privateParser=module.exports;
}
export function parseDocumentURL(input,baseURL,encoding){
 if(!encoding||encoding==='UTF-8'||encoding==='UTF-16LE'||encoding==='UTF-16BE')return url.parseURL(input,{baseURL});
 return parser().parseURL(input,{baseURL,encodingOverride:encoding});
}
