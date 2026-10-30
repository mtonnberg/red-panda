import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,getEventListeners} from 'node:events';
import {JSDOM} from 'jsdom';
import {installPerformance} from '../src/performance.js';
import http from 'node:http';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(t,url='http://127.0.0.1/'){const dom=new JSDOM('',{runScripts:'outside-only',url});const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController(),frameId:'main'});
 const controller=installPerformance(page,dom.window);t.after(()=>{controller.dispose();page.emit('close');dom.window.close();});return{window:dom.window,page,controller};}

test('performance marks retain a real ordered realm timeline, observed detail identity and immutable entries',t=>{
 const{window:w}=fixture(t),p=w.performance,detail={value:1};const mark=p.mark('late',{startTime:20,detail});p.mark('early',{startTime:1});
 assert.ok(mark instanceof w.PerformanceMark);assert.ok(mark instanceof w.PerformanceEntry);assert.equal(mark.detail,detail);
 assert.equal(mark.entryType,'mark');assert.equal(mark.duration,0);assert.equal(Reflect.set(mark,'name','changed'),false);
 assert.equal(Object.getPrototypeOf(p.getEntries()),w.Array.prototype);assert.deepEqual(Array.from(p.getEntries(),entry=>entry.name),['early','late']);
 assert.equal(Object.getPrototypeOf(mark.toJSON()),w.Object.prototype);assert.deepEqual({...mark.toJSON()},{name:'late',entryType:'mark',startTime:20,duration:0});
 detail.value=2;assert.equal(mark.detail.value,2);assert.equal(Object.keys(mark).length,0);
});

test('performance measures resolve actual marks and duration options with native precedence',t=>{
 const{window:w}=fixture(t),p=w.performance;p.mark('start',{startTime:3});p.mark('end',{startTime:9});
 const measure=p.measure('span','start','end');assert.ok(measure instanceof w.PerformanceMeasure);assert.equal(measure.startTime,3);assert.equal(measure.duration,6);
 assert.equal(p.measure('duration-only',{duration:7}).startTime,0);assert.equal(p.measure('duration-only-2',{duration:7}).duration,7);
 const all=p.measure('all',{start:1,end:4,duration:2});assert.equal(all.startTime,1);assert.equal(all.duration,2);
 const fromEnd=p.measure('from-end',{end:10,duration:3});assert.equal(fromEnd.startTime,7);
 assert.equal(p.measure('default').startTime,0);assert.ok(p.measure('default2').duration>=0);
 assert.throws(()=>p.measure('negative',{start:8,end:3}),{name:'TypeError'});
 assert.throws(()=>p.measure('missing','no-such-mark'),{name:'SyntaxError'});
});

test('clearing/selecting timeline entries preserves measure references and observer pending records',t=>{
 const{window:w}=fixture(t),p=w.performance;const observer=new w.PerformanceObserver(()=>{});observer.observe({entryTypes:['mark','measure']});
 p.mark('shared',{startTime:2});p.measure('shared',{duration:1});p.mark('other',{startTime:3});
 assert.equal(p.getEntriesByName('shared').length,2);assert.equal(p.getEntriesByName('shared','mark').length,1);
 p.clearMarks('shared');assert.deepEqual(Array.from(p.getEntriesByType('mark'),entry=>entry.name),['other']);
 p.clearMarks();p.clearMeasures();assert.equal(p.getEntries().length,0);assert.equal(observer.takeRecords().length,3);observer.disconnect();
});

test('observer tasks follow promises and provide persistent realm lists filtered by name and type',async t=>{
 const{window:w}=fixture(t);const order=[];let saved;
 const delivered=new Promise(resolve=>{const observer=new w.PerformanceObserver((list,source)=>{saved=list;assert.equal(source,observer);order.push('observer');observer.disconnect();resolve();});
 observer.observe({entryTypes:['mark','measure']});w.performance.mark('same',{startTime:2});w.performance.measure('same',{duration:1});
 Promise.resolve().then(()=>order.push('promise'));order.push('sync');});
 await delivered;assert.deepEqual(order,['sync','promise','observer']);assert.ok(saved instanceof w.PerformanceObserverEntryList);
 assert.ok(saved.getEntries() instanceof w.Array);assert.equal(saved.getEntriesByName('same').length,2);assert.equal(saved.getEntriesByName('same','mark').length,1);
 assert.equal(saved.getEntriesByType('resource').length,0);await Promise.resolve();assert.equal(saved.getEntries().length,2);
});

