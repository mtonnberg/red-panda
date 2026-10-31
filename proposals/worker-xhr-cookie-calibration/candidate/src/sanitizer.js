import 'jsdom';
import{createRequire}from'node:module';import{types}from'node:util';
import{registerPlatformFactory,platformFactoryRecord}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
import{canonicalConfig,configCopy,modifyConfig,safeConfig,elementAction,attributeAllowed,processingAllowed}from'./sanitizer-config.js';
import{HTML,SVG,MATH,XLINK}from'./sanitizer-policy.js';
import{replaceSanitizerHTML,parseSanitizerDocument}from'./shadow.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),{domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation,ShadowImpl=require('jsdom/lib/jsdom/living/nodes/ShadowRoot-impl.js').implementation;
const Document=require('jsdom/lib/jsdom/living/generated/Document.js');
const STATES=new WeakMap(),INSTALLED=new WeakMap();
function dom(value,Class){if(types.isProxy(value))return null;const impl=platformFactoryRecord(value)?.implementation;return impl instanceof Class?impl:null}
function javascript(value){return value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g,'').replace(/[\t\n\r]/g,'').toLowerCase().startsWith('javascript:')}
const htmlURLs=new Map([['a',['href']],['area',['href']],['form',['action']],['button',['formaction']],['input',['formaction']]]);
function blockedURL(element,attr){
 if(attr.namespaceURI!==null&&attr.namespaceURI!==XLINK)return false;
 if(element.namespaceURI===HTML)return attr.namespaceURI===null&&htmlURLs.get(element.localName)?.includes(attr.localName)&&javascript(attr.value);
 const href=attr.localName==='href'||attr.namespaceURI===null&&attr.localName==='xlink:href';
 if(element.namespaceURI===SVG){if(['animate','set','animateTransform'].includes(element.localName)&&attr.namespaceURI===null&&attr.localName==='attributeName'&&['href','xlink:href'].includes(attr.value))return true;return element.localName==='a'&&href&&javascript(attr.value);}
 return element.namespaceURI===MATH&&href&&javascript(attr.value);
}
function mergeAt(parent){let previous=null;for(const node of tree.childrenToArray(parent)){if(previous?.nodeType===3&&node.nodeType===3){previous.replaceData(previous.length,0,node.data);parent._remove(node);}else previous=node;}}
function filterTree(root,config){
 let changed=false;
 for(const node of tree.childrenToArray(root)){
  if(node.nodeType===1){const action=elementAction(config,node.namespaceURI,node.localName);if(action==='remove'){root._remove(node);changed=true;continue;}
   filterTree(node,config);if(node._templateContents)filterTree(node._templateContents,config);if(node._shadowRoot)filterTree(node._shadowRoot,config);
   if(action==='unwrap'){for(const child of tree.childrenToArray(node))root._preInsert(child,node);root._remove(node);changed=true;continue;}
   for(const attribute of node._attributeList.slice())if(!attributeAllowed(config,node,attribute)||!config.javascriptURLs&&blockedURL(node,attribute))node.removeAttributeNS(attribute.namespaceURI,attribute.localName);
  }else if(node.nodeType===8&&!config.comments||node.nodeType===7&&!processingAllowed(config,node.target)){root._remove(node);changed=true;}
 }
 if(changed)mergeAt(root);
}
function factory(g,b){
 const TypeError=g.TypeError,Error=g.Error,String=g.String,apply=g.Reflect.apply,has=g.Reflect.has,define=g.Object.defineProperty,create=g.Object.create,objectPrototype=g.Object.prototype,Array=g.Array,set=g.Reflect.set;
 const primitive=g.Symbol.toPrimitive,description=g.Object.getOwnPropertyDescriptor(g.Symbol.prototype,'description').get;
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function'||typeof value==='undefined'&&value!==undefined);
 function string(value){if(object(value)){const method=value[primitive];if(method!=null){if(typeof method!=='function')throw new TypeError('invalid argument');value=apply(method,value,['string']);if(object(value))throw new TypeError('invalid argument');}else{let converted=false;for(const name of['toString','valueOf']){const method=value[name];if(typeof method!=='function')continue;const result=apply(method,value,[]);if(!object(result)){value=result;converted=true;break}}if(!converted)throw new TypeError('invalid argument')}}return typeof value==='symbol'?String(apply(description,value,[])):String(value)}
 const invalid=()=>{throw new TypeError('invalid argument')},brand=value=>{if(!b.has(value))throw new TypeError('Illegal invocation')};
 function sequence(value,type){if(!object(value))invalid();const list=b.list();for(const item of value)b.append(list,entry(item,type));return list}
 function entry(value,type){const result=b.entry(type,'',type==='attr'?null:b.html);
  if(type==='element'&&object(value)&&has(value,'attributes')){const next=value.attributes;if(next!==undefined&&next!==null)b.field(result,'attributes',sequence(next,'attr'));}
  const named=object(value)&&has(value,type==='pi'?'target':'name'),name=string(named?value[type==='pi'?'target':'name']:value);b.field(result,type==='pi'?'target':'name',name);
  if(type!=='pi'&&named&&has(value,'namespace')){const next=value.namespace;if(next!==undefined)b.field(result,'namespace',next===null?null:string(next)||null);}
  if(type==='element'&&object(value)&&has(value,'removeAttributes')){const next=value.removeAttributes;if(next!==undefined&&next!==null)b.field(result,'removeAttributes',sequence(next,'attr'));}
  return result;
 }
 function decode(value,safe=false){if(value===undefined||value==='default')return b.preset();if(typeof value==='string')throw new TypeError('invalid Sanitizer preset');if(value!==null&&!object(value))invalid();const config=b.config();if(value!==null)for(const field of['attributes','comments','dataAttributes','elements','javascriptURLs','processingInstructions','removeAttributes','removeElements','removeProcessingInstructions','replaceWithChildrenElements'])if(has(value,field)){const next=value[field];if(next===undefined)continue;if(field==='comments'||field==='dataAttributes'||field==='javascriptURLs')b.field(config,field,!!next);else if(next!==null)b.field(config,field,sequence(next,field==='elements'?'element':field==='processingInstructions'||field==='removeProcessingInstructions'?'pi':field==='attributes'||field==='removeAttributes'?'attr':'name'));}
  const result=b.canonical(config,safe);if(result.error)throw new TypeError(result.error);return result.value;
 }
 function publicValue(value){if(value===null||typeof value!=='object')return value;if(b.array(value)){const result=new Array(value.length);try{for(let i=0;i<value.length;i++)set(result,i,publicValue(value[i]));}catch{throw new Error('FailedToCreateArray')}return result;}const result=create(objectPrototype);try{for(const key of b.keys(value))set(result,key,publicValue(value[key]));}catch{throw new Error('FailedToCreateObject')}return result;}
 function options(value,safe){if(value===undefined||value===null)return safe?b.preset():null;if(!object(value))invalid();const sanitizer=has(value,'sanitizer')?value.sanitizer:undefined;if(sanitizer===undefined)return safe?b.preset():null;if(b.has(sanitizer))return b.snapshot(sanitizer);return decode(sanitizer,safe)}
 class Sanitizer{
  constructor(config=undefined){b.attach(this,decode(config));}
  get(){brand(this);return publicValue(b.get(this))}
  allowElement(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'allowElement',entry(value,'element'))}
  removeElement(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'removeElement',entry(value,'name'))}
  replaceElementWithChildren(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'replaceElementWithChildren',entry(value,'name'))}
  allowAttribute(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'allowAttribute',entry(value,'attr'))}
  removeAttribute(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'removeAttribute',entry(value,'attr'))}
  allowProcessingInstruction(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'allowProcessingInstruction',entry(value,'pi'))}
  removeProcessingInstruction(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'removeProcessingInstruction',entry(value,'pi'))}
  setComments(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'setComments',!!value)}
  setDataAttributes(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'setDataAttributes',!!value)}
  setJavascriptURLs(value){brand(this);if(!arguments.length)invalid();return b.modify(this,'setJavascriptURLs',!!value)}
  removeUnsafe(){brand(this);return b.modify(this,'removeUnsafe')}
 }
 for(const key of g.Object.getOwnPropertyNames(Sanitizer.prototype))if(key!=='constructor')define(Sanitizer.prototype,key,{...g.Object.getOwnPropertyDescriptor(Sanitizer.prototype,key),enumerable:true});delete Sanitizer.prototype.constructor;define(Sanitizer.prototype,'constructor',{value:Sanitizer,writable:true,configurable:true});define(Sanitizer.prototype,g.Symbol.toStringTag,{value:'Sanitizer',configurable:true});define(g,'Sanitizer',{value:Sanitizer,writable:true,configurable:true});
 for(const[kind,prototype]of[['element',g.Element.prototype],['shadow',g.ShadowRoot.prototype]]){
  const methods={setHTML(markup,settings=undefined){if(!b.valid(this,kind))throw new TypeError('Illegal invocation');if(!arguments.length)invalid();markup=string(markup);if(b.script(this))return;const config=options(settings,true);b.replace(this,markup,config,true)},setHTMLUnsafe(markup,settings=undefined){if(!b.valid(this,kind))throw new TypeError('Illegal invocation');if(!arguments.length)invalid();markup=string(markup);const config=options(settings,false);b.replace(this,markup,config,false)}};
  for(const[name,value]of g.Object.entries(methods))define(prototype,name,{value,writable:true,configurable:true,enumerable:true});
 }
 const methods={parseHTML(markup,settings=undefined){if(!arguments.length)invalid();return b.document(string(markup),options(settings,true),true)},parseHTMLUnsafe(markup,settings=undefined){if(!arguments.length)invalid();return b.document(string(markup),options(settings,false),false)}};
 for(const[name,value]of g.Object.entries(methods))define(g.Document,name,{value,writable:true,configurable:true,enumerable:true});
}
function bridge(page,window,wrap=value=>value,realm=window){const htmlDocumentPrototype=window.HTMLDocument.prototype;return{
 html:HTML,has:value=>STATES.has(value),list:()=>[],append:(list,item)=>list.push(item),entry:(type,name,namespace)=>type==='pi'?{target:name}:{name,namespace},field:(target,key,value)=>{target[key]=value},config:()=>({}),preset:()=>canonicalConfig(undefined),array:Array.isArray,keys:Object.keys,
 canonical(input,safe){try{return{value:canonicalConfig(input,safe)}}catch(error){return{error:error.message}}},attach(value,config){STATES.set(value,configCopy(config));registerPlatformFactory(value,{kind:'Sanitizer',globalObject:realm,implementation:STATES.get(value)})},get:value=>configCopy(STATES.get(value)),snapshot:value=>configCopy(STATES.get(value)),modify:(value,name,input)=>modifyConfig(STATES.get(value),name,input),
 valid:(value,kind)=>!!dom(value,kind==='element'?ElementImpl:ShadowImpl),script:value=>{const node=dom(value,ElementImpl);return (node?.namespaceURI===HTML||node?.namespaceURI===SVG)&&node.localName==='script'},
 replace(value,markup,config,safe){const node=dom(value,ElementImpl)??dom(value,ShadowImpl),policy=config===null?null:safe?safeConfig(config):config;replaceSanitizerHTML(node,markup,policy?fragment=>filterTree(fragment,policy):null)},
 document(markup,config,safe){const realm=utils.implForWrapper(window.document)._globalObject,document=Document.createImpl(realm,[],{options:{parsingMode:'html',encoding:'UTF-8',contentType:'text/html',readyState:'loading',scriptingDisabled:true,url:'about:blank'}});parseSanitizerDocument(document,markup,utils.implForWrapper(window.document));if(config)filterTree(document,safe?safeConfig(config):config);const result=utils.wrapperForImpl(document);Object.setPrototypeOf(result,htmlDocumentPrototype);return wrap(result);},
 }}
export function installSanitizer(page,window){if(INSTALLED.has(window))return;registerPlatformFactoryKind('Sanitizer');window.eval(`(${factory.toString()})`)(window,bridge(page,window));INSTALLED.set(window,true)}
export function installUtilitySanitizer(page,world,mainWindow){if(INSTALLED.has(world.global))return;world.evaluate(`(${factory.toString()})`)(world.global,bridge(page,mainWindow,value=>world.wrap(value),world.global));INSTALLED.set(world.global,true)}
