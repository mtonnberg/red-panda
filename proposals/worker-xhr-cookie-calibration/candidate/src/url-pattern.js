// Independent Web IDL surface and component compiler. Node's real URLPattern
// parser performs URL/pattern canonicalization; V8's public bounded RegExp API
// executes the generated component expressions with a finite backtrack budget.
import { types } from 'node:util';
import { getRuntimeBinding } from './native-runtime.js';
import { registerPlatformFactoryKind } from './platform-factory-hooks.js';
import { registerPlatformFactory } from './platform-factories.js';

const Backend = globalThis.URLPattern;
const components = ['protocol','username','password','hostname','port','pathname','search','hash'];
const states = new WeakMap(), installed = new WeakSet();
const safeInput = new Backend();
const copyInput = input => typeof input==='string'?input:Object.assign(Object.create(null),input);
const escapeRegExp = value => value.replace(/[\\^$.*+?()[\]{}|/]/g,'\\$&');
const escapePattern = value => value.replace(/[+*?{}:()\\]/g,'\\$&');
function percentEncode(value, extra=''){let result='';for(const byte of Buffer.from(value,'utf8'))result+=byte<=31||byte>=127||extra.includes(String.fromCharCode(byte))?'%'+byte.toString(16).toUpperCase().padStart(2,'0'):String.fromCharCode(byte);return result}
const identifierStart = /[$_\p{ID_Start}]/u, identifierContinue = /[$\u200c\u200d_\p{ID_Continue}]/u;

function parse(source, component, specialPathname=true) {
 const parts=[];let position=0,nextName=0,pending='';
 const flush=()=>{if(pending){const previous=parts.at(-1);if(previous?.type===3&&previous.modifier===3)previous.value+=pending;else parts.push({type:3,modifier:3,value:pending,prefix:'',suffix:''});pending=''}};
 const char=()=>String.fromCodePoint(source.codePointAt(position));
 function literal(){if(source[position]==='\\'){position++;const value=char();position+=value.length;return value}const value=char();position+=value.length;return value}
 function dynamic(){
  let name,regex;
  if(source[position]===':'){
   position++;name='';
   if(!identifierStart.test(char()))throw new Error('Invalid normalized URLPattern name');
   do{const value=char();name+=value;position+=value.length}while(position<source.length&&identifierContinue.test(char()));
  }
  if(source[position]==='('){
   position++;const start=position;let depth=1,inClass=false;
   while(position<source.length&&depth){const value=source[position++];if(value==='\\'){position++;continue}if(value==='[')inClass=true;else if(value===']')inClass=false;else if(!inClass){if(value==='(')depth++;else if(value===')')depth--}}
   if(depth)throw new Error('Invalid normalized URLPattern expression');regex=source.slice(start,position-1);
  }else if(name===undefined&&source[position]==='*'){position++;regex='.*'}
  if(name===undefined&&regex===undefined)return null;
  name??=String(nextName++);
  const type=regex===undefined?1:regex==='.*'?0:2;
  return{type,name,regex:regex??(component==='pathname'&&specialPathname?'[^\\/]+?':component==='hostname'?'[^.]+?':'.+?')};
 }
 const modifier=()=>{const value=source[position];if(value==='*'||value==='?'||value==='+'){position++;return value==='*'?0:value==='?'?1:2}return 3};
 while(position<source.length){
  if(source[position]==='{'){
   flush();position++;let prefix='';
   while(position<source.length&&source[position]!=='}'&&![':', '(', '*'].includes(source[position]))prefix+=literal();
   const part=dynamic();let suffix='';
   while(position<source.length&&source[position]!=='}')suffix+=literal();
   if(source[position++]!=='}')throw new Error('Invalid normalized URLPattern group');
   const mod=modifier();
   if(part)parts.push({...part,prefix,suffix,value:part.regex,modifier:mod});
   else if(mod===3){pending=prefix;flush()}else parts.push({type:3,value:prefix,prefix:'',suffix:'',modifier:mod});
   continue;
  }
  if([':', '(', '*'].includes(source[position])){
   const part=dynamic();let prefix='';
   if((component==='pathname'&&specialPathname&&pending.endsWith('/'))||(component==='hostname'&&pending.endsWith('.'))){prefix=pending.slice(-1);pending=pending.slice(0,-1)}
   flush();parts.push({...part,prefix,suffix:'',value:part.regex,modifier:modifier()});continue;
  }
  pending+=literal();
 }
 flush();return parts;
}

function compile(parts){
 const names=[];let source='^';
 for(const part of parts){
  if(part.type===3){const value=escapeRegExp(part.value);source+=part.modifier===3?value:`(?:${value})${['*','?','+'][part.modifier]}`;continue}
  names.push(part.name);const prefix=escapeRegExp(part.prefix),suffix=escapeRegExp(part.suffix),value=part.regex;
  if(part.modifier===3)source+=`${prefix}(${value})${suffix}`;
  else if(part.modifier===1)source+=`(?:${prefix}(${value})${suffix})?`;
  else if(!prefix&&!suffix)source+=`((?:${value})${part.modifier===0?'*':'+'})`;
  else source+=`(?:${prefix}(${value}(?:${suffix}${prefix}(?:${value}))*)${suffix})${part.modifier===0?'?':''}`;
 }
 return{source:source+'$',names};
}

