// Same real control for the untouched Root646 and delivery-only correction.
// No process rejection observer, product debug hook or fake request completion.
import test from'node:test';import assert from'node:assert/strict';import http from'node:http';import{once}from'node:events';import{pathToFileURL}from'node:url';
const engine=process.env.RESOURCE_RETIREMENT_ENGINE_MODULE?pathToFileURL(process.env.RESOURCE_RETIREMENT_ENGINE_MODULE).href:new URL('../src/browser.js',import.meta.url).href;
const{Browser}=await import(engine);
async function bound(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Original1000ms '+label)),1000)})])}finally{clearTimeout(timer)}}
test('actual pending resource registration is cancelled at retirement while retained query function and new timer stay valid',{timeout:8000},async t=>{
 let held,arrival;const arrived=new Promise(resolve=>arrival=resolve),requests=[],responses=[],failures=[],events=[];
 const server=http.createServer((request,response)=>{
  if(request.url==='/held.js'){held=response;response.once('close',()=>events.push(['heldSocketClosed']));arrival();return}
  response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(request.url==='/child'?'<script defer src="/held.js"></script><p id=actual>real retained bytes</p>':'<!doctype html><p>actual parent</p>');
 });server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;console.log('actual-retirement-fixture '+JSON.stringify({pid:process.pid,port:server.address().port}));
 const browser=new Browser({timeout:1000,loadResources:['iframe']}),page=browser.createPage();
 t.after(async()=>{await browser.close();held?.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
 page.on('request',value=>requests.push(value));page.on('response',value=>responses.push(value));page.on('requestFailed',value=>failures.push(value));
 await page.navigate(origin+'/parent');const w=page.dom.window,f=w.document.createElement('iframe');f.src=origin+'/child';f.addEventListener('load',()=>events.push(['frameLoad']));w.document.body.append(f);await bound(arrived,'actual held request arrival');
 const child=f.contentWindow,d=child.document,owner=page.frames.findElement(f),context=owner.dom.getInternalVMContext(),beforeAborted=owner.documentAbort.signal.aborted;
 child.eval(`globalThis.retainedFunction=()=>document.getElementById('actual').textContent;globalThis.newTask=false;`);
 child.addEventListener('load',()=>events.push(['retainedWindowLoad']));d.addEventListener('DOMContentLoaded',()=>events.push(['retainedDCL']));d.addEventListener('load',()=>events.push(['retainedDocumentLoad']));
 const heldRequest=requests.find(value=>value.url===origin+'/held.js');assert.ok(heldRequest);f.remove();
 const immediate={sameWindow:owner.dom.window===child,sameDocument:child.document===d,defaultViewNull:d.defaultView===null,retired:owner.retired,signalAborted:owner.documentAbort.signal.aborted,contextSame:owner.dom.getInternalVMContext()===context,query:d.getElementById('actual').textContent,functionResult:child.retainedFunction()};
 console.log('actual-retirement-immediate '+JSON.stringify(immediate));
 assert.equal(beforeAborted,false);assert.equal(immediate.signalAborted,false);assert.equal(immediate.defaultViewNull,true);assert.equal(immediate.sameWindow,true);assert.equal(immediate.sameDocument,true);assert.equal(immediate.contextSame,true);assert.equal(immediate.query,'real retained bytes');assert.equal(immediate.functionResult,'real retained bytes');
 const timerResult=await bound(child.eval(`new Promise(resolve=>setTimeout(()=>{newTask=true;resolve({newTask,query:document.getElementById('actual').textContent,answer:(()=>6*7)()})},0))`),'actual retained new timer');
 assert.deepEqual(JSON.parse(JSON.stringify(timerResult)),{newTask:true,query:'real retained bytes',answer:42});
 const started=Date.now();while(!failures.some(value=>value.id===heldRequest.id)){if(Date.now()-started>=1000)throw Error('Original1000ms actual aborted request report');await new Promise(resolve=>setImmediate(resolve))}
 await new Promise(resolve=>setImmediate(resolve));
 const actual={immediate,timerResult,heldRequest:{id:heldRequest.id,type:heldRequest.type,url:heldRequest.url},failure:failures.find(value=>value.id===heldRequest.id),heldSuccessResponses:responses.filter(value=>value.id===heldRequest.id),events,retainedQueryAfterCancellation:child.retainedFunction(),parentQuery:page.evaluate('6*7'),signalStillUnaborted:owner.documentAbort.signal.aborted===false};
 assert.deepEqual(actual.heldSuccessResponses,[]);assert.equal(actual.retainedQueryAfterCancellation,'real retained bytes');assert.equal(actual.parentQuery,42);assert.equal(actual.signalStillUnaborted,true);console.log('actual-retirement-complete '+JSON.stringify(actual));
});
