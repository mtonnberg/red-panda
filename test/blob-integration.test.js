import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, until } from '../src/browser.js';

async function fixture(t, html = '<!doctype html><h1>Blob integration</h1>') {
  const browser = new Browser(), page = browser.createPage();
  t.after(() => browser.close());
  await page.navigate(`data:text/html,${encodeURIComponent(html)}`); return page;
}

test('browser fetch snapshots Blob URLs before revocation and returns real realm bytes and metadata', async t => {
  const page = await fixture(t);
  const response = await page.evaluate(`(() => {
    const url=URL.createObjectURL(new Blob(['Panda 🐼'],{type:'TEXT/PLAIN'}));
    globalThis.createdURL=url;
    const pending=fetch(url+'#fragment'); URL.revokeObjectURL(url); return pending;
  })()`);
  assert.equal(response.status, 200); assert.equal(response.statusText, 'OK');
  assert.equal(response.url, `${page.evaluate('createdURL')}#fragment`);
  assert.equal(response.headers.get('content-type'), 'text/plain'); assert.equal(response.headers.get('content-length'), null);
  const bytes = await response.clone().arrayBuffer();
  assert.equal(bytes instanceof page.dom.window.ArrayBuffer, true); assert.equal(new TextDecoder().decode(bytes), 'Panda 🐼');
  assert.equal(await response.text(), 'Panda 🐼');
  await assert.rejects(page.evaluate('fetch(createdURL)'), { name: 'TypeError' });
});

test('actual inherited-origin frames fetch parent-owned object URLs through their own facade', async t => {
  const page = await fixture(t, '<!doctype html><iframe srcdoc="<p>Child</p>"></iframe>');
  const url = page.evaluate("URL.createObjectURL(new Blob(['shared frame bytes']))");
  const child = [...page.frames.frames.values()].find(frame => frame !== page);
  assert.equal(await child.evaluate(`fetch(${JSON.stringify(url)}).then(response=>response.text())`), 'shared frame bytes');
  page.evaluate(`URL.revokeObjectURL(${JSON.stringify(url)})`);
  await assert.rejects(child.evaluate(`fetch(${JSON.stringify(url)})`), { name: 'TypeError' });
});

test('a classic Blob worker starts from its constructor snapshot after immediate URL revocation', async t => {
  const page = await fixture(t);
  page.evaluate(`(() => {
    const source='onmessage=e=>postMessage({value:e.data+" reply",location:location.href});';
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    globalThis.workerURL=url;globalThis.workerReply=null;
    const worker=new Worker(url);worker.onmessage=e=>{workerReply=e.data;worker.terminate()};
    worker.postMessage('blob');URL.revokeObjectURL(url);
  })()`);
  await until(() => page.evaluate('workerReply!==null'), { timeout: 5000 });
  assert.equal(page.evaluate('workerReply.value'), 'blob reply');
  assert.equal(page.evaluate('workerReply.location'), page.evaluate('workerURL'));
});

test('a Blob module worker links an actual imported module and completes top-level await', async t => {
  const page = await fixture(t);
  page.evaluate(`(() => {
    const source='import {answer} from "data:text/javascript,export%20const%20answer%3D73";await Promise.resolve();postMessage(answer);';
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));globalThis.moduleWorkerResult=null;
    const worker=new Worker(url,{type:'module'});worker.onmessage=e=>{moduleWorkerResult=e.data;worker.terminate()};
    URL.revokeObjectURL(url);
  })()`);
  await until(() => page.evaluate('moduleWorkerResult!==null'), { timeout: 5000 });
  assert.equal(page.evaluate('moduleWorkerResult'), 73);
});
