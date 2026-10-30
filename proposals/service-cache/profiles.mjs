import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startFixtureServer } from './helpers/upstream-fixture-server.mjs';
import { startReference } from './helpers/reference-server.mjs';
import { connect } from './helpers/cdp-client.js';
const [mode,output]=process.argv.slice(2);
if(!['native','candidate'].includes(mode)||!output)throw Error('Supply native|candidate output');
const root='/tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests';
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const hash=value=>createHash('sha256').update(value).digest('hex');
const inventory=JSON.parse(await readFile(new URL('../../docs/reference/upstream-fixture-inventory.json',import.meta.url)));
const selected=process.env.SERVICE_CACHE_IDS?.split(',').map(Number)??[60,61,76,77,78];
const profiles=inventory.registrations.filter(row=>selected.includes(row.id));
const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url)));
if(process.env.SERVICE_CACHE_SNAPSHOT)manifest.snapshot=process.env.SERVICE_CACHE_SNAPSHOT;
const server=await startFixtureServer(root,{port:0,profile:'xhr-subset'});
const report={kind:'bounded-service-worker-cache-source-profiles',mode,node:process.version,snapshot:mode==='candidate'?manifest.snapshot:undefined,origin:server.origin,transport:server.metadata,cases:[]};
if(hash(await readFile(binary))!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw Error('Unexpected native binary');
let browser,reference,client;
try{
 for(const profile of profiles){
  const args=['--load-resources','iframe','--load-resources','worker',...(profile.experimentalFeatures.serviceworker?['--experimental-features','serviceworker']:[])];
  const entry={registrationId:profile.id,fixture:profile.target,fixtureSHA256:hash(await readFile(`${root}/${profile.target}`)),nativeArguments:args,sourceTimeoutMs:profile.timeoutMs,requests:[]};
  const startIndex=server.requests.length;let page,contextId,send;
  try{
   if(mode==='native'){
    reference=await startReference(binary,{args});client=await connect(reference.endpoint,{timeout:12000});
    ({browserContextId:contextId}=await client.send('Target.createBrowserContext'));
    const{targetId}=await client.send('Target.createTarget',{browserContextId:contextId,url:'about:blank'});
    const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
    send=(method,params={})=>client.send(method,params,sessionId);
    await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__lp_external_runner=true;'});
   }else{
    const{Browser}=await import(pathToFileURL(`${manifest.snapshot}/src/browser.js`));
    browser=new Browser({timeout:profile.timeoutMs,userAgent:'Lightpanda/1.0',loadResources:profile.enabledResources,experimentalFeatures:profile.experimentalFeatures});
    page=browser.createPage();page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});
    entry.pageErrors=[];page.on('pageError',error=>entry.pageErrors.push({message:error.message,stack:error.stack}));
   }
   const started=Date.now();
   if(mode==='native')await send('Page.navigate',{url:`${server.origin}/src/browser/tests/${profile.target}`});
   else try{await page.navigate(`${server.origin}/src/browser/tests/${profile.target}`);}catch(error){entry.navigationError=error.message;}
   const evaluate=async source=>{
    if(mode==='candidate')return JSON.parse(page.evaluate(`JSON.stringify(${source})`));
    const response=await send('Runtime.evaluate',{expression:`JSON.stringify(${source})`,returnByValue:true});
    if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
    return JSON.parse(response.result.value);
   };
   const deadline=started+profile.timeoutMs;
   while(Date.now()<deadline){
    try{entry.assertOk=await evaluate('typeof testing!=="undefined"?testing.assertOk():false');}catch(error){entry.assertError=error.message;break;}
    if(entry.assertOk)break;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   entry.elapsedMs=Date.now()-started;entry.timedOut=!entry.assertOk&&!entry.assertError;
   entry.surface=await evaluate(`({state:document.readyState,secure:typeof isSecureContext==='undefined'?null:isSecureContext,sw:'serviceWorker'in navigator,cache:'caches'in window,constructors:Object.fromEntries(['ServiceWorkerContainer','ServiceWorkerRegistration','ServiceWorker','ServiceWorkerGlobalScope','ExtendableEvent','Cache','CacheStorage'].map(name=>[name,typeof window[name]]))})`);
   if(mode==='native')entry.exceptions=client.events.filter(event=>['Runtime.exceptionThrown','Runtime.consoleAPICalled'].includes(event.method));
  }catch(error){entry.error=error.stack;}
  finally{
   page?.close();browser?.close();browser=undefined;
   if(client){try{if(contextId)await client.send('Target.disposeBrowserContext',{browserContextId:contextId});}finally{await client.close();client=undefined;}}
   if(reference){await reference.close();reference=undefined;}
  }
  entry.requests=structuredClone(server.requests.slice(startIndex));entry.missingRoutes=entry.requests.filter(request=>!request.routeKnown);report.cases.push(entry);
  await writeFile(output,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({id:profile.id,fixture:profile.target,ok:entry.assertOk,error:entry.assertError??entry.error,timeout:entry.timedOut,elapsedMs:entry.elapsedMs,missing:entry.missingRoutes})+'\n');
 }
}finally{browser?.close();await client?.close();await reference?.close();await server.close();}
report.cleanup='all owned native processes/connections/contexts or candidate pages/browsers closed; own port0 fixture server and delayed response timers closed';await writeFile(output,JSON.stringify(report,null,2)+'\n');
