import{installHTMLQualifiedNameParser}from'./html-qualified-name-parser.js';
// Initial-response parser admission only. Canonical Document/Element factories,
// namespace producer hooks, script evaluation and malformed HTML fallback remain
// the actual existing jsdom/owned implementations. No public fronts are replaced.
import{createRequire}from'node:module';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{platformFactoryRecord}from'./platform-factories.js';
import{ownsNamespaceNode}from'./namespace-state.js';
const require=createRequire(import.meta.url),pending=new WeakSet();
let installed=false;
function verify(name,expected){if(createHash('sha256').update(readFileSync(require.resolve(name))).digest('hex')!==expected)throw Error('Unsupported canonical initial parser source: '+name);}
function install(){
 if(installed)return;
 installHTMLQualifiedNameParser();
 verify('jsdom/lib/jsdom/browser/parser/html.js','d3c8ae7f9330eaa6dfb6b8d9b918b1a6398a43d40d71648b99b7f3e30a0e5333');
 verify('jsdom/lib/jsdom/browser/parser/xml.js','ca72ac1ac39c424baf6054b0820bb67d0a52f0de5c0f1f5c81c93d20d8cbc5d9');
 verify('saxes','d00e2ba27ed7d6ac961d03ff14d6b8c0eb5bf063ed2c996c22c6df06ac121423');
 const html=require('jsdom/lib/jsdom/browser/parser/html.js'),xml=require('jsdom/lib/jsdom/browser/parser/xml.js'),{SaxesParser}=require('saxes'),original=html.parseIntoDocument;
 function wellFormed(markup){
  // Syntax validation allocates no DOM and invokes no authored callbacks. The
  // same canonical parser's lexical namespace/XML version rules are retained.
  const validator=new SaxesParser({xmlns:true,defaultXMLVersion:'1.0',forceXMLVersion:true});
  let valid=true;
  validator.on('error',()=>{valid=false;});
  // Match the existing canonical XML parser's internal declaration handling.
  validator.on('doctype',dt=>{const pattern=/<!ENTITY ([^ ]+) "([^"]+)">/g;let match;while((match=pattern.exec(dt))){if(!(match[1]in validator.ENTITIES))validator.ENTITIES[match[1]]=match[2];}});
  try{validator.write(markup).close();}catch{return false;}
  return valid;
 }
 html.parseIntoDocument=function(markup,document){
  if(!pending.has(document))return Reflect.apply(original,this,arguments);
  // Consume the INITIAL admission before any DOM/script/CE reentry. Later
  // document.write/fragment operations retain their actual existing owners.
  pending.delete(document);
  if(!wellFormed(markup))return Reflect.apply(original,this,arguments);
  if(!ownsNamespaceNode(document))throw Error('Canonical XHTML namespace producer authority is missing');
  // Look up the CURRENT canonical entry: its existing genuine namespace scope
  // consumes source XMLNS declarations at attribute birth, preserves authored
  // setAttributeNS, and retains original Element allocation/script execution.
  return xml.parseIntoDocument(markup,document);
 };
 installed=true;
}
export function prepareInitialDocumentParser(value,mimeType){
 if(mimeType!=='application/xhtml+xml')return;
 const record=platformFactoryRecord(value);
 if(!record?.implementation||!['Document','HTMLDocument','XMLDocument'].includes(record.kind))throw TypeError('An actual initial Document producer is required');
 install();pending.add(record.implementation);
}
