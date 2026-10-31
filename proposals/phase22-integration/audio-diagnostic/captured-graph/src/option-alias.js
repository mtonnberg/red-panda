// Construct the actual selected-VM receiver and initialize that SAME object
// with the canonical generated Option backend. No replacement receiver or
// prototype correction is used; V8 owns real newTarget/prototype resolution.
import vm from 'node:vm';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),Option=require('jsdom/lib/jsdom/living/generated/HTMLOptionElement.js'),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const installed=new WeakMap(),apply=Reflect.apply,define=Object.defineProperty;
const symbolDescription=Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get;
const HTML='http://www.w3.org/1999/xhtml';
export function installOptionAlias(window){
 const previous=installed.get(window);if(previous)return previous;
 const document=utils.implForWrapper(window.document),globalObject=document._globalObject,context=vm.isContext(globalObject)?globalObject:undefined;
 const StringConstructor=context?vm.runInContext('String',context):window.String,TypeErrorConstructor=window.TypeError;
 const text=value=>typeof value==='symbol'?apply(StringConstructor,undefined,[apply(symbolDescription,value,[])]):apply(StringConstructor,undefined,[value]);
 const initialize=(receiver,args)=>{
  const content=args[0]===undefined?'':text(args[0]),value=args[1]===undefined?undefined:text(args[1]);
  const defaultSelected=Boolean(args[2]),selected=Boolean(args[3]);
  const actual=Option.setup(receiver,globalObject,[],{ownerDocument:document,localName:'option',namespace:HTML,prefix:null,ceState:'uncustomized',ceDefinition:null,isValue:null});
  if(actual!==receiver)throw new Error('Canonical Option setup changed receiver identity');
  const implementation=utils.implForWrapper(receiver);
  if(content!=='')implementation.text=content;
  if(value!==undefined)implementation.setAttributeNS(null,'value',value);
  if(defaultSelected)implementation.setAttributeNS(null,'selected','');
  implementation._selectedness=selected;
 };
 // The factory entry is temporary; its only surviving public value is the
 // actual constructible alias. Host owns initialization/conversion state.
 const Constructor=vm.compileFunction('"use strict";return function Option(){if(!new.target)throw new TypeErrorConstructor("invalid argument");initialize(this,arguments)}',['initialize','TypeErrorConstructor'],{...(context?{parsingContext:context}:{}),filename:'red-panda:Option'})(initialize,TypeErrorConstructor);
 define(Constructor,'prototype',{value:window.HTMLOptionElement.prototype,writable:false});
 define(window,'Option',{value:Constructor,writable:true,enumerable:false,configurable:true});
 installed.set(window,Constructor);return Constructor;
}
