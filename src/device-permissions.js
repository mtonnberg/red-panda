import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {setTimeout as hostTask,clearTimeout as cancelTask} from 'node:timers';
import {createInvocationTrampoline} from './invocation.js';
import {installErrors} from './errors.js';
import {registerProtocolPrototype} from './protocol-classes.js';
import {getRuntimeBinding} from './native-runtime.js';

// Records and task ownership remain in Host code; page objects carry no private
// symbols, implementation fields, permission grants, or manufactured positions.
const records=new WeakMap(),navigators=new WeakMap(),geolocations=new WeakMap(),errors=new WeakMap(),notifications=new WeakMap();
const positions=new WeakMap(),coordinates=new WeakMap();
const apply=Reflect.apply,hostCreate=Object.create,hostAssign=Object.assign,hostDefine=Object.defineProperty,hostOwn=Object.getOwnPropertyDescriptor;
const privateRecord=data=>hostAssign(hostCreate(null),data);
const {implForWrapper}=createRequire(import.meta.url)('jsdom/lib/jsdom/living/generated/utils.js');

function factory(g,bridge){
 const {defineProperty,defineProperties,getOwnPropertyDescriptor,getOwnPropertyNames,create,setPrototypeOf}=Object;
 const apply=Reflect.apply,construct=Reflect.construct,EventTargetConstructor=EventTarget,TypeErrorConstructor=TypeError,StringConstructor=String,PromiseConstructor=Promise;
 const resolvePromise=Promise.resolve,primitiveSymbol=Symbol.toPrimitive,symbolDescription=getOwnPropertyDescriptor(Symbol.prototype,'description').get;
 const invalid=()=>{throw new TypeErrorConstructor('invalid argument')};
 const invocation=()=>{throw new TypeErrorConstructor('Illegal invocation')};
 const object=v=>v!==null&&(typeof v==='object'||typeof v==='function'||(v!==undefined&&typeof v==='undefined'));
 function text(value){
  if(object(value)){
   const primitive=value[primitiveSymbol];
   if(primitive!==null&&primitive!==undefined){if(typeof primitive!=='function')invalid();value=apply(primitive,value,['string']);if(object(value))invalid();}
   else{let done=false;for(let i=0;i<2;i++){const method=value[i===0?'toString':'valueOf'];if(typeof method!=='function')continue;const result=apply(method,value,[]);if(!object(result)){value=result;done=true;break;}}if(!done)invalid();}
  }
  return StringConstructor(typeof value==='symbol'?apply(symbolDescription,value,[]):value);
 }
 function options(value){
  if(value===null||value===undefined)return;
  if(!object(value))invalid();
  const high=value.enableHighAccuracy;if(high!==undefined)!!high;
  const age=value.maximumAge;if(age!==undefined)age>>>0;
  const timeout=value.timeout;if(timeout!==undefined&&timeout!==null)timeout>>>0;
 }
 function Geolocation(){'use strict';throw new TypeErrorConstructor(new.target?'Illegal Constructor':'invalid argument');}
 function GeolocationPosition(){'use strict';throw new TypeErrorConstructor(new.target?'Illegal Constructor':'invalid argument');}
 function GeolocationCoordinates(){'use strict';throw new TypeErrorConstructor(new.target?'Illegal Constructor':'invalid argument');}
 function GeolocationPositionError(){'use strict';throw new TypeErrorConstructor(new.target?'Illegal Constructor':'invalid argument');}
 const geoMethods={
  getCurrentPosition(success,error=undefined,value=undefined){
   if(!bridge.hasGeo(this))invocation();if(typeof success!=='function'||(error!==null&&error!==undefined&&typeof error!=='function'))invalid();options(value);bridge.request(this,success,error,false);
  },
  watchPosition(success,error=undefined,value=undefined){
   if(!bridge.hasGeo(this))invocation();if(typeof success!=='function'||(error!==null&&error!==undefined&&typeof error!=='function'))invalid();options(value);return bridge.request(this,success,error,true);
  },
  clearWatch(id){if(!bridge.hasGeo(this))invocation();if(!arguments.length)invalid();bridge.clear(this,id|0);},
 };
 function installPrototype(C,prototype){
  const constructor=getOwnPropertyDescriptor(C.prototype,'constructor');
  for(const key of getOwnPropertyNames(prototype)){const descriptor=getOwnPropertyDescriptor(prototype,key);if(descriptor.configurable)defineProperty(prototype,key,{...descriptor,enumerable:true,configurable:true});}
  defineProperty(prototype,Symbol.toStringTag,{value:C.name,configurable:true});
  defineProperty(prototype,'constructor',constructor);defineProperty(C,'prototype',{value:prototype});
 }
 installPrototype(Geolocation,geoMethods);
 const errorPrototype={
  get code(){if(!bridge.hasError(this))invocation();return bridge.error(this,'code');},
  get message(){if(!bridge.hasError(this))invocation();return bridge.error(this,'message');},
 };
 // Constants precede the public constructor in the native prototype order.
 for(const[key,value]of [['PERMISSION_DENIED',1],['POSITION_UNAVAILABLE',2],['TIMEOUT',3]])for(const target of[GeolocationPositionError,errorPrototype])defineProperty(target,key,{value,enumerable:true});
 installPrototype(GeolocationPositionError,errorPrototype);
 const coordinatePrototype={
  get latitude(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'latitude');},
  get longitude(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'longitude');},
  get accuracy(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'accuracy');},
  get altitude(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'altitude');},
  get altitudeAccuracy(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'altitudeAccuracy');},
  get heading(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'heading');},
  get speed(){if(!bridge.hasCoordinates(this))invocation();return bridge.coordinate(this,'speed');},
  toJSON(){if(!bridge.hasCoordinates(this))invocation();return{accuracy:this.accuracy,latitude:this.latitude,longitude:this.longitude,altitude:this.altitude,altitudeAccuracy:this.altitudeAccuracy,heading:this.heading,speed:this.speed};},
 };
 installPrototype(GeolocationCoordinates,coordinatePrototype);
 const positionPrototype={
  get coords(){if(!bridge.hasPosition(this))invocation();return bridge.position(this,'coords');},
  get timestamp(){if(!bridge.hasPosition(this))invocation();return bridge.position(this,'timestamp');},
  toJSON(){if(!bridge.hasPosition(this))invocation();return{coords:this.coords.toJSON(),timestamp:this.timestamp};},
 };
 installPrototype(GeolocationPosition,positionPrototype);
 function Notification(title){
  'use strict';const value=arguments[1];if(!new.target||!arguments.length)invalid();
  title=text(title);if(value!==null&&value!==undefined&&!object(value))invalid();
  const data={title,body:'',icon:'',image:'',badge:'',tag:'',lang:'',dir:'auto',silent:false,requireInteraction:false,renotify:false};
  if(value!==null&&value!==undefined){const keys=['badge','body','dir','icon','image','lang','renotify','requireInteraction','silent','tag'];for(let i=0;i<keys.length;i++){const key=keys[i],item=value[key];if(item!==null&&item!==undefined)data[key]=(key==='renotify'||key==='requireInteraction'||key==='silent')?!!item:text(item);}}
  const result=construct(EventTargetConstructor,[],new.target);bridge.notification(result,data);return result;
 }
 const notificationPrototype={
  close(){if(!bridge.hasNotification(this))invocation();},
  get title(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'title');},
  get body(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'body');},
  get icon(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'icon');},
  get image(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'image');},
  get badge(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'badge');},
  get tag(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'tag');},
  get lang(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'lang');},
  get dir(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'dir');},
  get silent(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'silent');},
  get requireInteraction(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'requireInteraction');},
  get renotify(){if(!bridge.hasNotification(this))invocation();return bridge.notificationValue(this,'renotify');},
 };
 setPrototypeOf(Notification,EventTargetConstructor);setPrototypeOf(notificationPrototype,EventTargetConstructor.prototype);installPrototype(Notification,notificationPrototype);
 const permission=()=> 'default',maxActions=()=>2,requestPermission=()=>apply(resolvePromise,PromiseConstructor,['default']);
 defineProperty(permission,'name',{value:'get permission',configurable:true});defineProperty(maxActions,'name',{value:'get maxActions',configurable:true});defineProperty(requestPermission,'name',{value:'requestPermission',configurable:true});
 defineProperty(Notification,'permission',{get:permission,enumerable:true,configurable:true});defineProperty(Notification,'maxActions',{get:maxActions,enumerable:true,configurable:true});defineProperty(Notification,'requestPermission',{value:requestPermission,writable:true,enumerable:true,configurable:true});
 const geo=create(Geolocation.prototype);bridge.initializeGeo(geo);
 bridge.exportInterfaces(Geolocation,GeolocationPosition,GeolocationCoordinates,GeolocationPositionError,Notification,geo);

}

