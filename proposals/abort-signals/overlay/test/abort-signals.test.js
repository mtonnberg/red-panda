import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {Browser} from '../src/browser.js';
import {installAbortSignals} from '../src/abort-signals.js';

async function fixture(action) {
  const requests=[],aborted=[];
  const server=http.createServer((req,res)=>{
    requests.push(req.url);
    if(req.url==='/slow'){
      res.on('close',()=>{if(!res.writableEnded)aborted.push(req.url)});
      const timer=setTimeout(()=>{if(!res.destroyed)res.end('late')},250);timer.unref();return;
    }
    if(req.url==='/') {res.setHeader('content-type','text/html');res.end('<!doctype html><body><button>click</button>');return;}
    res.end('real bytes');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`,browser=new Browser({timeout:1500,loadResources:['iframe','worker']}),page=browser.createPage();
  try {await page.navigate(origin);await action({browser,page,window:page.dom.window,requests,aborted,origin});}
  finally {browser.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});}
}

test('genuine realm signals produce trusted abort events and exact default reason once',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),s=c.signal,events=[];assert.equal(s instanceof w.AbortSignal,true);assert.equal(s instanceof w.EventTarget,true);assert.equal(c instanceof w.Object,true);assert.equal(s instanceof w.Object,true);assert.equal(s,c.signal);assert.equal(s.reason,undefined);assert.equal(s.aborted,false);
 s.addEventListener('abort',e=>events.push(e));c.abort();c.abort('second');assert.equal(events.length,1);assert.equal(events[0] instanceof w.Event,true);assert.equal(events[0].isTrusted,true);assert.equal(events[0].target,s);assert.equal(events[0].bubbles,false);assert.equal(events[0].cancelable,false);assert.equal(s.reason instanceof w.DOMException,true);assert.equal(s.reason.message,'signal is aborted without reason');assert.equal(s.reason.name,'AbortError');assert.throws(()=>s.throwIfAborted(),e=>e===s.reason);
 assert.equal(w.AbortSignal.abort().reason.message,'signal is aborted without reason');assert.equal(w.AbortSignal.abort(null).reason,null);assert.throws(()=>w.AbortController.prototype.abort.call({}),w.TypeError);assert.throws(()=>w.AbortSignal.prototype.throwIfAborted.call({}),w.TypeError);
}));

test('abort exceptions dispatch real cancelable Window errors and do not skip source or dependents',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),a=w.AbortSignal.any([c.signal]),b=w.AbortSignal.any([a]),reason={},error=new w.DOMException('nope','SyntaxError'),log=[];
 w.addEventListener('error',e=>{assert.equal(e.error,error);assert.equal(e instanceof w.ErrorEvent,true);assert.equal(e.cancelable,true);assert.equal(e.isTrusted,true);log.push('error');e.preventDefault()});
 c.signal.addEventListener('abort',()=>{log.push('source');assert.equal(a.aborted,true);assert.equal(b.aborted,true);throw error});c.signal.addEventListener('abort',()=>log.push('source2'));a.onabort=()=>log.push('a');b.onabort=()=>log.push('b');c.abort(reason);
 assert.deepEqual(log,['source','error','source2','a','b']);assert.equal(a.reason,reason);assert.equal(b.reason,reason);
}));

test('timeout listener failure remains in the Window and every dependent signal aborts',()=>fixture(async({window:w})=>{
 const errors=[],s=w.AbortSignal.timeout(1);let dependents=0;
 w.addEventListener('error',e=>{errors.push(e);e.preventDefault()});for(let i=0;i<3;i++)w.AbortSignal.any([s]).addEventListener('abort',()=>dependents++);s.addEventListener('abort',()=>{throw new w.DOMException('nope','SyntaxError')});await delay(30);
 assert.equal(errors.length,1);assert.equal(dependents,3);assert.equal(s.reason instanceof w.DOMException,true);assert.equal(s.reason.name,'TimeoutError');assert.equal(s.reason.message,'signal timed out');assert.equal(s.reason.code,23);
}));

test('timeout EnforceRange accepts safe integers/coercion and never wraps a huge delay',()=>fixture(async({window:w})=>{
 for(const n of [-1,NaN,Infinity,2**53,1n,Symbol()])assert.throws(()=>w.AbortSignal.timeout(n),w.TypeError);assert.throws(()=>w.AbortSignal.timeout(),w.TypeError);
 const huge=w.AbortSignal.timeout(2**53-1),tiny=w.AbortSignal.timeout(-.5);assert.equal(huge.aborted,false);await delay(20);assert.equal(huge.aborted,false);assert.equal(tiny.aborted,true);
}));

test('any consumes real iterables and snapshots first reason while validating every member',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),s=w.AbortSignal.any(new w.Set([c.signal])),reason={};c.abort(reason);assert.equal(s.reason,reason);assert.equal(w.AbortSignal.any([]).aborted,false);assert.equal(w.AbortSignal.any([w.AbortSignal.abort('one'),w.AbortSignal.abort('two')]).reason,'one');for(const bad of [undefined,{},c.signal,[{}],[w.AbortSignal.abort(),{}]])assert.throws(()=>w.AbortSignal.any(bad),w.TypeError);
}));

test('signal-backed genuine DOM listeners are removed by actual abort algorithms',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),target=new w.EventTarget();let n=0;c.signal.addEventListener('abort',e=>e.stopImmediatePropagation());target.addEventListener('x',()=>n++,{signal:c.signal});target.dispatchEvent(new w.Event('x'));c.abort();target.dispatchEvent(new w.Event('x'));assert.equal(n,1);target.addEventListener('x',()=>n++,{signal:c.signal});target.dispatchEvent(new w.Event('x'));assert.equal(n,1);assert.throws(()=>target.addEventListener('x',()=>{},{signal:{aborted:false}}),w.TypeError);
}));

test('Request stores nullable original genuine signal and keeps clone/copy identity and brands',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),r=new w.Request('/bytes',{signal:c.signal});assert.equal(new w.Request('/').signal,null);assert.equal(r.signal,c.signal);assert.equal(r.clone().signal,c.signal);assert.equal(new w.Request(r).signal,c.signal);assert.equal(new w.Request(r,{signal:null}).signal,c.signal);assert.equal(new w.Request(r,{signal:undefined}).signal,c.signal);assert.equal(r.signal instanceof w.AbortSignal,true);assert.equal(r.signal instanceof w.EventTarget,true);assert.throws(()=>new w.Request('/',{signal:{aborted:false,addEventListener(){}}}),w.TypeError);assert.throws(()=>Object.getOwnPropertyDescriptor(w.Request.prototype,'signal').get.call({}),w.TypeError);
 const proto=Object.create(null,{signal:{get(){return c.signal}}});assert.equal(new w.Request('/',proto).signal,c.signal);
}));

test('cross-frame signals retain their own realm and work in parent Request/any/DOM listeners',()=>fixture(async({window:w})=>{
 const f=w.document.createElement('iframe');w.document.body.append(f);const child=f.contentWindow,c=new child.AbortController(),s=w.AbortSignal.any([c.signal]);assert.equal(c.signal instanceof w.AbortSignal,false);assert.equal(c.signal instanceof child.AbortSignal,true);assert.equal(new w.Request('/bytes',{signal:c.signal}).signal,c.signal);let n=0;w.document.body.addEventListener('x',()=>n++,{signal:c.signal});w.document.body.dispatchEvent(new w.Event('x'));c.abort('child');w.document.body.dispatchEvent(new w.Event('x'));assert.equal(n,1);assert.equal(s.reason,'child');f.remove();
}));

test('real in-flight HTTP fetch is canceled despite authored stopImmediatePropagation or public getter overrides',()=>fixture(async({window:w,requests,aborted})=>{
 const c=new w.AbortController(),reason={cancel:'physical'};c.signal.addEventListener('abort',e=>e.stopImmediatePropagation());const pending=w.fetch('/slow',{signal:c.signal});while(!requests.includes('/slow'))await delay(2);Object.defineProperties(c.signal,{aborted:{value:false},reason:{value:'spoof'}});c.abort(reason);await assert.rejects(pending,e=>e===reason);for(let i=0;i<30&&!aborted.length;i++)await delay(2);assert.deepEqual(aborted,['/slow']);
}));

test('pre-aborted fetch preserves arbitrary reason and does not send a request',()=>fixture(async({window:w,requests})=>{
 for(const reason of ['literal',null,{},new w.DOMException('realm','AbortError')])await assert.rejects(w.fetch('/slow',{signal:w.AbortSignal.abort(reason)}),e=>e===reason);assert.equal(requests.includes('/slow'),false);
}));

test('response bytes/clones/readers reject original reason after transport abort',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),response=await w.fetch('/bytes',{signal:c.signal}),clone=response.clone(),reader=response.body.getReader(),reason={body:true};c.abort(reason);await assert.rejects(reader.read(),e=>e===reason);await assert.rejects(clone.text(),e=>e===reason);
}));

test('post-load document.open retains the real signal listener and timeout without changing realm identity',()=>fixture(async({page,window:w})=>{
 const doc=w.document,c=new w.AbortController(),signal=c.signal,timeout=w.AbortSignal.timeout(15),seen=[];
 signal.addEventListener('abort',()=>seen.push('abort'));timeout.addEventListener('abort',()=>seen.push('timeout'));
 doc.open();doc.write('<!doctype html><title>reset</title><body>new document');doc.close();c.abort('retained');await delay(40);assert.deepEqual(seen,['abort','timeout']);assert.equal(page.dom.window,w);assert.equal(w.document,doc);assert.equal(signal,c.signal);assert.equal(signal.reason,'retained');
}));

test('raw Window close cancels pending timeout jobs and actual fetch resources',()=>fixture(async({page,window:w,requests,aborted})=>{
 let n=0;w.AbortSignal.timeout(30).onabort=()=>n++;const pending=w.fetch('/slow');pending.catch(()=>{});while(!requests.includes('/slow'))await delay(2);w.close();await delay(60);assert.equal(n,0);assert.equal(page.closed,false);assert.equal(aborted.length,1);
}));

test('installer disposal is idempotent and removes timeout scheduling without changing public constructors',()=>fixture(async({page,window:w})=>{
 const api=installAbortSignals(page,w),Constructor=w.AbortSignal;let n=0;w.AbortSignal.timeout(10).onabort=()=>n++;api.dispose();api.dispose();await delay(25);assert.equal(n,0);assert.equal(w.AbortSignal,Constructor);
}));

// Supplying a signal controls the HTTP operation; it must not add a new
// aborting wrapper around the actual authored Request body producer.
test('Request body producers and buffered clone bytes survive signal abort independently of HTTP cancellation',()=>fixture(async({window:w})=>{
 const c=new w.AbortController(),r=new w.Request('/bytes',{method:'POST',body:'body',signal:c.signal}),clone=r.clone(),reader=r.body.getReader();c.abort('cancel HTTP');assert.equal(await clone.text(),'body');const chunk=await reader.read();assert.deepEqual([...chunk.value],[98,111,100,121]);
 const source=new w.ReadableStream({start(controller){controller.enqueue(new w.Uint8Array([1,2]));controller.close()}}),control=new w.AbortController(),request=new w.Request('/bytes',{method:'POST',body:source,signal:control.signal});assert.equal(request.body,source);control.abort('cancel HTTP');assert.equal(request.body,source);assert.equal(await request.text(),'\u0001\u0002');
}));

test('any converts its authored sequence once and closes iterators on invalid signal members',()=>fixture(async({window:w})=>{
 const c=new w.AbortController();let iterations=0,closed=0;const iterable={*[Symbol.iterator](){iterations++;yield c.signal;}};const result=w.AbortSignal.any(iterable);assert.equal(iterations,1);c.abort('one');assert.equal(result.reason,'one');
 const invalid={*[Symbol.iterator](){try{yield {}}finally{closed++}}};assert.throws(()=>w.AbortSignal.any(invalid),w.TypeError);assert.equal(closed,1);
}));
