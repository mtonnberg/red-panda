import test from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {queryHeapObjects} from '../src/heap-query.js';

async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body>private codec values</body>');await page.evaluate(`globalThis.ownedChunk=new EncodedVideoChunk({type:'delta',timestamp:31337,duration:19,data:new Uint8Array([2,3])});globalThis.ownedColor=new VideoColorSpace({primaries:'bt709'});globalThis.authoredSlot={interface:'EncodedVideoChunk',type:'delta',timestamp:31337,duration:19,bytes:new Uint8Array([2,3])};globalThis.authoredColor={primaries:'bt709',transfer:null,matrix:null,fullRange:null};globalThis.authorFunction=function authorFunction(){return ownedChunk};true`);return {page,w:page.dom.window,context:page.dom.getInternalVMContext()}}
const own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;

test('real heap queries retain authored metadata and never expose private WebCodecs slots',async t=>{
 const {w,context}=await fixture(t),objects=queryHeapObjects(w.Object.prototype,context).objects;
 assert.ok(objects.includes(w.authoredSlot));assert.ok(objects.includes(w.authoredColor));
 const chunks=objects.filter(value=>own(value,'interface')==='EncodedVideoChunk'&&own(value,'timestamp')===31337&&own(value,'duration')===19&&own(value,'bytes'));
 const colors=objects.filter(value=>own(value,'primaries')==='bt709'&&own(value,'transfer')===null&&own(value,'matrix')===null&&own(value,'fullRange')===null);
 assert.deepEqual([...chunks],[w.authoredSlot]);assert.deepEqual([...colors],[w.authoredColor]);
});

test('heap-discovered implementation helpers cannot return private slots or byte storage',async t=>{
 const {w,context}=await fixture(t),functions=queryHeapObjects(w.Function.prototype,context).objects;
 assert.ok(functions.includes(w.authorFunction));
 const source=value=>{try{return Function.prototype.toString.call(value)}catch{return ''}};
 for(const fn of functions){const text=source(fn);if(text.includes('bridge.color(value'))assert.equal(Reflect.apply(fn,undefined,[w.ownedColor,'primaries']),'bt709');if(text.includes('bridge.chunk(value')){let result;try{result=Reflect.apply(fn,undefined,[w.ownedChunk,'timestamp'])}catch(error){assert.equal(error instanceof w.TypeError,true);assert.equal(error.message,'Illegal invocation');continue}assert.equal(result,31337);}}
 const copy=w.structuredClone(w.ownedChunk),bytes=new w.Uint8Array(2);copy.copyTo(bytes);assert.deepEqual([...bytes],[2,3]);assert.equal(copy.timestamp,31337);
});
