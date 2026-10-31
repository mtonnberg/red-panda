// Private parent-owned physical sockets for real worker clients. A terminated
// Native worker parks its still-open transports until the owning Page ends.
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {workerWebSocketOwner} from './worker-websocket-owners.js';
import {normalizeWebSocketURL,validWebSocketProtocols,socketHeaders,openWebSocketTransport} from './websocket-transports.js';
export function createParentWorkerSockets(page,{origin,send,active}){
 const owner=workerWebSocketOwner(page),transports=new Map(),acknowledgements=new Map();let detached=false;
 return{
  create(url,protocols){
   url=normalizeWebSocketURL(url);if(!Array.isArray(protocols)||!validWebSocketProtocols(protocols))throw new TypeError('Invalid socket protocols');
   const id=randomUUID(),transport=openWebSocketTransport({quota:owner.quota,owner:owner.transports,url:url.href,protocols,origin,deferUpgrade:true,headers:socketHeaders(page,url),emit(type,data){
    if(detached||!active())return;
    let pending;if(type==='close')pending=new Promise(resolve=>acknowledgements.set(id,resolve));
    send({kind:'socketEvent',id,type,data:type==='message'?{bytes:new Uint8Array(data.bytes),binary:data.binary}:data});return pending;
   }});transports.set(id,transport);return{transportId:id};
  },
  handle(message){
   const transport=transports.get(message.socketId);if(!transport)return;
   if(message.kind==='socketCloseDispatched'){acknowledgements.get(message.socketId)?.();acknowledgements.delete(message.socketId);transports.delete(message.socketId);return}
   if(detached||!active())return;
   if(message.kind==='socketStart')transport.start();
   else if(message.kind==='socketSend'){const accepted=transport.send(message.data,message.binary,()=>send({kind:'socketSent',id:message.socketId,requestId:message.requestId,bufferedAmount:transport.get('bufferedAmount')}));if(!accepted)send({kind:'socketSent',id:message.socketId,requestId:message.requestId,bufferedAmount:transport.get('bufferedAmount')})}
   else if(message.kind==='socketClose')transport.close(message.code,message.reason,message.connecting);
  },
  detach(){if(detached)return;detached=true;for(const resolve of acknowledgements.values())resolve();acknowledgements.clear();
   // Actual open Node sockets remain in the real Page-owned transport set.
   // No empty reservation is retained after an actual remote close.
   for(const transport of transports.values())transport.start();transports.clear();
  },
 };
}
export function createWorkerSocketClient(port,policy){
 const sockets=new Map();let nextId=0;
 class RemoteSocket extends EventEmitter{
  constructor(url,protocols){super();const result=policy(url,protocols);this.id=result.transportId;this.readyState=0;this.bufferedAmount=0;this.protocol='';this.extensions='';this.callbacks=new Map();sockets.set(this.id,this);setImmediate(()=>{if(this.readyState===0)port.postMessage({kind:'socketStart',socketId:this.id})})}
  send(data,options,callback){const id=++nextId;this.callbacks.set(id,callback);port.postMessage({kind:'socketSend',socketId:this.id,requestId:id,data:typeof data==='string'?data:new Uint8Array(data),binary:!!options?.binary})}
  close(code=1000,reason=''){const connecting=this.readyState===0;if(this.readyState>=2)return;this.readyState=connecting?3:2;port.postMessage({kind:'socketClose',socketId:this.id,code:code??1000,reason:reason??'',connecting})}
  terminate(){this.close()}
 }
 return{
  create:(url,protocols)=>new RemoteSocket(url,protocols),
  handle(message){
   const socket=sockets.get(message.id);if(!socket)return;
   if(message.kind==='socketSent'){socket.bufferedAmount=message.bufferedAmount;const callback=socket.callbacks.get(message.requestId);socket.callbacks.delete(message.requestId);callback?.();return}
   const data=message.data??{};
   if(message.type==='open'){socket.readyState=1;socket.protocol=data.protocol;socket.extensions=data.extensions;socket.emit('open')}
   else if(message.type==='message')socket.emit('message',Buffer.from(data.bytes),data.binary);
   else if(message.type==='error'){socket.readyState=3;socket.emit('error')}
   else if(message.type==='close'){socket.readyState=3;try{socket.emit('close',data.code,Buffer.from(data.reason),data.wasClean)}finally{port.postMessage({kind:'socketCloseDispatched',socketId:socket.id});sockets.delete(socket.id)}}
  },
 };
}
