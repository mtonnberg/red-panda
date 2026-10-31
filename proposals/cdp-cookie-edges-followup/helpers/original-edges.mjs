import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],output=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const cookieURL='http://127.0.0.1/',httpsURL='https://127.0.0.1/';let service,client,browserContextId,failure;const observations=[];
try{
 if(target==='native')service=await startReference(binary);else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}client=await connect(service.endpoint);({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId,{timeout:2500});await send('Network.enable');
 const capture=async(method,params)=>{try{return{result:await send(method,params)}}catch(error){return{error:{name:error.name,message:error.message,code:error.code,data:error.data}}}};
 const base={name:'actual',value:'actual',url:cookieURL,sameSite:'None',secure:false};
 for(const[name,params]of [['null-name',{...base,name:null}],['number-name',{...base,name:7}],['null-value',{...base,value:null}],['number-value',{...base,value:7}],['null-site',{...base,sameSite:null}],['number-site',{...base,sameSite:7}],['null-url',{...base,url:null}],['missing-url',{...base,url:undefined}],['domain-only',{...base,url:undefined,domain:'127.0.0.1'}],['empty-name',{...base,name:''}],['invalid-expiry',{...base,expires:-2}],['null-expiry',{...base,expires:null}]])observations.push({stage:'single',name,params,...await capture('Network.setCookie',params)});
 const invalids=[['missing-field',{name:'missing',url:cookieURL}],['wrong-type',{...base,secure:0}],['sanitize',{...base,name:'bad;name'}],['bad-url',{...base,url:'http://[/'}]];
 for(const[name,invalid]of invalids){const valid={name:'kept_'+name,value:'actual',url:cookieURL,sameSite:'None',secure:true},params={cookies:[valid,invalid]},row={stage:'batch-order',name,params,...await capture('Network.setCookies',params)};row.cookies=await send('Network.getCookies',{urls:[httpsURL]});observations.push(row)}
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}
finally{if(client&&browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:1000})}catch{}await client?.close();await service?.close();const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(output,JSON.stringify({target,URLInputsAreCookieMetadataOnly:true,helperSHA256:sha(await readFile(new URL(import.meta.url))),nativeSHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,rows:observations.length,failure}))}
