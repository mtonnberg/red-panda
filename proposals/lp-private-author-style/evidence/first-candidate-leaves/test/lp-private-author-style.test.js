import{test}from'node:test';
import assert from'node:assert/strict';
import http from'node:http';
import{readFile}from'node:fs/promises';
import{serve}from'../src/cdp.js';
import{connect}from'./cdp-client.js';
const observed=JSON.parse(await readFile(new URL('../docs/reference/lp-private-author-style/native-fresh.json',import.meta.url),'utf8'));
assert.equal(observed.binarySHA256,'9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f');
for(const group of observed.groups)assert.equal(group.completed,true,'actual Native setup '+group.name);

async function fixture(t){
 let service,client,origin;
 const requests=[],server=http.createServer((request,response)=>{requests.push(request.url);const name=new URL(request.url,'http://local').pathname.slice(1);if(!Object.hasOwn(observed.documents,name)){response.writeHead(404);response.end();return}response.setHeader('content-type','text/html; charset=utf-8');response.end('<!doctype html>'+observed.documents[name])});
 t.after(async()=>{await client?.close();await service?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 service=await serve({port:0,loadResources:['iframe']});client=await connect('ws://127.0.0.1:'+service.port+'/');
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 return{origin,requests,send:(method,params)=>client.send(method,params,sessionId)};
}

// LP reads use the measured main-frame renderer policy. These assertions do
// not relabel Native's separate public computed-style observations as matches:
// the existing public style suite still verifies genuine adopted/shadow CSS.
async function replay(t,name){
 const f=await fixture(t),group=observed.groups.find(value=>value.name===name);assert.ok(group);let objectId,nodeId;const results=new Map();
 for(const row of group.steps){
  let params=row.params===undefined?undefined:JSON.parse(JSON.stringify(row.params).replaceAll(observed.origin,f.origin));
  if(row.label==='actual-child-id')params.objectId=objectId;
  if(row.label==='actual-child-markdown')params.nodeId=nodeId;
  const result=await f.send(row.method,params);results.set(row.label,result);
  if(row.method==='Runtime.evaluate')assert.equal(result.exceptionDetails,undefined,name+': '+row.label);
  if(row.label==='actual-child-node'){objectId=result.result.objectId;assert.equal(typeof objectId,'string')}
  if(row.label==='actual-child-id'){nodeId=result.node.nodeId;assert.ok(Number.isInteger(nodeId)&&nodeId>0)}
  if(row.method==='LP.getMarkdown')assert.deepEqual(result,row.result,name+': '+row.label);
  if(row.label==='actual-css-values'&&['basic','structural','media'].includes(name))assert.deepEqual(result.result.value,row.result.result.value,name+': actual public CSS');
 }
 assert.ok(f.requests.includes('/'+name));return{...f,results};
}

for(const name of['basic','structural','media'])test('LP canonical private author cascade matches fresh Native '+name+' and its real CSS values',{timeout:15000},async t=>{await replay(t,name)});

test('LP markdown includes visibility-hidden text while its actual CSS value stays hidden',{timeout:15000},async t=>{
 const{results}=await replay(t,'basic'),actual=results.get('actual-css-values').result.value;
 assert.equal(actual[1].visibility,'hidden');assert.match(results.get('fresh-first-markdown').markdown,/Two/);assert.doesNotMatch(results.get('fresh-first-markdown').markdown,/One/);
});

test('LP canonical renderer observes the Native adopted-sheet profile without replacing actual CSSOM records',{timeout:15000},async t=>{
 const{send,results}=await replay(t,'adopted');assert.match(results.get('fresh-adopted-markdown').markdown,/One/);
 const value=await send('Runtime.evaluate',{expression:"({count:document.adoptedStyleSheets.length,same:document.adoptedStyleSheets[0]===realSheet,value:realSheet.cssRules[0].style.display})",returnByValue:true});
 assert.equal(value.exceptionDetails,undefined);assert.deepEqual(value.result.value,{count:1,same:true,value:'block'});
});

test('LP renders actual shadow and assigned nodes using the Native frame sheet profile',{timeout:15000},async t=>{
 const{send,results}=await replay(t,'shadow');assert.match(results.get('fresh-shadow-markdown').markdown,/Shadow heading/);assert.match(results.get('fresh-shadow-markdown').markdown,/Assigned light/);assert.match(results.get('fresh-shadow-markdown').markdown,/Inside hidden/);
 const value=await send('Runtime.evaluate',{expression:"({connected:realShadow.host.isConnected,assigned:realShadow.querySelector('slot').assignedNodes()[0]===document.querySelector('[slot=named]'),rules:realShadow.querySelector('style').sheet.cssRules.length,adopted:realShadow.adoptedStyleSheets.length})",returnByValue:true});
 assert.equal(value.exceptionDetails,undefined);assert.deepEqual(value.result.value,{connected:true,assigned:true,rules:1,adopted:1});
});

test('LP scoped foreign-frame node keeps its real source while using main render-frame style authority',{timeout:15000},async t=>{
 const{requests,results,send}=await replay(t,'frame');assert.ok(requests.includes('/child'));assert.match(results.get('actual-child-markdown').markdown,/Child hidden/);
 const value=await send('Runtime.evaluate',{expression:"(()=>{const frame=document.getElementById('frame'),child=frame.contentDocument.getElementById('child');return{same:child.ownerDocument===frame.contentDocument,foreign:child.ownerDocument!==document,connected:child.isConnected,text:child.textContent}})()",returnByValue:true});
 assert.equal(value.exceptionDetails,undefined);assert.deepEqual(value.result.value,{same:true,foreign:true,connected:true,text:'Child hidden'});
});
