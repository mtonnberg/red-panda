// Host-only CSS byte decoding. The real response headers, leading encoding
// declaration, owning document and optional link label choose the decoder.
// A UTF-8 BOM carries that already-decoded text through jsdom's existing byte
// parser entry without allowing its document-only fallback to decode it again.
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),encoding=require('whatwg-encoding'),MIME=require('whatwg-mimetype');
const BOM=Buffer.from([0xef,0xbb,0xbf]);
export function stylesheetParserBytes(bytes,response,element){
 const mime=MIME.parse(response?.headers?.['content-type']??''),header=mime?.parameters.get('charset');
 const declaration=/^@charset "([^"\r\n]*)";/.exec(bytes.subarray(0,1024).toString('latin1'));
 const fallback=encoding.labelToName(element.getAttributeNS(null,'charset')??'')??element._ownerDocument._encoding??'UTF-8';
 const label=encoding.labelToName(header??'')??encoding.labelToName(declaration?.[1]??'')??fallback;
 // Keep the real bytes when the original parser already has the same valid
 // decoder, or can honor a BOM itself. No round trip is needed in that case.
 if(encoding.isSupported(fallback)&&(encoding.getBOMEncoding(bytes)!==null||label===fallback))return bytes;
 return Buffer.concat([BOM,Buffer.from(encoding.decode(bytes,label),'utf8')]);
}

// The measured CSS resource cap counts decoded response bytes, including when
// transport Content-Length is compressed or absent. Exactly 4 MiB is accepted.
const CSS_RESOURCE_BYTES=4*1024*1024;
export async function readStylesheetResource(response){
 const reader=response.body?.getReader?.();
 if(!reader){const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>CSS_RESOURCE_BYTES)throw Error('Stylesheet exceeds 4 MiB limit');return bytes;}
 const chunks=[];let size=0;
 try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>CSS_RESOURCE_BYTES){const error=Error('Stylesheet exceeds 4 MiB limit');try{await reader.cancel(error)}catch{}throw error;}chunks.push(Buffer.from(value));}return Buffer.concat(chunks,size);}
 finally{reader.releaseLock();}
}
