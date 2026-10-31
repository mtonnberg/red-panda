import 'jsdom';
import {createRequire} from 'node:module';
import {observeDOMWrapperProxy} from './dom-wrapper-realms.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const Select=require('jsdom/lib/jsdom/living/nodes/HTMLSelectElement-impl.js').implementation,Option=require('jsdom/lib/jsdom/living/nodes/HTMLOptionElement-impl.js').implementation,Group=require('jsdom/lib/jsdom/living/nodes/HTMLOptGroupElement-impl.js').implementation;
const Options=require('jsdom/lib/jsdom/living/nodes/HTMLOptionsCollection-impl.js').implementation,Collection=require('jsdom/lib/jsdom/living/generated/HTMLCollection.js');
const {domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js'),{isDisabled}=require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const parse5=createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'))('parse5');
const documents=new WeakMap(),installed=new WeakMap(),suppressed=new WeakSet(),quietOptions=new WeakSet(),adjustedHandlers=new WeakSet();
const apply=Reflect.apply,define=Object.defineProperty,own=Object.getOwnPropertyDescriptor,record=value=>Object.assign(Object.create(null),value);
let patched=false;
const active=document=>{const owner=documents.get(document);return owner&&!owner.disposed&&!owner.signal?.aborted;};
function list(select){const values=[];for(const child of tree.childrenIterator(select)){if(child instanceof Option)values.push(child);else if(child instanceof Group)for(const option of tree.childrenIterator(child))if(option instanceof Option)values.push(option);}return values;}
function menu(select){return!select.hasAttributeNS(null,'multiple')&&select._displaySize<2;}
function disabled(option){const parent=tree.parent(option);return option.hasAttributeNS(null,'disabled')||(parent instanceof Group&&parent.hasAttributeNS(null,'disabled'));}
function reset(select){if(!menu(select))return;const options=list(select);if(!options.some(option=>option._selectedness)){const first=options.find(option=>!disabled(option));if(first)first._selectedness=true;}}
function selectOwner(parent){if(parent instanceof Select)return parent;if(parent instanceof Group){const node=tree.parent(parent);if(node instanceof Select)return node;}return null;}
function changedOptions(parent,child){if(child instanceof Option)return[child];if(parent instanceof Select&&child instanceof Group)return Array.from(tree.childrenIterator(child)).filter(option=>option instanceof Option);return[];}
function notify(select){select._modified();}
function patchParser(){
 const Parser=parse5.Parser,fragment=Parser.getFragmentParser;
 Parser.getFragmentParser=function(context,...args){const parser=fragment.call(this,context,...args);if(context instanceof Select&&active(context._ownerDocument))parser.insertionMode=6;return parser;};
 const start=Parser.prototype._processStartTag,end=Parser.prototype.onEndTag;
 const owned=parser=>{const current=parser.openElements.current??parser.fragmentContext;return active(current?._ownerDocument);};
 // Native preserves these ordinary containers inside document select markup.
 // They remain real DOM parents; option membership follows the actual tree.
 for(const [name,original]of [['_processStartTag',start],['onEndTag',end]])Parser.prototype[name]=function(token){if(this.insertionMode===15&&owned(this)&&(token.tagName==='div'||token.tagName==='span')){this.insertionMode=6;try{return original.call(this,token);}finally{if(this.insertionMode===6)this.insertionMode=15;}}return original.call(this,token);};
}
function patch(){
 if(patched)return;patched=true;patchParser();
 const resetOriginal=Select.prototype._askedForAReset;
 Select.prototype._askedForAReset=function(){if(!active(this._ownerDocument))return resetOriginal.call(this);if(!suppressed.has(this))reset(this);};
 for(const name of ['_descendantAdded','_descendantRemoved']){const original=Select.prototype[name];Select.prototype[name]=function(parent,child){if(!active(this._ownerDocument))return original.call(this,parent,child);suppressed.add(this);try{original.call(this,parent,child);}finally{suppressed.delete(this);}if(selectOwner(parent)!==this)return;const options=changedOptions(parent,child);if(!options.length)return;if(name==='_descendantAdded'){if(!this.hasAttributeNS(null,'multiple')){const selected=options.findLast(option=>option._selectedness);if(selected)for(const option of list(this))option._selectedness=option===selected;else if(options.some(option=>!disabled(option)))reset(this);}}else if(menu(this)&&(options.some(option=>option._selectedness)||!list(this).some(option=>option._selectedness)))reset(this);notify(this);};}
 const modified=Select.prototype._attrModified;
 Select.prototype._attrModified=function(name,...args){const result=modified.call(this,name,...args);if(active(this._ownerDocument)&&(name==='multiple'||name==='size')){if(name==='multiple'&&!this.hasAttributeNS(null,'multiple')){const options=list(this),first=options.find(option=>option._selectedness);if(first)for(const option of options)option._selectedness=option===first;}reset(this);notify(this);}return result;};
 const value=own(Select.prototype,'value');define(Select.prototype,'value',{...value,set(next){if(!active(this._ownerDocument))return value.set.call(this,next);value.set.call(this,next);let found=false;for(const option of list(this)){const match=!found&&option.value===next;option._selectedness=match;if(match)found=true;}notify(this);}});
 const index=own(Select.prototype,'selectedIndex');define(Select.prototype,'selectedIndex',{...index,set(next){const result=index.set.call(this,next);if(active(this._ownerDocument))notify(this);return result;}});
 const selectedOptions=own(Select.prototype,'selectedOptions');define(Select.prototype,'selectedOptions',{...selectedOptions,get(){if(!active(this._ownerDocument))return selectedOptions.get.call(this);return Collection.createImpl(this._globalObject,[],{element:this,query:()=>list(this).filter(option=>option._selectedness)});}});
 const selected=own(Option.prototype,'selected');define(Option.prototype,'selected',{...selected,set(next){if(!active(this._ownerDocument))return selected.set.call(this,next);if(this._selectedness===Boolean(next))quietOptions.add(this);try{return selected.set.call(this,next);}finally{quietOptions.delete(this);this._dirtyness=false;}}});
 const ask=Option.prototype._askForAReset;Option.prototype._askForAReset=function(){if(active(this._ownerDocument)&&quietOptions.has(this))return;return ask.call(this);};
 const owner=own(Option.prototype,'_selectNode');define(Option.prototype,'_selectNode',{...owner,get(){if(!active(this._ownerDocument))return owner.get.call(this);let parent=tree.parent(this);while(parent instanceof Group)parent=tree.parent(parent);return parent instanceof Select?parent:null;}});
 const optionModified=Option.prototype._attrModified;Option.prototype._attrModified=function(name,...args){if(active(this._ownerDocument)&&name==='selected')this._dirtyness=false;return optionModified.call(this,name,...args);};
 const length=own(Options.prototype,'length');define(Options.prototype,'length',{...length,set(next){if(!active(this._element._ownerDocument))return length.set.call(this,next);if(next>100000)return;const options=list(this._element);if(next<options.length){for(let i=options.length-1;i>=next;i--)options[i].parentNode._remove(options[i]);}else for(let i=options.length;i<next;i++)this._element._append(this._element._ownerDocument.createElement('option'));}});
 const indexed=Options.prototype[utils.indexedSetNew];Options.prototype[utils.indexedSetNew]=function(index,value){if(active(this._element._ownerDocument)&&value!==null){const previous=this.item(index);if(previous&&previous.parentNode!==this._element)return previous.parentNode._replace(value,previous);}return indexed.call(this,index,value);};
 const resetForm=Select.prototype._formReset;Select.prototype._formReset=function(){if(!active(this._ownerDocument))return resetForm.call(this);const result=resetForm.call(this),options=list(this),last=options.findLast(option=>option._selectedness);if(last&&!this.hasAttributeNS(null,'multiple'))for(const option of options)option._selectedness=option===last;reset(this);notify(this);return result;};
 const candidate=Select.prototype._isCandidateForConstraintValidation;Select.prototype._isCandidateForConstraintValidation=function(){return active(this._ownerDocument)?!isDisabled(this):candidate.call(this);};
 const validity=own(Select.prototype,'validity');define(Select.prototype,'validity',{...validity,get(){const value=validity.get.call(this);if(active(this._ownerDocument))value._state.valueMissing=()=>{if(!this.willValidate||!this.hasAttributeNS(null,'required'))return false;const option=list(this).find(option=>option._selectedness);return!option||option.getAttributeNS(null,'value')==='';};return value;}});
 const message=own(Select.prototype,'validationMessage');define(Select.prototype,'validationMessage',{...message,get(){if(!active(this._ownerDocument))return message.get.call(this);if(!this.willValidate||this.validity.valid)return'';return this._customValidityErrorMessage||'Please select an item in the list.';}});
 observeDOMWrapperProxy('HTMLOptionsCollection',(target,handler)=>{if(!active(utils.implForWrapper(target)?._element?._ownerDocument)||adjustedHandlers.has(handler))return;adjustedHandlers.add(handler);const descriptor=handler.getOwnPropertyDescriptor,set=handler.set,defineProperty=handler.defineProperty,deleteProperty=handler.deleteProperty;
  const virtual=(raw,key)=>typeof key==='string'&&!utils.isArrayIndexPropName(key)&&!Reflect.has(raw,key)&&descriptor.call(handler,raw,key)!==undefined;
  handler.set=function(raw,key,value,receiver){if(virtual(raw,key)&&receiver===utils.wrapperForImpl(utils.implForWrapper(raw)))return Reflect.defineProperty(raw,key,{value,writable:true,enumerable:false,configurable:true});return set.call(this,raw,key,value,receiver);};
  handler.defineProperty=function(raw,key,value){return virtual(raw,key)?Reflect.defineProperty(raw,key,value):defineProperty.call(this,raw,key,value);};
  handler.deleteProperty=function(raw,key){return virtual(raw,key)?true:deleteProperty.call(this,raw,key);};
  handler.getOwnPropertyDescriptor=function(raw,key){const value=descriptor.call(this,raw,key);if(value&&typeof key==='string'&&!utils.isArrayIndexPropName(key)&&!Reflect.has(raw,key)){value.enumerable=false;value.writable=true;}return value;};
  handler.ownKeys=raw=>Reflect.ownKeys(raw);
 });
}
export function installSelectControls(page,window){if(installed.has(window))return installed.get(window);patch();const document=utils.implForWrapper(window.document),signal=page.documentAbort?.signal,owner=record({signal,disposed:false});documents.set(document,owner);const dispose=()=>{owner.disposed=true;signal?.removeEventListener('abort',dispose);};signal?.addEventListener('abort',dispose,{once:true});const controller=record({dispose});installed.set(window,controller);return controller;}
