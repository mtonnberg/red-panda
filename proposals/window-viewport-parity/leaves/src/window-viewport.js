import{installElementScroll}from'./element-scroll.js';
// Metrics are read from captured real layout/viewport records. A public global
// proxy is never used as authority for retained state after navigation.
import vm from'node:vm';
import{createRequire}from'node:module';
import{implementationForWrapper}from'./dom-event-state.js';
import{eventTargetImplementation,bindEventTargetImplementation}from'./dom-event-target-state.js';
import{createDOMWrapperShell}from'./dom-wrapper-realms.js';
import{registerPlatformFactory,platformFactoryRecord}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-hooks.js';
import{captureDOMExceptionFactory}from'./worker-dom-exception.js';
const require=createRequire(import.meta.url),Target=require('jsdom/lib/jsdom/living/generated/EventTarget.js'),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),conversions=require('webidl-conversions'),DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation,ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const contexts=new WeakMap(),documents=new WeakMap(),pages=new WeakMap(),windows=new WeakMap(),targets=new WeakMap(),devices=new WeakMap();
const names=['VisualViewport','Screen','ScreenOrientation'],windowKeys=['visualViewport','screen','innerWidth','innerHeight','outerWidth','outerHeight','devicePixelRatio','scrollX','scrollY','pageXOffset','pageYOffset'];
for(const name of names)registerPlatformFactoryKind(name);
const ordinaryHasInstance=Function.prototype[Symbol.hasInstance],apply=Reflect.apply,define=Object.defineProperty,member=(o,k)=>o!=null&&k in o?o[k]:undefined,object=v=>v!==null&&(typeof v==='object'||typeof v==='function');
function publicDefinitions(bridge,EventTarget,TypeError){
 'use strict';const define=Object.defineProperty,setPrototype=Object.setPrototypeOf;
 function VisualViewport(){throw new TypeError('Illegal Constructor')}function Screen(){throw new TypeError('Illegal Constructor')}function ScreenOrientation(){throw new TypeError('Illegal Constructor')}
 const constructors=[VisualViewport,Screen,ScreenOrientation];
 for(let index=0;index<constructors.length;index++){const C=constructors[index],kind=['VisualViewport','Screen','ScreenOrientation'][index];setPrototype(C,EventTarget);setPrototype(C.prototype,EventTarget.prototype);delete C.prototype.constructor;
  const fields=kind==='VisualViewport'?['offsetLeft','offsetTop','pageLeft','pageTop','width','height','scale']:kind==='Screen'?['width','height','availWidth','availHeight','colorDepth','pixelDepth','orientation']:['angle','type'];
  for(const key of fields){let constant;if(key==='offsetLeft'||key==='offsetTop')constant=0;else if(key==='scale')constant=1;else if(key==='availHeight')constant=1040;else if(key==='colorDepth'||key==='pixelDepth')constant=24;
   if(constant!==undefined)define(C.prototype,key,{value:constant,enumerable:true});else define(C.prototype,key,{get:Object.getOwnPropertyDescriptor({get [key](){return bridge.read(this,kind,key)}},key).get,enumerable:true,configurable:true});
  }
  if(kind==='ScreenOrientation'){const methods={lock(orientation){return bridge.lock(this,arguments)},unlock(){bridge.unlock(this)}};for(const key of['lock','unlock'])define(C.prototype,key,{value:methods[key],writable:true,enumerable:true,configurable:true});const handlers={get onchange(){return bridge.read(this,kind,'onchange')},set onchange(value){bridge.handler(this,value)}};define(C.prototype,'onchange',{...Object.getOwnPropertyDescriptor(handlers,'onchange'),enumerable:true,configurable:true})}
  define(C.prototype,'constructor',{value:C,writable:true,configurable:true});define(C.prototype,Symbol.toStringTag,{value:kind,configurable:true});define(C,'prototype',{writable:false});
 }
 const methods={scroll(x){bridge.scroll(this,arguments,false)},scrollTo(x){bridge.scroll(this,arguments,false)},scrollBy(x){bridge.scroll(this,arguments,true)}};
 const getters=['visualViewport','screen','innerWidth','innerHeight','outerWidth','outerHeight','devicePixelRatio','scrollX','scrollY','pageXOffset','pageYOffset'].map(key=>Object.getOwnPropertyDescriptor({get [key](){return bridge.windowMetric(key)}},key).get);
 const fullscreen={get fullscreenElement(){return bridge.fullscreen(this,false)},exitFullscreen(){return bridge.fullscreen(this,true)},requestFullscreen(){return bridge.requestFullscreen(this)}};
 return [...constructors,methods.scroll,methods.scrollTo,methods.scrollBy,...getters,Object.getOwnPropertyDescriptor(fullscreen,'fullscreenElement').get,fullscreen.exitFullscreen,fullscreen.requestFullscreen];
}
function makeTarget(record,kind){const value=createDOMWrapperShell(record.context,record.constructors[kind].prototype,kind);Target.setup(value,record.globalObject,[]);const impl=eventTargetImplementation(value),slot=Object.assign(Object.create(null),{kind,base:record.base,handler:null,listener:null});targets.set(impl,slot);registerPlatformFactory(value,{kind,implementation:impl,globalObject:record.context});return value}
export function viewportTargetInterface(implementation){return targets.get(implementation)?.kind}
export function wrapViewportTarget(context,implementation){const record=contexts.get(context),slot=targets.get(implementation);if(!record||!slot)return undefined;const value=createDOMWrapperShell(context,record.constructors[slot.kind].prototype,slot.kind);bindEventTargetImplementation(value,implementation);registerPlatformFactory(value,{kind:slot.kind,implementation,globalObject:context});return value}
export function isViewportScreen(value){return targets.get(eventTargetImplementation(value))?.kind==='Screen'}
function getObject(record,kind,base=record.base){if(!base.objects[kind])base.objects[kind]=makeTarget(base,kind);
 if(!record.utility)return base.objects[kind];
 return record.wrap(eventTargetImplementation(base.objects[kind]));
}
function installRecord(page,globalObject,layout,{context,base,utility=false,wrap}={}){
 context??=implementationForWrapper(globalObject)._globalObject;const prior=contexts.get(context);if(prior)return prior;
 const record=Object.assign(Object.create(null),{page,globalObject,context,layout,utility,wrap,constructors:Object.create(null),objects:Object.create(null),TypeError:globalObject.TypeError,Number:globalObject.Number,String:globalObject.String,Promise:globalObject.Promise,reject:globalObject.Promise.reject,exception:captureDOMExceptionFactory(vm.isContext(context)&&!utility?context:globalObject),add:globalObject.EventTarget.prototype.addEventListener,remove:globalObject.EventTarget.prototype.removeEventListener,models:new Set(),metrics:{scale:1,screenWidth:undefined,screenHeight:undefined,orientation:undefined}});record.base=base??record;
 const reject=error=>apply(record.reject,record.Promise,[error]),brand=(value,kind)=>{const slot=targets.get(eventTargetImplementation(value));if(!slot||slot.kind!==kind)throw new record.TypeError('Illegal invocation');return slot},integer=value=>conversions.long(value,{globals:record}),string=value=>conversions.DOMString(value,{globals:record});
 const owner=receiver=>{if(receiver==null)return record;const result=windows.get(eventTargetImplementation(receiver));if(!result)throw new record.TypeError('Illegal invocation');return result};
 const bridge={
  read(value,kind,key){const slot=brand(value,kind),base=slot.base,viewport=base.metrics,metrics=base.metrics;if(kind==='VisualViewport')return key==='pageLeft'?base.layout.scroll.x:key==='pageTop'?base.layout.scroll.y:viewport[key];if(kind==='Screen')return key==='orientation'?getObject(record,'ScreenOrientation',slot.base):key==='height'?(metrics.screenHeight??viewport.height):(metrics.screenWidth??viewport.width);if(key==='onchange')return slot.handler;if(key==='angle')return metrics.orientation?.angle??0;return metrics.orientation?.type??((metrics.screenHeight??viewport.height)>(metrics.screenWidth??viewport.width)?'portrait-primary':'landscape-primary')},
  lock(value,args){try{brand(value,'ScreenOrientation');if(!args.length)throw new record.TypeError('invalid argument');const next=string(args[0]);if(!['any','natural','landscape','portrait','portrait-primary','portrait-secondary','landscape-primary','landscape-secondary'].includes(next))throw new record.TypeError('invalid argument');return reject(record.exception('The operation is not supported','NotSupportedError'))}catch(error){return reject(error)}},
  unlock(value){brand(value,'ScreenOrientation')},
  handler(value,next){const slot=brand(value,'ScreenOrientation');slot.handler=typeof next==='function'?next:null;if(!slot.listener&&slot.handler){slot.listener=function(event){const callback=slot.handler;if(callback)apply(callback,this,[event])};apply(record.add,value,['change',slot.listener])}else if(slot.listener&&!slot.handler){apply(record.remove,value,['change',slot.listener]);slot.listener=null}},
  windowMetric(key){if(key==='screen')return getObject(record,'Screen');if(key==='visualViewport')return getObject(record,'VisualViewport');if(key==='devicePixelRatio')return record.base.metrics.scale;if(key==='innerWidth'||key==='outerWidth')return record.base.metrics.width;if(key==='innerHeight'||key==='outerHeight')return record.base.metrics.height;return key==='scrollX'||key==='pageXOffset'?record.layout.scroll.x:record.layout.scroll.y},
  scroll(receiver,args,relative){const target=owner(receiver);if(!args.length)throw new record.TypeError('invalid argument');let x,y;const first=args[0];if(object(first)){const behavior=member(first,'behavior');if(behavior!==undefined)string(behavior);const left=member(first,'left'),top=member(first,'top');if(left!==undefined)x=integer(left);if(top!==undefined)y=integer(top);if(args[1]!=null)integer(args[1])}else{x=integer(first);y=args[1]==null?0:integer(args[1])}if(relative){if(x!==undefined)x+=target.layout.scroll.x;if(y!==undefined)y+=target.layout.scroll.y}target.layout.scrollAxes(x,y)},
  fullscreen(value,exit){try{if(!(apply(ordinaryHasInstance,DocumentImpl,[platformFactoryRecord(value)?.implementation])))throw new record.TypeError('Illegal invocation');return exit?reject(new record.TypeError('The operation is not supported')):null}catch(error){if(exit)return reject(error);throw error}},
  requestFullscreen(value){if(!(apply(ordinaryHasInstance,ElementImpl,[platformFactoryRecord(value)?.implementation])))return reject(new record.TypeError('Illegal invocation'));return reject(new record.TypeError('The operation is not supported'))},
 };
 const result=vm.compileFunction('return ('+publicDefinitions.toString()+')(bridge,EventTarget,TypeError)',['bridge','EventTarget','TypeError'],vm.isContext(context)?{parsingContext:context}:{})(bridge,globalObject.EventTarget,record.TypeError);contexts.set(context,record);
 const registry=utils.initCtorRegistry(globalObject);for(let n=0;n<names.length;n++){record.constructors[names[n]]=result[n];define(globalObject,names[n],{value:result[n],writable:true,configurable:true});registry[names[n]]=result[n]}
 for(let n=0;n<3;n++)define(globalObject,['scroll','scrollTo','scrollBy'][n],{value:result[n+3],writable:true,enumerable:true,configurable:true});
 for(let n=0;n<windowKeys.length;n++)define(globalObject,windowKeys[n],{get:result[n+6],enumerable:true,configurable:true});
 const offset=6+windowKeys.length;for(const key of['fullscreen','fullscreenEnabled'])if(!Object.getOwnPropertyDescriptor(globalObject.Document.prototype,key))define(globalObject.Document.prototype,key,{value:false,enumerable:true});
 define(globalObject.Document.prototype,'fullscreenElement',{get:result[offset],enumerable:true,configurable:true});define(globalObject.Document.prototype,'exitFullscreen',{value:result[offset+1],writable:true,enumerable:true,configurable:true});define(globalObject.Element.prototype,'requestFullscreen',{value:result[offset+2],writable:true,enumerable:true,configurable:true});if(utility)installElementScroll(globalObject,implementation=>documents.get(implementation._ownerDocument)?.layout,{evaluate:source=>vm.runInContext(source,context)});return record;
}
export function installWindowViewport(page,window,layout){
 const document=implementationForWrapper(window.document),rootPage=page.registry?.page??page,base=rootPage===page?undefined:pages.get(rootPage),record=installRecord(page,window,layout,{base});documents.set(document,record);windows.set(eventTargetImplementation(window),record);if(rootPage===page){pages.set(rootPage,record);const key=page.browser??page;let physical=devices.get(key);if(!physical){physical=Object.assign(Object.create(null),{width:layout.viewport.width,height:layout.viewport.height,scale:1,screenWidth:undefined,screenHeight:undefined,orientation:undefined,records:new Set()});devices.set(key,physical)}record.metrics=physical;record.deviceKey=key;record.deviceReference=new WeakRef(record);physical.records.add(record.deviceReference);page.documentAbort?.signal.addEventListener('abort',()=>physical.records.delete(record.deviceReference),{once:true})}const modelReference=new WeakRef(layout);record.base.models.add(modelReference);page.documentAbort?.signal.addEventListener('abort',()=>record.base.models.delete(modelReference),{once:true});
 if(record===record.base)layout.setViewportObserver(()=>{record.metrics.width=layout.viewport.width;record.metrics.height=layout.viewport.height;for(const reference of record.models){const model=reference.deref();if(!model){record.models.delete(reference);continue}if(model!==layout)model.setViewport(layout.viewport)}});layout.setViewport({width:record.base.metrics.width,height:record.base.metrics.height});
 return record;
}
export function installUtilityViewport(global,context,mainWindow,wrap){const owner=documents.get(implementationForWrapper(mainWindow.document));if(!owner)return;return installRecord(owner.page,global,owner.layout,{context,base:owner.base,utility:true,wrap})}
export function setWindowDeviceMetrics(page,metrics,{clear=false}={}){
 const record=pages.get(page.registry?.page??page);if(!record){page.layout.setViewport(metrics);return}
 const state=record.metrics;
 if(clear){state.width=1920;state.height=1080;state.scale=1;state.screenWidth=undefined;state.screenHeight=undefined}
 else{if(metrics.width>0)state.width=metrics.width;if(metrics.height>0)state.height=metrics.height;const scale=Math.fround(metrics.deviceScaleFactor??0);if(scale>0)state.scale=scale;if(metrics.screenWidth>0)state.screenWidth=metrics.screenWidth;if(metrics.screenHeight>0)state.screenHeight=metrics.screenHeight}
 for(const reference of state.records){const target=reference.deref();if(!target){state.records.delete(reference);continue}target.page.viewport=clear?undefined:{width:state.width,height:state.height,deviceScaleFactor:state.scale,screenWidth:state.screenWidth,screenHeight:state.screenHeight};target.layout.setViewport({width:state.width,height:state.height})}
}
