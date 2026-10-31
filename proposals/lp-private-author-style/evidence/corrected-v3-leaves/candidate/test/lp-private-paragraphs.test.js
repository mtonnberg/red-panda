import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{serve}from'../src/cdp.js';import{connect}from'./cdp-client.js';
const native=JSON.parse(await readFile(new URL('../docs/reference/lp-private-author-style/native-paragraph-boundary.json',import.meta.url),'utf8'));
assert.equal(native.groups.length,4);for(const group of native.groups)assert.equal(group.completed,true);
for(const group of native.groups)test('LP actual paragraph boundaries across '+group.name,{timeout:15000},async t=>{
 let service,client;t.after(async()=>{await client?.close();await service?.close()});service=await serve({port:0});client=await connect('ws://127.0.0.1:'+service.port+'/');const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 for(const row of group.steps){const value=await client.send(row.method,row.params,sessionId);if(row.method==='Runtime.evaluate'){assert.equal(value.exceptionDetails,undefined,row.label);assert.deepEqual(value.result.value,row.result.result.value,row.label)}if(row.method==='LP.getMarkdown')assert.deepEqual(value,row.result,row.label)}
});
