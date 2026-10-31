import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],output=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const url='http://127.0.0.1/',readURL='https://127.0.0.1/';let service,client,browserContextId,failure;const observations=[];
try{
 if(target==='native')service=await startReference(binary);else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}client=await connect(service.endpoint);({browserContextId}=await client.send('Target.createBrowserContext'));const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId,{timeout:2500});await send('Network.enable');
 const capture=async(method,params,root=false)=>{try{return{result:await(root?client.send(method,params,undefined,{timeout:2500}):send(method,params))}}catch(error){return{error:{name:error.name,message:error.message,code:error.code,data:error.data}}}};
 const policies=[['none-secure',{sameSite:'None',secure:true}],['unspecified',{secure:false}],['none-insecure',{sameSite:'None',secure:false}]];
 for(const[policy,fields]of policies.slice(0,2))for(const[label,expires]of[['minus-two',-2],['minus-one',-1],['negative-fraction',-.5],['negative-zero',-0],['zero',0],['null',null]]){
  const name='expiry_'+policy+'_'+label,base={name,value:'keep',url,...fields},row={stage:'expiry',policy,label,negativeZero:Object.is(expires,-0),wireExpires:JSON.parse(JSON.stringify(expires))};row.seed=await capture('Network.setCookie',base);row.attempt=await capture('Network.setCookie',{...base,value:'changed',expires});row.cookies=(await send('Network.getCookies',{urls:[readURL]})).cookies.filter(cookie=>cookie.name===name);observations.push(row);
 }
 for(const[policy,fields]of policies){const row={stage:'empty-name',policy,params:{name:'',value:'actual',url,...fields}};row.attempt=await capture('Network.setCookie',row.params);row.cookies=(await send('Network.getCookies',{urls:[readURL]})).cookies.filter(cookie=>cookie.name==='');observations.push(row)}
 for(const[name,params]of[['empty-url',{name:'empty_url',value:'actual',url:'',sameSite:'None',secure:false}],['missing-url-bad-name',{name:'bad;name',value:'actual',sameSite:'None',secure:false}],['bad-value',{name:'bad_value',value:'bad;value',url,sameSite:'None',secure:false}]])observations.push({stage:'ordering',name,params,...await capture('Network.setCookie',params)});
 for(const method of['Network.setCookies','Storage.setCookies'])for(const[name,invalid]of[['missing-url',{name:'missing_address',value:'actual',sameSite:'None',secure:false}],['sanitize',{name:'bad;name',value:'bad',url,sameSite:'None',secure:false}]]){
  const valid={name:'kept_'+method[0]+'_'+name,value:'actual',url,sameSite:'None',secure:true},params={cookies:[valid,invalid],...(method==='Storage.setCookies'?{browserContextId}:{})},row={stage:'batch-staging',method,name,params,...await capture(method,params,method==='Storage.setCookies')};row.cookies=(await send('Network.getCookies',{urls:[readURL]})).cookies.filter(cookie=>cookie.name===valid.name);observations.push(row);
 }
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}
finally{if(client&&browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:1000})}catch{}await client?.close();await service?.close();const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(output,JSON.stringify({target,URLInputsAreCookieMetadataOnly:true,helperSHA256:sha(await readFile(new URL(import.meta.url))),nativeSHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,rows:observations.length,failure}))}
