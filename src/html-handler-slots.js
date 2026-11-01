// Canonical event-handler lifetime over actual private jsdom listener records.
// Public generated constructors/accessors and the sole dispatch engine remain.
import 'jsdom';import vm from 'node:vm';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {platformFactoryRecord,subscribePlatformFactories} from './platform-factories.js';import {implementationForWrapper} from './dom-event-state.js';import {reportWindowException,rememberCompilerOrigin} from './errors.js';
const require=createRequire(import.meta.url),own=Object.getOwnPropertyDescriptor,apply=Reflect.apply,indexOf=Array.prototype.indexOf,splice=Array.prototype.splice,setDelete=Set.prototype.delete;
const Document=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const prototypes=['GlobalEventHandlers','HTMLElement','SVGElement','Document'].map(name=>require('jsdom/lib/jsdom/living/nodes/'+name+'-impl.js').implementation.prototype);
const accessors=require('jsdom/lib/jsdom/living/helpers/create-event-accessor.js'),documents=new WeakMap(),windows=new WeakMap(),implementations=new WeakSet(),slots=new WeakMap(),wrapped=new WeakSet(),convertedCallbacks=new WeakMap(),trackedConverters=new WeakMap(),inlineBodies=new WeakMap();let patched=false;
subscribePlatformFactories((_value,record)=>{const value=record.implementation;if(value!==null&&(typeof value==='object'||typeof value==='function'))implementations.add(value)});
function recordFor(target){
 const direct=windows.get(target);if(direct)return direct;
 if(!implementations.has(target))return undefined;
 const ownDocument=documents.get(target);if(ownDocument)return ownDocument;
 return documents.get(own(target,'_ownerDocument')?.value);
}
function listenerTarget(target,record){return windows.has(target)?record.windowImplementation:target}
function trackCallbackConversions(){
 for(const name of ['EventHandlerNonNull','OnErrorEventHandlerNonNull','OnBeforeUnloadEventHandlerNonNull']){
  const module=require('jsdom/lib/jsdom/living/generated/'+name+'.js'),convert=module.convert;
  if(trackedConverters.get(module)===convert)continue;
  const tracking=function(globalObject,value,...args){const result=apply(convert,this,[globalObject,value,...args]);if(result!==null&&(typeof result==='object'||typeof result==='function'))convertedCallbacks.set(result,value);return result};
  module.convert=tracking;trackedConverters.set(module,tracking);
 }
}
function wrap(original){
 const method=function(event,handler){
  const record=recordFor(this);if(!record)return apply(original,this,arguments);
  let forwarded=arguments;
  // Only successful canonical converter results confer callback provenance.
  // Never inspect an authored object's objectReference/body/name properties.
  if(convertedCallbacks.has(handler)&&typeof convertedCallbacks.get(handler)!=='function'){handler=null;forwarded=[event,null]}
  const target=this._getEventHandlerTarget(event);if(!target)return apply(original,this,forwarded);
  const targetRecord=recordFor(target);if(!targetRecord)return apply(original,this,forwarded);
  const implementation=listenerTarget(target,targetRecord);let map=slots.get(implementation);if(!map){map=new Map();slots.set(implementation,map)}
  if(handler===null){
   const previous=map.get(event),listeners=implementation._eventListeners[event];
   if(previous&&listeners){const index=apply(indexOf,listeners,[previous]);if(index!==-1)apply(splice,listeners,[index,1]);map.delete(event);apply(setDelete,target._registeredHandlers,[event])}
  }
  const before=new Set(implementation._eventListeners[event]??[]),result=apply(original,this,forwarded);
  for(const listener of implementation._eventListeners[event]??[])if(!before.has(listener))map.set(event,listener);
  return result;
 };wrapped.add(method);return method;
}
function patch(){
 if(patched)return;patched=true;
 const filename=require.resolve('jsdom/lib/jsdom/living/helpers/create-event-accessor.js');
 if(require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(readFileSync(filename)).digest('hex')!=='d813252e44813962ef5a255f7200b77439f0b225e0f64c54080dd49566480cfe')throw new Error('Pinned canonical event accessor source changed');
 for(const prototype of prototypes){
  const descriptor=own(prototype,'_setEventHandlerFor');if(descriptor?.value)Object.defineProperty(prototype,'_setEventHandlerFor',{...descriptor,value:wrap(descriptor.value)});
  const changed=own(prototype,'_globalEventChanged');if(changed?.value)Object.defineProperty(prototype,'_globalEventChanged',{...changed,value:function(event){
   const record=recordFor(this);if(extraEvents.includes(event)&&!record)return undefined;
   const result=apply(changed.value,this,arguments);if(!record)return result;
   const value=this._getEventHandlerFor(event),text=this.getAttributeNS(null,'on'+event);
   // Only the actual canonical content-attribute producer's newly stored plain
   // private record is eligible. Public callback properties confer no brand.
   if(value&&typeof value==='object'&&typeof text==='string'&&own(value,'body')?.value===text)inlineBodies.set(value,text);
   return result;
  }});
 }
 for(const prototype of [prototypes[1],prototypes[3]])for(const name of extraEvents)if(!own(prototype,'on'+name))accessors.createEventAccessor(prototype,name);
 const current=accessors.getCurrentEventHandlerValue;
 accessors.getCurrentEventHandlerValue=function(target,event){
  const record=recordFor(target);if(!record)return apply(current,this,arguments);
  const value=target._getEventHandlerFor(event),body=value&&(typeof value==='object'||typeof value==='function')?inlineBodies.get(value):undefined;
  if(body!==undefined){
   try{
    // Actual Native-profile anonymous body compilation: same VM, real formal
    // parameters and no named wrapper or post-creation name/prototype repair.
    const specialError=windows.has(target._getEventHandlerTarget(event))&&event==='error';
    const parameters=specialError?['event','source','lineno','colno','error']:['event'];
    const compiled=vm.compileFunction(body,parameters,{parsingContext:record.context,filename:'anonymous'});
    const converter=require('jsdom/lib/jsdom/living/generated/'+(specialError?'OnErrorEventHandlerNonNull':event==='beforeunload'?'OnBeforeUnloadEventHandlerNonNull':'EventHandlerNonNull')+'.js');
    const converted=converter.convert(record.context,compiled);
    target._setEventHandlerFor(event,converted);
    return converted;
   }catch(error){
    // The filename/line/caret are emitted by this exact compiler invocation.
    // A hostile prepareStackTrace tail does not confer origin authority.
    const stack=error.stack;
    if(typeof stack==='string'){
     const lines=stack.split('\n'),match=/^anonymous:(\d+)$/.exec(lines[0]??'');
     if(match){const line=Number(match[1]),source=body.split(/\r\n|[\n\r\u2028\u2029]/)[line-1],caret=lines[2]??'';
      if(source!==undefined&&lines[1]===source&&/^[ \t]*\^+$/.test(caret))rememberCompilerOrigin(error,{filename:'anonymous',lineno:line,colno:caret.indexOf('^')+1});
     }
    }
    target._setEventHandlerFor(event,null);if(!reportWindowException(record.window,error))require('jsdom/lib/jsdom/living/helpers/runtime-script-errors.js')(record.window,error);return null;
   }
  }
  return apply(current,this,arguments);
 };
}
export function installHTMLHandlerSlots(window){
 const document=platformFactoryRecord(window.document)?.implementation;if(!(document instanceof Document))throw new TypeError('A successful canonical Document factory is required');
 trackCallbackConversions();if(documents.has(document))return;
 const context=document._globalObject;if(!vm.isContext(context))return;const record=Object.assign(Object.create(null),{window,windowImplementation:implementationForWrapper(window),context,TypeError:vm.isContext(context)?vm.runInContext('TypeError',context):window.TypeError});
 documents.set(document,record);implementations.add(document);windows.set(window,record);windows.set(context,record);windows.set(record.windowImplementation,record);
 patch();
 publish(record,window);
 // Window's original private mixin methods are copied during its allocation.
 // Preserve their existing receiver/flags; future Windows inherit the wrapped
 // same canonical mixin and are detected here without adding a second wrapper.
 const descriptor=own(context,'_setEventHandlerFor');if(descriptor?.value&&!wrapped.has(descriptor.value))Object.defineProperty(context,'_setEventHandlerFor',{...descriptor,value:wrap(descriptor.value)});
}

