import 'jsdom';
import {createRequire} from 'node:module';
import {createInvocationTrampoline} from './invocation.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';

// The observed target keeps separate document LockManagers, including for
// same-origin frames. Queues below therefore belong to the genuine manager's
// document, not a synthetic origin-wide service. See proposals/weblocks.
const require=createRequire(import.meta.url);
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const SignalImpl=require('jsdom/lib/jsdom/living/aborting/AbortSignal-impl.js').implementation;
const addAbort=SignalImpl.prototype._addAlgorithm,removeAbort=SignalImpl.prototype._removeAlgorithm;
const installed=new WeakMap(),managers=new WeakMap(),locks=new WeakMap(),navigators=new WeakMap(),clients=new WeakMap();
const hostSchedule=setTimeout,hostCancel=clearTimeout,apply=Reflect.apply,normalize=String.prototype.toWellFormed;

function lockRealm(g,bridge){
 const TypeError=g.TypeError,Exception=g.DOMException,Promise=g.Promise,Array=g.Array,String=g.String;
 const apply=Reflect.apply,define=Object.defineProperty,getDescriptor=Object.getOwnPropertyDescriptor,create=Object.create;
 const resolvePromise=Promise.resolve,thenPromise=Promise.prototype.then;
 const symbolDescription=getDescriptor(Symbol.prototype,'description').get;
 const text=value=>bridge.normalize(typeof value==='symbol'?String(apply(symbolDescription,value,[])):String(value));
 const error=()=>new TypeError('invalid argument');
 const owner=value=>{const state=bridge.managerState(value);if(!state)throw error();return state;};
 const state=value=>{const record=bridge.lockState(value);if(!record)throw new TypeError('Illegal invocation');return record;};
 const dom=name=>new Exception(name==='AbortError'?'The operation was aborted':'The operation is not supported',name);
 let realm;
 class Lock{
  constructor(){throw new TypeError('Illegal Constructor');}
  get mode(){return state(this).mode;}
  get name(){return state(this).name;}
 }
 class LockManager{
  constructor(){throw new TypeError('Illegal Constructor');}
  request(name,options){
   const receiver=this,args=arguments;
   return new Promise((resolve,reject)=>{
    try{
     const target=owner(receiver);if(args.length<2)throw error();name=text(name);
     let callback,mode='exclusive',ifAvailable=false,steal=false,signal;
     if(typeof options==='function')callback=options;
     else{
      if(options===null||typeof options!=='object')throw error();
      ifAvailable=!!options.ifAvailable;
      const suppliedMode=options.mode;if(suppliedMode!==undefined){if(suppliedMode!=='exclusive'&&suppliedMode!=='shared')throw error();mode=suppliedMode;}
      const suppliedSignal=options.signal;if(suppliedSignal!=null)signal=bridge.signal(suppliedSignal);
      steal=!!options.steal;
      callback=args[2];if(typeof callback!=='function')throw new TypeError('callback must be a function');
     }
     if(name.startsWith('-')||(steal&&(ifAvailable||mode==='shared'))||(signal&&(steal||ifAvailable)))throw dom('NotSupportedError');
     bridge.request(target,name,mode,ifAvailable,steal,signal,callback,resolve,reject,realm);
    }catch(e){reject(e);}
   });
  }
  query(){const receiver=this;return new Promise((resolve,reject)=>{try{const snapshot=bridge.snapshot(owner(receiver));const entries=values=>Array.from(values,value=>({name:value.name,mode:value.mode,clientId:value.clientId}));resolve({held:entries(snapshot.held),pending:entries(snapshot.pending)});}catch(e){reject(e);}});}
 }
 for(const [name,C]of [['Lock',Lock],['LockManager',LockManager]]){
  const prototype=C.prototype,constructor=getDescriptor(prototype,'constructor');delete prototype.constructor;
  for(const key of Object.getOwnPropertyNames(prototype))define(prototype,key,{...getDescriptor(prototype,key),enumerable:true});
  define(prototype,'constructor',constructor);define(prototype,Symbol.toStringTag,{value:name,configurable:true});
  define(g,name,{value:C,writable:true,configurable:true,enumerable:false});
 }
 realm={global:g,
  makeManager(target){const value=create(LockManager.prototype);bridge.publishManager(value,target);return value;},
  makeLock(name,mode){const value=create(Lock.prototype);bridge.publishLock(value,name,mode);return value;},
  abort:()=>dom('AbortError'),
  deliver(callback,receiver,lock,fulfill,reject){let value;try{value=apply(callback,receiver,[lock]);}catch(e){reject(e);return;}apply(thenPromise,apply(resolvePromise,Promise,[value]),[fulfill,reject]);},
 };
 const getters={get locks(){return bridge.manager(this);}};
 define(g.Navigator.prototype,'locks',{...getDescriptor(getters,'locks'),enumerable:true,configurable:true});
 return realm;
}
function removeAlgorithm(request){
 if(request.signal&&request.abort){apply(removeAbort,request.signal,[request.abort]);request.abort=null;}
}
function cancelTimer(request){if(request.timer!==undefined){hostCancel(request.timer);request.owner.timers.delete(request.timer);request.timer=undefined;}}
function removeRequest(request){
 cancelTimer(request);removeAlgorithm(request);
 const {owner,group}=request;owner.requests.delete(request);
 if(group){group.held.delete(request);const at=group.pending.indexOf(request);if(at!==-1)group.pending.splice(at,1);}
 request.phase='settled';
}
function promote(owner,group){
 if(owner.disposed)return;
 while(group.pending.length){
  const request=group.pending[0];
  if(group.held.size&&(request.mode==='exclusive'||[...group.held].some(value=>value.mode==='exclusive')))break;
  group.pending.shift();group.held.add(request);schedule(request,true);
  if(request.mode==='exclusive')break;
 }
}
function settle(request,rejected,value){
 if(request.phase==='settled'||request.owner.disposed)return;
 const group=request.group;removeRequest(request);if(group){promote(request.owner,group);if(!group.held.size&&!group.pending.length)request.owner.groups.delete(request.name);}
 (rejected?request.reject:request.resolve)(value);
}
function schedule(request,available){
 request.phase='scheduled';
 request.timer=hostSchedule(()=>{
  request.owner.timers.delete(request.timer);request.timer=undefined;
  if(request.phase!=='scheduled'||request.owner.disposed)return;
  request.phase='running';removeAlgorithm(request);
  const lock=available?request.realm.makeLock(request.name,request.mode):null;
  try{request.realm.invoke(request.realm.deliver,request.realm.global,[request.callback,request.realm.global,lock,value=>settle(request,false,value),error=>settle(request,true,error)]);}
  catch(error){settle(request,true,error);}
 },0);
 request.owner.timers.add(request.timer);
}
function request(owner,name,mode,ifAvailable,steal,signal,callback,resolve,reject,realm){
 if(owner.disposed)return;
 if(signal?.aborted){reject(signal.reason);return;}
 let group=owner.groups.get(name);if(!group){group={held:new Set(),pending:[]};owner.groups.set(name,group);}
 const entry={owner,name,mode,signal,callback,resolve,reject,realm,group,phase:'pending'};
 owner.requests.add(entry);
 if(signal){entry.abort=()=>settle(entry,true,signal.reason);apply(addAbort,signal,[entry.abort]);}
 if(steal){
  for(const held of [...group.held]){removeRequest(held);held.reject(realm.abort());}
  group.pending.unshift(entry);promote(owner,group);return;
 }
 if(ifAvailable&&(group.pending.length||(group.held.size&&(mode==='exclusive'||[...group.held].some(value=>value.mode==='exclusive'))))){entry.group=null;schedule(entry,false);return;}
 group.pending.push(entry);promote(owner,group);
}
export function installWebLocks(page,window){
 if(installed.has(window))return installed.get(window);
 for(const kind of ['Lock','LockManager'])registerPlatformFactoryKind(kind);
 let registry=clients.get(page.browser);if(!registry){registry={ids:new Map(),next:1};clients.set(page.browser,registry);}
 let clientId=registry.ids.get(page.frameId);if(!clientId){clientId=String(registry.next++);registry.ids.set(page.frameId,clientId);}
 const ErrorType=window.TypeError;
 const signal=page.documentAbort.signal,document=implForWrapper(window.document),invoke=createInvocationTrampoline(implForWrapper(window)._globalObject);
 const owner={window,document,context:page.context,clientId,groups:new Map(),requests:new Set(),timers:new Set(),disposed:false,manager:null};
 let realm;
 const bridge={normalize:value=>apply(normalize,value,[]),managerState:value=>managers.get(value),lockState:value=>locks.get(value),
  manager(value){const state=navigators.get(value);if(!state)throw new ErrorType('Illegal invocation');if(!state.manager)state.manager=state.realm.makeManager(state);return state.manager;},
  publishManager(value,state){managers.set(value,state);registerPlatformFactory(value,{kind:'LockManager',globalObject:window});},
  publishLock(value,name,mode){locks.set(value,{name,mode});registerPlatformFactory(value,{kind:'Lock',globalObject:window});},
  signal(value){const record=platformFactoryRecord(value);if(record?.kind!=='AbortSignal'||!record.implementation)throw new ErrorType('invalid argument');return record.implementation;},
  request,
  snapshot(state){const held=[],pending=[];for(const entry of state.requests){if(!entry.group)continue;const values=entry.phase==='pending'?pending:held;values.push({name:entry.name,mode:entry.mode,clientId:state.clientId});}return{held,pending};},
 };
 realm=window.eval(`(${lockRealm.toString()})`)(window,bridge);
 realm.invoke=(fn,receiver,args)=>invoke.invoke(fn,receiver,args,{timeout:Math.min(page.timeout??2000,2000),displayErrors:false});owner.realm=realm;navigators.set(window.navigator,owner);
 const dispose=()=>{if(owner.disposed)return;owner.disposed=true;for(const pending of [...owner.requests])removeRequest(pending);owner.groups.clear();signal.removeEventListener('abort',dispose);};
 signal.addEventListener('abort',dispose,{once:true});
 const controller={dispose};installed.set(window,controller);return controller;
}
