import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serveMCPHTTP } from '../src/mcp-http.js';

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fixture', version: '0.1' } } };
function client(server) {
  const url = `http://127.0.0.1:${server.port}/mcp`;
  let id = 1;
  const request = async (message, session, extra = {}) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { 'Mcp-Session-Id': session } : {}), ...extra }, body: JSON.stringify(message) });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { response, body };
  };
  return { url, request, call: (name, args = {}, session) => request({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, session) };
}
const toolText = result => result.body.result.content[0].text;

test('HTTP MCP initialize allocates a session and notifications have no response body', async () => {
  const server = await serveMCPHTTP(); const c = client(server);
  try {
    const initialized = await c.request(initialize);
    assert.equal(initialized.response.status, 200); assert.equal(initialized.response.headers.get('mcp-session-id'), 's1');
    assert.equal(initialized.body.result.serverInfo.name, 'red-panda');
    const notify = await c.request({ jsonrpc: '2.0', method: 'notifications/initialized' }, 's1');
    assert.equal(notify.response.status, 202); assert.equal(notify.body, '');
    const rows = JSON.parse(toolText(await c.call('session_list', {}, 's1')));
    assert.deepEqual(rows, [{ id: 'default' }, { id: 's1' }]);
  } finally { await server.close(); }
});

test('named sessions isolate pages, report URLs and are reused idempotently', async () => {
  const server = await serveMCPHTTP(); const c = client(server);
  try {
    assert.equal(toolText(await c.call('session_new', { name: 'one' })), 'session one');
    assert.equal(toolText(await c.call('session_new', { name: 'one' })), 'session one');
    const url = 'data:text/html,<title>One</title><h1>Loaded</h1>';
    assert.equal((await c.call('goto', { url }, 'one')).body.result.structuredContent.title, 'One');
    assert.equal(toolText(await c.call('getUrl', {}, 'one')), url);
    const other = await c.call('getUrl', {}, 'two');
    assert.equal(other.response.status, 200); assert.equal(other.body.error.code, -32604);
    const rows = JSON.parse(toolText(await c.call('session_list')));
    assert.deepEqual(rows, [{ id: 'default' }, { id: 'one', url }, { id: 'two' }]);
    assert.equal(server.browser.pages.size, 3);
  } finally { await server.close(); }
});

test('closing sessions frees their pages; deleted names can be recreated; default remains', async () => {
  const server = await serveMCPHTTP(); const c = client(server);
  try {
    await c.call('session_new', { name: 'one' });
    assert.equal(server.browser.pages.size, 2);
    const closed = await fetch(c.url, { method: 'DELETE', headers: { 'Mcp-Session-Id': 'one' } });
    assert.equal(closed.status, 202); assert.equal(server.browser.pages.size, 1);
    const recreated = await c.call('getUrl', {}, 'one');
    assert.equal(recreated.response.status, 200); assert.equal(server.browser.pages.size, 2);
    await c.call('session_close', { id: 'one' });
    assert.equal(server.browser.pages.size, 1);
    const refused = await c.call('session_close', { id: 'default' });
    assert.equal(refused.body.result.isError, true);
    assert.equal(toolText(refused), 'the default session cannot be closed');
    assert.equal((await fetch(c.url, { method: 'DELETE' })).status, 202);
    assert.equal(server.browser.pages.size, 1);
  } finally { await server.close(); }
});

test('idle named sessions expire with HTTP 404 while the default session remains usable', async () => {
  const server = await serveMCPHTTP({ httpSessionTimeout: 1 }); const c = client(server);
  try {
    await c.call('session_new', { name: 'expire' });
    await new Promise(resolve => setTimeout(resolve, 1100));
    const expired = await c.call('getUrl', {}, 'expire');
    assert.equal(expired.response.status, 404);
    assert.match(expired.body, /Session expired/);
    assert.deepEqual(JSON.parse(toolText(await c.call('session_list'))), [{ id: 'default' }]);
    await c.call('session_new', { name: 'expire' });
    assert.equal((await c.call('getUrl', {}, 'expire')).response.status, 200);
  } finally { await server.close(); }
});

test('HTTP MCP rejects malformed bodies, oversized payloads, origins and unsupported methods', async () => {
  const server = await serveMCPHTTP({ maxBodyBytes: 512 }); const c = client(server);
  try {
    const badJSON = await fetch(c.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(badJSON.status, 400); assert.equal((await badJSON.json()).error.code, -32700);
    const tooLarge = await fetch(c.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(600) }) });
    assert.equal(tooLarge.status, 413); await tooLarge.text();
    const wrongType = await fetch(c.url, { method: 'POST', body: '{}' });
    assert.equal(wrongType.status, 415); await wrongType.text();
    const origin = await c.request({ jsonrpc: '2.0', id: 2, method: 'ping' }, undefined, { Origin: 'https://untrusted.example' });
    assert.equal(origin.response.status, 403);
    assert.equal((await fetch(c.url)).status, 405);
    assert.equal((await fetch(c.url.replace('/mcp', '/other'))).status, 404);
  } finally { await server.close(); }
});

test('same-session HTTP requests are serialized in arrival order', async () => {
  const server = await serveMCPHTTP(); const c = client(server);
  try {
    await c.call('session_new', { name: 'ordered' });
    const navigation = c.call('goto', { url: 'data:text/html,<title>Ordered</title><h1>Ready</h1>' }, 'ordered');
    const reading = c.call('evaluate', { script: 'document.title' }, 'ordered');
    assert.equal((await navigation).body.result.structuredContent.title, 'Ordered');
    assert.equal(toolText(await reading), 'Ordered');
  } finally { await server.close(); }
});

test('strict unknown-session mode rejects creation through a header', async () => {
  const server = await serveMCPHTTP({ strictUnknownSessions: true }); const c = client(server);
  try {
    assert.equal((await c.call('getUrl', {}, 'unknown')).response.status, 404);
    await c.call('session_new', { name: 'known' });
    assert.equal((await c.call('getUrl', {}, 'known')).response.status, 200);
  } finally { await server.close(); }
});
