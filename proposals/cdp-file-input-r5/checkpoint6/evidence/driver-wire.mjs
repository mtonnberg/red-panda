import {createRequire} from 'node:module';
import {writeSync} from 'node:fs';
const {WebSocket}=createRequire(new URL('../base/package.json',import.meta.url))('ws');
export async function connect(endpoint,{fd,label,timeout=5000}={}){
 const socket=new WebSocket(endpoint,{handshakeTimeout:timeout}),pending=new Map(),events=[];let next=0;
 const log=value=>writeSync(fd,JSON.stringify({time:Date.now(),client:label,...value})+'\n');
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
 socket.on('message',raw=>{const message=JSON.parse(String(raw));log({direction:'received',message});if(!message.id){events.push(message);return}const value=pending.get(message.id);if(value){pending.delete(message.id);clearTimeout(value.timer);message.error?value.reject(Object.assign(new Error(message.error.message),message.error)):value.resolve(message.result)}});
 socket.on('close',()=>{for(const value of pending.values()){clearTimeout(value.timer);value.reject(Object.assign(new Error('Owned CDP transport closed'),{transportFailure:true}))}pending.clear()});
 return {events,send(method,params,sessionId){const id=++next,message={id,method,...(params===undefined?{}:{params}),...(sessionId?{sessionId}:{})};log({direction:'sent',message});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);const error=Object.assign(new Error('Owned CDP reply deadline: '+method),{transportFailure:true,method,requestId:id});log({direction:'timeout',method,requestId:id});reject(error)},timeout);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify(message))})},async close(){for(const value of pending.values()){clearTimeout(value.timer);value.reject(Object.assign(new Error('Owned client closed'),{transportFailure:true}))}pending.clear();if(socket.readyState===WebSocket.CLOSED)return;const done=new Promise(resolve=>socket.once('close',resolve)),force=setTimeout(()=>socket.terminate(),1000);force.unref();socket.close();try{await done}finally{clearTimeout(force)}}};
}
