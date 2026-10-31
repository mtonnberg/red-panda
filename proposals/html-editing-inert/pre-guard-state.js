// Host-owned HTML editing/inert state over canonical DOM implementations.
import vm from'node:vm';import{createRequire}from'node:module';import{platformFactoryRecord}from'./platform-factories.js';import{captureDOMExceptionFactory}from'./worker-dom-exception.js';import{onFrameRetirement}from'./frame-activity.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),{domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation,HTMLElementImpl=require('jsdom/lib/jsdom/living/nodes/HTMLElement-impl.js').implementation;
const Unknown=require('jsdom/lib/jsdom/living/generated/HTMLUnknownElement.js'),HTMLElement=require('jsdom/lib/jsdom/living/generated/HTMLElement.js');
const HTML='http://www.w3.org/1999/xhtml',SVG='http://www.w3.org/2000/svg',realms=new WeakSet(),exceptions=new WeakMap(),documents=new WeakMap(),installed=new WeakSet(),apply=Reflect.apply;
const description=Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get,lower=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase());let patched=false;
function owned(document){return realms.has(document?._globalObject)}
export function editingState(element){
 for(let current=element;current;current=tree.parent(current)){
  if(current.nodeType!==1||current._namespaceURI===SVG)continue;const value=current.getAttributeNS(null,'contenteditable');if(value===null)continue;const state=lower(value);if(state==='false')return false;if(state===''||state==='true'||state==='plaintext-only')return true;
 }
 return false;
}
function flatParent(node){return node._assignedSlot??tree.parent(node)??node.host??null}
export function effectiveInert(node){
 for(let current=node;current;current=flatParent(current))if(current.nodeType===1&&current._namespaceURI===HTML&&current.hasAttributeNS(null,'inert'))return true;
 return false;
}
export function setInertFocusUpdate(document,update){const record=documents.get(document);if(record)record.update=update}
function schedule(document){const record=documents.get(document);if(!record||!record.active||record.frame!==null||!document._lastFocusedElement)return;record.frame=apply(record.request,record.window,[()=>{record.frame=null;if(record.active)record.update?.()}])}
function patch(){
 if(patched)return;patched=true;
 // Select the actual generated interface before allocating any wrapper or Impl.
 // All parser/clone/import/direct creation paths use this same factory.
 const create=Unknown.createImpl;Unknown.createImpl=function(globalObject,args,data){if(owned(data?.ownerDocument)&&data.namespace===HTML&&data.localName==='search'&&data.ceState!=='failed')return HTMLElement.createImpl(globalObject,args,data);return apply(create,this,arguments)};
 const modified=ElementImpl.prototype._attrModified;ElementImpl.prototype._attrModified=function(name,value,oldValue){const result=apply(modified,this,arguments);if(name==='inert'&&this._namespaceURI===HTML&&value!==oldValue)schedule(this._ownerDocument);return result};
}
export function installHTMLElementState(page,window,{context,mainWindow=window}={}){
 context??=utils.implForWrapper(window.document)._globalObject;if(installed.has(context))return;installed.add(context);patch();
 const document=utils.implForWrapper(mainWindow.document);realms.add(document._globalObject);realms.add(context);realms.add(window);
 if(!documents.has(document)){
  const record={window:mainWindow,request:mainWindow.requestAnimationFrame,cancel:mainWindow.cancelAnimationFrame,frame:null,active:true,update:null};documents.set(document,record);
  const dispose=()=>{if(!record.active)return;record.active=false;if(record.frame!==null)apply(record.cancel,mainWindow,[record.frame]);record.frame=null};page?.documentAbort?.signal.addEventListener('abort',dispose,{once:true});onFrameRetirement(mainWindow,dispose);
 }
 const TypeError=vm.runInContext('TypeError',context),set=window.Element.prototype.setAttributeNS,remove=window.Element.prototype.removeAttributeNS;
 const exception=captureDOMExceptionFactory(window),syntax=()=>exception('The string did not match the expected pattern','SyntaxError');exceptions.set(context,syntax);exceptions.set(window,syntax);
 const state=value=>{const impl=platformFactoryRecord(value)?.implementation;if(!(impl instanceof HTMLElementImpl))throw new TypeError('Illegal invocation');return impl};
 const bridge={
  check(value){state(value)},symbol(value){return String(apply(description,value,[]))},
  get(value,name){const impl=state(value);if(name==='inert')return impl.hasAttributeNS(null,'inert');if(name==='isContentEditable')return editingState(impl);const raw=impl.getAttributeNS(null,'contenteditable'),normalized=raw===null?'inherit':lower(raw);return normalized===''?'true':['true','false','plaintext-only'].includes(normalized)?normalized:'inherit'},
  set(value,name,converted){const element=state(value);if(name==='inert'){if(converted)apply(set,value,[null,'inert','']);else apply(remove,value,[null,'inert']);return}const normalized=lower(converted);if(!['true','false','plaintext-only','inherit'].includes(normalized)){throw (exceptions.get(element._ownerDocument._globalObject)??syntax)()}if(normalized==='inherit')apply(remove,value,[null,'contenteditable']);else apply(set,value,[null,'contenteditable',normalized])},
 };
 for(const property of ['contentEditable','isContentEditable','inert']){
  const setter=property==='isContentEditable'?'':`set ${property}(value){bridge.check(this);const converted=${property==='inert'?'!!value':"typeof value==='symbol'?bridge.symbol(value):`${value}`"};bridge.set(this,${JSON.stringify(property)},converted)}`;
  const descriptor=vm.compileFunction(`return Object.getOwnPropertyDescriptor({get ${property}(){return bridge.get(this,${JSON.stringify(property)})},${setter}},${JSON.stringify(property)});`,['bridge'],{parsingContext:context})(bridge);
  Object.defineProperty(window.HTMLElement.prototype,property,{...descriptor,configurable:true,enumerable:true});
 }
}
export function selectionInertText(range){
 if(!range)return '';const start=range._start,end=range._end;if(start.node===end.node&&start.node.nodeType===3)return effectiveInert(start.node)?'':start.node.data.slice(start.offset,end.offset);
 let text='';for(const node of tree.treeIterator(range.commonAncestorContainer)){
  if(node.nodeType!==3||effectiveInert(node))continue;
  // Real selected boundaries, including partial UTF-16 text, determine the
  // contribution; neither the live Range nor the DOM is cloned or modified.
  if(node===start.node){text+=node.data.slice(start.offset);continue}if(node===end.node){text+=node.data.slice(0,end.offset);continue}
  const parent=tree.parent(node),offset=tree.index(node);if(!parent)continue;
  if(compareBoundary({node:parent,offset},start)>=0&&compareBoundary({node:parent,offset:offset+1},end)<=0)text+=node.data;
 }
 return text;
}
const{compareBoundaryPointsPosition:compareBoundary}=require('jsdom/lib/jsdom/living/range/boundary-point.js');
