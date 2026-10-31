import 'jsdom';
import { types } from 'node:util';
import { createRequire } from 'node:module';
import { installMessaging } from './messaging.js';
import { broadcastConfig, contextOf } from './broadcast-config.js';
import { createBroadcastRealm } from './broadcast-realm.js';
export { broadcastConfig, createBroadcastRealm };

const require=createRequire(import.meta.url);
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');
const MessageEvent=require('jsdom/lib/jsdom/living/generated/MessageEvent.js');
const nativeClone=globalThis.structuredClone;
const WINDOWS=new WeakMap(),BROADCASTS=new WeakMap();
const active=record=>!record.disposed&&!record.signal?.aborted&&!record.page.closed&&record.window.document===record.document;

export function installBroadcast(page,window){
 if(BROADCASTS.has(window))return BROADCASTS.get(window);
 const record={page,window,document:window.document,signal:page.documentAbort?.signal,disposed:false};
 const controller=createBroadcastRealm(window,{messaging:installMessaging(page,window),config:broadcastConfig(page,window),active:()=>active(record),
  dispatch:(target,type,data,ports,origin)=>fireAnEvent(type,implForWrapper(target),MessageEvent,{data,ports,origin,source:null,lastEventId:'',bubbles:false,cancelable:false}),
  reportError:error=>page.emit?.('pageError',error)});
 Object.defineProperty(window,'BroadcastChannel',{value:controller.BroadcastChannel,writable:true,configurable:true});
 const previousClose=window.close;
 function dispose(){if(record.disposed)return;record.disposed=true;controller.dispose();record.signal?.removeEventListener('abort',dispose);if(window.close===close)window.close=previousClose}
 function close(...args){dispose();return previousClose.apply(this,args)}window.close=close;record.signal?.addEventListener('abort',dispose,{once:true});
 const api={dispose,get size(){return controller.size},get pending(){return controller.pending}};BROADCASTS.set(window,api);return api;
}

/** Install a native entry function supplied by the version-checked V8 addon.
 * source is captured from GetIncumbentContext BEFORE entering a JS callback.
 * Unknown host callers fail explicitly: receiver, payload and stack strings
 * are never used to guess a source. Target receiver branding remains separate.
 */
export function installWindowMessaging(page,window,{entry}){
 if(WINDOWS.has(window))return WINDOWS.get(window).controller;
 if(typeof entry?.createEntry!=='function')throw new TypeError('Window messaging requires native incumbent-context entry');
 const record={page,window,document:window.document,signal:page.documentAbort?.signal,disposed:false,pending:new Set(),bridge:installMessaging(page,window)};
 WINDOWS.set(window,record);
 const nativeEntry=entry.createEntry((incumbent,receiver,args)=>{
  const source=WINDOWS.get(incumbent),target=WINDOWS.get(receiver);
  if(!target)throw new window.TypeError('Illegal invocation');
  if(!source)throw new window.TypeError('Window.postMessage source is not a registered Window realm');
  if(!args.length)throw new window.TypeError('postMessage requires a message');
  if(!active(source))throw new window.DOMException('The source document is disposed','InvalidStateError');
  if(contextOf(source.page)!==contextOf(target.page))throw new window.DOMException('Windows belong to different browser contexts','SecurityError');
  // Pinned native behavior deliberately ignores targetOrigin, including its
  // getters/coercion. The options overload reads only transfer. ArrayBuffer
  // entries (including duplicates) are ignored rather than detached; actual
  // MessagePorts transfer and remain identity-shared between data and ports.
  let transfer=args[2];
  if(args[1]!==null&&typeof args[1]==='object')transfer=args[1].transfer;
  if(transfer==null)transfer=[];
  if(typeof transfer?.[Symbol.iterator]!=='function')throw new window.TypeError('Transfer list must be iterable');
  transfer=[...transfer].filter(value=>!types.isArrayBuffer(value));
  const sourceOrigin=source.window.location.origin;
  const prepared=source.bridge.prepare(args[0],{transfer});let envelope;
  try{envelope=nativeClone(prepared.message,{transfer:prepared.transfer});prepared.commit()}
  catch(error){if(error?.name==='DataCloneError')throw new window.DOMException(error.message,'DataCloneError');throw error}
  const discard=()=>{for(const port of envelope.ports)port.close()};
  if(!active(target)){discard();return}
  const task={timer:null,discard};target.pending.add(task);
  task.timer=target.window.setTimeout(()=>{
   if(!active(target)){target.pending.delete(task);discard();return}
   const delivered=target.bridge.deliver(target.window,envelope,result=>{
    fireAnEvent('message',implForWrapper(target.window),MessageEvent,{data:result.data,ports:result.ports,origin:sourceOrigin,source:source.window,lastEventId:'',bubbles:false,cancelable:false});
   },()=>active(target));
   if(delivered?.then)void delivered.finally(()=>target.pending.delete(task));else target.pending.delete(task);
  },0);
 },window);
 Object.defineProperty(window,'postMessage',{value:nativeEntry,writable:true,configurable:true,enumerable:true});
 const previousClose=window.close;
 function dispose(){if(record.disposed)return;record.disposed=true;for(const task of record.pending){window.clearTimeout(task.timer);task.discard()}record.pending.clear();record.signal?.removeEventListener('abort',dispose);if(window.close===close)window.close=previousClose}
 function close(...args){dispose();return previousClose.apply(this,args)}window.close=close;record.signal?.addEventListener('abort',dispose,{once:true});
 const controller={dispose,get pending(){return record.pending.size}};record.controller=controller;return controller;
}
