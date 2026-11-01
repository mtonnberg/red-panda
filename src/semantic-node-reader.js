// Independent semantic values from authenticated real DOM implementations.
// Names/roles/state are recomputed from current nodes, never fixture snapshots.
import 'jsdom';
import {createRequire} from 'node:module';
import {createCanonicalStyleResolver} from './styles.js';
import {cdpWrapperForNode} from './cdp-node-registry.js';
import {editingState} from './html-element-state.js';
import {authoredListenerTypesForImplementation} from './listener-ownership.js';
const require=createRequire(import.meta.url);
const {domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const Element=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const Node=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const Input=require('jsdom/lib/jsdom/living/nodes/HTMLInputElement-impl.js').implementation;
const Textarea=require('jsdom/lib/jsdom/living/nodes/HTMLTextAreaElement-impl.js').implementation;
const Select=require('jsdom/lib/jsdom/living/nodes/HTMLSelectElement-impl.js').implementation;
const Option=require('jsdom/lib/jsdom/living/nodes/HTMLOptionElement-impl.js').implementation;
const Tab=require('jsdom/lib/jsdom/living/nodes/HTMLOrSVGElement-impl.js').implementation;
const {isDisabled,formOwner}=require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const apply=Reflect.apply,getAttribute=Element.prototype.getAttributeNS,baseURI=Object.getOwnPropertyDescriptor(Node.prototype,'baseURI').get;
const inputType=Object.getOwnPropertyDescriptor(Input.prototype,'type').get,inputValue=Object.getOwnPropertyDescriptor(Input.prototype,'value').get,textareaValue=Object.getOwnPropertyDescriptor(Textarea.prototype,'value').get,selectValue=Object.getOwnPropertyDescriptor(Select.prototype,'value').get,optionValue=Object.getOwnPropertyDescriptor(Option.prototype,'value').get,tabIndex=Object.getOwnPropertyDescriptor(Tab.prototype,'tabIndex').get;
const HTML='http://www.w3.org/1999/xhtml',URLConstructor=URL;
const interactiveRoles=new Set('button link textbox checkbox radio combobox listbox switch slider spinbutton menuitem menuitemcheckbox menuitemradio tab treeitem searchbox option'.split(' '));
const actionEvents=new Set('click dblclick mousedown mouseup pointerdown pointerup keydown keyup keypress touchstart touchend input change submit'.split(' '));
const clean=value=>value.replace(/[\t\n\r\f ]+/g,' ').trim(),tag=node=>node._localName,html=(node,name)=>node.nodeType===1&&node._namespaceURI===HTML&&tag(node)===name;
const attr=(node,name)=>apply(getAttribute,node,[null,name]);
const parent=node=>apply(tree.parent,tree,[node]),children=node=>Array.from(apply(tree.childrenIterator,tree,[node]));
export const semanticWrapper=cdpWrapperForNode;
export function* semanticWalk(root){yield* apply(tree.treeIterator,tree,[root]);}
function rootOf(node){let root=node;while(parent(root))root=parent(root);return root;}
function cssEscape(value){let result='';for(let i=0;i<value.length;i++){const c=value.charCodeAt(i),char=value[i];if(c===0){result+='\uFFFD';continue;}if(c<32||c===127||i===0&&c>=48&&c<=57||i===1&&c>=48&&c<=57&&value[0]==='-'){result+='\\'+c.toString(16)+' ';continue;}result+=c>=128||/[A-Za-z0-9_-]/.test(char)?char:'\\'+char;}return result;}
export function createSemanticReader(document){
 const resolveStyle=createCanonicalStyleResolver(document),treeRoot=rootOf(document);
 function text(node){if(node.nodeType===3||node.nodeType===4)return node._data;let output='';for(const child of children(node))if(child.nodeType!==1||!['script','style','template'].includes(tag(child)))output+=text(child);return output;}
 function findId(id,root=document){for(const node of semanticWalk(root))if(node.nodeType===1&&attr(node,'id')===id)return node;return undefined;}
 function type(node){return html(node,'input')?apply(inputType,node,[]):undefined;}
 function role(node){
  const explicit=attr(node,'role');if(explicit?.trim())return explicit.trim().split(/\s+/)[0];
  if(node._namespaceURI!==HTML)return'none';const name=tag(node);
  if(/^h[1-6]$/.test(name))return'heading';
  if(['a','area'].includes(name)&&attr(node,'href')!==null)return'link';
  if(['button','summary'].includes(name))return'button';
  if(name==='textarea')return'textbox';if(name==='select')return attr(node,'multiple')!==null?'listbox':'combobox';
  if(name==='input'){const t=type(node);return t==='hidden'?'none':({checkbox:'checkbox',radio:'radio',range:'slider',number:'spinbutton',button:'button',submit:'button',reset:'button',image:'button'})[t]??'textbox';}
  return({form:'form',fieldset:'group',p:'paragraph',ol:'list',ul:'list',li:'listitem',option:'option',img:'image',iframe:'Iframe'})[name]??'none';
 }
 function labels(node){
  const values=[],id=attr(node,'id');for(const candidate of semanticWalk(rootOf(node))){if(!html(candidate,'label'))continue;const target=attr(candidate,'for');if(target!==null){if(id&&target===id&&findId(id,rootOf(node))===node)values.push(candidate);continue;}for(const current of semanticWalk(candidate))if(current.nodeType===1&&current._namespaceURI===HTML&&['input','select','textarea','button','meter','output','progress'].includes(tag(current))&&type(current)!=='hidden'){if(current===node)values.push(candidate);break;}}
  return values;
 }
 function name(node,seen=new Set()){
  if(seen.has(node))return null;seen.add(node);
  const related=attr(node,'aria-labelledby');if(related){const names=[];for(const id of related.split(/\s+/)){const target=findId(id,rootOf(node));if(target&&!seen.has(target)){const nested=name(target,new Set(seen))??clean(text(target));if(nested)names.push(nested);}}if(names.length)return clean(names.join(' '));}
  const aria=attr(node,'aria-label');if(aria)return clean(aria);
  if(node._namespaceURI===HTML&&['input','textarea','select','button','meter','progress','output'].includes(tag(node))){const value=clean(labels(node).map(text).join(' '));if(value)return value;}
  const nameTag=tag(node),t=type(node);
  if(node._namespaceURI===HTML&&['img','area'].includes(nameTag)){const alt=attr(node,'alt');if(alt!==null)return clean(alt)||null;}
  if(node._namespaceURI===HTML&&nameTag==='input'&&['button','submit','reset','image'].includes(t)){const value=attr(node,t==='image'?'alt':'value');if(value)return clean(value);}
  if(['button','a','label','legend','option','summary'].includes(nameTag)||/^h[1-6]$/.test(nameTag)||interactiveRoles.has(role(node))&&!['input','select','textarea'].includes(nameTag)){const value=clean(text(node));if(value)return value;}
  const placeholder=attr(node,'placeholder');if(['input','textarea'].includes(nameTag)&&placeholder)return clean(placeholder);
  const title=attr(node,'title');return title?clean(title):null;
 }
 function stateValue(node){const t=type(node);if(t!==undefined)return t==='password'?'*****':apply(inputValue,node,[]);if(html(node,'textarea'))return apply(textareaValue,node,[]);if(html(node,'select'))return apply(selectValue,node,[]);return undefined;}
 function options(node){return [...semanticWalk(node)].filter(current=>html(current,'option')).map(option=>({value:apply(optionValue,option,[]),text:clean(text(option))}));}
 function classification(node){
  if(node.nodeType!==1||type(node)==='hidden')return null;
  if(node._namespaceURI===HTML&&(['button','input','textarea','select','summary'].includes(tag(node))||['a','area'].includes(tag(node))&&attr(node,'href')!==null))return{type:'native'};
  const explicitRole=attr(node,'role')?.trim().split(/\s+/)[0];
  if(interactiveRoles.has(explicitRole))return{type:'aria'};
  if(editingState(node))return{type:'contenteditable'};
  const listeners=authoredListenerTypesForImplementation(node).filter(type=>actionEvents.has(type));if(listeners.length)return{type:'listener',listeners};
  if(attr(node,'tabindex')!==null&&apply(tabIndex,node,[])>=0)return{type:'focusable'};
  return null;
 }
 function visible(node){
  if(resolveStyle(node).visibility!=='visible')return false;
  for(let current=node;current;current=parent(current)??current._host??null)if(current.nodeType===1&&resolveStyle(current).display==='none')return false;
  return true;
 }
 function selector(node){
  if(rootOf(node)!==treeRoot||node.nodeType!==1)return undefined;
  const id=attr(node,'id');if(id){let count=0;for(const item of semanticWalk(document))if(item.nodeType===1&&attr(item,'id')===id)count++;if(count===1)return'#'+cssEscape(id);}
  const parts=[];for(let current=node;current?.nodeType===1;current=parent(current)){const p=parent(current),siblings=p?children(p).filter(item=>item.nodeType===1&&item._localName===current._localName&&item._namespaceURI===current._namespaceURI):[current];parts.unshift(cssEscape(tag(current))+':nth-of-type('+(siblings.indexOf(current)+1)+')');}return parts.join(' > ');
 }
 function href(node){const raw=attr(node,'href');if(raw===null)return undefined;try{return new URLConstructor(raw,apply(baseURI,node,[])).href;}catch{return raw;}}
 function details(node,id){
  if(node.nodeType!==1)throw Object.assign(new Error('InternalError'),{code:-31998});
  const kind=classification(node),result={backendNodeId:id,tagName:tag(node),role:role(node),isInteractive:!!kind},actualName=name(node);if(actualName!==null)result.name=actualName;
  if(isDisabled(node))result.isDisabled=true;
  const value=stateValue(node);if(value!==undefined)result.value=value;
  if(type(node)!==undefined)result.inputType=type(node);
  for(const key of ['placeholder','id','class']){const value=attr(node,key);if(value)result[key]=value;}
  if(['a','area'].includes(tag(node))&&attr(node,'href')!==null)result.href=href(node);
  const actualSelector=selector(node);if(actualSelector!==undefined)result.selector=actualSelector;
  if(['checkbox','radio'].includes(type(node)))result.checked=node._checkedness;
  if(html(node,'select'))result.options=options(node).map((option,index)=>({...option,selected:[...semanticWalk(node)].filter(current=>html(current,'option'))[index]._selectedness}));
  return result;
 }
 function interactive(node,id){
  const kind=classification(node);if(!kind||!visible(node))return undefined;
  const r=role(node),actualName=name(node)??(['listener','focusable'].includes(kind.type)?clean(text(node))||null:null),result={backendNodeId:id,tagName:tag(node),role:r==='none'?null:r,name:actualName,...kind,tabIndex:apply(tabIndex,node,[])};
  if(isDisabled(node))result.disabled=true;
  for(const key of ['id','class']){const value=attr(node,key);if(value)result[key]=value;}
  if(['a','area'].includes(tag(node))&&attr(node,'href')!==null)result.href=href(node);
  if(html(node,'input')){result.inputType=type(node);result.value=stateValue(node);}
  if(['input','select','textarea'].includes(tag(node))){const name=attr(node,'name');if(name)result.elementName=name;const placeholder=attr(node,'placeholder');if(placeholder)result.placeholder=placeholder;}
  return result;
 }
 function forms(idFor){
  const forms=[];for(const form of semanticWalk(document)){if(!html(form,'form'))continue;const result={backendNodeId:idFor(form),fields:[]};for(const key of ['action','method']){const value=attr(form,key);if(value)result[key]=value;}
   for(const control of semanticWalk(rootOf(form))){if(control.nodeType!==1||control._namespaceURI!==HTML||!['input','select','textarea'].includes(tag(control))||formOwner(control)!==form||['hidden','submit','button','reset','image'].includes(type(control)))continue;
    const field={backendNodeId:idFor(control),tagName:tag(control),required:attr(control,'required')!==null,disabled:isDisabled(control)};
    const elementName=attr(control,'name');if(elementName)field.name=elementName;if(html(control,'input'))field.inputType=type(control);
    const value=stateValue(control);if(value!==undefined)field.value=value;const placeholder=attr(control,'placeholder');if(placeholder)field.placeholder=placeholder;
    if(html(control,'select'))field.options=options(control);result.fields.push(field);
   }forms.push(result);
  }return forms;
 }
 return{details,interactive,forms,classification,visible};
}