function compare(left,right){
 const empty={type:3,modifier:3,prefix:'',value:'',suffix:''};
 for(let i=0;i<Math.max(left.length,right.length);i++)for(const key of ['type','modifier','prefix','value','suffix']){
  const a=(left[i]??empty)[key],b=(right[i]??empty)[key];if(a<b)return-1;if(a>b)return 1;
 }
 return 0;
}

function factory(g,bridge){
 'use strict';
 const TypeError=g.TypeError,define=g.Object.defineProperty,getDescriptor=g.Object.getOwnPropertyDescriptor,has=g.Reflect.has,set=g.Reflect.set;
 const Array=g.Array,String=g.String,Boolean=g.Boolean,apply=g.Reflect.apply,ownKeys=g.Object.keys;
 const description=getDescriptor(g.Symbol.prototype,'description').get;
 const keys=['baseURL','hash','hostname','password','pathname','port','protocol','search','username'];
 const names=['protocol','username','password','hostname','port','pathname','search','hash'];
 const string=value=>typeof value==='symbol'?apply(description,value,[])??'':String(value);
 const dictionary=value=>{const result={};if(value==null)return result;if(typeof value!=='object'&&typeof value!=='function')throw new TypeError('');for(let i=0;i<keys.length;i++){const key=keys[i];if(has(value,key)){const item=value[key];if(item!==undefined)define(result,key,{value:string(item),enumerable:true,writable:true,configurable:true})}}return result};
 const input=value=>{if(typeof value==='string'||typeof value==='symbol')return string(value);if(bridge.isStringObject(value))throw new TypeError('');return dictionary(value)};
 const check=value=>{if(!bridge.hasState(value))throw new TypeError('Illegal invocation')};
 const invoke=callback=>{const result=callback();if(result?.error)throw new TypeError(result.message??'');return result.value};
 function URLPattern(){
  if(new.target===undefined)throw new TypeError('invalid argument');
  const init=input(arguments[0]);let base,options;
  if(typeof arguments[1]==='string'||typeof arguments[1]==='symbol'){base=string(arguments[1]);options=arguments[2];if(typeof init!=='string')throw new TypeError('')}
  else options=arguments[1];
  if(options!=null&&typeof options!=='object'&&typeof options!=='function')throw new TypeError('');
  const ignoreCase=Boolean(options?.ignoreCase);
  invoke(()=>bridge.construct(this,init,base,ignoreCase));
 }
 const prototype=URLPattern.prototype;delete prototype.constructor;
 define(URLPattern,'prototype',{writable:false});
 for(const name of [...names,'hasRegExpGroups']){const accessors={[`get ${name}`](){check(this);return bridge.read(this,name)}};const getter=accessors[`get ${name}`];define(prototype,name,{get:getter,enumerable:true,configurable:true})}
 function execute(receiver,args,test){
  check(receiver);const value=args.length?args[0]:{},init=typeof value==='object'||typeof value==='function'||value==null?input(value):string(value);
  let base;if(args[1]!==undefined&&args[1]!==null){if(typeof init!=='string')throw new TypeError('');base=string(args[1])}
  const result=invoke(()=>bridge.execute(receiver,init,base));if(test)return result!==null;if(result===null)return null;
  const output={};const inputs=new Array();for(const item of result.inputs){if(typeof item==='string')define(inputs,inputs.length,{value:item,writable:true,enumerable:true,configurable:true});else{const copied={};for(let i=0;i<keys.length;i++){const key=keys[i];if(has(item,key))set(copied,key,item[key])}define(inputs,inputs.length,{value:copied,writable:true,enumerable:true,configurable:true})}}
  set(output,'inputs',inputs);
  for(let n=0;n<names.length;n++){const name=names[n],value=result[name],groups={};for(let i=0;i<value.names.length;i++)set(groups,value.names[i],value.captures[i+1]);const component={};set(component,'input',value.input);set(component,'groups',groups);set(output,name,component)}
  return output;
 }
 const methods={test(){return execute(this,arguments,true)},exec(){return execute(this,arguments,false)},generate(component){check(this);if(arguments.length<2)throw new TypeError('invalid argument');if(typeof component!=='string')throw new TypeError('invalid argument');const groups=arguments[1];if(groups==null||(typeof groups!=='object'&&typeof groups!=='function'))throw new TypeError('invalid argument');const data={};const groupKeys=ownKeys(groups);for(let i=0;i<groupKeys.length;i++){const key=groupKeys[i];define(data,key,{value:string(groups[key]),enumerable:true})};return invoke(()=>bridge.generate(this,component,data))}};
 for(const name of ['test','exec','generate'])define(prototype,name,{value:methods[name],writable:true,enumerable:true,configurable:true});
 define(prototype,'constructor',{value:URLPattern,writable:true,configurable:true});
 define(prototype,g.Symbol.toStringTag,{value:'URLPattern',configurable:true});
 const statics={compareComponent(component,left,right){if(arguments.length<3)throw new TypeError('invalid argument');if(typeof component!=='string')throw new TypeError('invalid argument');if(!bridge.hasState(left)||!bridge.hasState(right))throw new TypeError('invalid argument');return invoke(()=>bridge.compare(left,right,component))}};
 define(URLPattern,'compareComponent',{value:statics.compareComponent,writable:true,enumerable:true,configurable:true});
 define(g,'URLPattern',{value:URLPattern,writable:true,configurable:true});
}

