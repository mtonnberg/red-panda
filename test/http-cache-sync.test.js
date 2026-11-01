import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from '../src/browser.js';

async function fixture(t,{configured=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'red-panda-http-cache-sync-'));
 const worker=new Worker(new URL('./fixtures/http-cache-sync-server.mjs',import.meta.url));
 const [{port}]=await once(worker,'message');const origin=`http://127.0.0.1:${port}`;
 const browser=new Browser({timeout:3000,loadResources:['worker'],...(configured?{httpCacheDir:directory}:{})});
 t.after(async()=>{browser.close();await worker.terminate();await rm(directory,{recursive:true,force:true})});
 const page=browser.createPage();await page.navigate(origin+'/document');
 const log=()=>fetch(origin+'/log').then(response=>response.json());
 const sync=path=>page.evaluate(`(()=>{const xhr=new XMLHttpRequest();xhr.open('GET',${JSON.stringify(origin+path)},false);xhr.send();return{status:xhr.status,text:xhr.statusText,body:xhr.responseText,receipt:xhr.getResponseHeader('x-receipt'),cookie:xhr.getResponseHeader('set-cookie')}})()`);
 return {browser,page,origin,directory,log,sync};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const bytes=async response=>[...new Uint8Array(await response.arrayBuffer())];

test('default synchronous HTTP still performs real requests and creates no filesystem cache',{timeout:15000},async t=>{
 const {browser,sync,log,directory}=await fixture(t,{configured:false});
 const a=plain(sync('/bytes')),b=plain(sync('/bytes'));assert.equal(a.status,200);assert.notEqual(a.receipt,b.receipt);assert.notEqual(a.body,b.body);
 assert.equal((await log()).filter(row=>row.url==='/bytes').length,2);assert.ok(browser.syncHTTP.worker);assert.deepEqual(await readdir(directory),[]);
});
test('async HTTP seeds genuine synchronous hits without allocating a transport thread',{timeout:15000},async t=>{
 const {browser,page,sync,log}=await fixture(t),events=[];
 const first=await page.fetch('/bytes'),body=Buffer.from(await first.arrayBuffer()),receipt=first.headers.get('x-receipt');
 page.on('requestServedFromCache',event=>events.push(event.id));
 for(let i=0;i<2;i++)assert.deepEqual(plain(sync('/bytes')),{status:200,text:'OK',body:body.toString('utf8'),receipt,cookie:null});
 assert.equal(browser.syncHTTP.worker,undefined);assert.equal((await log()).filter(row=>row.url==='/bytes').length,1);assert.equal(events.length,2);assert.notEqual(events[0],events[1]);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);
});
test('synchronous 304 uses the shared real renewal and cookie producers before async reuse',{timeout:15000},async t=>{
 const {browser,page,sync,log,origin}=await fixture(t),first=plain(sync('/validator')),second=plain(sync('/validator'));
 assert.equal(first.text,'OK');assert.equal(second.text,'Not Modified');assert.equal(second.body,first.body);assert.equal(second.receipt,first.receipt);assert.equal(second.cookie,null);
 const third=await page.fetch('/validator');assert.equal(third.statusText,'OK');assert.equal(await third.text(),first.body);assert.notEqual(third.headers.get('x-receipt'),first.receipt);
 const cookies=await browser.contexts.get('default').cookies.getCookies(origin+'/');const cookie=cookies.find(value=>value.key==='actualSync');assert.equal(cookie?.value,'received');assert.equal(cookie?.httpOnly,true);
 const echoed=plain(sync('/echo-cookie'));assert.match(echoed.body,/actualSync=received/);
 assert.deepEqual((await log()).filter(row=>row.url==='/validator').map(row=>row.headers['if-none-match']??null),[null,'"actual-sync-v1"']);assert.equal(page.activeRequests.size,0);
});
test('Window and Worker synchronous HTTP share actual cached binary bodies with async Fetch',{timeout:15000},async t=>{
 const {page,origin,log}=await fixture(t),first=await page.fetch('/binary'),initial=await bytes(first),receipt=first.headers.get('x-receipt');
 async function workerRequest(path){
  return plain(await page.evaluate(`new Promise((resolve,reject)=>{const worker=new Worker(${JSON.stringify(origin+'/worker.js')});worker.onmessage=event=>{worker.terminate();resolve(event.data)};worker.onerror=event=>{worker.terminate();reject(Error(event.message))};worker.postMessage(${JSON.stringify(origin+path)})})`));
 }
 const a=await workerRequest('/binary');assert.equal(a.status,200);assert.equal(a.receipt,receipt);assert.deepEqual(a.bytes,initial);
 const b=await workerRequest('/binary-second');assert.equal(b.status,200);assert.ok(Array.isArray(b.bytes));
 const fromWindow=await page.fetch('/binary-second');assert.equal(fromWindow.headers.get('x-receipt'),b.receipt);assert.deepEqual(await bytes(fromWindow),b.bytes);
 const rows=await log();assert.equal(rows.filter(row=>row.url==='/binary').length,1);assert.equal(rows.filter(row=>row.url==='/binary-second').length,1);
});
test('a cached synchronous response still obeys the actual selected body limit and cleanup',{timeout:15000},async t=>{
 const {browser,page,origin,log}=await fixture(t);await page.fetch('/bytes');
 assert.throws(()=>browser.syncHTTP.fetch(page,origin+'/bytes',{maxBodyBytes:1}),{message:'Response exceeds 1 byte limit'});
 assert.equal(browser.syncHTTP.worker,undefined);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);assert.equal((await log()).filter(row=>row.url==='/bytes').length,1);
});
