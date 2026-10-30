import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { serve } from '../src/cdp.js';
import { createFixture } from './fixture.js';
import { connect } from './cdp-client.js';
import { probeRequestHeaders } from './header-probe.js';

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

test('CDP request configuration reaches navigation, resources and fetch, and can be cleared', async () => {
  const { configured, cleared } = await probeRequestHeaders(`ws://127.0.0.1:${service.port}/`, fixture.url, { enableNetwork: true });
  for (const [type, request] of Object.entries(configured).filter(([key]) => ['navigation', 'resource', 'fetch'].includes(key))) {
    assert.equal(request['x-client'], 'cdp-probe');
    assert.equal(request['x-shared'], 'extra');
    assert.equal(request['user-agent'], 'RedPandaProbe/1');
    assert.equal(request['accept-language'], 'sv-SE');
    assert.equal(request.referer, type === 'navigation' ? null : `${fixture.url}request-headers`);
  }
  assert.equal(configured.userAgent, 'RedPandaProbe/1');
  assert.equal(configured.language, 'sv-SE');
  for (const type of ['navigation', 'resource', 'fetch']) assert.equal(cleared[type]['x-client'], null);
  assert.equal(cleared.fetch['x-shared'], 'page');
});

test('invalid header updates return errors without partially changing request configuration', async () => {
  const client = await connect(`ws://127.0.0.1:${service.port}/`);
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  try {
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => client.send(method, params, sessionId);
    await send('Network.setExtraHTTPHeaders', { headers: { 'X-Client': 'retained' } });
    for (const headers of [null, [], { 'X-Client': 'changed', other: 42 }, { 'bad name': 'value' }, { 'X-Client': 'line\r\nbreak' }]) {
      await assert.rejects(send('Network.setExtraHTTPHeaders', { headers }), error => error.code === -32602);
    }
    await assert.rejects(send('Network.setUserAgentOverride', { userAgent: 'invalid\r\nagent' }), error => error.code === -32602);
    await send('Page.navigate', { url: `${fixture.url}next` });
    const result = await send('Runtime.evaluate', {
      expression: "fetch('/header-api').then(r=>r.json()).then(data=>data['x-client'])", returnByValue: true, awaitPromise: true,
    });
    assert.equal(result.result.value, 'retained');
  } finally { await client.send('Target.closeTarget', { targetId }); await client.close(); }
});
