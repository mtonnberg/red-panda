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
const cases=[
 ['href-percent',`location.href='javascript:actualRuns.push("href%20ran")';actualRuns.push('sync');queueMicrotask(()=>actualRuns.push('microtask'));setTimeout(()=>actualRuns.push('timer'),0)`],
 ['assign-case-space',`location.assign('  JaVaScRiPt:void actualRuns.push("assign")');actualRuns.push('sync')`],
 ['replace',`location.replace('javascript:void actualRuns.push("replace")');actualRuns.push('sync')`],
 ['form-get',`const form=document.createElement('form');form.action='javascript:void actualRuns.push("form-get")';form.innerHTML='<input name=actual value=payload>';document.body.appendChild(form);form.requestSubmit();actualRuns.push('sync')`],
 ['form-post',`const form=document.createElement('form');form.method='post';form.action='javascript:void actualRuns.push("form-post")';form.innerHTML='<input name=actual value=payload>';document.body.appendChild(form);form.requestSubmit();actualRuns.push('sync')`],
 ['anchor-download',`const link=document.createElement('a');link.href='javascript:void actualRuns.push("download-link")';link.download='actual.txt';document.body.appendChild(link);link.click();actualRuns.push('sync')`],
 ['anchor-cancel',`const link=document.createElement('a');link.href='javascript:void actualRuns.push("unwanted")';link.addEventListener('click',event=>{actualRuns.push('click');event.preventDefault()});document.body.appendChild(link);link.click();actualRuns.push('sync')`],
 ['form-cancel',`const form=document.createElement('form');form.action='javascript:void actualRuns.push("unwanted")';form.addEventListener('submit',event=>{actualRuns.push('submit');event.preventDefault()});document.body.appendChild(form);form.requestSubmit();actualRuns.push('sync')`],
 ['stop',`location.assign('javascript:void actualRuns.push("stopped-script")');stop();actualRuns.push('sync')`],
 ['multiple',`location.assign('javascript:void actualRuns.push("first")');location.assign('javascript:void actualRuns.push("second")');actualRuns.push('sync')`],
 ['completion-string',`location.assign('javascript:"<html><head><title>Actual replacement</title></head><body><p id=actual-new-body>Actual returned bytes</p></body></html>"');actualRuns.push('sync')`],
 ['throws',`location.assign('javascript:throw new TypeError("actual-JSURL-error")');actualRuns.push('sync')`],
 ['malformed-percent',`location.assign('javascript:void actualRuns.push("actual-%ZZ-%FF")');actualRuns.push('sync')`],
];
const snapshot=`JSON.stringify({url:location.href,documentURL:document.URL,origin:globalThis.origin,marker:globalThis.actualMarker??null,runs:globalThis.actualRuns??null,errors:globalThis.actualErrors??null,navigationEvents:globalThis.actualNavigation??null,sameDocument:globalThis.actualHeldDocument===document,sameObject:globalThis.actualHeldObject===Object,title:document.title,body:document.body?.textContent??null,historyLength:history.length,readyState:document.readyState})`;
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
