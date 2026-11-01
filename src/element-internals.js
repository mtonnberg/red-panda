import {subtreeDefinitelyAbsent,FORM_CANDIDATE_SUBTREE} from './subtree-feature-index.js';
import 'jsdom';
import {createRequire} from 'node:module';
import {registerPlatformFactory,platformFactoryRecord,subscribePlatformFactories} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const require=createRequire(import.meta.url);
const {implForWrapper,wrapperForImpl,ctorRegistrySymbol}=require('jsdom/lib/jsdom/living/generated/utils.js');
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const HTMLElementImpl=require('jsdom/lib/jsdom/living/nodes/HTMLElement-impl.js').implementation;
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const FormImpl=require('jsdom/lib/jsdom/living/nodes/HTMLFormElement-impl.js').implementation;
const RegistryImpl=require('jsdom/lib/jsdom/living/custom-elements/CustomElementRegistry-impl.js').implementation;
const FunctionIDL=require('jsdom/lib/jsdom/living/generated/Function.js');
const ValidityState=require('jsdom/lib/jsdom/living/generated/ValidityState.js');
const {formOwner,isDisabled}=require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const {domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const {enqueueCECallbackReaction}=require('jsdom/lib/jsdom/living/helpers/custom-elements.js');
const {fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');
const records=new WeakMap(),elements=new WeakMap(),internals=new WeakMap(),sets=new WeakMap(),iterators=new WeakMap();
const flags=['badInput','customError','patternMismatch','rangeOverflow','rangeUnderflow','stepMismatch','tooLong','tooShort','typeMismatch','valueMissing'];
const callbacks=['formAssociatedCallback','formDisabledCallback','formResetCallback','formStateRestoreCallback'];
const trustedElements=new WeakMap(),elementRefs=new Set();
subscribePlatformFactories((value,record)=>{if(record.implementation instanceof HTMLElementImpl){trustedElements.set(value,record.implementation);elementRefs.add(new WeakRef(record.implementation));}});
function elementBrand(value){const known=trustedElements.get(value);if(known)return known;for(const ref of elementRefs){const e=ref.deref();if(!e){elementRefs.delete(ref);continue;}if(wrapperForImpl(e)===value){trustedElements.set(value,e);return e;}}return null;}
const nil=()=>Object.create(null),apply=Reflect.apply,wellFormed=String.prototype.toWellFormed;
let patched=false,atomic=0;const deferred=new Set();
const supported=e=>e?._ceDefinition?.formAssociated===true&&e._ceDefinition.name===e._ceDefinition.localName&&(e._ceState==='custom'||e._ceState==='precustomized');
function docRecord(e){return records.get(e?._ownerDocument??e);}
function disabled(e){return e.hasAttributeNS(null,'disabled')||isDisabled(e);}
function ancestor(e,name){for(let n=e.parentNode;n;n=n.parentNode)if(n._localName===name&&n._namespaceURI==='http://www.w3.org/1999/xhtml')return true;return false;}
function willValidate(e){return !disabled(e)&&!e.hasAttributeNS(null,'readonly')&&!ancestor(e,'datalist');}
function valid(state){return !flags.some(flag=>state.flags[flag]);}
function control(e){let state=elements.get(e);if(!state){state=Object.assign(nil(),{element:e,form:null,disabled:false,flags:nil(),message:'',value:null,validity:null,states:null,docs:new WeakSet()});elements.set(e,state);e._customValidityErrorMessage='';e._internalContentAttributeMap??=new Map();}const record=docRecord(e);if(record&&!state.docs.has(record)){state.docs.add(record);record.controls.add(new WeakRef(e));}return state;}
function notify(e,name,args){if(e._ceDefinition?.lifecycleCallbacks[name])enqueueCECallbackReaction(e,name,args);}
function sync(record){if(!record||record.disposed)return;if(atomic){deferred.add(record);return;}for(const ref of record.controls){const e=ref.deref();if(!e){record.controls.delete(ref);continue;}if(e._ownerDocument!==record.document||!supported(e))continue;const state=control(e),form=formOwner(e),isDisabled=disabled(e);if(form!==state.form){state.form=form;notify(e,'formAssociatedCallback',[form]);}if(isDisabled!==state.disabled){state.disabled=isDisabled;notify(e,'formDisabledCallback',[isDisabled]);}}}
function track(node){if(subtreeDefinitelyAbsent(node,FORM_CANDIDATE_SUBTREE))return;for(const e of domSymbolTree.treeIterator(node))if(supported(e))control(e);}
export function atomicFormMove(callback){atomic++;try{return callback();}finally{if(!--atomic){const pending=[...deferred];deferred.clear();for(const record of pending)sync(record);}}}
export function formAssociatedState(element,name){const e=implForWrapper(element);if(!docRecord(e))return undefined;if(supported(e)){if(name==='disabled')return disabled(e);if(name==='enabled')return !disabled(e);if(name==='valid'||name==='invalid')return willValidate(e)&&(name==='valid'?valid(control(e)):!valid(control(e)));}if(e?._localName==='form'&&(name==='valid'||name==='invalid')){const result=e._getElementNodes().every(c=>supported(c)?!willValidate(c)||valid(control(c)):typeof c._isCandidateForConstraintValidation!=='function'||!c._isCandidateForConstraintValidation()||c.validity.valid);return name==='valid'?result:!result;}return undefined;}
export function appendFormAssociatedValue(element,data){if(!supported(element))return false;const state=control(element),value=state.value;if(value===null||disabled(element)||ancestor(element,'datalist'))return true;if(value.kind==='data'){for(const entry of value.entries)data.append(entry.name,typeof entry.value==='string'?entry.value:wrapperForImpl(entry.value));}else{const name=element.getAttributeNS(null,'name');if(name)data.append(name,value.kind==='file'?wrapperForImpl(value.value):value.value);}return true;}
function patch(){if(patched)return;patched=true;
 const define=RegistryImpl.prototype.define;
 RegistryImpl.prototype.define=function(...args){const result=apply(define,this,args),record=records.get(implForWrapper(this._globalObject.document));if(!record)return result;const definition=this._customElementDefinitions.find(d=>d.name===args[0]);if(definition&&definition.name!==definition.localName)definition.formAssociated=false;if(!definition?.formAssociated)return result;for(const name of callbacks){const value=definition.objectReference.prototype[name];definition.lifecycleCallbacks[name]=value===undefined?null:FunctionIDL.convert(this._globalObject,value,{context:name});}const original=definition.constructor.construct;definition.constructor.construct=function(...values){const result=apply(original,this,values),e=implForWrapper(result);if(supported(e)){control(e);sync(docRecord(e));}return result;};return result;};
 for(const name of ['_insert','_remove']){const original=NodeImpl.prototype[name];NodeImpl.prototype[name]=function(node,...args){const record=docRecord(this);if(!record)return apply(original,this,[node,...args]);const nodes=node.nodeType===11?domSymbolTree.childrenToArray(node):[node];for(const n of nodes)track(n);const result=apply(original,this,[node,...args]);for(const n of nodes)track(n);sync(record);return result;};}
 const attr=ElementImpl.prototype._attrModified;ElementImpl.prototype._attrModified=function(name,...args){const record=docRecord(this);if(record&&supported(this))control(this);const result=apply(attr,this,[name,...args]);if(record&&['id','form','disabled'].includes(name))sync(record);return result;};
 for(const name of ['_getElementNodes','_getSubmittableElementNodes']){const original=FormImpl.prototype[name];FormImpl.prototype[name]=function(){const existing=apply(original,this,[]);if(!docRecord(this))return existing;const known=new Set(existing);return domSymbolTree.treeToArray(this.getRootNode({}),{filter:e=>known.has(e)||supported(e)&&formOwner(e)===this});};}
 const check=FormImpl.prototype.checkValidity;FormImpl.prototype.checkValidity=function(){const result=apply(check,this,[]);if(!docRecord(this))return result;let custom=true;for(const e of this._getElementNodes())if(supported(e)&&willValidate(e)&&!valid(control(e))){fireAnEvent('invalid',e,undefined,{cancelable:true});custom=false;}return result&&custom;};
 const reset=HTMLElementImpl.prototype._formReset;HTMLElementImpl.prototype._formReset=function(){if(supported(this)&&docRecord(this))notify(this,'formResetCallback',[]);else if(reset)return apply(reset,this,[]);};
}
function factory(g,bridge){
 const TypeError=g.TypeError,Exception=g.DOMException,String=g.String,apply=Reflect.apply,define=Object.defineProperty,getDescriptor=Object.getOwnPropertyDescriptor;
 const description=getDescriptor(Symbol.prototype,'description').get,normalize=value=>bridge.normalize(typeof value==='symbol'?String(apply(description,value,[])):String(value));
 const original=bridge.prototype,attach=g.HTMLElement.prototype.attachInternals;
 function ElementInternals(){throw new TypeError('Illegal Constructor');}
 define(ElementInternals,'prototype',{value:original,writable:false});define(original,'constructor',{value:ElementInternals,writable:true,configurable:true});bridge.constructor(ElementInternals);
 const methods={
  get shadowRoot(){return bridge.shadow(this);},get states(){return bridge.states(this);},
  setFormValue(){bridge.validate(this);const value=arguments[0];bridge.setValue(this,value==null?null:bridge.binary(value)?value:normalize(value));},
  get form(){return bridge.form(this);},get labels(){return bridge.labels(this);},
  setValidity(){bridge.validate(this);const value=arguments[0];if(value!=null&&typeof value!=='object'&&typeof value!=='function')throw new TypeError('invalid argument');bridge.setValidity(this,value??{},arguments[1],arguments[2]);},
  get willValidate(){return bridge.will(this);},get validity(){return bridge.validity(this);},get validationMessage(){return bridge.message(this);},checkValidity(){return bridge.check(this);},reportValidity(){return bridge.check(this);},
 };
 const existing=Object.fromEntries(Reflect.ownKeys(original).map(key=>[key,getDescriptor(original,key)]));for(const key of Reflect.ownKeys(original))delete original[key];
 for(const key of Object.getOwnPropertyNames(methods))define(original,key,{...getDescriptor(methods,key),enumerable:true,configurable:true});
 const braille={get ariaBrailleLabel(){return bridge.aria(this,'aria-braillelabel');},set ariaBrailleLabel(value){bridge.aria(this,'aria-braillelabel',value==null?null:normalize(value));},get ariaBrailleRoleDescription(){return bridge.aria(this,'aria-brailleroledescription');},set ariaBrailleRoleDescription(value){bridge.aria(this,'aria-brailleroledescription',value==null?null:normalize(value));}};for(const key of Object.getOwnPropertyNames(braille))existing[key]={...getDescriptor(braille,key),enumerable:true,configurable:true};
 for(const key of ['role',...Object.getOwnPropertyNames(existing).filter(key=>key.startsWith('aria')).sort()])if(existing[key])define(original,key,existing[key]);
 define(original,'constructor',{value:ElementInternals,writable:true,configurable:true});define(original,Symbol.toStringTag,{value:'ElementInternals',configurable:true});
 define(g,'ElementInternals',{value:ElementInternals,writable:true,configurable:true});
 define(g.HTMLElement.prototype,'attachInternals',{value:function attachInternals(){bridge.element(this);let value;try{value=apply(attach,this,[]);}catch(e){if(e?.name==='NotSupportedError')throw new Exception('The operation is not supported','NotSupportedError');throw e;}bridge.attached(value);return value;},writable:true,configurable:true,enumerable:true});
 class CustomStateSet{constructor(){if(arguments[0]!==bridge.token)throw new TypeError('Illegal Constructor');bridge.created(this);}get size(){return bridge.size(this);}has(value){bridge.setBrand(this);return bridge.has(this,normalize(value));}add(value){bridge.setBrand(this);bridge.add(this,normalize(value));return this;}delete(value){bridge.setBrand(this);return bridge.delete(this,normalize(value));}clear(){bridge.clear(this);}keys(){return bridge.iterator(this,false);}values(){return bridge.iterator(this,false);}entries(){return bridge.iterator(this,true);}forEach(callback,thisArg){if(typeof callback!=='function')throw new TypeError('invalid argument');bridge.forEach(this,callback,thisArg);}}
 const cp=CustomStateSet.prototype,constructor=getDescriptor(cp,'constructor');delete cp.constructor;for(const key of Object.getOwnPropertyNames(cp))define(cp,key,{...getDescriptor(cp,key),enumerable:true});define(cp,'constructor',constructor);define(cp,Symbol.iterator,{value:cp.values,writable:true,configurable:true});define(cp,Symbol.toStringTag,{value:'CustomStateSet',configurable:true});define(g,'CustomStateSet',{value:CustomStateSet,writable:true,configurable:true});
 bridge.factories(CustomStateSet,function next(){const done=bridge.advance(this);if(done)return{done:true};const value=bridge.current(this);return{done:false,value:bridge.isEntries(this)?[value,value]:value};},function(){return this;});
}
export function installElementInternals(page,window){const document=implForWrapper(window.document);if(records.has(document))return;patch();registerPlatformFactoryKind('CustomStateSet');
 const record=Object.assign(nil(),{page,window,document,controls:new Set(),TypeError:window.TypeError,Exception:window.DOMException,signal:page.documentAbort.signal,disposed:false,Array:window.Array,from:window.Array.from,String:window.String,description:Object.getOwnPropertyDescriptor(window.Symbol.prototype,'description').get,globalObject:implForWrapper(window)._globalObject,token:Symbol('custom-state-set')});records.set(document,record);
 const fail=(name,message)=>{throw name==='TypeError'?new record.TypeError(message):new record.Exception(message??({NotSupportedError:'The operation is not supported',NotFoundError:'The object can not be found here'}[name]??''),name);};
 const state=(value,form=false)=>{const s=internals.get(value);if(!s)fail('TypeError','Illegal invocation');if(form&&!supported(s.element))fail('NotSupportedError');return s;};
 const set=value=>{const result=sets.get(value);if(!result)fail('TypeError','Illegal invocation');return result;};
 const iterator=value=>{const result=iterators.get(value);if(!result)fail('TypeError','Illegal invocation');return result;};
 const text=value=>apply(wellFormed,apply(record.String,undefined,[typeof value==='symbol'?apply(record.description,value,[]):value]),[]);
 const capture=value=>{if(value==null)return null;const data=platformFactoryRecord(value);if(data?.kind==='FormData')return{kind:'data',entries:data.implementation._entries.map(e=>({name:e.name,value:e.value}))};if(data?.kind==='File')return{kind:'file',value:data.implementation};return{kind:'text',value};};
 const bridge=Object.assign(nil(),{token:record.token,prototype:window.ElementInternals.prototype,normalize:value=>apply(wellFormed,value,[]),
  constructor(C){window[ctorRegistrySymbol].ElementInternals=C;},
  element(value){if(!elementBrand(value))fail('TypeError','Illegal invocation');},validate:value=>{state(value,true);},setBrand:value=>{set(value);},
  attached(value){const data=platformFactoryRecord(value);if(data?.kind!=='ElementInternals')fail('TypeError','Illegal invocation');const s=control(data.implementation._targetElement);internals.set(value,s);sync(docRecord(s.element));},
  aria(value,key,input){const map=state(value).element._internalContentAttributeMap;if(arguments.length<3)return map.get(key)??null;if(input===null)map.delete(key);else map.set(key,input);},
  shadow:value=>{const e=state(value).element,s=e._shadowRoot;return s?._availableToElementInternals?wrapperForImpl(s):null;},
  states(value){const s=state(value);if(!s.states)s.states=new record.SetConstructor(record.token);return s.states;},
  form:value=>wrapperForImpl(formOwner(state(value,true).element)),
  labels(value){const s=state(value,true),nodes=domSymbolTree.treeToArray(s.element.getRootNode({}),{filter:e=>e._localName==='label'&&e.control===s.element}).map(wrapperForImpl);return apply(record.from,record.Array,[nodes]);},
  binary:value=>['File','FormData'].includes(platformFactoryRecord(value)?.kind),setValue(value,input){state(value,true).value=capture(input);},
  setValidity(value,input,message,anchor){const s=state(value,true),next=nil();for(const flag of flags)next[flag]=!!input[flag];if(message!==undefined)message=text(message);if(flags.some(k=>next[k])&&!message)fail('TypeError','');if(anchor!==undefined&&anchor!==null){const actual=platformFactoryRecord(anchor)?.implementation;if(!actual||!s.element.contains(actual))fail('NotFoundError');}s.flags=next;s.message=flags.some(k=>next[k])?message:'';s.element._customValidityErrorMessage=next.customError?s.message:'';},
  will:value=>willValidate(state(value,true).element),
  validity(value){const s=state(value,true);if(!s.validity){const checks=nil();for(const flag of flags)checks[flag]=()=>s.flags[flag]===true;s.validity=wrapperForImpl(ValidityState.createImpl(record.globalObject,[],{element:s.element,state:checks}));}return s.validity;},
  message:value=>{const s=state(value,true);return willValidate(s.element)&&!valid(s)?s.message:'';},check:value=>{const s=state(value,true);if(!willValidate(s.element)||valid(s))return true;fireAnEvent('invalid',s.element,undefined,{cancelable:true});return false;},
  factories(C,next,self){record.SetConstructor=C;record.next=next;record.self=self;record.ObjectPrototype=window.Object.prototype;record.create=window.Object.create;},
  created(value){sets.set(value,new Set());registerPlatformFactory(value,{kind:'CustomStateSet',globalObject:window});},size:value=>set(value).size,has:(value,key)=>set(value).has(key),add:(value,key)=>{set(value).add(key);},delete:(value,key)=>set(value).delete(key),clear:value=>{set(value).clear();},
  forEach(value,callback,thisArg){for(const entry of set(value))apply(callback,thisArg,[entry,entry,value]);},
  iterator(value,entries){const object=apply(record.create,window.Object,[record.ObjectPrototype]);iterators.set(object,Object.assign(nil(),{iterator:set(value).values(),entries,current:undefined}));Object.defineProperties(object,{next:{value:record.next,writable:true,configurable:true,enumerable:true},[Symbol.iterator]:{value:record.self,writable:true,configurable:true}});return object;},
  advance(value){const s=iterator(value),next=s.iterator.next();s.current=next.value;return next.done;},current:value=>iterator(value).current,isEntries:value=>iterator(value).entries,
 });
 window.eval(`(${factory.toString()})`)(window,bridge);
 const dispose=()=>{record.disposed=true;record.controls.clear();record.signal.removeEventListener('abort',dispose);};record.signal.addEventListener('abort',dispose,{once:true});
}
