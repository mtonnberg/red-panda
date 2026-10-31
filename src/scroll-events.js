// Real queued DOM delivery over actual document/element scroll state. Private
// records are bound to an immutable owning Document, never an authored global.
import {createRequire}from'node:module';
import {implementationForWrapper}from'./dom-event-state.js';
const require=createRequire(import.meta.url),EventIDL=require('jsdom/lib/jsdom/living/generated/Event.js'),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const documents=new WeakMap(),elements=new WeakMap(),schedule=setTimeout,cancel=clearTimeout,queueTask=setImmediate,cancelTask=clearImmediate;
function dispatch(record,target,type,bubbles){if(record.disposed||record.signal?.aborted)return;const event=EventIDL.create(record.globalObject,[type,{bubbles}],{isTrusted:true});implementationForWrapper(target)._dispatch(implementationForWrapper(event))}
function later(record,callback,delay){const token=schedule(()=>{record.timers.delete(token);if(record.disposed||record.signal?.aborted)return;const task=queueTask(()=>{record.tasks.delete(task);if(!record.disposed&&!record.signal?.aborted)callback()});record.tasks.add(task)},delay);record.timers.add(token);return token}
export function installScrollEvents(page,window){
 const document=implementationForWrapper(window.document),prior=documents.get(document);if(prior)return prior;
 const record=Object.assign(Object.create(null),{document,globalObject:implementationForWrapper(window)._globalObject,signal:page.documentAbort?.signal,disposed:false,timers:new Set(),tasks:new Set(),windowState:'done'});
 record.windowScroll=()=>{if(record.disposed)return;record.windowState='scroll';later(record,()=>{if(record.windowState!=='scroll')return;dispatch(record,utils.wrapperForImpl(document),'scroll',true);record.windowState='end'},10);const end=()=>{if(record.windowState==='scroll'){later(record,end,10);return}if(record.windowState==='end'){dispatch(record,utils.wrapperForImpl(document),'scrollend',true);record.windowState='done'}};later(record,end,20)};
 record.dispose=()=>{if(record.disposed)return;record.disposed=true;for(const timer of record.timers)cancel(timer);record.timers.clear();for(const task of record.tasks)cancelTask(task);record.tasks.clear();record.windowState='done';record.signal?.removeEventListener('abort',record.dispose)};
 documents.set(document,record);record.signal?.addEventListener('abort',record.dispose,{once:true});return record;
}
export function queueElementScroll(implementation){
 const record=documents.get(implementation._ownerDocument);if(!record||record.disposed)return;
 let state=elements.get(implementation);if(!state||state.owner!==record){state=Object.assign(Object.create(null),{phase:'done',owner:record});elements.set(implementation,state)}
 const active=state.phase!=='done';state.phase='scroll';if(active)return;
 const run=()=>{const root=implementation===record.document.documentElement,target=utils.wrapperForImpl(root?record.document:implementation);if(state.phase==='scroll'){state.phase='end';dispatch(record,target,'scroll',root);later(record,run,10)}else if(state.phase==='end'){state.phase='done';dispatch(record,target,'scrollend',root)}};
 later(record,run,10);
}
