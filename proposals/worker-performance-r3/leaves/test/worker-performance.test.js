import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installWorkerDOMException} from '../src/worker-dom-exception.js';
import {installWorkerEvents} from '../src/worker-events.js';
import {installWorkerPerformance} from '../src/worker-performance.js';
import {createMessagingRealm} from '../src/messaging.js';
import {getHeapBinding} from '../src/native-heap.js';

function fixture(t){
 const context=vm.createContext({}),evaluate=source=>vm.runInContext(source,context),realm=evaluate('globalThis'),signal=new AbortController(),timers=new Set(),errors=[];
 installWorkerDOMException(realm,{evaluate});const events=installWorkerEvents(realm,{evaluate,reportError:e=>errors.push(e),active:()=>!signal.signal.aborted});
 const setTimer=(callback,ms)=>{const handle=setTimeout(()=>{timers.delete(handle);callback()},ms);timers.add(handle);return handle},clearTimer=handle=>{clearTimeout(handle);timers.delete(handle)};
 const controller=installWorkerPerformance(realm,{context,evaluate,events,setTimer,clearTimer,signal:signal.signal,active:()=>!signal.signal.aborted,reportError:e=>errors.push(e)});
 t.after(()=>{signal.abort();controller.dispose();events.dispose();for(const h of timers)clearTimeout(h)});
 return{context,evaluate,realm,signal,timers,errors,controller,events};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('Worker Performance records actual actor marks, detail aliases, measure resolution and VM values',{timeout:2000},t=>{
 const f=fixture(t),result=f.evaluate(`(()=>{const p=performance,detail={actual:1},m=p.mark('start',{startTime:1.5,detail});p.mark('end',{startTime:10});const n=p.measure('span',{start:'start',end:'end'});let errors=[];for(const operation of[()=>p.now.call({}),()=>p.getEntries.call(new Proxy(p,{})),()=>p.mark(),()=>PerformanceObserver.prototype.takeRecords.call({})])try{operation();errors.push(null)}catch(e){errors.push({name:e.name,message:e.message,own:e instanceof TypeError})}return{hasPerformance:typeof p,ancestry:p instanceof Performance&&p instanceof EventTarget,now:p.now()>=0,epoch:Math.abs(Date.now()-p.timeOrigin-p.now())<1000,mark:m instanceof PerformanceMark&&m instanceof PerformanceEntry,start:m.startTime,detailAlias:m.detail===detail,measure:n instanceof PerformanceMeasure,duration:n.duration,entries:p.getEntriesByType('mark').map(e=>e.name),arrayVM:Object.getPrototypeOf(p.getEntries())===Array.prototype,jsonVM:Object.getPrototypeOf(m.toJSON())===Object.prototype,windowOnly:['eventCounts','timing','navigation'].some(k=>k in p),nodeOnly:['nodeTiming','timerify','eventLoopUtilization'].some(k=>k in p),errors}})()`);
 assert.deepEqual(plain(result),{hasPerformance:'object',ancestry:true,now:true,epoch:true,mark:true,start:1.5,detailAlias:true,measure:true,duration:8.5,entries:['start','end'],arrayVM:true,jsonVM:true,windowOnly:false,nodeOnly:false,errors:[{name:'TypeError',message:'Illegal invocation',own:true},{name:'TypeError',message:'Illegal invocation',own:true},{name:'TypeError',message:'invalid argument',own:true},{name:'TypeError',message:'Illegal invocation',own:true}]});
 const descriptors=f.evaluate(`(()=>{const constructors=[];for(const name of['Performance','PerformanceEntry','PerformanceMark','PerformanceMeasure','PerformanceResourceTiming','PerformanceNavigationTiming','PerformanceObserverEntryList']){const C=globalThis[name],errors=[];for(const operation of[()=>new C(),()=>C()])try{operation();errors.push(null)}catch(e){errors.push({name:e.name,message:e.message,own:e instanceof TypeError})}constructors.push({name,writable:Object.getOwnPropertyDescriptor(C,'prototype').writable,errors})}const trace=[],detail={real:1},mark=performance.mark({toString(){trace.push('name');return'converted'}},{get detail(){trace.push('detail');return detail},get startTime(){trace.push('startTime');return{valueOf(){trace.push('number');return 3}}}});return{constructors,observerPrototypeWritable:Object.getOwnPropertyDescriptor(PerformanceObserver,'prototype').writable,trace,alias:mark.detail===detail,json:mark.toJSON(),symbol:performance.mark(Symbol('x'),{startTime:1}).name,getterNames:[Object.getOwnPropertyDescriptor(Performance.prototype,'timeOrigin').get.name,Object.getOwnPropertyDescriptor(PerformanceObserver,'supportedEntryTypes').get.name]}})()`);
 assert.deepEqual(Array.from(descriptors.trace),['name','detail','startTime','number']);assert.equal(descriptors.alias,true);assert.deepEqual(plain(descriptors.json),{name:'converted',entryType:'mark',startTime:3,duration:0});assert.equal(descriptors.symbol,'x');assert.equal(descriptors.observerPrototypeWritable,false);assert.deepEqual(Array.from(descriptors.getterNames),['get timeOrigin','get supportedEntryTypes']);
 for(const row of descriptors.constructors){assert.equal(row.writable,false);assert.deepEqual(plain(row.errors),Array(2).fill({name:'TypeError',message:'Illegal Constructor',own:true}))}
 const final=f.evaluate(`(()=>{const first=PerformanceObserver.supportedEntryTypes,second=PerformanceObserver.supportedEntryTypes;first.push('authored');const third=PerformanceObserver.supportedEntryTypes,getter=Object.getOwnPropertyDescriptor(globalThis,'performance').get;let errors=[];for(const value of[{},Object.create(globalThis),new Proxy(globalThis,{})])try{getter.call(value);errors.push(null)}catch(e){errors.push({name:e.name,message:e.message,own:e instanceof TypeError})}let objectSymbol;try{performance.mark({[Symbol.toPrimitive](){return Symbol('object')}})}catch(e){objectSymbol={name:e.name,message:e.message,own:e instanceof TypeError}}return{fresh:first!==second&&first!==third,frozen:Object.isFrozen(first),second:Array.from(second),third:Array.from(third),getterName:getter.name,own:getter.call(globalThis)===performance,null:getter.call(null)===performance,undefined:getter.call(undefined)===performance,errors,symbolMissing:performance.mark(Symbol(),{startTime:1}).name,objectSymbol}})()`);
 assert.deepEqual(plain(final),{fresh:true,frozen:false,second:['mark','measure','navigation','resource'],third:['mark','measure','navigation','resource'],getterName:'get performance',own:true,null:true,undefined:true,errors:Array(3).fill({name:'TypeError',message:'Illegal invocation',own:true}),symbolMissing:'undefined',objectSymbol:{name:'TypeError',message:'Cannot convert a Symbol value to a string',own:true}});


});

test('Worker observer delivers real queued marks after Promise jobs with selected-VM list and actual identity',{timeout:2000},async t=>{
 const f=fixture(t),value=await f.evaluate(`new Promise(resolve=>{const order=[],observer=new PerformanceObserver(function(list,source,third){order.push('observer');const result={same:source===observer,self:this===observer,third:typeof third,list:list instanceof PerformanceObserverEntryList,listVM:Object.getPrototypeOf(list)===PerformanceObserverEntryList.prototype,arrayVM:Object.getPrototypeOf(list.getEntries())===Array.prototype,records:list.getEntries().map(e=>({name:e.name,type:e.entryType,instance:e instanceof PerformanceMark}))};observer.disconnect();Promise.resolve().then(()=>resolve({...result,order}))});observer.observe({entryTypes:['mark']});performance.mark('first');performance.mark('second');order.push('sync');Promise.resolve().then(()=>order.push('promise'));})`);
 assert.deepEqual(plain(value),{same:true,self:true,third:'undefined',list:true,listVM:true,arrayVM:true,records:[{name:'first',type:'mark',instance:true},{name:'second',type:'mark',instance:true}],order:['sync','promise','observer']});
});

test('Worker actors retain separate real timelines and successful clone brands without Host Performance',{timeout:2000},async t=>{
 const a=fixture(t),b=fixture(t);a.evaluate(`performance.mark('only-a',{startTime:3})`);b.evaluate(`performance.mark('only-b',{startTime:8})`);
 a.realm.other=b.realm.performance;
 assert.deepEqual(Array.from(a.evaluate('Performance.prototype.getEntries.call(other)'),entry=>entry.name),['only-b']);
 a.evaluate(`Performance.prototype.mark.call(other,'borrowed',{startTime:9});Performance.prototype.measure.call(other,'borrowed-span',{start:'only-b',end:'borrowed'})`);
 assert.deepEqual(Array.from(a.evaluate('performance.getEntries()'),entry=>entry.name),['only-a']);
 assert.equal(b.evaluate(`performance.getEntriesByName('borrowed-span')[0].duration`),1);
 const messaging=createMessagingRealm(a.realm,{initializeTarget:value=>a.events.registerTarget(value,new EventTarget())});t.after(()=>messaging.dispose());
 const values=await a.evaluate(`new Promise(resolve=>{const observer=new PerformanceObserver(list=>{observer.disconnect();resolve({performance,mark:performance.getEntriesByName('only-a')[0],measure:performance.measure('clone-measure',{duration:1}),observer,list})});observer.observe({type:'mark'});performance.mark('clone-list')})`);
 for(const value of Object.values(values))assert.throws(()=>messaging.clone(value),e=>e.name==='DataCloneError'&&e.message==='The object can not be cloned'&&e instanceof a.realm.DOMException);
 for(const name of ['PerformanceMark','PerformanceObserver','PerformanceObserverEntryList']){const fake=a.evaluate(`Object.create(${name}.prototype)`),copy=messaging.clone(fake);assert.equal(Object.getPrototypeOf(copy),a.realm.Object.prototype);assert.deepEqual(Reflect.ownKeys(copy),[])}

 assert.throws(()=>a.evaluate(`PerformanceEntry.prototype.toJSON.call(Object.create(PerformanceMark.prototype))`),e=>e instanceof a.realm.TypeError);
});

test('Worker close cancels actual pending observer tasks and callback failures reach owned error reporting',{timeout:2000},async t=>{
 const f=fixture(t);f.evaluate(`globalThis.calls=0;const first=new PerformanceObserver(()=>{calls++;throw new Error('actual observer error')});const second=new PerformanceObserver(()=>{calls++});first.observe({entryTypes:['mark']});second.observe({entryTypes:['mark']});performance.mark('dispatch')`);
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.realm.calls,2);assert.equal(f.errors.length,1);assert.equal(f.errors[0].message,'actual observer error');assert.ok(f.errors[0] instanceof f.realm.Error);
 f.evaluate(`performance.mark('pending')`);assert.equal(f.timers.size,1);f.signal.abort();assert.equal(f.timers.size,0);
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.realm.calls,2);
});

