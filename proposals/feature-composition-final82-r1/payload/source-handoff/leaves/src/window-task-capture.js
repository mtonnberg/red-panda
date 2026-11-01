// Capture only actual synchronous Window-factory task registrations. Canonical
// factories/exports/backends are untouched; no callback source/name is inspected.
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {types} from 'node:util';import vm from 'node:vm';
import {platformFactoryRecord} from './platform-factories.js';
import {createInvocationTrampoline} from './invocation.js';
import {beginDispatchRecoveryParticipant,completeDispatchRecoveryParticipant,captureDispatchWindow,withOwnedDispatchRecovery} from './dom-dispatch-recovery.js';
const require=createRequire(import.meta.url),hostProcess=process,own=Object.getOwnPropertyDescriptor,define=Object.defineProperty,apply=Reflect.apply;
const initial=own(hostProcess,'nextTick'),schedule=initial.value,pending=new Set(),captures=[],executions=[],handles=new WeakMap(),windows=new WeakMap(),observers=new Set(),notifications=[],cleanupQueue=[],bindings=[];let serial=0,pinned=false,draining=false;
const nil=value=>Object.assign(Object.create(null),value),same=(a,b)=>!!a&&!!b&&Object.hasOwn(a,'value')&&Object.hasOwn(b,'value')&&a.value===b.value&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;
const boundary=message=>Object.assign(new Error('Window task capture boundary: '+message),{windowTaskCaptureBoundary:true});
function verify(){if(pinned)return;const files=[['jsdom/lib/jsdom/browser/Window.js','cfd16270beb33c10564b3474fd2e184b902f66f35eee2cab9191c699e36b4287'],['jsdom/lib/api.js','0653e655065e93d44d885b04a975c0bac3221513bfc7be0be0afd2a4cc99ff2e']];if(require('jsdom/package.json').version!=='26.1.0')throw boundary('jsdom version changed');for(const[file,hash]of files)if(createHash('sha256').update(readFileSync(require.resolve(file))).digest('hex')!==hash)throw boundary('original construction source changed');pinned=true}
function restored(){return captures.length===0&&same(own(hostProcess,'nextTick'),initial)}
function notify(token,phase){notifications.push(nil({capture:token.id,phase,taskCount:token.tasks.length,closed:token.closed,committed:token.committed,retired:token.retired,window:token.window??null}));drain()}
function drain(){if(!restored()||draining)return;draining=true;try{while(bindings.length){const token=bindings.shift();if(token.prospectiveWindow&&!token.window)prepareBinding(token,token.prospectiveWindow)}while(cleanupQueue.length)cleanup(cleanupQueue.shift());while(notifications.length){const value=notifications.shift();for(const observer of observers)observer(value)}}finally{draining=false}}
export function observeWindowTaskCapture(observer){if(typeof observer!=='function')throw new TypeError('A Host observer is required');observers.add(observer);return()=>observers.delete(observer)}
export function windowTaskCaptureState(){return nil({capturing:captures.length,pending:pending.size,executing:executions.length,descriptorRestored:restored()})}
function remove(list,value){const index=list.lastIndexOf(value);if(index!==-1)list.splice(index,1)}
function restoreOne(token){
 if(!token.capturing)return;
 if(captures.at(-1)!==token)throw boundary('construction restoration must be LIFO');
 const current=own(hostProcess,'nextTick');if(!same(current,token.installed)&&!same(current,token.prior)){token.ambientChanged=true;token.diagnostics.push('ambient scheduler descriptor changed during protected construction')}
 define(hostProcess,'nextTick',token.prior);token.capturing=false;captures.pop();token.closed=true;
}
function restoreThrough(token){const at=captures.indexOf(token);if(at===-1)return;for(let index=captures.length-1;index>=at;index--)restoreOne(captures[index])}
function cleanup(token){
 if(token.cleaned)return;token.cleaned=true;
 if(!token.window&&token.prospectiveWindow){try{prepareBinding(token,token.prospectiveWindow)}catch(error){token.diagnostics.push("partial Window binding failed: "+error.message)}}
 if(token.cleanup){try{withOwnedDispatchRecovery(()=>token.invocation.invoke(token.cleanup,undefined,[],token.options))}catch(error){token.diagnostics.push('captured partial Window cleanup failed: '+error.message)}}
 if(token.failure){try{token.failure()}catch(error){token.diagnostics.push('Host construction cleanup hook failed: '+error.message)}}
}
function retire(token,reason){
 if(token.retired)return;for(const child of token.children)retire(child,reason);token.retired=true;token.reason=reason;for(const task of token.tasks){task.retired=true;task.callback=null}
 for(const child of token.children)child.parent=null;token.children.length=0;token.prior=null;token.installed=null;token.wrapper=null;
 cleanupQueue.push(token);notify(token,'retired');
}
function recover(token){
 if(!pending.has(token))return;
 // Recover actual descendants in reverse construction order while preserving a
 // live outer construction. The independent nextTick enrollment is outside the
 // terminated VM and runs before any captured constructor task can be delivered.
 const descendants=[...pending].filter(value=>{for(let cursor=value;cursor;cursor=cursor.parent)if(cursor===token)return true;return false}).reverse();
 for(const value of descendants){restoreThrough(value);retire(value,'abandoned construction');pending.delete(value);remove(executions,value);value.closed=true;completeDispatchRecoveryParticipant(value.participant);notify(value,'recovered')}
 drain();
}
function close(token,window,requireBaseline){
 if(token.closed)throw boundary('capture already closed');if(captures.at(-1)!==token)throw boundary('capture close must be LIFO');restoreOne(token);
 if(window){token.prospectiveWindow=window;if(restored())prepareBinding(token,window)}
 if(token.ambientChanged)throw boundary('ambient scheduler changed inside construction');
 if(token.tasks.length!==1)throw boundary('expected exactly one actual factory task, observed '+token.tasks.length);
 if(requireBaseline&&!restored())throw boundary('authored preparation cannot run inside an outer scheduler capture');
 drain();return token.handle;
}
export function captureWindowFactoryTask(construct,{onFailure}={}){
 verify();if(typeof construct!=='function')throw new TypeError('A synchronous Host constructor is required');
 const prior=own(hostProcess,'nextTick'),expected=captures.at(-1)?.installed??initial;if(!same(prior,expected))throw boundary('ambient scheduler is not the exact captured descriptor/function');
 const token=nil({id:++serial,parent:executions.at(-1)??null,prior,tasks:[],children:[],diagnostics:[],capturing:false,closed:false,committed:false,retired:false,cleaned:false,failure:onFailure,window:null,participant:null});
 const handle=Object.freeze(nil({inspect:()=>nil({capture:token.id,taskCount:token.tasks.length,closed:token.closed,committed:token.committed,retired:token.retired,diagnostics:token.diagnostics.slice()})}));token.handle=handle;handles.set(handle,token);token.parent?.children.push(token);
 // Enroll BOTH recoveries before the first scheduler mutation. No async_hooks
 // init/Promise hook or JS finally inside the VM is relied on for restoration.
 apply(schedule,hostProcess,[()=>recover(token)]);
 token.participant=beginDispatchRecoveryParticipant(()=>recover(token));pending.add(token);executions.push(token);
 token.wrapper=function capturedNextTick(callback,...args){
  if(typeof callback!=='function')return apply(schedule,this,[callback,...args]);
  const task=nil({callback,retired:false,delivered:false});token.tasks.push(task);
  return apply(schedule,this,[function capturedWindowTask(...values){
   if(task.retired)return;
   if(!token.committed){task.retired=true;token.earlyDelivery=true;return}
   task.delivered=true;notify(token,'delivered');const original=task.callback;task.callback=null;return apply(original,this,values);
  },...args]);
 };
 token.installed={...prior,value:token.wrapper};token.capturing=true;captures.push(token);
 try{
  define(hostProcess,'nextTick',token.installed);
  const result=construct((window,options={})=>close(token,window,options.requireBaseline!==false));
  if(types.isPromise(result))throw boundary('construction must not return a Promise');
  if(!token.closed)throw boundary('construction returned before ending its protected capture');
  if(token.retired||token.earlyDelivery||token.tasks.length!==1)throw boundary('construction task did not remain owned');
  if(token.prospectiveWindow&&!token.window){if(restored())prepareBinding(token,token.prospectiveWindow);else bindings.push(token)}
  token.committed=true;pending.delete(token);remove(executions,token);completeDispatchRecoveryParticipant(token.participant);if(!token.parent){const release=value=>{for(const child of value.children){release(child);child.parent=null}value.children.length=0;value.prior=null;value.installed=null;value.wrapper=null};release(token)}notify(token,'committed');return result;
 }catch(error){restoreThrough(token);retire(token,'constructor failure');pending.delete(token);remove(executions,token);completeDispatchRecoveryParticipant(token.participant);drain();throw error}
}
function prepareBinding(token,window){
 if(token.window){if(token.window!==window)throw boundary('actual constructor Window cannot be rebound');return}
 const document=platformFactoryRecord(window.document)?.implementation,context=document?._globalObject;
 if(!document||!vm.isContext(context)||vm.runInContext('globalThis',context)!==window)throw boundary('successful actual Window/Document VM required');
 const descriptor=own(window,'close');if(!descriptor||typeof descriptor.value!=='function')throw boundary('original Window cleanup entry must be a data function');
 token.document=document;token.window=window;token.invocation=createInvocationTrampoline(context);token.options={timeout:2000,displayErrors:false};const originalClose=descriptor.value;token.cleanup=()=>apply(originalClose,window,[]);captureDispatchWindow(window,context);
 if(windows.has(window))throw boundary('initial Window task cannot be rebound');windows.set(window,token);notify(token,'bound');
}

// Only successful canonical factory registration supplies this authority. These
// Host-only operations never infer ownership from public event/marker values.
export function hasPendingWindowFactoryTask(window,document){
 const token=windows.get(window),task=token?.tasks[0];
 return !!token&&token.document===document&&token.tasks.length===1&&!token.retired&&!task.retired&&!task.delivered;
}
export function claimInitialBlankWindowTask(window,document){
 const token=windows.get(window);
 if(!hasPendingWindowFactoryTask(window,document)||!token.committed)throw boundary('the exact committed initial Window task is required');
 const task=token.tasks[0];task.retired=true;task.callback=null;token.initialBlankClaimed=true;notify(token,'initialBlankClaimed');
}
