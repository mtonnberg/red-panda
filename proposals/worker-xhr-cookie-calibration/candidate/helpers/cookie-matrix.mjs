import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],output=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const cookieDefinitions=[['plain',undefined,false],['lax','Lax',false],['strict','Strict',false],['none','None',false],['none_secure','None',true]];
const seedCookies=cookieDefinitions.map(([name,sameSite,secure])=>'http_'+name+'=actual; HttpOnly; Path=/'+(sameSite?'; SameSite='+sameSite:'')+(secure?'; Secure':''));
const workerSource=`onmessage=async event=>{const results=[];for(const sync of[false,true])for(const credentials of[false,true]){const x=new XMLHttpRequest(),events=[];for(const type of['load','error','timeout','abort','loadend'])x.addEventListener(type,event=>events.push({type,trusted:event.isTrusted}));try{x.open('PUT',event.data.url,!sync);x.withCredentials=credentials;x.responseType='json';x.setRequestHeader('x-real','actual');const done=sync?null:new Promise(resolve=>x.onloadend=resolve);x.send(new Uint8Array([0,128,255]));if(done)await done;results.push({sync,credentials,status:x.status,response:x.response,events})}catch(error){results.push({sync,credentials,error:{name:error.name,message:error.message},status:x.status,events})}}postMessage({results})};postMessage({ready:true});`;
const documentSource='<!doctype html><title>Actual worker cookie matrix</title><body>Actual worker cookie document<script>globalThis.actualReady=true</script>';
let creator,service,client,failure;const wire=[],observations=[];
const server=http.createServer(async(request,response)=>{
 const chunks=[];for await(const chunk of request)chunks.push(chunk);const bytes=[...Buffer.concat(chunks)],record={url:request.url,method:request.method,headers:request.headers,bytes};wire.push(record);
 if(request.url.startsWith('/worker.js')){response.writeHead(200,{'content-type':'application/javascript'});response.end(workerSource);return}
 if(request.url.startsWith('/cors')){const headers={'content-type':'application/json','access-control-allow-origin':request.headers.origin??'null','access-control-allow-credentials':'true','access-control-allow-methods':'PUT','access-control-allow-headers':'x-real','cache-control':'no-store'};response.writeHead(request.method==='OPTIONS'?204:200,headers);response.end(request.method==='OPTIONS'?'':JSON.stringify({cookie:request.headers.cookie??'',origin:request.headers.origin,method:request.method,bytes}));return}
 response.writeHead(200,{'content-type':'text/html','cache-control':'no-store',...(request.url.startsWith('/seed')?{'set-cookie':seedCookies}:{})});response.end(documentSource);
});server.listen(0,'0.0.0.0');await once(server,'listening');const port=server.address().port;creator='http://127.0.0.1:'+port;
try{
 if(target==='native')service=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0,loadResources:['iframe','worker']});service.endpoint='ws://127.0.0.1:'+service.port+'/'}client=await connect(service.endpoint);
 for(const host of['0.0.0.0','127.0.0.2','127.0.0.1']){
  let browserContextId;const destination='http://'+host+':'+port,row={host,creator,destination},offset=wire.length;
  try{
   ({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId,{timeout:7000});
   await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
   const navigate=async url=>{const result=await send('Page.navigate',{url});if(result.errorText)throw Error(result.errorText);for(let index=0;index<100;index++){const ready=await send('Runtime.evaluate',{expression:'globalThis.actualReady===true&&document.readyState==="complete"&&location.href==='+JSON.stringify(url),returnByValue:true});if(ready.result?.value)return;await new Promise(resolve=>setTimeout(resolve,5))}throw Error('Actual cookie document readiness missing')};
   await navigate(destination+'/seed');row.seedCommands=[];
   for(const[name,sameSite,secure]of cookieDefinitions){const params={name:'cdp_'+name,value:'actual',url:destination+'/',path:'/',httpOnly:true,secure,...(sameSite?{sameSite}:{})};try{row.seedCommands.push({params,result:await send('Network.setCookie',params)})}catch(error){row.seedCommands.push({params,error:{name:error.name,message:error.message}})}}
   try{row.storedBefore=await send('Network.getCookies',{urls:[destination+'/cors']})}catch(error){row.storedBeforeError={name:error.name,message:error.message}}
   await navigate(creator+'/creator');
   const expression=`(async()=>{const worker=new Worker('/worker.js');try{const startup=await new Promise(resolve=>{const timer=setTimeout(()=>resolve({deadline:true}),3000);worker.onmessage=event=>{if(event.data?.ready){clearTimeout(timer);resolve({ready:true})}};worker.onerror=event=>{event.preventDefault();clearTimeout(timer);resolve({error:event.message})}});if(!startup.ready)return{startup};const actual=await new Promise(resolve=>{const timer=setTimeout(()=>resolve({deadline:true}),4000);worker.onmessage=event=>{if(event.data?.results){clearTimeout(timer);resolve(event.data)}};worker.postMessage({url:${JSON.stringify(destination+'/cors?report=1')}})});return{startup,actual}}finally{worker.terminate()}})()`;
   row.result=await send('Runtime.evaluate',{expression:'(async()=>JSON.stringify(await '+expression+'))()',returnByValue:true,awaitPromise:true});
   try{row.storedAfter=await send('Network.getCookies',{urls:[destination+'/cors']})}catch(error){row.storedAfterError={name:error.name,message:error.message}}
  }catch(error){row.failure={name:error.name,message:error.message,stack:error.stack}}
  finally{row.wire=wire.slice(offset);if(browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:1000})}catch(error){row.disposeFailure=error.message}observations.push(row)}
 }
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}
finally{await client?.close();await service?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const sha=value=>createHash('sha256').update(value).digest('hex');await writeFile(output,JSON.stringify({target,creator,seedCookies,workerSource,workerSourceSHA256:sha(workerSource),documentSourceSHA256:sha(documentSource),helperSHA256:sha(await readFile(new URL(import.meta.url))),nativeSHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,rows:observations.length,failure}))}
