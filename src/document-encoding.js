// Document encoding is selected from real response bytes and headers, then
// stored on the same genuine Document implementation before the real parser.
import{createRequire}from'node:module';
import{platformFactoryRecord,subscribePlatformFactories}from'./platform-factories.js';
import{parseDocumentURL}from'./legacy-query-encoding.js';
const require=createRequire(import.meta.url);
const sniff=require('html-encoding-sniffer'),encoding=require('whatwg-encoding'),MIME=require('whatwg-mimetype');
const documents=new WeakSet(),globals=new WeakSet();
let hooked=false;
function installParser(){
 if(hooked)return;
 const prototype=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation.prototype;
 const original=prototype.encodingParseAURL;
 Object.defineProperty(prototype,'encodingParseAURL',{...Object.getOwnPropertyDescriptor(prototype,'encodingParseAURL'),value:function(input){
  if(!documents.has(this))return Reflect.apply(original,this,[input]);
  return parseDocumentURL(input,this.baseURL(),this._encoding);
 }});
 hooked=true;
}
subscribePlatformFactories((value,record)=>{
 if(record.kind!=='Document'&&record.kind!=='HTMLDocument'&&record.kind!=='XMLDocument')return;
 const document=record.implementation;
 if(document&&globals.has(document._globalObject))documents.add(document);
});
export function captureDocumentEncoding(value){
 // Invoked at Browser's trusted actual Document factory/preparation seam only.
 const record=platformFactoryRecord(value),document=record?.implementation;
 if(!document||!['Document','HTMLDocument','XMLDocument'].includes(record.kind))throw TypeError('An actual owned Document factory is required');
 installParser();documents.add(document);globals.add(document._globalObject);
 return document;
}
export function decodeHTMLResponse(bytes,contentType){
 const mime=MIME.parse(contentType??''),header=mime?.parameters.get('charset'),xml=Boolean(mime?.isXML());
 const bom=encoding.getBOMEncoding(bytes);
 const declarations=bom===null?bytes:bytes.subarray(bom==='UTF-8'?3:2,1024);
 // An explicit transport declaration owns selection even when its label is
 // invalid; it must not silently turn into permission to use an HTML meta tag.
 // XML ignores HTML meta declarations. XML declaration parsing is a separate
 // unimplemented extension; this preserves the measured default/header cases.
 const selected=header!==undefined?(encoding.labelToName(header)??'UTF-8'):xml?'UTF-8':sniff(declarations,{defaultEncoding:'UTF-8'});
 if(selected==='UTF-8'&&!xml){
  // Preserve the actual UTF8 HTML fast path. In this measured profile a UTF16
  // BOM without a legacy declaration is not decoded as UTF16. Only a genuine
  // leading UTF8 BOM is discarded before the real HTML tokenizer receives text.
  const decoded=bytes.toString('utf8');
  return{source:decoded.charCodeAt(0)===0xfeff?decoded.slice(1):decoded,encoding:selected};
 }
 // The actual codec independently honors BOM bytes for legacy/UTF16 and XML
 // decoding, while the same Document backend retains the declared metadata.
 return{source:encoding.decode(bytes,selected),encoding:selected};
}
