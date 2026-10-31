import 'jsdom';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {setImmediate as schedule,clearImmediate as cancel} from 'node:timers';
import {platformFactoryRecord} from './platform-factories.js';
import {getRuntimeBinding} from './native-runtime.js';
import {captureDOMExceptionFactory,domExceptionRecord} from './worker-dom-exception.js';
import {beginCommandControlEdit} from './document-editing-state.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const InputEvent=require('jsdom/lib/jsdom/living/generated/InputEvent.js');
const {isDisabled}=require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const {domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const {compareBoundaryPointsPosition:compare}=require('jsdom/lib/jsdom/living/range/boundary-point.js');
const documents=new WeakMap(),realms=new WeakMap(),installed=new WeakSet();
const methods=['execCommand','queryCommandSupported','queryCommandEnabled','queryCommandState','queryCommandIndeterm','queryCommandValue'];
const supported=new Set(['inserttext','delete','forwarddelete']);
const blocks=new Set(['address','article','aside','blockquote','div','dl','dt','dd','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','li','main','nav','ol','p','pre','section','table','tbody','td','th','tr','ul']);
const atoms=new Set(['br','img','hr','input','select','textarea','iframe','object','embed']);
const selectionTypes=new Set(['text','search','tel','url','password']);
const floor=(text,offset)=>offset>0&&offset<text.length&&text.charCodeAt(offset)>=0xDC00&&text.charCodeAt(offset)<=0xDFFF&&text.charCodeAt(offset-1)>=0xD800&&text.charCodeAt(offset-1)<=0xDBFF?offset-1:offset;
const backward=(text,offset)=>floor(text,Math.max(0,offset-1));
const forward=(text,offset)=>Math.min(text.length,offset+(text.codePointAt(offset)>0xFFFF?2:1));
function string(value,Error){
 const direct=typeof value==='symbol';
 if(value!==null&&(typeof value==='object'||typeof value==='function')){
  const exotic=value[Symbol.toPrimitive];
  if(exotic!=null){if(typeof exotic!=='function')throw new Error('invalid argument');value=Reflect.apply(exotic,value,['string']);if(value!==null&&(typeof value==='object'||typeof value==='function'))throw new Error('invalid argument');}
  else{let done=false;for(const key of['toString','valueOf']){const method=value[key];if(typeof method==='function'){const next=Reflect.apply(method,value,[]);if(next===null||(typeof next!=='object'&&typeof next!=='function')){value=next;done=true;break;}}}if(!done)throw new Error('invalid argument');}
 }
 if(typeof value==='symbol'){if(!direct)throw new Error('invalid argument');return String(Reflect.apply(Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get,value,[]));}
 return String(value);
}
function editable(node){
 for(let current=node?.nodeType===1?node:tree.parent(node);current;current=tree.parent(current)){
  if(current.nodeType!==1)continue;const value=current.getAttributeNS(null,'contenteditable')?.toLowerCase();
  if(value==='false')return null;
  if(value===''||value==='true'||value==='plaintext-only'){
   let host=current;for(let parent=tree.parent(current);parent?.nodeType===1;parent=tree.parent(parent)){
    const next=parent.getAttributeNS(null,'contenteditable')?.toLowerCase();if(next==='false')break;if(next===''||next==='true'||next==='plaintext-only')host=parent;
   }return host;
  }
 }return null;
}
function targetFor(document){
 const active=document._lastFocusedElement;
 if(active&&['input','textarea'].includes(active._localName)){
  if(active.hasAttributeNS(null,'readonly')||isDisabled(active)||['checkbox','radio','hidden'].includes(active.type))return null;
  return{control:active};
 }
 const selection=document.getSelection(),range=selection?._range;if(!range)return null;
 const host=editable(range._start.node);if(!host||host._ownerDocument!==document||!host.isConnected||editable(range._end.node)!==host)return null;
 for(const boundary of[range._start,range._end])for(let node=boundary.node;node&&node!==host;node=tree.parent(node))if(['select','option'].includes(node._localName))return null;
 return{host,selection,range};
}
function input(target,type,data){target._dispatch(InputEvent.createImpl(target._ownerDocument._globalObject,['input',{bubbles:true,cancelable:false,composed:true,inputType:type,data}],{isTrusted:true}));}
function controlEdit(control,command,value){
 const textual=control._localName==='textarea'||selectionTypes.has(control.type),old=control.value;
 let start=floor(old,textual?control._selectionStart:old.length),end=floor(old,textual?control._selectionEnd:old.length);
 const type=command==='inserttext'?'insertText':command==='delete'?'deleteContentBackward':'deleteContentForward';
 if(command!=='inserttext'){
  if(start===end){if(command==='delete')start=backward(old,start);else end=forward(old,end);}
  if(start===end)return true;value='';
 }
 if(!value&&start===end)return true;
 let begun=false;
 function assign(next){
  try{control.value=next;}catch(error){
   // Preserve the real backend failure, with Native's measured generic message
   // and a genuine DOMException allocated in the actual control owner's VM.
   if(control.type==='file'&&domExceptionRecord(error)?.name==='InvalidStateError')throw documents.get(control._ownerDocument).exception('The object is in an invalid state','InvalidStateError');
   throw error;
  }
 }
 function replace(text,data){
  const before=control.value,next=before.slice(0,start)+text+before.slice(end);
  // The actual backend owns value sanitization and file-input exceptions.
  if(!begun){const baseline=before;assign(next);beginCommandControlEdit(control,baseline);begun=true;}else assign(next);
  start=Math.min(start+text.length,control.value.length);end=start;
  if(textual){control._selectionStart=control._selectionEnd=start;control._selectionDirection='none';}
  input(control,type,data);
 }
 if(command!=='inserttext')replace('',null);
 else if(control._localName==='textarea'){
  const chunks=value.split('\n');for(let i=0;i<chunks.length;i++){if(chunks[i]||i===0&&start!==end)replace(chunks[i],chunks[i]);if(i<chunks.length-1)replace('\n',null);}
 }else{value=value.replaceAll('\n',' ');replace(value,value);}
 return true;
}
function block(node,host){for(let current=node.nodeType===1?node:tree.parent(node);current&&current!==host;current=tree.parent(current))if(blocks.has(current._localName))return current;return host;}
function contained(root,node){return node===root||tree.ancestorsToArray(node).includes(root);}
function textNodes(root){return[...tree.treeIterator(root)].filter(node=>node.nodeType===3);}
function canonical(boundary,host,preferLeft=true){
 const node=boundary.node;if(node.nodeType===3)return{node,offset:floor(node.data,Math.min(boundary.offset,node.data.length))};
 const children=tree.childrenToArray(node),left=children[boundary.offset-1],right=children[boundary.offset];
 const last=left&&textNodes(left).at(-1),first=right&&textNodes(right)[0];
 if(preferLeft&&last)return{node:last,offset:last.data.length};if(first)return{node:first,offset:0};if(last)return{node:last,offset:last.data.length};return{node,offset:boundary.offset};
}
function ceEdit(target,command,value){
 const{host,range,selection}=target;if(command==='inserttext'&&value.includes('\n'))return false;
 const initialStart={...range._start};
 let start=canonical(range._start,host),end=canonical(range._end,host);
 const startBlock=block(start.node,host),endBlock=block(end.node,host);if(startBlock!==endBlock)return false;
 let changed=start.node!==end.node||start.offset!==end.offset;
 const type=command==='inserttext'?'insertText':command==='delete'?'deleteContentBackward':'deleteContentForward';
 const original={...start},wasCollapsed=!changed;
 if(wasCollapsed&&command==='delete'&&range._start.node===host&&range._start.offset===0)return true;
 if(wasCollapsed&&command!=='inserttext'&&range._start.node.nodeType===1&&startBlock!==block(range._start.node,host))return false;
 if(!changed&&command!=='inserttext'){
  const text=textNodes(host),index=text.indexOf(start.node);let candidate=start;
  if(start.node.nodeType===3&&(command==='delete'?start.offset>0:start.offset<start.node.data.length)){
   if(command==='delete')start={node:start.node,offset:backward(start.node.data,start.offset)};else end={node:start.node,offset:forward(start.node.data,start.offset)};
  }else{
   const adjacent=command==='delete'?text[index-1]:text[index+1];
   if(!adjacent)return true;
   if(block(adjacent,host)!==startBlock)return false;
   candidate=command==='delete'?{node:adjacent,offset:adjacent.data.length}:{node:adjacent,offset:0};
   if(command==='delete')start={node:adjacent,offset:backward(adjacent.data,candidate.offset)},end=candidate;
   else start=candidate,end={node:adjacent,offset:forward(adjacent.data,0)};
  }
  changed=start.node!==end.node||start.offset!==end.offset;
 }
 if(!changed&&!value)return true;
 for(const node of tree.treeIterator(host))if(atoms.has(node._localName)){
  const parent=tree.parent(node),index=tree.index(node),before={node:parent,offset:index},after={node:parent,offset:index+1};
  const spanStart=wasCollapsed&&compare(original,start)<0?original:start,spanEnd=wasCollapsed&&compare(original,end)>0?original:end;
  if(compare(spanStart,after)<0&&compare(spanEnd,before)>0)return false;
  if(command!=='inserttext'&&!changed)return false;
 }
 const touched=new Set();for(const point of[start,end])for(let node=tree.parent(point.node);node&&node!==host;node=tree.parent(node))touched.add(node);
 range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
 if(changed)range.deleteContents();
 let caret={node:range._start.node,offset:range._start.offset};
 if(command==='inserttext'&&value){
  caret=canonical(caret,host);
  if(caret.node.nodeType===3){caret.node.insertData(caret.offset,value);caret.offset+=value.length;}
  else{const text=host._ownerDocument.createTextNode(value),next=tree.childrenToArray(caret.node)[caret.offset]??null;caret.node._insert(text,next);caret={node:text,offset:value.length};}
 }
 // Delete removes exhausted inline structure; insertText retains its actual
 // text endpoint even when an empty replacement leaves that Text empty.
 if(command!=='inserttext'){
  for(const node of[...tree.treeIterator(host)].reverse()){
   if(node.nodeType===3&&node.data===''&&(node===start.node||node===end.node))tree.parent(node)._remove(node);
   else if(touched.has(node)&&!blocks.has(node._localName)&&!tree.hasChildren(node))tree.parent(node)._remove(node);
  }
  caret=canonical(range._start,host);
  if(!textNodes(startBlock).some(node=>node.data)&&!tree.childrenToArray(startBlock).some(node=>node.nodeType===1)){
   if(blocks.has(startBlock._localName)){startBlock._append(host._ownerDocument.createElement('br'));caret={node:startBlock,offset:0};}
   else caret={node:startBlock,offset:0};
  }
  if(command==='forwarddelete'&&original.node!==start.node&&contained(host,original.node))caret=original;
 }
 if(caret.node!==initialStart.node||caret.offset!==initialStart.offset)selection.collapse(caret.node,caret.offset);
 else{range.setStart(caret.node,caret.offset);range.setEnd(caret.node,caret.offset);}
 input(host,type,command==='inserttext'?value:null);return true;
}
function setupRealm(global,anchor,record){
 if(installed.has(global))return;installed.add(global);
 const Error=global.TypeError,realm={Error};realms.set(global,realm);realms.set(anchor,realm);
 const binding=getRuntimeBinding();
 for(const method of methods){
  const fn=binding.createEntry((caller,receiver,args)=>{
   const Error=realms.get(caller)?.Error??realm.Error;
   const document=!types.isProxy(receiver)&&platformFactoryRecord(receiver)?.implementation;
   if(!(document instanceof DocumentImpl))throw new Error('Illegal invocation');
   if(args.length<1)throw new Error('invalid argument');
   const command=string(args[0],Error).toLowerCase();
   const value=method==='execCommand'?(args[2]==null?'':string(args[2],Error)):'';
   const owner=documents.get(document),live=owner&&!owner.disposed&&document._defaultView&&utils.implForWrapper(document._defaultView.document)===document;
   const available=Boolean(live&&supported.has(command));
   if(method==='queryCommandSupported')return available;
   if(method==='queryCommandState'||method==='queryCommandIndeterm')return false;
   if(method==='queryCommandValue')return'';
   const target=available?targetFor(document):null;
   if(method==='queryCommandEnabled')return Boolean(target);
   if(!target||owner.busy)return false;
   owner.busy=true;const recovery=schedule(()=>{owner.busy=false;owner.recovery=undefined});owner.recovery=recovery;
   try{return target.control?controlEdit(target.control,command,value):ceEdit(target,command,value);}
   finally{cancel(recovery);owner.recovery=undefined;owner.busy=false;}
  },global,method);
  Object.defineProperty(global.Document.prototype,method,{value:fn,writable:true,enumerable:true,configurable:true});
 }
}
export function installDocumentEditing(page,window){
 const document=utils.implForWrapper(window.document),record={disposed:false,busy:false,recovery:undefined,exception:captureDOMExceptionFactory(window)};documents.set(document,record);
 setupRealm(window,document._globalObject,record);
 page.documentAbort?.signal.addEventListener('abort',()=>{record.disposed=true;record.busy=false;if(record.recovery!==undefined)cancel(record.recovery);},{once:true});
}
export function installUtilityDocumentEditing(controller,mainWindow){const document=utils.implForWrapper(mainWindow.document);setupRealm(controller.global,controller.context,documents.get(document));}
