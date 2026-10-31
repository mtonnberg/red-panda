// Static preparation only until an explicit Parent runtime lease.
import http from 'node:http';import {once} from 'node:events';import {openSync,closeSync,writeSync} from 'node:fs';import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {connect} from './driver-wire.mjs';import {ownedReference} from './owned-service.mjs';import {bootstrap,query,locate,watch} from './page-programs.mjs';
const mode=process.argv[2],output=resolve(process.argv[3]),root=resolve(new URL('../candidate',import.meta.url).pathname),binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',sha=b=>createHash('sha256').update(b).digest('hex');
const wireFD=openSync(output+'.wire.jsonl','wx'),progressFD=openSync(output+'.progress.jsonl','wx'),rows=[],requests=[],clients=[],contexts=[];let service,failure;const servers=[];
const emit=value=>writeSync(progressFD,JSON.stringify({time:Date.now(),...value})+'\n');
const before=JSON.parse(await readFile(new URL('./candidate-run-manifest.json',import.meta.url),'utf8'));
async function guard(){for(const[path,digest]of Object.entries(before.files))if(sha(await readFile(resolve(root,path)))!==digest)throw Error('Owned base source changed: '+path)}
await guard();
async function startOrigin(label){const server=http.createServer((request,response)=>{requests.push({origin:label,path:request.url,time:Date.now()});response.setHeader('content-type','text/html');response.end('<!doctype html><body><p id=owned>'+label+'</p>')});servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port}
async function raw(client,method,params,sessionId){try{return{result:await client.send(method,params,sessionId)}}catch(error){if(error.transportFailure)throw error;return{error:{code:error.code,message:error.message,name:error.name}}}}
async function evaluate(target,expression){const raw=await target.client.send('Runtime.evaluate',{expression:'(async()=>JSON.stringify(await('+expression+')))()',awaitPromise:true,returnByValue:true,timeout:1000},target.sessionId);if(raw.exceptionDetails)throw Object.assign(new Error('Actual page exception in owned control'),{exceptionDetails:raw.exceptionDetails,expression});if(typeof raw.result?.value!=='string')throw Object.assign(new Error('Actual owned control did not return its JSON result'),{raw});return JSON.parse(raw.result.value)}
async function prepareTarget(client,url,label){const{browserContextId}=await client.send('Target.createBrowserContext',{});const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true}),target={client,browserContextId,targetId,sessionId,label};contexts.push(target);await client.send('Runtime.enable',{},sessionId);await client.send('Page.enable',{},sessionId);await navigate(target,url);return target}
async function navigate(target,url){await target.client.send('Page.navigate',{url},target.sessionId);const deadline=Date.now()+5000;for(;;){const state=await evaluate(target,'({complete:document.readyState,marker:document.getElementById("owned")?.textContent,url:location.href})');if(state.complete==='complete'&&state.marker&&state.url===url)break;if(Date.now()>=deadline)throw Object.assign(new Error('Owned actual document complete/URL/marker barrier failed'),{state,url});await new Promise(resolve=>setTimeout(resolve,20))}await evaluate(target,bootstrap)}
async function dispose(target){if(target.disposed)return;target.disposed=true;await target.client.send('Target.disposeBrowserContext',{browserContextId:target.browserContextId})}
async function control(name,body){emit({phase:'start',index:rows.length+1,name});const value=await body();rows.push({name,value});emit({phase:'complete',index:rows.length,name,value});console.log(JSON.stringify({index:rows.length,name,value}))}
try{
 const originA=await startOrigin('owned-positive-A'),originB=await startOrigin('owned-positive-B');
 if(mode==='native')service=await ownedReference(binary);else{const{serve}=await import(pathToFileURL(resolve(root,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 const a=await connect(service.endpoint,{fd:wireFD,label:'positive-A'});clients.push(a);const targetA=await prepareTarget(a,originA+'/positive-A','positive-A');
 const ca=(method,params)=>raw(a,method,params,targetA.sessionId),qa=()=>evaluate(targetA,query),ga=()=>evaluate(targetA,locate);
 await control('positive-A-grant-and-configured-position',async()=>({grant:await ca('Browser.grantPermissions',{permissions:['geolocation']}),set:await ca('Emulation.setGeolocationOverride',{latitude:18,longitude:19,accuracy:20}),states:await qa(),callback:await ga()}));
 const b=await connect(service.endpoint,{fd:wireFD,label:'positive-B'});clients.push(b);let targetB=await prepareTarget(b,originB+'/positive-B','positive-B');
 const cb=(method,params)=>raw(b,method,params,targetB.sessionId),qb=()=>evaluate(targetB,query),gb=()=>evaluate(targetB,locate);
 await control('fresh-B-versus-positively-granted-A-and-B-without-override',async()=>({freshB:{states:await qb(),callback:await gb()},grantB:await cb('Browser.grantPermissions',{permissions:['geolocation']}),grantedBWithoutOverride:await gb(),A:{states:await qa(),callback:await ga()}}));
 await control('distinct-B-override-and-A-denial-are-isolated',async()=>({setB:await cb('Emulation.setGeolocationOverride',{latitude:48,longitude:49,accuracy:50}),B:await gb(),A:await ga(),denyA:await ca('Browser.setPermission',{permission:{name:'geolocation'},setting:'denied'}),deniedA:await ga(),stillGrantedB:{states:await qb(),callback:await gb()},restoreA:await ca('Browser.grantPermissions',{permissions:['geolocation']})}));
 await control('B-context-disposal-clears-only-its-permissions-retains-only-its-override',async()=>{const old={context:targetB.browserContextId,target:targetB.targetId};await dispose(targetB);targetB=await prepareTarget(b,originB+'/positive-B-replacement','positive-B-replacement');return{old,current:{context:targetB.browserContextId,target:targetB.targetId},freshB:{states:await qb(),callback:await gb()},grantB:await cb('Browser.grantPermissions',{permissions:['geolocation']}),regrantedB:await gb(),stillGrantedA:{states:await qa(),callback:await ga()}}});
 const scalarProbe=`(async()=>await new Promise(resolve=>{
  navigator.geolocation.getCurrentPosition(
   function(p){const value=p.coords.latitude;resolve({kind:'success',callbackThis:this===globalThis,position:p instanceof GeolocationPosition,coordinates:p.coords instanceof GeolocationCoordinates,numericType:typeof value,string:String(value),finite:Number.isFinite(value),nan:Number.isNaN(value),negativeZero:Object.is(value,-0),coords:p.coords.toJSON(),timestamp:p.timestamp})},
   function(e){resolve({kind:'error',callbackThis:this===globalThis,code:e.code,message:e.message,instance:e instanceof GeolocationPositionError})}
  );
 }))()`;
 const cases=['1.25','-0','1e2','+1',' 1 ','','0x10','Infinity','-Infinity','NaN','abc','1_0'];
 for(let index=0;index<cases.length;index++)await control('float-string-'+index,async()=>({input:cases[index],reset:await ca('Emulation.setGeolocationOverride',{latitude:31,longitude:32,accuracy:33}),command:await ca('Emulation.setGeolocationOverride',{latitude:cases[index],longitude:2,accuracy:3}),actualCallback:await evaluate(targetA,scalarProbe)}));
 if(rows.length!==16)throw Error('Incomplete ownership/float profile: '+rows.length);

}catch(error){failure={name:error.name,message:error.message,stack:error.stack,transportFailure:!!error.transportFailure,exceptionDetails:error.exceptionDetails,raw:error.raw};emit({phase:'failed',failure});process.exitCode=1}
finally{
 for(const target of contexts.reverse())if(!target.disposed&&!failure?.transportFailure)try{await dispose(target)}catch(error){emit({phase:'cleanup-context-error',message:error.message})}
 for(const client of clients.reverse())try{await client.close()}catch(error){emit({phase:'cleanup-client-error',message:error.message})}
 try{await service?.close()}catch(error){emit({phase:'cleanup-service-error',message:error.message})}
 for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 try{await guard()}catch(error){failure={name:'SourceChanged',message:error.message,previous:failure};process.exitCode=1}
 const report={mode,root,node:process.version,v8:process.versions.v8,rows,expectedRows:16,requests,failure,beforeManifestSHA256:sha(await readFile(new URL('./candidate-run-manifest.json',import.meta.url))),driverSHA256:sha(await readFile(new URL(import.meta.url))),programsSHA256:sha(await readFile(new URL('./page-programs.mjs',import.meta.url))),nativeSHA256:sha(await readFile(binary)),nativeExit:service?.process?{pid:service.process.pid,code:service.process.exitCode,signal:service.process.signalCode,stderr:service.stderr()}:null};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});emit({phase:'closed',rows:rows.length,failure});closeSync(wireFD);closeSync(progressFD);console.log(JSON.stringify({complete:!failure,rows:rows.length,output}));
}
