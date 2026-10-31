import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {isIP} from 'node:net';
import {toughCookie} from 'jsdom';
import {observeCookieJar,trustworthyCookieURL} from './cookie-jar-observer.js';
import {getRuntimeBinding} from './native-runtime.js';
import {createInvocationTrampoline} from './invocation.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
import {registerProtocolPrototype} from './protocol-classes.js';
const require=createRequire(import.meta.url);
const EventTargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const installed=new WeakMap(),stores=new WeakMap(),events=new WeakMap(),windows=new WeakMap();
const apply=Reflect.apply,define=Object.defineProperty,create=Object.create,construct=Reflect.construct,schedule=setTimeout,cancel=clearTimeout;
const record=value=>Object.assign(create(null),value);
function cookieRealm(g,bridge){
 const TypeError=g.TypeError,Promise=g.Promise,Event=g.Event,EventTarget=g.EventTarget,String=g.String,Number=g.Number,ArrayType=g.Array,from=g.Array.from,apply=Reflect.apply,construct=Reflect.construct;
 const define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor,setPrototype=Object.setPrototypeOf,symbolDescription=descriptor(Symbol.prototype,'description').get;
 const text=value=>String(typeof value==='symbol'?apply(symbolDescription,value,[]):value);
 const invalid=()=>{throw new TypeError('invalid argument')};
 const nullable=value=>value===null||value===undefined;
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 const optionalText=value=>nullable(value)?null:text(value);
 const optionalNumber=value=>nullable(value)?null:Number(value);
 const query=input=>object(input)?{name:optionalText(input.name),url:optionalText(input.url)}:nullable(input)?{name:null,url:null}:{name:text(input),url:null};
 function CookieStore(){throw new TypeError('Illegal Constructor');}
 const storePrototype={
  get(input=undefined){return new Promise((resolve,reject)=>{try{if(!bridge.hasStore(this))invalid();const options=query(input);if(options.name===null&&options.url===null)throw new TypeError('get requires a name or url');resolve(bridge.read(options.name,options.url,true));}catch(error){reject(error);}});},
  getAll(input=undefined){return new Promise((resolve,reject)=>{try{if(!bridge.hasStore(this))invalid();const options=query(input);resolve(bridge.read(options.name,options.url,false));}catch(error){reject(error);}});},
  set(input,value=undefined){return new Promise((resolve,reject)=>{try{if(!bridge.hasStore(this)||!arguments.length)invalid();let init;
   if(object(input)){
    const domain=optionalText(input.domain),expires=optionalNumber(input.expires),maxAge=optionalNumber(input.maxAge),name=input.name,partitioned=!!input.partitioned,path=input.path,sameSite=input.sameSite,suppliedValue=input.value;
    if(name!==undefined&&suppliedValue!==undefined){if(sameSite!==null&&sameSite!==undefined&&sameSite!=='strict'&&sameSite!=='lax'&&sameSite!=='none')invalid();init={domain,expires,maxAge,name:text(name),partitioned,path:nullable(path)?'/':text(path),sameSite:nullable(sameSite)?'strict':sameSite,value:text(suppliedValue)};}
   }
   if(!init){if(value===undefined)throw new TypeError('value is required');init={name:text(input),value:text(value),domain:null,expires:null,maxAge:null,path:'/',sameSite:'strict',partitioned:false};}
   bridge.write(init,false);resolve(undefined);
  }catch(error){reject(error);}});},
  delete(input){return new Promise((resolve,reject)=>{try{if(!bridge.hasStore(this)||!arguments.length)invalid();let name,domain=null,path='/',partitioned=false;
   if(object(input)){domain=optionalText(input.domain);const suppliedName=input.name;partitioned=!!input.partitioned;const suppliedPath=input.path;path=nullable(suppliedPath)?'/':text(suppliedPath);name=suppliedName===undefined?text(input):text(suppliedName);}else name=text(input);
   bridge.write({name,value:'',domain,path,partitioned,expires:0,maxAge:null,sameSite:'strict'},true);resolve(undefined);
  }catch(error){reject(error);}});},
  get onchange(){if(!bridge.hasStore(this))throw new TypeError('Illegal invocation');return bridge.handler(this);},
  set onchange(value){if(!bridge.hasStore(this))throw new TypeError('Illegal invocation');bridge.handler(this,typeof value==='function'?value:null,true);},
 };
 function item(value){if(!object(value)||value.name===undefined)invalid();return{domain:optionalText(value.domain),expires:optionalNumber(value.expires),name:text(value.name),partitioned:!!value.partitioned,path:nullable(value.path)?'/':text(value.path),sameSite:nullable(value.sameSite)?'strict':text(value.sameSite),secure:!!value.secure,value:value.value===undefined?null:value.value===null?null:text(value.value)};}
 function CookieChangeEvent(type){
  if(!new.target||!arguments.length)invalid();const options=arguments[1];if(!nullable(options)&&!object(options))invalid();
  const changed=options?.changed,deleted=options?.deleted;const list=value=>nullable(value)?[]:apply(from,ArrayType,[value,item]);
  const dataChanged=list(changed),dataDeleted=list(deleted);const event=construct(Event,[text(type),options],new.target);bridge.event(event,dataChanged,dataDeleted);return event;
 }
 const eventPrototype={get changed(){if(!bridge.hasEvent(this))throw new TypeError('Illegal invocation');return bridge.items(this,false);},get deleted(){if(!bridge.hasEvent(this))throw new TypeError('Illegal invocation');return bridge.items(this,true);}};
 function prototype(C,p,parent){setPrototype(p,parent.prototype);setPrototype(C,parent);define(p,'constructor',descriptor(C.prototype,'constructor'));define(p,Symbol.toStringTag,{value:C.name,configurable:true});define(C,'prototype',{value:p,writable:false});}
 prototype(CookieStore,storePrototype,EventTarget);prototype(CookieChangeEvent,eventPrototype,Event);
 bridge.exportInterfaces(CookieStore,CookieChangeEvent);
}
const trim=value=>value.replace(/^[ \t]+|[ \t]+$/g,'');
function site(host){try{return toughCookie.getPublicSuffix(host,{allowSpecialUseDomain:true})??host;}catch{return host;}}
function sameSite(owner,url){let page=owner.page;const expected=site(url.hostname),scheme=url.protocol;const seen=new Set();while(page&&!seen.has(page)){seen.add(page);let actual;try{const document=page===owner.page?owner.document:implForWrapper(page.dom.window.document);actual=new URL(document.URL);}catch{return false;}if(site(actual.hostname)!==expected||actual.protocol!==scheme)return false;page=page.parentFrameId?page.registry?.findFrame(page.parentFrameId):null;}return true;}
function visible(owner,cookie){let url;try{url=new URL(owner.document.URL);}catch{return false;}if(cookie.httpOnly||!url.hostname)return false;const host=url.hostname.replace(/^\[|\]$/g,'');return(cookie.hostOnly?host===cookie.domain:toughCookie.domainMatch(host,cookie.domain))&&toughCookie.pathMatch(url.pathname,cookie.path)&&(!cookie.secure||trustworthyCookieURL(url.href))&&(cookie.sameSite==='none'||sameSite(owner,url));}
export function installCookieStore(page,window){
 if(installed.has(window))return installed.get(window);
 const context=implForWrapper(window)._globalObject,document=implForWrapper(window.document),jar=page.context.cookies,signal=page.documentAbort.signal;
 const dispatchImpl=EventTargetImpl.prototype._dispatch;
 const invocation=createInvocationTrampoline(context),TypeError=window.TypeError,EventTarget=window.EventTarget,Event=window.Event,addListener=window.EventTarget.prototype.addEventListener,removeListener=window.EventTarget.prototype.removeEventListener,ArrayType=window.Array,realmCreate=window.Object.create,objectPrototype=window.Object.prototype;
 const owner=record({page,window,document,jar,disposed:false,tasks:new Set(),store:null,storePrototype:null,eventPrototype:null,handler:null});
 const fail=message=>{throw construct(TypeError,[message]);};
 const object=values=>{const value=apply(realmCreate,undefined,[objectPrototype]);for(const key of Object.keys(values))define(value,key,{value:values[key],writable:true,enumerable:true,configurable:true});return value;};
 const item=(value,deleted=false)=>{const data=record({domain:value.hostOnly?null:value.domain,expires:Number.isFinite(value.expires)?value.expires:null,name:value.name,partitioned:!!value.partitioned,path:value.path,sameSite:value.sameSite,secure:value.secure,value:value.value});if(deleted)for(const key of ['domain','expires','value'])if(data[key]===null)delete data[key];return object(data);};
 const list=(values,deleted=false)=>{const result=construct(ArrayType,[]);for(const value of values)define(result,String(result.length),{value:item(value,deleted),writable:true,enumerable:true,configurable:true});return result;};
 const copyItem=value=>record({domain:value.domain,hostOnly:value.domain===null,expires:value.expires,name:value.name,partitioned:value.partitioned,path:value.path,sameSite:value.sameSite,secure:value.secure,value:value.value});
 const hasListeners=()=>owner.store!==null&&!!implForWrapper(owner.store)._eventListeners.change?.length;
 const bridge=record({hasStore:value=>stores.has(value),hasEvent:value=>events.has(value),
  read(name,override,first){let url;try{url=new URL(override??document.URL,document.baseURLSerialized());}catch{fail('InvalidUrl');}if(override!==null&&url.origin!==document._origin)fail('SecurityError');const current=new URL(document.URL);current.hash='';const compared=new URL(url.href);compared.hash='';if(override!==null&&current.href!==compared.href)fail('InvalidUrl');if(!url.hostname)fail('SecurityError');
   const same=sameSite(owner,url);const values=jar.getCookiesSync(url.href,{http:false,sameSiteContext:same?'strict':'none',sort:true}).filter(value=>(same||(value.sameSite??'lax')==='none')&&(name===null||value.key===trim(name))).map(value=>record({name:value.key,value:value.value,domain:value.domain,hostOnly:value.hostOnly,path:value.path,expires:value.expiryTime(),secure:!!value.secure,sameSite:value.sameSite??'lax'}));return first?(values.length?item(values[0]):null):list(values);
  },
  write(input,deleting){
   const name=trim(input.name),value=trim(input.value),path=input.path,domain=input.domain;let expires=input.expires,url;
   try{url=new URL(document.URL);}catch{fail('InvalidDomain');}
   if(input.maxAge!==null){if(expires!==null)fail('InvalidArgument');expires=(Math.floor(Date.now()/1000)+input.maxAge)*1000;}
   if(!deleting&&name===''&&(value===''||value.includes('=')||/^__(?:host-|secure-|http-|host-http-)/i.test(value)))fail('InvalidCookieName');
   if(/[=;\x00-\x1f\x7f]/.test(name))fail('InvalidCookieName');if(/[;\x00-\x1f\x7f]/.test(value))fail('InvalidCookieValue');
   if((path&&!path.startsWith('/'))||Buffer.byteLength(path)>1024||/[;\r\n\0]/.test(path))fail('InvalidCookiePath');
   if(domain!==null&&(domain.startsWith('.')||Buffer.byteLength(domain)>1024||/[;\r\n\0]/.test(domain)))fail('InvalidCookieDomain');
   if(url.hostname&&input.sameSite!=='none'&&!sameSite(owner,url))fail('SameSiteBlocked');
   const secure=trustworthyCookieURL(url.href)||input.sameSite==='none';
   if(/^__(?:Http-|Host-Http-)/.test(name)||(name.startsWith('__Secure-')&&!trustworthyCookieURL(url.href))||(name.startsWith('__Host-')&&(!trustworthyCookieURL(url.href)||!!domain||path!=='/')))fail('InvalidPrefixedCookie');
   if(!url.hostname)fail('InvalidDomain');let attribute=domain;
   if(attribute){attribute=attribute.toLowerCase();if(!toughCookie.domainMatch(url.hostname,attribute))fail('InvalidDomain');if(isIP(attribute))attribute=null;}
   let text=`${name}=${value}; Path=${path}; SameSite=${input.sameSite}`;if(attribute)text+=`; Domain=${attribute}`;if(secure)text+='; Secure';
   if(expires!==null){const cap=(Math.floor(Date.now()/1000)+400*86400)*1000;expires=Number.isNaN(expires)?cap:Math.min(expires,cap);text+=`; Expires=${new Date(expires<=Date.now()?0:expires).toUTCString()}`;}
   try{jar.setCookieSync(text,url.href,{http:false,ignoreError:true});}catch{fail('InvalidDomain');}
  },
  handler(receiver,value,set=false){const state=stores.get(receiver);if(!set)return state.handler;state.handler=value;if(value&&!state.handlerWrapper){state.handlerWrapper=event=>{const callback=state.handler;if(callback)return state.invocation.invoke(callback,receiver,[event],{timeout:Math.min(state.page.timeout??2000,2000),displayErrors:false});};apply(addListener,receiver,['change',state.handlerWrapper]);}else if(!value&&state.handlerWrapper){apply(removeListener,receiver,['change',state.handlerWrapper]);state.handlerWrapper=null;}},
  event(event,changed,deleted){events.set(event,record({changed:Array.from(changed,copyItem),deleted:Array.from(deleted,copyItem)}));registerPlatformFactory(event,{kind:'CookieChangeEvent',globalObject:window});},
  items(event,deleted){const state=events.get(event);return list(deleted?state.deleted:state.changed,deleted);},
  exportInterfaces(CookieStore,CookieChangeEvent){owner.storePrototype=CookieStore.prototype;owner.eventPrototype=CookieChangeEvent.prototype;for(const C of [CookieStore,CookieChangeEvent]){define(window,C.name,{value:C,writable:true,configurable:true});registerProtocolPrototype(C.prototype,C.name);}},
 });
 for(const kind of ['CookieStore','CookieChangeEvent'])registerPlatformFactoryKind(kind);
 owner.invocation=invocation;
 vm.compileFunction(`(${cookieRealm.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:context})(bridge);
 owner.ensureStore=()=>{if(owner.store===null){const value=construct(EventTarget,[]);Object.setPrototypeOf(value,owner.storePrototype);owner.store=value;stores.set(value,owner);registerPlatformFactory(value,{kind:'CookieStore',globalObject:window});}return owner.store;};windows.set(implForWrapper(window),owner);
 const getter=(page.browser?.runtimeBinding??getRuntimeBinding()).createEntry((_incumbent,receiver)=>{const provenance=platformFactoryRecord(receiver),state=provenance?.kind==='EventTarget'?windows.get(provenance.implementation):undefined;if(!state)fail('Illegal invocation');return state.ensureStore();},window.Object);define(getter,'name',{value:'get cookieStore',configurable:true});define(getter,'length',{value:0,configurable:true});define(window,'cookieStore',{get:getter,enumerable:true,configurable:true});
 const unobserve=observeCookieJar(jar,(kind,value)=>{
  if(owner.disposed||!visible(owner,value)||!hasListeners())return;
  const copy=record({...value,value:kind==='deleted'?null:value.value,expires:null});let timer;timer=schedule(()=>{owner.tasks.delete(timer);if(owner.disposed||!hasListeners())return;const event=construct(Event,['change']);Object.setPrototypeOf(event,owner.eventPrototype);events.set(event,record({changed:kind==='changed'?[copy]:[],deleted:kind==='deleted'?[copy]:[]}));registerPlatformFactory(event,{kind:'CookieChangeEvent',globalObject:window});const implementation=implForWrapper(event);implementation.isTrusted=true;try{invocation.invoke(()=>apply(dispatchImpl,implForWrapper(owner.store),[implementation]),undefined,[],{timeout:Math.min(page.timeout??2000,2000),displayErrors:false});}catch(error){page.emit('pageError',error);}},0);owner.tasks.add(timer);
 });
 const dispose=()=>{if(owner.disposed)return;owner.disposed=true;for(const timer of owner.tasks)cancel(timer);owner.tasks.clear();unobserve();signal.removeEventListener('abort',dispose);};signal.addEventListener('abort',dispose,{once:true});
 const controller=record({dispose});installed.set(window,controller);return controller;
}
