import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHook} from 'node:async_hooks';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {setImmediate as turn} from 'node:timers/promises';
import {Browser,until} from '../src/browser.js';

const source=`const {parentPort}=require('node:worker_threads'),http=require('node:http'),log=[];const server=http.createServer(async(q,s)=>{const path=new URL(q.url,'http://fixture').pathname;if(path==='/log'){s.setHeader('content-type','application/json');s.end(JSON.stringify(log));return}const record={path,method:q.method,closed:false};log.push(record);s.on('close',()=>record.closed=true);if(path==='/hang')return;const chunks=[];for await(const chunk of q)chunks.push(chunk);if(path==='/'){s.end('<!doctype html><title>actual async navigation</title>');return}s.setHeader('content-type','application/json');s.end(JSON.stringify({method:q.method,body:Buffer.concat(chunks).toString()}))});server.listen(0,'127.0.0.1',()=>parentPort.postMessage({port:server.address().port}));parentPort.on('message',m=>{if(m==='close'){server.closeAllConnections();server.close(()=>parentPort.close())}});`;
async function fixture(t){const server=new Worker(source,{eval:true});t.after(()=>server.terminate());const[ready]=await once(server,'message');const browser=new Browser({timeout:1000});t.after(()=>browser.close());const page=browser.createPage(),base='http://127.0.0.1:'+ready.port;await page.navigate(base);return{server,browser,page,w:page.dom.window,base}}
function workersDuring(){const rows=[],hook=createHook({init(id,type){if(type==='WORKER')rows.push(id)}});hook.enable();return{rows,close:()=>hook.disable()}}

test('async Browser/Page navigation and close-before-use allocate no synchronous transport thread',async t=>{
 const observed=workersDuring();t.after(()=>observed.close());const browser=new Browser({timeout:1000});t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<!doctype html><title>async only</title>');assert.equal(page.dom.window.document.title,'async only');assert.equal(page.dom.window.document.readyState,'complete');assert.equal(browser.syncHTTP.worker,undefined);assert.deepEqual(observed.rows,[]);browser.close();assert.throws(()=>browser.syncHTTP.fetch(page,'http://127.0.0.1/'),/closed/);assert.deepEqual(observed.rows,[]);
});

test('first real synchronous XHR owns one actual thread and subsequent requests reuse its HTTP transport',async t=>{
 const{browser,w,base}=await fixture(t),observed=workersDuring();t.after(()=>observed.close());assert.equal(browser.syncHTTP.worker,undefined);const first=new w.XMLHttpRequest();first.open('POST',base+'/echo',false);first.send('first actual bytes');assert.equal(first.status,200);assert.deepEqual(JSON.parse(first.responseText),{method:'POST',body:'first actual bytes'});const worker=browser.syncHTTP.worker;assert.ok(worker instanceof Worker);assert.ok(worker.threadId>0);assert.equal(observed.rows.length,1);const second=new w.XMLHttpRequest();second.open('GET',base+'/echo',false);second.send();assert.equal(second.status,200);assert.strictEqual(browser.syncHTTP.worker,worker);assert.equal(observed.rows.length,1);assert.equal(browser.syncHTTP.operations.size,0);
});

test('request-callback abort before first dispatch leaves no transport thread or owned request',async t=>{
 const{browser,page,base}=await fixture(t),observed=workersDuring();t.after(()=>observed.close());const controller=new AbortController();page.activeRequests.add('unrelated');page.once('request',()=>controller.abort());assert.throws(()=>browser.syncHTTP.fetch(page,base+'/must-not-send',{signal:controller.signal}),/canceled/);await turn();assert.equal(browser.syncHTTP.worker,undefined);assert.deepEqual(observed.rows,[]);assert.deepEqual([...page.activeRequests],['unrelated']);assert.equal(browser.syncHTTP.operations.size,0);assert.equal((await(await fetch(base+'/log')).json()).some(v=>v.path==='/must-not-send'),false);
});

test('first-request startup counts toward the original1000ms request timeout and cancels actual hanging HTTP',async t=>{
 const{browser,page,w,base}=await fixture(t);assert.equal(page.timeout,1000);const xhr=new w.XMLHttpRequest();xhr.open('GET',base+'/hang',false);assert.throws(()=>xhr.send(),e=>e instanceof w.DOMException&&e.name==='NetworkError');await turn();assert.equal(page.timeout,1000);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);await until(async()=>{const log=await(await fetch(base+'/log')).json();return log.some(v=>v.path==='/hang'&&v.closed)},{timeout:1000});
});

test('an actual unexpected transport exit propagates to later requests without inventing a response',async t=>{
 const{browser,page,w,base}=await fixture(t);const xhr=new w.XMLHttpRequest();xhr.open('GET',base+'/echo',false);xhr.send();assert.equal(xhr.status,200);await browser.syncHTTP.worker.terminate();await turn();assert.match(browser.syncHTTP.error.message,/transport exited/);const failed=new w.XMLHttpRequest();failed.open('GET',base+'/echo',false);assert.throws(()=>failed.send(),e=>e instanceof w.DOMException&&e.name==='NetworkError');assert.equal(failed.status,0);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);
});
