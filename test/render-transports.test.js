import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMCPHandler } from '../src/mcp.js';
import { serve } from '../src/cdp.js';
import { connect } from './cdp-client.js';

const exec = promisify(execFile);
const source = '<h1 id=title>Independent rendering</h1><p>Actual page text.</p>';
const url = `data:text/html,${encodeURIComponent(source)}`;
const pngSize = bytes => { assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };

test('CLI PNG/PDF dumps write raw binary and base64 JSON with original HTTP metadata', async () => {
  for (const format of ['png', 'pdf']) {
    const raw = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', format, url], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
    const wrapped = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', format, '--json', url], { maxBuffer: 8 * 1024 * 1024 });
    const result = JSON.parse(wrapped.stdout), bytes = Buffer.from(result.content, 'base64');
    assert.equal(result.error, null); assert.equal(result.dump, format); assert.equal(result.http_status, 200); assert.equal(result.url, url);
    if (format === 'png') { assert.equal(pngSize(raw.stdout)[0], 1920); assert.deepEqual(pngSize(bytes), pngSize(raw.stdout)); assert.ok(bytes.length > 1000); }
    else { assert.equal(raw.stdout.subarray(0, 8).toString(), '%PDF-1.4'); assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.4'); assert.match(bytes.toString('latin1'), /\/FontFile2/); }
  }
});

test('MCP screenshots navigate, scope content, return real images and save actual private files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'red-panda-render-mcp-'));
  const handler = createMCPHandler({ cwd });
  try {
    await assert.rejects(handler.callTool('screenshot'), /FrameNotLoaded/);
    assert.ok(handler.tools.includes('screenshot'));
    const viewport = await handler.callTool('screenshot', { url });
    assert.equal(viewport.isError, false); assert.equal(viewport.content[0].type, 'image'); assert.equal(viewport.content[0].mimeType, 'image/png');
    assert.deepEqual(pngSize(Buffer.from(viewport.content[0].data, 'base64')), [1280, 1080]);
    assert.equal(viewport.content[1].text, 'PNG, 1280x1080');
    const full = await handler.callTool('screenshot', { fullPage: true });
    const fullSize = pngSize(Buffer.from(full.content[0].data, 'base64')); assert.equal(fullSize[0], 1280); assert.ok(fullSize[1] < 1080);
    const selected = await handler.callTool('screenshot', { selector: '#title', fullPage: true });
    assert.ok(pngSize(Buffer.from(selected.content[0].data, 'base64'))[1] < fullSize[1]);
    const saved = await handler.callTool('screenshot', { fullPage: true, path: 'images/page.png' });
    const file = join(cwd, 'images/page.png'), bytes = await readFile(file);
    assert.equal(pngSize(bytes)[0], 1920); assert.match(saved.content[0].text, /^Saved 1920x\d+ PNG to /); assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(handler.callTool('screenshot', { path: '../outside.png' }), /path/);
    await assert.rejects(handler.callTool('screenshot', { selector: '#absent' }), /NodeNotFound/);
    const invalid = await handler.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'screenshot', arguments: { selector: '#title', backendNodeId: 1 } } });
    assert.equal(invalid.error.code, -32602);
  } finally { handler.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('LP.dump returns real base64 PNG/PDF artifacts and validates selected nodes', async () => {
  const service = await serve({ port: 0 }), client = await connect(`ws://127.0.0.1:${service.port}/`);
  try {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => client.send(method, params, sessionId);
    await send('Page.navigate', { url });
    const whole = await send('LP.dump', { format: 'png' }), selected = await send('LP.dump', { format: 'png', selector: '#title' });
    assert.equal(whole.format, 'png'); assert.equal(pngSize(Buffer.from(whole.content, 'base64'))[0], 1920);
    assert.ok(pngSize(Buffer.from(selected.content, 'base64'))[1] < pngSize(Buffer.from(whole.content, 'base64'))[1]);
    const pdf = await send('LP.dump', { format: 'pdf' }); assert.equal(Buffer.from(pdf.content, 'base64').subarray(0, 8).toString(), '%PDF-1.4');
    await assert.rejects(send('LP.dump', { format: 'png', selector: '#missing' }), error => error.code === -32602);
  } finally { await client.close(); await service.close(); }
});

test('CDP screenshots respect viewport, full content and clips; PDF streams contain real bytes', async () => {
  const service = await serve({ port: 0 }), client = await connect(`ws://127.0.0.1:${service.port}/`);
  try {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => client.send(method, params, sessionId);
    await send('Page.navigate', { url: `data:text/html,${encodeURIComponent('<h1>Real CDP artifacts</h1>'+ '<p>Own line</p>'.repeat(100))}` });
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 200, deviceScaleFactor: 1, mobile: false });
    const viewport = Buffer.from((await send('Page.captureScreenshot')).data, 'base64'); assert.deepEqual(pngSize(viewport), [320, 200]);
    const full = Buffer.from((await send('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'); assert.ok(pngSize(full)[1] > 200);
    const clipped = Buffer.from((await send('Page.captureScreenshot', { clip: { x: 10, y: 20, width: 100, height: 50, scale: 2 } })).data, 'base64'); assert.deepEqual(pngSize(clipped), [200, 100]);
    await assert.rejects(send('Page.captureScreenshot', { format: 'jpeg' }), error => error.code === -32000);
    const { stream, data } = await send('Page.printToPDF', { transferMode: 'ReturnAsStream', paperWidth: 4, paperHeight: 6 });
    assert.equal(data, ''); assert.equal(typeof stream, 'string');
    const chunks = []; let eof = false;
    while (!eof) { const part = await send('IO.read', { handle: stream, size: 512 }); assert.equal(part.base64Encoded, true); chunks.push(Buffer.from(part.data, 'base64')); eof = part.eof; }
    const pdf = Buffer.concat(chunks); assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4'); assert.ok(pdf.length > 1000);
    assert.equal((await send('IO.read', { handle: stream })).eof, true);
    assert.equal(Buffer.from((await send('IO.read', { handle: stream, offset: 0, size: 8 })).data, 'base64').toString(), '%PDF-1.4');
    await send('IO.close', { handle: stream });
    await assert.rejects(send('IO.read', { handle: stream }), error => error.code === -32000);
    await assert.rejects(send('Page.printToPDF', { scale: 0 }), error => error.code === -32602);
  } finally { await client.close(); await service.close(); }
});
