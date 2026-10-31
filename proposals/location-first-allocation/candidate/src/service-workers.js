import {captureWorkerCreator} from './worker-apis.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');

function serviceRealm(bridge, role) {
  const secret={}, registrations=new Map(), workers=new Map(), registrationData=new WeakMap(),workerData=new WeakMap(),containers=new WeakSet();
  const getRegistration=value=>{const state=registrationData.get(value);if(!state)throw new TypeError('Illegal invocation');return state;};
  const getWorker=value=>{const state=workerData.get(value);if(!state)throw new TypeError('Illegal invocation');return state;};
  const checkContainer=value=>{if(!containers.has(value))throw new TypeError('Illegal invocation');};
  const active=()=>{if(!bridge.active())throw new DOMException('ServiceWorker owner disposed','InvalidStateError');};
  const call=async(operation,args)=>{active();try{const result=await bridge.call(operation,args);active();return result;}catch(error){if(error?.name==='SecurityError'||error?.name==='NotSupportedError'||error?.name==='InvalidStateError')throw new DOMException(error.message,error.name);throw new TypeError(error?.message??String(error));}};
  class ServiceWorker extends EventTarget {
    constructor(token,id){super();if(token!==secret)throw new TypeError('Illegal Constructor');workerData.set(this,{id,state:'parsed',scriptURL:''});}
    get scriptURL(){return getWorker(this).scriptURL;}
    get state(){return getWorker(this).state;}
    postMessage(data,transfer){const state=getWorker(this);if(!arguments.length)throw new TypeError('Message is required');active();return bridge.post(state.id,data,transfer);}
  }
  class ServiceWorkerRegistration extends EventTarget {
    constructor(token,id){super();if(token!==secret)throw new TypeError('Illegal Constructor');registrationData.set(this,{id,scope:'',installing:null,waiting:null,active:null,updateViaCache:'imports'});}
    get scope(){return getRegistration(this).scope;}
    get installing(){return getRegistration(this).installing;}
    get waiting(){return getRegistration(this).waiting;}
    get active(){return getRegistration(this).active;}
    get updateViaCache(){return getRegistration(this).updateViaCache;}
    async update(){getRegistration(this);throw new DOMException('ServiceWorker update pipeline is not implemented','NotSupportedError');}
    async unregister(){return call('unregister',[getRegistration(this).id]);}
  }
  const handler=(prototype,type)=>{const handlers=new WeakMap();Object.defineProperty(prototype,'on'+type,{configurable:true,enumerable:true,get(){return handlers.get(this)??null;},set(value){const previous=handlers.get(this);if(previous)this.removeEventListener(type,previous);value=typeof value==='function'?value:null;handlers.set(this,value);if(value)this.addEventListener(type,value);}});};
  handler(ServiceWorker.prototype,'statechange');handler(ServiceWorkerRegistration.prototype,'updatefound');
  function update(snapshot,notify=false){
    let registration=registrations.get(snapshot.id);if(!registration){registration=new ServiceWorkerRegistration(secret,snapshot.id);registrations.set(snapshot.id,registration);}
    let worker=workers.get(snapshot.workerId);if(!worker){worker=new ServiceWorker(secret,snapshot.workerId);workers.set(snapshot.workerId,worker);}
    const state=getRegistration(registration),workerState=getWorker(worker),previous=workerState.state;
    Object.assign(workerState,{state:snapshot.state,scriptURL:snapshot.scriptURL});
    Object.assign(state,{scope:snapshot.scope,updateViaCache:snapshot.updateViaCache,installing:snapshot.installing?worker:null,waiting:snapshot.waiting?worker:null,active:snapshot.active?worker:null});
    if(notify&&previous!==snapshot.state)bridge.dispatch(worker,'statechange');
    if(notify&&snapshot.state==='installing')bridge.dispatch(registration,'updatefound');
    return registration;
  }
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  class ServiceWorkerContainer extends EventTarget {
    constructor(token){super();if(token!==secret)throw new TypeError('Illegal Constructor');containers.add(this);}
    get controller(){checkContainer(this);return null;}
    get ready(){checkContainer(this);return ready;}
    async register(scriptURL,options={}){checkContainer(this);options=options??{};if(!arguments.length)throw new TypeError('Script URL is required');return update(await call('register',[String(scriptURL),{scope:options.scope===undefined?undefined:String(options.scope),type:options.type===undefined?'classic':String(options.type),updateViaCache:options.updateViaCache===undefined?'imports':String(options.updateViaCache)}]));}
    async getRegistration(clientURL){checkContainer(this);const snapshot=await call('getRegistration',[clientURL===undefined?undefined:String(clientURL)]);return snapshot===undefined?undefined:update(snapshot);}
    async getRegistrations(){checkContainer(this);return Array.from(await call('getRegistrations',[]),snapshot=>update(snapshot));}
    startMessages(){checkContainer(this);}
  }
  for(const value of [ServiceWorker,ServiceWorkerRegistration,ServiceWorkerContainer])Object.defineProperty(value.prototype,Symbol.toStringTag,{value:value.name,configurable:true});
  Object.assign(globalThis,{ServiceWorker,ServiceWorkerRegistration,ServiceWorkerContainer});
  const container=new ServiceWorkerContainer(secret);
  if(role==='window')return{container,update:(snapshot,notify=true)=>update(snapshot,notify),resolveReady:snapshot=>resolveReady(update(snapshot))};

  // This event state exists only for genuinely dispatched lifecycle events.
  // A constructed ExtendableEvent has no active lifetime to extend.
  const extensions=new WeakMap();
  class ExtendableEvent extends Event {
    constructor(type,options={}){super(type,options);}
    waitUntil(value){const state=extensions.get(this);if(!state||(!state.dispatching&&!state.pending.size))throw new DOMException('The event lifetime cannot be extended','InvalidStateError');const promise=Promise.resolve(value);state.pending.add(promise);promise.then(()=>state.pending.delete(promise),error=>{state.failures.push(error);state.pending.delete(promise);});}
  }
  Object.defineProperty(ExtendableEvent.prototype,Symbol.toStringTag,{value:'ExtendableEvent',configurable:true});
  class WorkerGlobalScope extends EventTarget {constructor(token){super();if(token!==secret)throw new TypeError('Illegal Constructor');}}
  class ServiceWorkerGlobalScope extends WorkerGlobalScope {constructor(token){super(token);}}
  Object.defineProperty(ServiceWorkerGlobalScope.prototype,Symbol.toStringTag,{value:'ServiceWorkerGlobalScope',configurable:true});
  Object.setPrototypeOf(globalThis,new ServiceWorkerGlobalScope(secret));
  Object.assign(globalThis,{WorkerGlobalScope,ServiceWorkerGlobalScope,ExtendableEvent});
  const initial=bridge.initial(),registration=update(initial),worker=workers.get(initial.workerId);
  Object.defineProperties(globalThis,{registration:{get:()=>registration,configurable:true,enumerable:true},serviceWorker:{get:()=>worker,configurable:true,enumerable:true}});
  globalThis.skipWaiting=async()=>call('skipWaiting',[]);
  delete globalThis.postMessage;delete globalThis.close;
  const cookieBrand=new WeakSet();
  const readCookies=async(receiver,input)=>{if(!cookieBrand.has(receiver))throw new TypeError('Illegal invocation');const options=typeof input==='string'?{name:input}:input??{};return Array.from(await call('cookies',['getAll',{name:options.name===undefined?undefined:String(options.name),url:options.url===undefined?undefined:String(options.url)}]),value=>Object.fromEntries(Object.entries(value)));};
  class CookieStore extends EventTarget {
    constructor(token){super();if(token!==secret)throw new TypeError('Illegal Constructor');cookieBrand.add(this);}
    async getAll(input){return readCookies(this,input);}
    async get(input){if(!arguments.length)throw new TypeError('Cookie selector is required');return(await readCookies(this,input))[0]??null;}
    async set(name,value){
      if(!cookieBrand.has(this))throw new TypeError('Illegal invocation');
      let options;
      if(typeof name==='object'&&name!==null){
        if(name.name===undefined||name.value===undefined)throw new TypeError('Cookie name and value are required');
        options={name:String(name.name),value:String(name.value)};
        for(const key of ['domain','path','sameSite'])if(name[key]!==undefined)options[key]=String(name[key]);
        if(name.expires!==undefined)options.expires=Number(name.expires);
        if(name.partitioned!==undefined)options.partitioned=Boolean(name.partitioned);
      }else{if(arguments.length<2)throw new TypeError('Cookie name and value are required');options={name:String(name),value:String(value)};}
      await call('cookies',['set',options]);
    }
    async delete(input){if(!cookieBrand.has(this))throw new TypeError('Illegal invocation');const options=typeof input==='string'?{name:input}:input??{};await call('cookies',['delete',{...options}]);}
  }
  Object.defineProperty(CookieStore.prototype,Symbol.toStringTag,{value:'CookieStore',configurable:true});
  Object.assign(globalThis,{CookieStore});Object.defineProperty(globalThis,'cookieStore',{value:new CookieStore(secret),enumerable:true,configurable:true});
  return{update,async dispatch(type){const event=new ExtendableEvent(type),state={dispatching:true,pending:new Set(),failures:[]};extensions.set(event,state);bridge.trustEvent(event);try{globalThis.dispatchEvent(event);}finally{state.dispatching=false;}while(state.pending.size)await Promise.allSettled(Array.from(state.pending));if(state.failures.length)throw state.failures[0];}};
}
export const SERVICE_WORKER_REALM_SOURCE=`(${serviceRealm.toString()})`;

