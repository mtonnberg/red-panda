import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';

async function setup(t){
 const service=await serve({port:0}),client=await connect(`ws://127.0.0.1:${service.port}`);
 t.after(async()=>{await client.close();await service.close()});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId);
 await send('Runtime.enable');
 const contextId=client.events.find(e=>e.sessionId===sessionId&&e.method==='Runtime.executionContextCreated').params.context.id;
 const{frameTree}=await send('Page.getFrameTree'),utility=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'actual-thrown-values'});
 return{send,contexts:[contextId,utility.executionContextId]};
}

test('returnByValue retains actual thrown objects and errors as handles in main and utility contexts',async t=>{
 const{send,contexts}=await setup(t);
 for(const contextId of contexts)for(const[source,type,subtype]of [['new TypeError("actual marker")','object','error'],['({marker:"actual marker"})','object',undefined],['"actual marker"','string',undefined]]){
  const result=await send('Runtime.evaluate',{contextId,expression:`throw (globalThis.actualThrown=${source})`,returnByValue:true});
  for(const remote of[result.result,result.exceptionDetails.exception]){
   assert.equal(remote.type,type);assert.equal(remote.subtype,subtype);
   if(type==='object'){
    assert.equal(typeof remote.objectId,'string');assert.equal(Object.hasOwn(remote,'value'),false);
    assert.equal((await send('Runtime.callFunctionOn',{objectId:remote.objectId,functionDeclaration:'function(){return this===globalThis.actualThrown}',returnByValue:true})).result.value,true);
   }else assert.equal(remote.value,'actual marker');
  }
 }
});

test('callFunctionOn preserves thrown identity while normal returnByValue results still serialize',async t=>{
 const{send,contexts}=await setup(t);
 for(const executionContextId of contexts){
  const failed=await send('Runtime.callFunctionOn',{executionContextId,functionDeclaration:'function(){throw(globalThis.actualThrown=new RangeError("actual marker"))}',returnByValue:true});
  assert.equal(failed.result.className,'RangeError');assert.equal(failed.result.subtype,'error');
  assert.equal((await send('Runtime.callFunctionOn',{objectId:failed.result.objectId,functionDeclaration:'function(){return this===globalThis.actualThrown}',returnByValue:true})).result.value,true);
  const normal=await send('Runtime.callFunctionOn',{executionContextId,functionDeclaration:'function(){return {marker:"actual marker"}}',returnByValue:true});
  assert.deepEqual(normal.result,{type:'object',value:{marker:'actual marker'}});
 }
});
