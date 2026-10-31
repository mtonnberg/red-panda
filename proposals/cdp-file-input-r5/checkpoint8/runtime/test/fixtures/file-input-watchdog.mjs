// Owned-process regression. Parent retains the existing 7s child ownership
// watchdog; actual authored callback execution uses configured 200ms policy.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {serve} from '../../src/cdp.js';import {runFileInput} from '../../src/cdp-file-input.js';import {installListenerOwnership} from '../../src/listener-ownership.js';import {connect} from '../cdp-client.js';
let service,client,dir;const mode=process.argv[2]??'basic',report={effectiveTimeout:200,mode};
try{
 dir=await mkdtemp(join(tmpdir(),'red-panda-file-watchdog-'));const first=join(dir,'first.txt'),second=join(dir,'second.txt');await writeFile(first,Buffer.from([65,0,255]));await writeFile(second,Buffer.from([3,1,4]));
 service=await serve({port:0,timeout:200,loadResources:['iframe']});client=await connect('ws://127.0.0.1:'+service.port+'/',{timeout:2000});
 const {targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId);
 await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:'data:text/html,<body id=stable>real guarded file page<iframe id=child></iframe></body>'});
 const end=Date.now()+2000;for(;;){const r=await send('Runtime.evaluate',{expression:'document.readyState==="complete"&&document.getElementById("child").contentDocument.readyState==="complete"',returnByValue:true});if(r.result?.value===true)break;if(Date.now()>end)throw Error('Original2s actual complete deadline');await new Promise(r=>setTimeout(r,5))}
 const tree=await send('Page.getFrameTree'),frameId=tree.frameTree.childFrames[0].frame.id,context=client.events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.sessionId===sessionId).map(e=>e.params.context).findLast(c=>c.auxData?.isDefault&&c.auxData.frameId===frameId);assert.ok(context);
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,contextId:context.id,returnByValue:true});assert.equal(result.exceptionDetails,undefined);return result.result.value};
 await evaluate(`(()=>{globalThis.events=[];globalThis.entered=false;globalThis.originalDocument=document;const i=document.createElement('input');i.type='file';i.id='upload';document.body.append(i);globalThis.input=i;window.addEventListener('error',e=>{events.push(['error',e.message]);e.preventDefault()});i.addEventListener('input',e=>events.push(['input-next',e.isTrusted,Array.from(i.files,f=>f.name)]));i.addEventListener('change',e=>events.push(['change',e.isTrusted,Array.from(i.files,f=>f.name)]));window.eval=()=>{throw Error('authored eval must not run')};Reflect.apply=()=>{throw Error('authored Reflect.apply must not run')};return true})()`);
 const actorMode=JSON.stringify(mode);
 await evaluate(`(()=>{
  const mode=${actorMode};
  if(mode==='shadow-open'||mode==='shadow-closed'){const host=document.createElement('div');host.id='shadowHost';document.body.append(host);globalThis.shadowHost=host;globalThis.ownedShadow=host.attachShadow({mode:mode==='shadow-open'?'open':'closed'});ownedShadow.append(input)}
  if(mode==='nested'||mode==='shadow-open'||mode==='shadow-closed'){
   const n=document.createElement('div');n.id='nested';globalThis.nestedTarget=n;(globalThis.ownedShadow??document.body).append(n);
   n.addEventListener('nested',e=>{globalThis.nestedSaved=e;events.push(['nested',e.defaultPrevented]);e.preventDefault();e.stopImmediatePropagation();entered=true;if(globalThis.ownedShadow)document.body.append(n);while(true){}},{once:true,passive:true});
   input.addEventListener('input',e=>{globalThis.saved=e;events.push(['input-nesting',e.isTrusted]);n.dispatchEvent(new Event('nested',{bubbles:true,cancelable:true,composed:true}))},{once:true});
  }else if(mode==='error-report'){
   window.addEventListener('error',e=>{globalThis.errorSaved=e;events.push(['error-infinite',e.message]);entered=true;e.preventDefault();while(true){}},{once:true});
   input.addEventListener('input',e=>{globalThis.saved=e;events.push(['input-throw',e.isTrusted]);throw new Error('file input owned error')},{once:true});
  }else input.addEventListener('input',e=>{globalThis.saved=e;events.push(['input-infinite',e.isTrusted,Array.from(input.files,f=>f.name)]);entered=true;while(true){}},{once:true});
  return true;
 })()`);
 const handle=await send('Runtime.evaluate',{expression:'input',contextId:context.id,returnByValue:false});assert.ok(handle.result.objectId);const objectId=handle.result.objectId;
 if(mode==='tampered-slot'){
  await evaluate(`(()=>{globalThis.privateSlotReads=0;Object.defineProperty(window,'_currentEvent',{get(){privateSlotReads++;throw Error('authored private slot getter')},set(){privateSlotReads++;throw Error('authored private slot setter')},configurable:true});return true})()`);
  try{report.first=await send('DOM.setFileInputFiles',{files:[first],objectId})}catch(e){report.firstError={message:e.message,code:e.code}}
  report.boundary=JSON.parse(await evaluate(`JSON.stringify({reads:privateSlotReads,entered,names:Array.from(input.files,f=>f.name),events:events.slice()})`));assert.ok(report.firstError);assert.match(report.firstError.message,/current-event slot/);assert.equal(report.boundary.reads,0);assert.equal(report.boundary.entered,false);
  await evaluate(`(()=>{Object.defineProperty(window,'_currentEvent',{value:undefined,writable:true,enumerable:true,configurable:true});return true})()`);await send('Page.close');report.disposed=service.browser.pages.size===0;
 }else{
 process.stdout.write(JSON.stringify({marker:'armed',effectiveTimeout:200,frameId,contextId:context.id})+'\n');
 const started=Date.now();
 if(mode==='prior-outer'){
  const actual=service.browser.pages.get(targetId),frame=actual.frames.findFrame(frameId),w=frame.dom.window,outer=w.document.createElement('section');outer.id='outer';w.document.body.append(outer);const outerEvent=new w.Event('outer',{bubbles:true});
  const session={page:actual,nodes:new Map([[1,w.document.getElementById('upload')]])},connection={browser:service.browser,sessions:new Map([['fixture',session]])};class WireError extends Error{constructor(message,code){super(message);this.code=code}}
  installListenerOwnership(w).add(outer,'outer',()=>{report.priorBefore=w.event===outerEvent;try{report.first=runFileInput(connection,session,{files:[first],nodeId:1},WireError)}catch(e){report.firstError={message:e.message,code:e.code}}report.priorAfter=w.event===outerEvent;report.outerDuring={phase:outerEvent.eventPhase,current:outerEvent.currentTarget?.id??null};});
  outer.dispatchEvent(outerEvent);report.outerAfter={phase:outerEvent.eventPhase,current:outerEvent.currentTarget?.id??null,path:outerEvent.composedPath().length,eventUndefined:w.event===undefined};assert.equal(report.priorBefore,true);assert.equal(report.priorAfter,true);assert.equal(report.outerDuring.phase,2);assert.equal(report.outerAfter.phase,0);assert.equal(report.outerAfter.eventUndefined,true);
 }else try{report.first=await send('DOM.setFileInputFiles',{files:[first],objectId})}catch(e){report.firstError={message:e.message,code:e.code}}
 report.elapsedMilliseconds=Date.now()-started;
 report.afterTimeout=JSON.parse(await evaluate(`JSON.stringify({entered,sameDocument:document===originalDocument,ready:document.readyState,names:Array.from(input.files,f=>f.name),sizes:Array.from(input.files,f=>f.size),events:events.slice(),eventState:saved?{phase:saved.eventPhase,currentTarget:saved.currentTarget?.id??null,target:saved.target?.id??null,pathLength:saved.composedPath().length,windowEventSame:window.event===saved,eventUndefined:window.event===undefined}:null})`));
 report.otherStates=JSON.parse(await evaluate(`JSON.stringify({nested:globalThis.nestedSaved?{phase:nestedSaved.eventPhase,current:nestedSaved.currentTarget?.id??null,path:nestedSaved.composedPath().length,target:nestedSaved.target?.id??null,defaultPrevented:nestedSaved.defaultPrevented}:null,error:globalThis.errorSaved?{phase:errorSaved.eventPhase,current:errorSaved.currentTarget?.id??null,path:errorSaved.composedPath().length}:null})`));
 assert.equal(report.afterTimeout.eventState.phase,0);assert.equal(report.afterTimeout.eventState.currentTarget,null);assert.equal(report.afterTimeout.eventState.pathLength,0);assert.equal(report.afterTimeout.eventState.eventUndefined,true);
 if(mode==='shadow-open'||mode==='shadow-closed'){assert.equal(report.afterTimeout.eventState.target,null);assert.equal(report.otherStates.nested.target,'shadowHost')}
 if(report.otherStates.nested){assert.equal(report.otherStates.nested.phase,0);assert.equal(report.otherStates.nested.current,null);assert.equal(report.otherStates.nested.path,0);assert.equal(report.otherStates.nested.defaultPrevented,false);report.nestedRedispatch=JSON.parse(await evaluate(`JSON.stringify((()=>{let calls=0;nestedTarget.addEventListener('nested',e=>{calls++;e.preventDefault()});nestedTarget.addEventListener('nested',()=>calls++);const result=nestedTarget.dispatchEvent(nestedSaved);return{result,calls,phase:nestedSaved.eventPhase,current:nestedSaved.currentTarget?.id??null,path:nestedSaved.composedPath().length,defaultPrevented:nestedSaved.defaultPrevented,target:nestedSaved.target?.id??null}})())`));assert.equal(report.nestedRedispatch.result,false);assert.equal(report.nestedRedispatch.calls,2);assert.equal(report.nestedRedispatch.phase,0)}
 if(report.otherStates.error){assert.equal(report.otherStates.error.phase,0);assert.equal(report.otherStates.error.current,null);assert.equal(report.otherStates.error.path,0);report.laterReport=JSON.parse(await evaluate(`JSON.stringify((()=>{const before=events.length;reportError(new Error('post-recovery error'));return events.slice(before)})())`));assert.ok(report.laterReport.some(row=>row[0]==='error'&&String(row[1]).includes('post-recovery error')))}
 report.redispatch=JSON.parse(await evaluate(`JSON.stringify((()=>{const result=input.dispatchEvent(saved);return{result,phase:saved.eventPhase,current:saved.currentTarget?.id??null,path:saved.composedPath().length,eventUndefined:window.event===undefined,trusted:saved.isTrusted}})())`));assert.equal(report.redispatch.phase,0);assert.equal(report.redispatch.current,null);assert.equal(report.redispatch.path,0);assert.equal(report.redispatch.eventUndefined,true);assert.equal(report.redispatch.trusted,false);
 assert.equal(report.afterTimeout.entered,true);assert.equal(report.afterTimeout.sameDocument,true);assert.deepEqual(report.afterTimeout.names,['first.txt']);assert.deepEqual(report.afterTimeout.sizes,[3]);assert.ok(report.firstError);assert.match(report.firstError.message,/Script execution timed out after 200ms/);assert.ok(report.elapsedMilliseconds<1500);
 const firstBytes=await send('Runtime.evaluate',{expression:'input.files[0].arrayBuffer().then(b=>Array.from(new Uint8Array(b)))',contextId:context.id,awaitPromise:true,returnByValue:true});assert.equal(firstBytes.exceptionDetails,undefined);report.firstBytes=firstBytes.result.value;assert.deepEqual(report.firstBytes,[65,0,255]);
 report.second=await send('DOM.setFileInputFiles',{files:[second],objectId});
 report.afterSecond=JSON.parse(await evaluate(`JSON.stringify({sameDocument:document===originalDocument,names:Array.from(input.files,f=>f.name),events:events.slice()})`));
 assert.deepEqual(report.afterSecond.names,['second.txt']);assert.equal(report.afterSecond.sameDocument,true);assert.equal(report.afterSecond.events.some(row=>row[0]==='change'),true);
 const bytes=await send('Runtime.evaluate',{expression:'input.files[0].arrayBuffer().then(b=>Array.from(new Uint8Array(b)))',contextId:context.id,awaitPromise:true,returnByValue:true});assert.equal(bytes.exceptionDetails,undefined);report.secondBytes=bytes.result.value;assert.deepEqual(report.secondBytes,[3,1,4]);
 await send('Page.close');report.disposed=service.browser.pages.size===0;assert.equal(report.disposed,true);
 }
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1}finally{await client?.close();await service?.close();if(dir)await rm(dir,{recursive:true,force:true})}
console.log(JSON.stringify(report));
