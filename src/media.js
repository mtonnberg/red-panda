import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const INSTALLED=new WeakMap(),LISTS=new WeakMap(),EVENTS=new WeakMap(),SCREENS=new WeakMap();

function queries(text){let depth=0,start=0;const result=[];for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;else if(text[i]===')')depth--;else if(text[i]===','&&depth===0){result.push(text.slice(start,i));start=i+1}if(depth<0)return[]}if(depth)return[];result.push(text.slice(start));return result}
function condition(text,viewport){
 const feature=/^\(\s*([\w-]+)\s*:\s*([^()]*)\)$/.exec(text);if(!feature)return false;
 if(feature[1]==='orientation')return feature[2].trim()===(viewport.width>=viewport.height?'landscape':'portrait');
 const name=/^(min-|max-)?(device-)?(width|height)$/.exec(feature[1]);if(!name)return false;
 const length=/^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+))(px|em|rem)\s*$/.exec(feature[2]);if(!length)return false;
 const wanted=Number(length[1])*(length[2]==='px'?1:16);if(!Number.isFinite(wanted)||wanted>4294967295)return false;
 const actual=viewport[name[3]];return name[1]==='min-'?actual>=wanted:name[1]==='max-'?actual<=wanted:actual===wanted;
}

/** The measured native profile supports screen/print/all, comma OR, and/not,
 * orientation and px/em/rem dimensions. Unknown types and malformed grammar
 * fail closed; unsupported features are false and may be negated. */
