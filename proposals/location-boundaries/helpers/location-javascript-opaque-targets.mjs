import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],out=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
let a,b,service,client,failure;const wire=[],observations=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const servers=['A','B'].map(label=>http.createServer((request,response)=>{wire.push({label,url:request.url,method:request.method});response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});response.end('<!doctype html><html><head><title>Actual '+label+'</title><script>globalThis.actualMarker='+JSON.stringify(label)+';globalThis.actualRuns=[];globalThis.actualHeldDocument=document;globalThis.actualHeldObject=Object;globalThis.actualParent=parent;</script></head><body><p>'+label+'</p>'+(request.url.startsWith('/root')?'<iframe name=same src="'+a+'/child-a"></iframe><iframe name=foreign src="'+b+'/child-b"></iframe>':'')+'</body></html>')}));
for(let i=0;i<servers.length;i++)servers[i].listen(0,i?'127.0.0.2':'127.0.0.1');await Promise.all(servers.map(server=>once(server,'listening')));a='http://127.0.0.1:'+servers[0].address().port;b='http://127.0.0.2:'+servers[1].address().port;
const submit=(name,code)=>`const form=document.createElement('form');form.target=${JSON.stringify(name)};form.action='javascript:'+${JSON.stringify(code)};document.body.appendChild(form);form.requestSubmit()`;
const childSource=label=>'<!doctype html><html><head><script>globalThis.actualMarker='+JSON.stringify(label)+';globalThis.actualRuns=[];globalThis.actualHeldDocument=document;globalThis.actualHeldObject=Object;</script></head><body>'+label+'</body></html>';
const foreignURL='data:text/html,'+encodeURIComponent(childSource('D'));
const opaqueSource='data:text/html,'+encodeURIComponent('<!doctype html><html><head><script>globalThis.actualMarker="O";globalThis.actualRuns=[];globalThis.actualHeldDocument=document;globalThis.actualHeldObject=Object;</script></head><body><iframe name=same srcdoc="'+childSource('I').replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe><iframe name=foreign src="'+foreignURL+'"></iframe></body></html>');
const cases=[['opaque-inherited-target','root',submit('same','void actualRuns.push("from-inherited-origin")')],['opaque-independent-target','root',submit('foreign','void actualRuns.push("unwanted-other-opaque")')]];
const snapshot=`JSON.stringify({url:location.href,origin:globalThis.origin,marker:globalThis.actualMarker??null,runs:globalThis.actualRuns??null,sameDocument:globalThis.actualHeldDocument===document,sameObject:globalThis.actualHeldObject===Object})`;
try{
 if(target==='native')service=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0,loadResources:['iframe','worker']});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);
 for(const[name,source,action]of cases){const row={name,source,action},offset=wire.length;let browserContextId;
  try{
   ({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId),start=client.events.length;
   await send('Page.enable');await send('Runtime.enable');await send('Page.setLifecycleEventsEnabled',{enabled:true});await send('Page.navigate',{url:opaqueSource});
   let tree,contexts;
   for(let i=0;i<100;i++){
    const ready=await send('Runtime.evaluate',{expression:"globalThis.actualMarker==='O'&&document.readyState==='complete'",returnByValue:true});tree=await send('Page.getFrameTree');const children=tree.frameTree?.childFrames??[];
    contexts=Object.fromEntries(['root','same','foreign'].map(kind=>{const frameId=kind==='root'?tree.frameTree.frame.id:children.find(child=>child.frame.url===(kind==='same'?'about:srcdoc':foreignURL))?.frame.id;return[kind,client.events.findLast(event=>event.sessionId===sessionId&&event.method==='Runtime.executionContextCreated'&&event.params.context.auxData?.frameId===frameId)?.params.context.id]}));
    const loaded=children.length===2&&children.every(child=>client.events.some(event=>event.sessionId===sessionId&&event.method==='Page.lifecycleEvent'&&event.params.name==='load'&&event.params.frameId===child.frame.id));
    row.readiness={ready,tree,contexts,loaded};if(ready.result?.value&&loaded&&['root','same','foreign'].every(kind=>contexts[kind]!==undefined))break;if(i===99)throw Error('Actual frame documents/context readiness deadline');await delay(5);
   }
   row.before={};for(const[kind,contextId]of Object.entries(contexts))row.before[kind]=await send('Runtime.evaluate',{expression:snapshot,returnByValue:true,contextId});
   row.immediate=await send('Runtime.evaluate',{expression:`(()=>{try{${action};return JSON.stringify({ok:true})}catch(error){return JSON.stringify({error:{name:error.name,message:error.message}})}})()`,returnByValue:true,contextId:contexts[source]});
   await delay(20);row.after={};for(const[kind,contextId]of Object.entries(contexts))try{row.after[kind]=await send('Runtime.evaluate',{expression:snapshot,returnByValue:true,contextId})}catch(error){row.after[kind]={protocolError:{name:error.name,message:error.message}}}
   row.tree=await send('Page.getFrameTree');row.events=client.events.slice(start).filter(event=>event.sessionId===sessionId&&['Runtime.exceptionThrown','Page.frameDetached','Runtime.executionContextDestroyed'].includes(event.method));
  }catch(error){row.failure={name:error.name,message:error.message,stack:error.stack}}finally{row.wire=wire.slice(offset);if(browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId})}catch(error){row.disposeFailure=error.message}observations.push(row)}
 }
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}finally{await client?.close();await service?.close();for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(out,JSON.stringify({target,originA:a,originB:b,helperSHA256:sha(await readFile(new URL(import.meta.url))),binarySHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:observations.length,failure}));}