export function retireDeviceRequests(window){records.get(window)?.cancel();}
export function installDevicePermissions(page,window){
 if(records.has(window))return records.get(window).controller;
 const document=window.document,signal=page.documentAbort?.signal,context=implForWrapper(window)._globalObject;
 if(!vm.isContext(context))throw new TypeError('Device APIs require the actual owning VM context');
 const invocation=createInvocationTrampoline(context),report=installErrors(page,window),tasks=new Set();
 const record=privateRecord({page,window,document,signal,tasks,disposed:false});
 const api=privateRecord({interfaces:hostCreate(null)}),createErrorObject=window.Object.create;let errorPrototype;
 const active=()=>!record.disposed&&!page.closed&&!signal?.aborted&&window.document===document;
 function cancel(job){cancelTask(job.timer);job.owner.tasks.delete(job);if(job.watchId)job.state.watches.delete(job.watchId);job.success=job.error=null;}
 record.cancel=()=>{for(const job of tasks)cancel(job)};
 const bridge=privateRecord({
  initializeGeo(value){geolocations.set(value,privateRecord({next:0,watches:new Map()}));},navigatorGeo:receiver=>navigators.get(receiver)?.geo,
  hasGeo:receiver=>geolocations.has(receiver),hasError:receiver=>errors.has(receiver),error:(receiver,key)=>errors.get(receiver)[key],
  hasPosition:value=>positions.has(value),position:(value,key)=>positions.get(value)[key],hasCoordinates:value=>coordinates.has(value),coordinate:(value,key)=>coordinates.get(value)[key],
  notification(value,data){notifications.set(value,Object.freeze(privateRecord(data)))},hasNotification:value=>notifications.has(value),notificationValue:(value,key)=>notifications.get(value)[key],
  request(receiver,success,error,watch){
   const state=geolocations.get(receiver),watchId=watch?(state.next===0x7fffffff?1:state.next+1):0;if(watch)state.next=watchId;
   if(!active())return watch?watchId:undefined;
   const job=privateRecord({owner:record,state,watchId,success,error});if(watch)state.watches.set(watchId,job);tasks.add(job);
   job.timer=hostTask(()=>{
    tasks.delete(job);if(watchId)state.watches.delete(watchId);
    const callback=job.error;job.success=job.error=null;
    if(!active()||typeof callback!=='function')return;
    const value=apply(createErrorObject,undefined,[errorPrototype]);
    errors.set(value,privateRecord({code:1,message:'User denied Geolocation'}));
    try{invocation.invoke(callback,window,[value],{timeout:Math.min(page.timeout??10000,2000),displayErrors:false})}catch(error){report.report(error)}
   },0);return watch?watchId:undefined;
  },
  clear(receiver,id){const job=geolocations.get(receiver).watches.get(id);if(job)cancel(job)},
  exportInterfaces(Geolocation,GeolocationPosition,GeolocationCoordinates,GeolocationPositionError,Notification,geo){
   const values=privateRecord({Geolocation,GeolocationPosition,GeolocationCoordinates,GeolocationPositionError,Notification});
   for(const[name,C]of Object.entries(values)){api.interfaces[name]=C;hostDefine(C,'prototype',{writable:false});hostDefine(window,name,{value:C,writable:true,enumerable:false,configurable:true});}
   api.geo=geo;errorPrototype=hostOwn(GeolocationPositionError,'prototype').value;
  },
 });
 vm.compileFunction(`(${factory.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:context})(bridge);
 navigators.set(window.navigator,api);for(const[name,C]of Object.entries(api.interfaces))registerProtocolPrototype(C.prototype,name);
 const TypeErrorConstructor=window.TypeError;
 const getter=(page.browser?.runtimeBinding??getRuntimeBinding()).createEntry((_incumbent,receiver)=>{const value=navigators.get(receiver);if(!value)throw new TypeErrorConstructor('Illegal invocation');return value.geo;},window.Object);
 hostDefine(getter,'name',{value:'get geolocation',configurable:true});hostDefine(getter,'length',{value:0,configurable:true});hostDefine(window.Navigator.prototype,'geolocation',{get:getter,enumerable:true,configurable:true});
 const dispose=()=>{if(record.disposed)return;record.disposed=true;record.cancel();signal?.removeEventListener('abort',dispose);page.off?.('close',dispose)};
 const controller=hostCreate(null);hostDefine(controller,'dispose',{value:dispose,enumerable:true});hostDefine(controller,'pending',{get(){return tasks.size},enumerable:true});record.controller=Object.freeze(controller);records.set(window,record);
 signal?.addEventListener('abort',dispose,{once:true});page.once?.('close',dispose);if(signal?.aborted||page.closed)dispose();return record.controller;
}
