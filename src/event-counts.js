import {implementationForWrapper} from './dom-event-state.js';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-kinds.js';
import {createEventCountState,eventCountNames,bindEventCountFront,hasEventCountFront,readEventCountFront,bindEventCountIterator,hasEventCountIterator,nextEventCountIterator,readEventCountIterator,bindPerformanceEventCounts,performanceEventCounts} from './event-counts-state.js';

function factory(g,bridge) {
  'use strict';
  const Object=g.Object,TypeError=g.TypeError,apply=g.Reflect.apply;
  const define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor,create=Object.create,keys=JSON.parse(bridge.names),text=g.String;
  const symbol=g.Symbol.iterator,symbolDescription=descriptor(g.Symbol.prototype,'description').get;
  const key=value=>typeof value==='symbol'?apply(symbolDescription,value,[])??'':text(value);
  const brand=value=>{if(!bridge.hasFront(value))throw new TypeError('Illegal invocation');return value;};
  const indexOf=name=>{for(let i=0;i<keys.length;i++)if(keys[i]===name)return i;return -1;};
  function EventCounts(){throw new TypeError('Illegal Constructor');}
  const prototype=EventCounts.prototype;
  // Distinct genuine types, calibrated against Native's actual public names.
  const iteratorNames=JSON.parse(bridge.iteratorNames),iteratorPrototypes=[];
  for(let kind=0;kind<3;kind++){
    const Constructor=function(){throw new TypeError('Illegal Constructor');};
    define(Constructor,'name',{value:iteratorNames[kind],configurable:true});
    const ip=Constructor.prototype;delete ip.constructor;
    const next={next(){
      if(!bridge.iteratorBrand(this,kind))throw new TypeError('Illegal invocation');
      const index=bridge.iteratorNext(this,kind);if(index===-1)return {done:true};
      return {done:false,value:kind===0?keys[index]:kind===1?bridge.iteratorRead(this,index):[keys[index],bridge.iteratorRead(this,index)]};
    }}.next;
    define(ip,'next',{value:next,enumerable:true,writable:true,configurable:true});
    define(ip,'constructor',{value:Constructor,writable:true,configurable:true});
    const selfMethod={[symbol](){if(!bridge.iteratorBrand(this,kind))throw new TypeError('Illegal invocation');return this;}}[symbol];
    define(selfMethod,'name',{value:'',configurable:true});
    define(ip,symbol,{value:selfMethod,writable:true,configurable:true});
    define(Constructor,'prototype',{writable:false});
    define(iteratorPrototypes,kind,{value:ip});
  }
  function iterator(value,kind){brand(value);const result=create(iteratorPrototypes[kind]);bridge.registerIterator(result,value,kind);return result;}
  const methods={
    get(name){brand(this);if(!arguments.length)throw new TypeError('invalid argument');const index=indexOf(key(name));return index<0?0:bridge.readFront(this,index);},
    has(name){brand(this);if(!arguments.length)throw new TypeError('invalid argument');return indexOf(key(name))>=0;},
    keys(){return iterator(this,0);},
    values(){return iterator(this,1);},
    entries(){return iterator(this,2);},
    forEach(callback){
      brand(this);if(typeof callback!=='function')throw new TypeError('invalid argument');const receiver=arguments[1],values=[];
      // Native snapshots all36 actual counts before invoking callback1.
      // Define private own slots without authored Array prototype setters.
      for(let index=0;index<keys.length;index++)define(values,index,{value:bridge.readFront(this,index)});
      for(let index=0;index<keys.length;index++){try{apply(callback,receiver,[values[index],keys[index],this]);}catch{ /* Native continues after each callback failure. */ }}
    },
  };
  delete prototype.constructor;
  for(const name of ['get','has'])define(prototype,name,{value:methods[name],enumerable:true,writable:true,configurable:true});
  const sizeGetter=descriptor({get size(){brand(this);return keys.length;}},'size').get;
  define(prototype,'size',{enumerable:true,configurable:true,get:sizeGetter});
  for(const name of ['keys','values','entries','forEach'])define(prototype,name,{value:methods[name],enumerable:true,writable:true,configurable:true});
  define(prototype,'constructor',{value:EventCounts,writable:true,configurable:true});
  const iterate={[symbol](){return iterator(this,2);}}[symbol];define(iterate,'name',{value:'',configurable:true});
  define(prototype,symbol,{value:iterate,writable:true,configurable:true});
  define(prototype,g.Symbol.toStringTag,{value:'EventCounts',configurable:true});
  define(EventCounts,'prototype',{writable:false});
  const value=create(prototype);bridge.register(value);
  define(g,'EventCounts',{value:EventCounts,writable:true,configurable:true});
  const getter=descriptor({get eventCounts(){const value=bridge.performanceValue(this);if(value===undefined)throw new TypeError('Illegal invocation');return value;}},'eventCounts').get;
  define(g.Performance?.prototype??g.performance,'eventCounts',{enumerable:true,configurable:true,get:getter});
  return value;
}

const iteratorNames=[
  'browser.webapi.collections.iterator.Entry(browser.webapi.EventCounts.Iterator,"0"[0..1]).JsApi',
  'browser.webapi.collections.iterator.Entry(browser.webapi.EventCounts.Iterator,"1"[0..1]).JsApi',
  'browser.webapi.collections.iterator.Entry(browser.webapi.EventCounts.Iterator,null).JsApi',
];
export function installEventCounts(window) {
  registerPlatformFactoryKind('EventCounts');registerPlatformFactoryKind('EventCountsIterator');
  const document=implementationForWrapper(window.document);
  if(!document?._globalObject)throw new TypeError('EventCounts requires an actual Document backend');
  const state=createEventCountState(document._globalObject);
  const value=window.eval(`(${factory.toString()})`)(window,{
    names:JSON.stringify(eventCountNames),iteratorNames:JSON.stringify(iteratorNames),
    hasFront:hasEventCountFront,readFront:readEventCountFront,
    iteratorBrand:hasEventCountIterator,iteratorNext:nextEventCountIterator,iteratorRead:readEventCountIterator,
    performanceValue:performanceEventCounts,
    register(value){bindEventCountFront(value,state);bindPerformanceEventCounts(window.performance,value);registerPlatformFactory(value,{kind:'EventCounts',globalObject:window});},
    registerIterator(value,source,kind){bindEventCountIterator(value,source,kind);registerPlatformFactory(value,{kind:'EventCountsIterator',globalObject:window});},
  });
  return {value,dispose:state.dispose};
}
