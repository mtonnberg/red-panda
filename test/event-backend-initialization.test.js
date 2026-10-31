import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
// Capture the exact legacy function before private Event installation, just as
// early imported producers did in the phase18 regressions.
const legacy=utils.implForWrapper;
const {implementationForWrapper,eventImplementation}=await import('../src/dom-event-state.js');
const {installPlatformFactoryHooks}=await import('../src/platform-factory-hooks.js');
const {getHeapBinding}=await import('../src/native-heap.js');
installPlatformFactoryHooks();
const binding=getHeapBinding();
function realm(value,anchor){const prototype=Object.getPrototypeOf(value);try{assert.equal(binding.sameRealm(value,anchor),true);Object.setPrototypeOf(value,null);assert.equal(binding.sameRealm(value,anchor),true);}finally{Object.setPrototypeOf(value,prototype);}}
test('no-runScripts Window keeps its real Host Event/getter origin and private backing',t=>{const dom=new JSDOM('<body>actual Host'),w=dom.window;t.after(()=>w.close());const event=new w.Event('owned'),getter=Object.getOwnPropertyDescriptor(event,'isTrusted').get;assert.equal(Object.getPrototypeOf(w.Object.prototype),null);assert.strictEqual(w.Object,Object);realm(event,[]);realm(getter,[]);assert.equal(event.isTrusted,false);assert.equal(event instanceof w.Event,true);assert.deepEqual(Reflect.ownKeys(event),['isTrusted']);assert.throws(()=>getter.call({}),e=>e instanceof w.TypeError);assert.strictEqual(implementationForWrapper(event),eventImplementation(event));});
test('stable lookup survives a genuinely captured old symbol reader without changing nonEvent identity',t=>{const dom=new JSDOM('<body>'),w=dom.window;t.after(()=>w.close());const event=new w.Event('owned'),backend=eventImplementation(event),node=w.document.createElement('div');assert.equal(legacy(event),undefined);assert.strictEqual(implementationForWrapper(event),backend);assert.strictEqual(implementationForWrapper(node),legacy(node));backend.isTrusted=true;let actual;node.addEventListener('owned',e=>actual=e);assert.equal(implementationForWrapper(node)._dispatch(backend),true);assert.strictEqual(actual,event);assert.equal(actual.isTrusted,true);const fake={};Object.defineProperty(fake,utils.implSymbol,{value:backend});assert.equal(implementationForWrapper(fake),null);assert.equal(implementationForWrapper(Object.create(event)),undefined);});
test('actual VM Event getters retain VM origin and error realm while using the same private-first lookup',t=>{const dom=new JSDOM('<body>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());const event=new w.Event('owned'),getter=Object.getOwnPropertyDescriptor(event,'isTrusted').get,anchor=w.eval('[]');realm(event,anchor);realm(getter,anchor);assert.equal(binding.sameRealm(getter,[]),false);assert.throws(()=>getter.call({}),e=>e instanceof w.TypeError);assert.equal(legacy(event),undefined);assert.strictEqual(implementationForWrapper(event),eventImplementation(event));assert.deepEqual(Reflect.ownKeys(event),['isTrusted']);});
