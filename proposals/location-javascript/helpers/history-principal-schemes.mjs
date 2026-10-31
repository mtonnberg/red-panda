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
  return send(200,JSON.stringify({label,origin:request.headers.origin??null,referer:request.headers.referer??null,method:request.method,body}),{'content-type':'application/json',...(allowed?{'access-control-allow-origin':allowed,'access-control-allow-credentials':'true','vary':'Origin'}:{})});
 }
 if(request.url.startsWith('/worker.js'))return send(200,`postMessage({location:location.href,origin:globalThis.origin,secure:globalThis.isSecureContext})`,{'content-type':'application/javascript'});
 const script=`globalThis.actualToken=${token};globalThis.actualLabel=${JSON.stringify(label)};try{localStorage.setItem('principal-marker',${JSON.stringify(label)})}catch(e){globalThis.seedError={name:e.name,message:e.message}}`;
 const children=request.url.startsWith('/root')?`<iframe name=same src="${originA}/frame-a"></iframe><iframe name=foreign src="${originB}/frame-b"></iframe>`:'';
 return send(200,'<!doctype html><title>'+label+'</title><script>'+script+'</script><body>'+children,{'content-type':'text/html','cache-control':'no-store'});
}));
for(const server of servers)server.listen(0,'127.0.0.1');await Promise.all(servers.map(server=>once(server,'listening')));originA='http://127.0.0.1:'+servers[0].address().port;originB='http://127.0.0.1:'+servers[1].address().port;
const opaqueSource='data:text/html,'+encodeURIComponent(`<!doctype html><script>globalThis.actualToken='actual-opaque-document';try{localStorage.setItem('principal-marker','O')}catch(e){globalThis.seedError={name:e.name,message:e.message}}</script><body><iframe name=same src="${originA}/frame-a"></iframe><iframe name=foreign src="${originB}/frame-b"></iframe>`);
const cases=[
 ['http-cross','push',originB+'/rewritten',false],
 ['credentials','replace',originB.replace('http://','http://u:p@')+'/credentials',false],
 ['https-url','push',originB.replace('http://','https://')+'/scheme-only',false],
 ['data-url','push','data:text/html,<script>globalThis.unwantedHistoryExecution=1</script>#owned',false],
 ['about-url','replace','about:blank',false],
 ['javascript-url','push','javascript:globalThis.unwantedHistoryExecution=1',false],
 ['file-url','replace','file:///tmp/history-control-do-not-read',false],
 ['malformed-url','push','http://[',false],
 ['opaque-to-http','push',originB+'/from-opaque',true],
 ['opaque-to-https','replace',originB.replace('http://','https://')+'/from-opaque',true],
];
const expression=(name,method,destination)=>`(async()=>{
 const attempt=fn=>{try{return{value:fn()}}catch(e){return{name:e.name,message:e.message,dom:e instanceof DOMException}}};
 const doc=document,O=Object,same=document.querySelector('iframe[name=same]').contentWindow,foreign=document.querySelector('iframe[name=foreign]').contentWindow;
 let held,heldSession;try{held=localStorage;heldSession=sessionStorage;heldSession.setItem('session-marker','owner')}catch{}
 const snapshot=()=>({url:location.href,locationOrigin:location.origin,windowOrigin:globalThis.origin,documentURL:document.URL,baseURI:document.baseURI,referrer:document.referrer,secure:globalThis.isSecureContext,sameDocument:doc===document,sameObject:O===Object,token:actualToken,local:attempt(()=>localStorage.getItem('principal-marker')),session:attempt(()=>sessionStorage.getItem('session-marker')),localSame:attempt(()=>localStorage===held),sessionSame:attempt(()=>sessionStorage===heldSession),sameFrame:attempt(()=>same.document.URL),foreignFrame:attempt(()=>foreign.document.URL),unwanted:globalThis.unwantedHistoryExecution});
 const before=snapshot();let rewriteError;try{history.${method}State({actual:${JSON.stringify(name)}},'',${JSON.stringify(destination)})}catch(e){rewriteError={name:e.name,message:e.message,dom:e instanceof DOMException}}
 const after=snapshot(),requests=[];for(const [label,url]of[['A',${JSON.stringify(originA+'/probe')}],['B',${JSON.stringify(originB+'/probe')}]]){
  try{requests.push({label,response:await(await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},body:${JSON.stringify(name)}+'-'+label,credentials:'include'})).json()})}catch(e){requests.push({label,error:{name:e.name,message:e.message}})}
 }
 const messaging=await new Promise(resolve=>{const token=${JSON.stringify(name)}+'-actual-message',timer=setTimeout(()=>resolve({deadline:true}),200);addEventListener('message',function received(e){if(e.data!==token)return;removeEventListener('message',received);clearTimeout(timer);resolve({origin:e.origin,sourceSelf:e.source===window,trusted:e.isTrusted})});postMessage(token,'*')});
 let blob;try{const value=new Blob([${JSON.stringify('owned-'+name)}],{type:'text/plain'}),url=URL.createObjectURL(value);try{blob={origin:new URL(url).origin,text:await(await fetch(url)).text()}}finally{URL.revokeObjectURL(url)}}catch(e){blob={name:e.name,message:e.message}}
 const permissions=[];for(const name of['geolocation','notifications']){if(typeof navigator.permissions?.query!=='function'){permissions.push({name,exposed:false});continue}try{const status=await navigator.permissions.query({name});permissions.push({name,state:status.state})}catch(e){permissions.push({name,error:e.name,message:e.message})}}
 let cookies;try{cookies=typeof cookieStore==='undefined'?{exposed:false}:{value:await cookieStore.getAll()}}catch(e){cookies={name:e.name,message:e.message}}
 const entry=navigation.currentEntry;
 return{before,rewriteError,after,requests,messaging,blob,permissions,cookies,entry:{url:entry.url,id:entry.id,key:entry.key,index:entry.index,sameDocument:entry.sameDocument,state:history.state}};
})()`;
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
