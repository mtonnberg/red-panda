import { installCanvas } from './canvas.js';
import {installCSSNamespace} from './css-namespace.js';
import { installImageData } from './image-data.js';
import {installFonts} from './fonts.js';
import {installUtilityLayout} from './utility-layout.js';
import {installUtilityAnimationFrame} from './utility-platform.js';
import {installUtilityIntersection} from './utility-observers.js';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createIsolatedWorld,utilityWrapperRecord,canonicalUtilityValue} from './isolated-world.js';
import {captureProtocolRealm} from './realm-values.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const META=new WeakMap(),STORES=new WeakMap(),ROOT_SESSIONS=new WeakMap(),REALMS=new WeakMap(),BY_CONTEXT=new WeakMap(),WINDOW_OWNERS=new WeakMap();
let FACTORY_HOOKS={};
export function configureUtilityFactories(hooks={}){FACTORY_HOOKS={...hooks};}
const rootFor=page=>page.registry?.page??page;
const contextFor=window=>utils.implForWrapper(window.document)._globalObject;
const live=record=>!record.disposed&&!record.page.closed&&!record.signal.aborted;
function rootSessions(page){const root=rootFor(page);let sessions=ROOT_SESSIONS.get(root);if(!sessions){sessions=new Set();ROOT_SESSIONS.set(root,sessions);}return sessions;}
function pages(session){return [...new Set(session.page.frames?.executionPages?.()??[session.page,...(session.page.frames?.frames.values()??[])])].filter(page=>!page.closed);}
function mainRealm(page,window=page.dom.window){const context=contextFor(window);WINDOW_OWNERS.set(window,page);WINDOW_OWNERS.set(context,page);let record=REALMS.get(context);if(!record){record={page,global:window,context,id:page.executionContextId,uniqueId:randomUUID(),name:'',signal:page.documentAbort.signal,bindings:new Map(),pendingBindings:new Map(),disposed:false};const apply=window.Reflect.apply;record.realmFunction=bridge=>vm.compileFunction('return function(...args){return apply(bridge,this,args)}',['bridge','apply'],{parsingContext:context})(bridge,apply);record.Error=window.Error;record.signal.addEventListener('abort',()=>{record.disposed=true;record.factoryCleanup?.();for(const binding of record.bindings.values())binding.sessions.clear();record.pendingBindings.clear();},{once:true});REALMS.set(context,record);}return record;}
function pageStore(page){let store=STORES.get(page);if(!store){store={names:new Set(),records:new Map()};STORES.set(page,store);}return store;}
function findPageForWindow(session,value){if(value&&typeof value==='object'){const known=WINDOW_OWNERS.get(value);if(known&&!known.closed)return known;}for(const page of pages(session)){const window=page.dom.window;if(window?.document&&(value===window||value===contextFor(window)))return page;}return undefined;}
function installRecord(session,record){const meta=META.get(session);meta.byId.set(record.id,record);if(record.page===session.page)session.worlds.set(record.name,record.id);else session.frameWorlds.set(record.page.frameId+'\0'+record.name,{id:record.id,page:record.page,name:record.name});}
function emitBinding(session,record,params){const meta=META.get(session);if(!session.domains.has('Runtime'))return;if((record.controller?meta.announced:meta.defaultAnnounced).has(record.id))session.event('Runtime.bindingCalled',params);else{let events=record.pendingBindings.get(session);if(!events){events=[];record.pendingBindings.set(session,events);}events.push(params);}}
function flushBindings(session,record){for(const params of record.pendingBindings.get(session)??[])session.event('Runtime.bindingCalled',params);record.pendingBindings.delete(session);}
function announce(session,record){installRecord(session,record);const meta=META.get(session);if(!session.domains.has('Runtime')||meta.announced.has(record.id))return;meta.announced.add(record.id);for(const name of session.bindings)session.installBinding(name,record.facade);session.event('Runtime.executionContextCreated',{context:{id:record.id,origin:record.page.securityOrigin??new URL(record.page.url).origin,name:record.name,uniqueId:record.uniqueId,auxData:{isDefault:false,type:'isolated',frameId:record.page.frameId}}});flushBindings(session,record);}
function worldFor(session,page,name,window=page.dom.window){const store=pageStore(page);store.names.add(name);let record=store.records.get(name);if(record&&live(record)&&record.mainWindow===window)return record;
 WINDOW_OWNERS.set(window,page);WINDOW_OWNERS.set(contextFor(window),page);
 record={page,name,mainWindow:window,id:page.browser.nextExecutionContext++,uniqueId:randomUUID(),signal:page.documentAbort.signal,bindings:new Map(),pendingBindings:new Map(),executedScripts:new Set(),disposed:false};
 const resolveWindow=value=>{const owner=findPageForWindow(session,value);if(owner&&owner!==page)return worldFor(session,owner,name).global;return undefined;};
 const resolveImplementation=impl=>{const owner=Object.getOwnPropertyDescriptor(impl,'_globalObject')?.value;const ownerPage=findPageForWindow(session,owner);return ownerPage&&ownerPage!==page?worldFor(session,ownerPage,name).controller.wrap(impl):undefined;};
 record.controller=createIsolatedWorld(window,{name,timeout:Math.min(page.timeout,2000),signal:record.signal,isWindowClosed:()=>page.closed||page.retired,onError:error=>{for(const member of rootSessions(page))member.event('Runtime.exceptionThrown',{timestamp:Date.now(),exceptionDetails:member.exception(error,record.id)});},resolveWindow,resolveImplementation,onRealm:(global,context,metadata)=>{const cleanup=FACTORY_HOOKS.onRealm?.(global,context,{...metadata,contextId:record.id,page,isActive:()=>live(record)});if(typeof cleanup==='function')record.factoryCleanup=cleanup;},onWrapper:(value,global,metadata)=>FACTORY_HOOKS.onWrapper?.(value,global,{...metadata,contextId:record.id,page,isActive:()=>live(record)}),onConsole:(type,args)=>{for(const member of rootSessions(page))member.event('Runtime.consoleAPICalled',{type,args:args.map(value=>member.remote(value,false,undefined,record.id)),executionContextId:record.id,timestamp:Date.now()});}});
 record.global=record.controller.global;record.context=record.controller.context;installCSSNamespace(record.global,{evaluate:source=>record.controller.evaluate(source)});installImageData(record.controller.global);installCanvas(record.controller.global);installFonts(record.controller.global);installUtilityLayout(page,record.controller,window);installUtilityAnimationFrame(page,record.controller,window);installUtilityIntersection(page,record.controller,window);record.Error=record.global.Error;record.realmFunction=record.controller.realmFunction;captureProtocolRealm(record.global);BY_CONTEXT.set(record.context,record);
 const facade=Object.create(page);Object.defineProperties(facade,{dom:{value:{window:record.global,getInternalVMContext:()=>record.context}},executionContextId:{value:record.id},executionContextUniqueId:{value:record.uniqueId},closed:{get:()=>!live(record)},reconcileURL:{value:()=>page.reconcileURL?.()},evaluate:{value:source=>record.controller.evaluate(source)},callFunction:{value:(declaration,thisArg,args)=>record.controller.callFunction(declaration,thisArg,args)}});record.facade=facade;record.facadeRecord=true;
 store.records.set(name,record);for(const member of rootSessions(page)){installRecord(member,record);for(const binding of member.bindings)installBinding(member,binding,record.facade);}
 record.signal.addEventListener('abort',()=>{record.disposed=true;record.factoryCleanup?.();for(const binding of record.bindings.values())binding.sessions.clear();record.pendingBindings.clear();for(const member of rootSessions(page)){const meta=META.get(member);meta.byId.delete(record.id);meta.announced.delete(record.id);meta.resetRuntime(member,record.id);}},{once:true});
 for(const[id,script]of page.newDocumentScripts){if(script.worldName&&script.worldName===name&&!record.executedScripts.has(id)){record.executedScripts.add(id);try{record.controller.evaluate(script.source);}catch(error){for(const member of rootSessions(page))member.event('Runtime.exceptionThrown',{timestamp:Date.now(),exceptionDetails:member.exception(error,record.id)});}}}
 return record;
}
function specApplies(spec,record){return spec&&(spec.executionContextId===undefined||spec.executionContextId===record.id)&&(spec.executionContextName===undefined||spec.executionContextName===record.name);}
function realmForPage(session,page){return META.get(session).byId.get(page.executionContextId)??mainRealm(page);}
function installBinding(session,name,page,preparedRecord){const meta=META.get(session),record=preparedRecord??realmForPage(session,page),spec=meta.bindingSpecs.get(name);if(!specApplies(spec,record))return;let producer=record.bindings.get(name);if(!producer){producer={sessions:new Set()};producer.fn=record.realmFunction(function(...args){if(args.length!==1||typeof args[0]!=='string')throw new record.Error('Invalid arguments: should be exactly one string.');if(!live(record))return;for(const member of producer.sessions){if(specApplies(META.get(member)?.bindingSpecs.get(name),record))emitBinding(member,record,{name,payload:args[0],executionContextId:record.id});}});record.bindings.set(name,producer);Object.defineProperty(record.global,name,{value:producer.fn,writable:true,enumerable:true,configurable:true});}producer.sessions.add(session);}
export function initializeUtilitySession(session,resetRuntime){const meta={byId:new Map(),announced:new Set(),defaultAnnounced:new Set(),bindingSpecs:new Map(),resetRuntime};META.set(session,meta);rootSessions(session.page).add(session);
 const prepared=({page,window})=>{const main=mainRealm(page,window);for(const binding of session.bindings)installBinding(session,binding,page,main);const names=new Set([...pageStore(page).names,...session.worldNames,...[...page.newDocumentScripts.values()].map(script=>script.worldName).filter(Boolean)]);for(const name of names)worldFor(session,page,name,window);};
 session.page.on('utilityWindowPrepared',prepared);meta.prepared=prepared;
 for(const page of pages(session))for(const record of pageStore(page).records.values())if(live(record))installRecord(session,record);
}
export function wrapUtilityDOMNode(session,node,contextId){const record=META.get(session)?.byId.get(contextId);return record?record.controller.wrap(node):node;}
// Ordinary Session methods delegate to this private controller. No Session
// prototype mutation or interception of protocol argument validation is used.
export function utilitySessionController(session,ProtocolError) {
 const meta=META.get(session);
 return {
  isolatedWorld(page,name){const record=worldFor(session,page,name);announce(session,record);return record.id;},
  executionPage(id){const record=meta.byId.get(id);if(record){if(!live(record))throw new ProtocolError('Cannot find context with specified id');return record.facade;}if([...session.worlds.values()].includes(id)||[...session.frameWorlds.values()].some(world=>world.id===id))throw new ProtocolError('Cannot find context with specified id');return undefined;},
  contextCreated(name,id,page){if(name||id!==page.executionContextId){announce(session,worldFor(session,page,name));return true;}return false;},
  mainContextAnnounced(page){meta.defaultAnnounced.add(page.executionContextId);flushBindings(session,mainRealm(page));},
  uniqueId(page){return mainRealm(page).uniqueId;},
  valueContext(value){const own=utilityWrapperRecord(value);if(own){const record=BY_CONTEXT.get(own.context);if(record&&live(record))return record.id;}return undefined;},
  installBinding(name,page){return installBinding(session,name,page);},
  uniqueContextId(uniqueId){const records=[...pages(session).map(page=>mainRealm(page)),...meta.byId.values()].filter(live);const record=records.find(record=>record.uniqueId===uniqueId);if(!record)throw new ProtocolError('Cannot find context with specified id');return record.id;},
  runtimeEnabled(){for(const page of pages(session))for(const record of pageStore(page).records.values())if(live(record))announce(session,record);},
  runtimeDisabled(){meta.announced.clear();meta.defaultAnnounced.clear();},
  addBinding(params){if(typeof params.name!=='string')throw new ProtocolError('Invalid parameters');if(params.executionContextId!==undefined)session.executionPage(params.executionContextId);meta.bindingSpecs.set(params.name,{executionContextId:params.executionContextId,executionContextName:params.executionContextName});session.bindings.add(params.name);for(const page of pages(session))session.installBinding(params.name,page);for(const record of meta.byId.values())if(live(record))session.installBinding(params.name,record.facade);},
  removeBinding(name){meta.bindingSpecs.delete(name);session.bindings.delete(name);for(const record of [...pages(session).map(page=>mainRealm(page)),...meta.byId.values()])record.bindings.get(name)?.sessions.delete(session);},
  close(){session.page.off('utilityWindowPrepared',meta.prepared);rootSessions(session.page).delete(session);for(const record of [...pages(session).map(page=>mainRealm(page)),...meta.byId.values()]){for(const producer of record.bindings.values())producer.sessions.delete(session);record.pendingBindings.delete(session);}meta.byId.clear();meta.bindingSpecs.clear();meta.defaultAnnounced.clear();meta.announced.clear();},
 };
}
