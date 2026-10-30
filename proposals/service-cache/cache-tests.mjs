import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {snapshot}=JSON.parse(await readFile(new URL('./cache-proposal.json',import.meta.url)));
const {Browser}=await import(pathToFileURL(`${snapshot}/src/browser.js`));
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const deadline=Date.now()+3000;while(!check()){if(Date.now()>deadline)throw Error('Cache control expired');await tick();}}
async function fixture(t,{enabled=true,handler}={}){
 const requests=[],browser=new Browser({timeout:3000,experimentalFeatures:{serviceworker:enabled},loadResources:['iframe','worker']});
 const server=http.createServer((request,response)=>{requests.push({url:request.url,headers:request.headers});if(handler?.(request,response))return;if(request.url==='/missing'){response.writeHead(404);response.end('missing');return;}response.setHeader('content-type','text/html');response.end('<!doctype html><body>document');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const page=browser.createPage();await page.navigate(`${origin}/doc`);return{page,browser,origin,requests};
}
test('Cache disabled API removes only the entry property and illegal construction stays real',async t=>{
 const{page}=await fixture(t,{enabled:false});assert.deepEqual(plain(page.evaluate(`(()=>{const result={present:'caches'in self,ctors:[typeof Cache,typeof CacheStorage]};try{new CacheStorage();}catch(e){result.error=e instanceof TypeError;}return result;})()`)),{present:false,ctors:['function','function'],error:true});
});
test('Cache copies and consumes real binary bodies and reconstructs independent Response streams',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`(async()=>{const cache=await caches.open('binary'),source=new Response(new Uint8Array([0,255,1]),{status:201,statusText:'Created',headers:{'x-value':'a'}});await cache.put('/entry#hash',source);const a=await cache.match('/entry'),b=await cache.match('/entry#other');a.headers.set('x-value','changed');return{used:source.bodyUsed,separate:a!==b,bytes:[...new Uint8Array(await a.arrayBuffer())],other:[...new Uint8Array(await b.arrayBuffer())],status:b.status,statusText:b.statusText,header:b.headers.get('x-value'),brand:b instanceof Response,url:b.url,type:b.type};})()`);
 assert.deepEqual(plain(result),{used:true,separate:true,bytes:[0,255,1],other:[0,255,1],status:201,statusText:'Created',header:'a',brand:true,url:'',type:'default'});
});
test('native URL matching strips fragments, ignores Vary and keeps GET restriction',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`(async()=>{const cache=await caches.open('match');await cache.put(new Request('/entry?x=1#hash',{headers:{Accept:'a'}}),new Response('value',{headers:{Vary:'Accept'}}));const keys=await cache.keys();return{miss:await cache.match('/entry')===undefined,ignore:!!await cache.match('/entry?x=2',{ignoreSearch:true}),vary:!!await cache.match(new Request('/entry?x=1',{headers:{Accept:'b'}})),post:!!await cache.match(new Request('/entry?x=1',{method:'POST'}),{ignoreMethod:true}),keyHeaders:[...keys[0].headers],keyMethod:keys[0].method,keyURL:keys[0].url,realm:keys instanceof Array&&keys[0]instanceof Request,matchAll:typeof cache.matchAll};})()`);
 assert.deepEqual(plain(result),{miss:true,ignore:true,vary:true,post:false,keyHeaders:[],keyMethod:'GET',keyURL:page.url.replace('/doc','/entry?x=1'),realm:true,matchAll:'undefined'});
});
test('CacheStorage names preserve creation order and orphan handles retain their bytes',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`(async()=>{const a=await caches.open('a'),again=await caches.open('a');await caches.open('b');const names=await caches.keys();const deleted=await caches.delete('a'),twice=await caches.delete('a');await a.put('/orphan',new Response('kept'));return{stable:caches===self.caches,same:a===again,names,deleted,twice,orphan:await(await a.match('/orphan')).text(),reachable:await caches.match('/orphan')===undefined,has:await caches.has('a')};})()`);
 assert.deepEqual(plain(result),{stable:true,same:false,names:['a','b'],deleted:true,twice:false,orphan:'kept',reachable:true,has:false});
});
test('Cache rejects invalid entries before committing and used/locked bodies remain errors',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`(async()=>{const cache=await caches.open('reject'),used=new Response('used');await used.text();const locked=new Response('locked');const reader=locked.body.getReader();const errors=[];for(const [request,response]of [[new Request('/p',{method:'POST',body:'x'}),new Response('x')],['data:text/plain,x',new Response('x')],['/p',new Response('x',{status:206})],['/p',new Response('x',{headers:{Vary:'Accept, *'}})],['/p',used],['/p',locked]]){try{await cache.put(request,response);}catch(e){errors.push(e instanceof TypeError);}}reader.releaseLock();return{errors,count:(await cache.keys()).length};})()`);
 assert.deepEqual(plain(result),{errors:[true,true,true,true,true,true],count:0});
});
test('Cache.addAll uses real requests with headers and atomically stores only complete successful batches',async t=>{
 const{page,requests}=await fixture(t,{handler:(request,response)=>{if(request.url==='/bytes'){response.setHeader('content-type','application/octet-stream');response.end(Buffer.from([0,1,254]));return true;}}});
 const result=await page.evaluate(`(async()=>{const cache=await caches.open('batch');await cache.add(new Request('/bytes',{headers:{'x-cache':'sent'}}));let error;try{await cache.addAll(['/good','/missing']);}catch(e){error=e instanceof TypeError;}return{bytes:[...new Uint8Array(await(await cache.match('/bytes')).arrayBuffer())],error,good:await cache.match('/good')===undefined,count:(await cache.keys()).length};})()`);
 assert.deepEqual(plain(result),{bytes:[0,1,254],error:true,good:true,count:1});assert.equal(requests.find(request=>request.url==='/bytes').headers['x-cache'],'sent');
});
test('origin storage is shared through actual frames and navigation but isolated by browser context',async t=>{
 const{page,browser,origin}=await fixture(t);await page.evaluate(`(async()=>{await(await caches.open('shared')).put('/key',new Response('shared'));window.child=document.createElement('iframe');child.src='/child';document.body.append(child);})()`);await until(()=>page.dom.window.child.contentDocument?.readyState==='complete');
 assert.equal(await page.dom.window.child.contentWindow.eval(`(async()=>await(await caches.match('/key')).text())()`),'shared');
 await page.navigate(`${origin}/next`);assert.equal(await page.evaluate(`(async()=>await(await caches.match('/key')).text())()`),'shared');
 const other=browser.createPage(browser.createContext());await other.navigate(`${origin}/other`);assert.deepEqual(plain(await other.evaluate('caches.keys()')),[]);
});
test('document teardown genuinely cancels pending Cache.addAll HTTP and never commits a partial batch',async t=>{
 let held,aborted=false;const{page,browser,origin}=await fixture(t,{handler:(request,response)=>{if(request.url==='/held'){held=response;response.on('close',()=>{aborted=!response.writableEnded;});return true;}}});
 page.evaluate(`caches.open('pending').then(cache=>cache.addAll(['/good','/held']))`);await until(()=>held);page.close();await until(()=>aborted);
 const other=browser.createPage();await other.navigate(`${origin}/other`);assert.equal(await other.evaluate(`caches.open('pending').then(cache=>cache.keys()).then(keys=>keys.length)`),0);
});
test('actual worker threads read and write the same origin bytes through a private Cache RPC',async t=>{
 const source=`(async()=>{const cache=await caches.open('shared-worker');const body=await(await cache.match('/from-page')).arrayBuffer();await cache.put('/from-worker',new Response(new Uint8Array([9,0,255])));postMessage({bytes:[...new Uint8Array(body)],realm:caches instanceof CacheStorage,secure:isSecureContext});})()`;
 const{page}=await fixture(t,{handler:(request,response)=>{if(request.url==='/worker.js'){response.setHeader('content-type','text/javascript');response.end(source);return true;}}});
 const result=await page.evaluate(`(async()=>{await(await caches.open('shared-worker')).put('/from-page',new Response(new Uint8Array([0,254])));return await new Promise((resolve,reject)=>{const worker=new Worker('/worker.js');worker.onmessage=event=>{worker.terminate();resolve(event.data);};worker.onerror=event=>reject(event.error);});})()`);
 assert.deepEqual(plain(result),{bytes:[0,254],realm:true,secure:true});assert.deepEqual(plain(await page.evaluate(`(async()=>[...new Uint8Array(await(await caches.match('/from-worker')).arrayBuffer())])()`)),[9,0,255]);
});
test('cross-realm Response input preserves its actual body and metadata',async t=>{
 const{page}=await fixture(t);page.evaluate(`window.child=document.createElement('iframe');child.src='/child';document.body.append(child)`);await until(()=>page.dom.window.child.contentDocument?.readyState==='complete');
 const result=await page.evaluate(`(async()=>{const original=new child.contentWindow.Response('cross-realm',{status:202});const cache=await caches.open('cross');await cache.put('/cross',original);const read=await cache.match('/cross');return{used:original.bodyUsed,text:await read.text(),status:read.status,realm:read instanceof Response};})()`);assert.deepEqual(plain(result),{used:true,text:'cross-realm',status:202,realm:true});
});
test('Cache.add executes the internal batch operation even when public addAll is replaced',async t=>{
 const{page,requests}=await fixture(t);const result=await page.evaluate(`(async()=>{const cache=await caches.open('shadow');cache.addAll=()=>{throw Error('overridden');};await cache.add('/real-fetch');return(await cache.match('/real-fetch')).status;})()`);assert.equal(result,200);assert.ok(requests.some(request=>request.url==='/real-fetch'));
});