const extraEvents=['pointerdown','pointerup','pointermove','pointerover','pointerout','pointerenter','pointerleave','pointercancel','animationstart','animationend','animationiteration','animationcancel','transitionrun','transitionstart','transitionend','transitioncancel'];
const utils=require('jsdom/lib/jsdom/living/generated/utils.js'),HTMLElement=require('jsdom/lib/jsdom/living/nodes/HTMLElement-impl.js').implementation,hasInstance=Function.prototype[Symbol.hasInstance];
function publish(record,window){
 function descriptor(key,bridge){return vm.compileFunction('return Object.getOwnPropertyDescriptor({get '+key+'(){return bridge.get(this)},set '+key+'(value){bridge.set(this,value)}},'+JSON.stringify(key)+');',['bridge'],{parsingContext:record.context})(bridge)}
 for(const [kind,owner,Impl] of [['Window',window,null],['Document',window.Document.prototype,Document],['HTMLElement',window.HTMLElement.prototype,HTMLElement]]){
  const backend=value=>{if(kind==='Window'){if(value===window||value===record.context)return record.context;throw new record.TypeError('Illegal invocation')}const actual=platformFactoryRecord(value)?.implementation;if(!apply(hasInstance,Impl,[actual]))throw new record.TypeError('Illegal invocation');return actual};
  for(const event of extraEvents){const key='on'+event;if(own(owner,key))throw new Error('New event handler already published: '+kind+'.'+key);
   const bridge={get(value){return utils.tryWrapperForImpl(accessors.getCurrentEventHandlerValue(backend(value),event))},set(value,callback){const target=backend(value);const converted=typeof callback==='function'?require('jsdom/lib/jsdom/living/generated/EventHandlerNonNull.js').convert(record.context,callback):null;target._setEventHandlerFor(event,converted)}};
   Object.defineProperty(owner,key,{...descriptor(key,bridge),enumerable:true,configurable:true});
  }
 }
 // Window.js captured the original private helper before installer hooks ran.
 // New actual VM getters deliberately call its canonical dynamic replacement;
 // library Host allocation before this publication remains an explicit boundary.
 const WindowHandlers=require('jsdom/lib/jsdom/living/nodes/WindowEventHandlers-impl.js').implementation.prototype;
 for(const prototype of [prototypes[0],WindowHandlers])for(const key of Object.getOwnPropertyNames(prototype)){
  if(!key.startsWith('on')||extraEvents.includes(key.slice(2)))continue;const old=own(window,key);if(!old?.get||!old?.set)continue;
  const event=key.slice(2),bridge={get(){return utils.tryWrapperForImpl(accessors.getCurrentEventHandlerValue(record.context,event))}};
  const replacement=vm.compileFunction('return Object.getOwnPropertyDescriptor({get '+key+'(){return bridge.get()}},'+JSON.stringify(key)+').get',['bridge'],{parsingContext:record.context})(bridge);
  Object.defineProperty(window,key,{...old,get:replacement});
 }
}
