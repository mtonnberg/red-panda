// Independent measured control behavior over the actual pinned DOM backends.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {setTimeout as schedule,clearTimeout as cancel} from 'node:timers';
import {platformFactoryRecord} from './platform-factories.js';
import {getRuntimeBinding} from './native-runtime.js';
import {captureDOMExceptionFactory,domExceptionRecord} from './worker-dom-exception.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const Input=require('jsdom/lib/jsdom/living/nodes/HTMLInputElement-impl.js').implementation;
const Area=require('jsdom/lib/jsdom/living/nodes/HTMLTextAreaElement-impl.js').implementation;
const State=require('jsdom/lib/jsdom/living/constraint-validation/ValidityState-impl.js').implementation;
const Validity=require('jsdom/lib/jsdom/living/generated/ValidityState.js'),Event=require('jsdom/lib/jsdom/living/generated/Event.js');
const {isDisabled}=require('jsdom/lib/jsdom/living/helpers/form-controls.js'),{closest}=require('jsdom/lib/jsdom/living/helpers/traversal.js');
const {cloningSteps}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const documents=new WeakMap(),realms=new WeakMap(),pending=new WeakMap(),adaptedStates=new WeakSet(),installed=new WeakSet();let patched=false;
const selectionTypes=new Set(['text','search','tel','url','password']),selectTypes=new Set([...selectionTypes,'email','number']);
const own=Object.getOwnPropertyDescriptor,define=Object.defineProperty,apply=Reflect.apply;
const symbolDescription=own(Symbol.prototype,'description').get;
function owner(control){return documents.get(control._ownerDocument)??realms.get(control._globalObject)?.owner;}
function live(record){return record&&!record.disposed&&!record.signal?.aborted&&!record.page.closed;}
function state(control){return[control._selectionStart,control._selectionEnd,control._selectionDirection];}
function changed(before,control){const after=state(control);return before.some((v,i)=>v!==after[i]);}
function clamp(control){const length=control.value.length;control._selectionEnd=Math.min(control._selectionEnd,length);control._selectionStart=Math.min(control._selectionStart,control._selectionEnd);}
function queue(control,selection,select){
 const record=owner(control);if(!live(record))return;
 let task=pending.get(control);if(!task){task={control,record,selection:false,select:false,timer:undefined};pending.set(control,task);record.pending.add(task);task.timer=schedule(()=>{
  pending.delete(control);record.pending.delete(task);if(!live(record))return;
  // A reentrant selection listener may queue another actual task. This task's
  // select bit and target are captured independently, never a fixed count.
  if(task.selection)control._dispatch(Event.createImpl(control._ownerDocument._globalObject,['selectionchange',{bubbles:true,cancelable:false,composed:false}],{isTrusted:true}));
  if(task.select)control._dispatch(Event.createImpl(control._ownerDocument._globalObject,['select',{bubbles:true,cancelable:false,composed:false}],{isTrusted:true}));
 },0);}
 task.selection||=selection;task.select||=select;
}
function patternMismatch(control){
 const record=owner(control);if(!control.willValidate||!control._hasAttributeAndApplies('pattern')||control.value==='')return false;
 const pattern=control.getAttributeNS(null,'pattern');
 try{
  // Validate the actual unwrapped pattern as well as anchoring its match.
  record.binding.boundedRegExp(pattern,'',false,record.window);
  return record.binding.boundedRegExp('^(?:'+pattern+')$',control.value,false,record.window)===null;
 }catch(error){if(types.isNativeError(error)&&error.name==='SyntaxError')return false;throw error;}
}
function message(control){
 if(!control.willValidate)return'';const validity=control.validity;
 if(validity.customError)return control._customValidityErrorMessage;
 if(validity.valueMissing)return'Please fill out this field.';
 if(validity.typeMismatch)return control.type==='email'?'Please enter an email address.':'Please enter a URL.';
 if(validity.patternMismatch)return'Please match the requested format.';
 if(validity.rangeUnderflow)return'Value is too small.';
 if(validity.rangeOverflow)return'Value is too large.';
 return'';
}
function remap(control,error){
 const record=domExceptionRecord(error);if(!record)return error;
 const factory=(realms.get(control._globalObject)?.owner??owner(control)).exception;
 if(record.name==='InvalidStateError')return factory('The object is in an invalid state',record.name);
 if(record.name==='IndexSizeError')return factory('Index or size is negative or greater than the allowed amount',record.name);
 return error;
}
function patch(){
 if(patched)return;patched=true;
 const filename=require.resolve('jsdom/lib/jsdom/living/generated/ValidityState.js');
 if(require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(readFileSync(filename)).digest('hex')!=='e51af4b3331c3dba269f595d3f075621dcda0ee1a9ed607543bac927cc0e1933')throw new Error('Pinned ValidityState allocation source changed');
 const create=Validity.create;
 Validity.create=function(globalObject,args,privateData){
  const record=realms.get(globalObject);if(!record)return create.call(this,globalObject,args,privateData);
  const value=Reflect.construct(record.Object,[]);Object.setPrototypeOf(value,globalObject[utils.ctorRegistrySymbol].ValidityState.prototype);
  return Validity.setup(value,globalObject,args,privateData);
 };
 const candidate=Input.prototype._isCandidateForConstraintValidation;
 Input.prototype._isCandidateForConstraintValidation=function(){if(!owner(this))return candidate.call(this);return!isDisabled(this)&&closest(this,'datalist')===null&&!this.hasAttributeNS(null,'readonly')&&!['hidden','reset','button'].includes(this.type);};
 const validity=own(Input.prototype,'validity');define(Input.prototype,'validity',{...validity,get(){const result=validity.get.call(this);if(owner(this)&&!adaptedStates.has(result)){adaptedStates.add(result);const missing=result._state.valueMissing;result._state.valueMissing=()=>this.willValidate&&missing();result._state.patternMismatch=()=>patternMismatch(this);}return result;}});
 for(const Prototype of[Input.prototype,Area.prototype]){
  const validationMessage=own(Prototype,'validationMessage');define(Prototype,'validationMessage',{...validationMessage,get(){return owner(this)?message(this):validationMessage.get.call(this);}});
  const range=Prototype.setSelectionRange;
  Prototype.setSelectionRange=function(start,end,direction){
   if(!owner(this))return range.apply(this,arguments);
   if(this instanceof Input&&!selectionTypes.has(this.type)){try{return range.apply(this,arguments)}catch(error){throw remap(this,error)}}
   const before=state(this),length=this.value.length;
   this._selectionEnd=Math.min(end,length);this._selectionStart=Math.min(start,this._selectionEnd);this._selectionDirection=direction==='forward'||direction==='backward'?direction:'none';
   if(changed(before,this))queue(this,true,false);
  };
  const select=Prototype.select;
  Prototype.select=function(){if(!owner(this))return select.apply(this,arguments);if(this instanceof Input&&!selectTypes.has(this.type))return;const before=state(this);this._selectionStart=0;this._selectionEnd=this.value.length;this._selectionDirection='none';queue(this,changed(before,this),true);};
  const reset=Prototype._formReset;Prototype._formReset=function(...args){const value=reset.apply(this,args);if(owner(this))clamp(this);return value;};
 }
 const modify=Input.prototype._attrModified;Input.prototype._attrModified=function(name,...args){const value=modify.call(this,name,...args);if(owner(this)&&name==='value'&&!this._dirtyValue)clamp(this);return value;};
 const text=Area.prototype._childTextContentChangeSteps;Area.prototype._childTextContentChangeSteps=function(...args){const value=text.apply(this,args);if(owner(this)&&!this._dirtyValue)clamp(this);return value;};
 const clone=Input.prototype[cloningSteps];Input.prototype[cloningSteps]=function(copy,node){const value=clone.call(this,copy,node);if(owner(node)){copy._selectionStart=node._selectionStart;copy._selectionEnd=node._selectionEnd;copy._selectionDirection=node._selectionDirection;}return value;};
}
function primitive(value,hint,Error){
 if(value===null||typeof value!=='object'&&typeof value!=='function')return value;
 const exotic=value[Symbol.toPrimitive];if(exotic!=null){if(typeof exotic!=='function')throw new Error('Cannot convert object to primitive value');const result=apply(exotic,value,[hint]);if(result!==null&&(typeof result==='object'||typeof result==='function'))throw new Error('Cannot convert object to primitive value');return result;}
 for(const key of hint==='string'?['toString','valueOf']:['valueOf','toString']){const method=value[key];if(typeof method==='function'){const result=apply(method,value,[]);if(result===null||typeof result!=='object'&&typeof result!=='function')return result;}}
 throw new Error('Cannot convert object to primitive value');
}
function string(value,Error){const direct=typeof value==='symbol';value=primitive(value,'string',Error);if(typeof value==='symbol'){if(!direct)throw new Error('Cannot convert a Symbol value to a string');return String(apply(symbolDescription,value,[]));}return String(value);}
function uint(value,Error){value=primitive(value,'number',Error);if(typeof value==='symbol')throw new Error('Cannot convert a Symbol value to a number');return Number(value)>>>0;}
function implementation(value,Kind){if(types.isProxy(value))return null;const result=platformFactoryRecord(value)?.implementation;return result instanceof Kind?result:null;}
function setupRealm(global,context,record,wrap=utils.tryWrapperForImpl){
 if(installed.has(global))return;installed.add(global);
 const realm={owner:record,Error:global.TypeError,Object:vm.runInContext('Object',context)};realms.set(global,realm);realms.set(context,realm);
 const entry=(name,length,Kind,operation)=>{const value=record.binding.createEntry((caller,receiver,args)=>{const Error=realms.get(caller)?.Error??realm.Error,control=implementation(receiver,Kind);if(!control)throw new Error('Illegal invocation');return operation(control,args,Error);},global,name);define(value,'length',{value:length,configurable:true});return value;};
 for(const[name,Kind]of[['HTMLInputElement',Input],['HTMLTextAreaElement',Area]]){
  const prototype=global[name].prototype;
  for(const[method,length]of[['select',0],['setSelectionRange',2],['setRangeText',1],['checkValidity',0],['reportValidity',0],['setCustomValidity',1]]){
   const fn=entry(method,length,Kind,(control,args,Error)=>{
    if(method==='select'||method==='checkValidity'||method==='reportValidity')return control[method]();
    if(args.length<(method==='setSelectionRange'?2:1))throw new Error('invalid argument');
    if(method==='setCustomValidity')return control.setCustomValidity(string(args[0],Error));
    if(method==='setSelectionRange'){const start=uint(args[0],Error),end=uint(args[1],Error),direction=args[2]===undefined?undefined:string(args[2],Error);return control.setSelectionRange(start,end,direction);}
    const replacement=string(args[0],Error);let converted;
    if(args.length===1)converted=[replacement];else{const start=uint(args[1],Error);if(args.length===2)throw new Error('');const end=uint(args[2],Error),mode=args[3]===undefined?'preserve':string(args[3],Error);if(!['select','start','end','preserve'].includes(mode))throw new Error('');converted=[replacement,start,end,mode];}
    try{return apply(control.setRangeText,control,converted)}catch(error){throw remap(control,error)}
   });define(prototype,method,{value:fn,writable:true,enumerable:true,configurable:true});
  }
  for(const key of['value','defaultValue','selectionStart','selectionEnd','selectionDirection','validity','validationMessage','willValidate']){
   const get=entry('get '+key,0,Kind,control=>key==='validity'?wrap(control.validity):key==='selectionDirection'?control._selectionDirection:control[key]);
   let set;if(!['selectionDirection','validity','validationMessage','willValidate'].includes(key))set=entry('set '+key,1,Kind,(control,args,Error)=>{let value=args[0];if(key==='value'||key==='defaultValue')value=key==='value'&&Kind===Input&&value===null?'':string(value,Error);else value=uint(value,Error);try{control[key]=value}catch(error){throw remap(control,error)}});
   define(prototype,key,{get,set,enumerable:true,configurable:true});
  }
 }
 for(const key of['badInput','customError','patternMismatch','rangeOverflow','rangeUnderflow','stepMismatch','tooLong','tooShort','typeMismatch','valueMissing','valid'])define(global.ValidityState.prototype,key,{get:entry('get '+key,0,State,value=>value[key]),enumerable:true,configurable:true});
}
export function installFormControlParity(page,window){
 const document=utils.implForWrapper(window.document);if(documents.has(document))return;
 const record={page,window,signal:page.documentAbort?.signal,disposed:false,pending:new Set(),binding:getRuntimeBinding(),exception:captureDOMExceptionFactory(window)};
 documents.set(document,record);setupRealm(window,document._globalObject,record);patch();
 const dispose=()=>{record.disposed=true;for(const task of record.pending){cancel(task.timer);pending.delete(task.control);}record.pending.clear();};record.signal?.addEventListener('abort',dispose,{once:true});
}
export function installUtilityFormControlParity(controller,window){const record=documents.get(utils.implForWrapper(window.document));if(record)setupRealm(controller.global,controller.context,record,controller.wrap);}
