import{test}from'node:test';import assert from'node:assert/strict';import{Browser}from'../src/browser.js';import{queryHeapObjects}from'../src/heap-query.js';
test('CookieStore retains genuine public and authored identities without VM factory dictionaries',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,owned-cookie-privacy');const w=page.dom.window;
 const initial=queryHeapObjects(w.CookieStore.prototype,page.dom.getInternalVMContext()).objects;assert.equal(initial.length,0);
 page.evaluate(`globalThis.authoredCookieInterfaces={CookieStore,CookieChangeEvent};globalThis.authoredCookieRecord={store:cookieStore,interfaces:authoredCookieInterfaces,read(){return 'authored read'},write(){return 'authored write'},makeEvent(){return 'authored event'}};globalThis.ordinaryCookieObject={marker:41};globalThis.actualCookieEvent=new CookieChangeEvent('custom',{changed:[{name:'a',value:'real'}]});true`);
 const values=queryHeapObjects(w.Object.prototype,page.dom.getInternalVMContext()).objects;
 for(const value of [w.cookieStore,w.authoredCookieInterfaces,w.authoredCookieRecord,w.ordinaryCookieObject,w.actualCookieEvent])assert.equal(values.includes(value),true);
 const own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
 const tables=values.filter(value=>Object.getPrototypeOf(value)===w.Object.prototype&&own(value,'CookieStore')===w.CookieStore&&own(value,'CookieChangeEvent')===w.CookieChangeEvent);assert.equal(tables.length,1);assert.strictEqual(tables[0],w.authoredCookieInterfaces);
 const records=values.filter(value=>Object.getPrototypeOf(value)===w.Object.prototype&&own(value,'store')===w.cookieStore&&own(value,'interfaces')===w.authoredCookieInterfaces);assert.equal(records.length,1);assert.strictEqual(records[0],w.authoredCookieRecord);assert.equal(w.authoredCookieRecord.makeEvent(),'authored event');assert.equal(w.actualCookieEvent.changed[0].value,'real');
});