export function installURLPattern(realm,{evaluate=source=>realm.eval(source)}={}){
 if(installed.has(realm))return;
 if(typeof Backend!=='function')throw new Error('URLPattern requires the prepared Node runtime');
 const bounded=getRuntimeBinding().boundedRegExp;if(typeof bounded!=='function')throw new Error('URLPattern requires the bounded matching runtime addon; rebuild and restart');
 registerPlatformFactoryKind('URLPattern');
 const anchor=realm.Object.prototype;
 const wrap=callback=>{try{return{value:callback()}}catch{return{error:true,message:''}}};
 const get=value=>states.get(value);
 evaluate(`(${factory.toString()})`)(realm,{
  isStringObject:types.isStringObject,hasState:value=>states.has(value),read:(value,name)=>get(value).normalized[name],
  construct(value,input,base,ignoreCase){return wrap(()=>{
   const init=copyInput(input),backend=base===undefined?new Backend(init,{ignoreCase}):new Backend(init,base,{ignoreCase});
   const patterns=Object.create(null),normalized=Object.create(null);let specialPathname=true;for(const name of components){if(name==='pathname')specialPathname=['http','https','ws','wss','ftp','file'].some(scheme=>bounded(patterns.protocol.source,scheme,ignoreCase,anchor)!==null);normalized[name]=name==='search'?backend[name].replaceAll("'",'%27'):backend[name];const parts=parse(normalized[name],name,specialPathname);patterns[name]={parts,...compile(parts)}}normalized.hasRegExpGroups=backend.hasRegExpGroups;
   const state=Object.freeze(Object.assign(Object.create(null),{backend,patterns,normalized,ignoreCase,specialPathname}));states.set(value,state);registerPlatformFactory(value,{kind:'URLPattern',implementation:state,globalObject:realm});
  })},
  execute(receiver,input,base){return wrap(()=>{const state=get(receiver);
   const init=copyInput(input),normalized=base===undefined?safeInput.exec(init):safeInput.exec(init,base);if(!normalized)return null;
   normalized.search.input=normalized.search.input.replaceAll("'",'%27');
   const result={inputs:base===undefined?[init]:[init,base]};for(const name of components){const pattern=state.patterns[name],captures=bounded(pattern.source,normalized[name].input,state.ignoreCase,anchor);if(captures===null)return null;result[name]={input:normalized[name].input,names:pattern.names,captures}}return result;
  })},
  compare(left,right,name){const a=get(left),b=get(right);if(!components.includes(name))return{error:true,message:'invalid argument'};return{value:compare(a.patterns[name].parts,b.patterns[name].parts)}},
  generate(receiver,name,groups){const state=get(receiver);if(!components.includes(name))return{error:true,message:'invalid argument'};return wrap(()=>{
   const opaque=name==='pathname'&&!state.specialPathname;
   let value='';for(const part of state.patterns[name].parts){
    if(part.modifier!==3||part.type!==3&&part.type!==1)throw new Error();
    if(part.type===3){value+=part.value;continue}
    if(!Object.hasOwn(groups,part.name))throw new Error();let item=groups[part.name];
    if(name==='pathname'){
     item=opaque?percentEncode(item):percentEncode(item.replace(/[\t\r\n]/g,'').replace(/\\/g,'/'),' "#<>?`{}');
     if(!opaque&&item.includes('/'))throw new Error();
    }else if(name==='username'||name==='password')item=percentEncode(item,' "#<>?`{}/:;=@[\\]^|');
    else if(name==='search')item=percentEncode(item,' "#<>\'');
    else if(name==='hash')item=percentEncode(item,' "<>`');
    else if(name==='protocol'){
     item=item===''?'':new URL(item+':red-panda').protocol.slice(0,-1);
    }else{
     item=new Backend({[name]:escapePattern(item)})[name].replace(/\\(.)/gs,'$1');
     if(name==='hostname'&&item.includes('.'))throw new Error();
    }
    value+=part.prefix+item+part.suffix;
   }
   return value;
  })},
 });installed.add(realm);
}
