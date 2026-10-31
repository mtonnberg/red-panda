import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
import {locationImplementation} from '../src/location-factory.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
test('a real Location with an authored null prototype retains its backend and receives the genuine first utility alias',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,'+encodeURIComponent('<!doctype html><body>Actual private alias document'));
 const w=page.dom.window,main=w.location,prototype=Object.getPrototypeOf(main),implementation=utils.implForWrapper(main),href=Object.getOwnPropertyDescriptor(w.Location.prototype,'href').get;
 Object.setPrototypeOf(main,null);let world;
 try{
  assert.equal(Object.getPrototypeOf(main),null);assert.equal(w.document.location,main);assert.equal(href.call(main),page.url);
  world=createIsolatedWorld(w,{name:'actual-private-location'});const alias=world.global.location;
  assert.equal(world.global.document.location,alias);assert.equal(utils.implForWrapper(alias),implementation);assert.equal(Object.getPrototypeOf(alias),world.global.Location.prototype);assert.equal(alias.href,page.url);assert.equal(world.global.document.body.textContent,'Actual private alias document');
  assert.equal(utils.wrapperForImpl(implementation),main);assert.equal(w.location,main);assert.equal(Object.getPrototypeOf(main),null);
  const authored=world.evaluate('({actualAuthored:true,href:"actual-authored-value"})');assert.equal(locationImplementation(authored),undefined);assert.equal(world.wrap(authored),authored);assert.equal(authored.actualAuthored,true);assert.equal(authored.href,'actual-authored-value');
 }finally{world?.dispose();Object.setPrototypeOf(main,prototype)}
});