// Actual per-document registrations, matching the measured target's ownership.
// There is no request interception/controller/client API or background lifetime.
export function installServiceWorkers(page,window,{enabled=false,secure=false,spawn}={}) {
  const creatorSnapshot=captureWorkerCreator(page,window);
  const signal=page.documentAbort?.signal,generation=page.documentGeneration,document=window.document;
  const registrations=new Map(),byId=new Map();let next=1,disposed=false,api;
  const active=()=>!disposed&&!page.closed&&!signal?.aborted&&page.documentGeneration===generation&&window.document===document;
  const snapshot=record=>({id:record.id,workerId:record.id,scriptURL:record.scriptURL,scope:record.scope,state:record.state,updateViaCache:record.updateViaCache,installing:record.installing,waiting:false,active:record.active});
  const checkReady=()=>{const match=[...registrations.values()].filter(record=>record.active&&record.state==='activated'&&page.url.startsWith(record.scope)).sort((a,b)=>b.scope.length-a.scope.length)[0];if(match)api.resolveReady(snapshot(match));};
  const notify=record=>{if(!active())return;api.update(snapshot(record));record.command?.({kind:'serviceState',record:snapshot(record)});checkReady();};
  const remove=record=>{if(registrations.get(record.scope)===record)registrations.delete(record.scope);record.state='redundant';record.installing=false;record.active=false;notify(record);record.stop?.();};
  const cookies=(record,operation,options)=>{
    const url=new URL(options.url??record.scriptURL,record.scriptURL);if(url.origin!==new URL(record.scriptURL).origin)throw new window.DOMException('Cookie URL must have the worker origin','SecurityError');
    const jar=page.context.cookies;
    if(operation==='getAll')return jar.getCookiesSync(url.href,{http:false}).filter(cookie=>options.name===undefined||cookie.key===options.name).map(cookie=>({name:cookie.key,value:cookie.value,domain:cookie.domain,path:cookie.path,expires:cookie.expires==='Infinity'?null:new Date(cookie.expires).getTime(),secure:cookie.secure,sameSite:cookie.sameSite??'lax',partitioned:false}));
    const name=String(options.name??'');if(!name||/[;=\s\x00-\x1f\x7f]/.test(name))throw new window.TypeError('Invalid cookie name');
    const value=operation==='delete'?'':String(options.value??'');if(/[;\x00-\x1f\x7f]/.test(value))throw new window.TypeError('Invalid cookie value');
    if(options.partitioned)throw new window.DOMException('Partitioned CookieStore entries are not implemented','NotSupportedError');
    const path=String(options.path??'/');if(!path.startsWith('/')||path.includes(';'))throw new window.TypeError('Invalid cookie path');
    let text=`${name}=${value}; Path=${path}`;
    if(options.domain!==undefined){const domain=String(options.domain);if(/[;\s]/.test(domain))throw new window.TypeError('Invalid cookie domain');text+=`; Domain=${domain}`;}
    if(operation==='delete')text+='; Max-Age=0';else if(options.expires!==undefined)text+=`; Expires=${new Date(Number(options.expires)).toUTCString()}`;
    if(options.sameSite!==undefined){if(!['strict','lax','none'].includes(options.sameSite))throw new window.TypeError('Invalid SameSite');text+=`; SameSite=${options.sameSite}`;}
    if(url.protocol==='https:')text+='; Secure';jar.setCookieSync(text,url.href,{http:false});return undefined;
  };
  const call=(operation,args)=>{
    if(!active())throw new window.DOMException('ServiceWorker owner disposed','InvalidStateError');
    if(operation==='getRegistrations')return[...registrations.values()].map(snapshot);
    if(operation==='getRegistration'){const url=new URL(args[0]??page.url,creatorSnapshot().baseURL).href;return[...registrations.values()].filter(record=>url.startsWith(record.scope)).sort((a,b)=>b.scope.length-a.scope.length).map(snapshot)[0];}
    if(operation==='unregister'){const record=byId.get(args[0]);if(!record||registrations.get(record.scope)!==record)return false;remove(record);return true;}
    if(operation!=='register')throw new window.DOMException('ServiceWorker operation is not implemented','NotSupportedError');
    const[script,options]=args,scriptURL=new URL(script,creatorSnapshot().baseURL);
    const origin=creatorSnapshot().origin;
    if(!['http:','https:'].includes(scriptURL.protocol)||scriptURL.origin!==origin)throw new window.DOMException('The origin of the provided scriptURL does not match the current origin.','SecurityError');
    if(!['classic','module'].includes(options.type)||!['imports','all','none'].includes(options.updateViaCache))throw new window.TypeError('invalid argument');
    scriptURL.hash='';const scope=new URL(options.scope??'./',options.scope===undefined?scriptURL.href:creatorSnapshot().baseURL).href;
    const previous=registrations.get(scope);if(previous&&previous.scriptURL===scriptURL.href&&previous.type===options.type)return snapshot(previous);
    if(previous)remove(previous);
    if(typeof spawn!=='function')throw new window.DOMException('ServiceWorker transport is unavailable','NotSupportedError');
    const record={id:String(next++),scriptURL:scriptURL.href,scope,type:options.type,updateViaCache:options.updateViaCache,state:'parsed',installing:true,active:false};
    registrations.set(scope,record);byId.set(record.id,record);
    const configuration={initial:snapshot(record),setControls(command,stop,post){record.command=command;record.stop=stop;record.post=post;},ready(){if(!active()||registrations.get(scope)!==record)return;record.state='installing';notify(record);record.command({kind:'serviceLifecycle',type:'install'});},lifecycle(type,error){if(!active()||registrations.get(scope)!==record)return;if(error){remove(record);return;}if(type==='install'){record.state='installed';notify(record);record.state='activating';record.installing=false;record.active=true;notify(record);record.command({kind:'serviceLifecycle',type:'activate'});}else{record.state='activated';notify(record);}},error(){if(active())remove(record);},call(operation,args){if(operation==='skipWaiting'){record.skipWaiting=true;return undefined;}if(operation==='cookies')return cookies(record,...args);throw new window.DOMException('This service-worker operation is unavailable','NotSupportedError');}};
    try{spawn(record.scriptURL,{type:record.type},configuration);}catch(error){registrations.delete(scope);byId.delete(record.id);throw error;}
    return snapshot(record);
  };
  const bridge={active,call,post(id,data,transfer){const record=byId.get(id);if(record?.state!=='redundant')record?.post?.(data,transfer);},dispatch(target,type){fireAnEvent(type,implForWrapper(target));}};
  api=window.eval(SERVICE_WORKER_REALM_SOURCE)(bridge,'window');
  if(enabled&&secure)Object.defineProperty(window.Navigator.prototype,'serviceWorker',{get(){if(this!==window.navigator)throw new window.TypeError('Illegal invocation');return api.container;},enumerable:true,configurable:true});
  function dispose(){if(disposed)return;for(const record of registrations.values())record.stop?.();registrations.clear();disposed=true;}
  signal?.addEventListener('abort',dispose,{once:true});
  const close=window.close.bind(window);window.close=(...args)=>{dispose();return close(...args);};
  return{dispose,get size(){return registrations.size;}};
}

export function installServiceWorkerRealm(realm,{evaluate,initial,active,call,trustEvent}={}) {
  return evaluate(SERVICE_WORKER_REALM_SOURCE)({initial:()=>initial,active,call,trustEvent,
    post(){throw new realm.DOMException('ServiceWorker self messaging is not implemented','NotSupportedError');},
    dispatch(target,type){const event=new realm.Event(type);trustEvent(event);target.dispatchEvent(event);}},'worker');
}
