import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';

const commands=['CSS.enable','Inspector.enable','Inspector.disable','Security.enable','Security.disable'];
async function setup(t){
 const service=await serve({port:0}),client=await connect(`ws://127.0.0.1:${service.port}`);
 t.after(async()=>{await client.close();await service.close()});
 return client;
}

test('exact reference configuration acknowledgements work before, during and after actual target ownership',async t=>{
 const client=await setup(t);
 const check=async sessionId=>{
  for(const method of commands)for(const params of [{},null,{ignored:true}])assert.deepEqual(await client.send(method,params,sessionId),{});
  for(const method of ['CSS.disable','CSS.nested.enable','Inspector.nested.enable','Security.nested.disable'])await assert.rejects(client.send(method,{},sessionId),{code:-32601});
 };
 await check();
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 await check();await check(sessionId);
 await client.send('Target.closeTarget',{targetId});await check();
});

test('unknown and actually detached sessions fail before configuration and domain dispatch',async t=>{
 const client=await setup(t);
 const check=async sessionId=>{for(const method of ['CSS.enable','Inspector.disable','Browser.getVersion','Runtime.evaluate','NotARealDomain.command'])await assert.rejects(client.send(method,{},sessionId),{code:-32001,message:'Unknown sessionId'})};
 await check('not-an-attached-session');
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 await client.send('Target.detachFromTarget',{sessionId});await check(sessionId);
 const live=await client.send('Target.attachToTarget',{targetId,flatten:true});
 assert.equal((await client.send('Runtime.evaluate',{expression:'21*2',returnByValue:true},live.sessionId)).result.value,42);
});
