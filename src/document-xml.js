import {installDocumentXPathEntries} from './document-member-realms.js';
import {installAttributeNames} from './attribute-names.js';
import {installNamespaceSerialization} from './namespace-serialization.js';
import {installSerialization} from './serialization.js';
import {callDOMFactory} from './dom-factory-scope.js';
import {atomicFormMove} from './element-internals.js';
// Independent proposal. Existing jsdom DOM/parser/XPath components are reused;
// target implementation source is neither imported nor copied.
import{createRequire}from'node:module';
const require=createRequire(import.meta.url);
const{implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const NodeInterface=require('jsdom/lib/jsdom/living/generated/Node.js');
const DocumentInterface=require('jsdom/lib/jsdom/living/generated/Document.js');
const ParserInterface=require('jsdom/lib/jsdom/living/generated/DOMParser.js');
const{shadowIncludingRoot,shadowIncludingInclusiveDescendantsIterator}=require('jsdom/lib/jsdom/living/helpers/shadow-dom.js');
const{ceReactionsPreSteps,ceReactionsPostSteps,enqueueCECallbackReaction}=require('jsdom/lib/jsdom/living/helpers/custom-elements.js');
const{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const makeXPath=require('jsdom/lib/jsdom/level3/xpath.js');
const{decodeHTMLStrict}=require('entities');
const{parse:parseHost}=require('tldts');
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const UnknownElement=require('jsdom/lib/jsdom/living/generated/HTMLUnknownElement.js');
const validateNames=require('jsdom/lib/jsdom/living/helpers/validate-names.js');
const {HTML_NS,SVG_NS}=require('jsdom/lib/jsdom/living/helpers/namespaces.js');
let xmlFactoriesPatched=false;
function patchXMLFactories(){
 if(xmlFactoriesPatched)return;xmlFactoriesPatched=true;
 const create=DocumentImpl.prototype.createElement,createNS=DocumentImpl.prototype.createElementNS;
 const unknown=(document,namespace,prefix,localName)=>UnknownElement.createImpl(document._globalObject,[],{ownerDocument:document,localName,namespace,prefix,ceState:'uncustomized',ceDefinition:null,isValue:null});
 DocumentImpl.prototype.createElement=function(localName,...args){
  if(this._parsingMode!=='xml')return Reflect.apply(create,this,[localName,...args]);
  validateNames.name(this._globalObject,localName);
  const colon=localName.indexOf(':'),prefix=colon<0?null:localName.slice(0,colon);
  return unknown(this,null,prefix,colon<0?localName:localName.slice(colon+1));
 };
 DocumentImpl.prototype.createElementNS=function(namespace,qualifiedName,...args){
  if(this._parsingMode!=='xml'||namespace===HTML_NS||namespace===SVG_NS)return Reflect.apply(createNS,this,[namespace,qualifiedName,...args]);
  const extracted=validateNames.validateAndExtract(this._globalObject,namespace,qualifiedName);
  return unknown(this,extracted.namespace,extracted.prefix,extracted.localName);
 };
}
const installed=new WeakMap();

// XML5-style compatibility: known HTML entities are numeric-escaped into the
// strict XML parser; external/internal DTDs are not fetched or evaluated. An
// unknown entity is preserved literally only when a real doctype is present.
export function normalizeXML(source){
 let output='',i=0,doctype=false;
 while(i<source.length){
  if(source.startsWith('<!--',i)||source.startsWith('<![CDATA[',i)||source.startsWith('<?',i)){
   const endToken=source.startsWith('<!--',i)?'-->':source.startsWith('<![CDATA[',i)?']]>':'?>';
   const end=source.indexOf(endToken,i+2);if(end<0){output+=source.slice(i);break;}output+=source.slice(i,end+endToken.length);i=end+endToken.length;continue;
  }
  if(source.startsWith('<!DOCTYPE',i)){
   let j=i+9,quote=null,depth=0,subsetStart=-1,subsetEnd=-1;
   for(;j<source.length;j++){
    const c=source[j];if(quote){if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(source.startsWith('<!--',j)){const end=source.indexOf('-->',j+4);if(end<0)break;j=end+2;continue;}
    if(c==='['){if(!depth)subsetStart=j;depth++;}else if(c===']'){depth--;if(!depth)subsetEnd=j;}
    else if(c==='>'&&!depth)break;
   }
   if(j>=source.length){output+=source.slice(i);break;}
   doctype=true;output+=subsetStart>=0&&subsetEnd>=subsetStart?source.slice(i,subsetStart)+source.slice(subsetEnd+1,j+1):source.slice(i,j+1);i=j+1;continue;
  }
  if(source[i]==='&'){
   const match=/^&([A-Za-z_:][A-Za-z0-9_.:-]*);/.exec(source.slice(i));
   if(match){const raw=match[0],name=match[1];
    if(['amp','lt','gt','apos','quot'].includes(name)){output+=raw;i+=raw.length;continue;}
    const decoded=decodeHTMLStrict(raw);
    if(decoded!==raw){output+=Array.from(decoded,char=>'&#'+char.codePointAt(0)+';').join('');i+=raw.length;continue;}
    if(doctype){output+='&amp;'+name+';';i+=raw.length;continue;}
   }
  }
  output+=source[i++];
 }
 return output;
}

function realmMetadata(g,bridge){
 const Document=g.Document,domainValues=new WeakMap();
 const brand=doc=>{if(!bridge.isDocument(doc))throw new g.TypeError('Illegal invocation');};
 class HTMLDocument extends Document{constructor(){super();bridge.html(this);}}
 Object.defineProperty(HTMLDocument.prototype,Symbol.toStringTag,{value:'HTMLDocument',configurable:true});
 Object.defineProperty(g,'HTMLDocument',{value:HTMLDocument,writable:true,configurable:true});
 const adopt=doc=>{Object.setPrototypeOf(doc,doc.contentType==='text/html'?HTMLDocument.prototype:g.XMLDocument.prototype);return doc;};
 for(const[name,get]of Object.entries({prerendering(){brand(this);return false;},scrollingElement(){brand(this);return this.documentElement;}}))Object.defineProperty(Document.prototype,name,{get,configurable:true,enumerable:true});
 Object.defineProperty(Document.prototype,'domain',{configurable:true,enumerable:true,
  get(){brand(this);return domainValues.has(this)?domainValues.get(this):bridge.hostname(this);},
  set(value){brand(this);value=''+value;const current=domainValues.has(this)?domainValues.get(this):bridge.hostname(this);const normalized=bridge.validateDomain(current,value);if(normalized===null)throw new g.DOMException('The operation is insecure','SecurityError');domainValues.set(this,normalized);}});
 const cookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
 Object.defineProperty(Document.prototype,'cookie',{...cookie,set(value){brand(this);value=''+value;if(/[\x00-\x1f\x7f-\uffff]/.test(value))return;cookie.set.call(this,value);}});
 const create=g.DOMImplementation.prototype.createHTMLDocument;
 g.DOMImplementation.prototype.createHTMLDocument=function(...args){const document=create.apply(this,args);bridge.completeHTMLDocument(document);return adopt(document);};
 const parse=g.DOMParser.prototype.parseFromString;
 g.DOMParser.prototype.parseFromString=function(source,type){if(!bridge.isParser(this)||arguments.length<2)throw new g.TypeError('Invalid DOMParser receiver or arguments');source=''+source;type=''+type;return adopt(parse.call(this,type==='text/html'?source:bridge.normalizeXML(source),type));};
 if(g.document.contentType==='text/html')Object.setPrototypeOf(g.document,HTMLDocument.prototype);
 return{adopt};
}

function installXPath(window){
 // The installed dependency deliberately returns its parser/evaluator hooks.
 // Correct function evaluation at the AST boundary, not through expression
 // rewrites, fake document nodes or expression-specific expected values.
 const xpath=makeXPath(window),original=xpath.Evaluator.prototype.val;
 xpath.Evaluator.prototype.val=function(ast,context){
  if(Array.isArray(ast)&&ast[0]==='FunctionCall'&&['name','local-name','namespace-uri'].includes(ast[1])){
   const args=ast[2];if(args.length>1)throw new window.DOMException('Expected zero or one node-set argument','SyntaxError');
   const set=args.length?this.val(args[0],context):context;
   if(!set||!Array.isArray(set.nodes))throw new window.DOMException('Expected a node-set','SyntaxError');
   const node=set.nodes[0];if(!node)return'';
   if(ast[1]==='namespace-uri')return node.namespaceURI??'';
   if(![1,2,7].includes(node.nodeType))return'';
   const name=ast[1]==='local-name'?(node.localName??node.target??node.nodeName):(node.name??node.nodeName);
   return node.nodeType===1&&node.ownerDocument.contentType==='text/html'?name.toLowerCase():name;
  }
  return original.call(this,ast,context);
 };
 window.XPathEvaluator.prototype.createNSResolver=function(node){if(!NodeInterface.is(node))throw new window.TypeError('Expected Node');return node;};
 window.Document.prototype.createNSResolver=window.XPathEvaluator.prototype.createNSResolver;
 installDocumentXPathEntries(window);
 return xpath;
}

function moveFactory(g,bridge){
 function moveBefore(node,child){
  if(arguments.length<2)throw new g.TypeError('Two arguments required');
  if(!bridge.isParent(this)||!bridge.isNode(node)||(child!==null&&!bridge.isNode(child)))throw new g.TypeError('Expected Node');
  return bridge.move(this,node,child);
 }
 for(const Constructor of[g.Element,g.Document,g.DocumentFragment])Object.defineProperty(Constructor.prototype,'moveBefore',{value:moveBefore,writable:true,configurable:true,enumerable:true});
}

export function installDocumentXML(page,window){
 installAttributeNames(window);
 installNamespaceSerialization(window);installSerialization(page,window);
 patchXMLFactories();
 if(installed.has(window))return installed.get(window);
 const document=window.document;
 const docBrand=value=>DocumentInterface.is(value);
 const metadata=window.eval(`(${realmMetadata.toString()})`)(window,{
  normalizeXML,isDocument:docBrand,isParser:ParserInterface.is,
  html(doc){const impl=implForWrapper(doc);impl._parsingMode='html';impl.contentType='text/html';},
  completeHTMLDocument(doc){const impl=implForWrapper(doc);impl._currentDocumentReadiness='complete';},
  hostname(doc){const origin=implForWrapper(doc)._origin;try{return new URL(origin).hostname;}catch{}try{return window.location.hostname;}catch{return'';}},
  validateDomain(current,value){
   value=value.toLowerCase();if(!value||/[\s/:?#@]/.test(value)||value.startsWith('.')||value.endsWith('.'))return null;
   if(value===current)return value;
   const info=parseHost(value,{allowPrivateDomains:true});
   return !info.isIp&&info.domain&&current.endsWith('.'+value)?value:null;
  },
 });
 const xpath=installXPath(window);
 window.eval(`(${moveFactory.toString()})`)(window,{
  isNode:value=>NodeInterface.is(value),
  isParent:value=>NodeInterface.is(value)&&[1,9,11].includes(implForWrapper(value)?.nodeType),
  move(parent,node,child){
   const p=implForWrapper(parent),n=implForWrapper(node),c=child===null?null:implForWrapper(child);
   if(![1,3,4,7,8].includes(n.nodeType))throw new window.DOMException('Only Element or CharacterData can be moved','HierarchyRequestError');
   p._preInsertValidity(n,c);
   if(n._ownerDocument!==p._ownerDocument||shadowIncludingRoot(p)!==shadowIncludingRoot(n))throw new window.DOMException('Nodes must share a shadow-including root','HierarchyRequestError');
   if(n===c)return;
   const owner=n._ownerDocument,focused=owner._lastFocusedElement,descriptors=new Map(),definitions=new Map(),aware=[];
   // Read user-defined callback properties before installing temporary host
   // hooks; a throwing getter must leave attachment/definition state intact.
   for(const element of shadowIncludingInclusiveDescendantsIterator(n))if(element._ceState==='custom'){
    const callback=wrapperForImpl(element).connectedMoveCallback;
    if(typeof callback==='function')aware.push({element,definition:element._ceDefinition,callback});
   }
   ceReactionsPreSteps();
   try{
    for(const key of['_detach','_attach']){descriptors.set(key,Object.getOwnPropertyDescriptor(n,key));Object.defineProperty(n,key,{configurable:true,writable:true,value(){}});}
    for(const {element,definition,callback}of aware){definitions.set(element,definition);element._ceDefinition={...definition,lifecycleCallbacks:{...definition.lifecycleCallbacks,connectedCallback:null,disconnectedCallback:null,connectedMoveCallback:callback}};}
    atomicFormMove(()=>p._preInsert(n,c));
    if(focused?.isConnected)owner._lastFocusedElement=focused;
    for(const {element}of aware)enqueueCECallbackReaction(element,'connectedMoveCallback',[]);
    // Keep lookup indexes ordered after a real topology change without detach/
    // attach, including duplicate IDs and moves into/out of shadow trees.
    for(const list of Object.values(owner._ids))list.sort((a,b)=>{const position=a.compareDocumentPosition(b);return position&1?0:position&4?-1:position&2?1:0;});
   }finally{
    for(const[key,descriptor]of descriptors)if(descriptor)Object.defineProperty(n,key,descriptor);else delete n[key];
    for(const[element,definition]of definitions)element._ceDefinition=definition;
    ceReactionsPostSteps();
   }
  },
 });
 const result={metadata,xpath,document};installed.set(window,result);return result;
}
