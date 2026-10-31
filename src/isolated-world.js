import {registerPlatformFactory} from './platform-factories.js';
// Independent genuine VM/IDL-world prototype. Generated wrapper source comes
// from the pinned existing jsdom dependency; no target engine source is used.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {types} from 'node:util';
import {createInvocationTrampoline} from './invocation.js';
import 'jsdom';
const require=createRequire(import.meta.url);
const hostUtils=require('jsdom/lib/jsdom/living/generated/utils.js');
const generatedRoot=dirname(require.resolve('jsdom/lib/jsdom/living/generated/utils.js'));
const interfacesPath=require.resolve('jsdom/lib/jsdom/living/interfaces.js');
const own=Object.getOwnPropertyDescriptor;
const objectLike=v=>v!==null&&(typeof v==='object'||typeof v==='function');

const WORLD_WRAPPERS=new WeakMap();
export function utilityWrapperRecord(value){const record=objectLike(value)?WORLD_WRAPPERS.get(value):undefined;return record&&!record.disposed?record:undefined;}
export function canonicalUtilityValue(value){const record=utilityWrapperRecord(value);return record?hostUtils.wrapperForImpl(record.impl):value;}
export function utilityNodeIdentity(value){const record=utilityWrapperRecord(value);if(!record)return undefined;const type=own(record.impl,'nodeType')?.value;if(!Number.isInteger(type)||type<1||type>12)return undefined;const document=type===9?record.impl:own(record.impl,'_ownerDocument')?.value;return {nodeType:type,ownerDocument:hostUtils.wrapperForImpl(document),className:record.interfaceName};}

