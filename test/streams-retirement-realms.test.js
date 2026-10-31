import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
import {installFetch} from '../src/fetch.js';
import {installStreams} from '../src/streams.js';
import {getHeapBinding} from '../src/native-heap.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
import {domExceptionRecord} from '../src/worker-dom-exception.js';

const poison=`
globalThis.retirementHits=0;
const OriginalError=Error,OriginalArray=Array,OriginalException=DOMException;
for(const key of ['0','constructor',Symbol.toStringTag])Object.defineProperty(OriginalArray.prototype,key,{configurable:true,...(key==='0'?{set(){retirementHits++;throw new OriginalError('index')}}:{get(){retirementHits++;throw new OriginalError(String(key))}})});
Object.defineProperty(OriginalException.prototype,'constructor',{configurable:true,get(){retirementHits++;throw new OriginalError('exception constructor')}});
globalThis.Array=new Proxy(function(){},{construct(){retirementHits++;throw new OriginalError('global Array')}});
globalThis.DOMException=new Proxy(function(){},{construct(){retirementHits++;throw new OriginalError('global DOMException')}});
globalThis.Error=new Proxy(function(){},{construct(){retirementHits++;throw new OriginalError('global Error')}});
`;

test('utility stream retirement bypasses authored Array/global constructors and keeps a real selected-VM AbortError/backend',async t=>{
 const browser=new Browser(),page=browser.createPage(),main=page.dom.window,world=createIsolatedWorld(main,{signal:page.documentAbort.signal});
 t.after(()=>{world.dispose();browser.close()});
 installFetch(page,world.global,{mainWindow:main,evaluate:source=>world.evaluate(source)});
 const controller=installStreams(page,world.global),anchor=world.global.Object;
 world.evaluate(`globalThis.sourceReason=undefined;globalThis.sinkReason=undefined;globalThis.sourceCancels=0;globalThis.sinkAborts=0;
 const source=new ReadableStream({cancel(reason){sourceCancels++;sourceReason=reason}});globalThis.retirementReader=source.getReader();globalThis.retirementRead=retirementReader.read();retirementRead.catch(()=>{});
 globalThis.retirementWriter=new WritableStream({abort(reason){sinkAborts++;sinkReason=reason}}).getWriter();`);
 const pending=world.global.retirementRead;
 world.evaluate(poison);
 page.documentAbort.abort();
 let reason;await assert.rejects(pending,error=>{reason=error;return error.name==='AbortError'});
 await Promise.resolve();await Promise.resolve();
 assert.equal(controller.disposed,true);assert.equal(world.global.retirementHits,0);
 assert.equal(world.global.sourceCancels,1);assert.equal(world.global.sinkAborts,1);
 assert.equal(world.global.sourceReason,reason);assert.equal(world.global.sinkReason,reason);
 assert.deepEqual(domExceptionRecord(reason),{kind:'DOMException',name:'AbortError',message:'The stream realm is disposed'});
 assert.equal(reason.code,20);assert.equal(Object.hasOwn(reason,'constructor'),false);assert.equal(Object.hasOwn(reason,'stack'),false);
 const record=platformFactoryRecord(reason);assert.equal(record.kind,'DOMException');assert.equal(record.implementation.name,'AbortError');assert.equal(record.implementation.message,'The stream realm is disposed');
 const heap=getHeapBinding();assert.equal(heap.sameRealm(record.implementation,{}),true);
 assert.equal(heap.sameRealm(reason,anchor),true);assert.equal(heap.sameRealm(reason,{}),false);
 const prototype=Object.getPrototypeOf(reason);Object.setPrototypeOf(reason,null);
 try{assert.equal(heap.sameRealm(reason,anchor),true);assert.equal(heap.sameRealm(reason,{}),false)}finally{Object.setPrototypeOf(reason,prototype)}
});

test('an explicit authored disposal reason retains exact identity without creating an internal exception',async t=>{
 const browser=new Browser(),page=browser.createPage(),main=page.dom.window,world=createIsolatedWorld(main,{signal:page.documentAbort.signal});
 t.after(()=>{world.dispose();browser.close()});
 installFetch(page,world.global,{mainWindow:main,evaluate:source=>world.evaluate(source)});
 const controller=installStreams(page,world.global);world.evaluate('globalThis.marker={actual:"authored reason"};globalThis.pendingRead=new ReadableStream().getReader().read();pendingRead.catch(()=>{})');
 const pending=world.global.pendingRead,marker=world.global.marker;world.evaluate(poison);
 controller.dispose(marker);await assert.rejects(pending,error=>error===marker);assert.equal(world.global.retirementHits,0);
});

test('a stream-only VM without DOMException retains its captured actual Error fallback after public replacement',async()=>{
 const context=vm.createContext({}),global=vm.runInContext('globalThis',context),anchor=global.Object,controller=installStreams(null,global);
 const pending=vm.runInContext('globalThis.pendingRead=new ReadableStream().getReader().read();pendingRead.catch(()=>{});pendingRead',context);
 vm.runInContext('globalThis.errorHits=0;globalThis.Error=new Proxy(function(){},{construct(){errorHits++;throw 1}})',context);
 controller.dispose();let reason;await assert.rejects(pending,error=>{reason=error;return error.message==='The stream realm is disposed'});
 assert.equal(global.errorHits,0);assert.equal(getHeapBinding().sameRealm(reason,anchor),true);assert.equal(getHeapBinding().sameRealm(reason,{}),false);
});
