// The real written parser's EOF owns this bounded lifecycle producer. Actual
// asynchronous script/resource promises remain live; no resource is settled here.
import vm from 'node:vm';import {createRequire} from 'node:module';
import {platformFactoryRecord} from './platform-factories.js';
import {createInvocationTrampoline} from './invocation.js';
import {captureDispatchWindow,withOwnedDispatchRecovery,beginDispatchRecoveryParticipant,completeDispatchRecoveryParticipant} from './dom-dispatch-recovery.js';
const require=createRequire(import.meta.url),{fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');
const Document=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const EventImplementation=require('jsdom/lib/jsdom/living/events/Event-impl.js').implementation,hasInstance=Function.prototype[Symbol.hasInstance];
const readiness=Object.getOwnPropertyDescriptor(Document.prototype,'readyState'),apply=Reflect.apply;
const records=new WeakMap(),frames=new WeakMap();
function active(record){const c=record.context;return !c.disposed&&!c.page.closed&&!c.page.retired&&!c.record.signal?.aborted&&c.document._defaultView!==null}
function currentFrame(record){const c=record.context,frame=record.frame;return !!frame&&active(record)&&c.page.record?.page===c.page&&frame._contentDocument===c.document&&frames.get(frame)===record}
function owned(record,operation){return withOwnedDispatchRecovery(()=>record.invocation.invoke(operation,undefined,[],record.options))}
function during(record,key,operation){
 const previous=record[key],token=beginDispatchRecoveryParticipant(()=>{record[key]=previous});record[key]=previous+1;
 try{return operation()}finally{record[key]=previous;completeDispatchRecoveryParticipant(token)}
}
export function isTrustedLifecycleEvent(front){const event=platformFactoryRecord(front)?.implementation;return apply(hasInstance,EventImplementation,[event])&&event.isTrusted===true}
export function registerManagedLifecycle(context){
 const document=context.document,actual=document._globalObject,owner=context.page.registry?.page??context.page;
 if(!vm.isContext(actual)||owner.browser?.pages?.get(owner.id)!==owner||platformFactoryRecord(context.window.document)?.implementation!==document)return false;
 if(records.has(document))throw new TypeError('Managed lifecycle document owner already registered');
 captureDispatchWindow(context.window,actual);
 const manager=context.page.moduleScripts;if(manager&&typeof manager.startWrittenEOF!=='function')throw new TypeError('The genuine written module producer is required');
 const record=Object.assign(Object.create(null),{context,invocation:createInvocationTrampoline(actual),options:{timeout:Math.min(context.page.timeout??2000,2000),displayErrors:false},phase:undefined,windowLoadDepth:0,iframeLoadDepth:0,muteFrameLoad:false,startModules:manager?manager.startWrittenEOF.bind(manager):null,frame:context.page.registry?context.page.record?.element??null:null});
 records.set(document,record);if(record.frame)frames.set(record.frame,record);return true;
}
export function beginManagedWrittenCycle(context){
 const record=records.get(context.document);if(!record)return;
 if(record.phase===undefined)record.phase=apply(readiness.get,context.document,[])==='complete'?'complete':'parsing';
 if(record.iframeLoadDepth)record.muteFrameLoad=true;
}
export function completeManagedWrittenEOF(context,cycle){
 const record=records.get(context.document);
 if(!record||!context.loaded||!active(record)||context.current!==cycle||context.record.parser!==cycle.parser||!context.record.parserDone||!cycle.parser.stopped||cycle.state.status!=='complete')return false;
 cycle.managedLifecycle=true;
 owned(record,()=>{
  // Start actual work and resume its genuine queues. Neither the ready promise
  // nor a request/body/script execution is fabricated as completed.
  record.startModules?.();context.document._deferQueue.resume();context.document._queue.resume();
  const document=context.document;
  if(record.phase==='complete')record.phase='parsing';
  if(record.phase==='parsing'){
   record.phase='load';apply(readiness.set,document,['interactive']);if(!active(record))return;
   fireAnEvent('DOMContentLoaded',document,undefined,{bubbles:true});
  }
  // A genuine nested EOF during state/DCL may already finish this frame. The
  // private frame phase is distinct from the same Document's live readiness.
  if(!active(record)||record.phase==='complete')return;
  record.phase='complete';if(apply(readiness.get,document,[])!=='complete')apply(readiness.set,document,['complete']);
  if(!active(record)||record.windowLoadDepth||record.iframeLoadDepth)return;
  during(record,'windowLoadDepth',()=>fireAnEvent('load',context.window,undefined,{},true));
  if(currentFrame(record)&&!record.muteFrameLoad)during(record,'iframeLoadDepth',()=>fireAnEvent('load',record.frame));
 });
 return true;
}