test('single-type buffered observation queues real past entries and multiple-entry mode ignores buffered',async t=>{
 const{window:w}=fixture(t);w.performance.mark('past',{startTime:1});let saved=[];
 const buffered=new w.PerformanceObserver(list=>saved.push(...list.getEntries()));buffered.observe({type:'mark',buffered:true});await sleep(20);
 assert.deepEqual(saved.map(entry=>entry.name),['past']);buffered.disconnect();
 const multiple=new w.PerformanceObserver(list=>saved.push(...list.getEntries()));multiple.observe({entryTypes:['mark'],buffered:true});await sleep(20);
 assert.equal(saved.length,1);w.performance.mark('future');assert.equal(multiple.takeRecords()[0].name,'future');await sleep(20);assert.equal(saved.length,1);multiple.disconnect();
});

test('observer mode remains fixed after disconnect and invalid/unsupported selections do not invent entries',t=>{
 const{window:w}=fixture(t);const observer=new w.PerformanceObserver(()=>{});observer.observe({type:'mark'});observer.disconnect();
 assert.throws(()=>observer.observe({entryTypes:['mark']}),{name:'InvalidModificationError'});
 assert.throws(()=>observer.observe({}),{name:'TypeError'});assert.throws(()=>observer.observe({type:'mark',entryTypes:['mark']}),{name:'TypeError'});
 const unknown=new w.PerformanceObserver(()=>{throw new Error('must not deliver');});unknown.observe({type:'not-implemented'});w.performance.mark('unrelated');assert.equal(unknown.takeRecords().length,0);
 assert.deepEqual(Array.from(w.PerformanceObserver.supportedEntryTypes),['mark','measure','navigation','resource']);assert.equal(Object.isFrozen(w.PerformanceObserver.supportedEntryTypes),true);
});

test('observer callback exceptions are reported without stopping later callbacks',async t=>{
 const{window:w}=fixture(t);const errors=[],order=[];w.reportError=error=>errors.push(error);
 const first=new w.PerformanceObserver(()=>{order.push('first');first.disconnect();throw new w.Error('performance-error');});
 const second=new w.PerformanceObserver(()=>{order.push('second');second.disconnect();});first.observe({type:'mark'});second.observe({type:'mark'});w.performance.mark('event');
 await sleep(20);assert.deepEqual(order,['first','second']);assert.equal(errors.length,1);assert.equal(errors[0].message,'performance-error');
});

test('timing constructors and APIs enforce brands and native negative/nonfinite start-time behavior',t=>{
 const{window:w,page,controller}=fixture(t);assert.equal(installPerformance(page,w),controller);
 for(const name of ['PerformanceEntry','PerformanceMark','PerformanceMeasure','PerformanceObserverEntryList'])assert.throws(()=>new w[name]('direct'),error=>error instanceof w.TypeError);
 assert.throws(()=>w.performance.mark.call({},'wrong'),error=>error instanceof w.TypeError);assert.throws(()=>w.performance.mark(),error=>error instanceof w.TypeError);
 assert.throws(()=>w.performance.mark('negative',{startTime:-1}),error=>error instanceof w.TypeError);
 assert.equal(w.performance.mark('infinite',{startTime:Infinity}).startTime,Infinity);assert.ok(Number.isNaN(w.performance.mark('nan',{startTime:NaN}).startTime));
 assert.equal(w.performance.mark('plain').detail,null);assert.equal(w.performance.now()>=0,true);assert.equal(w.performance.timeOrigin>0,true);
});

