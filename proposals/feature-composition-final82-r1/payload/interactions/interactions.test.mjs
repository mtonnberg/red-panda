import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serve} from '/workspace/shared/feature-composition-2342-final82-runtime-r1/src/cdp.js';
import {connect} from '/workspace/shared/feature-composition-2342-final82-runtime-r1/test/cdp-client.js';

const candidate='/workspace/shared/feature-composition-2342-final82-runtime-r1';
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'red-panda-composition-interaction-'));
 let worker,service,client,send,restorePoison=false;
 t.after(async()=>{
  const failures=[];
  if(restorePoison&&send)try{await send('Runtime.evaluate',{expression:'for(const key of ["localName","tagName","ownerDocument"])delete actualButton[key];true',returnByValue:true,timeout:2000});}catch(error){failures.push(String(error));}
  try{await client?.close();}catch(error){failures.push(String(error));}
  try{await service?.close();}catch(error){failures.push(String(error));}
  try{await worker?.terminate();}catch(error){failures.push(String(error));}
  try{await rm(directory,{recursive:true,force:true});}catch(error){failures.push(String(error));}
  assert.deepEqual(failures,[],'all actual cleanup paths complete');
 });
 worker=new Worker(new URL('file://'+candidate+'/test/fixtures/http-cache-sync-server.mjs'));
 const [{port}]=await once(worker,'message'),origin='http://127.0.0.1:'+port;
 service=await serve({port:0,host:'127.0.0.1',timeout:2000,httpCacheDir:directory});
 client=await connect('ws://127.0.0.1:'+service.port+'/',{timeout:2500});
 const {browserContextId}=await client.send('Target.createBrowserContext');
 const {targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});
 const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 send=(method,params={})=>client.send(method,params,sessionId,{timeout:2500});
 const evaluate=async expression=>{
  const reply=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,timeout:2000});
  assert.equal(reply.exceptionDetails,undefined,JSON.stringify(reply));return reply.result.value;
 };
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Page.navigate',{url:origin+'/document'});
 assert.equal(await evaluate('new Promise(resolve=>document.readyState==="complete"?resolve(true):addEventListener("load",()=>resolve(true),{once:true}))'),true);
 const log=async()=>{const response=await fetch(origin+'/log');assert.equal(response.status,200);return response.json();};
 const page=service.browser.pages.get(targetId),frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
 return {origin,client,send,evaluate,log,page,service,frameId,poisoned(){restorePoison=true}};
}

test('real cached bytes remain blocked for public Fetch and sync XHR until actual connection policy is cleared',{timeout:15000},async t=>{
 const f=await fixture(t);
 const initial=await f.evaluate('fetch("/bytes").then(async response=>({body:await response.text(),receipt:response.headers.get("x-receipt")}))');
 const before=await f.log();assert.equal(before.filter(r=>r.url==='/bytes').length,1);
 assert.equal(f.service.browser.syncHTTP.worker,undefined);
 const offset=f.client.events.length;
 await f.send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:'*/bytes',block:true}]});
 const denied=await f.evaluate(`(async()=>{let asyncError,syncError;try{await fetch('/bytes')}catch(error){asyncError={name:error.name,message:error.message,realm:error instanceof TypeError}}const xhr=new XMLHttpRequest();xhr.open('GET','/bytes',false);try{xhr.send()}catch(error){syncError={name:error.name,message:error.message,status:xhr.status,realm:error instanceof DOMException}}return{asyncError,syncError}})()`);
 assert.deepEqual(denied,{asyncError:{name:'TypeError',message:'fetch error',realm:true},syncError:{name:'NetworkError',message:'A network error occurred',status:0,realm:true}});
 const deniedEvents=f.client.events.slice(offset),failures=deniedEvents.filter(e=>e.method==='Network.loadingFailed');
 assert.equal(failures.length,2);
 for(const {params}of failures){assert.equal(params.errorText,'UrlBlocked');assert.equal(params.blockedReason,'inspector');}
 assert.deepEqual(deniedEvents.filter(e=>['Network.responseReceived','Network.loadingFinished','Network.requestServedFromCache'].includes(e.method)),[],'denied cache entries produce no delivery events');
 assert.equal((await f.log()).filter(r=>r.url==='/bytes').length,1);
 await f.send('Network.setBlockedURLs',{urlPatterns:[]});
 const restored=await f.evaluate(`(async()=>{const response=await fetch('/bytes');const asyncValue={body:await response.text(),receipt:response.headers.get('x-receipt')};const xhr=new XMLHttpRequest();xhr.open('GET','/bytes',false);xhr.send();return{asyncValue,syncValue:{body:xhr.responseText,receipt:xhr.getResponseHeader('x-receipt')},status:xhr.status}})()`);
 assert.deepEqual(restored,{asyncValue:initial,syncValue:initial,status:200});
 assert.equal((await f.log()).filter(r=>r.url==='/bytes').length,1,'clearing policy reuses original real cached bytes');
 assert.equal(f.service.browser.syncHTTP.worker,undefined);assert.equal(f.service.browser.syncHTTP.operations.size,0);assert.equal(f.page.activeRequests.size,0);
});

