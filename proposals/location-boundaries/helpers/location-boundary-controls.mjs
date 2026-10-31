import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],out=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
let service,client,failure,origin;const wire=[],observations=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer((request,response)=>{wire.push({url:request.url,method:request.method});response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});response.end('<!doctype html><html><head><title>Actual boundary document</title><script>globalThis.actualMarker="kept";globalThis.actualHeldDocument=document;globalThis.actualHeldObject=Object;globalThis.actualTransitions=[];globalThis.actualErrors=[];addEventListener("error",event=>actualErrors.push({name:event.error?.name,message:event.message,realm:event.error instanceof Error}));for(const type of["hashchange","popstate"])addEventListener(type,event=>actualTransitions.push({type,oldURL:event.oldURL??null,newURL:event.newURL??null}));for(const type of["navigate","currententrychange"])globalThis.navigation?.addEventListener(type,event=>actualTransitions.push({type,url:event.destination?.url??null,kind:event.navigationType??null}));</script></head><body>Actual retained body</body></html>')});
server.on('upgrade',(request,socket)=>{wire.push({url:request.url,method:request.method,upgrade:true});socket.destroy()});server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
const link=url=>'const a=document.createElement("a");a.href='+JSON.stringify(url)+';document.body.appendChild(a);a.click()';
const cases=[
 ['hash-empty-no-fragment',"location.hash=''",''],
 ['hash-octothorpe-no-fragment',"location.hash='#'",''],
 ['href-empty-fragment',"location.href='#'",''],
 ['assign-empty-fragment',"location.assign('#')",''],
 ['hash-clear-existing',"location.hash=''",'#old'],
 ['hash-octothorpe-existing',"location.hash='#'",'#old'],
 ['hash-empty-already-empty',"location.hash=''",'#'],
 ['hash-same-existing',"location.hash='same'",'#same'],
 ['href-mailto',"location.href='mailto:actual@example.invalid'",''],
 ['assign-tel',"location.assign('TEL:+15555550100')",''],
 ['replace-sms',"location.replace('sms:+15555550100')",''],
 ['anchor-mailto',link('mailto:actual@example.invalid'),''],
 ['anchor-tel',link('tel:+15555550100'),''],
 ['href-custom',"location.href='redpanda-calibration:actual-owned-value'",''],
];
const snapshot='JSON.stringify({url:location.href,documentURL:document.URL,hash:location.hash,origin:globalThis.origin,length:history.length,state:history.state,marker:globalThis.actualMarker??null,sameDocument:globalThis.actualHeldDocument===document,sameObject:globalThis.actualHeldObject===Object,transitions:globalThis.actualTransitions??null,errors:globalThis.actualErrors??null,checkpoint:globalThis.actualCheckpoint??false})';
try{
 if(target==='native')service=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0,loadResources:['iframe','worker']});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);
 for(const[name,action,fragment]of cases){let browserContextId;const row={name,action,fragment},offset=wire.length;
  try{
   ({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId);
   await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:origin+'/root?case='+name+fragment});
   for(let i=0;i<100;i++){const ready=await send('Runtime.evaluate',{expression:"globalThis.actualMarker==='kept'&&document.readyState==='complete'",returnByValue:true});if(ready.result?.value)break;if(i===99)throw Error('Actual boundary document readiness deadline');await delay(5)}
   row.preparation=await send('Runtime.evaluate',{expression:'(async()=>{history.replaceState({owned:"seed"},"");await new Promise(resolve=>setTimeout(resolve,0));actualTransitions=[];return true})()',returnByValue:true,awaitPromise:true});
   row.before=await send('Runtime.evaluate',{expression:snapshot,returnByValue:true});
   row.immediate=await send('Runtime.evaluate',{expression:'(()=>{let error;try{'+action+'}catch(e){error={name:e.name,message:e.message,realm:e instanceof DOMException||e instanceof TypeError}}setTimeout(()=>globalThis.actualCheckpoint=true,0);return JSON.stringify({error:error??null,snapshot:JSON.parse('+snapshot+')})})()',returnByValue:true});
   await delay(20);row.after=await send('Runtime.evaluate',{expression:snapshot,returnByValue:true});row.tree=await send('Page.getFrameTree');
  }catch(error){row.failure={name:error.name,message:error.message,stack:error.stack}}finally{row.wire=wire.slice(offset);if(browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId})}catch(error){row.disposeFailure=error.message}observations.push(row)}
 }
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}finally{await client?.close();await service?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(out,JSON.stringify({target,origin,helperSHA256:sha(await readFile(new URL(import.meta.url))),binarySHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:observations.length,failure}))}
