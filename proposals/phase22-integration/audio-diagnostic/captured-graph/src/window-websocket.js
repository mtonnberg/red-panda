import {hasWebSocketImplementation} from './dom-websocket-state.js';
import {createRequire} from 'node:module';
import {browserWebSocketQuota,normalizeWebSocketURL,validWebSocketProtocols,socketHeaders,openWebSocketTransport} from './websocket-transports.js';
import {captureDOMExceptionFactory} from './worker-dom-exception.js';
import {onFrameRetirement} from './frame-retirement-hooks.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const generated=require('jsdom/lib/jsdom/living/generated/WebSocket.js'),module=require('jsdom/lib/jsdom/living/websockets/WebSocket-impl.js');
const EventTargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const {fireAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js'),{setupForSimpleEventAccessors}=require('jsdom/lib/jsdom/living/helpers/create-event-accessor.js');
const CloseEvent=require('jsdom/lib/jsdom/living/generated/CloseEvent.js'),MessageEvent=require('jsdom/lib/jsdom/living/generated/MessageEvent.js'),Blob=require('jsdom/lib/jsdom/living/generated/Blob.js');
const OWNERS=new WeakMap(),STATES=new WeakMap();let patched=false;
const record=value=>Object.assign(Object.create(null),value);
function kill(owner){for(const transport of [...owner.transports])transport.kill()}
export {workerWebSocketOwner} from './worker-websocket-owners.js';
export function installWindowWebSocket(page,realm,{mainWindow=realm}={}){
 patch();if(OWNERS.has(realm))return OWNERS.get(realm);
 const document=utils.implForWrapper(mainWindow.document),exception=captureDOMExceptionFactory(realm),owner=record({page,realm,document,exception,ArrayType:realm.Uint8Array,arraySet:realm.Uint8Array.prototype.set,quota:browserWebSocketQuota(page.browser),transports:new Set(),disposed:false});
 OWNERS.set(realm,owner);const impl=utils.implForWrapper(realm);if(mainWindow===realm&&impl?._globalObject)OWNERS.set(impl._globalObject,owner);
 onFrameRetirement(mainWindow,()=>kill(owner));
 page.documentAbort?.signal.addEventListener('abort',()=>{owner.disposed=true;kill(owner)},{once:true});return owner;
}
function patch(){
 if(patched)return;patched=true;const Original=module.implementation;
 class WebSocketImpl extends EventTargetImpl{
  constructor(global,args,privateData){
   const owner=OWNERS.get(global);if(!owner)return new Original(global,args,privateData);super(global,args,privateData);
   let url;try{url=normalizeWebSocketURL(args[0],owner.document.baseURLSerialized())}catch{throw owner.exception('The string did not match the expected pattern','SyntaxError')}
   const protocols=typeof args[1]==='string'?[args[1]]:args[1]??[];if(!validWebSocketProtocols(protocols))throw owner.exception('The string did not match the expected pattern','SyntaxError');
   if(owner.disposed)throw owner.exception('The object is in an invalid state','InvalidStateError');
   const state=record({owner,url:url.href,binaryType:'blob',transport:null});STATES.set(this,state);
   state.transport=openWebSocketTransport({quota:owner.quota,owner:owner.transports,url:url.href,protocols,origin:owner.document._origin,headers:socketHeaders(owner.page,url),emit:(type,data)=>{
    if(owner.disposed)return;
    if(type==='message'){const bytes=new owner.ArrayType(data.bytes.length);Reflect.apply(owner.arraySet,bytes,[data.bytes]);const value=data.binary?(state.binaryType==='arraybuffer'?bytes.buffer:Blob.create(global,[[data.bytes],{type:''}])):data.bytes.toString();fireAnEvent('message',this,MessageEvent,{data:value,origin:'',source:null,lastEventId:'',ports:[]})}
    else if(type==='close')fireAnEvent(type,this,CloseEvent,data);
    else fireAnEvent(type,this);
   }});
  }
  get url(){return STATES.get(this).url}
  get readyState(){return STATES.get(this).transport.get('readyState')}
  get bufferedAmount(){return STATES.get(this).transport.get('bufferedAmount')}
  get protocol(){return STATES.get(this).transport.get('protocol')}
  get extensions(){return STATES.get(this).transport.get('extensions')}
  get binaryType(){return STATES.get(this).binaryType}
  set binaryType(value){if(value==='blob'||value==='arraybuffer')STATES.get(this).binaryType=value}
  send(data){const state=STATES.get(this);if(state.transport.get('readyState')!==1)throw state.owner.exception('The object is in an invalid state','InvalidStateError');let binary=false;if(Blob.isImpl(data)){data=data._buffer;binary=true}else if(typeof data!=='string'){data=new Uint8Array(data.buffer??data,data.byteOffset??0,data.byteLength).slice();binary=true}state.transport.send(data,binary)}
  close(code,reason){const state=STATES.get(this);if(state.transport.get('readyState')>=2)return;if(code!==undefined&&code!==1000&&(code<3000||code>4999))throw state.owner.exception('The object does not support the operation or argument','InvalidAccessError');if(Buffer.byteLength(reason??'')>123)throw state.owner.exception('The string did not match the expected pattern','SyntaxError');state.transport.close(code??1000,reason??'')}
  _makeDisappear(){const state=STATES.get(this);this._eventListeners=Object.create(null);state.transport.kill()}
 }
 setupForSimpleEventAccessors(WebSocketImpl.prototype,['open','message','error','close']);
 module.implementation=WebSocketImpl;
 // Keep genuine unowned jsdom instances compatible with the pinned factory;
 // owned sockets use the successful private backend record, never a tag.
 const ordinaryHasInstance=Function.prototype[Symbol.hasInstance];
 generated.isImpl=value=>STATES.has(value)||Reflect.apply(ordinaryHasInstance,Original,[value]);
 generated.is=hasWebSocketImplementation;
 const cleanup=Original.cleanUpWindow;Original.cleanUpWindow=window=>{const owner=OWNERS.get(window._globalProxy??window);if(owner)kill(owner);return cleanup.call(Original,window)};
}
