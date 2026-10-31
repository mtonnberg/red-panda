import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';

const target=process.argv[2],out=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
let service,client,failure;const observations=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source='<!doctype html><html><head><title>Actual JavaScript URL control</title><script>globalThis.actualFixture=true;globalThis.actualMarker="kept";globalThis.actualRuns=[];globalThis.actualErrors=[];globalThis.actualNavigation=[];globalThis.actualHeldDocument=document;globalThis.actualHeldObject=Object;addEventListener("error",event=>actualErrors.push({message:event.message,name:event.error?.name,realm:event.error instanceof Error,trusted:event.isTrusted}));if(globalThis.navigation)navigation.addEventListener("navigate",event=>actualNavigation.push({type:event.navigationType,url:event.destination.url,same:event.destination.sameDocument,hash:event.hashChange,canIntercept:event.canIntercept}));</script></head><body><p id="actual-old-body">Actual original document</p></body></html>';
const fixture='data:text/html,'+encodeURIComponent(source);
const cases=['push','replace'].map(method=>[method,`globalThis.actualTransitions=[];for(const type of['hashchange','popstate'])addEventListener(type,()=>actualTransitions.push(type));for(const type of['navigate','currententrychange'])globalThis.navigation?.addEventListener(type,()=>actualTransitions.push(type));globalThis.actualBefore={url:location.href,documentURL:document.URL,length:history.length,state:history.state,key:globalThis.navigation?.currentEntry?.key,id:globalThis.navigation?.currentEntry?.id};try{history.${method}State(1n,'','https://other.test/#must-not-mutate');globalThis.actualFailure=null}catch(error){globalThis.actualFailure={name:error.name,message:error.message,realm:error instanceof DOMException}}setTimeout(()=>globalThis.actualCheckpoint=true,0)`]);
const snapshot=`JSON.stringify({url:location.href,documentURL:document.URL,length:history.length,state:history.state,key:globalThis.navigation?.currentEntry?.key,id:globalThis.navigation?.currentEntry?.id,before:globalThis.actualBefore??null,failure:globalThis.actualFailure??null,checkpoint:globalThis.actualCheckpoint??false,transitions:globalThis.actualTransitions??null,sameDocument:globalThis.actualHeldDocument===document,sameObject:globalThis.actualHeldObject===Object})`;
try{
 if(target==='native')service=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});
 else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0,loadResources:['iframe','worker']});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);
 for(const[name,action]of cases){let browserContextId;const row={name,action};
  try{
   ({browserContextId}=await client.send('Target.createBrowserContext'));
   const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
   const send=(method,params={})=>client.send(method,params,sessionId),start=client.events.length;
   await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:fixture});
   for(let i=0;i<100;i++){const result=await send('Runtime.evaluate',{expression:"Boolean(globalThis.actualFixture)&&document.readyState==='complete'",returnByValue:true});if(result.result?.value)break;if(i===99)throw Error('Actual control document readiness deadline');await delay(5)}
   row.preparation=await send('Runtime.evaluate',{expression:`(async()=>{history.replaceState({owned:'seed'},'');await new Promise(resolve=>setTimeout(resolve,0));return true})()`,returnByValue:true,awaitPromise:true});
   row.before=await send('Runtime.evaluate',{expression:snapshot,returnByValue:true});
   row.immediate=await send('Runtime.evaluate',{expression:`(()=>{let returned,error;try{returned=(()=>{${action}})()}catch(e){error={name:e.name,message:e.message}}return JSON.stringify({returnedType:typeof returned,error:error??null,snapshot:JSON.parse(${snapshot})})})()`,returnByValue:true});
   await delay(20);
   row.after=await send('Runtime.evaluate',{expression:snapshot,returnByValue:true});row.tree=await send('Page.getFrameTree');
   row.events=client.events.slice(start).filter(e=>e.sessionId===sessionId&&['Runtime.exceptionThrown','Runtime.executionContextCreated','Runtime.executionContextDestroyed','Page.frameNavigated','Page.navigatedWithinDocument'].includes(e.method));
  }catch(error){row.failure={name:error.name,message:error.message,stack:error.stack}}finally{if(browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId})}catch(error){row.disposeFailure=error.message}observations.push(row)}
 }
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}finally{
 await client?.close();await service?.close();const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 await writeFile(out,JSON.stringify({target,fixtureSHA256:sha(Buffer.from(source)),helperSHA256:sha(await readFile(new URL(import.meta.url))),binarySHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:observations.length,failure}));
}
