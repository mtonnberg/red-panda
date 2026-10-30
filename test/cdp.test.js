import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { serve } from '../src/cdp.js';
import { createFixture } from './fixture.js';
import { connect } from './cdp-client.js';

let fixture, service;
before(async () => { fixture = await createFixture(); service = await serve({ port: 0 }); });
after(async () => { await service.close(); await fixture.close(); });

test('HTTP discovery advertises a usable CDP endpoint and no initial targets', async () => {
  const result = await fetch(`http://127.0.0.1:${service.port}/json/version`).then(r => r.json());
  assert.match(result.Browser, /RedPanda/);
  assert.equal(result['Protocol-Version'], '1.3');
  const targets = await fetch(`http://127.0.0.1:${service.port}/json/list`).then(r => r.json());
  assert.deepEqual(targets, []);
});

test('flattened sessions navigate, evaluate, retain handles, cookies, dump and dispose', async () => {
  const client = await connect(`ws://127.0.0.1:${service.port}/`);
  let contextId;
  try {
    contextId = (await client.send('Target.createBrowserContext')).browserContextId;
    const { targetId } = await client.send('Target.createTarget', { browserContextId: contextId, url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => client.send(method, params, sessionId);
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Page.navigate', { url: fixture.url });
    const value = await send('Runtime.evaluate', { expression: "fetch('/api').then(r => r.json()).then(x => x.message)", returnByValue: true, awaitPromise: true });
    assert.equal(value.result.value, 'async data');
    const handle = (await send('Runtime.evaluate', { expression: '({answer: 42})' })).result.objectId;
    const called = await send('Runtime.callFunctionOn', { objectId: handle, functionDeclaration: 'function (n) {return this.answer + n}', arguments: [{ value: 8 }], returnByValue: true });
    assert.equal(called.result.value, 50);
    await send('Runtime.releaseObject', { objectId: handle });
    await assert.rejects(send('Runtime.getProperties', { objectId: handle }), /Cannot find object/);
    const error = await send('Runtime.evaluate', { expression: "throw new Error('expected')" });
    assert.match(error.exceptionDetails.text, /expected/);
    const deadline = await send('Runtime.evaluate', { expression: 'while(true){}' });
    assert.match(deadline.exceptionDetails.text, /timed out/);
    await send('Network.setCookie', { url: fixture.url, name: 'cdp', value: 'works' });
    assert.ok((await send('Network.getCookies', { urls: [fixture.url] })).cookies.some(cookie => cookie.name === 'cdp'));
    const dump = await send('LP.dump', { format: 'markdown' });
    assert.equal(dump.format, 'markdown');
    assert.match(dump.content, /external script ran/);
    assert.ok(client.events.some(event => event.method === 'Page.loadEventFired'));
    assert.ok(client.events.some(event => event.method === 'Network.responseReceived' && event.params.response.status === 200));
    await assert.rejects(send('Page.captureScreenshot'), error => error.code === -32601);
    const badUrl = await send('Page.navigate', { url: 'file:///etc/passwd' });
    assert.match(badUrl.errorText, /Unsupported URL/);
    await client.send('Target.disposeBrowserContext', { browserContextId: contextId }); contextId = undefined;
    assert.equal(service.browser.pages.size, 0);
  } finally {
    if (contextId) await client.send('Target.disposeBrowserContext', { browserContextId: contextId });
    await client.close();
  }
});

test('cross-origin WebSocket requests are rejected', async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${service.port}/`, { origin: 'https://untrusted.test' });
  await assert.rejects(new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }), /403/);
});
