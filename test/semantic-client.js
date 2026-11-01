import {createRequire} from 'node:module';
import {once} from 'node:events';
const require=createRequire(import.meta.url),{WebSocket}=require('ws');
export function connect(endpoint,{recordWire=()=>{},stamp=()=>Date.now()}={}){const events=[];return new Promise((resolve,reject)=>{
 const socket=new WebSocket(endpoint,{handshakeTimeout:2500}),pending=new Map();let sequence=0;
 const fail=error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error)}pending.clear()};
 socket.once('error',reject);socket.once('open',()=>resolve({socket,events,send(method,params,sid){return new Promise((resolve,reject)=>{const id=++sequence,message={id,method,...(params===undefined?{}:{params}),...(sid?{sessionId:sid}:{})};const timer=setTimeout(()=>{pending.delete(id);reject(Error('Actual 2500ms RPC timeout: '+method))},2500);pending.set(id,{resolve,reject,timer});recordWire({direction:'send',atMS:stamp(),message});socket.send(JSON.stringify(message),failure=>{if(failure){clearTimeout(timer);pending.delete(id);reject(failure)}})})},async close(){fail(Error('Owned CDP client closing'));if(socket.readyState===WebSocket.CLOSED)return;const closed=once(socket,'close'),timer=setTimeout(()=>socket.terminate(),1000);timer.unref();socket.close();try{await closed}finally{clearTimeout(timer)}}}));
 socket.on('error',failure=>{recordWire({direction:'transport-error',atMS:stamp(),name:failure.name,message:failure.message,code:failure.code});fail(failure);socket.terminate()});
 socket.on('close',(code,reason)=>{recordWire({direction:'close',atMS:stamp(),code,reason:reason.toString()});fail(Error('Actual CDP connection closed'))});
 socket.on('message',data=>{let message;try{message=JSON.parse(data.toString())}catch(error){recordWire({direction:'malformed',atMS:stamp(),base64:Buffer.from(data).toString('base64')});fail(error);socket.terminate();return}recordWire({direction:'receive',atMS:stamp(),message,base64:Buffer.from(data).toString('base64')});if(!message.id){events.push(message);return;}const entry=pending.get(message.id);if(entry){pending.delete(message.id);clearTimeout(entry.timer);entry.resolve(message)}});
 });}
