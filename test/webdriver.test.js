import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { Browser, until } from '../src/browser.js';
import { createWebDriver } from '../src/webdriver.js';
import { createFixture } from './fixture.js';

async function start(options = {}) {
  const browser = new Browser();
  const driver = createWebDriver(browser, options);
  const server = http.createServer((request, response) => {
    driver.handle(request, response, new URL(request.url, 'http://127.0.0.1')).then(handled => {
      if (!handled) { response.writeHead(404); response.end('not webdriver'); }
    });
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (!driver.accepts(request.url)) { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, ws => driver.attach(ws, { path: request.url, webSocketUrl: `ws://127.0.0.1:${server.address().port}` }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { browser, driver, base, endpoint: base.replace('http:', 'ws:') + '/session',
    request: async (method, path, body) => {
      const response = await fetch(base + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
      return { status: response.status, ...(await response.json()) };
    },
    close: async () => {
      driver.close(); browser.close(); sockets.close(); server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

async function bidi(endpoint) {
  const socket = new WebSocket(endpoint); await once(socket, 'open');
  let next = 1; const pending = new Map(), events = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'event') { events.push(message); return; }
    const entry = pending.get(message.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(message.id); entry.resolve(message); }
  });
  return { socket, events,
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = next++; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`BiDi timeout ${method}`)); }, 5000);
      pending.set(id, { resolve, timer }); socket.send(JSON.stringify({ id, method, params }));
    }),
    close: async () => { if (socket.readyState === WebSocket.CLOSED) return; const closed = once(socket, 'close'); socket.close(); await closed; },
  };
}

