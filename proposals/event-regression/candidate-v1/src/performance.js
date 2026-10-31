import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
// Independent timing from recorded calls and Page transport/lifecycle events.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);

const installed = new WeakMap(), trackers=new WeakMap();
const hostNow=()=>globalThis.performance.now();

function performanceFactory(g, bridge) {
  const performance=g.performance, entries=new WeakMap(), observers=new WeakMap(), lists=new WeakMap();
  const timeline=[], registered=new Set();
  const supported=Object.freeze(['mark','measure','navigation','resource']);
  let stopped=false, timer, resourceLimit=250, overflowTimer, navigation=null, overflowHandler=null, handlerInstalled=false;
  const overflow=[];
  const entryBrand=value=>{const state=entries.get(value);if(!state)throw new g.TypeError('Illegal invocation');return state;};
  const observerBrand=value=>{const state=observers.get(value);if(!state)throw new g.TypeError('Illegal invocation');return state;};
  const listBrand=value=>{const state=lists.get(value);if(!state)throw new g.TypeError('Illegal invocation');return state;};
  const performanceBrand=value=>{if(value!==performance)throw new g.TypeError('Illegal invocation');};
  const text=value=>{if(typeof value==='symbol')throw new g.TypeError('Cannot convert a Symbol value to a string');return String(value);};
  const number=value=>{if(typeof value==='bigint')throw new g.TypeError('Cannot convert a BigInt value to a number');return +value;};
  const sorted=values=>values.slice().sort((a,b)=>a.startTime-b.startTime);
  const select=(values,name,type)=>sorted(values.filter(value=>(name===undefined||value.name===name)&&(type===undefined||value.entryType===type)));
  class PerformanceEntry {
    constructor(){throw new g.TypeError('Illegal Constructor');}
    get name(){return entryBrand(this).name;}
    get entryType(){return entryBrand(this).entryType;}
    get startTime(){return entryBrand(this).startTime;}
    get duration(){return entryBrand(this).duration;}
    toJSON(){const{name,entryType,startTime,duration}=entryBrand(this);return{name,entryType,startTime,duration};}
  }
  class PerformanceMark extends PerformanceEntry {
    constructor(){super();}
    get detail(){return entryBrand(this).detail;}
  }
  class PerformanceMeasure extends PerformanceEntry {
    constructor(){super();}
    get detail(){return entryBrand(this).detail;}
  }
  const resourceFields=['initiatorType','nextHopProtocol','deliveryType','workerStart','redirectStart','redirectEnd','fetchStart','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart','responseEnd','transferSize','encodedBodySize','decodedBodySize','responseStatus','contentType','contentEncoding','firstInterimResponseStart','finalResponseHeadersStart'];
  const navigationFields=['type','redirectCount','unloadEventStart','unloadEventEnd','domInteractive','domContentLoadedEventStart','domContentLoadedEventEnd','domComplete','loadEventStart','loadEventEnd','activationStart'];
  class PerformanceResourceTiming extends PerformanceEntry {
    constructor(){super();}
    toJSON(){const value=super.toJSON();for(const name of resourceFields)value[name]=entryBrand(this)[name];return value;}
  }
  class PerformanceNavigationTiming extends PerformanceResourceTiming {
    constructor(){super();}
    toJSON(){const value=super.toJSON();for(const name of navigationFields)value[name]=entryBrand(this)[name];return value;}
  }
  for(const[Constructor,fields]of[[PerformanceResourceTiming,resourceFields],[PerformanceNavigationTiming,navigationFields]])for(const name of fields)Object.defineProperty(Constructor.prototype,name,{configurable:true,enumerable:true,get(){return entryBrand(this)[name];}});
  class PerformanceObserverEntryList {
    constructor(){throw new g.TypeError('Illegal Constructor');}
    getEntries(){return sorted(listBrand(this));}
    getEntriesByType(type){const values=listBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');return select(values,undefined,text(type));}
    getEntriesByName(name,type){const values=listBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');return select(values,text(name),type===undefined?undefined:text(type));}
  }
  function schedule(){if(!stopped&&timer===undefined)timer=bridge.setTimer(deliver,0);}
  function deliver(){
    timer=undefined;if(stopped)return;
    for(const observer of [...registered]){
      const state=observerBrand(observer);
      if(!registered.has(observer)||!state.records.length)continue;
      const list=Object.create(PerformanceObserverEntryList.prototype);
      lists.set(list,state.records.splice(0));
      try{state.callback.call(observer,list,observer,{droppedEntriesCount:0});}catch(error){bridge.report(error);}
    }
  }
  function publish(entry,store=true){
    if(stopped)return entry;
    if(store)timeline.push(entry);
    for(const observer of registered){const state=observerBrand(observer);if(state.types.has(entry.entryType))state.records.push(entry);}
    schedule();return entry;
  }
  function append(kind,name,startTime,duration,detail){
    const entry=Object.create((kind==='mark'?PerformanceMark:PerformanceMeasure).prototype);
    entries.set(entry,{name,entryType:kind,startTime,duration,detail});
    return publish(entry);
  }
  function networkEntry(data,kind){
    const entry=Object.create((kind==='navigation'?PerformanceNavigationTiming:PerformanceResourceTiming).prototype);
    const value={name:text(data.name),entryType:kind,startTime:data.startTime,duration:data.duration};
    for(const name of resourceFields)value[name]=data[name]??(['initiatorType','nextHopProtocol','deliveryType','contentType','contentEncoding'].includes(name)?'':0);
    if(kind==='navigation')for(const name of navigationFields)value[name]=data[name]??(name==='type'?'navigate':0);
    entries.set(entry,value);return entry;
  }
  function recordResource(data){
    const entry=networkEntry(data,'resource');
    if(timeline.filter(value=>value.entryType==='resource').length<resourceLimit)return publish(entry);
    publish(entry,false);overflow.push(entry);
    if(!stopped&&overflowTimer===undefined)overflowTimer=bridge.setTimer(()=>{
      overflowTimer=undefined;if(stopped)return;
      bridge.dispatch(performance,new g.Event('resourcetimingbufferfull'));
      for(const value of overflow.splice(0))if(timeline.filter(entry=>entry.entryType==='resource').length<resourceLimit)timeline.push(value);
    },0);
    return entry;
  }
  function recordNavigation(data){
    if(navigation)return navigation;
    navigation=networkEntry(data,'navigation');publish(navigation);return navigation;
  }
  function updateNavigation(data){if(!stopped&&navigation)Object.assign(entryBrand(navigation),data);}
  function resolveTime(value,fallback){
    if(value===undefined)return fallback;
    if(typeof value==='number'){if(value<0)throw new g.TypeError('');return value;}
    const name=text(value);
    const candidates=timeline.filter(entry=>entry.entryType==='mark'&&entry.name===name);
    if(candidates.length)return candidates[candidates.length-1].startTime;
    // Use supplied real navigation timing only; never manufacture network data.
    if(performance.timing&&name in performance.timing&&typeof performance.timing[name]==='number')return performance.timing[name];
    throw new g.DOMException('The string did not match the expected pattern','SyntaxError');
  }
  const methods={
    now(){performanceBrand(this);return bridge.now();},
    mark(name,options={}){
      performanceBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');
      name=text(name);options=options??{};
      if(!['object','function'].includes(typeof options))throw new g.TypeError('invalid argument');
      const start=options.startTime===undefined?bridge.now():number(options.startTime);
      if(start<0)throw new g.TypeError('');
      return append('mark',name,start,0,options.detail===undefined?null:options.detail);
    },
    measure(name,startOrOptions,endMark){
      performanceBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');
      name=text(name);let start,end,duration,detail=null;
      if(startOrOptions!==null&&typeof startOrOptions==='object'){
        const options=startOrOptions;
        const hasDuration=options.duration!==undefined;
        duration=hasDuration?number(options.duration):undefined;
        if(duration<0)throw new g.TypeError('');
        if(options.start!==undefined)start=resolveTime(options.start,0);
        if(options.end!==undefined)end=resolveTime(options.end,bridge.now());
        if(start===undefined)start=hasDuration&&end!==undefined?end-duration:0;
        if(end===undefined)end=hasDuration?start+duration:bridge.now();
        detail=options.detail===undefined?null:options.detail;
      }else{
        start=resolveTime(startOrOptions,0);end=resolveTime(endMark,bridge.now());
      }
      duration=duration===undefined?end-start:duration;
      if(start<0||duration<0)throw new g.TypeError('');
      return append('measure',name,start,duration,detail);
    },
    clearMarks(name){performanceBrand(this);clear('mark',arguments.length?text(name):undefined);},
    clearMeasures(name){performanceBrand(this);clear('measure',arguments.length?text(name):undefined);},
    clearResourceTimings(){performanceBrand(this);clear('resource');},
    setResourceTimingBufferSize(size){performanceBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');const value=number(size);resourceLimit=Number.isFinite(value)?Math.trunc(value)>>>0:0;},
    getEntries(){performanceBrand(this);return sorted(timeline);},
    getEntriesByType(type){performanceBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');return select(timeline,undefined,text(type));},
    getEntriesByName(name,type){performanceBrand(this);if(!arguments.length)throw new g.TypeError('invalid argument');return select(timeline,text(name),type===undefined?undefined:text(type));},
  };
  function clear(type,name){for(let i=timeline.length-1;i>=0;i--)if(timeline[i].entryType===type&&(name===undefined||timeline[i].name===name))timeline.splice(i,1);}
  class PerformanceObserver {
    constructor(callback){if(typeof callback!=='function')throw new g.TypeError('invalid argument');observers.set(this,{callback,mode:null,types:new Set(),records:[]});}
    observe(options){
      const state=observerBrand(this);
      if(options===null||!['object','function'].includes(typeof options))throw new g.TypeError('invalid argument');
      const multiple=options.entryTypes!==undefined,single=options.type!==undefined;
      if(multiple===single)throw new g.TypeError('invalid argument');
      const mode=multiple?'multiple':'single';
      if(state.mode&&state.mode!==mode)throw new g.DOMException('The object can not be modified in this way','InvalidModificationError');
      state.mode=mode;
      if(multiple){
        if(options.entryTypes===null||typeof options.entryTypes[Symbol.iterator]!=='function')throw new g.TypeError('invalid argument');
        state.types=new Set([...options.entryTypes].map(text).filter(type=>supported.includes(type)));
      }else{
        const type=text(options.type);
        if(supported.includes(type))state.types.add(type);
        if(options.buffered&&supported.includes(type))state.records.push(...timeline.filter(entry=>entry.entryType===type));
      }
      if(state.types.size)registered.add(this);
      if(state.records.length)schedule();
    }
    disconnect(){const state=observerBrand(this);registered.delete(this);state.records=[];state.types.clear();}
    takeRecords(){return observerBrand(this).records.splice(0);}
    static get supportedEntryTypes(){return supported;}
  }
  for(const Constructor of [PerformanceEntry,PerformanceMark,PerformanceMeasure,PerformanceResourceTiming,PerformanceNavigationTiming,PerformanceObserverEntryList,PerformanceObserver]){
    Object.defineProperty(Constructor.prototype,Symbol.toStringTag,{configurable:true,value:Constructor.name});
    for(const name of Object.getOwnPropertyNames(Constructor.prototype))if(name!=='constructor')Object.defineProperty(Constructor.prototype,name,{...Object.getOwnPropertyDescriptor(Constructor.prototype,name),enumerable:true});
    Object.defineProperty(g,Constructor.name,{configurable:true,writable:true,value:Constructor});
  }
  const prototype=g.Performance?.prototype??performance;
  for(const[name,value]of Object.entries(methods))Object.defineProperty(prototype,name,{configurable:true,enumerable:true,writable:true,value});
  Object.defineProperty(prototype,'timeOrigin',{configurable:true,enumerable:true,get(){performanceBrand(this);return bridge.timeOrigin;}});
  Object.defineProperty(prototype,'onresourcetimingbufferfull',{configurable:true,enumerable:true,
    get(){performanceBrand(this);return overflowHandler;},set(value){performanceBrand(this);overflowHandler=typeof value==='function'?value:null;
      if(!handlerInstalled&&overflowHandler){handlerInstalled=true;performance.addEventListener('resourcetimingbufferfull',function(event){if(overflowHandler)overflowHandler.call(performance,event);});}}});
  const timing={};
  for(const name of ['navigationStart','unloadEventStart','unloadEventEnd','redirectStart','redirectEnd','fetchStart','domainLookupStart','domainLookupEnd','connectStart','connectEnd','secureConnectionStart','requestStart','responseStart','responseEnd','domLoading','domInteractive','domContentLoadedEventStart','domContentLoadedEventEnd','domComplete','loadEventStart','loadEventEnd'])Object.defineProperty(timing,name,{enumerable:true,get(){return navigation?entryBrand(navigation)[name]??0:0;}});
  const legacyNavigation={get type(){return navigation&&entryBrand(navigation).type==='reload'?1:0;},get redirectCount(){return navigation?entryBrand(navigation).redirectCount:0;}};
  Object.defineProperty(prototype,'timing',{configurable:true,enumerable:true,get(){performanceBrand(this);return timing;}});
  Object.defineProperty(prototype,'navigation',{configurable:true,enumerable:true,get(){performanceBrand(this);return legacyNavigation;}});
  return {recordResource,recordNavigation,updateNavigation,dispose(){stopped=true;for(const observer of registered){const state=observerBrand(observer);state.records.length=0;state.types.clear();}registered.clear();timeline.length=0;bridge.clearTimer(timer);bridge.clearTimer(overflowTimer);timer=undefined;overflowTimer=undefined;overflow.length=0;},
    supportedEntryTypes:supported};
}

function trackerFor(owner){
  if(!owner?.on)return null;
  if(trackers.has(owner))return trackers.get(owner);
  const pending=new Map(),documents=new Map(),subscribers=new Set();
  const timestamp=event=>Number.isFinite(event?.timestamp)?event.timestamp*1000:hostNow();
  const request=event=>{
    let previous=pending.get(event.id);
    if(event.redirectResponse&&!previous){
      const candidates=[...pending.values()].filter(value=>value.currentURL===event.redirectResponse.url&&value.frameId===(event.frameId??owner.frameId)&&value.type===event.type);
      // Fetch currently changes request IDs on redirects. Do not guess an
      // original request when concurrent identical URLs make linkage ambiguous.
      if(candidates.length===1)previous=candidates[0];
    }
    const time=timestamp(event);
    if(previous&&event.redirectResponse){pending.delete(previous.id);previous={...previous,id:event.id,currentURL:event.url,finalStart:time,redirectCount:previous.redirectCount+1};}
    else previous={id:event.id,name:event.url,currentURL:event.url,type:event.type,method:event.method,frameId:event.frameId??owner.frameId,
      loaderId:event.loaderId,start:time,finalStart:time,redirectCount:0};
    pending.set(event.id,previous);
    if(pending.size>1000)pending.delete(pending.keys().next().value);
  };
  const response=event=>{
    const state=pending.get(event.id);if(!state)return;pending.delete(event.id);
    const value={...state,response:event,end:timestamp(event)};
    if(value.type==='Document')documents.set(value.frameId,value);
    for(const callback of subscribers)callback(value);
  };
  const failed=event=>{
    const state=pending.get(event.id);if(!state)return;pending.delete(event.id);
    const value={...state,response:{status:0,size:0,headers:{}},end:timestamp(event),failed:true};
    for(const callback of subscribers)callback(value);
  };
  const close=()=>{owner.off('request',request);owner.off('response',response);owner.off('requestFailed',failed);owner.off('close',close);pending.clear();documents.clear();subscribers.clear();trackers.delete(owner);};
  owner.on('request',request);owner.on('response',response);owner.on('requestFailed',failed);owner.once('close',close);
  const tracker={documents,subscribers};trackers.set(owner,tracker);return tracker;
}

export function installPerformance(page,window,{navigationType=page.performanceNavigationType??'navigate'}={}){
  if(installed.has(window))return installed.get(window);
  if(!window?.performance||typeof window.eval!=='function')throw new TypeError('Performance installation requires a document realm');
  const document=window.document,signal=page.documentAbort?.signal,previousClose=window.close;
  let disposed=false;
  const live=()=>!disposed&&window.document===document;
  const owner=page.registry?.page??page,tracker=trackerFor(owner);
  const frameId=page.frameId??page.id;
  const completedDocument=tracker?.documents.get(frameId);
  const seed=completedDocument&&(page.loaderId!==undefined?completedDocument.loaderId===page.loaderId:completedDocument.currentURL===window.location.href)?completedDocument:undefined;
  const origin=seed?.start??(hostNow()-window.performance.now());
  const now=()=>Math.max(0,hostNow()-origin);
  const controller=window.eval(`(${performanceFactory.toString()})`)(window,{
    now,timeOrigin:globalThis.performance.timeOrigin+origin,
    setTimer:(callback,ms)=>window.setTimeout(()=>{if(!live()){dispose();return;}callback();},ms),clearTimer:timer=>window.clearTimeout(timer),
    dispatch(target,event){const value=implForWrapper(event);value.isTrusted=true;return implForWrapper(target)._dispatch(value);},
    report(error){
      if(typeof window.reportError==='function'){window.reportError(error);return;}
      const event=new window.ErrorEvent('error',{error,message:String(error?.message??error),cancelable:true});
      if(window.dispatchEvent(event))page.emit?.('pageError',error);
    },
  });
  const offset=time=>Math.max(0,time-origin);
  function networkData(record){
    const response=record.response,headers=new Headers(response.headers??{});
    const start=offset(record.start),end=offset(record.end),fetchStart=offset(record.finalStart);
    const encoding=headers.get('content-encoding')??'';
    const decoded=Number.isFinite(response.size)?response.size:0;
    const length=headers.get('content-length');
    const encoded=length!==null&&/^\d+$/.test(length)?Number(length):encoding?0:decoded;
    const value={name:record.name,startTime:start,duration:Math.max(0,end-start),
      initiatorType:({Fetch:'fetch',XHR:'xmlhttprequest',Script:'script',Stylesheet:'link',Document:'iframe',Image:'img'})[record.type]??'other',
      fetchStart,requestStart:record.failed?0:fetchStart,responseStart:0,responseEnd:end,
      redirectStart:record.redirectCount?start:0,redirectEnd:record.redirectCount?fetchStart:0,
      decodedBodySize:decoded,encodedBodySize:encoded,transferSize:Number.isFinite(response.encodedDataLength)?response.encodedDataLength:0,
      responseStatus:response.status??0,contentType:(headers.get('content-type')??'').split(';')[0].trim().toLowerCase(),contentEncoding:encoding,
      nextHopProtocol:response.protocol??'',finalResponseHeadersStart:0};
    let sameOrigin=false;
    try{sameOrigin=new URL(record.currentURL).origin===window.location.origin;}catch{}
    const allowed=(headers.get('timing-allow-origin')??'').split(',').map(value=>value.trim());
    if(!sameOrigin&&!allowed.includes('*')&&!allowed.includes(window.location.origin)){
      for(const name of ['requestStart','responseStart','redirectStart','redirectEnd','decodedBodySize','encodedBodySize','transferSize','responseStatus','finalResponseHeadersStart'])value[name]=0;
      for(const name of ['contentType','contentEncoding','nextHopProtocol'])value[name]='';
      value.fetchStart=start;
    }
    return value;
  }
  function seedNavigation(record){
    if(!record)return;
    const value=networkData(record);
    // The navigation belongs to this actual completed document fetch. Its
    // clock starts at that request, before this replacement realm was created.
    controller.recordNavigation({...value,name:window.location.href,entryType:'navigation',initiatorType:'navigation',startTime:0,duration:0,
      type:['navigate','reload','back_forward'].includes(navigationType)?navigationType:'navigate',redirectCount:record.redirectCount});
  }
  seedNavigation(seed);
  const receive=record=>{
    if(!live()){dispose();return;}
    if(record.method==='OPTIONS')return;
    if(record.type==='Document'){
      if(record.frameId===frameId){if(record.currentURL===window.location.href)seedNavigation(record);return;}
      const child=owner.frames?.findFrame?.(record.frameId);
      if(child?.parentFrameId!==frameId)return;
    }else if(frameId!==undefined&&record.frameId!==frameId)return;
    controller.recordResource(networkData(record));
  };
  tracker?.subscribers.add(receive);
  const interactive=()=>{if(document.readyState==='interactive')controller.updateNavigation({domInteractive:now()});
    else if(document.readyState==='complete')controller.updateNavigation({domComplete:now()});};
  const contentLoaded=()=>{controller.updateNavigation({domContentLoadedEventStart:now()});window.queueMicrotask(()=>controller.updateNavigation({domContentLoadedEventEnd:now()}));};
  const loaded=()=>{controller.updateNavigation({loadEventStart:now()});window.queueMicrotask(()=>{const end=now();controller.updateNavigation({loadEventEnd:end,duration:end});});};
  document.addEventListener('readystatechange',interactive);
  document.addEventListener('DOMContentLoaded',contentLoaded);
  window.addEventListener('load',loaded);
  const dispose=()=>{if(disposed)return;disposed=true;controller.dispose();tracker?.subscribers.delete(receive);
    document.removeEventListener('readystatechange',interactive);document.removeEventListener('DOMContentLoaded',contentLoaded);window.removeEventListener('load',loaded);
    signal?.removeEventListener('abort',dispose);page.off?.('close',dispose);window.removeEventListener('unload',dispose);
    if(window.close===close)window.close=previousClose;};
  const close=function(){dispose();return previousClose.call(window);};window.close=close;
  signal?.addEventListener('abort',dispose,{once:true});page.once?.('close',dispose);window.addEventListener('unload',dispose,{once:true});
  const result={dispose,supportedEntryTypes:controller.supportedEntryTypes,
    unavailableTransportFields:['domainLookupStart','domainLookupEnd','connectStart','connectEnd','secureConnectionStart','responseStart','nextHopProtocol','transferSize'],
    note:'Unknown transport phases/bytes use unavailable zero/empty values. A new document requires an earlier installed Page tracker to capture its request.'};installed.set(window,result);
  if(signal?.aborted||page.closed)dispose();return result;
}