export function createIsolatedWorld(mainWindow,{name='independent-utility-world',timeout=1000,signal,isWindowClosed,onError,resolveWindow,resolveImplementation,onConsole,onRealm,onWrapper}={}) {
 const context=vm.createContext({}, {name});const invocation=createInvocationTrampoline(context);const global=vm.runInContext('globalThis',context);
 const symbolMap=new Map(Object.values(hostUtils).filter(value=>typeof value==='symbol').map(value=>[value.description,value]));
 const sharedSymbol=description=>symbolMap.get(description)??global.Symbol(description);for(const key of Reflect.ownKeys(global.Symbol))if(!['length','name','prototype'].includes(key))Object.defineProperty(sharedSymbol,key,Object.getOwnPropertyDescriptor(global.Symbol,key));
 const utilsModule={exports:{}};new vm.Script('(function(module,exports,Symbol){'+readFileSync(join(generatedRoot,'utils.js'),'utf8')+'\n})',{filename:join(generatedRoot,'utils.js')}).runInContext(context)(utilsModule,utilsModule.exports,sharedSymbol);
 const localUtils=utilsModule.exports,modules=new Map(),wrappers=new WeakMap(),wrapperImpls=new WeakMap(),mainWrappers=new WeakMap(),arrayWrappers=new WeakMap();
 const metadata={context,global,mainWindow,signal,disposed:false};const pendingFactories=[];let factoryReady=false;
 const register=(wrapper,impl,interfaceName)=>{wrapperImpls.set(wrapper,impl);const entry={...metadata,impl,interfaceName,get disposed(){return metadata.disposed}};WORLD_WRAPPERS.set(wrapper,entry);registerPlatformFactory(wrapper,{kind:interfaceName,implementation:impl,globalObject:global});if(factoryReady)onWrapper?.(wrapper,global,entry);else pendingFactories.push([wrapper,entry]);};
 const utilityPrototypes=new Map();
 const mainPrototypes=new Map(),observerImpls=new Set(),listeners=[],timers=new Set();let disposed=false;
 const requireLive=()=>{if(disposed)throw new Error('Isolated world has been disposed');};
 const mainContext=hostUtils.implForWrapper(mainWindow.document)._globalObject;
 const utilityApply=global.Reflect.apply;
 const realmFunction=bridge=>vm.compileFunction('return function(...args){return apply(bridge,this,args)}',['bridge','apply'],{parsingContext:context})(bridge,utilityApply);
 for(const[name,constructor]of Object.entries(mainWindow[hostUtils.ctorRegistrySymbol]??{}))if(constructor?.prototype)mainPrototypes.set(constructor.prototype,name);
 function interfaceFor(impl){const canonical=own(impl,hostUtils.wrapperSymbol)?.value;if(!canonical)throw new Error('DOM implementation has no canonical wrapper');let proto=Object.getPrototypeOf(canonical);for(let i=0;proto&&i<64;i++,proto=Object.getPrototypeOf(proto)){const name=mainPrototypes.get(proto)??utilityPrototypes.get(proto);if(name&&!name.startsWith('%'))return name;}throw new Error('No pinned IDL interface for implementation');}
 function wrapImpl(impl){
  const redirected=resolveImplementation?.(impl);if(redirected)return redirected;
  const cached=wrappers.get(impl);if(cached)return cached;
  const canonical=own(impl,hostUtils.wrapperSymbol)?.value;if(canonical===mainWindow||canonical===mainWindow._globalProxy)return global;
  const name=interfaceFor(impl);if(utilityPrototypes.has(Object.getPrototypeOf(canonical)))return canonicalizeNew(name,canonical);const generated=load(join(generatedRoot,name+'.js'));
  if(typeof generated.new!=='function')throw new Error('IDL interface cannot wrap existing implementation: '+name);
  const transient=generated.new(global),wrapper=transient[hostUtils.wrapperSymbol];
  Object.defineProperty(wrapper,hostUtils.implSymbol,{value:impl,configurable:true});
  wrappers.set(impl,wrapper);register(wrapper,impl,name);if(objectLike(canonical))mainWrappers.set(canonical,impl);
  return wrapper;
 }
 function wrap(value){
  if(!objectLike(value))return value;if(value===mainWindow||value===mainWindow._globalProxy)return global;if(value===global||wrapperImpls.has(value))return value;const otherWindow=resolveWindow?.(value);if(otherWindow)return otherWindow;
  const known=mainWrappers.get(value);if(known)return wrapImpl(known);
  if(types.isProxy(value))return value;
  const candidate=own(value,hostUtils.implSymbol)?.value;
  if(candidate&&own(candidate,hostUtils.wrapperSymbol)?.value===value)return wrapImpl(candidate);
  const canonical=own(value,hostUtils.wrapperSymbol)?.value;
  if(canonical&&objectLike(canonical)&&own(canonical,hostUtils.implSymbol)?.value===value)return wrapImpl(value);
  if(Array.isArray(value)&&Object.getPrototypeOf(value)!==global.Array.prototype){let array=arrayWrappers.get(value);if(array)return array;array=new global.Array();arrayWrappers.set(value,array);for(let i=0;i<value.length;i++)if(i in value)Object.defineProperty(array,String(i),{value:wrap(value[i]),writable:true,enumerable:true,configurable:true});return array;}
  return value;
 }
 localUtils.wrapperForImpl=impl=>impl?wrapImpl(impl):null;
 localUtils.tryWrapperForImpl=wrap;
 function canonicalizeNew(name,wrapper){const impl=hostUtils.implForWrapper(wrapper);if(!impl)return wrapper;wrappers.set(impl,wrapper);wrapperImpls.set(wrapper,impl);
  // Utility-created implementations also receive an independent canonical main
  // wrapper. Never replace an existing implementation's main wrapper to enter a world.
  const hostGenerated=require(join(generatedRoot,name+'.js'));
  if(typeof hostGenerated.new==='function'&&mainWindow[name]){
   const transient=hostGenerated.new(mainWindow),canonical=transient[hostUtils.wrapperSymbol];Object.defineProperty(canonical,hostUtils.implSymbol,{value:impl,configurable:true});impl[hostUtils.wrapperSymbol]=canonical;mainWrappers.set(canonical,impl);
  }
  register(wrapper,impl,name);if(name==='MutationObserver')observerImpls.add(new WeakRef(impl));return wrapper;
 }
 function load(filename){filename=resolve(filename);if(filename===join(generatedRoot,'utils.js'))return localUtils;if(modules.has(filename))return modules.get(filename).exports;
  const module={exports:{}};modules.set(filename,module);const hostRequire=createRequire(filename);const localRequire=specifier=>{const target=hostRequire.resolve(specifier);return target.startsWith(generatedRoot+'/')||target===interfacesPath?load(target):hostRequire(specifier);};
  const source=readFileSync(filename,'utf8');const factory=new vm.Script('(function(require,module,exports,__filename,__dirname){'+source+'\n})',{filename}).runInContext(context);factory(localRequire,module,module.exports,filename,dirname(filename));
  if(filename.startsWith(generatedRoot+'/')){const name=filename.slice(generatedRoot.length+1,-3),original=module.exports.setup;if(typeof original==='function')module.exports.setup=function(...args){return canonicalizeNew(name,original(...args));};
   // Measured native producer quirk: MO arguments are real main-world values,
   // while the authored callback itself continues in its genuine utility realm.
   if(name==='MutationCallback')module.exports.convert=(ignored,value)=>{if(typeof value!=='function')throw new global.TypeError('Mutation callback is not a function');const invoke=function(records,observer){if(disposed)return;const array=vm.runInContext('[]',mainContext);for(let i=0;i<records.length;i++){const item=hostUtils.tryWrapperForImpl(records[i]);Object.defineProperty(array,String(i),{value:item,writable:true,enumerable:true,configurable:true});}const mainObserver=hostUtils.tryWrapperForImpl(observer);return Reflect.apply(value,hostUtils.tryWrapperForImpl(this),[array,mainObserver]);};invoke[hostUtils.wrapperSymbol]=value;invoke.objectReference=value;return invoke;};
  }
  return module.exports;
 }
 Object.defineProperties(global,{window:{value:global,writable:false},self:{value:global,writable:false},top:{get:realmFunction(()=>resolveWindow?.(mainWindow.top)??global)},parent:{get:realmFunction(()=>resolveWindow?.(mainWindow.parent)??global)},closed:{get:realmFunction(()=>Boolean(isWindowClosed?.()??signal?.aborted))},frames:{value:global}});
 load(interfacesPath).installInterfaces(global,['Window']);
 for(const[name,constructor]of Object.entries(global[hostUtils.ctorRegistrySymbol]??{}))if(constructor?.prototype)utilityPrototypes.set(constructor.prototype,name);
 Object.defineProperty(global,'length',{get:realmFunction(()=>mainWindow.length??0)});
 Object.defineProperty(global,'frameElement',{get:realmFunction(()=>wrap(mainWindow.frameElement))});
 Object.defineProperty(global,'document',{value:wrap(mainWindow.document),enumerable:true});
 const windowImpl=hostUtils.implForWrapper(mainWindow);Object.defineProperty(global,hostUtils.implSymbol,{value:windowImpl});wrappers.set(windowImpl,global);register(global,windowImpl,'Window');mainWrappers.set(mainWindow,windowImpl);
 global.Window=vm.runInContext('(class Window extends EventTarget {constructor(){throw new TypeError(\"Illegal constructor\")}})',context);Object.setPrototypeOf(global,global.Window.prototype);Object.defineProperty(global.Window.prototype,Symbol.toStringTag,{value:'Window',configurable:true});
 const add=global.EventTarget.prototype.addEventListener,remove=global.EventTarget.prototype.removeEventListener;
 const removeImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation.prototype.removeEventListener;
 global.EventTarget.prototype.addEventListener=realmFunction(function(...args){requireLive();const impl=wrapperImpls.get(this),before=new Set(Object.values(impl?._eventListeners??{}).flat());const result=Reflect.apply(add,this,args);for(const[type,entries]of Object.entries(impl._eventListeners))for(const entry of entries)if(!before.has(entry))listeners.push({impl:new WeakRef(impl),type,entry:new WeakRef(entry)});return result;});
 global.EventTarget.prototype.removeEventListener=realmFunction(function(...args){return Reflect.apply(remove,this,args);});
 let nextTimerId=0;const timerHandles=new Map();
 const timerBridge=(repeating,callback,ms,...args)=>{requireLive();if(typeof callback!=='function')throw new global.TypeError('Prototype timers require a function');const id=++nextTimerId;const invoke=()=>{if(!repeating){timers.delete(id);timerHandles.delete(id);}if(!disposed)try{invocation.invoke(callback,global,args,{timeout,displayErrors:false});}catch(error){if(onError)onError(error);else global.dispatchEvent(new global.ErrorEvent('error',{error}));}};timerHandles.set(id,(repeating?setInterval:setTimeout)(invoke,ms));timers.add(id);return id;};
 const clearTimer=id=>{const handle=timerHandles.get(id);if(handle!==undefined){clearTimeout(handle);clearInterval(handle);}timerHandles.delete(id);timers.delete(id);};
 global.setTimeout=realmFunction((...args)=>timerBridge(false,...args));global.setInterval=realmFunction((...args)=>timerBridge(true,...args));const cancellations=vm.compileFunction("return {clearTimeout(id=0){const n=+id;clear(Number.isFinite(n)?Math.trunc(n)|0:0)},clearInterval(id=0){const n=+id;clear(Number.isFinite(n)?Math.trunc(n)|0:0)}}",["clear"],{parsingContext:context})(clearTimer);global.clearTimeout=cancellations.clearTimeout;global.clearInterval=cancellations.clearInterval;
 global.queueMicrotask=realmFunction(callback=>{if(typeof callback!=='function')throw new global.TypeError('Callback must be a function');queueMicrotask(()=>{if(!disposed)Reflect.apply(callback,undefined,[]);});});
 global.console=vm.runInContext('({})',context);for(const method of ['log','warn','error','info','debug'])global.console[method]=realmFunction((...args)=>onConsole?onConsole(method,args):mainWindow.console[method](...args));
 const dispose=()=>{if(disposed)return;disposed=true;metadata.disposed=true;invocation.dispose();for(const record of listeners){const impl=record.impl.deref(),entry=record.entry.deref();if(impl&&entry)Reflect.apply(removeImpl,impl,[record.type,entry.callback,{capture:entry.options.capture}]);}listeners.length=0;for(const reference of observerImpls)reference.deref()?.disconnect();observerImpls.clear();for(const id of timers)clearTimer(id);timers.clear();pendingFactories.length=0;signal?.removeEventListener('abort',dispose);};
 if(signal?.aborted){dispose();throw new Error('Cannot create isolated world for destroyed document');}signal?.addEventListener('abort',dispose,{once:true});
 onRealm?.(global,context,{signal,mainWindow});factoryReady=true;for(const[wrapper,entry]of pendingFactories)onWrapper?.(wrapper,global,entry);pendingFactories.length=0;
 return {context,global,realmFunction,evaluate(source){requireLive();return vm.runInContext(source,context,{timeout});},callFunction(declaration,thisArg,args=[]){requireLive();return invocation.invokeDeclaration(declaration,thisArg,args,{timeout,displayErrors:false});},wrap,implementationFor(value){return wrapperImpls.get(value);},dispose,get disposed(){return disposed;}};
}
