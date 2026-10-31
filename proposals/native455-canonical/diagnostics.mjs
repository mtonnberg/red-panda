// Separate diagnostic epoch. No source fixture/assertion or frozen helper changes.
import { startFixtureServer } from '/workspace/shared/native455-canonical-20261031/scripts/upstream-fixture-server.mjs';
import { startReference } from '/workspace/shared/native455-canonical-20261031/scripts/reference-server.mjs';
import { connect } from '/workspace/shared/native455-canonical-20261031/test/cdp-client.js';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root='/workspace/red-panda',out=root+'/proposals/native455-canonical/diagnostics',fixtureRoot=root+'/.cache/lightpanda-reference/browser-948d773786/src/browser/tests';
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',binarySHA256=createHash('sha256').update(await readFile(binary)).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));const results=[];
for(const fixture of ['frames/blob/blob_url.html','node/compare_document_position.html']){
 const stem=fixture.replaceAll('/','__'),row={fixture,fixtureSHA256:createHash('sha256').update(await readFile(fixtureRoot+'/'+fixture)).digest('hex'),scope:'Separate bounded diagnostic; baseline row remains unchanged; no assertOk invoked',binarySHA256,args:['--load-resources','iframe','--load-resources','worker'],phases:[],startedAt:new Date().toISOString()};
 let server,browser,client,session,cleanupStarted=false;
 const save=async phase=>{row.phases.push({phase,at:new Date().toISOString()});if(browser)row.liveProcess={pid:browser.process.pid,exitCode:browser.process.exitCode,signal:browser.process.signalCode};await writeFile(out+'/'+stem+'.partial.json',JSON.stringify(row,null,2)+'\n');};
 let watchdog;
 try{
  server=await startFixtureServer(fixtureRoot,{port:9582,profile:'upstream',webSocketPort:9584});await save('server-ready');
  browser=await startReference(binary,{args:row.args});row.nativePID=browser.process.pid;browser.process.once('exit',(exitCode,signal)=>{row.nativeObservedExit={exitCode,signal,duringOwnedCleanup:cleanupStarted,at:new Date().toISOString()};});
  watchdog=setTimeout(()=>{row.watchdogForcedNativeKill=true;try{browser.process.kill('SIGKILL');}catch{}},10000);
  await save('native-ready');client=await connect(browser.endpoint,{timeout:2000});row.version=await client.send('Browser.getVersion');
  const context=(await client.send('Target.createBrowserContext')).browserContextId;const target=await client.send('Target.createTarget',{url:'about:blank',browserContextId:context});session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const send=(method,params={},timeout=2000)=>client.send(method,params,session,{timeout});
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.setLifecycleEventsEnabled',{enabled:true});await send('Network.setUserAgentOverride',{userAgent:'Lightpanda/1.0'});await send('Page.addScriptToEvaluateOnNewDocument',{source:'globalThis.__lp_external_runner = true;'});await save('automation-ready');
  const offset=client.events.length,start=Date.now();row.sourceLoadBudgetMs=2000;
  try{
   row.navigation=await send('Page.navigate',{url:server.origin+'/src/browser/tests/'+fixture});await save('navigation-returned');
   while(Date.now()-start<2000){const ev=client.events.slice(offset).find(e=>e.sessionId===session&&e.method==='Page.lifecycleEvent'&&e.params.name==='load'&&e.params.frameId===row.navigation.frameId);if(ev){row.rootLoadEvent=ev.params;break;}await sleep(20);}
  }catch(error){row.navigationError=error.message;}
  row.loadObservationElapsedMs=Date.now()-start;await save('source-load-observation-finished');
  try{const state=await send('Runtime.evaluate',{expression:"JSON.stringify({readyState:document.readyState,url:document.URL,harnessType:typeof testing,nativeBranch:typeof testing==='object'&&testing.IS_TEST_RUNNER===true})",returnByValue:true},1000);row.publicStateAfterLoadBudget=state.exceptionDetails?{exception:state.exceptionDetails}:JSON.parse(state.result.value);}catch(error){row.publicStateProbeError=error.message;}
  row.pageEvents=client.events.slice(offset).filter(e=>e.sessionId===session&&e.method.startsWith('Page.'));row.runtimeExceptions=client.events.slice(offset).filter(e=>e.method==='Runtime.exceptionThrown');await save('readiness-diagnostic-finished');
 }catch(error){row.error={message:error.message,stack:error.stack};await save('diagnostic-error');}
 finally{
  cleanupStarted=true;await save('owned-cleanup-started');await Promise.allSettled([client?.close(),browser?.close()]);clearTimeout(watchdog);
  row.processAfterCleanup=browser?{pid:browser.process.pid,exitCode:browser.process.exitCode,signal:browser.process.signalCode,stderr:browser.stderr,stderrTruncated:browser.stderrTruncated}:null;
  row.requests=server?.requests??null;await server?.close();row.finishedAt=new Date().toISOString();await save('owned-cleanup-finished');await writeFile(out+'/'+stem+'.json',JSON.stringify(row,null,2)+'\n',{flag:'wx'});results.push(row);console.log(fixture,JSON.stringify({loadEvent:!!row.rootLoadEvent,state:row.publicStateAfterLoadBudget,probeError:row.publicStateProbeError,exit:row.nativeObservedExit}));
 }
}
await writeFile(out+'/summary.json',JSON.stringify({schemaVersion:1,scope:'Separate bounded diagnostic replays; no baseline outcomes overwritten',results},null,2)+'\n',{flag:'wx'});
