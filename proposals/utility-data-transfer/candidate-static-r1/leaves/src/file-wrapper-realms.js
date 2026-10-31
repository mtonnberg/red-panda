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
const identities=new WeakMap(),implementationKinds=new WeakMap(),hasInstance=Function.prototype[Symbol.hasInstance];
const realms=new WeakMap(),pageRealms=new WeakMap(),incumbents=[],listAllocations=[],pendingBackends=new WeakMap(),lazyFiles=new WeakSet(),adaptedHandlers=new WeakSet();
const iterators=new WeakMap(),fileFronts=new WeakMap();
const FileImplementation=require('jsdom/lib/jsdom/living/file-api/File-impl.js').implementation;
const ListImplementation=require('jsdom/lib/jsdom/living/file-api/FileList-impl.js').implementation;
// This is an observed public constructor name in the pinned Native binary;
// the implementation, class/function creation and state are independent.
const ITERATOR_PUBLIC_NAME='browser.webapi.collections.iterator.Entry(browser.webapi.FileList.Iterator__struct_26,null).JsApi';
const pins=Object.freeze({Blob:'d086a0782c57b196cd2759aec9358578bbe07137abdc72e2da44391536b0b648',File:'daf94ff0921904e6ff8ac976e834a94f0ed7dd2c9d2dc6d2bf76493945fc1db9',FileList:'5bbe3385bfc31337a3ad4e25da7c0fd5c1a6b17f4d09aa6ada790370a8fe7ddd'});
let installed=false,fileShell;
const utilityModules=new WeakMap(),viewData=new WeakSet(),canonicalFronts=new WeakMap();
export function fileWrapperImplementation(value){return identities.get(value)}
const brand=(value,Implementation)=>Reflect.apply(hasInstance,Implementation,[identities.get(value)]);
function remember(wrapper){const implementation=utils.implForWrapper(wrapper);if(!implementation)throw new TypeError('A successful canonical file factory is required');identities.set(wrapper,implementation);if(!implementationKinds.has(implementation))implementationKinds.set(implementation,Reflect.apply(hasInstance,FileImplementation,[implementation])?'File':Reflect.apply(hasInstance,ListImplementation,[implementation])?'FileList':'Blob');if(implementationKinds.get(implementation)==='File'){const previous=fileFronts.get(implementation);if(previous&&previous!==wrapper)throw new TypeError('A canonical File frontend cannot be replaced');fileFronts.set(implementation,wrapper)}return wrapper}
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
 const implementation=Reflect.construct(FileImplementation,[globalObject,args,globalThis.Object.create(null)]);lazyFiles.add(implementation);implementationKinds.set(implementation,'File');return implementation;
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
 if(installed)return;installed=true;fileShell=createShell;
 if(require('jsdom/package.json').version!=='26.1.0')throw Error('Pinned file-api jsdom version changed');
 for(const kind of ['Blob','File','FileList']){
  const filename=require.resolve('jsdom/lib/jsdom/living/generated/'+kind+'.js'),factory=require(filename),original=readFileSync(filename,'utf8');
  if(createHash('sha256').update(original).digest('hex')!==pins[kind])throw Error('Pinned generated file-api source changed: '+kind);
  let source=original;
  const replace=(from,to,count=1)=>{if(source.split(from).length-1!==count)throw Error('Generated file-api allocation signature changed: '+kind);source=source.replaceAll(from,to)};
  replace('return Object.create(proto);',`return createShell(globalObject, proto, ${JSON.stringify(kind)});`);
  replace('proto = globalObject[ctorRegistrySymbol]["'+kind+'"].prototype;','proto = originalPrototype(globalObject, '+JSON.stringify(kind)+');');
  replace('utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation','privateBrand(value, Impl.implementation)');
  replace('value: new Impl.implementation(globalObject, constructorArgs, privateData),','value: selectedImplementation(globalObject, constructorArgs, privateData, Impl.implementation),');
  // Bind immediately after the genuine backend exists, before the original
  // Proxy/init/backend links read it. Authored symbol getters never supply
  // authority or backing for these generated public operations.
  const setupEnd='    configurable: true\n  });';
  replace(setupEnd,setupEnd+'\n  remember(wrapper);',2);
  for(const name of ['wrapper','esValue','value','target'])source=source.replaceAll(name+'[implSymbol]','privateImplementation('+name+')');
  source=source.replaceAll('utils.implForWrapper(', 'privateImplementation(');
  const publication='privateImplementation(wrapper)[utils.wrapperSymbol] = wrapper;';
  if(source.split(publication).length!==3)throw Error('Pinned file canonical publication changed: '+kind);
  source=source.replace(publication,'publishWrapper(privateImplementation(wrapper), wrapper, privateData);');
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
  vm.compileFunction(source,['exports','require','module','__filename','__dirname','createShell','createProxy','privateBrand','privateImplementation','remember','selectedImplementation','wrapFile','installListIterator','originalPrototype','capturePrototype','publishWrapper'],{filename})(factory,createRequire(filename),module,filename,filename.slice(0,filename.lastIndexOf('/')),shell,proxy,brand,fileWrapperImplementation,remember,implementation,wrapFile,installListIterator,originalPrototype,capturePrototype,publishWrapper);
  if(module.exports!==factory)throw Error('Canonical generated file-api exports changed: '+kind);
  const setup=factory.setup,allocate=factory.new;
  factory.setup=function(...args){return remember(Reflect.apply(setup,this,args))};
  factory.new=function(...args){const implementation=Reflect.apply(allocate,this,args),wrapper=utils.wrapperForImpl(implementation);remember(wrapper);if(!canonicalFronts.has(implementation))canonicalFronts.set(implementation,wrapper);return implementation};
 }
}

