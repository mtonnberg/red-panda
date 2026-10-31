import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{serve}from'../src/cdp.js';import{connect}from'./cdp-client.js';import{createCanonicalStyleResolver}from'../src/styles.js';
const native=JSON.parse(await readFile(new URL('../docs/reference/lp-private-author-style/native-detached-documents.json',import.meta.url),'utf8'));
assert.equal(native.groups.length,4);for(const group of native.groups)assert.equal(group.completed,true);
function assertUnknownOwnersRejected(){let reads=0;const fake={get _defaultView(){reads++;return null}},proxy=new Proxy(fake,{get(){reads++;throw Error('authored read')},getOwnPropertyDescriptor(){reads++;throw Error('authored descriptor')}});for(const value of[fake,proxy,Object.create(fake)])assert.throws(()=>createCanonicalStyleResolver(value),/actual canonical render-frame style owner/);assert.equal(reads,0)}
for(const group of native.groups)test('LP authentic inactive document and adoption policy: '+group.name,{timeout:15000},async t=>{
 if(group.name==='fragment')assertUnknownOwnersRejected();
 let service,client;t.after(async()=>{await client?.close();await service?.close()});service=await serve({port:0});client=await connect('ws://127.0.0.1:'+service.port+'/');const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true}),results=new Map();
 for(const row of group.steps){let params=row.params===undefined?undefined:structuredClone(row.params);if(row.method==='DOM.describeNode')params.objectId=results.get(row.label.replace('-id','-object')).result.objectId;if(row.method==='LP.getMarkdown')params.nodeId=results.get(row.label.replace('-markdown','-id')).node.nodeId;const value=await client.send(row.method,params,sessionId);results.set(row.label,value);if(row.method==='Runtime.evaluate')assert.equal(value.exceptionDetails,undefined,row.label);if(['actual-setup','actual-adoption'].includes(row.label))assert.deepEqual(value.result.value,row.result.result.value,row.label);if(row.method==='DOM.describeNode')assert.equal(value.node.nodeType,row.result.node.nodeType,row.label+' actual nodeType');if(row.method==='LP.getMarkdown')assert.deepEqual(value,row.result,row.label)}
 // The historical policy row labelled "text" is genuinely an Element. Keep
 // its exact recorded input/output and assert its actual Node type explicitly.
 if(group.name==='policy')assert.equal(results.get('text-id').node.nodeType,1);
});

const poisoned=JSON.parse(await readFile(new URL('../docs/reference/lp-private-author-style/native-inactive-adoption-poison.json',import.meta.url),'utf8'));
assert.equal(poisoned.groups.length,2);for(const group of poisoned.groups)assert.equal(group.completed,true);
test('LP preserves real declarations born inactive through first-read poison adoption and descendant mutation',{timeout:15000},async t=>{
 for(const group of poisoned.groups){
  let service,client;const cleanup=async()=>{const actualClient=client,actualService=service;client=undefined;service=undefined;await actualClient?.close();await actualService?.close()};t.after(cleanup);service=await serve({port:0});client=await connect('ws://127.0.0.1:'+service.port+'/');const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});let objectId,nodeId;
  try{for(const row of group.steps){let params=row.params===undefined?undefined:structuredClone(row.params);if(row.method==='DOM.describeNode')params.objectId=objectId;if(row.method==='LP.getMarkdown')params.nodeId=nodeId;const value=await client.send(row.method,params,sessionId);if(row.method==='Runtime.evaluate')assert.equal(value.exceptionDetails,undefined,group.name+': '+row.label);if(row.label==='actual-scope-object')objectId=value.result.objectId;if(row.label==='actual-scope-id'){nodeId=value.node.nodeId;assert.equal(value.node.nodeType,1)}if(row.method==='LP.getMarkdown')assert.deepEqual(value,row.result,group.name+': '+row.label);
   if(row.label==='poison-actual-fronts'){const facts=value.result.value;assert.deepEqual(facts.installed,row.result.result.value.installed);assert.equal(facts.legacyMapPoisoned,true,'candidate-only genuine legacy Map shadow');assert.equal(facts.legacyMapStatus,'exercised');assert.equal(row.result.result.value.legacyMapStatus,'unexercised','Native legacy Map route is not exercised');assert.deepEqual(facts.counts,{nodeReads:0,declarationReads:0,legacyMapReads:0})}
   if(row.label==='restore-actual-fronts'){assert.deepEqual(value.result.value.counts,{nodeReads:0,declarationReads:0,legacyMapReads:0});assert.deepEqual(value.result.value.restores.map(value=>value[0]),['_values',...row.result.result.value.restores.map(value=>value[0])]);assert.ok(value.result.value.restores.every(value=>value[1]===true))}
   if(['actual-construction','actual-adoption','actual-state-after-restore','actual-descendant-style-mutation'].includes(row.label))assert.deepEqual(value.result.value,row.result.result.value,group.name+': '+row.label);
  }}finally{await cleanup()}
 }
});
