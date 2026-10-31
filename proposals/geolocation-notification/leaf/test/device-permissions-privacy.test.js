import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {queryHeapObjects} from '../src/heap-query.js';

test('device implementation records and factory capability stay Host-private while real authored identities remain queryable',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,owned-device-privacy');
 const w=page.dom.window;
 await page.evaluate(`new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve(),error=>{globalThis.savedGeoError=error;resolve()}))`);
 page.evaluate(`globalThis.ordinaryDeviceObject={marker:17};globalThis.authoredDeviceInterfaces={Geolocation,Notification};globalThis.authoredDeviceRecord={interfaces:authoredDeviceInterfaces,geo:navigator.geolocation,makeError(){return 'authored'}};globalThis.actualNotification=new Notification('actual-public');true`);
 const result=queryHeapObjects(w.Object.prototype,page.dom.getInternalVMContext()).objects;
 for(const expected of [w.ordinaryDeviceObject,w.authoredDeviceRecord,w.authoredDeviceInterfaces,w.navigator.geolocation,w.savedGeoError,w.actualNotification])assert.equal(result.includes(expected),true);
 const own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
 const plain=result.filter(value=>Object.getPrototypeOf(value)===w.Object.prototype);
 const dictionaries=plain.filter(value=>own(value,'Geolocation')===w.Geolocation&&own(value,'Notification')===w.Notification);
 assert.equal(dictionaries.length,1);assert.equal(dictionaries[0],w.authoredDeviceInterfaces);
 const records=plain.filter(value=>own(value,'geo')===w.navigator.geolocation&&own(value,'interfaces')&&own(own(value,'interfaces'),'Geolocation')===w.Geolocation);
 assert.equal(records.length,1);assert.equal(records[0],w.authoredDeviceRecord);
 assert.equal(w.authoredDeviceRecord.makeError(),'authored');
 assert.equal(w.savedGeoError instanceof w.GeolocationPositionError,true);assert.equal(w.savedGeoError.code,1);assert.equal(w.actualNotification.title,'actual-public');
});