// A view binds its real existing backend before its sole Proxy is created. The
// original canonical frontend is retained, never redirected through a dummy.
function publishWrapper(implementation,wrapper,privateData){
 const previous=canonicalFronts.get(implementation);
 if(!previous){canonicalFronts.set(implementation,wrapper);implementation[utils.wrapperSymbol]=wrapper}
 else if(!viewData.has(privateData)&&previous!==wrapper)throw new TypeError('A canonical file frontend cannot be replaced');
}
export function isFileAPIImplementation(value){return implementationKinds.has(value)}
export function fileAPIKind(value){return implementationKinds.get(value)}
function trustedUtility(context,globalObject){
 if(!vm.isContext(context)||vm.runInContext('this',context)!==globalObject)throw new TypeError('An actual utility File Context/global pair is required');
 const record=realm(context);if(record.global!==globalObject)throw new TypeError('File realm cannot be retargeted');return record;
}
export function createUtilityFileListProducer(context,globalObject,{allowLegacy=false}={}){
 if(!installed&&allowLegacy){const create=require('jsdom/lib/jsdom/living/generated/FileList.js').create;return()=>Reflect.apply(create,undefined,[globalObject,[],Object.create(null)])}
 const record=trustedUtility(context,globalObject);
 if(!record.prototypes.FileList)throw new TypeError('The original utility FileList definition must be installed first');
 const create=require('jsdom/lib/jsdom/living/generated/FileList.js').create;
 return()=>Reflect.apply(create,undefined,[globalObject,[],Object.create(null)]);
}
export function wrapFileAPIView(context,globalObject,value){
 if(!isFileAPIImplementation(value))return undefined;
 trustedUtility(context,globalObject);
 // A File always retains its original actual first frontend, including lazy
 // disk files. FileList and Blob views need distinct genuine realm frontends.
 if(implementationKinds.get(value)==='File')return fileFronts.get(value)??wrapFile(value,globalObject,true);
 const kind=implementationKinds.get(value),factory=require('jsdom/lib/jsdom/living/generated/'+kind+'.js'),data=Object.create(null);
 pendingBackends.set(data,value);viewData.add(data);
 try{return factory.create(globalObject,[],data)}finally{pendingBackends.delete(data);viewData.delete(data)}
}
// Only original public generated interface bodies execute in the utility VM.
// All module/setup/conversion/identity state stays in the same canonical Host
// factory graph. No local symbol-based is/convert or dummy canonical frontend.
export function utilityFileModule(kind,context,globalObject){
 if(!['Blob','File','FileList'].includes(kind))return undefined;
 if(!installed||!fileShell)return undefined;
 const record=trustedUtility(context,globalObject);let modules=utilityModules.get(context);if(!modules){modules=new Map();utilityModules.set(context,modules)}if(modules.has(kind))return modules.get(kind);
 const filename=require.resolve('jsdom/lib/jsdom/living/generated/'+kind+'.js'),factory=require(filename),source=readFileSync(filename,'utf8');
 if(createHash('sha256').update(source).digest('hex')!==pins[kind])throw Error('Pinned utility file source changed: '+kind);
 const signature='exports.install = (globalObject, globalNames) => {\n',start=source.indexOf(signature),end=source.indexOf('\n};\n',start),header=source.slice(0,source.indexOf('exports.is = ')),exposed=source.match(/^const exposed = .*;$/m)?.[0],footer=source.slice(source.lastIndexOf('const Impl = require('));
 if(start<0||end<start||!exposed||source.split(signature).length!==2)throw Error('Pinned utility file installer shape changed: '+kind);
 const names=[...header.matchAll(/^const ([A-Za-z0-9_]+) =/gm)].map(match=>match[1]);
 const values=vm.compileFunction(header+'\n'+exposed+'\n'+footer+'\nreturn ['+[...names,'exposed','Impl'].join(',')+'];',['require'],{filename})(createRequire(filename));
 let body=source.slice(start+signature.length,end);
 const change=(from,to,count)=>{if(body.split(from).length-1!==count)throw Error('Pinned utility file signature changed: '+kind+':'+from);body=body.replaceAll(from,to)};
 change('const args = [];','const args = newPrivateArguments();',kind==='Blob'?2:1);
 if(kind!=='FileList'){change('const V = [];','const V = newPrivateArguments();',1);change('exports.setup(Object.create(new.target.prototype),','exports.setup(createShell(globalObject, new.target.prototype, '+JSON.stringify(kind)+'),',1)}
 body=body.replaceAll('globalObject.TypeError','originalTypeError').replaceAll('globals: globalObject','globals: conversionGlobals').replaceAll('ArrayBuffer.isView(','originalIsView(').replaceAll('PropertyBag.convert(globalObject,','PropertyBag.convert(conversionGlobals,');
 body=body.replaceAll('utils.implForWrapper(', 'privateImplementation(').replaceAll('esValue[implSymbol]','privateImplementation(esValue)');
 if(kind==='FileList')change('utils.tryWrapperForImpl(privateImplementation(esValue).item(...args))','wrapFile(privateImplementation(esValue).item(...args), globalObject, true)',1);
 const assignment='  ctorRegistry[interfaceName] = '+kind+';',publication='  capturePrototype(globalObject, '+JSON.stringify(kind)+', '+kind+'.prototype);\n'+(kind==='FileList'?'  installListIterator(globalObject, FileList.prototype, FileList.prototype.item);\n':'');change(assignment,publication+assignment,1);
 const conversionGlobals=Object.freeze({TypeError:record.TypeError}),extraNames=['exports','createShell','privateImplementation','newPrivateArguments','wrapFile','capturePrototype','installListIterator','originalTypeError','conversionGlobals','originalIsView'],extraValues=[factory,fileShell,fileWrapperImplementation,()=>[],wrapFile,capturePrototype,installListIterator,record.TypeError,conversionGlobals,vm.runInContext('ArrayBuffer.isView',context)];
 const install=vm.compileFunction('"use strict";\n'+body,['globalObject','globalNames',...names,'exposed','Impl',...extraNames],{parsingContext:context,filename});
 const facade=Object.assign(Object.create(null),factory),convert=factory.convert;
 facade.convert=(_global,value,options)=>Reflect.apply(convert,factory,[conversionGlobals,value,options]);
 facade.install=(selected,globalNames)=>{if(selected!==globalObject)throw new TypeError('Utility file installation cannot change realm');return install(globalObject,globalNames,...values,...extraValues)};
 modules.set(kind,facade);return facade;
}

export function originalFileAPIPrototype(context,globalObject,kind){const record=trustedUtility(context,globalObject),prototype=record.prototypes[kind];if(!prototype)throw new TypeError('An original installed File interface is required');return prototype;}
