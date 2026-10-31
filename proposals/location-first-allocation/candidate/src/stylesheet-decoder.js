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
 return Buffer.concat([BOM,Buffer.from(encoding.decode(bytes,label),'utf8')]);
}
