import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('isolated platform observer failures become explicit heap errors without changing factory return',()=>{
 const module=name=>new URL('../src/'+name,import.meta.url).href;
 const source=`import assert from 'node:assert/strict';
 import {Browser} from ${JSON.stringify(module('browser.js'))};
 import {installHeapUtilityFactories} from ${JSON.stringify(module('heap-worlds.js'))};
 import {registerPlatformFactory} from ${JSON.stringify(module('platform-factories.js'))};
 import {queryHeapObjects} from ${JSON.stringify(module('heap-query.js'))};
 installHeapUtilityFactories();const browser=new Browser();try{const page=browser.createPage();const {proxy,revoke}=Proxy.revocable({},{});revoke();let record;assert.doesNotThrow(()=>{record=registerPlatformFactory(proxy,{kind:'OwnedFaultFixture',globalObject:page.dom.window})});assert.equal(record.kind,'OwnedFaultFixture');assert.throws(()=>queryHeapObjects(page.dom.window.Object.prototype,page.dom.getInternalVMContext()),error=>error.code==='ERR_HEAP_QUERY_FACTORY_OBSERVATION');console.log('EXPLICIT_FACTORY_FAILURE')}finally{browser.close()}`;
 const result=spawnSync(process.execPath,['--input-type=module','--eval',source],{encoding:'utf8',timeout:20000,maxBuffer:1000000});assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/EXPLICIT_FACTORY_FAILURE/);
});
