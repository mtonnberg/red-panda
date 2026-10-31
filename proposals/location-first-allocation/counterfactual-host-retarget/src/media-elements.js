import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {getRuntimeBinding} from './native-runtime.js';
import {createInvocationTrampoline} from './invocation.js';
import {platformFactoryRecord} from './platform-factories.js';
import {registerProtocolPrototype} from './protocol-classes.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const MediaImpl=require('jsdom/lib/jsdom/living/nodes/HTMLMediaElement-impl.js').implementation;
const VideoImpl=require('jsdom/lib/jsdom/living/nodes/HTMLVideoElement-impl.js').implementation;
const installed=new WeakMap(),states=new WeakMap(),apply=Reflect.apply,construct=Reflect.construct,define=Object.defineProperty,own=Object.getOwnPropertyDescriptor;
const record=value=>Object.assign(Object.create(null),value);
const probable=new Set(['audio/mpeg','audio/mp3','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/wave','audio/x-wav','video/mp4','video/webm','video/ogg']);
const possible=new Set(['audio/aac','audio/x-m4a','video/x-m4v','audio/flac']);
function factory(g,bridge){
 const TypeError=g.TypeError,String=g.String,prototypeOf=g.Object.getPrototypeOf,apply=Reflect.apply,description=Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get,primitive=Symbol.toPrimitive;
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function'||(value!==undefined&&typeof value==='undefined'));
 function text(value){
  if(object(value)){const exotic=value[primitive];if(exotic!=null){if(typeof exotic!=='function')throw new TypeError('invalid argument');value=apply(exotic,value,['string']);if(object(value))throw new TypeError('invalid argument');}else{let done=false;for(const key of ['toString','valueOf']){const fn=value[key];if(typeof fn!=='function')continue;const next=apply(fn,value,[]);if(!object(next)){value=next;done=true;break}}if(!done)throw new TypeError('invalid argument');}}
  return String(typeof value==='symbol'?apply(description,value,[]):value);
 }
 const number=value=>+value;
 function HTMLMediaElement(){if(!new.target)throw new TypeError('invalid argument');if(new.target===HTMLMediaElement)throw new TypeError('');return bridge.construct('HTMLMediaElement',new.target);}
 function HTMLAudioElement(){if(!new.target)throw new TypeError('invalid argument');if(new.target===HTMLAudioElement)throw new TypeError('');return bridge.construct('HTMLAudioElement',new.target);}
 function HTMLVideoElement(){if(!new.target)throw new TypeError('invalid argument');if(new.target===HTMLVideoElement)throw new TypeError('');return bridge.construct('HTMLVideoElement',new.target);}
 function Audio(){if(!new.target)throw new TypeError('invalid argument');return bridge.audio(arguments[0]==null?null:text(arguments[0]),prototypeOf(this));}
 bridge.export(HTMLMediaElement,HTMLAudioElement,HTMLVideoElement,Audio,text,number);
}
function implementation(value,video=false){const provenance=platformFactoryRecord(value);if(!provenance)return null;const impl=provenance.implementation;return impl instanceof(video?VideoImpl:MediaImpl)?impl:null;}
function state(impl){let value=states.get(impl);if(!value){value=record({paused:true,currentTime:0,volume:1,muted:false,playbackRate:1,readyState:0,networkState:0});states.set(impl,value);}return value;}
export function installMediaElements(page,window){
 if(installed.has(window))return installed.get(window);
 const context=utils.implForWrapper(window)._globalObject,invocation=createInvocationTrampoline(context),binding=page.browser?.runtimeBinding??getRuntimeBinding();
 const original=record({HTMLMediaElement:window.HTMLMediaElement,HTMLAudioElement:window.HTMLAudioElement,HTMLVideoElement:window.HTMLVideoElement});
 const originalMedia=original.HTMLMediaElement.prototype,audio=original.HTMLAudioElement.prototype,video=original.HTMLVideoElement.prototype;
 const tracks=own(originalMedia,'textTracks'),addTrack=own(originalMedia,'addTextTrack');
 const TypeError=window.TypeError,Promise=window.Promise,Event=window.Event,create=window.Object.create,dispatchEvent=window.EventTarget.prototype.dispatchEvent;
 const getAttribute=window.Element.prototype.getAttribute,setAttribute=window.Element.prototype.setAttribute,removeAttribute=window.Element.prototype.removeAttribute,createElement=window.Document.prototype.createElement;
 const document=window.document,options={timeout:Math.min(page.timeout??2000,2000),displayErrors:false};
 const api=record({}),media=apply(create,undefined,[window.HTMLElement.prototype]);
 const invoke=(fn,receiver,args)=>invocation.invoke(fn,receiver,args,options);
 const fail=message=>{throw construct(TypeError,[message]);};
 const requireMedia=(value,isVideo=false)=>{const impl=implementation(value,isVideo);if(!impl)fail('Illegal invocation');return impl;};
 const text=value=>invoke(api.text,undefined,[value]),number=value=>invoke(api.number,undefined,[value]);
 const entry=(name,length,fn)=>{const value=binding.createEntry((_incumbent,receiver,args)=>fn(receiver,args),window.Object);define(value,'name',{value:name,configurable:true});define(value,'length',{value:length,configurable:true});return value;};
 const accessor=(target,key,get,set)=>define(target,key,{get:entry('get '+key,0,get),...(set?{set:entry('set '+key,1,set)}:{}),enumerable:true,configurable:true});
 const method=(target,key,length,fn)=>define(target,key,{value:entry(key,length,fn),enumerable:true,configurable:true,writable:true});
 const attribute=(receiver,key)=>apply(getAttribute,receiver,[key]);
 const writeAttribute=(receiver,key,value)=>apply(value===null?removeAttribute:setAttribute,receiver,value===null?[key]:[key,value]);
 const reflectBoolean=(target,key,attributeName=key)=>accessor(target,key,receiver=>{requireMedia(receiver);return attribute(receiver,attributeName)!==null;},(receiver,args)=>{requireMedia(receiver);writeAttribute(receiver,attributeName,args[0]?'':null);});
 const source=(receiver,key)=>{const impl=requireMedia(receiver,key==='poster'),raw=attribute(receiver,key);if(raw===null||raw==='')return '';try{return new URL(raw,impl._ownerDocument.baseURLSerialized()).href;}catch{return raw;}};
 const dispatch=(receiver,type)=>{const event=construct(Event,[type]);invoke(dispatchEvent,receiver,[event]);};
 // The target deliberately exposes a headless state protocol, not decoded
 // samples or a playback clock. All changes below are real per-element state.
 accessor(media,'crossOrigin',receiver=>{requireMedia(receiver);const value=attribute(receiver,'crossorigin');if(value===null)return null;return value.toLowerCase()==='use-credentials'?'use-credentials':'anonymous';},(receiver,args)=>{requireMedia(receiver);writeAttribute(receiver,'crossorigin',args[0]==null?null:text(args[0]));});
 reflectBoolean(media,'defaultMuted','muted');
 for(const[key,value]of [['NETWORK_EMPTY',0],['NETWORK_IDLE',1],['NETWORK_LOADING',2],['NETWORK_NO_SOURCE',3],['HAVE_NOTHING',0],['HAVE_METADATA',1],['HAVE_CURRENT_DATA',2],['HAVE_FUTURE_DATA',3],['HAVE_ENOUGH_DATA',4]])define(media,key,{value,enumerable:true});
 accessor(media,'src',receiver=>source(receiver,'src'),(receiver,args)=>{requireMedia(receiver);writeAttribute(receiver,'src',text(args[0]));});
 accessor(media,'currentSrc',receiver=>source(receiver,'src'));
 for(const key of ['autoplay','controls','loop'])reflectBoolean(media,key);
 accessor(media,'muted',receiver=>state(requireMedia(receiver)).muted,(receiver,args)=>{state(requireMedia(receiver)).muted=!!args[0];});
 accessor(media,'preload',receiver=>{requireMedia(receiver);const raw=attribute(receiver,'preload'),value=raw?.toLowerCase();return value==='none'||value==='metadata'?value:'auto';},(receiver,args)=>{requireMedia(receiver);writeAttribute(receiver,'preload',text(args[0]));});
 accessor(media,'volume',receiver=>state(requireMedia(receiver)).volume,(receiver,args)=>{const value=state(requireMedia(receiver)),next=number(args[0]);value.volume=Number.isNaN(next)?1:Math.max(0,Math.min(1,next));});
 for(const key of ['playbackRate','currentTime'])accessor(media,key,receiver=>state(requireMedia(receiver))[key],(receiver,args)=>{state(requireMedia(receiver))[key]=number(args[0]);});
 accessor(media,'duration',receiver=>{requireMedia(receiver);return NaN;});
 accessor(media,'paused',receiver=>state(requireMedia(receiver)).paused);
 for(const key of ['ended','seeking'])accessor(media,key,receiver=>{requireMedia(receiver);return false;});
 for(const key of ['readyState','networkState'])accessor(media,key,receiver=>state(requireMedia(receiver))[key]);
 accessor(media,'error',receiver=>{requireMedia(receiver);return null;});
 // Reuse the actual text-track producer/list state and loader unchanged.
 define(media,'textTracks',tracks);define(media,'addTextTrack',addTrack);
 method(media,'canPlayType',1,(receiver,args)=>{requireMedia(receiver);if(!args.length)fail('invalid argument');const value=text(args[0]).split(';',1)[0].replace(/^[\t\n\r\f\v ]+|[\t\n\r\f\v ]+$/g,'').toLowerCase();return probable.has(value)?'probably':possible.has(value)?'maybe':'';});
 method(media,'play',0,receiver=>construct(Promise,[(resolve,reject)=>{try{const impl=implementation(receiver);if(!impl)fail('invalid argument');const value=state(impl),paused=value.paused;value.paused=false;value.readyState=4;value.networkState=1;if(paused){dispatch(receiver,'play');dispatch(receiver,'playing');}resolve(undefined);}catch(error){reject(error);}}]));
 method(media,'pause',0,receiver=>{const value=state(requireMedia(receiver));if(!value.paused){value.paused=true;dispatch(receiver,'pause');}});
 method(media,'load',0,receiver=>{const value=state(requireMedia(receiver));value.paused=true;value.currentTime=0;value.readyState=0;value.networkState=2;dispatch(receiver,'emptied');});
 const bridge=record({
  construct(name,newTarget){return construct(original[name],[],newTarget);},
  audio(url,prototype){const value=apply(createElement,document,['audio']);Object.setPrototypeOf(value,prototype);writeAttribute(value,'preload','auto');if(url!==null)writeAttribute(value,'src',url);return value;},
  export(HTMLMediaElement,HTMLAudioElement,HTMLVideoElement,Audio,text,number){
   Object.assign(api,{HTMLMediaElement,HTMLAudioElement,HTMLVideoElement,Audio,text,number});
   const values=record({HTMLMediaElement,HTMLAudioElement,HTMLVideoElement});
   for(const [name,C]of Object.entries(values)){const p=name==='HTMLMediaElement'?media:name==='HTMLAudioElement'?audio:video;define(C,'prototype',{value:p,writable:false});define(p,'constructor',{value:C,writable:true,configurable:true});define(window,name,{value:C,writable:true,configurable:true});registerProtocolPrototype(p,name);}
   Object.setPrototypeOf(HTMLMediaElement,window.HTMLElement);Object.setPrototypeOf(HTMLAudioElement,HTMLMediaElement);Object.setPrototypeOf(HTMLVideoElement,HTMLMediaElement);
   for(const key of ['NETWORK_EMPTY','NETWORK_IDLE','NETWORK_LOADING','NETWORK_NO_SOURCE','HAVE_NOTHING','HAVE_METADATA','HAVE_CURRENT_DATA','HAVE_FUTURE_DATA','HAVE_ENOUGH_DATA'])define(HTMLMediaElement,key,{value:media[key],enumerable:true});
   Object.setPrototypeOf(audio,media);Object.setPrototypeOf(video,media);
   define(Audio,'prototype',{value:audio,writable:false});define(window,'Audio',{value:Audio,writable:true,configurable:true});
  },
 });
 vm.compileFunction(`(${factory.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:context})(bridge);
 define(media,window.Symbol.toStringTag,{value:'HTMLMediaElement',configurable:true});
 // Video owns only the measured reflected values and zero dimensions; no
 // decoded frame/dimension or fabricated range backend is introduced.
 const width=own(video,'width'),height=own(video,'height'),playsInline=own(video,'playsInline'),tag=own(video,window.Symbol.toStringTag),constructor=own(video,'constructor');
 for(const key of Reflect.ownKeys(video))if(own(video,key).configurable)delete video[key];
 for(const[key,descriptor]of [['width',width],['height',height],['playsInline',playsInline]])accessor(video,key,receiver=>{requireMedia(receiver,true);return apply(descriptor.get,receiver,[]);},(receiver,args)=>{requireMedia(receiver,true);return apply(descriptor.set,receiver,[args[0]]);});
 accessor(video,'poster',receiver=>source(receiver,'poster'),(receiver,args)=>{requireMedia(receiver,true);writeAttribute(receiver,'poster',text(args[0]));});
 for(const key of ['videoWidth','videoHeight'])accessor(video,key,receiver=>{requireMedia(receiver,true);return 0;});
 define(video,'constructor',constructor);define(video,window.Symbol.toStringTag,tag);
 const controller=record({});installed.set(window,controller);return controller;
}
