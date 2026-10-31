import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,getEventListeners} from 'node:events';
import {JSDOM} from 'jsdom';
import {installLayout} from '../src/layout.js';
import {installStyles} from '../src/styles.js';
import {installResizeObserver} from '../src/resize-observer.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){const end=Date.now()+1500;while(!check()){if(Date.now()>end)throw new Error('Resize observation deadline');await sleep(5);}}
function fixture(t,html='<div id="target" style="width:100px;height:60px"></div>'){
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});
  const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});
  installStyles(page,dom.window);const styleAbort=new Set(getEventListeners(page.documentAbort.signal,'abort')),layout=installLayout(page,dom.window);
  const layoutAbort=getEventListeners(page.documentAbort.signal,'abort').filter(listener=>!styleAbort.has(listener)),beforeResize=new Set(getEventListeners(page.documentAbort.signal,'abort'));
  const controller=installResizeObserver(page,dom.window,layout),resizeAbort=getEventListeners(page.documentAbort.signal,'abort').filter(listener=>!beforeResize.has(listener));
  t.after(()=>{page.documentAbort.abort();dom.window.close();});
  return{dom,page,window:dom.window,layout,controller,layoutAbort,resizeAbort,target:dom.window.document.getElementById('target')};
}

test('resize entries use actual layout, realm arrays/read-only interfaces and native content-box profile',async t=>{
  const{window:w,target}=fixture(t);const received=[];let callbackThis,callbackObserver;
  const observer=new w.ResizeObserver(function(batch,source){received.push(...batch);callbackThis=this;callbackObserver=source;});
  observer.observe(target,{box:'border-box'});await Promise.resolve();
  assert.equal(received.length,1);const entry=received[0];
  assert.equal(callbackThis,observer);assert.equal(callbackObserver,observer);
  assert.ok(entry instanceof w.ResizeObserverEntry);assert.ok(entry.contentRect instanceof w.DOMRectReadOnly);
  assert.ok(entry.contentBoxSize instanceof w.Array);assert.ok(entry.contentBoxSize[0] instanceof w.ResizeObserverSize);
  assert.equal(Object.getPrototypeOf(entry.contentBoxSize),w.Array.prototype);assert.deepEqual(Object.keys(entry),[]);
  assert.equal(entry.target,target);assert.equal(entry.contentRect.x,0);assert.equal(entry.contentRect.y,0);
  for(const name of ['contentBoxSize','borderBoxSize','devicePixelContentBoxSize'])assert.equal(entry[name][0].inlineSize,100);
  assert.equal(entry.contentBoxSize[0].blockSize,60);assert.equal(Reflect.set(entry,'target',null),false);
  assert.equal(Object.isFrozen(entry.contentBoxSize),false);observer.disconnect();
});

test('resize changes deliver only changed dimensions and DOM removal delivers a real zero box',async t=>{
  const{window:w,target}=fixture(t);const sizes=[];
  const observer=new w.ResizeObserver(batch=>sizes.push(batch[0].contentRect.width));observer.observe(target);
  await until(()=>sizes.length===1);target.style.width='25px';await until(()=>sizes.length===2);
  target.style.color='red';await sleep(30);assert.deepEqual(sizes,[100,25]);
  target.remove();await until(()=>sizes.length===3);assert.deepEqual(sizes,[100,25,0]);observer.disconnect();
});

test('initial hidden/detached targets are silent and adoption/visibility changes start observation',async t=>{
  const{window:w,target}=fixture(t);target.style.display='none';const values=[];
  const detached=w.document.createElement('div');detached.style.width='40px';
  const observer=new w.ResizeObserver(batch=>values.push(...batch));observer.observe(target);observer.observe(detached);
  await sleep(25);assert.equal(values.length,0);
  target.style.display='block';w.document.body.append(detached);await until(()=>values.length===2);
  assert.deepEqual(values.map(entry=>entry.contentRect.width),[100,40]);observer.disconnect();
});

test('CSSOM and viewport changes are sampled from current layout without fabricated notifications',async t=>{
  const{window:w,target,layout}=fixture(t,'<style>#target{width:10px;height:5px}</style><div id="target"></div>');
  const values=[];const observer=new w.ResizeObserver(batch=>values.push(batch[0].contentRect.width));observer.observe(target);
  await until(()=>values.length===1);w.document.styleSheets[0].cssRules[0].style.width='30px';await until(()=>values.length===2);
  assert.deepEqual(values,[10,30]);observer.disconnect();
  const rootValues=[];const rootObserver=new w.ResizeObserver(batch=>rootValues.push(batch[0].contentRect.width));rootObserver.observe(w.document.documentElement);
  await until(()=>rootValues.length===1);layout.setViewport({width:320});await until(()=>rootValues.length===2);
  assert.deepEqual(rootValues,[1920,320]);rootObserver.disconnect();
});

