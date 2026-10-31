import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '/workspace/shared/registration455-adapted-plan-20261031/candidate/scripts/reference-server.mjs';
import {connect} from '/workspace/shared/registration455-adapted-plan-20261031/candidate/test/cdp-client.js';
const profile=process.argv[2];
if(!['native','candidate'].includes(profile))throw Error('Specify native or candidate');
const binary=profile==='native'?'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux':'/workspace/shared/domimplementation-readiness-recovery/red-panda-launcher';
const source=await readFile(new URL('control.js',import.meta.url),'utf8'),requests=[];
const out=new URL('../runs/'+(process.env.PROBE_EPOCH??'initial')+'/',import.meta.url);await mkdir(out,{recursive:true});
const record={profile,binary,binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),source,sourceSHA256:createHash('sha256').update(source).digest('hex'),args:['--ws-max-concurrent','50','--load-resources','iframe','--load-resources','worker'],rpcBudgetMs:3000,loadBudgetMs:2000,requests,stages:[],status:'started'};
const checkpoint=()=>writeFile(new URL(profile+'.json',out),JSON.stringify(record,null,2)+'\n');
await writeFile(new URL(profile+'.json',out),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
const server=http.createServer((q,r)=>{requests.push({url:q.url,headers:q.headers});r.setHeader('content-type','text/html');r.end(q.url.startsWith('/main')?'<!doctype html><iframe src="/child?id=first"></iframe>':'<!doctype html><body>actual owned child</body>')});
let browser,client;try{
  server.listen(0,'127.0.0.1');await once(server,'listening');record.origin='http://127.0.0.1:'+server.address().port;
  browser=await startReference(binary,{args:record.args});record.pid=browser.process.pid;await checkpoint();
  client=await connect(browser.endpoint,{timeout:3000});
  const {targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(m,p)=>client.send(m,p,sessionId);
  await send('Page.enable');await send('Runtime.enable');const before=client.events.length;
  record.navigation=await send('Page.navigate',{url:record.origin+'/main'});await checkpoint();
  const end=Date.now()+2000;while(!client.events.slice(before).some(e=>e.sessionId===sessionId&&e.method==='Page.loadEventFired')){if(Date.now()>=end)throw Error('Actual page load event not observed in2000ms');await new Promise(resolve=>setTimeout(resolve,10))}
  record.stages.push({name:'load',status:'observed'});await checkpoint();
  record.evaluation=await send('Runtime.evaluate',{expression:source,awaitPromise:true,returnByValue:true,timeout:2000});record.status=record.evaluation.exceptionDetails?'javascript-exception':'observed';await checkpoint();
}catch(e){record.status='driver-or-setup-failure';record.error={name:e.name,message:e.message,code:e.code};await checkpoint();process.exitCode=1}
finally{record.events=client?.events;await client?.close();await browser?.close();record.stderr=browser?.stderr;record.exitCode=browser?.process.exitCode;record.signal=browser?.process.signalCode;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));record.cleanup='owned browser/client/server closed';await checkpoint()}
console.log(JSON.stringify({profile,status:record.status,output:new URL(profile+'.json',out).pathname}));
