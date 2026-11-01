// Genuine initial parser/resource producer. The actual canonical close supplies
// its requests/queue positions; public Document.load never completes a resource.
import{claimInitialNetworkWindowTask}from'./window-task-capture.js';
import{managedInitialNetworkLifecycle}from'./managed-document-lifecycle.js';
import{platformFactoryRecord}from'./platform-factories.js';
import{patchPrivateLoadMethod,restorePrivateLoadMethod,privateLoadInvocation,privateLoadData,privateLoadOptionalData,privateLoadMethod,privateLoadObject,privateLoadBoundary}from'./initial-load-method-scope.js';
import{beginDispatchRecoveryParticipant,completeDispatchRecoveryParticipant}from'./dom-dispatch-recovery.js';
import{createRequire}from'node:module';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{types}from'node:util';
import{onFrameRetirement}from'./frame-retirement-hooks.js';
const require=createRequire(import.meta.url),apply=Reflect.apply,own=Object.getOwnPropertyDescriptor,schedule=process.nextTick;
const records=new WeakMap(),ids=new WeakMap();let serial=0,verified=false;
const id=value=>{if(value===null||typeof value!=='object'&&typeof value!=='function')return null;let result=ids.get(value);if(result===undefined){result=++serial;ids.set(value,result)}return result};
function verify(){
 if(verified)return;
 const pins=[['jsdom/lib/jsdom/living/nodes/Document-impl.js','28a1ac5b19463cc2db29b59d5721ce20299b998f00a222ac2ab74117dc66ba0d'],['jsdom/lib/jsdom/living/nodes/HTMLFrameElement-impl.js','eb8cca6aa971e1746c0c06860c3e8cfa871c0c52deba46ae438ef15f0bed482a'],['jsdom/lib/jsdom/browser/resources/resource-queue.js','526b1c0cb48b2bbab812f18580026e88314a41cb0b8dd9fb0f011a4bed0d7691'],['jsdom/lib/jsdom/browser/resources/async-resource-queue.js','82a34dd454df5b6d5f4d5feb1da653445af4e74992962744582139e111213e7b'],['jsdom/lib/jsdom/browser/resources/per-document-resource-loader.js','2437ba53ffecae4feb156890652dbc3d9f8697da1d522a579fd4b7325af083ac']];
 if(require('jsdom/package.json').version!=='26.1.0')throw privateLoadBoundary('jsdom version changed');
 for(const[file,expected]of pins)if(createHash('sha256').update(readFileSync(require.resolve(file))).digest('hex')!==expected)throw privateLoadBoundary('canonical producer source changed');verified=true;
}
function note(owner,kind,values={}){owner.observations.push({kind,...values})}
function listeners(owner){
 const table=privateLoadObject(privateLoadData(owner.context.document,'_eventListeners')),result={};
 for(const name of ['load','error']){
  const descriptor=own(table,name);if(!descriptor){result[name]=[];continue}
  if(!Object.hasOwn(descriptor,'value')||!Array.isArray(descriptor.value)||types.isProxy(descriptor.value))throw privateLoadBoundary('actual private listener array unavailable');
  result[name]=[];for(let i=0;i<descriptor.value.length;i++)result[name].push(privateLoadData(descriptor.value,String(i)));
 }
 return result;
}
function removeRecords(owner,group){
 const table=privateLoadObject(privateLoadData(owner.context.document,'_eventListeners'));
 for(const name of ['load','error']){
  const actual=privateLoadData(table,name);for(const record of group[name]){const index=actual.indexOf(record);if(index===-1)throw privateLoadBoundary('real frame Promise listener disappeared');actual.splice(index,1)}
 }
}
function settleFrame(owner,error,outcome){
 const frame=owner.framePromise;if(!frame||frame.settled)return;
 frame.settled=true;frame.outcome=outcome??(error===undefined?'resolved':'rejected');
 const callback=error===undefined?frame.resolve:frame.reject;
 apply(callback,undefined,error===undefined?[]:[error]);
 note(owner,'actualFramePromiseSettled',{promise:id(frame.promise),callback:id(callback),outcome:frame.outcome,error:id(error)});
}
function reportFailure(owner,error){
 owner.failure=error;note(owner,'actualMilestoneFailure',{error:id(error)});settleFrame(owner,error);owner.context.page.emit?.('pageError',error);
}
function milestone(owner,kind){
 // This Promise represents the real queue milestone. Its callback runs only
 // after the actual defer/async queue is empty; exceptions are actual callback
 // failures, while EOF/resource completion remains a completed queue step.
 return new Promise(resolve=>{
  const state={done:false,started:false},recover=()=>{if(!state.done&&state.started){state.done=true;owner.abandoned=true;note(owner,'abandonedMilestone',{milestone:kind});resolve()}};
  const complete=()=>{
   if(state.done)return;state.started=true;
   apply(schedule,process,[recover]);const participant=beginDispatchRecoveryParticipant(recover);
   try{
    if(owner.lifecycle.active()&&!owner.cancelled&&!owner.abandoned&&!owner.failure){
     if(kind==='interactive')owner.lifecycle.interactive();
     else{owner.lifecycle.complete();owner.completed=true;settleFrame(owner)}
    }
   }catch(error){reportFailure(owner,error)}
   finally{state.done=true;completeDispatchRecoveryParticipant(participant);resolve()}
  };
  const queue=kind==='interactive'?owner.defer:owner.async;
  const empty=kind==='interactive'?!privateLoadOptionalData(queue,'tail'):apply(owner.asyncCount,queue,[])===0;
  note(owner,'realMilestoneWait',{milestone:kind,empty});
  if(empty)complete();else{apply(kind==='interactive'?owner.deferSetListener:owner.asyncSetListener,queue,[complete]);if(kind==='interactive')apply(owner.deferResume,queue,[])}
 });
}
export function registerInitialNetworkLoad(context){
 if(records.has(context.document)||!context.managedLifecycleRegistered||context.initialBlankPending)return false;
 const frame=Boolean(context.page.registry);
 // Main MIME is already selected from its actual response. Frame MIME is not
 // known yet: the common actual canonical close remains its producer on all
 // observed HTML/XHTML/XML/malformed paths; no provisional MIME admits it.
 if(frame?!context.page.record?.waitingResource:context.page.url==='about:blank'||context.page.mimeType!=='text/html')return false;
 verify();
 const document=context.document,queue=privateLoadData(document,'_queue'),defer=privateLoadData(document,'_deferQueue'),async=privateLoadData(document,'_asyncQueue');
 const actualMethods={deferSetListener:privateLoadMethod(defer,'setListener'),deferResume:privateLoadMethod(defer,'resume'),asyncSetListener:privateLoadMethod(async,'setListener'),asyncCount:privateLoadMethod(async,'count')};
 const lifecycle=managedInitialNetworkLifecycle(context);if(!lifecycle)return false;
 const task=claimInitialNetworkWindowTask(context.window,document,frame?'committed-frame':'constructing-main');if(!task)return false;
 lifecycle.activate();
 const owner={context,queue,defer,async,lifecycle,task,frame,...actualMethods,tokens:new Set(),observations:[],diagnostics:[],eof:null,frameDepth:0,lastClose:null,framePromise:null,pendingParserClose:null,parserClose:null,completed:false,cancelled:false,abandoned:false,failure:null};records.set(document,owner);
 note(owner,'birthTimeTaskRetired',{capture:task.capture,path:task.path,committedAtClaim:task.committedAtClaim});
 owner.removeRetirement=frame?onFrameRetirement(context.window,()=>retireOwner(owner)):null;
 const abort=()=>{owner.removeRetirement?.();if(owner.cancelled)return;owner.cancelled=true;for(const token of [...owner.tokens].reverse())restorePrivateLoadMethod(token);settleFrame(owner,context.record.signal.reason);note(owner,'actualOwnerAborted')};
 context.record.signal?.addEventListener('abort',abort,{once:true});
 return true;
}
export function closeInitialNetworkLoad(context,original,receiver,args){
 const owner=context&&records.get(context.document);if(!owner||context.current)return apply(original,receiver,args);
 if(owner.cancelled)return;
 // HTML's genuine paused-parser guard owns pre-EOF calls. Frame XML uses its
 // actual canonical frame-source close; no synthetic parserDone flag is set.
 if(context.record.parser&&!context.record.parserDone){
  const parser=context.record.parser,result=apply(original,receiver,args);
  if(owner.frame&&owner.frameDepth){
   const requested=context.record.closeRequested;
   if(context.record.parser!==parser||!Array.isArray(requested)||types.isProxy(requested))throw privateLoadBoundary('actual paused frame close request unavailable');
   // The canonical frame source calls close after parseIntoDocument returns,
   // then creates its real Promise listeners. Capture that same close boundary
   // even when the original parser defers EOF; no EOF slot is invented here.
   owner.lastClose=listeners(owner);
   owner.pendingParserClose={parser,requested,promise:null,stage:'source-close'};
   note(owner,'actualParserCloseDeferred',{parser:id(parser),requested:id(requested),frameDepth:owner.frameDepth});
  }
  return result;
 }
 if(owner.completed||owner.eof)return;
 if(owner.frame&&!owner.frameDepth&&!owner.parserClose)return apply(original,receiver,args);
 return privateLoadInvocation(owner,()=>{
  const slots=[],checkpoint={complete:false};let token;
  try{
   token=patchPrivateLoadMethod(owner,owner.queue,'push',(base,target,values)=>{
    const slot=slots.length;
    if(slot>1||!types.isPromise(values[0])||typeof values[1]!=='function'||values[2]!==null||values.length!==(slot===0?3:4)||slot===1&&values[3]!==true||slot&&values[0]!==slots[0][0])throw privateLoadBoundary('canonical initial close registration shape changed');
    slots.push(values.slice());
    const forwarded=values.slice();forwarded[1]=()=>milestone(owner,slot===0?'interactive':'complete');
    const result=apply(base,target,forwarded);
    note(owner,'realEOFSlot',{slot:slot+1,request:id(values[0]),originalCallback:id(values[1]),ownedCallback:id(forwarded[1]),argumentCount:values.length,result:id(result)});return result;
   });
   const result=apply(original,receiver,args);
   if(slots.length!==2)throw privateLoadBoundary('expected actual two canonical EOF slots, observed '+slots.length);
   owner.eof={parser:context.record.parser??null,requests:slots.map(value=>value[0])};checkpoint.complete=true;return result;
  }finally{
   restorePrivateLoadMethod(token);
   owner.lastClose=listeners(owner);
   note(owner,'canonicalCloseReturned',{actualSlots:slots.length,complete:checkpoint.complete,frameDepth:owner.frameDepth,parserDone:context.record.parserDone===true});
  }
 });
}
function observeFramePromise(owner,result){
 if(!types.isPromise(result)||!owner.lastClose)throw privateLoadBoundary('real frame source Promise/close checkpoint unavailable');
 const actual=listeners(owner),added={};
 for(const name of ['load','error']){added[name]=actual[name].filter(value=>!owner.lastClose[name].includes(value));if(added[name].length!==1)throw privateLoadBoundary('actual frame Promise listener registration count changed')}
 const resolve=privateLoadData(added.load[0],'callback'),reject=privateLoadData(added.error[0],'callback');
 if(typeof resolve!=='function'||typeof reject!=='function'||resolve===reject)throw privateLoadBoundary('actual frame Promise callbacks unavailable');
 removeRecords(owner,added);owner.framePromise={promise:result,resolve,reject,settled:false,outcome:'pending'};
 note(owner,'actualFramePromiseCaptured',{promise:id(result),resolve:id(resolve),reject:id(reject)});
 const pending=owner.pendingParserClose;
 if(pending){
  if(owner.context.record.parser!==pending.parser||owner.context.record.parserDone||owner.context.record.closeRequested!==pending.requested)throw privateLoadBoundary('actual pending parser request changed before frame Promise capture');
  pending.promise=result;pending.stage='awaiting-parser';
  note(owner,'actualParserPromiseLinked',{parser:id(pending.parser),requested:id(pending.requested),promise:id(result)});
 }
 patchPrivateLoadMethod(owner,result,'then',(base,target,values,token)=>{
  restorePrivateLoadMethod(token);
  if(values.length!==1||typeof values[0]!=='function')throw privateLoadBoundary('actual parent continuation shape changed');
  const original=values[0],forwarded=[function(...args){try{return owner.lifecycle.parent(original,this,args)}catch(error){reportFailure(owner,error);return undefined}}];
  const next=apply(base,target,forwarded);note(owner,'actualParentContinuation',{promise:id(result),originalCallback:id(original),ownedCallback:id(forwarded[0]),result:id(next)});
  // Preserve the actual following native catch chain, including its callback.
  // Its original error producer executes under the same captured watchdog.
  if(!types.isPromise(next))throw privateLoadBoundary('real parent continuation result is not a native Promise');
  patchPrivateLoadMethod(owner,next,'catch',(catchBase,catchTarget,catchValues,catchToken)=>{
   restorePrivateLoadMethod(catchToken);
   if(catchValues.length!==1||typeof catchValues[0]!=='function')throw privateLoadBoundary('actual parent error continuation shape changed');
   const failed=catchValues[0],owned=function(...args){try{return owner.lifecycle.error(failed,this,args)}catch(error){reportFailure(owner,error);return undefined}};const result=apply(catchBase,catchTarget,[owned]);note(owner,'actualParentErrorContinuation',{promise:id(next),originalCallback:id(failed),ownedCallback:id(owned),result:id(result)});return result;
  });
  return next;
 });
 if(owner.failure)settleFrame(owner,owner.failure);else if(owner.completed)settleFrame(owner);
 return result;
}
export function runInitialNetworkFrameSource(page,original,receiver,args){
 if(typeof original!=='function')return undefined;
 const document=platformFactoryRecord(page.record?.document)?.implementation,owner=document&&records.get(document);if(!owner)return apply(original,receiver,args);
 const previous=owner.frameDepth;
 return privateLoadInvocation(owner,()=>{
  owner.frameDepth=previous+1;let result;try{result=apply(original,receiver,args)}finally{owner.frameDepth=previous}
  return observeFramePromise(owner,result);
 },()=>{owner.frameDepth=previous});
}
// Only classic-scripts' genuine finishParser hands its same stopped parser and
// still-pending close request to this Host-only scope. A public close merely
// requests completion; it does not acquire the actual EOF/Promise capability.
export function runInitialNetworkParserClose(record,parser,args,operation){
 const owner=records.get(record.document),pending=owner?.pendingParserClose;
 if(!owner?.frame||!pending||pending.parser!==parser||owner.cancelled||owner.context.current)return operation();
 if(owner.context.record!==record||record.parser!==parser||record.parserDone!==true||!parser.stopped||parser.tokenizer.paused||record.closeRequested!==args||!Array.isArray(args)||types.isProxy(args)||pending.stage!=='awaiting-parser'||!types.isPromise(pending.promise)||owner.framePromise?.promise!==pending.promise)throw privateLoadBoundary('actual deferred parser EOF authority unavailable');
 const previous=owner.parserClose,token={parser,args,promise:pending.promise};
 const restore=()=>{owner.parserClose=previous;if(pending.stage==='entered')pending.stage='abandoned'};
 return privateLoadInvocation(owner,()=>{
  owner.parserClose=token;pending.stage='entered';
  note(owner,'actualDeferredParserCloseEntered',{parser:id(parser),requested:id(args),initialRequested:id(pending.requested),promise:id(pending.promise)});
  try{const result=operation();pending.stage='consumed';return result}
  finally{owner.parserClose=previous}
 },restore);
}
export function inspectInitialNetworkLoad(document){
 const owner=records.get(document);return owner?{task:{capture:owner.task.capture,path:owner.task.path,committedAtClaim:owner.task.committedAtClaim},completed:owner.completed,cancelled:owner.cancelled,abandoned:owner.abandoned,frameDepth:owner.frameDepth,activeParserClose:Boolean(owner.parserClose),pendingParserClose:owner.pendingParserClose?{parser:id(owner.pendingParserClose.parser),requested:id(owner.pendingParserClose.requested),promise:id(owner.pendingParserClose.promise),stage:owner.pendingParserClose.stage}:null,activeMethods:owner.tokens.size,framePromise:owner.framePromise?{promise:id(owner.framePromise.promise),outcome:owner.framePromise.outcome}:null,lifecycle:owner.lifecycle.inspect(),observations:owner.observations.map(value=>({...value})),diagnostics:owner.diagnostics.slice()}:null;
}

// Actual registry retirement releases the real parent delay without claiming
// EOF or dispatching a load for a document that did not finish.
function retireOwner(owner){
 if(owner.cancelled)return;owner.removeRetirement?.();
 owner.cancelled=true;for(const token of [...owner.tokens].reverse())restorePrivateLoadMethod(token);
 settleFrame(owner,undefined,'released-after-retirement');note(owner,'actualRegistryRetirement');
}