test('registration order, duplicate observe, unobserve and disconnect during delivery retain real membership',async t=>{
  const{window:w,target}=fixture(t);const order=[];let third;
  const first=new w.ResizeObserver(()=>{order.push('first');third.disconnect();});
  const second=new w.ResizeObserver(batch=>{assert.equal(batch.length,1);order.push('second');});
  third=new w.ResizeObserver(()=>order.push('third'));
  first.observe(target);second.observe(target);second.observe(target);third.observe(target);
  await until(()=>order.length===2);assert.deepEqual(order,['first','second']);first.disconnect();second.unobserve(target);
  target.style.width='20px';await sleep(30);assert.equal(order.length,2);
});

test('callback errors use installed reportError and do not stop later observers',async t=>{
  const{window:w,target}=fixture(t);const errors=[],calls=[];w.reportError=error=>errors.push(error);
  const first=new w.ResizeObserver(()=>{calls.push(1);throw new w.Error('observer-error');});
  const second=new w.ResizeObserver(()=>calls.push(2));first.observe(target);second.observe(target);
  await until(()=>calls.length===2);assert.deepEqual(calls,[1,2]);assert.equal(errors.length,1);assert.equal(errors[0].message,'observer-error');
  first.disconnect();second.disconnect();
});

test('abort cancels queued deliveries and methods/constructors enforce their realm brands',async t=>{
  const{window:w,page,target,controller,layout}=fixture(t);let count=0;
  assert.equal(installResizeObserver(page,w,layout),controller);
  assert.throws(()=>new w.ResizeObserver(),error=>error instanceof w.TypeError);
  assert.throws(()=>new w.ResizeObserverEntry(),error=>error instanceof w.TypeError);
  assert.throws(()=>new w.ResizeObserverSize(),error=>error instanceof w.TypeError);
  assert.throws(()=>w.ResizeObserver.prototype.observe.call({},target),error=>error instanceof w.TypeError);
  const observer=new w.ResizeObserver(()=>count++);assert.throws(()=>observer.observe({}),error=>error instanceof w.TypeError);
  observer.observe(target);page.documentAbort.abort();await sleep(30);assert.equal(count,0);
});

test('direct window.close stops pending resize callbacks and detaches before later Page teardown',async t=>{
 const{window:w,page,target,controller,layoutAbort,resizeAbort}=fixture(t),document=w.document;let callbacks=0,unrelatedCalls=0;const unrelated=()=>unrelatedCalls++;page.documentAbort.signal.addEventListener('abort',unrelated,{once:true});
 const observer=new w.ResizeObserver(()=>callbacks++);observer.observe(target);
 assert.doesNotThrow(()=>w.close());assert.equal(w.document,undefined);
 assert.equal(resizeAbort.length,1);for(const listener of resizeAbort)assert.equal(getEventListeners(page.documentAbort.signal,'abort').includes(listener),false);assert.deepEqual(new Set(getEventListeners(page.documentAbort.signal,'abort')),new Set([...layoutAbort,unrelated]));assert.equal(page.listenerCount('close'),0);
 target.style.width='40px';assert.doesNotThrow(()=>document.dispatchEvent(new w.Event('load')));
 assert.doesNotThrow(()=>controller.dispose());assert.doesNotThrow(()=>page.documentAbort.abort());assert.equal(unrelatedCalls,1);assert.equal(getEventListeners(page.documentAbort.signal,'abort').length,0);assert.doesNotThrow(()=>page.emit('close'));
 await sleep(30);assert.equal(callbacks,0);
});

test('raw window close before queued resize delivery avoids reading the deleted window document',async t=>{
 const dom=new JSDOM('<div style="width:100px;height:20px"></div>',{runScripts:'outside-only'}),w=dom.window,rawClose=w.close;
 const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});
 const layout=installLayout(page,w),baseline=getEventListeners(page.documentAbort.signal,'abort'),beforeResize=new Set(baseline),controller=installResizeObserver(page,w,layout),resizeAbort=getEventListeners(page.documentAbort.signal,'abort').filter(listener=>!beforeResize.has(listener));t.after(()=>{controller.dispose();dom.window.close();});
 let callbacks=0;const observer=new w.ResizeObserver(()=>callbacks++);observer.observe(w.document.querySelector('div'));
 rawClose.call(w);await Promise.resolve();
 assert.equal(resizeAbort.length,1);for(const listener of resizeAbort)assert.equal(getEventListeners(page.documentAbort.signal,'abort').includes(listener),false);assert.deepEqual(new Set(getEventListeners(page.documentAbort.signal,'abort')),new Set(baseline));assert.equal(page.listenerCount('close'),0);
 assert.doesNotThrow(()=>page.documentAbort.abort());assert.equal(getEventListeners(page.documentAbort.signal,'abort').length,0);assert.doesNotThrow(()=>page.emit('close'));await sleep(20);assert.equal(callbacks,0);
});
