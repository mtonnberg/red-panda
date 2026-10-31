import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Browser} from '../src/browser.js';
import {JSDOM} from 'jsdom';
import {getHeapBinding} from '../src/native-heap.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
function actualRealm(value,anchor){const previous=Object.getPrototypeOf(value);Object.setPrototypeOf(value,null);try{assert.equal(getHeapBinding().sameRealm(value,anchor),true)}finally{Object.setPrototypeOf(value,previous)}}
async function fixture(t){const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,'+encodeURIComponent('<!doctype html><html><head><script>globalThis.actualMarker="kept"</script></head><body>Actual Location front</body></html>'));return page;}
test('the first actual Location front has native placement, selected VM functions and the same real backend identity',async t=>{
 const page=await fixture(t),w=page.dom.window,front=w.location,implementation=utils.implForWrapper(front);
 const anchor=page.evaluate('({actualRealmAnchor:true})');actualRealm(w.Location,anchor);actualRealm(w.Location.prototype,anchor);actualRealm(front,anchor);
 assert.equal(front,w.document.location);assert.equal(Object.getPrototypeOf(front),w.Location.prototype);assert.deepEqual(Object.getOwnPropertyNames(front),[]);assert.deepEqual(Object.getOwnPropertySymbols(front),[]);
 assert.equal(implementation,utils.implForWrapper(w.document)._location);assert.equal(utils.wrapperForImpl(implementation),front);
 for(const key of ['href','search','hash','pathname','hostname','host','port','origin','protocol']){
  const d=Object.getOwnPropertyDescriptor(w.Location.prototype,key);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(Object.getPrototypeOf(d.get),w.Function.prototype);actualRealm(d.get,anchor);assert.equal(d.get.name,'get '+key);assert.equal(d.get.length,0);
  if(['href','search','hash','pathname'].includes(key)){assert.equal(Object.getPrototypeOf(d.set),w.Function.prototype);actualRealm(d.set,anchor);assert.equal(d.set.name,'set '+key);assert.equal(d.set.length,1)}else assert.equal(d.set,undefined);
  assert.equal(d.get.call(front),implementation[key]);
 }
 for(const key of ['assign','replace','reload','toString']){const d=Object.getOwnPropertyDescriptor(w.Location.prototype,key);assert.equal(d.writable,true);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(Object.getPrototypeOf(d.value),w.Function.prototype);actualRealm(d.value,anchor);}
 assert.equal(front.toString(),page.url);assert.throws(()=>new w.Location(),error=>Object.getPrototypeOf(error)===w.TypeError.prototype);
});
test('ordinary lookalikes and copied implementation symbols never gain Location authority',async t=>{
 const page=await fixture(t),w=page.dom.window,front=w.location,implementation=utils.implForWrapper(front),fake=page.evaluate('({actualAuthored:true})'),get=Object.getOwnPropertyDescriptor(w.Location.prototype,'href').get;
 let reads=0;Object.defineProperty(fake,utils.implSymbol,{get(){reads++;return implementation},configurable:true});assert.throws(()=>get.call(fake),error=>Object.getPrototypeOf(error)===w.TypeError.prototype&&error.message==='Illegal invocation');assert.equal(reads,0);assert.equal(fake.actualAuthored,true);
 Object.defineProperty(fake,utils.implSymbol,{value:implementation,configurable:true});assert.equal(utils.implForWrapper(fake),null);assert.throws(()=>w.Location.prototype.assign.call(fake,'javascript:void 0'),error=>Object.getPrototypeOf(error)===w.TypeError.prototype);
 const previous=implementation[utils.wrapperSymbol];implementation[utils.wrapperSymbol]=fake;try{assert.equal(utils.wrapperForImpl(implementation),front);assert.equal(w.document.location,front);assert.equal(w.location,front)}finally{implementation[utils.wrapperSymbol]=previous}
});
test('readonly prototype URL components preserve actual state and do not create own shadows through assignment',async t=>{
 const page=await fixture(t),w=page.dom.window,url=page.url;
 for(const key of ['protocol','host','hostname','port','origin']){assert.equal(Reflect.set(w.location,key,'actual-unwanted-value'),false);assert.equal(Object.hasOwn(w.location,key),false);assert.equal(page.url,url);}
 assert.equal(w.document.URL,url);assert.equal(page.evaluate('actualMarker'),'kept');
});
test('utility Location aliases have genuine utility VM definitions over the same backend while the main canonical front stays stable',async t=>{
 const page=await fixture(t),w=page.dom.window,main=w.location,implementation=utils.implForWrapper(main),world=createIsolatedWorld(w,{name:'actual-location-utility'});t.after(()=>world.dispose());
 const anchor=world.evaluate('({actualUtilityAnchor:true})'),alias=world.global.location;actualRealm(world.global.Location,anchor);actualRealm(world.global.Location.prototype,anchor);actualRealm(alias,anchor);assert.notEqual(alias,main);assert.equal(alias,world.global.document.location);assert.equal(alias,world.global.location);assert.equal(utils.implForWrapper(alias),implementation);assert.equal(utils.wrapperForImpl(implementation),main);assert.equal(w.location,main);
 assert.equal(Object.getPrototypeOf(alias),world.global.Location.prototype);assert.deepEqual(Object.getOwnPropertyNames(alias),[]);assert.deepEqual(Object.getOwnPropertySymbols(alias),[]);
 const utility=Object.getOwnPropertyDescriptor(world.global.Location.prototype,'href');assert.equal(Object.getPrototypeOf(utility.get),world.global.Function.prototype);actualRealm(utility.get,anchor);actualRealm(utility.set,anchor);actualRealm(world.global.Location.prototype.assign,anchor);assert.equal(utility.get.call(main),page.url);assert.equal(Object.getOwnPropertyDescriptor(w.Location.prototype,'href').get.call(alias),page.url);
 assert.throws(()=>utility.get.call({}),error=>Object.getPrototypeOf(error)===world.global.TypeError.prototype&&error.message==='Illegal invocation');
});

test('unowned jsdom embedders retain their genuine original Location factory and identity',()=>{
 for(const runScripts of [undefined,'outside-only']){
  const dom=new JSDOM('<!doctype html>',{url:'https://unowned.example/',...(runScripts?{runScripts}:{})});
  try{assert.equal(Object.hasOwn(dom.window.location,'href'),true);assert.equal(Object.getOwnPropertyDescriptor(dom.window.location,'href').configurable,false);assert.equal(dom.window.location,dom.window.document.location);assert.equal(utils.wrapperForImpl(utils.implForWrapper(dom.window.location)),dom.window.location);}finally{dom.window.close()}
 }
});
test('dynamically created owned frames allocate the sole canonical Location in their actual VM before parsing',async t=>{
 const page=await fixture(t);
 await page.evaluate('(async()=>{const frame=document.createElement("iframe");frame.srcdoc="<!doctype html><html><body>Actual owned child</body></html>";const loaded=new Promise(resolve=>frame.onload=resolve);document.body.appendChild(frame);await loaded})()');
 const w=page.dom.window.document.querySelector('iframe').contentWindow,front=w.location;assert.equal(w.document.body.textContent,'Actual owned child');assert.equal(front,w.document.location);assert.equal(Object.getPrototypeOf(front),w.Location.prototype);assert.deepEqual(Object.getOwnPropertyNames(front),[]);assert.deepEqual(Object.getOwnPropertySymbols(front),[]);assert.equal(Object.getPrototypeOf(Object.getOwnPropertyDescriptor(w.Location.prototype,'pathname').set),w.Function.prototype);assert.equal(utils.implForWrapper(front),utils.implForWrapper(w.document)._location);
});
