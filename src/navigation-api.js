import vm from'node:vm';
import{createRequire}from'node:module';
import{getRuntimeBinding}from'./native-runtime.js';
import{platformFactoryRecord,registerPlatformFactory}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
import{captureDOMExceptionFactory}from'./worker-dom-exception.js';
import{setNavigationLifecycle}from'./navigation-lifecycle.js';
import{initialHistoryNavigation,commitNavigationState,updateNavigationState,traverseJointHistory}from'./joint-history.js';
import{requestNavigation}from'./navigation.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),conversions=require('webidl-conversions');
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const WINDOWS=new WeakMap(),VALUES=new WeakMap(),SESSIONS=new WeakMap();
const documentImpl=window=>{const provenance=platformFactoryRecord(window.document);if(provenance?.kind!=='Document')throw Error('Actual Document factory provenance required');return provenance.implementation};
const apply=Reflect.apply,construct=Reflect.construct,define=Object.defineProperty,record=value=>Object.assign(Object.create(null),value),stringify=JSON.stringify;
const rootFor=page=>page.parentFrameId?page.registry.page:page;
function bootstrap(g,b){
 'use strict';const TypeError=g.TypeError;
 class Navigation extends g.EventTarget{constructor(){throw new TypeError('Illegal Constructor')}}
 class NavigationHistoryEntry extends g.EventTarget{constructor(){throw new TypeError('Illegal Constructor')}}
 class NavigationDestination{constructor(){throw new TypeError('Illegal Constructor')}}
 class NavigationActivation{constructor(){throw new TypeError('Illegal Constructor')}}
 class NavigateEvent extends g.Event{constructor(type,init){return b.construct('NavigateEvent',new.target,arguments.length,type,init)}}
 class NavigationCurrentEntryChangeEvent extends g.Event{constructor(type,init){return b.construct('NavigationCurrentEntryChangeEvent',new.target,arguments.length,type,init)}}
 b.export(Navigation,NavigationHistoryEntry,NavigationDestination,NavigationActivation,NavigateEvent,NavigationCurrentEntryChangeEvent);
}
function session(page){const root=rootFor(page);let state=SESSIONS.get(root);if(!state){state=record({root,view:null,entries:new WeakMap(),operations:new Map(),activation:null});SESSIONS.set(root,state);root.once?.('close',()=>{for(const operation of state.operations.values()){operation.phase='finished';operation.resolveCommitted=operation.rejectCommitted=operation.resolveFinished=operation.rejectFinished=undefined;operation.result=undefined}state.operations.clear()})}return state}
function typed(value,kind,realm){const state=VALUES.get(value);if(!state||state.kind!==kind)throw new realm.TypeError('Illegal invocation');return state}
function parse(realm,text){return text===undefined?undefined:apply(realm.parse,undefined,[text])}
function array(realm,items){const value=construct(realm.Array,[]);for(let i=0;i<items.length;i++)define(value,String(i),{value:items[i],writable:true,enumerable:true,configurable:true});return value}
function produce(realm,kind,details){
 const value=kind==='Navigation'||kind==='NavigationHistoryEntry'?construct(realm.EventTarget,[],realm.api[kind]):apply(realm.create,undefined,[realm.api[kind].prototype]);
 const provenance=platformFactoryRecord(value);if((kind==='Navigation'||kind==='NavigationHistoryEntry')&&provenance?.kind!=='EventTarget')throw Error('Actual EventTarget factory provenance is required');
 const state=record({kind,realm,implementation:provenance?.implementation,...details});VALUES.set(value,state);state.value=value;registerPlatformFactory(value,{kind,implementation:state.implementation??state,globalObject:realm.window});return value;
}
function entryObject(owner,entry,realm){let value=owner.entries.get(entry);if(!value){value=produce(realm??owner.view.realm,'NavigationHistoryEntry',{owner,entry});owner.entries.set(entry,value)}return value}
function navigationObject(realm,page){const owner=session(page);if(owner.view&&owner.view.documentId!==owner.root.documentId){owner.view=null;owner.entries=new WeakMap()}if(!owner.view){const value=produce(realm,'Navigation',{owner,documentId:owner.root.documentId});owner.view=VALUES.get(value)}return owner.view.value}
function metadata(entry){return{key:entry.navigationKey??String(entry.id-1),id:String(entry.id-1)}}
function current(owner){return owner.root.history[owner.root.historyIndex]}
function actualPage(realm){const p=realm.page;if(p.parentFrameId)return p.registry.findFrame(p.frameId)??p;return p}
function effectiveRealm(method,incumbent){if(actualPage(method).documentId===method.documentId)return method;if(incumbent)return incumbent;throw new method.TypeError('A superseded Navigation method requires a registered incumbent realm')}
function eventValue(realm,kind,type,init,{trusted=false,newTarget}={}){
 const common=record({bubbles:Boolean(init.bubbles),cancelable:Boolean(init.cancelable),composed:Boolean(init.composed)}),value=construct(realm.Event,[type,common],newTarget??realm.api[kind]);
 const provenance=platformFactoryRecord(value);if(provenance?.kind!=='Event')throw Error('Actual Event factory provenance is required');
 const state=record({kind,realm,value,implementation:provenance.implementation,trusted,...init});VALUES.set(value,state);state.implementation.isTrusted=trusted;registerPlatformFactory(value,{kind,implementation:state.implementation,globalObject:realm.window});return value;
}
function dispatch(target,event){const value=VALUES.get(target),data=VALUES.get(event),backend=value?.implementation??platformFactoryRecord(target)?.implementation;if(!backend||!data?.implementation)throw Error('Actual event target and event required');return backend._dispatch(data.implementation)}
function realmClasses(realm){
 const binding=realm.page.browser?.runtimeBinding??getRuntimeBinding();realm.binding=binding;
 const entry=(name,length,fn)=>{const value=binding.createEntry((incumbent,receiver,args)=>fn(receiver,args,WINDOWS.get(incumbent)),realm.Object);define(value,'name',{value:name,configurable:true});define(value,'length',{value:length,configurable:true});return value};
 const method=(prototype,name,length,fn)=>define(prototype,name,{value:entry(name,length,fn),writable:true,enumerable:true,configurable:true});
 const accessor=(prototype,name,get,set)=>define(prototype,name,{get:entry('get '+name,0,get),...(set?{set:entry('set '+name,1,set)}:{}),enumerable:true,configurable:true});
 for(const C of Object.values(realm.api))delete C.prototype.constructor;
 const N=realm.api.Navigation.prototype,E=realm.api.NavigationHistoryEntry.prototype,D=realm.api.NavigationDestination.prototype,A=realm.api.NavigationActivation.prototype;
 accessor(N,'activation',(receiver,_args,source)=>{const owner=typed(receiver,'Navigation',realm).owner;if(!owner.activation)return null;return produce(effectiveRealm(realm,source),'NavigationActivation',{owner,activation:owner.activation})});
 accessor(N,'canGoBack',receiver=>typed(receiver,'Navigation',realm).owner.root.historyIndex>0);
 accessor(N,'canGoForward',receiver=>{const root=typed(receiver,'Navigation',realm).owner.root;return root.historyIndex<root.history.length-1});
 accessor(N,'currentEntry',(receiver,_args,source)=>{const owner=typed(receiver,'Navigation',realm).owner;return entryObject(owner,current(owner),effectiveRealm(realm,source))});accessor(N,'transition',receiver=>{typed(receiver,'Navigation',realm);return null});
 for(const name of['back','entries','forward','navigate','reload','traverseTo','updateCurrentEntry']){if(name==='entries'){method(N,name,0,(receiver,_args,source)=>{const owner=typed(receiver,'Navigation',realm).owner,selected=effectiveRealm(realm,source);return array(selected,owner.root.history.map(entry=>entryObject(owner,entry,selected)))});continue}method(N,name,['navigate','traverseTo','updateCurrentEntry'].includes(name)?1:0,(receiver,args,source)=>performNavigation(typed(receiver,'Navigation',realm),name,args,source,realm))}
 for(const key of['id','index','key','sameDocument','url'])accessor(E,key,(receiver,_args,source)=>{const s=typed(receiver,'NavigationHistoryEntry',realm);if(key==='index')return s.owner.root.history.indexOf(s.entry);if(key==='sameDocument')return s.entry.documentId===actualPage(effectiveRealm(realm,source)).documentId;if(key==='url')return s.entry.url;return metadata(s.entry)[key]});
 method(E,'getState',0,(receiver,_args,source)=>{const state=typed(receiver,'NavigationHistoryEntry',realm);return parse(effectiveRealm(realm,source),state.entry.navigationStateJSON)});
 for(const key of['url','key','id','index','sameDocument'])accessor(D,key,receiver=>{const s=typed(receiver,'NavigationDestination',realm);if(key==='url')return s.url;if(key==='sameDocument')return s.sameDocument;if(key==='index')return s.entry?s.owner.root.history.indexOf(s.entry):-1;return s.entry?metadata(s.entry)[key]:''});
 method(D,'getState',0,(receiver,_args,source)=>{const state=typed(receiver,'NavigationDestination',realm);return parse(effectiveRealm(realm,source),state.stateJSON)});
 for(const key of['entry','from','navigationType'])accessor(A,key,(receiver,_args,source)=>{const s=typed(receiver,'NavigationActivation',realm),a=s.activation;if(key==='navigationType')return a.type;return a[key]?entryObject(s.owner,a[key],effectiveRealm(realm,source)):null});
 const V=realm.api.NavigateEvent.prototype,C=realm.api.NavigationCurrentEntryChangeEvent.prototype;
 for(const key of['navigationType','destination','canIntercept','userInitiated','hashChange','signal','formData','downloadRequest','info','hasUAVisualTransition','sourceElement'])accessor(V,key,receiver=>typed(receiver,'NavigateEvent',realm)[key]);
 for(const key of['from','navigationType'])accessor(C,key,(receiver,_args,source)=>{const s=typed(receiver,'NavigationCurrentEntryChangeEvent',realm);return key==='from'&&s.fromEntry?entryObject(s.owner,s.fromEntry,effectiveRealm(realm,source)):s[key]});
 for(const name of['intercept','scroll'])method(V,name,0,receiver=>{const s=typed(receiver,'NavigateEvent',realm);if(!s.trusted)throw realm.exception(name+'() may only be called on a trusted event.','SecurityError');if(s.implementation._canceledFlag)throw realm.exception(name+'() may not be called if the event has been canceled.','InvalidStateError');if(s.operation?.phase!=='dispatch')throw realm.exception(name+'() may only be called while the navigate event is being dispatched.','InvalidStateError');if(name==='scroll')throw realm.exception('intercept() must be called before scroll()','InvalidStateError');if(!s.canIntercept){const page=actualPage(realm);throw realm.exception(`A navigation with URL '${VALUES.get(s.destination).url}' cannot be intercepted by in a window with origin '${documentImpl(page.dom.window)._origin}' and URL '${page.url}'.`,'SecurityError')}});
 for(const [prototype,kind,types]of[[N,'Navigation',['navigate','currententrychange','navigatesuccess','navigateerror']],[E,'NavigationHistoryEntry',['dispose']]])for(const type of types){const key='on'+type;accessor(prototype,key,receiver=>typed(receiver,kind,realm).handlers?.get(type)?.listener??null,(receiver,args)=>{const s=typed(receiver,kind,realm);s.handlers??=new Map();const old=s.handlers.get(type);if(old)apply(realm.remove,s.value,[type,old.wrapper]);const listener=args[0];if(typeof listener!=='function'){s.handlers.delete(type);return}const wrapper=function(event){return apply(listener,receiver,[event])};s.handlers.set(type,record({listener,wrapper}));apply(realm.add,s.value,[type,wrapper])})}
 for(const [kind,C]of Object.entries(realm.api)){define(C.prototype,'constructor',{value:C,writable:true,configurable:true});define(C.prototype,realm.Symbol.toStringTag,{value:kind,configurable:true});define(realm.window,kind,{value:C,writable:true,configurable:true});registerPlatformFactoryKind(kind)}
 define(realm.window,'navigation',{get:entry('get navigation',0,receiver=>{const target=WINDOWS.get(receiver);if(!target)throw new realm.TypeError('Illegal invocation');return navigationObject(realm,target.page)}),enumerable:true,configurable:true});
}
function constructPublicEvent(realm,kind,newTarget,count,type,init){
 if(count<2||init===null||typeof init!=='object')throw new realm.TypeError('invalid argument');
 type=conversions.DOMString(type,{globals:realm.globals});
 if(kind==='NavigateEvent'){
  const destination=init.destination,signal=init.signal;if(VALUES.get(destination)?.kind!=='NavigationDestination'||platformFactoryRecord(signal)?.kind!=='AbortSignal')throw new realm.TypeError('invalid argument');
  const rawType=init.navigationType,navigationType=rawType===undefined?'push':conversions.DOMString(rawType,{globals:realm.globals});if(!['push','replace','reload','traverse'].includes(navigationType))throw new realm.TypeError('invalid argument');
  const formData=init.formData??null,sourceElement=init.sourceElement??null,rawDownload=init.downloadRequest;if(formData!==null&&platformFactoryRecord(formData)?.kind!=='FormData')throw new realm.TypeError('invalid argument');if(sourceElement!==null&&!(platformFactoryRecord(sourceElement)?.implementation instanceof ElementImpl))throw new realm.TypeError('invalid argument');
  return eventValue(realm,kind,type,{bubbles:init.bubbles,cancelable:init.cancelable,composed:init.composed,navigationType,destination,signal,formData,sourceElement,canIntercept:Boolean(init.canIntercept),userInitiated:Boolean(init.userInitiated),hashChange:Boolean(init.hashChange),downloadRequest:rawDownload==null?null:conversions.DOMString(rawDownload,{globals:realm.globals}),info:init.info,hasUAVisualTransition:Boolean(init.hasUAVisualTransition)},{newTarget});
 }
 const from=init.from;if(VALUES.get(from)?.kind!=='NavigationHistoryEntry')throw new realm.TypeError('invalid argument');const rawType=init.navigationType,navigationType=rawType==null?null:conversions.DOMString(rawType,{globals:realm.globals});if(navigationType!==null&&!['push','replace','reload','traverse'].includes(navigationType))throw new realm.TypeError('invalid argument');return eventValue(realm,kind,type,{bubbles:init.bubbles,cancelable:init.cancelable,composed:init.composed,from,navigationType},{newTarget});
}
export function installNavigationAPI(page,window){
 if(WINDOWS.has(window))return;
 const api=record({}),realm=record({page,window,documentId:page.documentId,api,Object:window.Object,Array:window.Array,create:window.Object.create,parse:window.JSON.parse,TypeError:window.TypeError,Symbol:window.Symbol,Promise:window.Promise,Event:window.Event,EventTarget:window.EventTarget,ErrorEvent:window.ErrorEvent,signalGetter:Object.getOwnPropertyDescriptor(window.AbortController.prototype,'signal').get,AbortController:window.AbortController,abort:window.AbortController.prototype.abort,add:window.EventTarget.prototype.addEventListener,remove:window.EventTarget.prototype.removeEventListener,globals:record({String:window.String,TypeError:window.TypeError,Number:window.Number}),exception:captureDOMExceptionFactory(window)});
 const bridge=record({construct:(...args)=>constructPublicEvent(realm,...args),export(...values){for(let i=0;i<values.length;i++)api[['Navigation','NavigationHistoryEntry','NavigationDestination','NavigationActivation','NavigateEvent','NavigationCurrentEntryChangeEvent'][i]]=values[i]}});
 vm.compileFunction(`(${bootstrap.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:utils.implForWrapper(window)._globalObject})(bridge);
 WINDOWS.set(window,realm);WINDOWS.set(utils.implForWrapper(window)._globalObject,realm);realmClasses(realm);
}
const enqueue=queueMicrotask;
function realmFor(page){return WINDOWS.get(page.dom?.window)}
function userJSON(realm,input){try{return stringify(input)??'undefined'}catch{throw realm.exception('The object can not be cloned','DataCloneError')}}
function returnPromises(realm,operation){
 const committed=construct(realm.Promise,[(resolve,reject)=>{operation.resolveCommitted=resolve;operation.rejectCommitted=reject}]),finished=construct(realm.Promise,[(resolve,reject)=>{operation.resolveFinished=resolve;operation.rejectFinished=reject}]);
 realm.binding.markPromiseHandled?.(committed);realm.binding.markPromiseHandled?.(finished);
 const value=apply(realm.create,undefined,[realm.Object.prototype]);for(const [key,promise]of[['committed',committed],['finished',finished]])define(value,key,{value:promise,writable:true,enumerable:true,configurable:true});return value;
}
function sendEvent(owner,event){if(owner.view)dispatch(owner.view.value,event)}
function plainEvent(realm,type,init={}){const value=construct(type==='navigateerror'?realm.ErrorEvent:realm.Event,[type,init]);const provenance=platformFactoryRecord(value);if(!provenance?.implementation)throw Error('Actual event provenance required');provenance.implementation.isTrusted=true;return record({value,implementation:provenance.implementation})}
function firePlain(owner,realm,type,init){if(!owner.view)return;const event=plainEvent(realm,type,init);owner.view.implementation._dispatch(event.implementation)}
function errorEvent(operation){if(!operation.errorPending)return;operation.errorPending=false;firePlain(operation.owner,operation.realm,'navigateerror',{error:operation.reason,message:'AbortError: Navigation was aborted',filename:operation.page.url,lineno:0,colno:0})}
function rejectOperation(operation){if(!operation.rejectionPending)return;operation.rejectionPending=false;if(!operation.committed)operation.rejectCommitted?.(operation.reason);operation.rejectFinished?.(operation.reason)}
function resolveFinished(operation){if(!operation.finishPending)return;operation.finishPending=false;operation.resolveFinished?.(undefined)}
function abortOperation(operation,reason,{cancelTransport=false}={}){
 if(!operation||operation.phase==='aborted'||operation.phase==='finished')return;
 if(operation.phase==='dispatch'&&operation.event)VALUES.get(operation.event).implementation._canceledFlag=true;
 operation.phase='aborted';if(operation.owner.operations.get(operation.page.frameId)===operation)operation.owner.operations.delete(operation.page.frameId);
 operation.reason=reason??operation.realm.exception('Navigation was aborted','AbortError');
 operation.rejectionPending=true;
 if(cancelTransport){operation.pending?.cancel?.('Navigation was aborted');if(operation.pending?.started)operation.page.navigationAbort?.abort()}
 operation.errorPending=Boolean(operation.event);if(operation.errorPending)enqueue(()=>errorEvent(operation));enqueue(()=>rejectOperation(operation));
 apply(operation.realm.abort,operation.controller,[operation.reason]);errorEvent(operation);rejectOperation(operation);
}
function finishOperation(operation){
 if(!operation||operation.phase==='aborted'||operation.phase==='finished')return;
 operation.phase='finished';if(operation.owner.operations.get(operation.page.frameId)===operation)operation.owner.operations.delete(operation.page.frameId);
 if(!operation.sameDocument)return;
 operation.committed=true;operation.resolveCommitted?.(undefined);
 operation.finishPending=true;enqueue(()=>resolveFinished(operation));if(operation.event||operation.source==='navigation')firePlain(operation.owner,operation.realm,'navigatesuccess');resolveFinished(operation);
}
function begin(page,details){
 const owner=session(page),realm=realmFor(page);if(!realm)return;
 if(!page.parentFrameId)abortOperation(owner.operations.get(page.frameId));
 const implementation=owner.view?.implementation,listeners=implementation?._eventListeners;
 const observed=['navigate','navigateerror','navigatesuccess'].some(type=>listeners?.[type]?.length);
 if(!details.api&&(!observed||page.parentFrameId||initialHistoryNavigation(page)))return;
 const controller=construct(realm.AbortController,[]),operation=record({owner,page,realm,controller,signal:apply(realm.signalGetter,controller,[]),phase:'preparing',source:details.source??'history',stateJSON:details.stateJSON,sameDocument:Boolean(details.sameDocument),committed:false});
 if(details.api)operation.result=returnPromises(details.methodRealm??realm,operation);
 owner.operations.set(page.frameId,operation);
 // Keep ownership before event handlers: VM termination can skip JS finally.
 enqueue(()=>{if(operation.phase==='preparing'||operation.phase==='dispatch'||operation.phase==='updating'||operation.phase==='waiting'&&operation.sameDocument&&!operation.committed)abortOperation(operation,undefined,{cancelTransport:true})});
 if(!page.parentFrameId&&!initialHistoryNavigation(page)){
  const destination=produce(realm,'NavigationDestination',{owner,url:details.url,sameDocument:Boolean(details.sameDocument),entry:details.entry??null,stateJSON:details.entry?details.entry.navigationStateJSON:details.stateJSON});
  const event=eventValue(realm,'NavigateEvent','navigate',{navigationType:details.kind,destination,canIntercept:false,userInitiated:false,hashChange:Boolean(details.hashChange),signal:operation.signal,formData:details.formData??null,downloadRequest:null,info:details.info,hasUAVisualTransition:false,sourceElement:details.sourceElement??null,cancelable:details.kind!=='traverse'||Boolean(details.sameDocument),operation},{trusted:true});
  operation.event=event;operation.phase='dispatch';sendEvent(owner,event);
  if(VALUES.get(event).implementation._canceledFlag||operation.phase==='aborted'){abortOperation(operation);return details.api?operation:false}
 }
 operation.phase='waiting';if(!operation.sameDocument){operation.resolveCommitted=operation.rejectCommitted=operation.resolveFinished=operation.rejectFinished=undefined}return operation;
}
function disposeEntries(owner,realm,entries){const pending=record({index:0,entries});const flush=()=>{while(pending.index<pending.entries.length){const entry=pending.entries[pending.index++],value=owner.entries.get(entry);if(value){const event=plainEvent(realm,'dispose');VALUES.get(value).implementation._dispatch(event.implementation)}}};enqueue(flush);return flush}
function changed(page,details){
 const owner=session(page),realm=realmFor(page);if(!realm)return;
 const operation=details.operation;if(operation){if(operation.phase==='aborted')return;operation.committed=true;operation.phase=operation.sameDocument?'committed-dispatch':'committed';operation.resolveCommitted?.(undefined);if(operation.sameDocument)enqueue(()=>{if(operation.phase==='committed-dispatch')finishOperation(operation)})}
 const flush=disposeEntries(owner,realm,details.disposed??[]);
 if(owner.view&&(details.classic||details.update||operation?.sameDocument)){
  const event=eventValue(realm,'NavigationCurrentEntryChangeEvent','currententrychange',{owner,fromEntry:details.previous,navigationType:details.kind},{trusted:true});sendEvent(owner,event);
 }
 flush();
 if(operation?.phase==='committed-dispatch'){operation.phase='committed';enqueue(()=>finishOperation(operation))}
}
function performNavigation(target,name,args,source,methodRealm){
 const activeRealm=effectiveRealm(methodRealm,source),owner=target.owner,page=actualPage(activeRealm),realm=realmFor(page)??activeRealm,root=owner.root;
 if(page.context!==root.context)throw methodRealm.exception('Navigation contexts do not match','SecurityError');
 if(name==='updateCurrentEntry'){
  if(!args.length||args[0]===null||typeof args[0]!=='object'||!('state'in args[0]))throw new methodRealm.TypeError('invalid argument');const state=args[0].state,text=userJSON(methodRealm,state);updateNavigationState(page,text);return;
 }
 let url,kind='push',selected=null,stateJSON,info,options,reloadStateProvided=false;
 if(name==='navigate'){
  if(!args.length)throw new methodRealm.TypeError('invalid argument');const text=conversions.USVString(args[0],{globals:methodRealm.globals});try{url=new URL(text,page.url).href}catch{throw new methodRealm.TypeError('')}
  options=args.length>1?args[1]:undefined;kind=options?.history==='replace'?'replace':'push';const state=options?.state;if(state!==undefined)stateJSON=userJSON(methodRealm,state);info=options?.info;
 }else{
  options=args.length?args[0]:undefined;info=options?.info;
  if(name==='reload'){kind='reload';const state=options?.state;reloadStateProvided=state!==undefined;if(reloadStateProvided)stateJSON=userJSON(methodRealm,state);selected=current(owner);url=selected.url;if(!reloadStateProvided)stateJSON=selected.navigationStateJSON}
  else{kind='traverse';let index=root.historyIndex+(name==='back'?-1:1);if(name==='traverseTo'){if(!args.length)throw new methodRealm.TypeError('invalid argument');const key=conversions.DOMString(args[0],{globals:methodRealm.globals});index=root.history.findIndex(entry=>metadata(entry).key===key);info=args.length>1?args[1]?.info:undefined}if(index<0||index>=root.history.length)throw methodRealm.exception('The object is in an invalid state','InvalidStateError');selected=root.history[index];url=selected.url;stateJSON=selected.navigationStateJSON}
 }
 const sameDocument=kind==='traverse'?selected.documentId===page.documentId:kind!=='reload'&&url.split('#')[0]===page.url.split('#')[0];
 const operation=begin(page,{api:true,methodRealm:activeRealm,source:'navigation',kind,url,entry:kind==='traverse'?selected:null,stateJSON,info,sameDocument,hashChange:sameDocument&&url!==page.url&&url.split('#')[0]===page.url.split('#')[0]});
 const result=operation.result;if(operation.phase==='aborted')return result;
 if(reloadStateProvided){operation.phase='updating';updateNavigationState(page,stateJSON,'reload');if(operation.phase==='updating')operation.phase='waiting'}
 if(sameDocument){
  if(kind==='traverse')void traverseJointHistory(page,root.history.indexOf(selected),{navigationOperation:operation}).catch(()=>abortOperation(operation));
  else commitNavigationState(page,page.dom.window,url,stateJSON??'null',kind,operation)
 }else{requestNavigation(page,page.dom.window,url,{historyMode:kind,historyIndex:selected?root.history.indexOf(selected):undefined,method:'GET',historyEntry:selected,navigationStateJSON:stateJSON,navigationOperation:operation})}
 return result;
}
function linked(operation,pending){if(!operation||!pending)return;operation.pending=pending;pending.promise.then(()=>finishOperation(operation),()=>{if(operation.sameDocument)abortOperation(operation);else finishOperation(operation)})}
setNavigationLifecycle(record({begin,document(page,details){const owner=session(page);owner.activation=record({entry:details.entry,from:details.initial?null:details.previous??null,type:details.kind});if(!page.parentFrameId){owner.view=null;owner.entries=new WeakMap()}},committed:changed,linked,stop(page){abortOperation(session(page).operations.get(page.frameId),undefined,{cancelTransport:true})}}));
