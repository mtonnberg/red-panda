// Host-private interruption recovery for explicitly owned synchronous dispatch
// cohorts. Original jsdom algorithms/lexical helpers remain pinned and intact.
import vm from 'node:vm';
import {countDispatchedEvent} from './event-counts-state.js';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setImmediate as checkpoint} from 'node:timers';
const require=createRequire(import.meta.url),own=Object.getOwnPropertyDescriptor,define=Object.defineProperty,apply=Reflect.apply;
const windows=new WeakMap(),canonical=new WeakMap(),cohorts=[],pending=new Set();
let currentListener=null,currentParticipant=null,installed=false,EventImplementation;
const nil=()=>Object.create(null),weak=value=>value!==null&&(typeof value==='object'||typeof value==='function')?{ref:new WeakRef(value)}:{value};
const value=box=>box?.ref?box.ref.deref():box?.value;
const hasInstance=Function.prototype[Symbol.hasInstance];
function unsupported(message){return Object.assign(new Error('Owned dispatch recovery boundary: '+message),{dispatchRecoveryBoundary:true})}
function activeCohort(){return cohorts.at(-1)}
export function captureCanonicalDispatchWrapper(wrapper,implementation){if(implementation&&typeof implementation==='object')canonical.set(implementation,new WeakRef(wrapper))}
export function captureDispatchWindow(window,context){
 if(!vm.isContext(context)||vm.runInContext('globalThis',context)!==window)throw new TypeError('An actual Window/context pair is required');
 const previous=windows.get(window);if(previous&&previous.context!==context)throw new TypeError('Dispatch Window authority cannot be retargeted');
 const record=previous??Object.assign(nil(),{context});windows.set(window,record);windows.set(context,record);windows.set(vm.runInContext('globalThis',context),record);
}
function slot(record){const d=own(record.context,'_currentEvent');if(!d||!Object.hasOwn(d,'value')||!d.writable)throw unsupported('current-event slot must remain its genuine writable data slot');if(d.value!==undefined&&(!apply(hasInstance,EventImplementation,[d.value])||!canonical.has(d.value)))throw unsupported('current-event data lacks successful canonical Event authority');return d}
function restoreWindow(token){
 if(!token.touched)return;
 const record=value(token.window);if(!record)return;
 // Intrinsic raw-context data definition never invokes an authored Window
 // getter/setter. Unsupported descriptor tampering is retained as a bound.
 const d=slot(record);define(record.context,'_currentEvent',{...d,value:value(token.previousEvent)});
}
function unwindListener(token,diagnostics){
 if(!token.active)return;const event=value(token.event);if(event)setBackendData(event,'_inPassiveListenerFlag',false,diagnostics);
 try{restoreWindow(token)}catch(error){diagnostics.push(error.message)}
 token.active=false;if(currentListener?.deref()===token)currentListener=token.previous;
}
function setBackendData(event,key,next,diagnostics){
 const d=own(event,key);
 if(d&&(!Object.hasOwn(d,'value')||!d.writable)){if(Object.hasOwn(d,'value')&&Object.is(d.value,next))return;diagnostics.push('private Event data slot changed: '+key);return}
 // Definition on the actual ordinary backend never calls a published Event
 // setter or an authored accessor installed on a legacy private surface.
 define(event,key,{value:next,writable:d?.writable??true,enumerable:d?.enumerable??true,configurable:d?.configurable??true});
}
function unwindDispatch(frame,diagnostics){
 if(!frame.active)return;const event=value(frame.event);if(!event){frame.active=false;return}
 for(const[key,next]of [['eventPhase',0],['currentTarget',null],['_path',[]],['_dispatchFlag',false],['_stopPropagationFlag',false],['_stopImmediatePropagationFlag',false],['_inPassiveListenerFlag',false]])setBackendData(event,key,next,diagnostics);
 if(frame.ready){if(frame.clearTargets){setBackendData(event,'target',null,diagnostics);setBackendData(event,'relatedTarget',null,diagnostics)}else{setBackendData(event,'target',value(frame.finalTarget)??null,diagnostics);if(frame.relatedKnown)setBackendData(event,'relatedTarget',value(frame.finalRelated)??null,diagnostics);else diagnostics.push('unknown related-target factory authority; related-target restoration is not claimed')}}
 else diagnostics.push('dispatch interrupted before original pre-tree decision; target restoration is not claimed');
 if(frame.activation)diagnostics.push('interrupted activation/default action is outside this recovery tranche');
 frame.active=false;
}
function unwindParticipant(token,diagnostics){
 if(!token.active)return;
 try{token.restore()}catch(error){diagnostics.push('private dispatch participant recovery failed: '+error.message)}
 token.active=false;if(currentParticipant?.deref()===token)currentParticipant=token.previous;
}
// A participating implementation owns its actual private state and captures the
// prior value before incrementing. Only tokens abandoned by a terminated VM
// invoke restore; ordinary finally paths mark their own tokens completed.
export function beginDispatchRecoveryParticipant(restore){
 const token=Object.assign(nil(),{kind:'participant',restore,active:true,previous:currentParticipant});
 currentParticipant=new WeakRef(token);const cohort=activeCohort();if(cohort)cohort.tokens.push(token);return token;
}
export function completeDispatchRecoveryParticipant(token){token.active=false;if(currentParticipant?.deref()===token)currentParticipant=token.previous}
function participantAncestors(){const result=[],seen=new Set();let cursor=currentParticipant?.deref();while(cursor&&cursor.active&&!seen.has(cursor)){seen.add(cursor);result.push(cursor);cursor=cursor.previous?.deref()}return result}
function recover(tokens,diagnostics){for(let i=tokens.length-1;i>=0;i--){const token=tokens[i];if(token.kind==='listener')unwindListener(token,diagnostics);else if(token.kind==='participant')unwindParticipant(token,diagnostics);else unwindDispatch(token,diagnostics)}}
function ancestors(){const result=[],seen=new Set();let cursor=currentListener?.deref();while(cursor&&cursor.active&&!seen.has(cursor)){seen.add(cursor);result.push(cursor);const frame=value(cursor.frame);if(frame?.active)result.push(frame);cursor=cursor.previous?.deref()}return result}
function complete(cohort){
 recover(cohort.tokens,cohort.diagnostics);const index=cohorts.lastIndexOf(cohort);if(index!==-1)cohorts.splice(index,1);cohort.completed=true;
}
export function withOwnedDispatchRecovery(operation){
 const cohort=Object.assign(nil(),{tokens:[],ancestors:ancestors(),participantAncestors:participantAncestors(),diagnostics:[],completed:false});cohorts.push(cohort);pending.add(cohort);
 // Only an actual owned cohort posts this Host checkpoint. Live synchronous
 // ancestor dispatches are preserved now; after the stack ends, any still
 // active frames were abandoned by a wider V8 termination.
 const task=checkpoint(()=>{complete(cohort);recover(cohort.ancestors.slice().reverse(),cohort.diagnostics);recover(cohort.participantAncestors.slice().reverse(),cohort.diagnostics);pending.delete(cohort)});task.unref?.();
 try{return operation()}finally{complete(cohort)}
}
const lifecycle={
 start(event,target){
  if(canonical.has(target)&&canonical.has(event))countDispatchedEvent(target,event);
  const frame=Object.assign(nil(),{kind:'dispatch',event:weak(event),active:true,ready:false,clearTargets:false,finalTarget:weak(null),finalRelated:weak(null),relatedKnown:true,activation:false});
  // Outside a cohort this is only a local weak ancestor context, not a log.
  const cohort=activeCohort();if(cohort)cohort.tokens.push(frame);return frame;
 },
 ready(frame,event,clearTargets){
  const path=event._path;let index=path.length-1;while(index>=0&&!event.bubbles&&path[index].target===null)index--;
  let target=null;for(let i=index;i>=0;i--)if(path[i].target){target=path[i].target;break}
  const related=index>=0?path[index].relatedTarget:null;let wrapper=null;
  if(related){wrapper=canonical.get(related)?.deref();if(!wrapper&&activeCohort())throw unsupported('related target lacks successful canonical factory authority')}
  frame.clearTargets=clearTargets;frame.finalTarget=weak(target);frame.finalRelated=weak(wrapper);frame.relatedKnown=!related||!!wrapper;frame.ready=true;
 },
 activation(frame,target){frame.activation=target!==null},
 end(frame){frame.active=false},
 listener(frame,event,window,inShadow){
  const record=window?windows.get(window):null,cohort=activeCohort();
  if(cohort&&window&&!record)throw unsupported('listener Window is not a registered genuine owner context');
  let descriptor;if(record){try{descriptor=slot(record)}catch(error){if(cohort)throw error}}
  const token=Object.assign(nil(),{kind:'listener',event:weak(event),frame:weak(frame),window:weak(record),previous:currentListener,previousEvent:weak(descriptor?.value),touched:false,active:true,inShadow});
  currentListener=new WeakRef(token);if(cohort)cohort.tokens.push(token);return token;
 },
 read(window,token){
  if(!activeCohort())return window._currentEvent;
  const record=value(token.window);if(!record)throw unsupported('missing listener Window context');return slot(record).value;
 },
 write(window,next,token){
  if(!activeCohort()){window._currentEvent=next;return}
  const record=value(token.window);if(!record)throw unsupported('missing listener Window context');const d=slot(record);token.touched=true;define(record.context,'_currentEvent',{...d,value:next});
 },
 leave(token){token.active=false;if(currentListener?.deref()===token)currentListener=token.previous},
};
export function installDispatchRecovery(){
 if(installed)return;installed=true;
 const filename=require.resolve('jsdom/lib/jsdom/living/events/EventTarget-impl.js'),source=readFileSync(filename,'utf8');
 if(require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(source).digest('hex')!=='75c12340a6925ceba5e675df7caae5199f5115dc868bd210a45ccc3e8607ce0b')throw new Error('Pinned EventTarget dispatch source changed');
 const Implementation=require(filename).implementation;EventImplementation=require('jsdom/lib/jsdom/living/events/Event-impl.js').implementation;
 const start=source.indexOf('  _dispatch('),end=source.indexOf('\n}\n\nmodule.exports'),method=source.slice(start+2,end);
 if(apply(Function.prototype.toString,Implementation.prototype._dispatch,[])!==method)throw new Error('Dispatch recovery must install before existing lifecycle wrappers');
 const header=source.slice(0,source.indexOf('class EventTargetImpl {')),helpers=source.slice(source.indexOf('// https://dom.spec.whatwg.org/#concept-event-listener-invoke'));
 let body=method.slice(method.indexOf('{')+1,method.lastIndexOf('}')),suffix=helpers;
 const replace=(text,from,to,count=1)=>{if(text.split(from).length-1!==count)throw new Error('Pinned dispatch lifecycle seam changed');return text.replaceAll(from,to)};
 body='\n    const recoveryDispatch = lifecycle.start(eventImpl,this);'+body;
 body=replace(body,'      if (activationTarget !== null && activationTarget._legacyPreActivationBehavior) {','      lifecycle.ready(recoveryDispatch, eventImpl, clearTargets);\n      lifecycle.activation(recoveryDispatch, activationTarget);\n      if (activationTarget !== null && activationTarget._legacyPreActivationBehavior) {');
 for(const phase of ['capturing','bubbling'])body=replace(body,'invokeEventListeners(struct, eventImpl, "'+phase+'");','invokeEventListeners(struct, eventImpl, "'+phase+'", recoveryDispatch);');
 body=replace(body,'    return !eventImpl._canceledFlag;','    lifecycle.end(recoveryDispatch);\n    return !eventImpl._canceledFlag;');
 suffix=replace(suffix,'function invokeEventListeners(struct, eventImpl, phase) {','function invokeEventListeners(struct, eventImpl, phase, recoveryDispatch) {');
 suffix=replace(suffix,'innerInvokeEventListeners(eventImpl, listeners, phase, struct.itemInShadowTree);','innerInvokeEventListeners(eventImpl, listeners, phase, struct.itemInShadowTree, recoveryDispatch);');
 suffix=replace(suffix,'function innerInvokeEventListeners(eventImpl, listeners, phase, itemInShadowTree) {','function innerInvokeEventListeners(eventImpl, listeners, phase, itemInShadowTree, recoveryDispatch) {');
 suffix=replace(suffix,'    let currentEvent;','    const recoveryListener = lifecycle.listener(recoveryDispatch, eventImpl, window, itemInShadowTree);\n    let currentEvent;');
 suffix=replace(suffix,'currentEvent = window._currentEvent;','currentEvent = lifecycle.read(window, recoveryListener);');
 suffix=replace(suffix,'window._currentEvent = eventImpl;','lifecycle.write(window, eventImpl, recoveryListener);');
 suffix=replace(suffix,'window._currentEvent = currentEvent;','lifecycle.write(window, currentEvent, recoveryListener);');
 suffix=replace(suffix,'    if (eventImpl._stopImmediatePropagationFlag) {','    lifecycle.leave(recoveryListener);\n    if (eventImpl._stopImmediatePropagationFlag) {');
 const dispatch=vm.compileFunction(header+'\nreturn function _dispatch(eventImpl, legacyTargetOverrideFlag){'+body+'\n};\n'+suffix,['require','lifecycle'],{filename})(createRequire(filename),lifecycle);
 Object.defineProperty(Implementation.prototype,'_dispatch',{...own(Implementation.prototype,'_dispatch'),value:dispatch});
}
