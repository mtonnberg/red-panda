import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],output=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
let service,client,browserContextId,failure;const observations=[];
try{
 if(target==='native')service=await startReference(binary);else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}client=await connect(service.endpoint);({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId,{timeout:2500});await send('Network.enable');
 const capture=async(method,params)=>{try{return{result:await send(method,params)}}catch(error){return{error:{name:error.name,message:error.message,code:error.code,data:error.data}}}};
 for(const[urlKind,url]of[['empty',''],['null',null],['omitted',undefined]])for(const nameKind of['normal','empty']){
  const name=nameKind==='empty'?'':'domain_'+urlKind,params={name,value:'actual_'+urlKind,domain:'127.0.0.1',path:'/',sameSite:'None',secure:true,...(urlKind==='omitted'?{}:{url})},row={stage:'domain-fallback',urlKind,nameKind,params,...await capture('Network.setCookie',params)};
  row.cookies=(await send('Network.getCookies',{urls:['https://127.0.0.1/']})).cookies.filter(cookie=>cookie.name===name);observations.push(row);
 }
 const valid={name:'array_atomic',value:'must-not-store',url:'http://127.0.0.1/',sameSite:'None',secure:true},row={stage:'array-cookie-member',params:{cookies:[valid,[]]},...await capture('Network.setCookies',{cookies:[valid,[]]})};row.cookies=(await send('Network.getCookies',{urls:['https://127.0.0.1/']})).cookies.filter(cookie=>cookie.name===valid.name);observations.push(row);
 observations.push({stage:'array-command-params',method:'Network.setCookie',params:[],...await capture('Network.setCookie',[])});
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}
finally{if(client&&browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:1000})}catch{}await client?.close();await service?.close();const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(output,JSON.stringify({target,URLInputsAreCookieMetadataOnly:true,helperSHA256:sha(await readFile(new URL(import.meta.url))),nativeSHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,rows:observations.length,failure}))}
