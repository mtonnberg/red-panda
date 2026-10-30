import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { WebSocket } from 'ws';
import { serve } from '../src/cdp.js';
import { until } from '../src/browser.js';
import { connect } from './cdp-client.js';
import { createFixture } from './fixture.js';

const exec = promisify(execFile);
async function bidi(endpoint, options) {
  const socket = new WebSocket(endpoint, options); await once(socket, 'open');
  let id = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw), request = pending.get(message.id);
    if (request) { pending.delete(message.id); clearTimeout(request.timer); request.resolve(message); }
  });
  return { socket,
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id; const timer = setTimeout(() => reject(new Error(`BiDi timeout ${method}`)), 5000);
      pending.set(n, { resolve, timer }); socket.send(JSON.stringify({ id: n, method, params }));
    }),
    close: async () => { if (socket.readyState === WebSocket.CLOSED) return; const closed = once(socket, 'close'); socket.close(); await closed; },
  };
}

test('one server can provide CDP and classic/BiDi sessions with independent lifetimes', async () => {
  const service = await serve({ port: 0, protocols: ['cdp', 'webdriver'] });
  const base = `http://127.0.0.1:${service.port}`;
  const cdp = await connect(`ws://127.0.0.1:${service.port}/`);
  let client;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const response = await fetch(`${base}/session`, { method: 'POST', body: JSON.stringify({ capabilities: { alwaysMatch: { webSocketUrl: true } } }) });
    const { value: created } = await response.json();
    assert.equal(response.status, 200);
    assert.match(created.capabilities.webSocketUrl, new RegExp(`:${service.port}/session/`));
    client = await bidi(created.capabilities.webSocketUrl);
    assert.equal((await client.send('browsingContext.getTree')).result.contexts.length, 1);
    await fetch(`${base}/session/${created.sessionId}`, { method: 'DELETE' });
    assert.equal(service.browser.pages.has(targetId), true);
    assert.equal(service.browser.pages.size, 1);
    assert.equal((await fetch(`${base}/json/version`)).status, 200);
  } finally { await client?.close(); await cdp.close(); await service.close(); }
});

test('WebDriver-only servers reject CDP and enforce configured WebSocket origins', async () => {
  const service = await serve({ port: 0, protocols: ['webdriver'], allowedOrigins: ['https://trusted.test'] });
  const endpoint = `ws://127.0.0.1:${service.port}`;
  let client;
  try {
    assert.equal((await fetch(`http://127.0.0.1:${service.port}/json/version`)).status, 404);
    await assert.rejects(bidi(`${endpoint}/`), /404/);
    await assert.rejects(bidi(`${endpoint}/session`, { origin: 'https://other.test' }), /403/);
    client = await bidi(`${endpoint}/session`, { origin: 'https://trusted.test' });
    assert.equal((await client.send('session.new', { capabilities: {} })).type, 'success');
    assert.equal((await client.send('browsingContext.create', { type: 'tab' })).type, 'success');
  } finally { await client?.close(); await service.close(); }
});

test('DOM and trusted input work over CDP and old node IDs stay invalid after navigation', async () => {
  const fixture = await createFixture(), service = await serve({ port: 0 });
  const client = await connect(`ws://127.0.0.1:${service.port}/`);
  try {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => client.send(method, params, sessionId);
    await send('DOM.enable');
    await send('Page.navigate', { url: `${fixture.url}forms` });
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#text' });
    await send('DOM.focus', { nodeId });
    await send('Input.insertText', { text: 'hello' });
    const value = await send('Runtime.evaluate', { expression: "document.querySelector('#text').value", returnByValue: true });
    assert.equal(value.result.value, 'hello');
    await send('DOM.setAttributeValue', { nodeId, name: 'data-test', value: 'changed' });
    await until(() => client.events.some(event => event.method === 'DOM.attributeModified'));
    await send('Page.navigate', { url: `${fixture.url}next` });
    const nextRoot = (await send('DOM.getDocument')).root;
    assert.notEqual(nextRoot.backendNodeId, root.backendNodeId);
    await assert.rejects(send('DOM.resolveNode', { backendNodeId: nodeId }), /Unknown DOM node/);
  } finally { await client.close(); await service.close(); await fixture.close(); }
});

test('CLI rejects unsupported protocols and conflicting MCP transports', async () => {
  await assert.rejects(exec(process.execPath, ['bin/red-panda.js', 'serve', '--protocol', 'unknown']), /Unsupported automation protocol/);
  await assert.rejects(exec(process.execPath, ['bin/red-panda.js', 'mcp', '--port', '0', '--cdp-port', '0']), /cannot be combined/);
});

test('CDP geometry, viewport overrides and persisted scripts operate on the selected page realm', async () => {
  const service = await serve({ port: 0 });
  const client = await connect(`ws://127.0.0.1:${service.port}/`);
  try {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => client.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'data:text/html,<!doctype html><button id="target" style="width:20px;height:10px">Target</button>' });
    assert.equal((await send('Page.getLayoutMetrics')).cssLayoutViewport.clientWidth, 800);
    const { root } = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#target' });
    const { model } = await send('DOM.getBoxModel', { nodeId });
    assert.equal(model.width, 20); assert.equal(model.height, 10);
    const { quads } = await send('DOM.getContentQuads', { nodeId });
    assert.deepEqual(quads, [model.content]);
    const { scriptId } = await send('Runtime.compileScript', { expression: 'globalThis.compiledInPage=innerWidth; Promise.resolve(document.getElementById("target").textContent)', sourceURL: 'compiled-page.js', persistScript: true });
    assert.ok(scriptId);
    const result = await send('Runtime.runScript', { scriptId, awaitPromise: true, returnByValue: true });
    assert.equal(result.result.value, 'Target');
    assert.equal((await send('Runtime.evaluate', { expression: 'compiledInPage', returnByValue: true })).result.value, 800);
    await send('Emulation.clearDeviceMetricsOverride');
    assert.equal((await send('Page.getLayoutMetrics')).cssLayoutViewport.clientWidth, 1920);
    await assert.rejects(send('Runtime.runScript', { scriptId }), /script|Script/);
  } finally { await client.close(); await service.close(); }
});
