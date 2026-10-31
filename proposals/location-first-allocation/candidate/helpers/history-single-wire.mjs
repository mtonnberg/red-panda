import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';

const target=process.argv[2],out=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
let originA,originB,sequence=0,service,client,failure;const wire=[],observations=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const servers=['A','B'].map(label=>http.createServer(async(request,response)=>{
 let body='';for await(const part of request)body+=part;const token=++sequence;
 const record={label,url:request.url,method:request.method,body,headers:request.headers,token};wire.push(record);
 const send=(status,body,headers)=>{record.status=status;response.writeHead(status,headers);response.end(body)};
 if(request.url.startsWith('/probe')){
  const allowed=[originA,originB,'null','://'].includes(request.headers.origin)?request.headers.origin:null;
  return send(200,JSON.stringify({label,origin:request.headers.origin??null,referer:request.headers.referer??null,method:request.method,body,cookie:request.headers.cookie??null}),{'content-type':'application/json',...(allowed?{'access-control-allow-origin':allowed,'access-control-allow-credentials':'true','vary':'Origin'}:{})});
 }
 if(request.url.startsWith('/worker.js'))return send(200,`postMessage({location:location.href,origin:globalThis.origin,secure:globalThis.isSecureContext})`,{'content-type':'application/javascript'});
 const script=`globalThis.actualToken=${token};globalThis.actualLabel=${JSON.stringify(label)};try{localStorage.setItem('principal-marker',${JSON.stringify(label)})}catch(e){globalThis.seedError={name:e.name,message:e.message}}`;
 const children=request.url.startsWith('/root')?`<iframe name=same src="${originA}/frame-a"></iframe><iframe name=foreign src="${originB}/frame-b"></iframe>`:'';
 return send(200,'<!doctype html><title>'+label+'</title><script>'+script+'</script><body>'+children,{'content-type':'text/html','cache-control':'no-store','set-cookie':[label.toLowerCase()+'_public=owned-'+label+'; Path=/',label.toLowerCase()+'_hidden=hidden-'+label+'; Path=/; HttpOnly']});
}));
for(let index=0;index<servers.length;index++)servers[index].listen(0,index?'127.0.0.2':'127.0.0.1');await Promise.all(servers.map(server=>once(server,'listening')));originA='http://127.0.0.1:'+servers[0].address().port;originB='http://127.0.0.2:'+servers[1].address().port;
const opaqueSource='data:text/html,'+encodeURIComponent(`<!doctype html><script>globalThis.actualToken='actual-opaque-document';try{localStorage.setItem('principal-marker','O')}catch(e){globalThis.seedError={name:e.name,message:e.message}}</script><body><iframe name=same src="${originA}/frame-a"></iframe><iframe name=foreign src="${originB}/frame-b"></iframe>`);
const cases=[['http','push',originB+'/rewritten',false]];
const expression=(name,method,destination)=>`(async()=>{const before={url:location.href,origin:globalThis.origin,cookie:document.cookie};history.${method}State(null,'',${JSON.stringify(destination)});const rows=[];for(const[label,url]of[['A',${JSON.stringify(originA+'/probe')}],['B',${JSON.stringify(originB+'/probe')}]]){try{rows.push({label,response:await(await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},credentials:'include',body:${JSON.stringify(name)}+'-'+label})).json()})}catch(e){rows.push({label,error:{name:e.name,message:e.message}})}}return{before,after:{url:location.href,origin:globalThis.origin,cookie:document.cookie},rows}})()`;
try{
 if(target==='native')service=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});
 else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0,loadResources:['iframe','worker']});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);
 for(const[name,method,destination,opaque]of cases){const offset=wire.length,row={name,method,destination,opaque};let browserContextId;
  try{
   ({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(m,p={})=>client.send(m,p,sessionId);
   await send('Page.enable');await send('Runtime.enable');await send('Page.setLifecycleEventsEnabled',{enabled:true});await send('Page.navigate',{url:opaque?opaqueSource:originA+'/root?case='+encodeURIComponent(name)});
   for(let i=0;i<100;i++){
    const r=await send('Runtime.evaluate',{expression:"Boolean(globalThis.actualToken)&&document.readyState==='complete'",returnByValue:true});const tree=await send('Page.getFrameTree');
    const children=tree.frameTree?.childFrames??[],loaded=children.length===2&&children.every(child=>client.events.some(e=>e.sessionId===sessionId&&e.method==='Page.lifecycleEvent'&&e.params.name==='load'&&e.params.frameId===child.frame.id));
    if(r.result?.value&&loaded)break;if(i===99)throw Error('Actual document and iframe load lifecycle readiness deadline');await delay(10);
   }
   row.expression=expression(name,method,destination);row.result=await send('Runtime.evaluate',{expression:'(async()=>JSON.stringify(await '+row.expression+'))()',returnByValue:true,awaitPromise:true});row.tree=await send('Page.getFrameTree');
  }catch(e){row.failure={name:e.name,message:e.message,stack:e.stack}}finally{row.wire=wire.slice(offset);if(browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId})}catch(e){row.disposeFailure=e.message}observations.push(row)}
 }
}catch(e){failure={name:e.name,message:e.message,stack:e.stack}}finally{
 await client?.close();await service?.close();for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 const sha=x=>createHash('sha256').update(x).digest('hex');await writeFile(out,JSON.stringify({target,originA,originB,helperSHA256:sha(await readFile(new URL(import.meta.url))),binarySHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:observations.length,failure}));
}
