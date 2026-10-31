import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';
async function fixture(t){
 const service=await serve({host:'127.0.0.1',port:0,loadResources:['iframe']});t.after(()=>service.close());
 const client=await connect(`ws://127.0.0.1:${service.port}/`);t.after(()=>client.close());
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId);
 await send('Runtime.enable');await send('Page.navigate',{url:'data:text/html,'+encodeURIComponent('<!doctype html><html><head><title>Owned</title></head><body><form id="one" name="shared"></form><form id="two" name="shared"></form><iframe id="f" srcdoc="<p id=child>child</p>"></iframe></body></html>')});
 const evaluate=(expression,extra={})=>send('Runtime.evaluate',{expression,returnByValue:true,...extra});
 await evaluate('globalThis.savedAll=document.all;true');return{service,client,send,evaluate,targetId};
}
const metadata={type:'function',className:'HTMLAllCollection',description:'function () { [native code] }'};
test('genuine HTMLDDA handles preserve receiver/argument identity and actual prototype metadata',async t=>{
 const{send,evaluate}=await fixture(t);const handle=(await evaluate('savedAll',{returnByValue:false,objectGroup:'owned-dda'})).result;
 const{objectId,...description}=handle;assert.deepEqual(description,metadata);assert.equal(typeof objectId,'string');
 const called=await send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(value){return {same:this===savedAll&&value===savedAll,type:typeof value,bool:!!value,strictUndefined:value===undefined,looseNull:value==null,first:this[0]===document.documentElement,call:this("one")===document.getElementById("one")}}',arguments:[{objectId}],returnByValue:true});
 assert.deepEqual(called.result.value,{same:true,type:'undefined',bool:false,strictUndefined:false,looseNull:true,first:true,call:true});
 const properties=await send('Runtime.getProperties',{objectId,ownProperties:true});assert.deepEqual(properties.result,[]);const proto=properties.internalProperties.find(p=>p.name==='[[Prototype]]').value;assert.equal(proto.className,'HTMLAllCollection');
 const identity=await send('Runtime.callFunctionOn',{objectId:proto.objectId,functionDeclaration:'function(){return this===Object.getPrototypeOf(savedAll)&&this.constructor===HTMLAllCollection}',returnByValue:true});assert.equal(identity.result.value,true);
 const held=(await evaluate('({held:savedAll})',{returnByValue:false})).result;
 const own=await send('Runtime.getProperties',{objectId:held.objectId,ownProperties:true});const property=own.result.find(p=>p.name==='held');const{objectId:heldID,...heldDescription}=property.value;assert.deepEqual(heldDescription,metadata);assert.equal(typeof heldID,'string');
 await send('Runtime.releaseObjectGroup',{objectGroup:'owned-dda'});await assert.rejects(send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return 1}'}),{code:-32000});
});
test('actual V8 HTMLDDA serialization omits interceptor keys while retaining explicitly authored own data',async t=>{
 const{evaluate}=await fixture(t);assert.deepEqual((await evaluate('savedAll')).result,{type:'function',value:{}});
 assert.deepEqual((await evaluate('({all:savedAll,undef:undefined,array:[savedAll,undefined]})')).result,{type:'object',value:{all:{},array:[{},null]}});
 const enumeration=await evaluate('({keys:Object.keys(savedAll),names:Object.getOwnPropertyNames(savedAll),present:Object.hasOwn(savedAll,"0"),writable:Object.getOwnPropertyDescriptor(savedAll,"0").writable,first:savedAll[0]===document.documentElement})');
 assert.deepEqual(enumeration.result.value,{keys:[],names:[],present:true,writable:false,first:true});
 await evaluate('Object.defineProperty(savedAll,"owned",{value:23,enumerable:true,configurable:true});true');
 assert.deepEqual((await evaluate('savedAll')).result,{type:'function',value:{owned:23}});
 assert.equal((await evaluate('savedAll("one")===document.getElementById("one")')).result.value,true);
});
test('HTMLDDA cloning/messages reject genuine identity without detaching another transferable resource',async t=>{
 const{evaluate}=await fixture(t);const result=await evaluate(`(async()=>{
  const rejections=[];for(const value of [savedAll,{all:savedAll},[savedAll],new Map([['all',savedAll]]),new Set([savedAll])]){try{structuredClone(value);rejections.push('cloned')}catch(e){rejections.push(e.name)}}
  let prototypeError;try{structuredClone(HTMLAllCollection.prototype)}catch(e){prototypeError=e.name}
  const buffer=new ArrayBuffer(8);let transferError;try{structuredClone({all:savedAll,buffer},{transfer:[buffer]})}catch(e){transferError=e.name}
  const channel=new MessageChannel();let portError;try{channel.port1.postMessage(savedAll)}catch(e){portError=e.name}
  const delivered=new Promise(resolve=>channel.port2.onmessage=e=>resolve({value:e.data,realm:e.data instanceof Object}));channel.port1.postMessage({marker:17});const actual=await delivered;channel.port1.close();channel.port2.close();
  let windowError;try{window.postMessage(savedAll,'*')}catch(e){windowError=e.name}
  const broadcast=new BroadcastChannel('owned-HTMLDDA');let broadcastError;try{broadcast.postMessage(savedAll)}catch(e){broadcastError=e.name}finally{broadcast.close()}
  return{rejections,prototypeError,transferError,bufferLength:buffer.byteLength,portError,windowError,broadcastError,actual};
 })()`,{awaitPromise:true});
 assert.deepEqual(result.result.value,{rejections:Array(5).fill('DataCloneError'),prototypeError:'TypeError',transferError:'DataCloneError',bufferLength:8,portError:'DataCloneError',windowError:'DataCloneError',broadcastError:'DataCloneError',actual:{value:{marker:17},realm:true}});
});
test('borrowed collection methods accept genuine foreign-realm values and retain native numeric item conversion',async t=>{
 const{evaluate}=await fixture(t);const result=await evaluate(`(()=>{const c=document.getElementById('f').contentWindow;return{
  main:c.HTMLAllCollection.prototype.item.call(savedAll,0)===document.documentElement,
  child:HTMLAllCollection.prototype.item.call(c.document.all,0)===c.document.documentElement,
  named:c.HTMLAllCollection.prototype.namedItem.call(savedAll,'one')===document.getElementById('one'),
  length:Object.getOwnPropertyDescriptor(c.HTMLAllCollection.prototype,'length').get.call(savedAll),
  nonNumeric:savedAll.item('one')===document.documentElement,
  firstNamed:savedAll.namedItem('shared')===document.getElementById('one')};})()`);
 assert.deepEqual(result.result.value,{main:true,child:true,named:true,length:7,nonNumeric:true,firstNamed:true});
});
test('a thrown genuine HTMLDDA remains an actual retained exception object',async t=>{
 const{send,evaluate}=await fixture(t);const thrown=await evaluate('(()=>{throw savedAll})()',{returnByValue:false});
 for(const value of [thrown.result,thrown.exceptionDetails.exception]){const{objectId,...description}=value;assert.deepEqual(description,metadata);const retained=await send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return this===savedAll&&this!==undefined&&typeof this==="undefined"}',returnByValue:true});assert.equal(retained.result.value,true)}
});