test('a genuine MCP VM callback uses sync cached bytes to mutate a canonical node without invoking poisoned metadata getters',{timeout:15000},async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 const initial=await f.evaluate('fetch("/bytes").then(async response=>({body:await response.text(),receipt:response.headers.get("x-receipt")}))');
 await f.evaluate(`(()=>{globalThis.actualButton=document.createElement('button');actualButton.id='composition-button';actualButton.textContent='Before real tool';document.body.append(actualButton);globalThis.actualClicks=0;actualButton.addEventListener('click',()=>actualClicks++);return true})()`);
 const root=(await f.send('DOM.getDocument',{depth:-1})).root.nodeId;
 const nodeId=(await f.send('DOM.querySelector',{nodeId:root,selector:'#composition-button'})).nodeId;
 const {backendNodeId}=(await f.send('DOM.describeNode',{nodeId,depth:0})).node;
 const before=(await f.send('LP.getNodeDetails',{backendNodeId})).nodeDetails;
 assert.equal(before.name,'Before real tool');
 f.poisoned();
 await f.evaluate(`(()=>{globalThis.compositionReads=0;for(const key of ['localName','tagName','ownerDocument'])Object.defineProperty(actualButton,key,{configurable:true,get(){compositionReads++;throw Error('Actual poisoned metadata '+key)}});function execute(input){const xhr=new XMLHttpRequest();xhr.open('GET','/bytes',false);xhr.send();const receipt=xhr.getResponseHeader('x-receipt'),label='Cached receipt '+receipt;actualButton.textContent=label;actualButton.setAttribute('data-receipt',receipt);const before=performance.eventCounts.get('click');actualButton.dispatchEvent(new Event('click',{bubbles:true}));return{status:xhr.status,receipt,body:xhr.responseText,label,inputRealm:input instanceof Object,callbackRealm:execute instanceof Function,reads:compositionReads,clicks:actualClicks,eventDelta:performance.eventCounts.get('click')-before}}navigator.modelContext.registerTool({name:'actual_cached_dom_mutation',description:'Actual synchronous HTTP cache and canonical DOM mutation',execute});return true})()`);
 const offset=f.client.events.length;
 const {invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'actual_cached_dom_mutation',input:{actual:true}});
 // Use a real subsequent VM entry as in existing MCP producer controls.
 assert.equal(await f.evaluate('compositionReads'),0);
 const responded=f.client.events.slice(offset).filter(e=>e.method==='WebMCP.toolResponded'&&e.params.invocationId===invocationId);
 assert.equal(responded.length,1);
 const label='Cached receipt '+initial.receipt;
 assert.deepEqual(responded[0].params,{invocationId,status:'Completed',output:{status:200,receipt:initial.receipt,body:initial.body,label,inputRealm:true,callbackRealm:true,reads:0,clicks:1,eventDelta:1}});
 const after=(await f.send('LP.getNodeDetails',{backendNodeId})).nodeDetails;
 assert.equal(after.backendNodeId,backendNodeId);assert.equal(after.tagName,'button');assert.equal(after.name,label);
 const row=(await f.send('LP.getInteractiveElements',{})).elements.find(value=>value.backendNodeId===backendNodeId);
 assert.ok(row);assert.equal(row.name,label);
 assert.ok(f.client.events.slice(offset).some(e=>e.method==='DOM.attributeModified'&&e.params.nodeId===nodeId&&e.params.name==='data-receipt'&&e.params.value===initial.receipt));
 assert.equal(await f.evaluate('compositionReads'),0);assert.deepEqual(f.client.events.slice(offset).filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 assert.equal((await f.log()).filter(r=>r.url==='/bytes').length,1);assert.equal(f.service.browser.syncHTTP.worker,undefined);
 assert.equal(f.page.activeRequests.size,0);assert.equal(f.service.browser.syncHTTP.operations.size,0);
});
