import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {WebSocketServer} from 'ws';
const metadata=JSON.parse(await readFile(new URL('./service-proposal.json',import.meta.url)));
const snapshot=process.env.SERVICE_CACHE_SNAPSHOT??metadata.snapshot;
const {Browser}=await import(pathToFileURL(`${snapshot}/src/browser.js`));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
async function until(check){const deadline=Date.now()+4000;while(!await check()){if(Date.now()>deadline)throw Error('ServiceWorker condition expired');await tick();}}
async function fixture(t,routes={},enabled=true){
 const requests=[],reports=[],browser=new Browser({timeout:4000,experimentalFeatures:{serviceworker:enabled},loadResources:['iframe','worker']}),page=browser.createPage(),errors=[];
 page.on('pageError',error=>errors.push(error.message));
 const server=http.createServer(async(request,response)=>{requests.push(request.url);if(request.url==='/report'){const chunks=[];for await(const chunk of request)chunks.push(chunk);reports.push(JSON.parse(Buffer.concat(chunks)));response.end();return;}const route=routes[request.url];if(typeof route==='function'){route(request,response);return;}response.setHeader('content-type',route===undefined?'text/html':'text/javascript');response.end(route??'<!doctype html><body>page');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 await page.navigate(`${origin}/doc`);return{page,browser,reports,requests,errors,origin,server};
}
test('disabled service-worker profile keeps real interface brands without a navigator entry',async t=>{
 const{page}=await fixture(t,{},false);const result=page.evaluate(`(()=>{const result={present:'serviceWorker'in navigator,descriptor:Object.getOwnPropertyDescriptor(Navigator.prototype,'serviceWorker'),constructors:[typeof ServiceWorker,typeof ServiceWorkerRegistration,typeof ServiceWorkerContainer]};try{new ServiceWorkerContainer();}catch(error){result.error=error instanceof TypeError;}return result;})()`);assert.deepEqual(plain(result),{present:false,constructors:['function','function','function'],error:true});
});
test('register resolves parsed before real HTTP bytes arrive, and real waitUntil gates activation',async t=>{
 let held;const source=`let release;addEventListener('install',event=>event.waitUntil(new Promise(resolve=>release=resolve)));addEventListener('message',event=>{if(event.data==='release')release();});`;
 const{page,errors}=await fixture(t,{'/held.js':(request,response)=>{held=response;response.setHeader('content-type','text/javascript');}});
 const result=await page.evaluate(`(async()=>{window.reg=await navigator.serviceWorker.register('/held.js',{scope:'/'});window.worker=reg.installing;window.states=[];worker.onstatechange=()=>states.push(worker.state);window.ready=false;navigator.serviceWorker.ready.then(()=>ready=true);return{state:worker.state,readyStable:navigator.serviceWorker.ready===navigator.serviceWorker.ready,controller:navigator.serviceWorker.controller};})()`);
 assert.deepEqual(plain(result),{state:'parsed',readyStable:true,controller:null});await until(()=>held);assert.equal(page.dom.window.worker.state,'parsed');held.end(source);await until(()=>page.dom.window.worker.state==='installing');await tick();assert.equal(page.dom.window.ready,false);assert.equal(page.dom.window.reg.active,null);
 page.evaluate(`worker.postMessage('release')`);await until(()=>page.dom.window.ready);assert.equal(page.dom.window.reg.active,page.dom.window.worker);assert.equal(page.dom.window.reg.installing,null);assert.equal(page.dom.window.worker.state,'activated');assert.deepEqual([...page.dom.window.states],['installing','installed','activating','activated']);assert.deepEqual(errors,[]);
});
test('service realm executes in an isolated actual VM with genuine identity, lifetime events and CookieStore data',async t=>{
 const source=`const report=async()=>{await cookieStore.set('sw-cookie','actual');const cookie=await cookieStore.get('sw-cookie');let error;try{new ExtendableEvent('x').waitUntil(Promise.resolve());}catch(e){error=e.name;}return{global:Object.prototype.toString.call(self),identity:serviceWorker===registration.installing,worker:typeof postMessage,close:typeof close,xhr:typeof XMLHttpRequest,file:typeof FileReaderSync,process:typeof process,document:typeof document,cookie:cookie.value,error,secure:isSecureContext};};addEventListener('install',event=>event.waitUntil(report().then(value=>fetch('/report',{method:'POST',body:JSON.stringify({...value,trusted:event.isTrusted})}))));`;
 const{page,reports,errors}=await fixture(t,{'/realm.js':source});await page.evaluate(`navigator.serviceWorker.register('/realm.js',{scope:'/'}).then(value=>window.reg=value)`);await until(()=>page.dom.window.reg?.active?.state==='activated');await until(()=>reports.length);
 assert.deepEqual(reports[0],{global:'[object ServiceWorkerGlobalScope]',identity:true,worker:'undefined',close:'undefined',xhr:'undefined',file:'undefined',process:'undefined',document:'undefined',cookie:'actual',error:'InvalidStateError',secure:true,trusted:true});assert.match(page.dom.window.document.cookie,/sw-cookie=actual/);assert.deepEqual(errors,[]);
});
test('same-scope identity, longest-prefix lookup and same-origin iframe isolation use real registrations',async t=>{
 const{page}=await fixture(t,{'/simple.js':''});const result=await page.evaluate(`(async()=>{const a=await navigator.serviceWorker.register('/simple.js',{scope:'/'});const b=await navigator.serviceWorker.register('/simple.js',{scope:'/'});const deep=await navigator.serviceWorker.register('/simple.js',{scope:'/deep/'});window.child=document.createElement('iframe');child.src='/child';document.body.append(child);return{same:a===b,found:await navigator.serviceWorker.getRegistration('/deep/path')===deep,missing:await navigator.serviceWorker.getRegistration('https://example.com/')===undefined};})()`);assert.deepEqual(plain(result),{same:true,found:true,missing:true});await until(()=>page.dom.window.child.contentDocument?.readyState==='complete');assert.deepEqual(plain(await page.dom.window.child.contentWindow.eval(`navigator.serviceWorker.getRegistrations()`)),[]);
});
test('real script errors and rejected install extensions become redundant without page-script failure',async t=>{
 const{page,errors}=await fixture(t,{'/throw.js':'throw Error("top-level service failure")','/reject.js':`addEventListener('install',event=>event.waitUntil(Promise.reject(Error('install failure'))));`});
 await page.evaluate(`(async()=>{window.reg=await navigator.serviceWorker.register('/throw.js',{scope:'/throw/'});window.failed=reg.installing;window.rejectedReg=await navigator.serviceWorker.register('/reject.js',{scope:'/reject/'});window.rejected=rejectedReg.installing;})()`);
 await until(()=>page.dom.window.failed.state==='redundant'&&page.dom.window.rejected.state==='redundant');assert.equal(page.dom.window.reg.installing,null);assert.equal(page.dom.window.rejectedReg.active,null);assert.deepEqual(plain(await page.evaluate('navigator.serviceWorker.getRegistrations()')),[]);assert.deepEqual(errors,[]);
});
test('precache activation awaits actual HTTP Response bytes shared with the page',async t=>{
 const source=`addEventListener('install',event=>event.waitUntil(caches.open('precache').then(cache=>cache.addAll(['/asset','/json']))));`;
 const{page}=await fixture(t,{'/cache.js':source,'/asset':(request,response)=>{response.end(Buffer.from([0,255,2]));},'/json':(request,response)=>{response.setHeader('content-type','application/json');response.end('{"actual":true}');}});
 await page.evaluate(`navigator.serviceWorker.register('/cache.js',{scope:'/'}).then(value=>window.reg=value)`);await until(()=>page.dom.window.reg?.active?.state==='activated');const result=await page.evaluate(`(async()=>({bytes:[...new Uint8Array(await(await caches.match('/asset')).arrayBuffer())],json:await(await caches.match('/json')).json()}))()`);assert.deepEqual(plain(result),{bytes:[0,255,2],json:{actual:true}});
});
test('unregister and replacement terminate actual workers and detach every registration slot',async t=>{
 const{page}=await fixture(t,{'/simple.js':'','/waiting.js':`addEventListener('install',event=>event.waitUntil(new Promise(()=>{})));`});
 await page.evaluate(`(async()=>{window.first=await navigator.serviceWorker.register('/simple.js',{scope:'/swap/'});window.old=first.installing;})()`);await until(()=>page.dom.window.old.state==='activated');
 const result=await page.evaluate(`(async()=>{const second=await navigator.serviceWorker.register('/waiting.js',{scope:'/swap/'});const worker=second.installing;const firstResult=await second.unregister(),secondResult=await second.unregister();return{different:first!==second,old:old.state,oldSlot:first.active,newState:worker.state,firstResult,secondResult,slots:[second.installing,second.waiting,second.active]};})()`);assert.deepEqual(plain(result),{different:true,old:'redundant',oldSlot:null,newState:'redundant',firstResult:true,secondResult:false,slots:[null,null,null]});
});
test('module service workers use real imports in the actual worker realm',async t=>{
 const{page,reports}=await fixture(t,{'/module.js':`import {value} from './dependency.js';addEventListener('install',event=>event.waitUntil(fetch('/report',{method:'POST',body:JSON.stringify({value,document:typeof document})})));`,'/dependency.js':'export const value=42;'});
 await page.evaluate(`navigator.serviceWorker.register('/module.js',{scope:'/',type:'module'}).then(value=>window.reg=value)`);await until(()=>page.dom.window.reg?.active?.state==='activated');assert.deepEqual(reports[0],{value:42,document:'undefined'});
});
test('raw window close stops real service worker timers and in-flight transports',async t=>{
 let held,aborted=false;const{page,requests}=await fixture(t,{'/timer.js':`setInterval(()=>fetch('/pulse'),5);fetch('/held');`,'/held':(request,response)=>{held=response;response.once('close',()=>{aborted=!response.writableEnded;});}});
 await page.evaluate(`navigator.serviceWorker.register('/timer.js',{scope:'/'}).then(value=>window.reg=value)`);await until(()=>held&&requests.includes('/pulse'));page.dom.window.close();await until(()=>aborted);await new Promise(resolve=>setTimeout(resolve,30));const count=requests.length;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(requests.length,count);
});
test('ready remains one pending promise when the activated worker scope excludes the document',async t=>{
 const{page}=await fixture(t,{'/simple.js':''});await page.evaluate(`(async()=>{window.reg=await navigator.serviceWorker.register('/simple.js',{scope:'/elsewhere/'});window.readyPromise=navigator.serviceWorker.ready;window.resolved=false;readyPromise.then(()=>resolved=true);})()`);await until(()=>page.dom.window.reg?.active?.state==='activated');await tick();await tick();assert.equal(page.dom.window.resolved,false);assert.equal(page.evaluate('navigator.serviceWorker.ready===readyPromise'),true);
});
test('ServiceWorker.postMessage transfers actual buffers and rejects uncloneable functions synchronously',async t=>{
 const source=`addEventListener('message',event=>fetch('/report',{method:'POST',body:JSON.stringify({trusted:event.isTrusted,bytes:[...new Uint8Array(event.data.buffer)]})}));`;
 const{page,reports}=await fixture(t,{'/message.js':source});await page.evaluate(`navigator.serviceWorker.register('/message.js',{scope:'/'}).then(value=>window.reg=value)`);await until(()=>page.dom.window.reg?.active?.state==='activated');
 const result=page.evaluate(`(()=>{const buffer=new Uint8Array([0,255,1]).buffer;reg.active.postMessage({buffer},[buffer]);let error;try{reg.active.postMessage(function(){});}catch(e){error=e.name;}return{length:buffer.byteLength,error};})()`);assert.deepEqual(plain(result),{length:0,error:'DataCloneError'});await until(()=>reports.length);assert.deepEqual(reports[0],{trusted:true,bytes:[0,255,1]});
});
test('service workers use actual WebSocket connections while excluding dedicated blocking APIs',async t=>{
 const source=`addEventListener('install',event=>event.waitUntil(new Promise((resolve,reject)=>{const socket=new WebSocket(location.origin.replace('http:','ws:')+'/socket');socket.binaryType='arraybuffer';socket.onopen=()=>socket.send(new Uint8Array([0,255,9]));socket.onerror=()=>reject(Error('socket failed'));socket.onmessage=async message=>{await fetch('/report',{method:'POST',body:JSON.stringify({bytes:[...new Uint8Array(message.data)],trusted:message.isTrusted,xhr:typeof XMLHttpRequest,file:typeof FileReaderSync})});socket.close();resolve();};})));`;
 const{page,reports,server,origin}=await fixture(t,{'/socket-worker.js':source});const sockets=new WebSocketServer({server});let seenOrigin;
 sockets.on('connection',(socket,request)=>{seenOrigin=request.headers.origin;socket.on('message',(bytes,binary)=>socket.send(bytes,{binary}));});t.after(async()=>{for(const socket of sockets.clients)socket.terminate();await new Promise(resolve=>sockets.close(resolve));});
 await page.evaluate(`navigator.serviceWorker.register('/socket-worker.js',{scope:'/'}).then(value=>window.reg=value)`);await until(()=>page.dom.window.reg?.active?.state==='activated');assert.deepEqual(reports[0],{bytes:[0,255,9],trusted:true,xhr:'undefined',file:'undefined'});assert.equal(seenOrigin,origin);
});
