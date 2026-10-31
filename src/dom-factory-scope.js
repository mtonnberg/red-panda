// Host-only ownership for actual fresh DOM factory allocation. No Document
// globals, backend ownership or existing canonical wrappers are changed.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const {lookupCEDefinition}=require('jsdom/lib/jsdom/living/helpers/custom-elements.js');
const {HTML_NS}=require('jsdom/lib/jsdom/living/helpers/namespaces.js');
const scopes=[],kinds=new Set(),globals=new WeakMap(),primaryScopes=new WeakMap();
const nil=()=>Object.create(null);
function context(value){return vm.isContext(value)?value:utils.implForWrapper(value)?._globalObject;}
export function registerDOMAllocationKind(kind){kinds.add(kind);}
export function domWrapperGlobal(value,fallback){return globals.get(value)??fallback;}
export function recordDOMWrapperGlobal(value,globalObject){globals.set(value,globalObject);return value;}
export function selectDOMWrapperAllocation(globalObject,prototype,kind){
 const scope=scopes.at(-1);
 if(!scope?.active||!kinds.has(kind)||context(globalObject)!==scope.source)return Object.assign(nil(),{globalObject,prototype});
 const selected=scope.target,Constructor=selected[utils.ctorRegistrySymbol]?.[kind];
 if(!Constructor)return Object.assign(nil(),{globalObject,prototype});
 return Object.assign(nil(),{globalObject:selected,prototype:Constructor.prototype,scope});
}
export function noteDOMWrapperShell(value,selection){
 globals.set(value,selection.globalObject);
 if(selection.scope&&!selection.scope.primary){selection.scope.primary=value;primaryScopes.set(value,selection.scope);}
 return value;
}
export function finishDOMWrapperSetup(value){
 const scope=primaryScopes.get(value);
 if(scope){scope.active=false;primaryScopes.delete(value);}
}
function customConstruction(implementation,name,args){
 if(name!=='createElement'&&name!=='createElementNS')return false;
 const namespace=name==='createElement'?(implementation._parsingMode==='html'?HTML_NS:null):args[0];
 if(namespace!==HTML_NS)return false;
 let localName=name==='createElement'?args[0]:args[1].split(':').at(-1);
 if(name==='createElement'&&implementation._parsingMode==='html')localName=localName.replace(/[A-Z]/g,c=>c.toLowerCase());
 const options=args[name==='createElement'?1:2],isValue=options&&typeof options==='object'?options.is:null;
 return lookupCEDefinition(implementation,namespace,localName,isValue??null)!==null;
}
export function callDOMFactory(globalObject,implementation,name,args){
 const source=context(implementation._globalObject),target=context(globalObject);
 if(!source||!target)return name==='elements'?implementation[name]:Reflect.apply(implementation[name],implementation,args);
 // Actual authored custom constructors retain their own construction realm.
 const scope=Object.assign(nil(),{source,target,active:!customConstruction(implementation,name,args),primary:null});
 scopes.push(scope);
 try{return name==='elements'?implementation[name]:Reflect.apply(implementation[name],implementation,args);}
 finally{if(scopes.pop()!==scope)throw new Error('DOM factory scope mismatch');}
}
