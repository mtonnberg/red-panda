// Independent metadata-only CDP wire calibration; no source fixture or HTTP route.
import {readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
import{startReference}from'../scripts/reference-server.mjs';import{connect}from'../test/cdp-client.js';
const target=process.argv[2],output=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),rows=[],wire=[],contexts=[],targets=[];let service,client,failure;
const errorShape=error=>Object.fromEntries(Object.getOwnPropertyNames(error).map(key=>[key,error[key]]));
async function request(label,method,params={},sessionId){const row={label,method,params,...(sessionId?{sessionId}:{})};try{row.result=await client.send(method,params,sessionId,{timeout:2500})}catch(error){row.error=errorShape(error)}rows.push(row);return row}
async function getters(scope,sessionId,browserContextId){
 if(sessionId){for(const[label,urls]of[['secure-scope',['https://127.0.0.1/scope/page']],['http-scope',['http://127.0.0.1/scope/page']],['other-host',['https://127.0.0.2/scope/page']]])await request(scope+':Network.getCookies:'+label,'Network.getCookies',{urls},sessionId);await request(scope+':Network.getAllCookies','Network.getAllCookies',{},sessionId)}
 else rows.push({label:scope+':Network-getters-not-attempted',classification:'Target/session setup failed; no fabricated empty response'});
 await request(scope+':Storage.getCookies:default','Storage.getCookies');
 if(browserContextId)await request(scope+':Storage.getCookies:explicit','Storage.getCookies',{browserContextId});
}
async function seed(scope,sessionId,browserContextId){
 const cookies=[{name:scope+'_session',value:'actual session',url:'https://127.0.0.1/',path:'/',sameSite:'Lax',secure:false},{name:scope+'_persistent',value:'actual persistent',url:'https://127.0.0.1/scope/',domain:'127.0.0.1',path:'/scope',sameSite:'Strict',secure:true,httpOnly:true,expires:1900000000}];
 await request(scope+':Storage.setCookies:actual-seed','Storage.setCookies',{cookies,...(browserContextId?{browserContextId}:{})});
 if(sessionId)for(const priority of ['Low','High'])await request(scope+':Network.setCookie:priority-'+priority,'Network.setCookie',{name:scope+'_priority_'+priority,value:'actual '+priority,url:'https://127.0.0.1/',sameSite:'None',secure:true,priority},sessionId);
 else rows.push({label:scope+':priority-setters-not-attempted',classification:'Target/session setup failed'});
}
async function targetSession(scope,browserContextId){
 const created=await request(scope+':Target.createTarget','Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}:{})});if(!created.result?.targetId)return;
 const targetId=created.result.targetId;targets.push(targetId);const attached=await request(scope+':Target.attachToTarget','Target.attachToTarget',{targetId,flatten:true});const sessionId=attached.result?.sessionId;if(sessionId)await request(scope+':Network.enable','Network.enable',{},sessionId);return sessionId;
}
try{
 if(target==='native')service=await startReference(binary);else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);const send=client.socket.send;client.socket.send=function(data,...args){wire.push({direction:'sent',text:typeof data==='string'?data:data.toString()});return Reflect.apply(send,this,[data,...args])};client.socket.on('message',raw=>wire.push({direction:'received',text:raw.toString()}));
 await request('default:Storage.getCookies:before-seed','Storage.getCookies');
 const defaultSession=await targetSession('default');await seed('default',defaultSession);await getters('default',defaultSession);
 // Close the actual default target before creating another Native target; keep jar state.
 for(const targetId of targets.splice(0))await request('default:Target.closeTarget','Target.closeTarget',{targetId});
 const context=await request('explicit:Target.createBrowserContext','Target.createBrowserContext');const browserContextId=context.result?.browserContextId;
 if(browserContextId){contexts.push(browserContextId);const sessionId=await targetSession('explicit',browserContextId);await seed('explicit',sessionId,browserContextId);await getters('explicit',sessionId,browserContextId)}else rows.push({label:'explicit:context-setup-failed',classification:'Actual Native/candidate context creation failure; explicit cookies were not fabricated or attempted with another context'});
}catch(error){failure=errorShape(error)}
finally{
 for(const targetId of targets)if(client)await request('cleanup:Target.closeTarget','Target.closeTarget',{targetId});
 for(const browserContextId of contexts)if(client)await request('cleanup:Target.disposeBrowserContext','Target.disposeBrowserContext',{browserContextId});
 await client?.close();await service?.close();await writeFile(output,JSON.stringify({target,nativeSHA256:sha(await readFile(binary)),helperSHA256:sha(await readFile(new URL(import.meta.url))),rows,wire,failure,boundary:'Full unfiltered getter results and actual raw CDP frames. URL values are real cookie metadata; no HTTP server/request or source fixture. Low/High setters measure acceptance and exposed response fields only, not hidden eviction priority. Default/explicit context setup failures remain distinct. No production changes or field deletion to make equal.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,rows:rows.length,failure}));
}
