// Real Page/VM/Document popup contexts owned by an existing CDP Page. Public
// handles are the actual jsdom Window globals, never popup facades or Proxies.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {retireFrameActivity} from './frame-activity.js';
import {installListenerOwnership} from './listener-ownership.js';
import {captureDOMExceptionFactory} from './worker-dom-exception.js';
const require=createRequire(import.meta.url),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {parseURL}=createRequire(require.resolve('jsdom/lib/jsdom/browser/Window.js'))('whatwg-url');
const WINDOWS=new WeakMap(),PAGES=new WeakMap(),ROOTS=new WeakMap(),NAMES=new WeakMap(),REGISTRIES=new WeakSet();
const apply=Reflect.apply,schedule=setTimeout,clear=clearTimeout;
const record=value=>Object.assign(Object.create(null),value);
const rootFor=page=>{const seen=new Set();while(page.registry?.page&&page.registry.page!==page&&!seen.has(page)){seen.add(page);page=page.registry.page}return page};
function rootRecord(page){const root=rootFor(page);let state=ROOTS.get(root);if(!state){state=record({page:root,popups:new Set(),tasks:new Set()});ROOTS.set(root,state)}return state}
export function initializePopupPage(page,config){if(!config)return;const state=record({...config,page,closed:false,announced:false});PAGES.set(page,state);page.registry=state.root.frames;page.newDocumentScripts=state.root.newDocumentScripts;for(const name of['userAgent','acceptLanguage','platform','userAgentMetadata','timeout','javascript'])page[name]=state.root[name];page.extraHTTPHeaders=new Headers(state.root.extraHTTPHeaders);rootRecord(state.root).popups.add(page)}
export const isPopupPage=page=>PAGES.has(page);
export function preparePopupDocument(page,window){
 const state=PAGES.get(page);if(!state||page.url!=='about:blank')return;
 const document=implForWrapper(window.document);document._origin=state.origin;window._origin=state.origin;
 const base=parseURL(state.baseURL);document._fallbackBaseURL=()=>base;document._clearBaseURLCache();
}
function frame(page){const w=page.dom.window;return{id:page.frameId,loaderId:page.loaderId,url:page.url,name:NAMES.get(page)??'',securityOrigin:implForWrapper(w.document)._origin,mimeType:page.mimeType}}
function announce(page,name,payload){const state=PAGES.get(page);state.root.emitFrameEvent(name,payload)}
function commit(page){const state=PAGES.get(page);if(page.closed)return;state.announced=true;state.lastContextId=page.executionContextId;state.root.attachedFrames.add(page.frameId);announce(page,'frameNavigated',{frame:frame(page),page});announce(page,'frameContextCreated',{frameId:page.frameId,page})}
export function bindPopupPage(page){
 const state=PAGES.get(page),root=state.root;
 page.on('navigationStarted',()=>{if(!state.closed){root.attachedFrames.add(page.frameId);announce(page,'frameNavigationStarted',{frameId:page.frameId,loaderId:page.loaderId,url:state.pendingURL??page.url})}});
 page.on('navigated',()=>commit(page));
 page.on('contextsCleared',()=>{if(state.announced){announce(page,'frameContextDestroyed',{frameId:page.frameId,executionContextId:state.lastContextId});state.announced=false}});
 for(const name of['frameAttached','frameDetached','frameNavigationStarted','frameNavigated','frameContextCreated','frameContextDestroyed','frameDOMContentLoaded','frameLoad','frameWithinDocument','frameConsole','framePageError'])page.on(name,value=>root.emitFrameEvent(name,value));
 page.on('utilityWindowPrepared',value=>root.emit('utilityWindowPrepared',value));
 page.on('console',value=>announce(page,'frameConsole',{...value,frameId:page.frameId,executionContextId:page.executionContextId}));
 page.on('pageError',error=>announce(page,'framePageError',{frameId:page.frameId,executionContextId:page.executionContextId,error}));
 page.on('withinDocument',value=>announce(page,'frameWithinDocument',{...value,frameId:page.frameId}));
 for(const name of['request','response','requestFailed'])page.on(name,value=>root.emit(name,value));
 // The initial about:blank document already has its genuine Window/realm.
 // Nonblank requests commit through the normal Page.navigate machinery.
 return state;
}
function attachRegistry(root){
 const registry=root.frames;if(!registry||REGISTRIES.has(registry))return;REGISTRIES.add(registry);
 const originals={findFrame:registry.findFrame,findContext:registry.findContext,executionPages:registry.executionPages,findDocument:registry.findDocument};
 const children=()=>[...rootRecord(root).popups].filter(page=>!page.closed&&PAGES.get(page).announced);
 registry.findFrame=id=>originals.findFrame(id)??children().map(page=>page.frames?.findFrame(id)??(page.frameId===id?page:undefined)).find(Boolean);
 registry.findContext=id=>originals.findContext(id)??children().map(page=>page.frames?.findContext(id)??(page.executionContextId===id?{page,window:page.dom.window,context:page.dom.getInternalVMContext(),frameId:page.frameId}:undefined)).find(Boolean);
 registry.executionPages=()=>[...new Set([...originals.executionPages(),...children().flatMap(page=>[page,...(page.frames?.executionPages()??[])])])];
 registry.findDocument=document=>registry.executionPages().find(page=>page.dom.window.document===document);
 for(const page of rootRecord(root).popups){page.registry=registry;root.attachedFrames.add(page.frameId);root.committedFrames.add(page.frameId)}
}
function popupRealm(g,b){
 'use strict';const TypeError=g.TypeError,String=g.String,apply=g.Reflect.apply,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor;
 const description=descriptor(g.Symbol.prototype,'description').get,wellFormed=g.String.prototype.toWellFormed;
 const text=value=>apply(wellFormed,String(typeof value==='symbol'?apply(description,value,[]):value),[]),optional=value=>value===null||value===undefined?'':text(value);
 const receiver=value=>{value=value===null||value===undefined?g:value;if(!b.has(value))throw new TypeError('Illegal invocation');return value};
 const methods={open(){const target=receiver(this),url=optional(arguments[0]),name=optional(arguments[1]),features=optional(arguments[2]);return b.open(target,url,name,features)},close(){b.close(receiver(this))}};
 const accessors={get opener(){return b.opener(receiver(this))},set opener(value){b.opener(receiver(this),value,true)},get name(){return b.name(receiver(this))},set name(value){b.name(receiver(this),text(value),true)}};
 for(const key of['open','close'])define(g,key,{value:methods[key],writable:true,enumerable:true,configurable:true});
 for(const key of['opener','name'])define(g,key,{...descriptor(accessors,key),enumerable:true,configurable:true});
}
function retainDocument(window,close){
 const document=window.document,impl=implForWrapper(document),body=impl.body,own=body&&Object.getOwnPropertyDescriptor(body,'_replaceAll'),replace=body?._replaceAll;let pending=true;
 if(body)Object.defineProperty(body,'_replaceAll',{writable:true,configurable:true,value(node,...args){if(pending&&node?.nodeType===11&&!node.firstChild){pending=false;return}return apply(replace,this,[node,...args])}});
 try{return close()}
 finally{window._document=document;impl._defaultView=null;if(body){if(own)Object.defineProperty(body,'_replaceAll',own);else delete body._replaceAll}}
}
export function disposeBrowsingWindow(window,{retain=false}={}){const state=WINDOWS.get(window)??WINDOWS.get(window?._globalProxy);const close=state?()=>apply(state.cleanup,state.window,[]):()=>window.close();if(state)state.disposed=true;return retain?retainDocument(state?.window??window,close):close()}
export function disposeOwnedPopups(page){const state=ROOTS.get(page);if(!state)return;for(const timer of state.tasks)clear(timer);state.tasks.clear();for(const child of [...state.popups])child.close();state.popups.clear()}
function retire(page){
 const state=PAGES.get(page);if(!state||state.closed)return;state.closed=true;page.retired=true;page.navigationGeneration++;page.navigationAbort?.abort();
 retireFrameActivity(page.dom.window);disposeBrowsingWindow(page.dom.window,{retain:true});
}
function queueNavigation(page,url){
 const state=PAGES.get(page),root=rootRecord(state?.root??page),owner=state?.root??page;
 if(state)state.pendingURL=url;
 let timer;timer=schedule(()=>{root.tasks.delete(timer);if(page.closed||state?.closed||owner.closed)return;void page.navigate(url,{referrer:state?.referrer??'',waitUntil:'none'}).catch(error=>{if(!page.closed&&!state?.closed)page.emit('pageError',error)})},0);root.tasks.add(timer);
}
export function installWindowOpen(page,window){
 if(WINDOWS.has(window))return;const document=implForWrapper(window.document),state=record({page,window,document,cleanup:window.close,disposed:false,opener:PAGES.get(page)?.opener??null});WINDOWS.set(window,state);WINDOWS.set(implForWrapper(window)._globalObject,state);
 const popup=PAGES.get(page);if(popup&&!NAMES.has(page))NAMES.set(page,popup.name);
 const exception=captureDOMExceptionFactory(window);
 const bridge=record({has:value=>WINDOWS.has(value),
  name(value,next,set=false){const target=WINDOWS.get(value);if(set)NAMES.set(target.page,next);return NAMES.get(target.page)??''},
  opener(value,next,set=false){const target=WINDOWS.get(value);if(set){target.opener=next;return}const opener=target.opener,owner=WINDOWS.get(opener);return owner&&(owner.disposed||owner.page.closed||owner.page.retired||owner.document._defaultView===null)?null:opener},
  close(value){retire(WINDOWS.get(value).page)},
  open(value,raw,name,features){const source=WINDOWS.get(value),root=rootFor(source.page);let url;
   try{url=new URL(raw||'about:blank',source.document.baseURLSerialized()).href}catch{throw exception('The string did not match the expected pattern','SyntaxError')}
   const noOpener=features.toLowerCase().split(/[\s,]+/).some(token=>['noopener','noreferrer'].includes(token.split('=')[0]));
   const reserved=name.toLowerCase();if(['_self','_parent','_top'].includes(reserved)){const selected=reserved==='_self'?value:reserved==='_parent'?source.window.parent:source.window.top,target=WINDOWS.get(selected);queueNavigation(target.page,url);return noOpener?null:selected}
   const owner=rootRecord(root);let target;
   if(name&&reserved!=='_blank')target=[...owner.popups].find(candidate=>!candidate.closed&&!PAGES.get(candidate).closed&&NAMES.get(candidate)===name);
   if(target){if(raw&&url!=='about:blank')queueNavigation(target,url);return noOpener?null:target.dom.window}
   const config=record({root,opener:noOpener?null:source.window,name:reserved==='_blank'?'':name,origin:source.document._origin,baseURL:source.document.baseURLSerialized(),referrer:source.document.URL});
   target=source.page.browser.createPopupPage(source.page.context.id,config);bindPopupPage(target);
   if(url==='about:blank'){root.attachedFrames.add(target.frameId);announce(target,'frameNavigationStarted',{frameId:target.frameId,loaderId:target.loaderId,url});commit(target)}else queueNavigation(target,url);
   return noOpener?null:target.dom.window;
  },
 });
 vm.compileFunction(`(${popupRealm.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:implForWrapper(window)._globalObject})(bridge);
 if(!page.registry)attachRegistry(page);
 if(popup){
  const ownership=installListenerOwnership(window);ownership.add(window.document,'DOMContentLoaded',()=>{if(!popup.closed&&popup.announced)announce(page,'frameDOMContentLoaded',{frameId:page.frameId,loaderId:page.loaderId})});
  ownership.add(window,'load',()=>{if(!popup.closed&&popup.announced)announce(page,'frameLoad',{frameId:page.frameId,loaderId:page.loaderId})});
 }
}
