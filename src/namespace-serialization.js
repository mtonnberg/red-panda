import{createRequire}from'node:module';
import{implementationForWrapper}from'./dom-event-state.js';
import{serializeHTML}from'./serialization.js';
import{ownNamespaceGlobal,ownsNamespaceNode,namespaceCreator}from'./namespace-state.js';
const require=createRequire(import.meta.url),ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation,NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const attributes=require('jsdom/lib/jsdom/living/attributes.js'),xmlParser=require('jsdom/lib/jsdom/browser/parser/xml.js'),htmlParser=require('jsdom/lib/jsdom/browser/parser/html.js');
const DOMParserImpl=require('jsdom/lib/jsdom/living/domparsing/DOMParser-impl.js').implementation,Document=require('jsdom/lib/jsdom/living/generated/Document.js'),parser=require('jsdom/lib/jsdom/browser/parser/index.js');
const Element=require('jsdom/lib/jsdom/living/generated/Element.js'),UnknownElement=require('jsdom/lib/jsdom/living/generated/HTMLUnknownElement.js');
const{getHTMLElementInterface}=require('jsdom/lib/jsdom/living/helpers/create-element.js');
const{HTML_NS,SVG_NS,MATHML_NS,XML_NS,XMLNS_NS}=require('jsdom/lib/jsdom/living/helpers/namespaces.js');
const depth=new WeakMap(),checkpoint=queueMicrotask,apply=Reflect.apply;
let patched=false;
const lower=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase());
const upper=value=>value.replace(/[a-z]/g,c=>c.toUpperCase());
function contextElement(node){switch(node.nodeType){case 1:return node;case 9:return node.documentElement;case 2:return node._element;case 10:case 11:return null;default:return node.parentElement;}}
function namespace(element,prefix){
 if(!element)return null;
 if(prefix==='xml')return XML_NS;if(prefix==='xmlns')return XMLNS_NS;
 for(let current=element;current;current=current.parentElement){
  if(current._namespaceURI!==null&&current._prefix===prefix)return current._namespaceURI;
  const name=prefix===null?'xmlns':'xmlns:'+prefix,attr=attributes.getAttributeByName(current,name);
  if(attr)return attr._value||null;
 }
 return null;
}
function prefix(element,uri){
 if(!uri)return null;
 for(let current=element;current;current=current.parentElement){
  if(current._namespaceURI===uri&&current._prefix!==null&&namespace(element,current._prefix)===uri)return current._prefix;
  for(const attr of current._attributeList){const name=attr._qualifiedName;if(name.startsWith('xmlns:')&&attr._value===uri){const candidate=name.slice(6);if(namespace(element,candidate)===uri)return candidate;}}
 }
 return null;
}
function withXMLDocument(document,call){
 let state=depth.get(document);if(!state){state={count:0,queued:false};depth.set(document,state);}state.count++;
 // Parsing can enter authored custom-element work. Recover only an abandoned
 // owned scope if VM interruption bypasses this Host finally.
 if(!state.queued){state.queued=true;checkpoint(()=>{state.queued=false;state.count=0;});}
 try{return call()}finally{state.count--;}
}
function fragmentContext(element){
 if([HTML_NS,SVG_NS,MATHML_NS].includes(element._namespaceURI))return element;
 // Native uses an HTML fragment context for null/custom XML namespaces. A
 // genuine inert typed context has the same tag/document without CE upgrade.
 return getHTMLElementInterface(element._localName).createImpl(element._globalObject,[],{ownerDocument:element._ownerDocument,localName:element._localName,namespace:HTML_NS,prefix:null,ceState:'uncustomized',ceDefinition:null,isValue:null});
}
function patch(){
 if(patched)return;patched=true;
 const createElement=Element.createImpl;Element.createImpl=function(globalObject,args,privateData){
  const document=privateData?.ownerDocument,namespace=privateData?.namespace;
  if(ownsNamespaceNode(document)&&namespace!==HTML_NS&&namespace!==SVG_NS)return UnknownElement.createImpl(globalObject,args,privateData);
  return apply(createElement,this,arguments);
 };
 const createDocument=DOMParserImpl.prototype.createScriptingDisabledDocument;DOMParserImpl.prototype.createScriptingDisabledDocument=function(parsingMode,contentType,string){
  const creator=namespaceCreator(this._globalObject);if(!creator)return apply(createDocument,this,arguments);
  const options={parsingMode,encoding:'UTF-8',contentType,readyState:'complete',scriptingDisabled:true,url:creator.document.URL};
  const document=creator.createDocument?creator.createDocument(options):Document.createImpl(this._globalObject,[],{options});
  if(string!==undefined)parser.parseIntoDocument(string,document);return document;
 };
 const set=attributes.setAttributeValue;
 attributes.setAttributeValue=function(element,localName,value,prefix=null,namespace=null){
  if(ownsNamespaceNode(element)){
   if(namespace===XMLNS_NS&&(depth.get(element._ownerDocument)?.count??0)>0)return;
   localName=prefix===null?localName:prefix+':'+localName;prefix=null;namespace=null;
   if(element._namespaceURI===HTML_NS)localName=lower(localName);
  }
  return apply(set,this,[element,localName,value,prefix,namespace]);
 };
 for(const name of['getAttributeByName','hasAttributeByName']){const original=attributes[name];attributes[name]=function(element,name){return apply(original,this,[element,ownsNamespaceNode(element)&&element._namespaceURI===HTML_NS?lower(name):name]);};}
 const parseDocument=xmlParser.parseIntoDocument;xmlParser.parseIntoDocument=function(markup,document){return ownsNamespaceNode(document)?withXMLDocument(document,()=>apply(parseDocument,this,[markup,document])):apply(parseDocument,this,arguments);};
 const parseFragment=xmlParser.parseFragment;xmlParser.parseFragment=function(markup,element){return ownsNamespaceNode(element)?htmlParser.parseFragment(markup,fragmentContext(element)):apply(parseFragment,this,arguments);};
 for(const name of['lookupNamespaceURI','lookupPrefix','isDefaultNamespace']){const original=NodeImpl.prototype[name];NodeImpl.prototype[name]=function(value){
  if(!ownsNamespaceNode(this))return apply(original,this,arguments);const element=contextElement(this);
  if(name==='lookupPrefix')return prefix(element,value);
  if(name==='lookupNamespaceURI')return namespace(element,value===''?null:value);
  return namespace(element,null)===(value===''?null:value);
 };}
 const tagName=Object.getOwnPropertyDescriptor(ElementImpl.prototype,'tagName');Object.defineProperty(ElementImpl.prototype,'tagName',{...tagName,get(){return ownsNamespaceNode(this)&&this._namespaceURI===HTML_NS?upper(this._qualifiedName):apply(tagName.get,this,[]);}});
 for(const[name,outer]of[['outerHTML',true],['innerHTML',false]]){const descriptor=Object.getOwnPropertyDescriptor(ElementImpl.prototype,name);Object.defineProperty(ElementImpl.prototype,name,{...descriptor,get(){return ownsNamespaceNode(this)&&this._ownerDocument._parsingMode==='xml'?serializeHTML(this,{outer}):apply(descriptor.get,this,[]);}});}
}
export function installNamespaceSerialization(window,{context,createDocument}={}){
 const document=implementationForWrapper(window.document),creator={document,createDocument};
 ownNamespaceGlobal(document._globalObject);ownNamespaceGlobal(window,creator);if(context)ownNamespaceGlobal(context,creator);
 if(!context)ownNamespaceGlobal(document._globalObject,creator);patch();
}
