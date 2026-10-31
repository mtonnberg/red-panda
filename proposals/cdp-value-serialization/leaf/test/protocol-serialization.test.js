import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {serve} from '../src/cdp.js';
import {Browser} from '../src/browser.js';
import {ProtocolSerializer} from '../src/protocol-serialization.js';
import {connect} from './cdp-client.js';
async function fixture(t){
 const service=await serve({port:0,loadResources:['iframe']}),client=await connect(`ws://127.0.0.1:${service.port}/`);
 t.after(async()=>{await client.close();await service.close()});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId);await send('Runtime.enable');const evaluate=(expression,options={})=>send('Runtime.evaluate',{expression,...options});
 return{send,evaluate,page:service.browser.pages.get(targetId)};
}
test('protocol by-value serialization preserves own properties and never invokes toJSON methods',async t=>{
 const{evaluate}=await fixture(t);const actual=await evaluate('globalThis.hits=0;({a:1,toJSON(){hits++;return 9},nested:Object.assign(Object.create({toJSON(){hits++;return 8}}),{b:2}),array:Object.assign([1,function(){}],{toJSON(){hits++;return 7}})})',{returnByValue:true});
 assert.deepEqual(actual.result,{type:'object',value:{a:1,toJSON:{},nested:{b:2},array:[1,{}]}});assert.equal((await evaluate('hits',{returnByValue:true})).result.value,0);
});
test('actual V8 proxy and getter serialization side effects match the Native own-property contract',async t=>{
 const{evaluate}=await fixture(t);let actual=await evaluate('globalThis.hits=[];new Proxy({a:1},{ownKeys(t){hits.push("keys");return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){hits.push("descriptor");return Reflect.getOwnPropertyDescriptor(t,k)},get(t,k,r){hits.push("get");return Reflect.get(t,k,r)}})',{returnByValue:true});
 assert.deepEqual(actual.result.value,{});assert.deepEqual((await evaluate('hits',{returnByValue:true})).result.value,['keys','descriptor']);
 actual=await evaluate('({get visible(){hits.push("visible");return 7}})',{returnByValue:true});assert.deepEqual(actual.result.value,{visible:7});
 await assert.rejects(evaluate('({get visible(){throw Error("authored")}})',{returnByValue:true}),{code:-32603,message:'Internal error'});assert.equal((await evaluate('42',{returnByValue:true})).result.value,42);
});
test('serialization failures remain protocol errors across evaluate, callFunctionOn, runScript and awaitPromise',async t=>{
 const{send,evaluate,page}=await fixture(t),expression='(()=>{const a={};a.self=a;return a})()';
 const expected={code:-32000,message:'Object reference chain is too long'};
 await assert.rejects(evaluate(expression,{returnByValue:true}),expected);
 await assert.rejects(send('Runtime.callFunctionOn',{executionContextId:page.executionContextId,functionDeclaration:`function(){return ${expression}}`,returnByValue:true}),expected);
 const compiled=await send('Runtime.compileScript',{expression,sourceURL:'cycle.js',persistScript:true});await assert.rejects(send('Runtime.runScript',{scriptId:compiled.scriptId,returnByValue:true}),expected);
 const promise=await evaluate(`Promise.resolve(${expression})`);await assert.rejects(send('Runtime.awaitPromise',{promiseObjectId:promise.result.objectId,returnByValue:true}),expected);
 for(const bad of ['({nested:1n})','({nested:Symbol("s")})'])await assert.rejects(evaluate(bad,{returnByValue:true}),{code:-32000,message:"Object couldn't be returned by value"});
});
test('genuine foreign values serialize in selected utility contexts after authored intrinsic replacement',async t=>{
 const{send,evaluate,page}=await fixture(t),{executionContextId:id}=await send('Page.createIsolatedWorld',{frameId:page.frameId,worldName:'protocol-values'});
 await evaluate('document.addEventListener("protocol-foreign",event=>{globalThis.foreign=event.detail})',{contextId:id});
 await evaluate('globalThis.hits=0;globalThis.foreign={marker:17,toJSON(){hits++;return 9}};document.dispatchEvent(new CustomEvent("protocol-foreign",{detail:foreign}))');
 assert.deepEqual((await evaluate('foreign',{contextId:id,returnByValue:true})).result.value,{marker:17,toJSON:{}});
 const actual=await evaluate('JSON.parse=JSON.stringify=()=>{throw Error("JSON")};Function.prototype.apply=Reflect.apply=()=>{throw Error("apply")};foreign',{contextId:id,returnByValue:true});assert.deepEqual(actual.result.value,{marker:17,toJSON:{}});assert.equal((await evaluate('hits',{returnByValue:true})).result.value,0);
 const called=await send('Runtime.callFunctionOn',{executionContextId:id,functionDeclaration:'function(){return {marker:23,toJSON(){throw Error("toJSON")}}}',returnByValue:true});assert.deepEqual(called.result.value,{marker:23,toJSON:{}});
});
test('protocol serializer releases inspector contexts on actual document abort and rejects stale authority',async t=>{
 const browser=new Browser(),page=browser.createPage(),serializer=new ProtocolSerializer();t.after(()=>{serializer.close();browser.close()});
 for(let i=0;i<5;i++){await page.navigate('data:text/html,<p>'+i);assert.deepEqual(serializer.serialize(page.evaluate('({marker:17})'),page).value,{marker:17});assert.equal(serializer.records.size,1)}
 page.close();assert.equal(serializer.records.size,0);assert.throws(()=>serializer.serialize({},page),{code:-32000});
});
test('reentrant owned serialization restores the original private invocation frame',t=>{
 const browser=new Browser(),page=browser.createPage(),serializer=new ProtocolSerializer();t.after(()=>{serializer.close();browser.close()});
 page.dom.window.reenter=()=>serializer.serialize({nested:17},page).value;
 const value=page.evaluate('({get value(){return reenter()},marker:23})');assert.deepEqual(serializer.serialize(value,page).value,{value:{nested:17},marker:23});assert.equal(page.callFunction('function(){return 42}',null,[]),42);
});
test('closing the actual page during a getter defers inspector disconnection until the active command unwinds',t=>{
 const browser=new Browser(),page=browser.createPage(),serializer=new ProtocolSerializer();t.after(()=>{serializer.close();browser.close()});
 page.dom.window.closeOwned=()=>page.close();const value=page.evaluate('({get value(){closeOwned();return 17}})');
 assert.throws(()=>serializer.serialize(value,page),{code:-32000});assert.equal(serializer.records.size,0);
});

test('infinite by-value getters respect VM deadlines and abandoned nested host frames recover in an owned child',()=>{
 const fixture=fileURLToPath(new URL('./fixtures/protocol-serialization-timeout.mjs',import.meta.url));
 const child=spawnSync('/bin/sh',['-c','ulimit -c 0; exec "$@"','red-panda-owned-timeout',process.execPath,'--experimental-vm-modules',fixture],{encoding:'utf8',timeout:6000,killSignal:'SIGKILL'});
 assert.equal(child.error,undefined,child.error?.message);assert.equal(child.signal,null,child.stderr);assert.equal(child.status,0,child.stderr);
 assert.match(child.stdout,/Serialization timeout recovery verified/);
});
