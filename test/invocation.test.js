import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser.js';

test('actual Page invocation preserves identities without authored apply or temporary Window properties', async t => {
  const browser = new Browser({timeout:100}), page = browser.createPage();
  t.after(() => browser.close());
  await page.navigate('data:text/html,<p id="target">before</p><script>Function.prototype.apply=function(){throw Error("authored apply")};Reflect.apply=function(){throw Error("authored Reflect")}</script>');
  const element=page.dom.window.document.getElementById('target'), keys=Reflect.ownKeys(page.dom.window);
  const declaration='Object.defineProperty(function(value){this.textContent=value;return this},"apply",{get(){throw Error("own apply")}})';
  assert.equal(page.callFunction(declaration,element,['after']),element);
  assert.equal(element.textContent,'after');
  assert.deepEqual(Reflect.ownKeys(page.dom.window),keys);
});

test('real invocation timeout interrupts the function and leaves subsequent calls usable', t => {
  const browser = new Browser({timeout:50}), page=browser.createPage();
  t.after(() => browser.close());
  assert.throws(() => page.callFunction('function(){try{for(;;){}}finally{globalThis.finished=true}}',null,[]),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
  assert.equal(page.evaluate('globalThis.finished'),undefined);
  assert.equal(page.callFunction('function(){return 42}',null,[]),42);
});

test('nested actual invocations restore their frames and retain actual asynchronous results', async t => {
  const browser=new Browser(),page=browser.createPage();
  t.after(()=>browser.close());
  page.dom.window.reenter=()=>page.callFunction('function(n){return this.base+n}',{base:10},[2]);
  assert.deepEqual(Array.from(page.callFunction('function(n){return [this.base+n,reenter(),this.base+n]}',{base:20},[1])),[21,12,21]);
  assert.equal(await page.callFunction('async function(){await 0;return 42}',null,[]),42);
});
