import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMCPHandler, runMCPStdio } from '../src/mcp.js';
import { createFixture } from './fixture.js';

const html = `<!doctype html><title>MCP fixture</title><main><h1>Example</h1>
  <a id="next" href="https://example.test/next">Next page</a><label for="name">Name</label><input id="name" value="old">
  <button id="click" onclick="document.querySelector('h1').textContent='clicked'">Click</button>
  <input id="check" type="checkbox"><input id="disabled" disabled value="locked"><select id="select"><option value="a">One</option><option value="b">Two</option></select>
  <ul><li class="item"><span class="label">One</span><a href="https://example.test/one">Link</a></li></ul></main>`;
const url = `data:text/html,${encodeURIComponent(html)}`;
const data = result => JSON.parse(result.content[0].text);

test('MCP initialization, discovery, validation and pre-navigation errors are structured', async () => {
  const handler = createMCPHandler();
  try {
    const init = await handler.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    assert.equal(init.id, 0); assert.equal(init.result.serverInfo.name, 'red-panda');
    assert.equal(init.result.protocolVersion, '2025-03-26');
    const list = await handler.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.ok(list.result.tools.some(tool => tool.name === 'extract' && tool.inputSchema.required.includes('schema')));
    assert.equal(await handler.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
    assert.equal((await handler.handle({ jsonrpc: '2.0', id: 2, method: 'not-a-method' })).error.code, -32601);
    assert.equal((await handler.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'getUrl' } })).error.code, -32604);
    assert.equal((await handler.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'goto', arguments: {} } })).result.isError, true);
    assert.equal((await handler.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'missing' } })).error.code, -32601);
    await assert.rejects(handler.callTool('screenshot'), /FrameNotLoaded/);
    assert.equal((await handler.callTool('session_list')).isError, true);
  } finally { handler.close(); }
});

