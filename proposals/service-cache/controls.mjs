import http from 'node:http';
import { once } from 'node:events';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startReference } from './helpers/reference-server.mjs';
import { connect } from './helpers/cdp-client.js';
const output=process.argv[2];if(!output)throw Error('Supply output');
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const sha=value=>createHash('sha256').update(value).digest('hex');
if(sha(await readFile(binary))!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw Error('Unexpected binary');
const workerSource=`const report=phase=>fetch('/report',{method:'POST',body:JSON.stringify({phase,secure:isSecureContext,identity:self.serviceWorker===self.registration.installing,scope:registration.scope,state:self.serviceWorker.state,types:Object.fromEntries(['ServiceWorkerGlobalScope','WorkerGlobalScope','DedicatedWorkerGlobalScope','ServiceWorker','ServiceWorkerRegistration','ExtendableEvent','XMLHttpRequest','FileReaderSync','fetch','WebSocket','postMessage','close','clients','skipWaiting','CookieStore','cookieStore','CookieChangeEvent','ExtendableCookieChangeEvent','Cache','CacheStorage','caches'].map(name=>[name,typeof self[name]])),globalBrand:Object.prototype.toString.call(self),eventBrand:Object.prototype.toString.call(new ExtendableEvent('x'))})});
report('script');self.addEventListener('install',event=>{event.waitUntil(Promise.all([report('install'),new Promise(resolve=>setTimeout(resolve,20))]));});self.addEventListener('activate',event=>{event.waitUntil(report('activate'));});`;
const reports=[],requests=[];
const server=http.createServer(async(request,response)=>{
 const pathname=new URL(request.url,'http://fixture.test').pathname;requests.push({method:request.method,path:request.url});
 if(pathname==='/report'){const chunks=[];for await(const chunk of request)chunks.push(chunk);reports.push(JSON.parse(Buffer.concat(chunks)));response.end('ok');return;}
 if(pathname==='/worker.js'){response.setHeader('content-type','text/javascript');response.end(workerSource);return;}
 if(pathname==='/badmime.js'){response.setHeader('content-type','text/plain');response.end('self.topLevel=true;');return;}
 if(pathname==='/missing.js'){response.writeHead(404,{'content-type':'text/javascript'});response.end('throw Error("missing body ran");');return;}
 response.setHeader('content-type','text/html');response.end('<!doctype html><body>control');
});
server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const report={kind:'bounded-native-service-worker-cache-public-controls',binarySHA256:sha(await readFile(binary)),origin,workerSourceSHA256:sha(workerSource),commandTimeoutMs:5000,profiles:[]};
let reference,client;
try{
 for(const enabled of [false,true]){
  const entry={enabled,args:['--load-resources','iframe','--load-resources','worker',...(enabled?['--experimental-features','serviceworker']:[])],observations:{}};report.profiles.push(entry);
  try{
   reference=await startReference(binary,{args:entry.args});client=await connect(reference.endpoint,{timeout:5000});
   const{browserContextId}=await client.send('Target.createBrowserContext');
   const sessions=[],contexts=[browserContextId];
   async function open(url=`${origin}/doc`,context){
    if(!context){({browserContextId:context}=await client.send('Target.createBrowserContext'));contexts.push(context);}
    const{targetId}=await client.send('Target.createTarget',{browserContextId:context,url:'about:blank'});
    const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
    const send=(method,params={})=>client.send(method,params,sessionId);
    const evaluate=async source=>{const result=await send('Runtime.evaluate',{expression:`(async()=>JSON.stringify(await (${source})))()`,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return JSON.parse(result.result.value);};
    await send('Page.navigate',{url});for(let n=0;n<100;n++){if(await evaluate('document.readyState')==='complete')break;await new Promise(resolve=>setTimeout(resolve,5));}
    const session={targetId,send,evaluate};sessions.push(session);return session;
   }
   const main=await open(`${origin}/doc`,browserContextId);
   entry.observations.surface=await main.evaluate(`({secure:isSecureContext,sw:'serviceWorker'in navigator,cache:'caches'in self,ctors:Object.fromEntries(['ServiceWorkerContainer','ServiceWorkerRegistration','ServiceWorker','ServiceWorkerGlobalScope','ExtendableEvent','Cache','CacheStorage'].map(name=>[name,typeof self[name]])),prototypes:Object.fromEntries(['ServiceWorkerContainer','ServiceWorkerRegistration','ServiceWorker','ExtendableEvent','Cache','CacheStorage'].map(name=>[name,typeof self[name]==='function'?Object.getOwnPropertyNames(self[name].prototype):null]))})`);
   entry.observations.dataSurface=await main.evaluate(`new Promise(resolve=>{addEventListener('message',event=>resolve(event.data),{once:true});const frame=document.createElement('iframe');frame.src="data:text/html,<script>parent.postMessage({secure:isSecureContext,sw:'serviceWorker'in navigator,cache:'caches'in self,cacheCtor:typeof Cache,swCtor:typeof ServiceWorkerContainer},'*')<\\/script>";document.body.append(frame);})`);
   entry.observations.constructors=await main.evaluate(`(()=>{const out={};for(const name of ['ServiceWorkerContainer','ServiceWorkerRegistration','ServiceWorker','Cache','CacheStorage']){try{out[name]={brand:Object.prototype.toString.call(new self[name]())};}catch(error){out[name]={error:error.name,message:error.message};}}return out;})()`);
   if(enabled){
    entry.observations.cache=await main.evaluate(`(async()=>{const a=await caches.open('control'),b=await caches.open('control');await a.put(new Request('/key#fragment',{headers:{Accept:'a'}}),new Response(new Uint8Array([0,255,1]),{status:201,statusText:'Created',headers:{Vary:'Accept','x-test':'value'}}));const hit=await a.match(new Request('/key',{headers:{Accept:'a'}}));const different=await a.match(new Request('/key',{headers:{Accept:'b'}}));let all=null;try{all=await a.matchAll();}catch(e){all={error:e.name};}const keys=await a.keys();return{sameCache:a===b,hit:hit?{status:hit.status,statusText:hit.statusText,bytes:[...new Uint8Array(await hit.arrayBuffer())],url:hit.url,type:hit.type,headers:[...hit.headers]}:null,different:!!different,ignoreVary:!!await a.match('/key',{ignoreVary:true}),postIgnored:!!await a.match(new Request('/key',{method:'POST'}),{ignoreMethod:true,ignoreVary:true}),keys:keys.map(k=>({url:k.url,headers:[...k.headers],method:k.method})),matchAll:all===null?null:Array.isArray(all)?all.length:all};})()`);
    let sibling=main;await sibling.send('Page.navigate',{url:`${origin}/other`});
    entry.observations.sameContext=await sibling.evaluate(`({names:await caches.keys(),hit:!!await caches.match('/key',{ignoreVary:true})})`);
    entry.observations.registration=await sibling.evaluate(`(async()=>{const container=navigator.serviceWorker;const ready=container.ready;const registration=await container.register('/worker.js',{scope:'/scope/'});const worker=registration.installing;window.states=[];worker.addEventListener('statechange',()=>states.push(worker.state));window.reg=registration;window.worker=worker;return {controller:container.controller,readyStable:ready===container.ready,initial:worker.state,scope:registration.scope,brand:Object.prototype.toString.call(registration),same:registration===await container.register('/worker.js',{scope:'/scope/'})};})()`);
    for(let n=0;n<200;n++){if(await sibling.evaluate('worker.state')==='activated')break;await new Promise(resolve=>setTimeout(resolve,5));}
    entry.observations.activation=await sibling.evaluate(`({state:worker.state,states,installing:reg.installing===null,activeSame:reg.active===worker,readyStable:navigator.serviceWorker.ready===navigator.serviceWorker.ready,controller:navigator.serviceWorker.controller,all:(await navigator.serviceWorker.getRegistrations()).map(r=>r.scope),readySettled:await Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),20))])})`);
    entry.observations.validation=await sibling.evaluate(`(async()=>{const out={};for(const [name,url,options]of[['cross','https://example.com/sw.js',{}],['scheme','data:text/javascript,',{}],['scope','/worker.js',{scope:'https://example.com/'}],['mime','/badmime.js',{scope:'/mime/'}],['missing','/missing.js',{scope:'/missing/'}],['badType','/worker.js',{scope:'/badtype/',type:'wrong'}]]){try{const r=await navigator.serviceWorker.register(url,options);out[name]={resolved:true,state:r.installing?.state??r.active?.state};}catch(e){out[name]={error:e.name,message:e.message};}}return out;})()`);
    await new Promise(resolve=>setTimeout(resolve,100));
    entry.observations.validationAfter100ms=await sibling.evaluate(`(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,installing:r.installing?.state??null,waiting:r.waiting?.state??null,active:r.active?.state??null}))`);
    await sibling.evaluate(`(()=>{window.child=document.createElement('iframe');child.src='/third';document.body.append(child);return true;})()`);
    for(let n=0;n<100;n++){if(await sibling.evaluate(`child.contentDocument?.readyState`)==='complete')break;await new Promise(resolve=>setTimeout(resolve,5));}
    entry.observations.sameContextRegistrations=await sibling.evaluate(`(await child.contentWindow.navigator.serviceWorker.getRegistrations()).map(r=>r.scope)`);
    entry.observations.unregister=await sibling.evaluate(`({first:await reg.unregister(),second:await reg.unregister(),workerState:worker.state,installing:reg.installing,waiting:reg.waiting,active:reg.active})`);
   }
   for(const id of contexts)await client.send('Target.disposeBrowserContext',{browserContextId:id});
   if(enabled){const fresh=await open(`${origin}/new-context`);entry.observations.afterContextDispose=await fresh.evaluate(`({names:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>r.scope)})`);await client.send('Target.disposeBrowserContext',{browserContextId:contexts.at(-1)});}
  }catch(error){entry.error=error.stack;}
  finally{await client?.close();client=undefined;await reference?.close();reference=undefined;}
  await writeFile(output,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(entry)+'\n');
 }
}finally{await client?.close();await reference?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
report.workerReports=reports;report.requests=requests;report.cleanup='all owned native processes/connections/browser contexts and port0 server closed';await writeFile(output,JSON.stringify(report,null,2)+'\n');
