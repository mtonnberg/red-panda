import test from 'node:test';
import assert from 'node:assert/strict';
import {Browser}from'../src/browser.js';
import{queryHeapObjects}from'../src/heap-query.js';
test('actual heap keeps public animations and authored records without private VM slots or factory tables',async t=>{
 const browser=new Browser({timeout:10000});t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body>privacy</body>');const w=page.dom.window,context=page.dom.getInternalVMContext();
 await page.evaluate(`globalThis.animationForHeap=document.createElement('div').animate();animationForHeap.pause();globalThis.authoredState={value:animationForHeap,playState:'paused',finished:animationForHeap.finished};globalThis.authoredFactoryTable={Animation,AnimationPlaybackEvent};true`);
 const objects=queryHeapObjects(w.Object.prototype,context).objects,own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
 assert.ok(objects.includes(w.authoredState));assert.ok(objects.includes(w.authoredFactoryTable));
 assert.deepEqual([...objects.filter(value=>own(value,'value')===w.animationForHeap&&own(value,'playState')==='paused'&&own(value,'finished')===w.authoredState.finished)],[w.authoredState]);
 assert.deepEqual([...objects.filter(value=>{const a=Object.getOwnPropertyDescriptor(value,'Animation'),e=Object.getOwnPropertyDescriptor(value,'AnimationPlaybackEvent');return a?.enumerable&&e?.enumerable&&a.value===w.Animation&&e.value===w.AnimationPlaybackEvent})],[w.authoredFactoryTable]);
 const animations=queryHeapObjects(w.Animation.prototype,context).objects;assert.ok(animations instanceof w.Array);assert.ok(animations.includes(w.animationForHeap));w.animationForHeap.cancel();
});