test('abort disposes pending observer tasks and keeps timeline state local to each document',async t=>{
 const one=fixture(t),two=fixture(t);let called=0;const observer=new one.window.PerformanceObserver(()=>called++);observer.observe({type:'mark'});
 one.window.performance.mark('private');assert.equal(two.window.performance.getEntries().length,0);one.page.documentAbort.abort();await sleep(20);assert.equal(called,0);
});

async function transport(t){
 const server=http.createServer((request,response)=>{response.writeHead(200,{'content-type':'text/plain','content-length':'5'});response.end('hello');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return`http://127.0.0.1:${server.address().port}/`;
}

test('resource producer records actual buffered transport completion without inventing phase clocks or wire bytes',async t=>{
 const url=await transport(t),{window:w,page}=fixture(t,url);let observed;
 const observer=new w.PerformanceObserver(list=>{observed=list.getEntries();observer.disconnect();});observer.observe({type:'resource'});
 page.emit('request',{id:'fetch-1',url,type:'Fetch',method:'GET',frameId:'main',timestamp:performance.now()/1000});
 assert.equal(w.performance.getEntriesByType('resource').length,0);
 const response=await fetch(url),bytes=await response.arrayBuffer();
 page.emit('response',{id:'fetch-1',url,type:'Fetch',frameId:'main',status:response.status,size:bytes.byteLength,headers:Object.fromEntries(response.headers),timestamp:performance.now()/1000});
 await sleep(20);const entry=w.performance.getEntriesByName(url,'resource')[0];
 assert.ok(entry instanceof w.PerformanceResourceTiming);assert.ok(entry instanceof w.PerformanceEntry);assert.equal(observed[0],entry);
 assert.equal(entry.initiatorType,'fetch');assert.equal(entry.responseStatus,200);assert.equal(entry.decodedBodySize,5);assert.equal(entry.encodedBodySize,5);
 assert.equal(entry.responseEnd>=entry.requestStart,true);assert.equal(entry.duration,entry.responseEnd-entry.startTime);
 for(const name of ['domainLookupStart','domainLookupEnd','connectStart','connectEnd','secureConnectionStart','responseStart','transferSize'])assert.equal(entry[name],0);
 assert.equal(entry.nextHopProtocol,'');assert.equal(entry.contentType,'text/plain');assert.equal(entry.toJSON().decodedBodySize,5);
});

test('resource timing redacts cross-origin transport metadata without Timing-Allow-Origin',t=>{
 const{window:w,page}=fixture(t,'http://origin.test/');
 for(const[id,allowed]of[['opaque',false],['allowed',true]]){
  const url=`http://foreign.test/${id}`;page.emit('request',{id,url,type:'XHR',frameId:'main',timestamp:performance.now()/1000});
  page.emit('response',{id,url,status:200,size:5,headers:{'content-type':'application/json',...(allowed?{'timing-allow-origin':'*'}:{})},timestamp:performance.now()/1000});
 }
 const opaque=w.performance.getEntriesByName('http://foreign.test/opaque')[0],allowed=w.performance.getEntriesByName('http://foreign.test/allowed')[0];
 assert.equal(opaque.responseStatus,0);assert.equal(opaque.decodedBodySize,0);assert.equal(opaque.contentType,'');assert.equal(opaque.requestStart,0);
 assert.equal(allowed.responseStatus,200);assert.equal(allowed.decodedBodySize,5);assert.equal(allowed.initiatorType,'xmlhttprequest');
});

test('failed actual fetches record their observed start/end with unavailable response metadata',async t=>{
 const{window:w,page}=fixture(t);const url='http://127.0.0.1:1/unreachable';
 page.emit('request',{id:'failed',url,type:'Fetch',frameId:'main',timestamp:performance.now()/1000});
 try{await fetch(url);}catch(error){page.emit('requestFailed',{id:'failed',message:error.message,timestamp:performance.now()/1000});}
 const entry=w.performance.getEntriesByName(url)[0];assert.ok(entry instanceof w.PerformanceResourceTiming);
 assert.equal(entry.responseStatus,0);assert.equal(entry.requestStart,0);assert.equal(entry.responseStart,0);assert.equal(entry.decodedBodySize,0);
 assert.equal(entry.responseEnd>=entry.startTime,true);assert.equal(entry.duration,entry.responseEnd-entry.startTime);
});

test('resource buffer limits preserve observer delivery and trusted overflow can make room for actual entries',async t=>{
 const{window:w,page}=fixture(t);const delivered=[],events=[];
 const observer=new w.PerformanceObserver(list=>delivered.push(...list.getEntries()));observer.observe({type:'resource'});
 w.performance.setResourceTimingBufferSize(0);w.performance.onresourcetimingbufferfull=event=>{events.push(event);w.performance.setResourceTimingBufferSize(1);};
 const url='http://127.0.0.1/resource';page.emit('request',{id:'resource',url,type:'Script',frameId:'main',timestamp:performance.now()/1000});
 page.emit('response',{id:'resource',url,status:200,size:5,headers:{},timestamp:performance.now()/1000});await sleep(20);
 assert.equal(delivered.length,1);assert.equal(w.performance.getEntriesByType('resource').length,1);
 assert.equal(events.length,1);assert.equal(events[0].isTrusted,true);assert.equal(events[0].bubbles,false);assert.equal(events[0].target,w.performance);
 w.performance.clearResourceTimings();assert.equal(w.performance.getEntriesByType('resource').length,0);observer.disconnect();
});

test('persistent Page tracker captures real navigation before replacement realm parsing and updates lifecycle timing',async t=>{
 const server=http.createServer((request,response)=>{const html='<script>window.parsingEntry=performance.getEntriesByType("navigation")[0];window.parsingDuration=window.parsingEntry.duration;</script><p>page</p>';
  response.writeHead(200,{'content-type':'text/html','content-length':Buffer.byteLength(html)});response.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const url=`http://127.0.0.1:${server.address().port}/`,initial=fixture(t,url),page=initial.page;page.loaderId='navigation-loader';
 page.emit('request',{id:page.loaderId,loaderId:page.loaderId,url,type:'Document',method:'GET',frameId:'main',timestamp:performance.now()/1000});
 const response=await fetch(url),html=await response.text();page.emit('response',{id:page.loaderId,url,status:response.status,size:Buffer.byteLength(html),headers:Object.fromEntries(response.headers),type:'Document',frameId:'main',timestamp:performance.now()/1000});
 page.documentAbort.abort();page.documentAbort=new AbortController();page.url=url;
 let controller;const dom=new JSDOM(html,{url,runScripts:'dangerously',beforeParse(window){controller=installPerformance(page,window);}});
 t.after(()=>{controller.dispose();dom.window.close();});await sleep(20);
 const w=dom.window,entry=w.performance.getEntriesByType('navigation')[0];
 assert.ok(entry instanceof w.PerformanceNavigationTiming);assert.ok(entry instanceof w.PerformanceResourceTiming);assert.equal(w.parsingEntry,entry);
 assert.equal(w.parsingDuration,0);assert.equal(entry.startTime,0);assert.equal(entry.name,url);assert.equal(entry.responseStatus,200);assert.equal(entry.decodedBodySize,Buffer.byteLength(html));
 assert.ok(entry.responseEnd<=entry.domInteractive);assert.ok(entry.domInteractive<=entry.domContentLoadedEventStart);assert.ok(entry.domContentLoadedEventStart<=entry.domContentLoadedEventEnd);
 assert.ok(entry.loadEventStart<=entry.loadEventEnd);assert.ok(entry.loadEventEnd>0);assert.equal(entry.duration,entry.loadEventEnd);
 assert.equal(w.performance.timing.navigationStart,0);assert.equal(w.performance.timing.responseEnd,entry.responseEnd);assert.equal(w.performance.navigation.redirectCount,0);
 assert.equal(page.listenerCount('request'),1);page.emit('close');assert.equal(page.listenerCount('request'),0);
});

test('root transport tracker filters child subresources and exposes iframe navigation to its direct parent',t=>{
 const parent=fixture(t),root=parent.page;
 const child=Object.assign(new EventEmitter(),{registry:{page:root},frameId:'child',parentFrameId:'main',loaderId:'child-loader',documentAbort:new AbortController()});
 root.frames={findFrame:id=>id==='child'?child:undefined};
 const url='http://127.0.0.1/child';
 root.emit('request',{id:child.loaderId,loaderId:child.loaderId,url,type:'Document',frameId:'child',timestamp:performance.now()/1000});
 root.emit('response',{id:child.loaderId,url,status:200,size:5,headers:{'content-type':'text/html'},frameId:'child',timestamp:performance.now()/1000});
 const dom=new JSDOM('',{url,runScripts:'outside-only'}),controller=installPerformance(child,dom.window);
 t.after(()=>{controller.dispose();child.emit('close');dom.window.close();});
 assert.equal(parent.window.performance.getEntriesByName(url,'resource')[0].initiatorType,'iframe');
 assert.equal(dom.window.performance.getEntriesByName(url,'navigation').length,1);
 const script='http://127.0.0.1/child-script.js';
 root.emit('request',{id:'child-script',url:script,type:'Script',frameId:'child',timestamp:performance.now()/1000});
 root.emit('response',{id:'child-script',url:script,status:200,size:7,headers:{'content-type':'text/javascript'},frameId:'child',timestamp:performance.now()/1000});
 assert.equal(parent.window.performance.getEntriesByName(script).length,0);assert.equal(dom.window.performance.getEntriesByName(script,'resource').length,1);
 assert.equal(root.listenerCount('request'),1);
});

test('direct window.close cancels pending performance records before later Page abort/close',async t=>{
 const{window:w,page,controller}=fixture(t),document=w.document,performance=w.performance;
 let callbacks=0;const observer=new w.PerformanceObserver(()=>callbacks++);observer.observe({type:'mark'});performance.mark('pending');
 assert.doesNotThrow(()=>w.close());assert.equal(w.document,undefined);assert.equal(observer.takeRecords().length,0);
 assert.equal(getEventListeners(page.documentAbort.signal,'abort').length,0);
 // The request tracker intentionally survives document disposal until Page
 // close; it has no subscriber for the closed document.
 assert.equal(page.listenerCount('close'),1);
 assert.doesNotThrow(()=>document.dispatchEvent(new w.Event('DOMContentLoaded')));
 assert.doesNotThrow(()=>controller.dispose());assert.doesNotThrow(()=>page.documentAbort.abort());assert.doesNotThrow(()=>page.emit('close'));
 await sleep(20);assert.equal(callbacks,0);assert.equal(page.eventNames().length,0);
});

test('a captured raw window close cannot leave an observer subscription accessing a deleted document',async t=>{
 const dom=new JSDOM('',{url:'http://127.0.0.1/',runScripts:'outside-only'}),w=dom.window,rawClose=w.close;
 const page=Object.assign(new EventEmitter(),{frameId:'main',documentAbort:new AbortController()});
 const controller=installPerformance(page,w);t.after(()=>{controller.dispose();page.emit('close');});
 let callbacks=0;const observer=new w.PerformanceObserver(()=>callbacks++);observer.observe({type:'mark'});w.performance.mark('pending');
 rawClose.call(w);
 assert.doesNotThrow(()=>page.emit('request',{id:'after-close',url:'http://127.0.0.1/resource',type:'Fetch',frameId:'main',timestamp:performance.now()/1000}));
 assert.doesNotThrow(()=>page.emit('response',{id:'after-close',url:'http://127.0.0.1/resource',status:200,size:1,headers:{},timestamp:performance.now()/1000}));
 assert.equal(observer.takeRecords().length,0);assert.equal(getEventListeners(page.documentAbort.signal,'abort').length,0);
 assert.doesNotThrow(()=>page.documentAbort.abort());assert.doesNotThrow(()=>page.emit('close'));await sleep(20);
 assert.equal(callbacks,0);assert.equal(page.eventNames().length,0);
});