test('classic WebDriver creates a session, navigates and executes scripts through HTTP', async () => {
  const fixture = await createFixture(), service = await start();
  try {
    assert.equal((await service.request('GET', '/status')).value.ready, true);
    const created = await service.request('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'red-panda', webSocketUrl: true } } });
    assert.equal(created.status, 200); const { sessionId, capabilities } = created.value;
    assert.equal(capabilities.browserName, 'red-panda'); assert.match(capabilities.webSocketUrl, new RegExp(`/session/${sessionId}$`));
    const path = `/session/${sessionId}`;
    assert.equal((await service.request('POST', path + '/url', { url: fixture.url + 'next' })).value, null);
    assert.equal((await service.request('GET', path + '/url')).value, fixture.url + 'next');
    assert.equal((await service.request('GET', path + '/title')).value, 'Next page');
    const result = await service.request('POST', path + '/execute/sync', { script: 'return {title:document.title,sum:arguments[0]+arguments[1]};', args: [20, 22] });
    assert.deepEqual(result.value, { title: 'Next page', sum: 42 });
    const element = await service.request('POST', path + '/element', { using: 'css selector', value: 'h1' });
    assert.ok(element.value['element-6066-11e4-a52e-4f735466cecf']);
    const text = await service.request('POST', path + '/execute/sync', { script: 'return arguments[0].textContent;', args: [element.value] });
    assert.equal(text.value, 'Next');
    await service.request('POST', path + '/url', { url: fixture.url + 'next' });
    const stale = await service.request('POST', path + '/execute/sync', { script: 'return arguments[0].textContent;', args: [element.value] });
    assert.equal(stale.value.error, 'stale element reference');
    const asyncResult = await service.request('POST', path + '/execute/async', { script: 'const done=arguments[arguments.length-1];setTimeout(()=>done(42),10);', args: [] });
    assert.equal(asyncResult.value, 42);
    assert.equal((await service.request('DELETE', path)).value, null);
    assert.equal(service.browser.pages.size, 0);
    assert.equal((await service.request('GET', path + '/url')).value.error, 'invalid session id');
  } finally { await service.close(); await fixture.close(); }
});

test('BiDi sessions create contexts, subscribe to lifecycle events, evaluate and own/disown values', async () => {
  const fixture = await createFixture(), service = await start(), client = await bidi(service.endpoint);
  try {
    assert.equal((await client.send('session.status')).result.ready, true);
    const created = await client.send('session.new', { capabilities: {} });
    assert.equal(created.type, 'success'); assert.ok(created.result.sessionId);
    assert.equal((await client.send('browsingContext.getTree')).result.contexts.length, 0);
    const subscription = await client.send('session.subscribe', { events: ['browsingContext', 'script', 'log'] });
    assert.ok(subscription.result.subscription);
    const { context } = (await client.send('browsingContext.create', { type: 'tab' })).result;
    assert.ok(client.events.some(event => event.method === 'browsingContext.contextCreated' && event.params.context === context));
    const navigation = await client.send('browsingContext.navigate', { context, url: fixture.url + 'next', wait: 'complete' });
    assert.equal(navigation.result.url, fixture.url + 'next'); assert.ok(navigation.result.navigation);
    assert.ok(client.events.some(event => event.method === 'browsingContext.load'));
    const title = await client.send('script.evaluate', { expression: 'document.title', target: { context }, awaitPromise: true });
    assert.deepEqual(title.result.result, { type: 'string', value: 'Next page' });
    const owned = await client.send('script.evaluate', { expression: '({answer:40})', target: { context }, resultOwnership: 'root' });
    const handle = owned.result.result.handle; assert.ok(handle);
    const called = await client.send('script.callFunction', { target: { context }, functionDeclaration: 'function(n){return this.answer+n}', this: { handle }, arguments: [{ type: 'number', value: 2 }], awaitPromise: true });
    assert.deepEqual(called.result.result, { type: 'number', value: 42 });
    await client.send('script.disown', { target: { context }, handles: [handle] });
    assert.equal((await client.send('script.callFunction', { target: { context }, functionDeclaration: 'function(){return this}', this: { handle } })).error, 'no such handle');
    const exception = await client.send('script.evaluate', { expression: 'throw new Error("expected")', target: { context } });
    assert.equal(exception.type, 'success'); assert.equal(exception.result.type, 'exception'); assert.match(exception.result.exceptionDetails.text, /expected/);
    await client.send('session.unsubscribe', { subscriptions: [subscription.result.subscription] });
    await client.send('browsingContext.close', { context });
    const ended = await client.send('session.end'); assert.equal(ended.type, 'success');
  } finally { await client.close(); await service.close(); await fixture.close(); }
});

test('BiDi primitive/local-value roundtrips, promise awaiting and realm invalidation', async () => {
  const service = await start(), client = await bidi(service.endpoint);
  try {
    await client.send('session.new', { capabilities: {} });
    const { context } = (await client.send('browsingContext.create', { type: 'tab' })).result;
    const data = await client.send('script.callFunction', {
      functionDeclaration: 'function(x){return Promise.resolve(x)}', target: { context }, awaitPromise: true,
      arguments: [{ type: 'object', value: [['array', { type: 'array', value: [{ type: 'number', value: 'NaN' }, { type: 'bigint', value: '123' }, { type: 'null' }] }]] }],
    });
    assert.equal(data.result.type, 'success');
    const array = data.result.result.value[0][1].value;
    assert.deepEqual(array, [{ type: 'number', value: 'NaN' }, { type: 'bigint', value: '123' }, { type: 'null' }]);
    const realms = await client.send('script.getRealms', { context }); const realm = realms.result.realms[0].realm;
    const object = await client.send('script.evaluate', { expression: '({v:1})', target: { realm }, resultOwnership: 'root' });
    const handle = object.result.result.handle;
    await client.send('browsingContext.navigate', { context, url: 'data:text/html,<h1>New</h1>', wait: 'complete' });
    assert.equal((await client.send('script.evaluate', { expression: '1', target: { realm } })).error, 'no such realm');
    assert.equal((await client.send('script.callFunction', { functionDeclaration: 'function(x){return x}', arguments: [{ handle }], target: { context } })).error, 'no such handle');
    assert.equal((await client.send('script.evaluate', { expression: '1', target: { context: 'not-owned' } })).error, 'no such frame');
    assert.equal((await client.send('input.performActions', { context, actions: [] })).error, 'unknown command');
    assert.equal((await client.send('session.subscribe', { events: ['unimplemented.event'] })).error, 'invalid argument');
  } finally { await client.close(); await service.close(); }
});

test('classic sessions isolate cookie state and report capability and script errors', async () => {
  const fixture = await createFixture(), service = await start();
  try {
    const a = (await service.request('POST', '/session', { capabilities: {} })).value.sessionId;
    const b = (await service.request('POST', '/session', { capabilities: {} })).value.sessionId;
    for (const id of [a, b]) await service.request('POST', `/session/${id}/url`, { url: fixture.url + 'next' });
    await service.request('POST', `/session/${a}/cookie`, { cookie: { name: 'private', value: 'fixture', path: '/' } });
    assert.equal((await service.request('GET', `/session/${a}/cookie`)).value[0].name, 'private');
    assert.deepEqual((await service.request('GET', `/session/${b}/cookie`)).value, []);
    const error = await service.request('POST', `/session/${a}/execute/sync`, { script: 'throw new Error("expected")', args: [] });
    assert.equal(error.status, 500); assert.equal(error.value.error, 'javascript error');
    const wrong = await service.request('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'not-this-browser' } } });
    assert.equal(wrong.status, 500); assert.equal(wrong.value.error, 'session not created');
    assert.equal((await service.request('POST', `/session/${a}/unknown`, {})).value.error, 'unknown command');
    const raw = await fetch(service.base + '/session', { method: 'POST', body: '{broken' });
    assert.equal(raw.status, 400); assert.equal((await raw.json()).value.error, 'invalid argument');
    assert.equal(await service.driver.handle({ url: '/not-webdriver' }, {}, new URL('http://127.0.0.1/not-webdriver')), false);
  } finally { await service.close(); await fixture.close(); }
});

test('classic HTTP-created sessions can attach BiDi and idle expiry releases owned pages only', async () => {
  const service = await start({ sessionTimeout: 0.5 });
  const unrelated = service.browser.createPage();
  let client;
  try {
    const created = (await service.request('POST', '/session', { capabilities: { alwaysMatch: { webSocketUrl: true } } })).value;
    client = await bidi(created.capabilities.webSocketUrl);
    assert.equal((await client.send('browsingContext.getTree')).result.contexts.length, 1);
    await until(() => !service.driver.sessions.has(created.sessionId), { timeout: 2500 });
    assert.equal(service.browser.pages.size, 1); assert.equal(service.browser.pages.has(unrelated.id), true);
    assert.equal((await service.request('GET', `/session/${created.sessionId}/title`)).status, 404);
  } finally { await client?.close(); await service.close(); }
});
