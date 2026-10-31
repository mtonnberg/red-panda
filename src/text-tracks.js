import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import 'jsdom';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
import {parseWebVTT,renderVTTCue} from './vtt-parser.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const {wrapperForImpl}=utils;
const EventTarget=require('jsdom/lib/jsdom/living/generated/EventTarget.js');
const MediaImpl=require('jsdom/lib/jsdom/living/nodes/HTMLMediaElement-impl.js').implementation;
const TrackImpl=require('jsdom/lib/jsdom/living/nodes/HTMLTrackElement-impl.js').implementation;
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const {domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const INSTALLED=new WeakMap(),GLOBALS=new WeakMap(),STATES=new WeakMap(),ELEMENTS=new WeakMap(),MEDIA=new WeakMap();
const HTML='http://www.w3.org/1999/xhtml',KINDS=['subtitles','captions','descriptions','chapters','metadata'];
const stateDefaults={id:'',track:null,pauseOnExit:false,region:null,vertical:'',snapToLines:true,line:'auto',lineAlign:'start',position:'auto',positionAlign:'auto',size:100,align:'center'};
const regionDefaults={id:'',width:100,lines:3,regionAnchorX:0,regionAnchorY:100,viewportAnchorX:0,viewportAnchorY:100,scroll:''};
let patched=false;
const object=()=>Object.create(null);
function owner(document){const record=GLOBALS.get(document?._globalObject);return record&&!record.disposed?record:null;}
function elementKind(element){const value=element.getAttributeNS(null,'kind');return value===null?'subtitles':KINDS.includes(value.toLowerCase())?value.toLowerCase():'metadata';}
function mediaState(element){let state=MEDIA.get(element);if(!state){state={element,added:[],list:null};MEDIA.set(element,state)}return state;}
function trackState(element){
 let state=ELEMENTS.get(element);if(state)return state;
 const record=owner(element._ownerDocument);if(!record)return null;
 state={kind:'TextTrack',record,element,media:null,mode:'disabled',cues:[],cuesList:null,activeList:null,handlers:object(),public:null,loadGeneration:0,readyState:0,pending:null,request:null,lastURL:null,attempted:false,explicitMode:false};ELEMENTS.set(element,state);return state;
}
function allTracks(media){
 const result=[];for(const child of domSymbolTree.childrenIterator(media.element))if(child instanceof TrackImpl){const state=trackState(child);if(state)result.push(state)}
 return result.concat(media.added);
}
function cueSort(track){track.cues.sort((a,b)=>a.startTime-b.startTime||b.endTime-a.endTime||a.order-b.order);}
function primary(state){if(!state)return null;if(!state.public)state.public=state.record.api.make(state.kind,state);return state.public;}
function listState(kind,record,read){return{kind,record,read,handlers:object(),public:null};}
function cuesList(track,active=false){const key=active?'activeList':'cuesList';if(!track[key])track[key]=listState('TextTrackCueList',track.record,()=>active?[]:track.cues);return primary(track[key]);}
function cueRemove(track,cue){const index=track.cues.indexOf(cue);if(index<0)return false;track.cues.splice(index,1);cue.track=null;return true;}
function cueAdd(track,cue){if(cue.track===track)return;if(cue.track)cueRemove(cue.track,cue);cue.track=track;cue.order=track.record.nextCue++;track.cues.push(cue);cueSort(track);}
function sourceURL(state){const raw=state.element?.getAttributeNS(null,'src');if(!raw)return null;try{return new URL(raw,state.element._ownerDocument.URL).href}catch{return null}}
function cancelLoad(state){state.loadGeneration++;if(state.request){state.request.abort();state.record.requests.delete(state.request);state.request=null;}}
function queue(record,callback){
 if(record.disposed)return;let token;token=Reflect.apply(record.setTimeout,record.window,[()=>{record.tasks.delete(token);if(!record.disposed)callback()},0]);record.tasks.add(token);return token;
}
function trustedEvent(record,element,type){
 if(record.disposed)return;const event=new record.Event(type),implementation=implForWrapper(event);implementation.isTrusted=true;element._dispatch(implementation);
}
function load(state){
 state.pending=null;const record=state.record;if(record.disposed||state.mode==='disabled')return;
 const generation=++state.loadGeneration,url=sourceURL(state);
 state.attempted=true;state.lastURL=url;
 if(!state.media||!url){state.readyState=3;trustedEvent(record,state.element,'error');return;}
 state.readyState=1;
 const controller=new record.AbortController();state.request=controller;record.requests.add(controller);
 Promise.resolve().then(()=>Reflect.apply(record.fetch,record.window,[url,{signal:controller.signal,mode:'cors',credentials:'same-origin'}]))
  .then(response=>{if(!response.ok)throw Error('Text track resource failed');return Reflect.apply(record.arrayBuffer,response,[])})
  .then(buffer=>{
   if(record.disposed||generation!==state.loadGeneration)return;
   const text=Reflect.apply(record.decode,record.decoder,[buffer]),parsed=parseWebVTT(text),regions=new Map();
   for(const descriptor of parsed.regions){const region={kind:'VTTRegion',record,...regionDefaults,...descriptor,public:null};regions.set(descriptor,region)}
   for(const cue of state.cues)cue.track=null;state.cues.length=0;
   for(const descriptor of parsed.cues){const cue={kind:'VTTCue',record,handlers:object(),...stateDefaults,...descriptor,region:regions.get(descriptor.region)??null,public:null};cueAdd(state,cue)}
   state.lastURL=url;state.readyState=2;trustedEvent(record,state.element,'load');
  },()=>{if(!record.disposed&&generation===state.loadGeneration){state.readyState=3;trustedEvent(record,state.element,'error')}})
  .catch(error=>{if(!record.disposed&&generation===state.loadGeneration){state.readyState=3;trustedEvent(record,state.element,'error')}})
  .finally(()=>{record.requests.delete(controller);if(state.request===controller)state.request=null});
}
function maybeLoad(state){
 if(!state.element||!state.media||state.mode==='disabled'||state.pending!==null||state.request)return;
 if(state.attempted&&state.lastURL===sourceURL(state))return;
 state.pending=queue(state.record,()=>load(state));
}
function selectDefaults(media){
 const tracks=allTracks(media),selected=tracks.some(track=>track.mode==='showing');
 if(!selected){const state=tracks.find(track=>track.element?.hasAttributeNS(null,'default')&&!track.explicitMode);if(state)state.mode='showing';}
 for(const state of tracks)maybeLoad(state);
}
function reconcile(element){
 const state=trackState(element);if(!state)return;const parent=domSymbolTree.parent(element),media=parent instanceof MediaImpl?parent:null;
 const previous=state.media;state.media=media;
 if(media){if(previous!==media&&state.readyState===3){state.readyState=0;state.attempted=false;}maybeLoad(state);queue(state.record,()=>selectDefaults(mediaState(media)));}
}
function descendants(node){if(node instanceof TrackImpl)return[node];const out=[];for(const current of domSymbolTree.treeIterator(node))if(current instanceof TrackImpl)out.push(current);return out;}
function patch(){
 if(patched)return;patched=true;
 for(const name of['_insert','_remove']){
  const original=NodeImpl.prototype[name];NodeImpl.prototype[name]=function(node,...args){const record=owner(this.nodeType===9?this:this._ownerDocument);if(!record)return original.call(this,node,...args);const affected=descendants(node);const result=original.call(this,node,...args);for(const element of affected)reconcile(element);return result;};
 }
 const modified=TrackImpl.prototype._attrModified;
 TrackImpl.prototype._attrModified=function(name,value,old,...args){
  const result=modified.call(this,name,value,old,...args),record=owner(this._ownerDocument);if(!record)return result;
  const state=trackState(this);
  if(name==='src'&&value!==old){cancelLoad(state);state.readyState=0;state.lastURL=null;state.attempted=false;maybeLoad(state);}
  if(name==='default'&&state.media)queue(record,()=>selectDefaults(mediaState(state.media)));
  return result;
 };
}

function factory(g,bridge,secret){
 const TypeError=g.TypeError,Error=g.Error,Exception=g.DOMException,apply=g.Reflect.apply;
 const create=g.Object.create,define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,keys=g.Object.getOwnPropertyNames;
 const Number=g.Number,String=g.String,finite=Number.isFinite,isNaN=Number.isNaN,trunc=g.Math.trunc,includes=g.Array.prototype.includes;
 const contains=(array,value)=>apply(includes,array,[value]);
 const symbolDescription=own(g.Symbol.prototype,'description').get,toPrimitive=g.Symbol.toPrimitive;
 const EventTarget=g.EventTarget,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 function string(value){
  if(object(value)){const exotic=value[toPrimitive];if(exotic!=null){if(typeof exotic!=='function')throw new TypeError('invalid argument');value=apply(exotic,value,['string']);if(object(value))throw new TypeError('invalid argument');}else{let done=false;for(const key of ['toString','valueOf']){const fn=value[key];if(typeof fn!=='function')continue;const result=apply(fn,value,[]);if(!object(result)){value=result;done=true;break}}if(!done)throw new TypeError('invalid argument')}}
  return String(typeof value==='symbol'?apply(symbolDescription,value,[]):value);
 }
 const invalid=()=>{throw new TypeError('invalid argument')},illegal=()=>{throw new TypeError('Illegal Constructor')};
 const brand=(value,kind)=>{if(!bridge.has(value,kind))throw new TypeError('Illegal invocation')};
 const number=value=>+value,restricted=value=>{const n=number(value);if(!finite(n))throw new TypeError('');return n};
 const percentage=value=>{const n=restricted(value);if(n<0||n>100)throw new Exception('Index or size is negative or greater than the allowed amount','IndexSizeError');return n};
 const union=value=>{if(typeof value==='string'){if(value==='auto')return value;throw new TypeError('')}return restricted(value)};
 const read=(value,kind,key)=>{brand(value,kind);return bridge.get(value,key)};
 const write=(value,kind,key,next)=>{brand(value,kind);bridge.set(value,key,next)};
 const enumWrite=(value,kind,key,next,allowed)=>{brand(value,kind);next=string(next);if(contains(allowed,next))bridge.set(value,key,next)};
 function shape(C,length){if(length!==undefined)define(C,'length',{value:length,configurable:true});const p=C.prototype;for(const key of keys(p)){if(key==='constructor')continue;define(p,key,{...own(p,key),enumerable:true})}delete p.constructor;define(p,'constructor',{value:C,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:C.name,configurable:true});}
 function handlers(C,kind,names){for(const name of names){const accessors={get [name](){brand(this,kind);return bridge.handler(this,name)},set [name](callback){brand(this,kind);const next=typeof callback==='function'?callback:null;const old=bridge.handlerRecord(this,name);if(old?.listener&&next){bridge.handler(this,name,{callback:next,listener:old.listener});return}if(old?.listener)apply(remove,this,[name.slice(2),old.listener]);const target=this,listener=next?function(event){return apply(bridge.handler(target,name),target,[event])}:null;bridge.handler(this,name,{callback:next,listener});if(listener)apply(add,this,[name.slice(2),listener]);}};define(C.prototype,name,{...own(accessors,name),enumerable:true,configurable:true})}}
 class MediaError{constructor(){illegal()}}
 for(const[key,value]of[['MEDIA_ERR_ABORTED',1],['MEDIA_ERR_NETWORK',2],['MEDIA_ERR_DECODE',3],['MEDIA_ERR_SRC_NOT_SUPPORTED',4]])for(const object of[MediaError,MediaError.prototype])define(object,key,{value,enumerable:true});
 const errorAccessors={get code(){return read(this,'MediaError','code')},get message(){return read(this,'MediaError','message')}};
 for(const key of['code','message'])define(MediaError.prototype,key,{...own(errorAccessors,key),configurable:true});
 class TextTrackCue extends EventTarget{
  constructor(token,state){if(token!==secret)illegal();const value=create(new.target.prototype);bridge.attach(value,state,true);return value}
  get track(){return read(this,'VTTCue','track')}get id(){return read(this,'VTTCue','id')}set id(value){brand(this,'VTTCue');write(this,'VTTCue','id',string(value))}
  get startTime(){return read(this,'VTTCue','startTime')}set startTime(value){brand(this,'VTTCue');write(this,'VTTCue','startTime',restricted(value))}
  get endTime(){return read(this,'VTTCue','endTime')}set endTime(value){brand(this,'VTTCue');write(this,'VTTCue','endTime',number(value))}
  get pauseOnExit(){return read(this,'VTTCue','pauseOnExit')}set pauseOnExit(value){write(this,'VTTCue','pauseOnExit',!!value)}
 }
 handlers(TextTrackCue,'VTTCue',['onenter','onexit']);
 class VTTCue extends TextTrackCue{
  constructor(startTime,endTime,text){if(startTime===secret)return super(secret,endTime);if(arguments.length<3)invalid();startTime=restricted(startTime);endTime=number(endTime);if(isNaN(endTime)||endTime===-Infinity)throw new TypeError('');text=string(text);super(secret,bridge.cue(startTime,endTime,text));}
  get text(){return read(this,'VTTCue','text')}set text(value){brand(this,'VTTCue');write(this,'VTTCue','text',string(value))}
  get region(){return read(this,'VTTCue','region')}set region(value){brand(this,'VTTCue');if(value!=null&&!bridge.has(value,'VTTRegion'))throw new TypeError('invalid argument');bridge.region(this,value??null)}
  get vertical(){return read(this,'VTTCue','vertical')}set vertical(value){enumWrite(this,'VTTCue','vertical',value,['','rl','lr'])}
  get snapToLines(){return read(this,'VTTCue','snapToLines')}set snapToLines(value){write(this,'VTTCue','snapToLines',!!value)}
  get line(){return read(this,'VTTCue','line')}set line(value){brand(this,'VTTCue');write(this,'VTTCue','line',union(value))}
  get lineAlign(){return read(this,'VTTCue','lineAlign')}set lineAlign(value){enumWrite(this,'VTTCue','lineAlign',value,['start','center','end'])}
  get position(){return read(this,'VTTCue','position')}set position(value){brand(this,'VTTCue');let next=union(value);if(next!=='auto')next=percentage(next);write(this,'VTTCue','position',next)}
  get positionAlign(){return read(this,'VTTCue','positionAlign')}set positionAlign(value){enumWrite(this,'VTTCue','positionAlign',value,['auto','line-left','center','line-right'])}
  get size(){return read(this,'VTTCue','size')}set size(value){brand(this,'VTTCue');write(this,'VTTCue','size',percentage(value))}
  get align(){return read(this,'VTTCue','align')}set align(value){enumWrite(this,'VTTCue','align',value,['start','center','end','left','right'])}
  getCueAsHTML(){brand(this,'VTTCue');return bridge.html(this)}
 }
 class VTTRegion{
  constructor(token,state){bridge.attach(this,token===secret?state:bridge.regionState(),false)}
  get id(){return read(this,'VTTRegion','id')}set id(value){brand(this,'VTTRegion');write(this,'VTTRegion','id',string(value))}
  get width(){return read(this,'VTTRegion','width')}set width(value){brand(this,'VTTRegion');write(this,'VTTRegion','width',percentage(value))}
  get lines(){return read(this,'VTTRegion','lines')}set lines(value){brand(this,'VTTRegion');const n=Number(value);write(this,'VTTRegion','lines',finite(n)?trunc(n)>>>0:0)}
  get regionAnchorX(){return read(this,'VTTRegion','regionAnchorX')}set regionAnchorX(value){brand(this,'VTTRegion');write(this,'VTTRegion','regionAnchorX',percentage(value))}
  get regionAnchorY(){return read(this,'VTTRegion','regionAnchorY')}set regionAnchorY(value){brand(this,'VTTRegion');write(this,'VTTRegion','regionAnchorY',percentage(value))}
  get viewportAnchorX(){return read(this,'VTTRegion','viewportAnchorX')}set viewportAnchorX(value){brand(this,'VTTRegion');write(this,'VTTRegion','viewportAnchorX',percentage(value))}
  get viewportAnchorY(){return read(this,'VTTRegion','viewportAnchorY')}set viewportAnchorY(value){brand(this,'VTTRegion');write(this,'VTTRegion','viewportAnchorY',percentage(value))}
  get scroll(){return read(this,'VTTRegion','scroll')}set scroll(value){enumWrite(this,'VTTRegion','scroll',value,['','up'])}
 }
 class TextTrack extends EventTarget{
  constructor(token,state){if(token!==secret)illegal();const value=create(new.target.prototype);bridge.attach(value,state,true);return value}
  get kind(){return read(this,'TextTrack','trackKind')}get label(){return read(this,'TextTrack','label')}get language(){return read(this,'TextTrack','language')}get id(){return read(this,'TextTrack','id')}
  get inBandMetadataTrackDispatchType(){brand(this,'TextTrack');return ''}
  get mode(){return read(this,'TextTrack','mode')}set mode(value){enumWrite(this,'TextTrack','mode',value,['disabled','hidden','showing'])}
  get cues(){return read(this,'TextTrack','cues')}get activeCues(){return read(this,'TextTrack','activeCues')}
  addCue(cue){brand(this,'TextTrack');if(!arguments.length||!bridge.has(cue,'VTTCue'))invalid();bridge.addCue(this,cue)}
  removeCue(cue){brand(this,'TextTrack');if(!arguments.length||!bridge.has(cue,'VTTCue'))invalid();if(!bridge.removeCue(this,cue))throw new Error('NotFoundError')}
 }
 handlers(TextTrack,'TextTrack',['oncuechange']);
 class TextTrackList extends EventTarget{
  constructor(token,state){if(token!==secret)illegal();return bridge.indexed(new.target.prototype,state,true)}
  get length(){return read(this,'TextTrackList','length')}
  getTrackById(id){brand(this,'TextTrackList');if(!arguments.length)invalid();return bridge.find(this,string(id),false)}
 }
 handlers(TextTrackList,'TextTrackList',['onchange','onaddtrack','onremovetrack']);
 class TextTrackCueList{
  constructor(token,state){if(token!==secret)illegal();return bridge.indexed(new.target.prototype,state,false)}
  get length(){return read(this,'TextTrackCueList','length')}
  getCueById(id){brand(this,'TextTrackCueList');if(!arguments.length)invalid();return bridge.find(this,string(id),true)}
 }
 const classes={MediaError,TextTrackCue,VTTCue,VTTRegion,TextTrack,TextTrackList,TextTrackCueList};
 for(const C of Object.values(classes)){shape(C,['MediaError','TextTrackCue','TextTrack','TextTrackList','TextTrackCueList','VTTRegion'].includes(C.name)?0:3);define(g,C.name,{value:C,writable:true,configurable:true})}
 const media=g.HTMLMediaElement.prototype,track=g.HTMLTrackElement.prototype,kindDescriptor=own(track,'kind');
 const methods={
  get textTracks(){if(!bridge.isMedia(this))throw new TypeError('Illegal invocation');return bridge.mediaList(this)},
  addTextTrack(kind,label=undefined,language=undefined){if(!bridge.isMedia(this))throw new TypeError('Illegal invocation');if(!arguments.length)invalid();kind=string(kind);if(!contains(['subtitles','captions','descriptions','chapters','metadata'],kind))throw new TypeError('');return bridge.addTrack(this,kind,label==null?'':string(label),language==null?'':string(language))},
  get track(){if(!bridge.isTrack(this))throw new TypeError('Illegal invocation');return bridge.elementTrack(this)},
  get readyState(){if(!bridge.isTrack(this))throw new TypeError('Illegal invocation');return bridge.readyState(this)},
  get kind(){if(!bridge.isTrack(this))throw new TypeError('Illegal invocation');return bridge.elementKind(this)},
  set kind(value){if(!bridge.isTrack(this))throw new TypeError('Illegal invocation');apply(kindDescriptor.set,this,[string(value)])},
 };
 for(const name of['textTracks','addTextTrack'])define(media,name,{...own(methods,name),enumerable:true,configurable:true});
 for(const name of['track','readyState','kind'])define(track,name,{...own(methods,name),enumerable:true,configurable:true});
 return{make(kind,state){return new classes[kind](secret,state)}};
}

export function installTextTracks(page,window){
 if(INSTALLED.has(window))return INSTALLED.get(window).controller;
 patch();for(const kind of['MediaError','TextTrackCue','VTTCue','VTTRegion','TextTrack','TextTrackList','TextTrackCueList'])registerPlatformFactoryKind(kind);
 const binding=page.browser.collectionsBinding;if(typeof binding.createIndexed!=='function')throw Error('Indexed collection support requires a native rebuild');
 const record={page,window,document:implForWrapper(window.document),signal:page.documentAbort?.signal,disposed:false,tasks:new Set(),requests:new Set(),nextCue:0,binding,fetch:window.fetch,arrayBuffer:window.Response.prototype.arrayBuffer,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,Event:window.Event,AbortController:window.AbortController,decoder:new TextDecoder(),decode:TextDecoder.prototype.decode};
 GLOBALS.set(record.document._globalObject,record);GLOBALS.set(window,record);
 function attach(value,state,event){
  if(event)EventTarget.setup(value,window);
  STATES.set(value,state);state.public=value;
  registerPlatformFactory(value,{kind:state.kind,implementation:event?implForWrapper(value):state,globalObject:window});return value;
 }
 function dom(value,Class){if(types.isProxy(value))return null;const provenance=platformFactoryRecord(value),impl=provenance?.implementation;return impl instanceof Class?impl:null;}
 function field(state,key){
  if(state.kind==='TextTrack'){
   if(key==='trackKind')return state.element?elementKind(state.element):state.trackKind;
   if(['id','label','language'].includes(key))return state.element?state.element.getAttributeNS(null,key==='language'?'srclang':key)??'':state[key];
   if(key==='cues'||key==='activeCues')return state.mode==='disabled'?null:cuesList(state,key==='activeCues');
  }
  if(key==='track'||key==='region')return primary(state[key]);
  if(key==='length')return state.read().length;
  return state[key];
 }
 record.api=window.eval(`(${factory.toString()})`)(window,{
  has:(value,kind)=>STATES.get(value)?.kind===kind,
  get:(value,key)=>field(STATES.get(value),key),
  set(value,key,next){const state=STATES.get(value);state[key]=next;if(state.kind==='VTTCue'&&state.track&&['startTime','endTime'].includes(key))cueSort(state.track);if(state.kind==='TextTrack'&&key==='mode'){state.explicitMode=true;maybeLoad(state)}},
  cue:(startTime,endTime,text)=>({kind:'VTTCue',record,handlers:object(),...stateDefaults,startTime,endTime,text,public:null}),
  regionState:()=>({kind:'VTTRegion',record,...regionDefaults,public:null}),
  attach,
  indexed(prototype,state,event){const value=binding.createIndexed({hasIndex:index=>index<state.read().length,getIndex:index=>primary(state.read()[index]),indices:()=>state.read().map((_,index)=>index)},prototype);return attach(value,state,event)},
  region(value,region){STATES.get(value).region=region===null?null:STATES.get(region)},
  html(value){const state=STATES.get(value);return wrapperForImpl(renderVTTCue(state.record.document,state.text))},
  handler(value,name,next){const state=STATES.get(value);if(next!==undefined){state.handlers[name]=next;return}return state.handlers[name]?.callback??null},
  handlerRecord:(value,name)=>STATES.get(value).handlers[name],
  addCue:(value,cue)=>cueAdd(STATES.get(value),STATES.get(cue)),removeCue:(value,cue)=>cueRemove(STATES.get(value),STATES.get(cue)),
  find(value,id,cue){if(cue&&!id)return null;const state=STATES.get(value);return primary(state.read().find(item=>field(item,'id')===id))},
  isMedia:value=>!!dom(value,MediaImpl),isTrack:value=>!!dom(value,TrackImpl),
  mediaList(value){const impl=dom(value,MediaImpl),media=mediaState(impl),ownerRecord=owner(impl._ownerDocument);if(!media.list)media.list=listState('TextTrackList',ownerRecord,()=>allTracks(media));return primary(media.list)},
  addTrack(value,kind,label,language){const impl=dom(value,MediaImpl),media=mediaState(impl),ownerRecord=owner(impl._ownerDocument),state={kind:'TextTrack',record:ownerRecord,element:null,media:impl,trackKind:kind,label,language,id:'',mode:'hidden',cues:[],cuesList:null,activeList:null,handlers:object(),public:null};media.added.push(state);return primary(state)},
  elementTrack:value=>primary(trackState(dom(value,TrackImpl))),
  elementKind:value=>elementKind(dom(value,TrackImpl)),readyState:value=>trackState(dom(value,TrackImpl)).readyState,
 },{});
 const dispose=()=>{if(record.disposed)return;record.disposed=true;for(const timer of record.tasks)Reflect.apply(record.clearTimeout,window,[timer]);record.tasks.clear();for(const controller of record.requests)controller.abort();record.requests.clear();record.signal?.removeEventListener('abort',dispose)};
 record.signal?.addEventListener('abort',dispose,{once:true});record.controller={dispose};INSTALLED.set(window,record);return record.controller;
}
