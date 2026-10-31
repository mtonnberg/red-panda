// Genuine first allocation for the original pinned file-api factories.
// The original public installer bodies, implementations, sole FileList Proxy,
// exports object, caches, and canonical wrapper/implementation links remain.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {domWrapperGlobal} from './dom-wrapper-globals.js';
import {getRuntimeBinding} from './native-runtime.js';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-kinds.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const identities=new WeakMap(),hasInstance=Function.prototype[Symbol.hasInstance];
const realms=new WeakMap(),pageRealms=new WeakMap(),incumbents=[],listAllocations=[],pendingBackends=new WeakMap(),lazyFiles=new WeakSet(),adaptedHandlers=new WeakSet();
const iterators=new WeakMap(),fileFronts=new WeakMap();
const FileImplementation=require('jsdom/lib/jsdom/living/file-api/File-impl.js').implementation;
const ListImplementation=require('jsdom/lib/jsdom/living/file-api/FileList-impl.js').implementation;
// This is an observed public constructor name in the pinned Native binary;
// the implementation, class/function creation and state are independent.
const ITERATOR_PUBLIC_NAME='browser.webapi.collections.iterator.Entry(browser.webapi.FileList.Iterator__struct_26,null).JsApi';
const pins=Object.freeze({Blob:'d086a0782c57b196cd2759aec9358578bbe07137abdc72e2da44391536b0b648',File:'daf94ff0921904e6ff8ac976e834a94f0ed7dd2c9d2dc6d2bf76493945fc1db9',FileList:'5bbe3385bfc31337a3ad4e25da7c0fd5c1a6b17f4d09aa6ada790370a8fe7ddd'});
let installed=false;
export function fileWrapperImplementation(value){return identities.get(value)}
const brand=(value,Implementation)=>Reflect.apply(hasInstance,Implementation,[identities.get(value)]);
function remember(wrapper){const implementation=utils.implForWrapper(wrapper);if(!implementation)throw new TypeError('A successful canonical file factory is required');identities.set(wrapper,implementation);if(Reflect.apply(hasInstance,FileImplementation,[implementation])){const previous=fileFronts.get(implementation);if(previous&&previous!==wrapper)throw new TypeError('A canonical File frontend cannot be replaced');fileFronts.set(implementation,wrapper)}return wrapper}
function realm(globalObject){
 let record=realms.get(globalObject);if(record)return record;
 const context=vm.isContext(globalObject)?globalObject:utils.implForWrapper(globalObject)?._globalObject;
 if(!context||!vm.isContext(context))return null;
 const global=vm.runInContext('globalThis',context),Object=vm.runInContext('Object',context);
 record=realms.get(context);if(!record){record=globalThis.Object.assign(globalThis.Object.create(null),{context,global,Object,TypeError:vm.runInContext('TypeError',context),root:null,iterator:null,prototypes:globalThis.Object.create(null)});realms.set(context,record);realms.set(global,record)}
 realms.set(globalObject,record);return record;
}
function scope(record,operation){incumbents.push(record);try{return operation()}finally{if(incumbents.pop()!==record)throw Error('File incumbent scope mismatch')}}
function entry(globalObject,operation,name,privateTrap=false,callee=false){
 const fallback=realm(globalObject);if(!fallback)return operation;
 // Private trap entries themselves stay genuinely Host-created. Native V8
 // captures the actual incumbent BEFORE entering their Host JS operation;
 // public item alone is a genuine VM function at its first publication.
 const result=getRuntimeBinding().createEntry((actualIncumbent,receiver,args)=>{
  const selected=callee?fallback:realms.get(actualIncumbent)??incumbents.at(-1)??fallback;
  return scope(selected,()=>Reflect.apply(operation,receiver,args));
 },privateTrap?globalThis.Object.prototype:fallback.Object.prototype,name);
 Object.defineProperty(result,'length',{value:operation.length,configurable:true});return result;
}
export function captureFileAPIRealm(page,window){
 const record=realm(window);if(!record)return null;
 const root=page.registry&&page.record?pageRealms.get(page.registry.page):null;
 if(record.root&&record.root!==(root??record))throw new TypeError('File allocation realm cannot be retargeted');
 record.root=root??record;pageRealms.set(page,record);return record;
}
export function withInputFileListAllocation(record,operation){
 const selected=record?.root??record;listAllocations.push(selected);try{return operation()}finally{if(listAllocations.pop()!==selected)throw Error('FileList allocation scope mismatch')}
}
export function createDiskFileImplementation(globalObject,args){
 // Genuine independent jsdom File backend, with actual disk data. It has no
 // public wrapper until an actual page indexed/item/iterator access asks.
 const implementation=Reflect.construct(FileImplementation,[globalObject,args,globalThis.Object.create(null)]);lazyFiles.add(implementation);return implementation;
}
function implementation(globalObject,args,privateData,Implementation){
 const existing=pendingBackends.get(privateData);if(existing){pendingBackends.delete(privateData);return existing}
 return Reflect.construct(Implementation,[globalObject,args,privateData]);
}
function capturePrototype(globalObject,kind,prototype){const record=realm(globalObject);if(record){const old=record.prototypes[kind];if(old&&old!==prototype)throw new TypeError('An original File prototype cannot be retargeted');record.prototypes[kind]=prototype}}
function originalPrototype(globalObject,kind){return realm(globalObject)?.prototypes[kind]??globalObject[utils.ctorRegistrySymbol][kind].prototype}
function wrapFile(value,globalObject,callee=false){
 const existing=fileFronts.get(value);if(existing)return existing;
 if(!lazyFiles.has(value))return utils.tryWrapperForImpl(value);
 const selected=callee?realm(globalObject):incumbents.at(-1)??realm(globalObject);if(!selected)throw new TypeError('An actual File first-access realm is required');
 const privateData=globalThis.Object.create(null);pendingBackends.set(privateData,value);
 try{return require('jsdom/lib/jsdom/living/generated/File.js').create(selected.context,[],privateData)}finally{pendingBackends.delete(privateData)}
}
function plain(record,prototype=record.Object.prototype){const value=Reflect.construct(record.Object,[]);Object.setPrototypeOf(value,prototype);return value}
function iteratorInterface(record){
 if(record.iterator)return record.iterator;
 // This public class/prototype is genuinely compiled in the actual selected
 // VM. It carries no VM-private map/controller, and creates no published Host
 // shell. UA iterator instances use the actual VM Object below.
 const Constructor=vm.compileFunction("'use strict';return function FileListIterator(){throw new TypeError('Illegal Constructor')}",['TypeError'],{parsingContext:record.context})(record.TypeError),prototype=Constructor.prototype;
 Object.defineProperty(Constructor,'name',{value:ITERATOR_PUBLIC_NAME,configurable:true});Object.defineProperty(Constructor,'prototype',{writable:false});delete prototype.constructor;
 const next=entry(record.context,function(){
  const state=iterators.get(this);if(!state)throw new record.TypeError('Illegal invocation');
  const implementation=state.list.item(state.index),done=implementation===null;
  let value;if(!done){state.index++;value=wrapFile(implementation,record.context,true)}
  const result=plain(record);Object.defineProperties(result,{done:{value:done,writable:true,enumerable:true,configurable:true},value:{value,writable:true,enumerable:true,configurable:true}});return result;
 },'next',false,true);
 const same=entry(record.context,function(){if(!iterators.has(this))throw new record.TypeError('Illegal invocation');return this},'',false,true);
 Object.defineProperties(prototype,{next:{value:next,writable:true,enumerable:true,configurable:true},constructor:{value:Constructor,writable:true,configurable:true},[Symbol.iterator]:{value:same,writable:true,configurable:true}});
 record.iterator=Object.assign(Object.create(null),{Constructor,prototype});return record.iterator;
}
function installListIterator(globalObject,Prototype,originalItem){
 const record=realm(globalObject);if(!record)return;
 Object.defineProperty(Prototype,'item',{value:entry(globalObject,function(index){if(!brand(this,ListImplementation))throw new record.TypeError('Illegal invocation');return Reflect.apply(originalItem,this,arguments)},'item',false,true),writable:true,configurable:true});
 Object.defineProperty(Prototype,Symbol.iterator,{value:entry(globalObject,function(){
  const list=identities.get(this);if(!Reflect.apply(hasInstance,ListImplementation,[list]))throw new record.TypeError('invalid argument');
  const value=plain(record,iteratorInterface(record).prototype),state=Object.assign(Object.create(null),{list,index:0});iterators.set(value,state);registerPlatformFactoryKind('FileListIterator');registerPlatformFactory(value,{kind:'FileListIterator',implementation:state,globalObject:record.context});return value;
 },'',false,true),writable:true,configurable:true});
}
export function installFileWrapperRealms(createShell,createProxy){
 if(installed)return;installed=true;
 if(require('jsdom/package.json').version!=='26.1.0')throw Error('Pinned file-api jsdom version changed');
 for(const kind of ['Blob','File','FileList']){
  const filename=require.resolve('jsdom/lib/jsdom/living/generated/'+kind+'.js'),factory=require(filename),original=readFileSync(filename,'utf8');
  if(createHash('sha256').update(original).digest('hex')!==pins[kind])throw Error('Pinned generated file-api source changed: '+kind);
  let source=original;
  const replace=(from,to,count=1)=>{if(source.split(from).length-1!==count)throw Error('Generated file-api allocation signature changed: '+kind);source=source.replaceAll(from,to)};
  replace('return Object.create(proto);',`return createShell(globalObject, proto, ${JSON.stringify(kind)});`);
  replace('proto = globalObject[ctorRegistrySymbol]["'+kind+'"].prototype;','proto = originalPrototype(globalObject, '+JSON.stringify(kind)+');');
  replace('utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation','privateBrand(value, Impl.implementation)');
  if(kind==='File')replace('value: new Impl.implementation(globalObject, constructorArgs, privateData),','value: selectedImplementation(globalObject, constructorArgs, privateData, Impl.implementation),');
  // Bind immediately after the genuine backend exists, before the original
  // Proxy/init/backend links read it. Authored symbol getters never supply
  // authority or backing for these generated public operations.
  const setupEnd='    configurable: true\n  });';
  replace(setupEnd,setupEnd+'\n  remember(wrapper);',2);
  for(const name of ['wrapper','esValue','value','target'])source=source.replaceAll(name+'[implSymbol]','privateImplementation('+name+')');
  source=source.replaceAll('utils.implForWrapper(', 'privateImplementation(');
  if(kind==='FileList'){
   replace('return new Proxy(wrapper, proxyHandler);','return createProxy(wrapper, proxyHandler, globalObject, "FileList");');
   replace('utils.tryWrapperForImpl(indexedValue)','wrapFile(indexedValue, this._globalObject)',2);
   replace('utils.tryWrapperForImpl(privateImplementation(esValue).item(...args))','wrapFile(privateImplementation(esValue).item(...args), globalObject, true)');
   // First publication installs the genuine selected-VM item/iterator entries;
   // the original generated item body still owns conversions/backend access.
   replace('  ctorRegistry[interfaceName] = FileList;','  installListIterator(globalObject, FileList.prototype, FileList.prototype.item);\n  ctorRegistry[interfaceName] = FileList;');
  }
  else replace('exports.setup(Object.create(new.target.prototype),','exports.setup(createShell(globalObject, new.target.prototype, '+JSON.stringify(kind)+'),');
  replace('  ctorRegistry[interfaceName] = '+kind+';','  capturePrototype(globalObject, '+JSON.stringify(kind)+', '+kind+'.prototype);\n  ctorRegistry[interfaceName] = '+kind+';');
  const module={exports:factory};
  const shell=(globalObject,prototype,name)=>{const selected=name==='FileList'?listAllocations.at(-1):null;if(selected){globalObject=selected.context;prototype=originalPrototype(selected.context,'FileList')}return createShell(globalObject,prototype,name)};
  const proxy=(target,handler,globalObject,name)=>{
   if(!adaptedHandlers.has(handler)){
    adaptedHandlers.add(handler);const selected=domWrapperGlobal(target,globalObject);
    for(const key of ['get','has','ownKeys','getOwnPropertyDescriptor','set','defineProperty','deleteProperty','preventExtensions'])if(typeof handler[key]==='function')Object.defineProperty(handler,key,{value:entry(selected,handler[key],key,true),writable:true,configurable:true});
   }
   const value=createProxy(target,handler,globalObject,name);identities.set(value,identities.get(target));return value;
  };
  vm.compileFunction(source,['exports','require','module','__filename','__dirname','createShell','createProxy','privateBrand','privateImplementation','remember','selectedImplementation','wrapFile','installListIterator','originalPrototype','capturePrototype'],{filename})(factory,createRequire(filename),module,filename,filename.slice(0,filename.lastIndexOf('/')),shell,proxy,brand,fileWrapperImplementation,remember,implementation,wrapFile,installListIterator,originalPrototype,capturePrototype);
  if(module.exports!==factory)throw Error('Canonical generated file-api exports changed: '+kind);
  const setup=factory.setup,allocate=factory.new;
  factory.setup=function(...args){return remember(Reflect.apply(setup,this,args))};
  factory.new=function(...args){const implementation=Reflect.apply(allocate,this,args);remember(utils.wrapperForImpl(implementation));return implementation};
 }
}