export function evaluateMedia(text,viewport,{emptyMatches=false}={}){
 text=String(text).replace(/\/\*[\s\S]*?\*\//g,' ').toLowerCase().trim();if(!text)return emptyMatches;
 return queries(text).some(query=>{
  query=query.trim();let negate=false;
  if(/^not\s+/.test(query)){negate=true;query=query.replace(/^not\s+/,'')}
  let only=false;if(/^only\s+/.test(query)){only=true;query=query.replace(/^only\s+/,'')}
  let matches=true;const type=/^([a-z-]+)(?=\s|$)/.exec(query);
  if(type){if(!['all','screen','print'].includes(type[1]))return false;matches=type[1]!=='print';query=query.slice(type[0].length).trim();if(query){if(!/^and\s+/.test(query))return false;query=query.replace(/^and\s+/,'')}}
  else if(only)return false;
  if(!query)return type?(negate?!matches:matches):false;
  const parts=query.split(/\s+and\s+/);if(parts.some(part=>!/^\([^()]*\)$/.test(part.trim())))return false;
  for(const part of parts)matches&&=condition(part.trim(),viewport);
  return negate?!matches:matches;
 });
}

function trusted(target,event){const impl=implForWrapper(event);impl.isTrusted=true;return implForWrapper(target)._dispatch(impl)}
export function refreshMediaQueries(window){
 const record=INSTALLED.get(window);if(!record||record.disposed)return;
 const viewport={width:window.innerWidth,height:window.innerHeight};
 for(const reference of record.queries){
  const target=reference.deref();if(!target){record.queries.delete(reference);continue;}const item=LISTS.get(target);
  const next=evaluateMedia(item.media,viewport);if(next===item.matches)continue;item.matches=next;
  const timer=window.setTimeout(()=>{record.timers.delete(timer);if(!record.disposed&&!record.signal?.aborted)trusted(item.target,new window.MediaQueryListEvent('change',{matches:next,media:item.media}))},0);record.timers.add(timer);
 }
}

function mediaInterfaces(window,record,secret,LISTS,EVENTS,evaluateMedia){
 const EventTarget=window.EventTarget,Event=window.Event;
 const domString=value=>{if(typeof value==='symbol')throw new window.TypeError('Cannot convert a Symbol to a DOMString');return String(value)};
 const brand=target=>{const item=LISTS.get(target);if(!item)throw new window.TypeError('Illegal invocation');return item};
 class MediaQueryList extends EventTarget{
  constructor(token,media){super();if(token!==secret)throw new window.TypeError('Illegal Constructor');const item={target:this,record,media,matches:evaluateMedia(media,{width:window.innerWidth,height:window.innerHeight}),handler:null,listener:null};LISTS.set(this,item);record.queries.add(new WeakRef(this))}
  get media(){return brand(this).media}
  get matches(){const item=brand(this);return item.record.disposed?item.matches:evaluateMedia(item.media,{width:item.record.window.innerWidth,height:item.record.window.innerHeight})}
  addListener(callback){brand(this);this.addEventListener('change',callback)}
  removeListener(callback){brand(this);this.removeEventListener('change',callback)}
  get onchange(){return brand(this).handler}
  set onchange(callback){const item=brand(this),next=typeof callback==='function'?callback:null;if(item.handler&&next){item.handler=next;return}if(item.listener)this.removeEventListener('change',item.listener);item.handler=next;item.listener=next?event=>item.handler?.call(this,event):null;if(item.listener)this.addEventListener('change',item.listener)}
 }
 Object.defineProperty(MediaQueryList,'length',{value:0,configurable:true});
 Object.defineProperty(MediaQueryList.prototype,Symbol.toStringTag,{value:'MediaQueryList',configurable:true});
 for(const key of['media','matches','addListener','removeListener','onchange']){const descriptor=Object.getOwnPropertyDescriptor(MediaQueryList.prototype,key);Object.defineProperty(MediaQueryList.prototype,key,{...descriptor,enumerable:true})}
 class MediaQueryListEvent extends Event{
  constructor(type,init={}){if(!arguments.length)throw new window.TypeError('MediaQueryListEvent requires an event type');init=init??{};super(type,init);EVENTS.set(this,{matches:!!init.matches,media:init.media===undefined?'':domString(init.media)})}
  get matches(){if(!EVENTS.has(this))throw new window.TypeError('Illegal invocation');return EVENTS.get(this).matches}
  get media(){if(!EVENTS.has(this))throw new window.TypeError('Illegal invocation');return EVENTS.get(this).media}
 }
 Object.defineProperty(MediaQueryListEvent.prototype,Symbol.toStringTag,{value:'MediaQueryListEvent',configurable:true});
 for(const key of['media','matches']){const descriptor=Object.getOwnPropertyDescriptor(MediaQueryListEvent.prototype,key);Object.defineProperty(MediaQueryListEvent.prototype,key,{...descriptor,enumerable:true})}
 const matchMedia=function matchMedia(query){if(!arguments.length)throw new window.TypeError('matchMedia requires a query');if(record.disposed||record.signal?.aborted)throw new window.DOMException('Document is disposed','InvalidStateError');return new MediaQueryList(secret,domString(query))};
 return {MediaQueryList,MediaQueryListEvent,matchMedia};
}

export function installMedia(page,window){
 if(INSTALLED.has(window))return INSTALLED.get(window).controller;
 const record={page,window,queries:new Set(),timers:new Set(),disposed:false,signal:page.documentAbort?.signal};
 const interfaces=window.eval(`(${mediaInterfaces.toString()})`)(window,record,{},LISTS,EVENTS,evaluateMedia);
 Object.assign(window,interfaces);
 SCREENS.set(window.screen,record);
 for(const[key,dimension]of[['width','width'],['height','height']]){const original=Object.getOwnPropertyDescriptor(window.Screen.prototype,key);if(original?.get)Object.defineProperty(window.Screen.prototype,key,{...original,get(){const fallback=original.get.call(this),owner=SCREENS.get(this);return owner?owner.window[dimension==='width'?'innerWidth':'innerHeight']:fallback}})}
 const previous=window.close;function dispose(){if(record.disposed)return;record.disposed=true;for(const timer of record.timers)window.clearTimeout(timer);record.timers.clear();record.queries.clear();record.signal?.removeEventListener('abort',dispose);if(window.close===close)window.close=previous}function close(...args){dispose();return previous.apply(this,args)}window.close=close;record.signal?.addEventListener('abort',dispose,{once:true});
 record.controller={dispose,refresh:()=>refreshMediaQueries(window)};INSTALLED.set(window,record);return record.controller;
}
