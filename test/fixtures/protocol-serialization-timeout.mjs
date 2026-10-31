import assert from 'node:assert/strict';
import {Browser} from '../../src/browser.js';
import {ProtocolSerializer} from '../../src/protocol-serialization.js';
import {invocationBindingFor} from '../../src/invocation.js';
import {queryHeapObjects} from '../../src/heap-query.js';

const browser=new Browser({timeout:50}),page=browser.createPage(),serializer=new ProtocolSerializer();
try{
 const value=page.evaluate('({get slow(){globalThis.enteredGetter=true;for(;;){}}})');
 assert.throws(()=>serializer.serialize(value,page),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 assert.equal(page.evaluate('enteredGetter'),true);
 assert.equal(serializer.pending.size,0);assert.equal(serializer.records.size,0);
 assert.deepEqual(serializer.serialize(page.evaluate('({marker:42})'),page).value,{marker:42});

 // A deadline in an ancestor VM can skip finally blocks in a host callback.
 // The independently scheduled host checkpoint must clean those abandoned
 // frames and inspector operations without canceling unrelated host tasks.
 page.dom.window.enterSerialization=()=>{page.timeout=500;return serializer.serialize(value,page)};
 let unrelated=0;setImmediate(()=>unrelated++);
 assert.throws(()=>page.evaluate('enteredGetter=false;enterSerialization()'),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 assert.equal(page.evaluate('enteredGetter'),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(serializer.pending.size,0);assert.equal(serializer.records.size,0);assert.equal(unrelated,1);
 page.timeout=50;
 const binding=invocationBindingFor(page.dom.getInternalVMContext());
 assert.throws(()=>page.evaluate(`${binding}.run()`),/No owned invocation frame/);
 assert.deepEqual(serializer.serialize(page.evaluate('({marker:43})'),page).value,{marker:43});
 // A getter can enter a regular owned invocation before the ancestor deadline.
 // Recovery must discard that actual descendant frame as well.
 page.dom.window.enterGeneric=()=>page.callFunction('function(){globalThis.enteredGeneric=true;for(;;){}}',null,[]);
 const nested=page.evaluate('({get slow(){return enterGeneric()}})');
 page.dom.window.enterNestedSerialization=()=>{page.timeout=500;return serializer.serialize(nested,page)};
 assert.throws(()=>page.evaluate('enterNestedSerialization()'),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.evaluate('enteredGeneric'),true);assert.equal(serializer.pending.size,0);assert.equal(serializer.records.size,0);
 assert.throws(()=>page.evaluate(`${binding}.run()`),/No owned invocation frame/);
 page.timeout=50;
 assert.deepEqual(serializer.serialize(page.evaluate('({marker:44})'),page).value,{marker:44});
 page.evaluate('globalThis.P={};globalThis.item=Object.create(P)');
 const objects=queryHeapObjects(page.dom.window.P,page.dom.getInternalVMContext()).objects;
 assert.equal(objects.length,1);assert.equal(objects[0],page.dom.window.item);
 assert.equal(page.callFunction('function(){return 42}',null,[]),42);
 page.close();assert.equal(serializer.records.size,0);assert.equal(serializer.pending.size,0);
}finally{serializer.close();browser.close()}
await new Promise(resolve=>setTimeout(resolve,20));
console.log('Serialization timeout recovery verified');
