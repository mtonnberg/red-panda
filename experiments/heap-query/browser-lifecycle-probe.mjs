import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Browser} from '../../src/browser.js';
import {runRuntime,resetRuntime} from '../../src/runtime.js';
const require=createRequire(import.meta.url),binding=require(process.argv[2]);
const count=Number(process.argv[3]??8),times=[];
for(let iteration=0;iteration<count;iteration++){
 const browser=new Browser(),page=browser.createPage();
 const session={page,objects:new Map(),worlds:new Map(),remote(value){return{value}},exception(error){return{text:String(error)}}};
 try{
  await page.navigate('data:text/html,<title>heap query lifecycle</title>');
  const w=page.dom.window,proto=w.eval(`globalThis.base={};globalThis.direct=Object.create(base);globalThis.middle=Object.create(base);globalThis.indirect=Object.create(middle);base`);
  await runRuntime(session,'Runtime.globalLexicalScopeNames');
  const start=performance.now(),queried=binding.queryObjects(proto);times.push(Math.round(performance.now()-start));
  assert.ok(queried instanceof w.Array);assert.equal(queried.length,3);assert.ok(queried.includes(w.indirect));
  queried.find(value=>value===w.direct).actualMutation=iteration;assert.equal(w.direct.actualMutation,iteration);
  await runRuntime(session,'Runtime.getHeapUsage');
  resetRuntime(session);
  await page.navigate('data:text/html,<title>new realm</title>');
  const next=page.dom.window,np=next.eval('globalThis.nextProto={};globalThis.nextObject=Object.create(nextProto);nextProto');
  await runRuntime(session,'Runtime.globalLexicalScopeNames');
  const result=binding.queryObjects(np);assert.ok(result instanceof next.Array);assert.deepEqual(Array.from(result),[next.nextObject]);
  if(iteration===0){
   next.eval(`globalThis.proxyHits=0;globalThis.target=Object.create(nextProto);globalThis.proxy=new Proxy(target,{getPrototypeOf(){proxyHits++;return nextProto}});globalThis.beyond=Object.create(proxy);globalThis.fake={};Object.defineProperty(fake,'__proto__',{value:nextProto})`);
   const base=binding.queryObjects(np);assert.equal(base.length,2);assert.ok(base.includes(next.target));assert.ok(!base.includes(next.proxy));assert.ok(!base.includes(next.beyond));assert.ok(!base.includes(next.fake));assert.equal(next.proxyHits,0);
   assert.deepEqual(Array.from(binding.queryObjects(next.proxy)),[next.beyond]);assert.equal(next.proxyHits,0);
   next.eval('globalThis.regex=/test/');
   assert.ok(binding.queryObjects(next.RegExp.prototype).includes(next.regex));
  }
 }finally{resetRuntime(session);browser.close()}
 if(global.gc)global.gc();await new Promise(resolve=>setImmediate(resolve));
}
console.log(JSON.stringify({node:process.version,v8:process.versions.v8,iterations:count,timings:times,passed:true,memory:process.memoryUsage()}));
