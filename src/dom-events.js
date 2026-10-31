import {installDataTransfer,isDataTransfer} from './data-transfer.js';
import {installEventAPIParity,eventFactoryType,createDocumentEvent} from './event-api-parity.js';
import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import 'jsdom';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);

const EventTarget=require('jsdom/lib/jsdom/living/generated/EventTarget.js');
const Element=require('jsdom/lib/jsdom/living/generated/Element.js');
const installed=new WeakMap();
// Interface brands are shared across actual realms without replacing
// instanceof or turning arbitrary lookalike objects into DOM interface values.
const shared={touches:new WeakMap(),touchLists:new WeakMap(),events:new WeakMap()};
function factory(g,bridge,DataTransfer){
 const{touches,touchLists,events}=bridge.shared;
 const error=()=>new g.TypeError('invalid argument'),illegal=()=>{throw new g.TypeError('Illegal Constructor');};
 const brand=(map,value)=>{const state=map.get(value);if(!state)throw new g.TypeError('Illegal invocation');return state;};
 const dictionary=value=>{if(value==null)return{};if(!['object','function'].includes(typeof value))throw error();return value;};
 const string=value=>{if(typeof value==='symbol')throw error();return String(value);};
 const number=value=>+value;
 const restricted=(value,single=false)=>{let result=number(value);if(single)result=Math.fround(result);if(!Number.isFinite(result))throw new g.TypeError('TouchInit member is not a finite number');return result;};
 const index=value=>number(value)>>>0;
 const tag=(Constructor,name)=>Object.defineProperty(Constructor.prototype,Symbol.toStringTag,{value:name,configurable:true});
 function indexed(Constructor,map,state,values,iterable=false){const object=Object.create(Constructor.prototype),isIndex=key=>typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)&&Number(key)<4294967295;
  const proxy=new g.Proxy(object,{get(target,key,receiver){return isIndex(key)?values()[Number(key)]:Reflect.get(target,key,receiver);},has(target,key){return isIndex(key)?Number(key)<values().length:Reflect.has(target,key);},ownKeys(target){return [...values().map((_,i)=>String(i)),...Reflect.ownKeys(target)];},getOwnPropertyDescriptor(target,key){if(isIndex(key)&&Number(key)<values().length)return{value:values()[Number(key)],writable:false,enumerable:true,configurable:true};return Reflect.getOwnPropertyDescriptor(target,key);},set(target,key,value,receiver){return isIndex(key)||key==='length'?false:Reflect.set(target,key,value,receiver);},defineProperty(target,key,descriptor){return isIndex(key)?false:Reflect.defineProperty(target,key,descriptor);},deleteProperty(target,key){return isIndex(key)&&Number(key)<values().length?false:Reflect.deleteProperty(target,key);},preventExtensions(){return false;}});map.set(proxy,state);return proxy;
 }
 class DragEvent extends g.MouseEvent{constructor(type,init={}){if(!arguments.length)throw error();init=dictionary(init);const coordinates=new Map(),coordinateNames=new Set(['clientX','clientY','screenX','screenY']),proxy=new g.Proxy(init,{get(target,key){if(coordinateNames.has(key)){if(!coordinates.has(key)){const value=Reflect.get(target,key,target);coordinates.set(key,value===undefined?0:Math.floor(number(value)));}const value=coordinates.get(key);return Number.isFinite(value)?value:0;}return Reflect.get(target,key,target);}});super(type,proxy);for(const[key,value]of coordinates)bridge.coordinate(this,key,value);const value=init.dataTransfer??null;if(value!==null&&!bridge.isDataTransfer(value))throw error();events.set(this,{kind:'drag',dataTransfer:value});}get dataTransfer(){const s=brand(events,this);if(s.kind!=='drag')throw error();return s.dataTransfer;}}
 tag(DragEvent,'DragEvent');
 class TextEvent extends g.UIEvent{constructor(){illegal();}get data(){const s=brand(events,this);if(s.kind!=='text')throw error();return s.data;}initTextEvent(type,bubbles=false,cancelable=false,view=null,data='undefined'){const s=brand(events,this);if(s.kind!=='text')throw error();if(!arguments.length)throw error();if(bridge.dispatching(this))return;g.UIEvent.prototype.initUIEvent.call(this,type,bubbles,cancelable,view,0);s.data=data==null?'undefined':string(data);}}
 tag(TextEvent,'TextEvent');
 const createEvent=function(type){return bridge.createEvent(this,type)};
 Object.defineProperty(g.Document.prototype,'createEvent',{configurable:true,enumerable:true,writable:true,value:function(type){const name=bridge.eventType(this,arguments);if(!['textevent','dragevent','touchevent'].includes(name))return createEvent.call(this,name);const event=createEvent.call(this,name==='dragevent'?'MouseEvent':'UIEvent');if(name==='textevent'){Object.setPrototypeOf(event,TextEvent.prototype);events.set(event,{kind:'text',data:''});}else if(name==='dragevent'){Object.setPrototypeOf(event,DragEvent.prototype);events.set(event,{kind:'drag',dataTransfer:null});}else{Object.setPrototypeOf(event,TouchEvent.prototype);events.set(event,{kind:'touch',altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,touches:touchList(),targetTouches:touchList(),changedTouches:touchList()});}return event;}});
 class Touch{constructor(init){if(!arguments.length)throw error();init=dictionary(init);const state={};for(const key of['clientX','clientY','force','identifier','pageX','pageY','radiusX','radiusY','rotationAngle','screenX','screenY','target']){const value=init[key];if(key==='identifier'){if(value===undefined)throw error();state[key]=number(value)|0;}else if(key==='target'){if(!bridge.isEventTarget(value))throw error();state[key]=value;}else state[key]=value===undefined?0:restricted(value,['radiusX','radiusY','rotationAngle','force'].includes(key));}touches.set(this,state);}}
 tag(Touch,'Touch');for(const key of['identifier','target','clientX','clientY','pageX','pageY','screenX','screenY','radiusX','radiusY','rotationAngle','force'])Object.defineProperty(Touch.prototype,key,{configurable:true,enumerable:true,get(){return brand(touches,this)[key];}});
 class TouchList{constructor(){illegal();}get length(){return brand(touchLists,this).length;}item(at){if(!arguments.length)throw error();const value=number(at);if(!Number.isFinite(value)||value<0)throw error();return brand(touchLists,this)[Math.floor(value)]??null;}}
 tag(TouchList,'TouchList');
 function touchList(value){const array=[];if(value!==undefined){if(value===null||!['object','function'].includes(typeof value)||typeof value[Symbol.iterator]!=='function')throw error();for(const item of value){if(!touches.has(item))throw error();array.push(item);}}return indexed(TouchList,touchLists,array,()=>array);}
 class TouchEvent extends g.UIEvent{constructor(type,init={}){if(!arguments.length)throw error();init=dictionary(init);super(type,init);const state={kind:'touch'};for(const key of['altKey','ctrlKey','metaKey','shiftKey'])state[key]=!!init[key];for(const key of['changedTouches','targetTouches','touches'])state[key]=touchList(init[key]);events.set(this,state);}}
 tag(TouchEvent,'TouchEvent');for(const key of['touches','targetTouches','changedTouches','altKey','metaKey','ctrlKey','shiftKey'])Object.defineProperty(TouchEvent.prototype,key,{configurable:true,enumerable:true,get(){const s=brand(events,this);if(s.kind!=='touch')throw error();return s[key];}});
 for(const Constructor of[DragEvent,TextEvent,TouchList])for(const key of Object.getOwnPropertyNames(Constructor.prototype)){if(key==='constructor')continue;const descriptor=Object.getOwnPropertyDescriptor(Constructor.prototype,key);Object.defineProperty(Constructor.prototype,key,{...descriptor,enumerable:true});}
 for(const[name,value]of Object.entries({DragEvent,TextEvent,Touch,TouchList,TouchEvent}))Object.defineProperty(g,name,{value,writable:true,configurable:true,enumerable:false});return{DataTransfer,DragEvent,TextEvent,Touch,TouchEvent};
}
export function installDOMEvents(page,window){installEventAPIParity(window);if(installed.has(window))return installed.get(window);const DataTransfer=installDataTransfer(page,window),controller=window.eval(`(${factory.toString()})`)(window,{shared,isDataTransfer,eventType:(receiver,args)=>eventFactoryType(window,receiver,args),createEvent:(receiver,type)=>createDocumentEvent(window,receiver,type),isElement:Element.is,isEventTarget:EventTarget.is,coordinate(event,key,value){implForWrapper(event)[key]=value;},dispatching:event=>implForWrapper(event)._dispatchFlag},DataTransfer);installed.set(window,controller);return controller;}
