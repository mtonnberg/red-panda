import {beforeNavigation,committedNavigation,documentNavigation} from './navigation-lifecycle.js';
import 'jsdom';
import {createRequire} from 'node:module';
import {getRuntimeBinding} from './native-runtime.js';
import {requestNavigation} from './navigation.js';
import {subscribePlatformFactories,platformFactoryRecord} from './platform-factories.js';
import {captureDOMExceptionFactory} from './worker-dom-exception.js';
import {onFrameRetirement} from './frame-activity.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const HistoryImpl=require('jsdom/lib/jsdom/living/window/History-impl.js').implementation;
const implementationMethods=Object.freeze(Object.assign(Object.create(null),{pushState:HistoryImpl.prototype.pushState,replaceState:HistoryImpl.prototype.replaceState}));
const {fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');
const PopStateEvent=require('jsdom/lib/jsdom/living/generated/PopStateEvent.js'),HashChangeEvent=require('jsdom/lib/jsdom/living/generated/HashChangeEvent.js');
const conversions=require('webidl-conversions'),{serializeURL}=createRequire(require.resolve('jsdom/lib/jsdom/living/window/History-impl.js'))('whatwg-url');
const WINDOWS=new WeakMap(),HISTORIES=new WeakMap(),PAGES=new WeakMap(),SESSIONS=new WeakMap(),PAYLOADS=new WeakMap();
const apply=Reflect.apply,define=Object.defineProperty,stringify=JSON.stringify,parse=JSON.parse,record=value=>Object.assign(Object.create(null),value);
const session=page=>page.parentFrameId?page.registry.page:page;
const sessionState=page=>{const root=session(page);let state=SESSIONS.get(root);if(!state){state=record({initial:true});SESSIONS.set(root,state)}return state};
export function normalizeHistoryNavigation(page,mode){const state=sessionState(page),initial=state.initial;state.initial=false;return initial?'replace':mode}
const current=page=>{const root=session(page);return root.history[root.historyIndex]};
const active=state=>!state.page.closed&&!state.page.retired&&!state.signal?.aborted;
function json(value,window){try{return stringify(value)??'undefined'}catch{throw (WINDOWS.get(window)?.exception??captureDOMExceptionFactory(window))('The object can not be cloned','DataCloneError')}}
function value(state,text){return apply(state.parse,undefined,[text])}
function implementationValue(text){if(text==='undefined')return undefined;const copy=parse(text);if(copy!==null&&typeof copy==='object')PAYLOADS.set(copy,text);return copy}
// Only actual privately serialized payload identities are translated at this
// successful real PopStateEvent producer seam. Authored objects/lookalikes stay
// untouched, and no VM clone is retained as internal history state.
subscribePlatformFactories((_wrapper,provenance)=>{if(provenance.kind!=='PopStateEvent')return;const implementation=provenance.implementation,text=PAYLOADS.get(implementation.state),realm=WINDOWS.get(provenance.globalRef?.deref());if(text!==undefined&&realm)implementation.state=value(realm,text)});
function stored(entry){return entry?.stateJSON??(stringify(entry?.state??null)??'undefined')}
export function historyState(page,window){const state=WINDOWS.get(window);if(!state)throw new Error('History realm is not installed');return value(state,stored(current(page)))}
export function commitJointHistory(page,url,state=null,mode='push',stateJSON,operation){
 const root=session(page),text=stateJSON??(operation?.source==='navigation'?operation.stateJSON:undefined)??json(state,PAGES.get(page)?.window??page.dom?.window??root.dom?.window);
 const previous=root.history[root.historyIndex],disposed=mode==='replace'&&previous?[previous]:root.history.slice(root.historyIndex+1),id=root.nextHistoryId++;
 const entry=record({id,navigationKey:mode==='replace'&&previous?(previous.navigationKey??String(previous.id-1)):String(id-1),url,state:text==='undefined'?undefined:parse(text),stateJSON:text,navigationStateJSON:operation?.source==='navigation'?operation.stateJSON:undefined,documentId:page.documentId,frameId:page.frameId});
 if(mode==='replace'&&root.historyIndex>=0)root.history[root.historyIndex]=entry;
 else{root.history.splice(root.historyIndex+1);root.history.push(entry);root.historyIndex=root.history.length-1}
 committedNavigation(page,{previous,entry,kind:mode,disposed,operation,classic:stateJSON!==undefined});return entry;
}
export function planHistoryURL(page,window,url,kind='push'){
 const state=WINDOWS.get(window),document=state.implementation._document,current=document._URL,destination=url===null||url===''?current:document.encodingParseAURL(url);
 if(!destination)throw new state.TypeError('');
 const authority=['scheme','username','password','host','port'].every(key=>key==='host'?JSON.stringify(destination.host)===JSON.stringify(current.host):destination[key]===current[key]);
 if(!authority||(!['http','https'].includes(current.scheme)&&serializeURL(destination,true)!==serializeURL(current,true)))throw state.exception(`${kind}State() cannot update history to the URL ${serializeURL(destination)}.`,'SecurityError');
 return serializeURL(destination);
}
export function commitNavigationState(page,window,url,text,mode,operation){
 const state=WINDOWS.get(window),old=page.url,next=planHistoryURL(page,window,url);writeImplementation(state,mode==='replace'?'replaceState':'pushState',implementationValue(text),'',next);
 page.url=next;if(new URL(old).hash!==new URL(next).hash)queueHistoryHash(page,old,next);const entry=commitJointHistory(page,next,text==='undefined'?undefined:parse(text),mode,text,operation);page.emit?.('withinDocument',{url:next,navigationType:'historyApi'});return entry;
}
export function updateNavigationState(page,text,kind=null){
 const root=session(page),entry=current(page);entry.stateJSON=text??'null';entry.state=text===undefined?null:text==='undefined'?undefined:parse(text);entry.navigationStateJSON=text;
 committedNavigation(page,{previous:entry,entry,kind,disposed:[],update:true});return entry;
}
export function initialHistoryNavigation(page){return sessionState(page).initial}
function writeImplementation(state,name,data,title,url,exception=state.exception){
 const implementation=state.implementation,document=implementation._document,current=document._URL;
 if(typeof current.path!=='string'||!implementation._window)return apply(implementationMethods[name],implementation,[data,title,url]);
 // Pinned jsdom assumes every URL path is an Array. Real opaque URL records
 // have a String path; use their genuine session history for the permitted
 // fragment-only rewrite, preserving the actual opaque record throughout.
 const destination=url===null||url===''?current:document.encodingParseAURL(url);
 if(!destination||serializeURL(destination,true)!==serializeURL(current,true))throw exception('The history URL cannot update this document','SecurityError');
 const history=implementation._window._sessionHistory;
 if(name==='pushState'){history.removeAllEntriesAfterCurrentEntry();history.clearHistoryTraversalTasks();const entry={document,stateObject:data,url:destination};history.addEntryAfterCurrentEntry(entry);history.updateCurrentEntry(entry)}
 else{history.currentEntry.stateObject=data;history.currentEntry.url=destination}
 document._URL=destination;document._clearBaseURLCache();implementation._state=data;document._latestEntry=history.currentEntry;
}
function restore(state,entry,url=entry.url){return writeImplementation(state,'replaceState',implementationValue(stored(entry)),'',url)}
export function installJointHistory(page,window,initialState=null){
 if(WINDOWS.has(window))return;
 if(page.parentFrameId){const root=session(page);for(const key of ['history','historyIndex','nextHistoryId'])define(page,key,{get:()=>root[key],set:next=>{root[key]=next},configurable:true});page.commitHistory=(...args)=>commitJointHistory(page,...args);page.traverseHistory=(...args)=>traverseJointHistory(page,...args)}
 const history=window.history,prototype=window.History.prototype,provenance=platformFactoryRecord(history);if(provenance?.kind!=='History')throw new Error('Actual History factory provenance is required');
 const state=record({page,window,history,implementation:provenance.implementation,windowImpl:utils.implForWrapper(window),parse:window.JSON.parse,globals:record({TypeError:window.TypeError,String:window.String,Number:window.Number}),setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window),tasks:new Set(),TypeError:window.TypeError,exception:captureDOMExceptionFactory(window),signal:page.documentAbort?.signal,scrollRestoration:'auto'});
 WINDOWS.set(window,state);WINDOWS.set(state.windowImpl._globalObject,state);HISTORIES.set(history,state);PAGES.set(page,state);
 sessionState(page);if(!page.parentFrameId&&!page.history.length)commitJointHistory(page,window.location.href);
 const cancel=()=>{for(const timer of state.tasks)state.clearTimeout(timer);state.tasks.clear()};const unsubscribe=onFrameRetirement(window,cancel);state.signal?.addEventListener('abort',()=>{cancel();unsubscribe()},{once:true});
 page.nativeHistoryReplace=(data,title,url)=>writeImplementation(state,'replaceState',implementationValue(json(data,window)),title,url);
 if(initialState!==null){const entry=current(page);if(entry)restore(state,entry,window.location.href)}
 const binding=page.browser?.runtimeBinding??getRuntimeBinding();
 const entry=(name,length,callback)=>{const fn=binding.createEntry((incumbent,receiver,args)=>{const target=HISTORIES.get(receiver);if(!target)throw new state.TypeError('Illegal invocation');return callback(target,WINDOWS.get(incumbent),args)},window.Object);define(fn,'name',{value:name,configurable:true});define(fn,'length',{value:length,configurable:true});return fn};
 const method=(name,length,callback)=>define(prototype,name,{value:entry(name,length,callback),writable:true,enumerable:true,configurable:true});
 define(prototype,'length',{get:entry('get length',0,target=>session(target.page).history.length),enumerable:true,configurable:true});
 define(prototype,'state',{get:entry('get state',0,target=>value(state,stored(current(target.page)))),enumerable:true,configurable:true});
 define(prototype,'scrollRestoration',{get:entry('get scrollRestoration',0,target=>target.scrollRestoration),set:entry('set scrollRestoration',1,(target,_source,args)=>{const next=conversions.DOMString(args.length?args[0]:undefined,{globals:state.globals,context:'History.scrollRestoration'});if(next==='auto'||next==='manual')target.scrollRestoration=next}),enumerable:true,configurable:true});
 for(const name of ['pushState','replaceState'])method(name,2,(target,_source,args)=>{
  if(args.length<2)throw new state.TypeError(`Failed to execute '${name}' on 'History': 2 arguments required, but only ${args.length} present.`);
  const globals=state.globals,context=`Failed to execute '${name}' on 'History'`;
  const title=conversions.DOMString(args[1],{globals,context:context+': parameter 2'}),rawURL=args.length>2?args[2]:undefined;
  const url=rawURL===null||rawURL===undefined?null:conversions.USVString(rawURL,{globals,context:context+': parameter 3'});
  const text=json(args[0],window),copy=implementationValue(text),kind=name==='pushState'?'push':'replace',next=planHistoryURL(target.page,target.window,url,kind);
  const operation=beforeNavigation(target.page,{kind,url:next,sameDocument:true,classic:true,stateJSON:undefined});if(operation===false)return;
  const result=writeImplementation(target,name,copy,title,next,state.exception);target.page.url=next;
  commitJointHistory(target.page,next,copy,kind,text,operation);
  target.page.emit?.('withinDocument',{url:next,navigationType:'historyApi'});return result;
 });
 const navigate=(target,source,args,distance)=>{
  if(!source)throw new state.TypeError('History navigation requires a registered incumbent realm');
  if(!active(source))return;
  if(source.page.context!==target.page.context)throw state.exception('History contexts belong to different browser contexts','SecurityError');
  const delta=distance??(!args.length||args[0]===undefined?0:conversions.long(args[0],{globals:state.globals,context:"Failed to execute 'go' on 'History': parameter 1"}));
  const root=session(source.page),index=root.historyIndex+delta;
  if(delta===0){requestNavigation(source.page,source.window,source.window.location.href,{historyMode:'reload',method:'GET'});return}
  if(index<0||index>=root.history.length)return;
  const selected=root.history[index];
  if(selected.documentId===source.page.documentId){void traverseJointHistory(source.page,index).catch(error=>source.page.emit?.('pageError',error));return}
  requestNavigation(source.page,source.window,selected.url,{historyMode:'traverse',historyIndex:index,method:'GET',historyEntry:selected});
 };
 method('back',0,(target,source,args)=>navigate(target,source,args,-1));method('forward',0,(target,source,args)=>navigate(target,source,args,1));method('go',0,(target,source,args)=>navigate(target,source,args));
 // All retained controller records and serialized payloads are Host allocations.
 return state;
}
export function queueHistoryHash(page,oldURL,newURL){const state=PAGES.get(page),target=state.windowImpl;let timer;timer=state.setTimeout(()=>{state.tasks.delete(timer);if(active(state))fireAnEvent('hashchange',target,HashChangeEvent,{oldURL,newURL})},0);state.tasks.add(timer);}
export async function traverseJointHistory(page,index,{forceReload=false,navigationOperation}={}){
 page.current?.();const root=session(page);if(!Number.isInteger(index)||index<0||index>=root.history.length)return false;
 const selected=root.history[index],state=PAGES.get(page);
 if(!forceReload&&selected.documentId===page.documentId){
  const operation=navigationOperation??beforeNavigation(page,{kind:'traverse',url:selected.url,sameDocument:true,entry:selected,stateJSON:selected.navigationStateJSON});if(operation===false)return false;const previous=current(page),old=page.url;restore(state,selected);root.historyIndex=index;page.url=selected.url;
  const changed=new URL(old).hash!==new URL(selected.url).hash;
  const target=state.windowImpl;
  // Own the queued hash task before entering any driver/authored callback.
  // VM termination can bypass finally; retirement/abort still clears this task.
  if(changed)queueHistoryHash(page,old,page.url);
  committedNavigation(page,{previous,entry:selected,kind:'traverse',disposed:[],operation});
  page.emit?.('withinDocument',{url:page.url,navigationType:changed?'fragment':'historyApi'});
  fireAnEvent('popstate',target,PopStateEvent,{state:value(state,stored(selected))});
 }else await page.navigate(selected.url,{historyMode:'traverse',historyIndex:index,method:'GET',historyEntry:selected});
 return true;
}
export function commitFrameHistory(page,{historyMode='push',historyIndex,navigationOperation}={},request){
 if(!PAGES.has(page))return;const root=session(page);if(['about:blank','about:srcdoc'].includes(page.url)||page.url.startsWith('blob:'))return;const initial=initialHistoryNavigation(page);historyMode=normalizeHistoryNavigation(page,historyMode);const previousHistoryEntry=current(page);
 if(historyMode==='traverse'||(historyMode==='reload'&&root.historyIndex>=0)){
  const index=historyMode==='reload'?root.historyIndex:historyIndex,entry=root.history[index];if(!entry)throw new Error('History entry no longer exists');
  const previous=entry.documentId;for(const item of root.history)if(item.documentId===previous){item.documentId=page.documentId;item.frameId=page.frameId;}
  root.historyIndex=index;if(historyMode!=='reload')entry.url=page.url;entry.frameId=page.frameId;restore(PAGES.get(page),entry,page.url);
 }else commitJointHistory(page,page.url,null,historyMode==='replace'?'replace':'push',undefined,navigationOperation);
 if(navigationOperation?.source==='navigation')restore(PAGES.get(page),current(page));
 if(request?.historyRequest)current(page).request=request.historyRequest;
 documentNavigation(page,{previous:previousHistoryEntry,entry:current(page),kind:historyMode,operation:navigationOperation,initial});
}
export function commitBlankPopupHistory(page){if(page.url==='about:blank'&&sessionState(page).initial){normalizeHistoryNavigation(page,'replace');const entry=commitJointHistory(page,'about:blank',null,'replace');documentNavigation(page,{entry,previous:null,kind:'replace',initial:true})}}
