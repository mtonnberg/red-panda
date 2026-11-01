// Sole first-allocation Location fronts over the existing real backend. Private
// brands/caches are Host-owned; no implementation or factory record enters a VM.
import './dom-event-state.js';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getRuntimeBinding} from './native-runtime.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const generated=require('jsdom/lib/jsdom/living/generated/Location.js'),LocationModule=require('jsdom/lib/jsdom/living/window/Location-impl.js'),LocationImpl=LocationModule.implementation;
const conversions=require('webidl-conversions'),url=require('whatwg-url');
const legacy=Object.assign(Object.create(null),generated),ownedGlobals=new WeakSet();let creationDepth=0;
const fronts=new WeakMap(),canonical=new WeakMap(),backends=new WeakSet(),realms=new WeakMap(),contexts=new WeakMap(),documents=new WeakMap(),utilsInstalled=new WeakSet();
const apply=Reflect.apply,define=Object.defineProperty,create=Object.create,prototypeOf=Object.getPrototypeOf;
const nil=value=>Object.assign(create(null),value);
let installed=false;
export function withLocationFactory(callback){creationDepth++;try{return callback()}finally{creationDepth--;}}
// Trusted Host consumers reuse the same actual creation/utility registration.
// No authored Window property or stable proxy retarget selects realm authority.
export function ownedLocationCreationContext(globalObject){
 const context=realms.get(globalObject)?.context??contexts.get(globalObject)??(vm.isContext(globalObject)?globalObject:null);
 return context&&(creationDepth>0||ownedGlobals.has(globalObject)||realms.has(globalObject))?context:null;
}
export function locationImplementation(value){return fronts.get(value)}
export function canonicalLocation(value){return canonical.get(value)}
export function installPrivateLocationUtils(target=utils){
 if(utilsInstalled.has(target))return;utilsInstalled.add(target);const legacy=target.implForWrapper,legacyWrapper=target.wrapperForImpl;
 target.implForWrapper=value=>{const owned=fronts.get(value);if(owned)return owned;const candidate=legacy(value);return backends.has(candidate)?null:candidate;};
 target.tryImplForWrapper=value=>target.implForWrapper(value)??value;
 target.wrapperForImpl=value=>canonical.get(value)??legacyWrapper(value);
 target.tryWrapperForImpl=value=>target.wrapperForImpl(value)??value;
}
export function prepareLocationContext(globalObject,context,document){ownedGlobals.add(globalObject);contexts.set(globalObject,context);if(document){documents.set(globalObject,document);const state=realms.get(globalObject);if(state)state.document=document;}return globalObject;}
function contextFor(globalObject){const found=contexts.get(globalObject)??(vm.isContext(globalObject)?globalObject:globalObject?._globalObject);return vm.isContext(found)?found:null;}
function stateFor(globalObject){
 let state=realms.get(globalObject);if(state)return state;
 const context=contextFor(globalObject);
 const ObjectConstructor=context?vm.runInContext('Object',context):globalObject.Object,TypeErrorConstructor=context?vm.runInContext('TypeError',context):globalObject.TypeError,StringConstructor=context?vm.runInContext('String',context):globalObject.String;
 if(typeof ObjectConstructor!=='function'||typeof TypeErrorConstructor!=='function')throw new TypeError('An actual Location originating realm is required');
 state=nil({global:globalObject,context,Object:ObjectConstructor,create:context?vm.runInContext('Object.create',context):globalObject.Object.create,TypeError:TypeErrorConstructor,aliases:new WeakMap(),document:documents.get(globalObject)??null,symbolDescription:context?vm.runInContext('Object.getOwnPropertyDescriptor(Symbol.prototype,"description").get',context):Object.getOwnPropertyDescriptor(globalObject.Symbol.prototype,'description').get,globals:nil({TypeError:TypeErrorConstructor,String:StringConstructor})});
 realms.set(globalObject,state);if(context){realms.set(vm.runInContext('globalThis',context),state);realms.set(context,state);}
 const Constructor=vm.compileFunction('return function Location(){throw new E("Illegal constructor")}', ['E'],context?{parsingContext:context}:{})(TypeErrorConstructor);
 const prototype=Constructor.prototype;delete prototype.constructor;state.Constructor=Constructor;state.prototype=prototype;
 const entry=(name,length,operation,key)=>{
  const fn=getRuntimeBinding().createEntry((incumbent,receiver,args)=>{
   const implementation=fronts.get(receiver);if(!implementation)throw new TypeErrorConstructor('Illegal invocation');
   if(operation==='get')return implementation[key];
   if(operation==='reload')return implementation.reload();
   if(operation==='string')return implementation.href;
   if(operation==='method'&&!args.length)throw new TypeErrorConstructor('invalid argument');
   const value=args.length?args[0]:undefined;
   const text=conversions.USVString(typeof value==='symbol'?apply(state.symbolDescription,value,[]):value,{globals:state.globals});
   if(key==='href'||operation==='method'){
    const source=realms.get(incumbent)?.document??state.document??implementation._relevantDocument;
    const parsed=url.parseURL(text,{baseURL:source.baseURL()});if(!parsed)throw new TypeErrorConstructor('');
    if(key==='href')return implementation._locationObjectSetterNavigate(parsed);
    return implementation._locationObjectNavigate(parsed,{replacement:key==='replace'});
   }
   implementation[key]=text;return undefined;
  },ObjectConstructor,name);
  define(fn,'name',{value:name,configurable:true});define(fn,'length',{value:length,configurable:true});return fn;
 };
 define(prototype,'toString',{value:entry('toString',0,'string'),writable:true,enumerable:true,configurable:true});
 for(const key of ['href','search','hash','pathname','hostname','host','port','origin','protocol']){
  const descriptor={get:entry('get '+key,0,'get',key),enumerable:true,configurable:true};
  if(['href','search','hash','pathname'].includes(key))descriptor.set=entry('set '+key,1,'set',key);
  define(prototype,key,descriptor);
 }
 for(const key of ['assign','replace','reload'])define(prototype,key,{value:entry(key,key==='reload'?0:1,key==='reload'?'reload':'method',key),writable:true,enumerable:true,configurable:true});
 define(prototype,'constructor',{value:Constructor,writable:true,configurable:true});
 define(prototype,globalObject.Symbol.toStringTag,{value:'Location',configurable:true});
 return state;
}
function allocate(globalObject){const state=stateFor(globalObject);return apply(state.create,state.Object,[state.prototype]);}
function globalCanonical(implementation,front){canonical.set(implementation,front)}
function bind(front,implementation,globalObject,{canonical=true}={}){
 if(!(implementation instanceof LocationImpl))throw new TypeError('A real Location implementation is required');
 fronts.set(front,implementation);backends.add(implementation);const state=stateFor(globalObject);state.aliases.set(implementation,front);state.document??=implementation._relevantDocument;
 if(canonical){implementation[utils.wrapperSymbol]=front;globalCanonical(implementation,front);}return front;
}
export function createLocationAlias(globalObject,implementation){const state=stateFor(globalObject),previous=state.aliases.get(implementation);return previous??bind(allocate(globalObject),implementation,globalObject,{canonical:false});}
export function installLocationFactory(){
 if(installed)return;installed=true;
 const filename=require.resolve('jsdom/lib/jsdom/living/generated/Location.js'),digest=createHash('sha256').update(readFileSync(filename)).digest('hex');
 if(require('jsdom/package.json').version!=='26.1.0'||digest!=='80e42335f99dce6bcd1cefb4ad7180927960580aa12ab62184852a5c810e94f6')throw new Error('Pinned Location allocation source changed');
 installPrivateLocationUtils();
 generated.is=value=>{if(fronts.has(value))return true;if(!utils.isObject(value))return false;const descriptor=Object.getOwnPropertyDescriptor(value,utils.implSymbol);return !!descriptor&&'value'in descriptor&&!backends.has(descriptor.value)&&legacy.is(value);};
 generated.isImpl=value=>value instanceof LocationImpl;
 generated.convert=(globalObject,value,{context='The provided value'}={})=>{const implementation=fronts.get(value);if(implementation)return implementation;if(generated.is(value))return legacy.convert(globalObject,value,{context});throw new (stateFor(globalObject).TypeError)(context+" is not of type 'Location'.");};
 generated._internalSetup=(wrapper,globalObject)=>{if(!ownedGlobals.has(globalObject))return legacy._internalSetup(wrapper,globalObject);};
 generated.setup=(wrapper,globalObject,constructorArgs=[],privateData={})=>{if(!ownedGlobals.has(globalObject))return legacy.setup(wrapper,globalObject,constructorArgs,privateData);privateData.wrapper=wrapper;const implementation=new LocationImpl(globalObject,constructorArgs,privateData);bind(wrapper,implementation,globalObject);if(LocationModule.init)LocationModule.init(implementation);return wrapper;};
 generated.create=(globalObject,constructorArgs,privateData)=>!ownedGlobals.has(globalObject)?legacy.create(globalObject,constructorArgs,privateData):generated.setup(allocate(globalObject),globalObject,constructorArgs,privateData);
 generated.createImpl=(globalObject,constructorArgs,privateData)=>ownedGlobals.has(globalObject)?fronts.get(generated.create(globalObject,constructorArgs,privateData)):legacy.createImpl(globalObject,constructorArgs,privateData);
 generated.new=(globalObject,newTarget)=>{if(!ownedGlobals.has(globalObject))return legacy.new(globalObject,newTarget);const wrapper=allocate(globalObject),implementation=create(LocationImpl.prototype);bind(wrapper,implementation,globalObject);if(LocationModule.init)LocationModule.init(implementation);return implementation;};
 generated.install=(globalObject,globalNames)=>{if(!globalNames.includes('Window'))return;if(creationDepth>0)ownedGlobals.add(globalObject);if(!ownedGlobals.has(globalObject))return legacy.install(globalObject,globalNames);const state=stateFor(globalObject),registry=utils.initCtorRegistry(globalObject);registry.Location=state.Constructor;define(globalObject,'Location',{value:state.Constructor,writable:true,configurable:true});};
}

export function installLocationInterface(globalObject){generated.install(globalObject,['Window']);}
export function transformUtilityLocationInterfaces(source){
 if(createHash('sha256').update(source).digest('hex')!=='e3de115f04fc02a4c870a67bc7766247880fd56ab92013fab71bbcf80ea52765')throw new Error('Pinned utility interface source changed');
 const line='  Location: require("./generated/Location"),';if(source.split(line).length!==2)throw new Error('Canonical Location interface entry changed');
 return source.replace(line,'');
}
export function installLocationWindowAlias(globalObject,resolve){
 const state=stateFor(globalObject),entry=(name,length,callback)=>{const fn=getRuntimeBinding().createEntry(callback,state.Object,name);define(fn,'name',{value:name,configurable:true});define(fn,'length',{value:length,configurable:true});return fn;};
 const getter=entry('get location',0,()=>resolve());
 const setter=entry('set location',1,(_incumbent,_receiver,args)=>{const front=resolve();front.href=args.length?args[0]:undefined;});
 define(globalObject,'location',{get:getter,set:setter,enumerable:true,configurable:false});
}
