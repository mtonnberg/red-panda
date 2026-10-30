import { BroadcastChannel as NativeBroadcastChannel } from 'node:worker_threads';
import { createHash, randomUUID } from 'node:crypto';
const CHANNELS=new WeakMap();
function string(value,realm){if(typeof value==='symbol')throw new realm.TypeError('Cannot convert a Symbol to a DOMString');return String(value)}

/** Native node:worker_threads BroadcastChannels provide real asynchronous
 * clone/delivery across main and worker threads. The namespace binds Browser-
 * Context plus security origin. Each receiver adopts its own realm intrinsics.
 * This deliberately rejects unsupported Blob/File/SAB clone types through the
 * shared messaging adapter rather than flattening their native state. */
export const broadcastKey=(config,name)=>`red-panda:${createHash('sha256').update(JSON.stringify([config.namespace,config.originKey,name])).digest('hex')}`;

/** A private native-BC publisher outlives the sending channel while immutable
 * byte reads finish. Bodies contain bytes, avoiding Node's multi-recipient
 * NativeBlob serialization failure. Only recipients of the actual reservation
 * accept a later body; a late subscriber never receives the user's message. */
export async function publishBroadcastBody(messaging,key,id,message){
 const native=new NativeBroadcastChannel(key);native.unref();
 try{const envelope=await messaging.broadcastBody(message);native.postMessage({kind:'body',id,envelope})}
 catch(error){native.postMessage({kind:'failure',id})}
 finally{native.close()}
}

/** Host relay owns the actual immutable Blob clone after a Worker exits.
 * Ready follows reservation publication over the same actual parent port.
 * Exit flushes staged jobs even if termination interrupts that ready signal. */
export function createBroadcastRelay(messaging,config){
 const jobs=new Map();let exited=false;
 const flush=job=>{if(job.flushing)return;job.flushing=true;jobs.delete(job.id);void publishBroadcastBody(messaging,broadcastKey(config,job.name),job.id,job.message)};
 return{
  accept({id,name,message}){const job={id,name,message};jobs.set(id,job);if(exited)flush(job)},
  ready(id){const job=jobs.get(id);if(job)flush(job)},
  cancel(id){jobs.delete(id)},
  exit(){exited=true;for(const job of jobs.values())flush(job)},
  get size(){return jobs.size},
 };
}

export function createBroadcastRealm(realm,{messaging,config,active:live=()=>true,dispatch,reportError=()=>{},relay}){
 if(!messaging||!config?.namespace||!config.originKey)throw new TypeError('BroadcastChannel needs a messaging realm and storage key');
 const owned=new Set();let disposed=false;
 const usable=()=>!disposed&&live();
 const brand=receiver=>{const state=CHANNELS.get(receiver);if(!state)throw new realm.TypeError('Illegal invocation');return state};
 const emit=dispatch??((target,type,data,ports,origin)=>target.dispatchEvent(new realm.MessageEvent(type,{data,ports,origin})));
 class BroadcastChannel extends realm.EventTarget{
  constructor(name){
   super();if(!arguments.length)throw new realm.TypeError('BroadcastChannel requires a name');name=string(name,realm);
   if(!usable())throw new realm.DOMException('The realm is disposed','InvalidStateError');
   const key=broadcastKey(config,name);
   const native=new NativeBroadcastChannel(key),state={name,key,native,closed:false,handlers:new Map(),messaging,config,usable,owner:owned,slots:[],waiting:new Map(),relay};
   CHANNELS.set(this,state);owned.add(state);
   const drain=()=>{
    while(state.slots[0]?.ready){
     const slot=state.slots.shift();state.waiting.delete(slot.id);
     if(slot.failed){emit(this,'messageerror',null,realm.Object.freeze(new realm.Array()),config.origin);continue}
     messaging.deliver(this,slot.envelope,received=>emit(this,'message',received.data,received.ports,slot.envelope.origin),()=>usable()&&!state.closed);
    }
   };
   native.onmessage=event=>{
    if(!usable()||state.closed)return;
    try{
     const frame=event.data;
     if(frame.kind==='message'){state.slots.push({id:frame.id,ready:true,envelope:frame.envelope});drain()}
     else if(frame.kind==='reserve'){const slot={id:frame.id,ready:false};state.slots.push(slot);state.waiting.set(frame.id,slot)}
     else if(frame.kind==='body'||frame.kind==='failure'){const slot=state.waiting.get(frame.id);if(!slot)return;slot.ready=true;slot.failed=frame.kind==='failure';slot.envelope=frame.envelope;drain()}
    }catch(error){try{emit(this,'messageerror',null,realm.Object.freeze(new realm.Array()),config.origin)}catch(caught){reportError(caught)}}
   };
   native.onmessageerror=()=>{if(usable()&&!state.closed)emit(this,'messageerror',null,realm.Object.freeze(new realm.Array()),config.origin)};
   native.unref();
  }
  get name(){return brand(this).name}
  postMessage(data){
   const state=brand(this);if(!arguments.length)throw new realm.TypeError('postMessage requires data');
   if(state.closed||!state.usable())throw new realm.DOMException('BroadcastChannel is closed','InvalidStateError');
   const prepared=state.messaging.prepareBroadcast(data),id=randomUUID();prepared.message.origin=state.config.origin;
   if(state.closed)throw new realm.DOMException('BroadcastChannel was closed during serialization','InvalidStateError');
   let staged=false,reserved=false;
   try{
    if(!prepared.pending)state.native.postMessage({kind:'message',id,envelope:prepared.message});
    else{
     // This real parent-port clone precedes the reservation, so forced Worker
     // termination cannot destroy the only immutable copy of posted data.
     if(state.relay){state.relay({kind:'broadcastRelay',id,name:state.name,message:prepared.message});staged=true}
     state.native.postMessage({kind:'reserve',id});reserved=true;
     if(state.relay)state.relay({kind:'broadcastReady',id});else void publishBroadcastBody(state.messaging,state.key,id,prepared.message);
    }
   }
   catch(error){if(staged&&!reserved){try{state.relay({kind:'broadcastCancel',id})}catch{}}if(error?.name==='DataCloneError')throw new realm.DOMException(error.message,'DataCloneError');throw error}
  }
  close(){const state=brand(this);if(state.closed)return;state.closed=true;state.slots=[];state.waiting.clear();state.native.close();state.owner.delete(state)}
  get [Symbol.toStringTag](){return 'BroadcastChannel'}
 }
 for(const type of ['message','messageerror'])Object.defineProperty(BroadcastChannel.prototype,`on${type}`,{
  configurable:true,enumerable:true,
  get(){return brand(this).handlers.get(type)??null},
  set(value){const state=brand(this),previous=state.handlers.get(type);if(previous)this.removeEventListener(type,previous);state.handlers.delete(type);if(typeof value==='function'){state.handlers.set(type,value);this.addEventListener(type,value)}}
 });
 for(const key of ['name','postMessage','close']){const descriptor=Object.getOwnPropertyDescriptor(BroadcastChannel.prototype,key);Object.defineProperty(BroadcastChannel.prototype,key,{...descriptor,enumerable:true})}
 Object.defineProperty(BroadcastChannel.prototype,Symbol.toStringTag,{value:'BroadcastChannel',configurable:true,enumerable:false,writable:false});
 function dispose(){if(disposed)return;disposed=true;for(const state of owned){state.closed=true;state.slots=[];state.waiting.clear();state.native.close()}owned.clear()}
 return{BroadcastChannel,dispose,get size(){return owned.size},get pending(){let count=0;for(const state of owned)count+=state.slots.length;return count}};
}

