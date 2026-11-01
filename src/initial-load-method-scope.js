// Host-only temporary method custody. Same real receiver/base/argument graph;
// no frontend reads, prototype edits, source heuristics or parallel factory graph.
import{beginDispatchRecoveryParticipant,completeDispatchRecoveryParticipant}from'./dom-dispatch-recovery.js';
import{types}from'node:util';
const own=Object.getOwnPropertyDescriptor,define=Object.defineProperty,remove=Reflect.deleteProperty,proto=Object.getPrototypeOf,apply=Reflect.apply,schedule=process.nextTick;
const stacks=new WeakMap(),boundaries=new WeakSet();
const same=(a,b)=>a===undefined||b===undefined?a===b:['value','get','set','writable','enumerable','configurable'].every(k=>a[k]===b[k]);
function boundary(message){const error=new Error('Initial private producer boundary: '+message);boundaries.add(error);return error}
export function privateLoadBoundary(message){return boundary(message)}
export function isPrivateLoadBoundary(error){return (typeof error==='object'&&error!==null||typeof error==='function')&&boundaries.has(error)}
function ordinary(value){if(!value||typeof value!=='object'&&typeof value!=='function'||types.isProxy(value))throw boundary('actual ordinary private object required');return value}
export function privateLoadObject(value){return ordinary(value)}
export function privateLoadOptionalData(value,key){ordinary(value);const d=own(value,key);if(!d)return undefined;if(!Object.hasOwn(d,'value'))throw boundary('actual private optional data slot required');return d.value}
export function privateLoadData(value,key){ordinary(value);const d=own(value,key);if(!d||!Object.hasOwn(d,'value'))throw boundary('actual private data slot required: '+String(key));return d.value}
export function privateLoadMethod(value,key){for(let cursor=ordinary(value);cursor;cursor=proto(cursor)){ordinary(cursor);const d=own(cursor,key);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw boundary('original private data method required');return d.value}}throw boundary('original private method absent')}
export function restorePrivateLoadMethod(token){
 if(!token?.active)return;const index=token.stack.indexOf(token);if(index<0)return;
 for(let i=token.stack.length-1;i>=index;i--){const current=token.stack[i];if(!current.active)continue;
  if(!same(own(current.target,current.key),current.installed))current.owner.diagnostics.push('private method descriptor changed: '+current.key);
  if(current.prior===undefined)remove(current.target,current.key);else define(current.target,current.key,current.prior);
  current.active=false;current.stack.pop();current.owner.tokens.delete(current);
  current.owner.observations.push({kind:'methodRestored',key:current.key,exact:same(own(current.target,current.key),current.prior)});
 }
}
export function patchPrivateLoadMethod(owner,target,key,behavior){
 ordinary(target);let methods=stacks.get(target);if(!methods){methods=new Map();stacks.set(target,methods)}let stack=methods.get(key);if(!stack){stack=[];methods.set(key,stack)}
 const prior=own(target,key);if(prior&&!prior.configurable)throw boundary('temporary private method not configurable');
 const base=stack.length?stack[0].base:privateLoadMethod(target,key),token={owner,target,key,prior,base,stack,active:true,committed:false};
 const recover=()=>{if(!token.committed)restorePrivateLoadMethod(token)};apply(schedule,process,[recover]);const participant=beginDispatchRecoveryParticipant(recover);
 const value=function(...args){if(this!==target||stack.at(-1)!==token)return apply(base,this,args);return behavior(base,this,args,token)};
 token.installed={value,writable:true,enumerable:prior?.enumerable??false,configurable:true};stack.push(token);owner.tokens.add(token);
 try{define(target,key,token.installed);token.committed=true;completeDispatchRecoveryParticipant(participant);return token}catch(error){restorePrivateLoadMethod(token);completeDispatchRecoveryParticipant(participant);throw error}
}
export function privateLoadInvocation(owner,operation,restoreTransient=()=>{}){
 const state={complete:false,recovered:false,tokens:new Set(owner.tokens)},recover=()=>{if(!state.complete&&!state.recovered){state.recovered=true;for(const token of [...owner.tokens].reverse())if(!state.tokens.has(token))restorePrivateLoadMethod(token);restoreTransient();owner.observations.push({kind:'abandonedPrivateInvocation'})}};
 apply(schedule,process,[recover]);const participant=beginDispatchRecoveryParticipant(recover);
 try{return operation()}finally{state.complete=true;completeDispatchRecoveryParticipant(participant)}
}
