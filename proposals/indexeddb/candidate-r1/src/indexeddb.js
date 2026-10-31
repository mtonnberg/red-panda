import {types} from 'node:util';
import * as backend from 'fake-indexeddb';
import {createRequire} from 'node:module';
import {createInvocationTrampoline} from './invocation.js';
import {createIndexedDBClone} from './indexeddb-clone.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const require=createRequire(import.meta.url),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const scopes=new WeakMap(),installed=new WeakMap(),values=new WeakMap(),wrappers=new WeakMap(),eventVersions=new WeakMap(),windows=new WeakMap();
const apply=Reflect.apply,nil=()=>Object.create(null),numberIndex=k=>typeof k==='string'&&/^(?:0|[1-9]\d*)$/.test(k);
const schema=Object.freeze({
 IDBFactory:{methods:['open','deleteDatabase','databases','cmp']},
 IDBRequest:{parent:'EventTarget',attrs:['readyState','result','source','transaction','error'],handlers:['success','error']},
 IDBOpenDBRequest:{parent:'IDBRequest',handlers:['blocked','upgradeneeded']},
 IDBDatabase:{parent:'EventTarget',attrs:['name','version','objectStoreNames'],methods:['createObjectStore','deleteObjectStore','transaction','close'],handlers:['error','abort']},
 IDBTransaction:{parent:'EventTarget',attrs:['mode','durability','db','objectStoreNames','error'],methods:['objectStore','abort','commit'],handlers:['complete','error','abort']},
 IDBObjectStore:{attrs:['name','keyPath','autoIncrement','transaction'],methods:['add','put','get','getKey','delete','clear','count','getAll','getAllKeys','getAllRecords','openCursor','openKeyCursor'],laterAttrs:['indexNames'],laterMethods:['createIndex','deleteIndex','index'],writable:['name']},
 IDBIndex:{attrs:['name','keyPath','unique','multiEntry','objectStore'],methods:['get','getKey','getAll','getAllKeys','getAllRecords','count','openCursor','openKeyCursor'],writable:['name']},
 IDBCursor:{attrs:['key','primaryKey','direction','source'],methods:['continue','continuePrimaryKey','advance','update','delete']},
 IDBCursorWithValue:{parent:'IDBCursor',attrs:['value']},
 IDBKeyRange:{attrs:['lower','upper','lowerOpen','upperOpen'],methods:['includes'],statics:['only','lowerBound','upperBound','bound']},
 IDBRecord:{attrs:['key','primaryKey','value']},
 DOMStringList:{attrs:['length'],methods:['contains','item','keys','values','entries']},
});
const errors={AbortError:'The operation was aborted',ConstraintError:'A mutation operation in the transaction failed because a constraint was not satisfied',DataCloneError:'The object can not be cloned',DataError:'The provided data is inadequate',InvalidAccessError:'The object does not support the operation or argument',InvalidStateError:'The object is in an invalid state',NotFoundError:'The object can not be found here',ReadOnlyError:'The mutating operation was attempted in a readonly transaction',TransactionInactiveError:'The transaction is inactive or finished',VersionError:'An attempt was made to open a database using a lower version than the existing version',SecurityError:'The operation is insecure'};
function realmFactory(g,bridge){'use strict';
 const TypeError=g.TypeError,define=Object.defineProperty,getDescriptor=Object.getOwnPropertyDescriptor,constructors=new Map();
 const token=bridge.token,Event=g.Event,EventTarget=g.EventTarget;
 for(const name of bridge.names){
  const parent=bridge.parent(name),Parent=parent==='EventTarget'?EventTarget:constructors.get(parent);
  const C=Parent?class extends Parent{constructor(){super(token);bridge.tokenCheck(arguments[0]);}}:class{constructor(){bridge.tokenCheck(arguments[0]);}};
  define(C,'name',{value:name,configurable:true});define(C,'length',{value:0,configurable:true});constructors.set(name,C);
  const p=C.prototype,constructor=getDescriptor(p,'constructor');delete p.constructor;
  function attribute(key){define(p,key,{get(){return bridge.get(this,name,key);},...(bridge.writable(name,key)?{set(value){bridge.set(this,name,key,value);}}:{}),enumerable:true,configurable:true});}
  function method(key){const fn=function(){return bridge.call(this,name,key,arguments);};define(fn,'name',{value:key,configurable:true});define(fn,'length',{value:bridge.arity(name,key),configurable:true});define(p,key,{value:fn,writable:true,enumerable:true,configurable:true});}
  for(const key of bridge.attrs(name,false))attribute(key);for(const key of bridge.methods(name,false))method(key);for(const key of bridge.attrs(name,true))attribute(key);for(const key of bridge.methods(name,true))method(key);
  for(const type of bridge.handlers(name))define(p,'on'+type,{get(){return bridge.handler(this,name,type);},set(value){bridge.handler(this,name,type,value);},enumerable:true,configurable:true});
  define(p,'constructor',constructor);if(name==='DOMStringList')define(p,g.Symbol.iterator,{value:p.values,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:name,configurable:true});
  for(const key of bridge.statics(name)){const fn=function(){return bridge.staticCall(name,key,arguments);};define(fn,'name',{value:key,configurable:true});define(C,key,{value:fn,writable:true,enumerable:true,configurable:true});}
  define(g,name,{value:C,writable:true,configurable:true});bridge.constructor(name,C);
 }
 class IDBVersionChangeEvent extends Event{constructor(type,options={}){if(!arguments.length)throw new TypeError('invalid argument');super(type,options);bridge.event(this,options.oldVersion===undefined?0:Number(options.oldVersion),options.newVersion==null?null:Number(options.newVersion));}get oldVersion(){return bridge.version(this,false);}get newVersion(){return bridge.version(this,true);}}
 define(IDBVersionChangeEvent,'length',{value:1,configurable:true});const ep=IDBVersionChangeEvent.prototype,ec=getDescriptor(ep,'constructor');delete ep.constructor;for(const key of ['oldVersion','newVersion'])define(ep,key,{...getDescriptor(ep,key),enumerable:true});define(ep,'constructor',ec);define(ep,g.Symbol.toStringTag,{value:'IDBVersionChangeEvent',configurable:true});define(g,'IDBVersionChangeEvent',{value:IDBVersionChangeEvent,writable:true,configurable:true});bridge.constructor('IDBVersionChangeEvent',IDBVersionChangeEvent);
 const access={get indexedDB(){return bridge.factory(this);}};define(g,'indexedDB',{...getDescriptor(access,'indexedDB'),enumerable:true,configurable:true});
}
function kindOf(value){for(const name of ['IDBOpenDBRequest','IDBCursorWithValue','IDBRequest','IDBDatabase','IDBTransaction','IDBObjectStore','IDBIndex','IDBCursor','IDBKeyRange','IDBRecord'])if(value instanceof backend[name])return name;return null;}
function isKind(state,kind){if(state.kind===kind)return true;for(let current=state.kind;schema[current]?.parent;){current=schema[current].parent;if(current===kind)return true;}return false;}
function error(record,value){if(value===null||value===undefined)return value;if(record.errors.has(value))return record.errors.get(value);if(typeof value!=='object')return value;const name=value.name;if(name!=='TypeError'&&!Object.hasOwn(errors,name))return value;const result=name==='TypeError'?new record.TypeError('invalid argument'):new record.Exception(errors[name]??value.message,name??'UnknownError');if(typeof value==='object')record.errors.set(value,result);return result;}
function stateFor(record,value,kind){const state=values.get(value);if(!state||!isKind(state,kind))throw new record.TypeError('Illegal invocation');return state;}
function scopeFor(record){const origin=record.document._origin;if(origin==='null')throw new record.Exception(errors.SecurityError,'SecurityError');let origins=scopes.get(record.context);if(!origins){origins=new Map();scopes.set(record.context,origins);}let scope=origins.get(origin);if(!scope){scope=Object.assign(nil(),{factory:new backend.IDBFactory(),connections:new Set()});origins.set(origin,scope);}return scope;}
function refreshConnection(database){if(database._rawDatabase)database.objectStoreNames=new database.objectStoreNames.constructor(...[...database._rawDatabase.rawObjectStores.keys()].sort());}
function bypassGates(scope,name){const raw=scope.factory._databases.get(name);if(raw)raw.connections.length=0;return raw;}
function list(record,names){const target=new record.constructors.DOMStringList(record.token),data=Object.assign(nil(),{kind:'DOMStringList',record,list:[...names],handlers:new Map()});const proxy=new record.Proxy(target,{get(t,key,receiver){if(numberIndex(key))return data.list[Number(key)];return Reflect.get(t,key,receiver);}});values.set(proxy,data);registerPlatformFactory(proxy,{kind:'DOMStringList',globalObject:record.window});return proxy;}
function releaseListeners(state){for(const entry of state.listeners){if(state.record.listeners.delete(entry))entry.target.removeEventListener(entry.type,entry.listener);}state.listeners.clear();}
function wrap(record,value){if(Array.isArray(value)&&value.length&&value.every(item=>item instanceof backend.IDBRecord)){const result=new record.Array(value.length);for(let i=0;i<value.length;i++)Object.defineProperty(result,i,{value:wrap(record,value[i]),writable:true,enumerable:true,configurable:true});return result;}if(value===null||value===undefined||typeof value!=='object')return value;const kind=kindOf(value);if(!kind)return record.clone.toRealm(value);let map=wrappers.get(value);if(!map){map=new WeakMap();wrappers.set(value,map);}const previous=map.get(record)?.deref();if(previous)return previous;
 const object=new record.constructors[kind](record.token),state=Object.assign(nil(),{kind,record,backend:value,front:new WeakRef(object),handlers:new Map(),cache:new Map(),listeners:new Set()});values.set(object,state);map.set(record,new WeakRef(object));registerPlatformFactory(object,{kind,globalObject:record.window});
 if(kind==='IDBDatabase'){record.connections.add(value);state.scope=scopeFor(record);state.scope.connections.add(value);}
 if(kind.includes('Request'))record.pending.add(object);
 if(['IDBRequest','IDBOpenDBRequest','IDBDatabase','IDBTransaction'].includes(kind)){
  const impl=implForWrapper(object);impl._getTheParent=()=>{const parent=kind.includes('Request')?value.transaction:kind==='IDBTransaction'?value.db:null;return parent?implForWrapper(wrap(record,parent)):null;};
  const types=kind==='IDBOpenDBRequest'?['upgradeneeded','success','error','blocked']:kind==='IDBRequest'?['success','error']:kind==='IDBTransaction'?['complete','abort','error']:['error','abort'];
  for(const type of types){
   const listener=event=>{
    if(event.target!==value)return;
    if(type==='success'&&state.deletedRaw){state.deletedRaw.rawObjectStores.clear();for(const connection of state.scope.connections)if(connection._rawDatabase===state.deletedRaw)refreshConnection(connection);}
    if(record.disposed){if(kind.includes('Request')&&value.readyState==='done'&&value.result instanceof backend.IDBDatabase)value.result.close();return;}
    const cursorDelivery=kind.includes('Request')&&type==='success'&&value._result instanceof backend.IDBCursor;state.cache.clear();const front=state.front.deref();if(!front)return;
    const init={bubbles:event.bubbles,cancelable:event.cancelable};const actual=type==='upgradeneeded'||type==='blocked'?new record.constructors.IDBVersionChangeEvent(type,{...init,oldVersion:event.oldVersion,newVersion:event.newVersion}):new record.Event(type,init);
    const implementation=implForWrapper(actual);implementation.isTrusted=true;
    const failures=[];record.dispatches.push(failures);let allowed;try{allowed=record.invocation.invoke(()=>implForWrapper(front)._dispatch(implementation),record.window,[],record.deadline);}finally{record.dispatches.pop();}if(!allowed)event.preventDefault();
    if(kind.includes('Request')&&(type==='error'||type==='success'&&!cursorDelivery)){record.pending.delete(front);releaseListeners(state);}
    if(kind==='IDBTransaction'&&(type==='complete'||type==='abort')){releaseListeners(state);for(const pending of record.pending){const request=values.get(pending);if(request.kind!=='IDBOpenDBRequest'&&request.backend.transaction===value){record.pending.delete(pending);releaseListeners(request);}}}
    if(failures.length)throw new AggregateError(failures);
   };
   const entry={target:value,type,listener};state.listeners.add(entry);record.listeners.add(entry);value.addEventListener(type,listener);
  }
 }
 return object;
}
function key(record,value){const state=values.get(value);if(state?.kind==='IDBKeyRange')return state.backend;if(value===null||value===undefined||typeof value==='number'||typeof value==='string'||typeof value==='boolean')return value;if(types.isDate(value)||Array.isArray(value)||types.isArrayBuffer(value)||ArrayBuffer.isView(value)){try{return record.clone.toHost(value);}catch{throw new record.Exception(errors.DataError,'DataError');}}throw new record.Exception(errors.DataError,'DataError');}
function unwrap(value){return values.get(value)?.backend??value;}
function options(record,value,dictionary){if(dictionary&&value&&typeof value==='object'&&!values.has(value)&&!Array.isArray(value)&&!ArrayBuffer.isView(value)&&!types.isAnyArrayBuffer(value)&&!types.isDate(value))return{...value,query:key(record,value.query)};return key(record,value);}
function invoke(record,state,name,argsLike){const args=Array.from(argsLike),value=state.backend;
 if(state.kind==='DOMStringList'){const a=state.list;if(name==='contains')return a.includes(String(args[0]));if(name==='item')return a[Number(args[0])>>>0]??null;const data=name==='keys'?a.map((_,i)=>i):name==='entries'?a.map((v,i)=>[i,v]):a;return record.array(data)[Symbol.iterator]();}
 if(state.kind==='IDBFactory'){
  const scope=scopeFor(state.record),factory=scope.factory;
  if(name==='open'||name==='deleteDatabase'){if(!args.length)throw new record.TypeError('invalid argument');args[0]=record.text(args[0]);const raw=bypassGates(scope,args[0]);const request=apply(factory[name],factory,args),front=wrap(record,request);if(name==='deleteDatabase'&&raw){const state=values.get(front);state.deletedRaw=raw;state.scope=scope;}return front;}
  if(name==='databases')return new record.Promise((resolve,reject)=>factory.databases().then(value=>resolve(record.clone.toRealm(value)),value=>reject(error(record,value))));
  if(name==='cmp')return factory.cmp(...args.map(value=>key(record,value)));
 }
 if(state.kind==='IDBDatabase'&&name==='transaction')refreshConnection(value);
 if(name==='add'||name==='put'||name==='update'){
  const tx=state.kind.includes('Cursor')?(value.source.objectStore??value.source).transaction:value.transaction;
  if(tx._state!=='active')throw new record.Exception(errors.TransactionInactiveError,'TransactionInactiveError');if(tx.mode==='readonly')throw new record.Exception(errors.ReadOnlyError,'ReadOnlyError');
  const before=tx._state;tx._state='inactive';try{args[0]=record.clone.toHost(args[0]);}finally{if(tx._state==='inactive')tx._state=before;}
 }
 if(['get','getKey','getAll','getAllKeys','getAllRecords','count','delete','openCursor','openKeyCursor','includes'].includes(name)&&args.length)args[0]=options(record,args[0],['getAll','getAllKeys','getAllRecords'].includes(name));
 if(name==='transaction'&&values.get(args[0])?.kind==='DOMStringList')args[0]=values.get(args[0]).list;
 if(name==='continuePrimaryKey'){args[0]=key(record,args[0]);args[1]=key(record,args[1]);}if(name==='continue'&&args[0]!==undefined)args[0]=key(record,args[0]);if((name==='add'||name==='put')&&args[1]!==undefined)args[1]=key(record,args[1]);
 if(name==='createObjectStore'||name==='deleteObjectStore'||name==='objectStore'||name==='createIndex'||name==='deleteIndex'||name==='index')if(args.length)args[0]=record.text(args[0]);
 const result=apply(value[name],value,args);if(name==='close'&&state.kind==='IDBDatabase'){releaseListeners(state);record.connections.delete(value);state.scope?.connections.delete(value);}if(name==='createIndex')value._indexesCache.set(args[0],result);return kindOf(result)?wrap(record,result):result;
}
export function installIndexedDB(page,window){if(installed.has(window))return installed.get(window);
 const record=Object.assign(nil(),{window,page,context:page.context,document:implForWrapper(window.document),token:Symbol('indexeddb-construction'),constructors:nil(),errors:new WeakMap(),connections:new Set(),pending:new Set(),listeners:new Set(),dispatches:[],disposed:false,TypeError:window.TypeError,Exception:window.DOMException,Event:window.Event,Promise:window.Promise,Proxy:window.Proxy,Object:window.Object,Array:window.Array,create:window.Object.create,from:window.Array.from,define:window.Object.defineProperty,String:window.String,symbolDescription:Object.getOwnPropertyDescriptor(window.Symbol.prototype,'description').get,add:window.EventTarget.prototype.addEventListener,remove:window.EventTarget.prototype.removeEventListener,invocation:createInvocationTrampoline(implForWrapper(window)._globalObject),deadline:{timeout:Math.min(page.timeout??2000,2000),displayErrors:false}});
 windows.set(window,record);windows.set(implForWrapper(window)._globalObject,record);record.errorObserver=event=>{const active=record.dispatches.at(-1);if(active)active.push(event.error);};apply(record.add,window,['error',record.errorObserver]);record.clone=createIndexedDBClone(window);record.array=data=>record.clone.toRealm(data);record.text=value=>typeof value==='symbol'?apply(record.String,undefined,[apply(record.symbolDescription,value,[])]):apply(record.String,undefined,[value]);
 const bridge=Object.assign(nil(),{token:record.token,names:Object.keys(schema),parent:name=>schema[name].parent,attrs:(name,later)=>schema[name][later?'laterAttrs':'attrs']??[],methods:(name,later)=>schema[name][later?'laterMethods':'methods']??[],handlers:name=>schema[name].handlers??[],statics:name=>schema[name].statics??[],writable:(name,key)=>schema[name].writable?.includes(key),arity:(kind,name)=>kind==='IDBFactory'?({open:1,deleteDatabase:1,cmp:2,databases:0}[name]):0,
  factory(value){if(value==null)return record.factory;const owner=windows.get(value);if(!owner)throw new record.TypeError('Illegal invocation');return owner.factory;},
  tokenCheck(value){if(value!==record.token)throw new record.TypeError('Illegal Constructor');},constructor(name,C){record.constructors[name]=C;registerPlatformFactoryKind(name);},
  event(value,oldVersion,newVersion){eventVersions.set(value,{oldVersion,newVersion});registerPlatformFactory(value,{kind:'IDBVersionChangeEvent',globalObject:window});},version(value,next){const data=eventVersions.get(value);if(!data)throw new record.TypeError('Illegal invocation');return next?data.newVersion:data.oldVersion;},
  get(object,kind,name){const s=stateFor(record,object,kind),b=s.backend;try{if(s.kind==='DOMStringList')return s.list.length;if(name==='objectStoreNames')return list(record,s.kind==='IDBDatabase'?[...b._rawDatabase.rawObjectStores.keys()].sort():[...b.objectStoreNames]);if(name==='indexNames')return list(record,b.indexNames);if(name==='result'){const result=b.result;if(result===null||typeof result!=='object')return result;if(!s.cache.has(name))s.cache.set(name,wrap(s.record,result));return s.cache.get(name);}if(name==='error')return error(record,b.error??null);const value=b[name];if(name==='value'&&s.kind==='IDBCursorWithValue'&&value&&typeof value==='object'){if(s.cache.get('cursorSource')!==value){s.cache.set('cursorSource',value);s.cache.set('cursorValue',s.record.clone.toRealm(value));}return s.cache.get('cursorValue');}if(kindOf(value))return wrap(s.record,value);if(value&&typeof value==='object')return record.clone.toRealm(value);return value;}catch(e){throw error(record,e);}},
  set(object,kind,name,value){const s=stateFor(record,object,kind);try{s.backend[name]=record.text(value);}catch(e){throw error(record,e);}},
  call(object,kind,name,args){const s=stateFor(record,object,kind);try{return invoke(record,s,name,args);}catch(e){throw error(record,e);}},
  staticCall(kind,name,args){try{return wrap(record,apply(backend[kind][name],backend[kind],Array.from(args,(value,index)=>index<(name==='bound'?2:1)?key(record,value):value)));}catch(e){throw error(record,e);}},
  handler(object,kind,type,value){const s=stateFor(record,object,kind);if(arguments.length<4)return s.handlers.get(type)??null;const before=s.handlers.get(type);if(before)apply(record.remove,object,[type,before]);s.handlers.delete(type);if(typeof value==='function'){s.handlers.set(type,value);apply(record.add,object,[type,value]);}},
 });
 window.eval(`(${realmFactory.toString()})`)(window,bridge);
 const factory=new record.constructors.IDBFactory(record.token);values.set(factory,Object.assign(nil(),{kind:'IDBFactory',record,handlers:new Map()}));registerPlatformFactory(factory,{kind:'IDBFactory',globalObject:window});record.factory=factory;
 const signal=page.documentAbort.signal;const dispose=()=>{if(record.disposed)return;record.disposed=true;for(const connection of record.connections){try{backend.forceCloseDatabase(connection);}catch{connection.close();}}for(const entry of record.listeners)entry.target.removeEventListener(entry.type,entry.listener);record.listeners.clear();for(const connection of record.connections){for(const scope of scopes.get(record.context)?.values()??[])scope.connections.delete(connection);}record.connections.clear();record.pending.clear();apply(record.remove,window,['error',record.errorObserver]);signal.removeEventListener('abort',dispose);};signal.addEventListener('abort',dispose,{once:true});const previousClose=window.close;window.close=function close(...args){dispose();return apply(previousClose,this,args);};const api=Object.assign(nil(),{dispose});installed.set(window,api);return api;
}