test('Worker Performance fronts, constructors, errors and callback lists have real VM creation Contexts',{timeout:2000},async t=>{
 const f=fixture(t),heap=getHeapBinding(),anchor=f.evaluate('({})'),host={},values=f.evaluate(`(()=>{const entry=performance.mark('context',{startTime:2}),measure=performance.measure('context-span',{duration:3});let error;try{performance.now.call({})}catch(e){error=e}return{performance,entry,measure,Performance,PerformanceEntry,PerformanceMark,PerformanceMeasure,PerformanceObserver,PerformanceObserverEntryList,PerformanceResourceTiming,PerformanceNavigationTiming,prototype:Performance.prototype,entryPrototype:PerformanceMark.prototype,now:Performance.prototype.now,mark:Performance.prototype.mark,nameGetter:Object.getOwnPropertyDescriptor(PerformanceEntry.prototype,'name').get,originGetter:Object.getOwnPropertyDescriptor(Performance.prototype,'timeOrigin').get,globalGetter:Object.getOwnPropertyDescriptor(globalThis,'performance').get,supportedGetter:Object.getOwnPropertyDescriptor(PerformanceObserver,'supportedEntryTypes').get,entries:performance.getEntries(),json:entry.toJSON(),error}})()`);
 const callback=await f.evaluate(`new Promise(resolve=>{const observer=new PerformanceObserver((list,source)=>{observer.disconnect();resolve({observer,list,array:list.getEntries(),entry:list.getEntries()[0],listMethod:PerformanceObserverEntryList.prototype.getEntries})});observer.observe({entryTypes:['mark']});performance.mark('callback-context')})`);
 const rows=[];for(const[name,value]of Object.entries({...values,...callback})){const row={name,VM:heap.sameRealm(value,anchor),Host:heap.sameRealm(value,host),creationGlobal:heap.creationGlobal(value)===f.realm};const prototype=Object.getPrototypeOf(value);Object.setPrototypeOf(value,null);row.VMNull=heap.sameRealm(value,anchor);row.HostNull=heap.sameRealm(value,host);Object.setPrototypeOf(value,prototype);rows.push(row);assert.deepEqual(row,{name,VM:true,Host:false,creationGlobal:true,VMNull:true,HostNull:false})}
 console.log('WORKER_PERFORMANCE_CREATION_CONTEXT '+JSON.stringify({node:process.version,rows}));
});
