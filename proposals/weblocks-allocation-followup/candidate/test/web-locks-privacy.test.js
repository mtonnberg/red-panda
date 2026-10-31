import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {queryHeapObjects} from '../src/heap-query.js';

test('Web Locks factories stay Host-private while authored lookalikes and actual public values remain queryable',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,owned-lock-privacy');
 const w=page.dom.window;
 page.evaluate(`globalThis.ordinaryLockObject={marker:41};globalThis.authoredLockRecord={global:window,makeManager(){return 'authored manager'},makeLock(){return 'authored lock'},abort(){return 'authored abort'},deliver(){return 'authored deliver'},invoke(){return 'authored invoke'}};true`);
 let release,actualLock;const held=w.navigator.locks.request('owned-privacy',lock=>{actualLock=lock;return new w.Promise(resolve=>release=resolve);});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(actualLock instanceof w.Lock);
 const result=queryHeapObjects(w.Object.prototype,page.dom.getInternalVMContext()).objects;
 for(const expected of [w.ordinaryLockObject,w.authoredLockRecord,w.navigator.locks,actualLock])assert.equal(result.includes(expected),true);
 const own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
 const records=result.filter(value=>Object.getPrototypeOf(value)===w.Object.prototype&&own(value,'global')===w&&['makeManager','makeLock','abort','deliver','invoke'].every(key=>typeof own(value,key)==='function'));
 assert.equal(records.length,1);assert.equal(records[0],w.authoredLockRecord);
 assert.equal(w.authoredLockRecord.makeManager(),'authored manager');assert.equal(w.authoredLockRecord.makeLock(),'authored lock');
 assert.equal(actualLock.name,'owned-privacy');assert.equal(actualLock.mode,'exclusive');
 release('actual settlement');assert.equal(await held,'actual settlement');
});