test('MCP reads HTML, Markdown, links, structured metadata and nested extraction', async () => {
  const handler = createMCPHandler();
  try {
    const navigation = await handler.callTool('goto', { url });
    assert.equal(navigation.structuredContent.httpStatus, 200);
    assert.equal(navigation.structuredContent.title, 'MCP fixture');
    assert.equal((await handler.callTool('html', { selector: 'h1' })).content[0].text, '<h1>Example</h1>');
    assert.match((await handler.callTool('markdown', { selector: 'main' })).content[0].text, /# Example/);
    const links = data(await handler.callTool('links', { limit: 1 }));
    assert.equal(links.length, 1); assert.equal(links[0].href, 'https://example.test/next');
    assert.equal(data(await handler.callTool('structuredData')).meta.title, 'MCP fixture');
    const extracted = data(await handler.callTool('extract', { schema: JSON.stringify({ title: 'h1', missing: '#absent', items: [{ selector: '.item', fields: { label: '.label', link: { selector: 'a', attr: 'href' } } }] }) }));
    assert.deepEqual(extracted, { title: 'Example', missing: null, items: [{ label: 'One', link: 'https://example.test/one' }] });
    assert.equal((await handler.callTool('extract', { schema: '{"missing":"#absent"}' })).isError, true);
    const stripped = await handler.callTool('html', { strip: { js: true } });
    assert.doesNotMatch(stripped.content[0].text, /<script/);
  } finally { handler.close(); }
});

test('MCP node details and interactive discovery expose usable IDs and selectors', async () => {
  const handler = createMCPHandler();
  try {
    await handler.callTool('goto', { url });
    const elements = data(await handler.callTool('interactiveElements'));
    const input = elements.find(element => element.id === 'name');
    assert.equal(input.role, 'textbox'); assert.equal(input.name, 'Name');
    const details = data(await handler.callTool('nodeDetails', { backendNodeId: input.backendNodeId }));
    assert.equal(handler.page.dom.window.document.querySelector(details.selector).id, 'name');
    assert.equal(data(await handler.callTool('findElement', { role: 'button', name: '/cli.*/' }))[0].id, 'click');
    const tree = (await handler.callTool('tree')).content[0].text;
    assert.match(tree, /RootWebArea 'MCP fixture'/); assert.match(tree, /textbox 'Name' value='old'/);
    await handler.callTool('goto', { url });
    await assert.rejects(handler.callTool('nodeDetails', { backendNodeId: input.backendNodeId }), error => error.code === -32602);
  } finally { handler.close(); }
});

test('MCP actions mutate controls and dispatch page handlers', async () => {
  const handler = createMCPHandler();
  try {
    await handler.callTool('goto', { url });
    await handler.callTool('fill', { selector: '#name', value: 'new' });
    await handler.callTool('press', { selector: '#name', key: '!' });
    await handler.callTool('selectOption', { selector: '#select', value: 'b' });
    await handler.callTool('setChecked', { selector: '#check', checked: true });
    await handler.callTool('click', { selector: '#click' });
    const result = data(await handler.callTool('evaluate', { script: '({name:document.querySelector("#name").value,selected:document.querySelector("#select").value,checked:document.querySelector("#check").checked,title:document.querySelector("h1").textContent})' }));
    assert.deepEqual(result, { name: 'new!', selected: 'b', checked: true, title: 'clicked' });
    await handler.callTool('press', { selector: '#name', key: 'Control+A' });
    await handler.callTool('press', { key: 'x' });
    await assert.rejects(handler.callTool('press', { selector: '#disabled', key: 'Backspace' }), /disabled/);
    assert.equal(handler.page.dom.window.document.querySelector('#name').value, 'x');
    await assert.rejects(handler.callTool('click', { selector: '#missing' }), error => error.code === -32602);
  } finally { handler.close(); }
});

test('MCP evaluation supports promises, top-level await/return, bridge values, and console draining', async () => {
  const handler = createMCPHandler();
  try {
    await handler.callTool('goto', { url });
    const saved = data(await handler.callTool('evaluate', { script: '({value:42})', save: 'answer' }));
    assert.equal(saved.value, 42);
    assert.equal((await handler.callTool('evaluate', { script: 'await Promise.resolve(lp.answer.value)' })).content[0].text, '42');
    assert.equal((await handler.callTool('evaluate', { script: 'const value=await Promise.resolve(7); return value*2;' })).content[0].text, '14');
    assert.equal((await handler.callTool('evaluate', { script: 'throw new Error("expected")' })).isError, true);
    await handler.callTool('evaluate', { script: 'console.log("fixture"); "ok"' });
    assert.equal((await handler.callTool('consoleLogs')).content[0].text, '[log] fixture\n');
    assert.equal((await handler.callTool('consoleLogs')).content[0].text, '');
    await handler.callTool('evaluate', { script: 'const circular={};circular.self=circular;console.log(circular,123n); "still running"' });
    assert.match((await handler.callTool('consoleLogs')).content[0].text, /123/);
  } finally { handler.close(); }
});

test('MCP waits observe asynchronous DOM and selector timeout failures', async () => {
  const fixture = await createFixture();
  const handler = createMCPHandler();
  try {
    await handler.callTool('goto', { url: fixture.url });
    await handler.callTool('waitForSelector', { selector: '#async:not(:empty)', timeout: 1000 });
    await handler.callTool('waitForScript', { script: 'document.querySelector("#async").textContent === "async data"', timeout: 1000 });
    await handler.callTool('waitForState', { state: 'networkidle', timeout: 1000 });
    await assert.rejects(handler.callTool('waitForSelector', { selector: '#missing', timeout: 30 }), /Timed out/);
  } finally { handler.close(); await fixture.close(); }
});

test('a wait timeout after navigation leaves the committed page available for inspection', async () => {
  const handler = createMCPHandler();
  try {
    await assert.rejects(handler.callTool('goto', { url, waitUntil: 'done', timeout: 20 }), /Timed out/);
    assert.equal((await handler.callTool('html', { selector: 'h1' })).content[0].text, '<h1>Example</h1>');
  } finally { handler.close(); }
});

test('MCP cookie inspection and JSON environment references remain session scoped', async () => {
  const fixture = await createFixture();
  const handler = createMCPHandler({ env: { LP_TEST_FIXTURE: 'known-fixture', OTHER: 'ignored' } });
  const isolated = createMCPHandler();
  try {
    assert.deepEqual(data(await handler.callTool('getEnv')), ['LP_TEST_FIXTURE']);
    assert.equal((await handler.callTool('getEnv', { name: 'OTHER' })).content[0].text, 'OTHER is not set');
    await handler.callTool('goto', { url: fixture.url });
    assert.ok(data(await handler.callTool('getCookies')).some(cookie => cookie.name === 'server' && cookie.httpOnly));
    await isolated.callTool('goto', { url: `${fixture.url}next` });
    assert.deepEqual(data(await isolated.callTool('getCookies')), []);
    assert.equal((await handler.callTool('evaluate', { script: '"$LP_TEST_FIXTURE"' })).content[0].text, 'known-fixture');
    await assert.rejects(handler.callTool('evaluate', { script: '"$LP_MISSING"' }), /is not set/);
  } finally { handler.close(); isolated.close(); await fixture.close(); }
});

test('MCP save and download preserve existing files on failure and constrain writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'red-panda-mcp-'));
  const outside = await mkdtemp(join(tmpdir(), 'red-panda-mcp-outside-'));
  const fixture = await createFixture();
  const handler = createMCPHandler({ cwd: directory, env: { LP_TEST_FIXTURE: 'must-not-be-written' } });
  try {
    const script = 'const value="$LP_TEST_FIXTURE"; return value;';
    await handler.callTool('save', { path: 'nested/script.js', script });
    assert.equal(await readFile(join(directory, 'nested/script.js'), 'utf8'), script);
    assert.equal((await stat(join(directory, 'nested/script.js'))).mode & 0o777, 0o600);
    await assert.rejects(handler.callTool('save', { path: '../escape.js', script }), /relative path/);
    await symlink(outside, join(directory, 'outside'));
    await assert.rejects(handler.callTool('save', { path: 'outside/escape.js', script }), /symlink/);
    await handler.callTool('goto', { url: `${fixture.url}next` });
    await writeFile(join(directory, 'download.html'), 'existing');
    assert.equal((await handler.callTool('download', { url: `${fixture.url}missing`, path: 'download.html' })).isError, true);
    assert.equal(await readFile(join(directory, 'download.html'), 'utf8'), 'existing');
    const result = data(await handler.callTool('download', { url: `${fixture.url}next`, path: 'download.html' }));
    assert.equal(result.httpStatus, 200); assert.match(await readFile(result.path, 'utf8'), /Next page/);
  } finally { handler.close(); await fixture.close(); await rm(directory, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('MCP stdio transport processes JSON lines, survives malformed JSON, and omits notification replies', async () => {
  const input = new PassThrough(), output = new PassThrough();
  let text = ''; output.on('data', chunk => { text += chunk; });
  const running = runMCPStdio({ input, output });
  input.end('bad json\n'+JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })+'\n'+
    JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } })+'\n'+
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })+'\n');
  await running;
  const rows = text.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 3); assert.equal(rows[0].error.code, -32700);
  assert.equal(rows[1].id, 0); assert.equal(rows[1].result.serverInfo.name, 'red-panda');
  assert.deepEqual(rows[2].result, {});
});
