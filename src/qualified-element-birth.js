// Genuine owned HTML namespace qualified-name factory policy. All other
// namespaces and unprefixed names retain their actual canonical producers.
import vm from'node:vm';import{createRequire}from'node:module';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{dirname}from'node:path';
import{ownsNamespaceNode}from'./namespace-state.js';
const require=createRequire(import.meta.url),apply=Reflect.apply;
let HTML_NS,isValidCustomElementName,Unknown,Generic,DocumentImpl,ScriptImpl,validation,xml;
let installed=false;
export function qualifiedHTMLBirth(document,prefix,localName,isValue=null){
 const factory=isValidCustomElementName(localName)?Generic:Unknown;
 // Deliberately no CE definition lookup: the genuine qualified token itself
 // is not an autonomous custom-element name. Both backends are uncustomized.
 return factory.createImpl(document._globalObject,[],{ownerDocument:document,localName,namespace:HTML_NS,prefix,ceState:'uncustomized',ceDefinition:null,isValue});
}
export function installQualifiedElementBirth(){
 if(installed)return;
 // Run only at trusted actual Window/parser installation, after normal jsdom
 // bootstrap. No generated interface is imported during this ESM module birth.
 HTML_NS=require('jsdom/lib/jsdom/living/helpers/namespaces.js').HTML_NS;
 isValidCustomElementName=require('jsdom/lib/jsdom/living/helpers/custom-elements.js').isValidCustomElementName;
 Unknown=require('jsdom/lib/jsdom/living/generated/HTMLUnknownElement.js');Generic=require('jsdom/lib/jsdom/living/generated/HTMLElement.js');
 DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;ScriptImpl=require('jsdom/lib/jsdom/living/nodes/HTMLScriptElement-impl.js').implementation;
 validation=require('jsdom/lib/jsdom/living/helpers/validate-names.js');xml=require('jsdom/lib/jsdom/browser/parser/xml.js');
 const full=require.resolve('jsdom/lib/jsdom/browser/parser/xml.js'),original=readFileSync(full,'utf8');
 if(createHash('sha256').update(original).digest('hex')!=='ca72ac1ac39c424baf6054b0820bb67d0a52f0de5c0f1f5c81c93d20d8cbc5d9')throw new Error('Pinned canonical qualified XML factory changed');
 const allocation='const elem = createElement(ownerDocument, tagLocal, tagNamespace, tagPrefix, isValue, true);',mark='if (tagLocal === "script" && tagNamespace === HTML_NS) {',execute='if (elem.localName === "script" && elem.namespaceURI === HTML_NS) {';
 for(const seam of[allocation,mark,execute])if(original.split(seam).length!==2)throw new Error('Canonical qualified XML factory seam changed');
 const transformed=original.replace(allocation,'const elem = createXMLToken(createElement, ownerDocument, tagLocal, tagNamespace, tagPrefix, isValue);').replace(mark,'if (tagLocal === "script" && tagNamespace === HTML_NS && actualScript(elem)) {').replace(execute,'if (elem.localName === "script" && elem.namespaceURI === HTML_NS && actualScript(elem)) {');
 const module={exports:{}};
 vm.compileFunction(transformed,['require','exports','module','__filename','__dirname','createXMLToken','actualScript'],{filename:full})(createRequire(full),module.exports,module,full,dirname(full),(create,document,name,namespace,prefix,isValue)=>ownsNamespaceNode(document)&&namespace===HTML_NS&&prefix!==null?qualifiedHTMLBirth(document,prefix,name,isValue):create(document,name,namespace,prefix,isValue,true),node=>node instanceof ScriptImpl);
 // Keep the original module identity so namespace scopes wrap these real
 // entries before parsing starts; no returned Document is transformed.
 xml.parseIntoDocument=module.exports.parseIntoDocument;xml.parseFragment=module.exports.parseFragment;
 const create=DocumentImpl.prototype.createElement,createNS=DocumentImpl.prototype.createElementNS;
 DocumentImpl.prototype.createElement=function(name,options){
  if(!ownsNamespaceNode(this)||this._parsingMode!=='html'||!name.includes(':'))return apply(create,this,arguments);
  validation.name(this._globalObject,name);name=name.replace(/[A-Z]/g,letter=>letter.toLowerCase());const colon=name.indexOf(':');
  if(colon<=0||colon===name.length-1)return apply(create,this,arguments);
  return qualifiedHTMLBirth(this,name.slice(0,colon),name.slice(colon+1),options?.is??null);
 };
 DocumentImpl.prototype.createElementNS=function(namespace,name,options){
  if(!ownsNamespaceNode(this)||namespace!==HTML_NS||!name.includes(':'))return apply(createNS,this,arguments);
  const parts=validation.validateAndExtract(this._globalObject,namespace,name);
  return parts.prefix===null?apply(createNS,this,arguments):qualifiedHTMLBirth(this,parts.prefix,parts.localName,options?.is??null);
 };
 installed=true;
}
