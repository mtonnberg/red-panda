// Parent-owned genuine streaming connections, selected by private Worker Host
// messages. Authored worker postMessage uses the distinct public envelope.
import{randomUUID}from'node:crypto';
import{openEventSourceTransport}from'./eventsource-transport.js';
import{eventSourcePolicy}from'./eventsource-policy.js';
const owners=new WeakMap(),record=value=>Object.assign(Object.create(null),value);
function ownerFor(page){let root=page;const seen=new Set();while(root.registry?.page&&root.registry.page!==root&&!seen.has(root)){seen.add(root);root=root.registry.page}let owner=owners.get(root);if(!owner){owner=new Set();owners.set(root,owner);const close=()=>{for(const transport of [...owner])transport.close()};root.once('close',close);if(!page.browser)root.documentAbort?.signal.addEventListener('abort',close,{once:true})}return owner}
export function createParentEventSources(page,{origin,send,active}){
 const owner=ownerFor(page),policy=eventSourcePolicy(page,{origin,referrer:page.url}),clients=new Map();let detached=false;
 return{
  handle(message){if(detached||!active())return;if(message.kind==='eventSourceOpen'){if(clients.has(message.id))return;const transport=openEventSourceTransport({url:message.url,withCredentials:message.credentials,policy,owner,emit(type,data){if(!detached&&active())send({kind:'eventSourceEvent',id:message.id,type,data})}});clients.set(message.id,transport)}else if(message.kind==='eventSourceClose'){clients.get(message.id)?.close();clients.delete(message.id)}},
  detach(){detached=true;clients.clear()},
 };
}
export function createWorkerEventSourceClient(port){const clients=new Map();return{
 create(url,credentials,emit){const id=randomUUID(),state=record({readyState:0,emit});clients.set(id,state);port.postMessage({kind:'eventSourceOpen',id,url,credentials});return record({get:key=>state[key],close(){if(state.readyState===2)return;state.readyState=2;clients.delete(id);port.postMessage({kind:'eventSourceClose',id})}})},
 handle(message){const state=clients.get(message.id);if(!state)return;if(message.type==='open')state.readyState=1;else if(message.type==='error')state.readyState=message.data.readyState;state.emit(message.type,message.data);if(state.readyState===2)clients.delete(message.id)},
 };
}
