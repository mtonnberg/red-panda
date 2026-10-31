import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const profile=process.argv[2],target=process.argv[3],output=process.argv[4],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
let service,client,server,origin,failure;const rows=[],httpWire=[],contexts=[];
const errorFields=error=>({name:error.name,message:error.message,code:error.code,data:error.data});
try{
 if(profile==='clear-own'){
  server=http.createServer((request,response)=>{httpWire.push({url:request.url,headers:request.headers});response.writeHead(200,{'content-type':request.url==='/echo-cookie'?'text/plain':'text/html','cache-control':'no-store'});response.end(request.url==='/echo-cookie'?request.headers.cookie??'':'<!doctype html><body>Actual cookie action document<script>globalThis.actualReady=true</script>')});server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 }
 if(target==='native')service=await startReference(binary);else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}client=await connect(service.endpoint);
 const invoke=async(label,method,params={},sessionId)=>{const row={label,method,params,scope:sessionId?'attached':'root'};try{row.result=await client.send(method,params,sessionId,{timeout:2500})}catch(error){row.error=errorFields(error)}rows.push(row);return row;};
 const targetSession=async browserContextId=>{const{targetId}=await client.send('Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}:{})}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Network.enable',{},sessionId,{timeout:2500});return{targetId,sessionId};};
 const seed=(name,value,url='https://127.0.0.1/',extra={})=>({name,value,url,path:'/',sameSite:'Lax',...extra});
 if(profile==='clear-own'){
  const{browserContextId}=await client.send('Target.createBrowserContext');contexts.push(browserContextId);const{sessionId}=await targetSession(browserContextId);await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Page.navigate',{url:origin+'/owner'},sessionId,{timeout:2500});
  for(let index=0;index<100;index++){const ready=await client.send('Runtime.evaluate',{expression:'globalThis.actualReady===true&&document.readyState==="complete"',returnByValue:true},sessionId,{timeout:2500});if(ready.result?.value)break;if(index===99)throw Error('Actual cookie action document readiness missing');await new Promise(resolve=>setTimeout(resolve,5))}
  await client.send('Runtime.evaluate',{expression:'globalThis.actualHeldDocument=document;globalThis.actualHeldStore=typeof cookieStore==="object"?cookieStore:null;globalThis.actualChanges=[];if(actualHeldStore)actualHeldStore.addEventListener("change",event=>actualChanges.push({trusted:event.isTrusted,changed:Array.from(event.changed??[],item=>({name:item.name,value:item.value})),deleted:Array.from(event.deleted??[],item=>({name:item.name,value:item.value}))}))',returnByValue:true},sessionId,{timeout:2500});
  const cookies=[seed('pick','owner',origin+'/'),seed('untouched','owner-sentinel',origin+'/'),seed('pick','child-root','https://child.example.com/'),seed('pick','child-alpha','https://child.example.com/alpha',{path:'/alpha'}),seed('pick','child-deep','https://child.example.com/alpha/deep',{path:'/alpha/deep'}),seed('pick','parent-domain','https://child.example.com/',{domain:'.example.com'}),seed('pick','sibling','https://sibling.example.com/'),seed('pick','other','https://other.example.net/'),seed('untouched','child-sentinel','https://child.example.com/alpha',{path:'/alpha'}),seed('','nameless','https://child.example.com/'),seed('ghost','already-expired','https://child.example.com/',{expires:0})];
  const cases=[['storage-clear',{}],['network-clear',{}]];
  for(const[label,params]of cases){
   await client.send('Network.clearBrowserCookies',{},sessionId,{timeout:2500});await client.send('Network.setCookies',{cookies},sessionId,{timeout:2500});await client.send('Runtime.evaluate',{expression:'new Promise(resolve=>setTimeout(()=>{actualChanges=[];resolve(true)},0))',awaitPromise:true,returnByValue:true},sessionId,{timeout:2500});
   const before=await client.send('Network.getAllCookies',{},sessionId,{timeout:2500}),row=await invoke(label,label==='storage-clear'?'Storage.clearCookies':'Network.clearBrowserCookies',params,sessionId);row.before=before;row.after=await client.send('Network.getAllCookies',{},sessionId,{timeout:2500});row.document=await client.send('Runtime.evaluate',{expression:'(async()=>{await new Promise(resolve=>setTimeout(resolve,0));return JSON.stringify({sameDocument:document===actualHeldDocument,sameStore:(typeof cookieStore==="object"?cookieStore:null)===actualHeldStore,changes:actualChanges,cookieHeader:await(await fetch("/echo-cookie",{credentials:"include"})).text(),url:document.URL})})()',awaitPromise:true,returnByValue:true},sessionId,{timeout:2500});
  }
 }else if(profile==='scope-explicit'||profile==='scope-default'){
  for(const[label,method,params]of[['unloaded-clear','Storage.clearCookies',{}],['unloaded-clear-id','Storage.clearCookies',{browserContextId:'actual-unknown'}],['unloaded-delete','Network.deleteCookies',{name:'missing'}],['unloaded-delete-schema','Network.deleteCookies',{}]])await invoke(label,method,params);
  let browserContextId;if(profile==='scope-explicit'){({browserContextId}=await client.send('Target.createBrowserContext'));contexts.push(browserContextId);await invoke('created-not-loaded-clear','Storage.clearCookies',{browserContextId});}
  const{sessionId,targetId}=await targetSession(browserContextId);
  const read=async()=>client.send('Storage.getCookies',{},sessionId,{timeout:2500});
  const action=async(label,method,params,attached)=>{const before=await read(),row=await invoke(label,method,params,attached?sessionId:undefined);row.before=before;row.after=await read();return row;};
  await action('attached-write-implicit','Storage.setCookies',{cookies:[seed('attached_implicit','actual')]},true);
  await action('attached-write-null-id','Storage.setCookies',{cookies:[seed('attached_null','actual')],browserContextId:null},true);
  if(browserContextId)await action('attached-write-exact-id','Storage.setCookies',{cookies:[seed('attached_exact','actual')],browserContextId},true);
  await action('attached-write-unknown','Storage.setCookies',{cookies:[seed('must_not_write','invalid')],browserContextId:'actual-unknown'},true);
  await action('root-delete-loaded','Network.deleteCookies',{name:'attached_implicit'},false);
  await action('attached-clear-unknown','Storage.clearCookies',{browserContextId:'actual-unknown'},true);
  await action('attached-clear-null-id','Storage.clearCookies',{browserContextId:null},true);
  await action('attached-write-reseed','Storage.setCookies',{cookies:[seed('reseed_b','actual','https://127.0.0.2/'),seed('reseed_a','actual')]},true);
  await action('attached-clear-implicit','Storage.clearCookies',{},true);
  await action('root-write-implicit','Storage.setCookies',{cookies:[seed('root_implicit','actual')]},false);
  await action('root-clear-implicit','Storage.clearCookies',{},false);
  if(browserContextId){await action('root-write-exact-id','Storage.setCookies',{cookies:[seed('exact_owner','actual')],browserContextId},false);await action('root-clear-exact-id','Storage.clearCookies',{browserContextId},false);await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:2500});contexts.splice(contexts.indexOf(browserContextId),1);await invoke('disposed-root-clear','Storage.clearCookies',{});await invoke('disposed-attached-write','Storage.setCookies',{cookies:[seed('retired','must-not-write')]},sessionId);}else{await client.send('Target.closeTarget',{targetId},undefined,{timeout:2500});await invoke('closed-default-clear','Storage.clearCookies',{});}
 }else throw Error('Unknown owned probe profile');
}catch(error){failure=errorFields(error)}
finally{if(client)for(const browserContextId of contexts)try{await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:1000})}catch{}await client?.close();await service?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(output,JSON.stringify({profile,target,origin,helperSHA256:sha(await readFile(new URL(import.meta.url))),nativeSHA256:sha(await readFile(binary)),rows,httpWire,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({profile,target,rows:rows.length,failure}))}
