import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import { Browser } from '../src/browser.js';
import { installBeacon } from '../src/beacon.js';

async function fixture(action, { enabled = true } = {}) {
  const records = [], servers = [];
  for (let index = 0; index < 2; index++) {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://fixture/'), chunks = [];
      try { for await (const chunk of req) chunks.push(chunk); } catch { return; }
      const bytes = Buffer.concat(chunks); records.push({ index, path: url.pathname, method: req.method, headers: req.headers, bytes });
      if (url.pathname === '/') { res.end('<!doctype html><title>Beacon fixture</title><body></body>'); return; }
      if (url.pathname === '/disconnect') { req.socket.destroy(); return; }
      if (url.pathname.startsWith('/hold')) { await delay(100); if (res.destroyed) return; }
      if (url.pathname === '/redirect') { res.writeHead(302, { location: url.searchParams.get('to') }); res.end(); return; }
      if (url.pathname === '/cors') {
        if (url.searchParams.has('allow')) {
          res.setHeader('access-control-allow-origin', req.headers.origin ?? 'null'); res.setHeader('access-control-allow-credentials', 'true');
          res.setHeader('access-control-allow-headers', 'content-type'); res.setHeader('access-control-allow-methods', 'POST, GET');
        }
        if (req.method === 'OPTIONS') { res.setHeader('set-cookie', 'preflightCookie=forbidden; Path=/'); res.writeHead(204); res.end(); return; }
      }
      res.setHeader('set-cookie', 'beaconCookie=received; Path=/'); res.end('received');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
  }
  const [base, cross] = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  const browser = new Browser({ timeout: 1000, loadResources: ['iframe', ...(enabled ? ['beacon'] : [])] }), page = browser.createPage();
  try {
    await page.navigate(base); const window = page.dom.window, controller = installBeacon(page, window, { enabled });
    await action({ browser, page, window, controller, base, cross, records });
    await controller.whenIdle();
  } finally {
    browser.close(); await Promise.all(servers.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })));
  }
}

test('disabled resource policy validates URL/body/bytes but sends no requests and reserves no aggregate quota', async () => fixture(async ({ window, controller, records }) => {
  const nav = window.navigator;
  const descriptor = Object.getOwnPropertyDescriptor(window.Navigator.prototype, 'sendBeacon');
  assert.equal(Object.hasOwn(nav, 'sendBeacon'), false); assert.equal(descriptor.enumerable, true); assert.equal(descriptor.configurable, true); assert.equal(descriptor.writable, true);
  assert.throws(() => nav.sendBeacon(), window.TypeError); assert.throws(() => nav.sendBeacon('http://['), window.TypeError);
  for (const url of ['ftp://example.test/', 'data:text/plain,hi', 'file:///tmp/example']) assert.throws(() => nav.sendBeacon(url), window.TypeError);
  assert.throws(() => nav.sendBeacon('/invalid', new ReadableStream()), window.TypeError);
  assert.throws(() => nav.sendBeacon.call({}, '/invalid'), window.TypeError);
  assert.equal(nav.sendBeacon('/too-large', 'x'.repeat(65537)), false); assert.equal(nav.sendBeacon('/unicode', '€'.repeat(21846)), false);
  assert.equal(nav.sendBeacon('/max', 'x'.repeat(65536)), true); assert.equal(nav.sendBeacon('/again', 'x'.repeat(65536)), true);
  assert.equal(nav.sendBeacon('/none'), true); assert.equal(nav.sendBeacon('/body', 'payload'), true);
  await delay(15); assert.equal(records.filter(record => record.method !== 'GET').length, 0); assert.equal(controller.pending, 0); assert.equal(controller.inflightBytes, 0);
}, { enabled: false }));

test('enabled beacons send POST through actual shared UA/header/cookie/CDP transport', async () => fixture(async ({ page, window, controller, base, records }) => {
  page.userAgent = 'RedPanda-Beacon-Test'; page.extraHTTPHeaders.set('x-network-default', 'configured'); window.document.cookie = 'documentCookie=yes';
  const network = []; page.on('request', request => network.push(request));
  assert.equal(window.navigator.sendBeacon('/post', 'héllo'), true); await controller.whenIdle();
  const sent = records.find(record => record.path === '/post'); assert.equal(sent.method, 'POST'); assert.equal(sent.bytes.toString(), 'héllo');
  assert.equal(sent.headers['content-type'], 'text/plain;charset=UTF-8'); assert.equal(sent.headers['user-agent'], 'RedPanda-Beacon-Test');
  assert.equal(sent.headers['x-network-default'], 'configured'); assert.equal(sent.headers.origin, base); assert.equal(sent.headers.referer, `${base}/`);
  assert.match(sent.headers.cookie, /documentCookie=yes/); assert.match(window.document.cookie, /beaconCookie=received/);
  assert.equal(network.length, 1); assert.equal(network[0].type, 'Ping'); assert.equal(controller.pending, 0); assert.equal(controller.inflightBytes, 0); assert.deepEqual(controller.errors, []);
}));

test('body snapshots preserve actual Blob/File/FormData/search-parameter/buffer bytes and MIME types', async () => fixture(async ({ window, controller, records }) => {
  const bytes = new window.Uint8Array([9, 1, 2, 8]);
  assert.equal(window.navigator.sendBeacon('/none'), true);
  assert.equal(window.navigator.sendBeacon('/buffer', bytes.subarray(1, 3)), true); bytes.fill(0);
  assert.equal(window.navigator.sendBeacon('/blob', new window.Blob(['{}'], { type: 'application/json' })), true);
  assert.equal(window.navigator.sendBeacon('/raw-blob', new window.Blob(['raw'])), true);
  assert.equal(window.navigator.sendBeacon('/params', new window.URLSearchParams('a=one+two&b=%2B')), true);
  assert.equal(window.navigator.sendBeacon('/symbol', window.Symbol('own')), true);
  assert.equal(window.navigator.sendBeacon('/symbol-empty', window.Symbol()), true);
  const form = new window.FormData(); form.append('field', 'value'); form.append('file', new window.File([new window.Uint8Array([0, 4, 255])], 'sample.bin', { type: 'application/octet-stream' }));
  assert.equal(window.navigator.sendBeacon('/form', form), true); form.set('field', 'mutated after queue');
  await controller.whenIdle(); const byPath = path => records.find(record => record.path === path);
  assert.equal(byPath('/none').headers['content-type'], undefined); assert.equal(byPath('/none').bytes.length, 0);
  assert.deepEqual([...byPath('/buffer').bytes], [1, 2]); assert.equal(byPath('/buffer').headers['content-type'], undefined);
  assert.equal(byPath('/blob').bytes.toString(), '{}'); assert.equal(byPath('/blob').headers['content-type'], 'application/json');
  assert.equal(byPath('/raw-blob').bytes.toString(), 'raw'); assert.equal(byPath('/raw-blob').headers['content-type'], undefined);
  assert.equal(byPath('/params').bytes.toString(), 'a=one+two&b=%2B'); assert.equal(byPath('/params').headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  assert.equal(byPath('/symbol').bytes.toString(), 'own'); assert.equal(byPath('/symbol').headers['content-type'], 'text/plain;charset=UTF-8');
  assert.equal(byPath('/symbol-empty').bytes.toString(), 'undefined');
  const sent = byPath('/form'); assert.match(sent.headers['content-type'], /^multipart\/form-data; boundary=/);
  const decoded = await new Response(sent.bytes, { headers: { 'content-type': sent.headers['content-type'] } }).formData();
  assert.equal(decoded.get('field'), 'value'); assert.equal(decoded.get('file').name, 'sample.bin'); assert.deepEqual([...new Uint8Array(await decoded.get('file').arrayBuffer())], [0, 4, 255]);
}));

test('enabled per-document 64-KiB quota includes in-flight bodies and becomes available again after settlement', async () => fixture(async ({ window, controller, records }) => {
  assert.equal(window.navigator.sendBeacon('/hold/max', 'x'.repeat(65536)), true);
  assert.equal(window.navigator.sendBeacon('/hold/empty', ''), true);
  assert.equal(window.navigator.sendBeacon('/hold/over', 'x'), false); assert.equal(controller.inflightBytes, 65536);
  await controller.whenIdle(); assert.equal(controller.inflightBytes, 0);
  assert.equal(window.navigator.sendBeacon('/freed', 'x'.repeat(65536)), true); await controller.whenIdle();
  assert.equal(records.find(record => record.path === '/hold/max').bytes.length, 65536); assert.equal(records.some(record => record.path === '/hold/over'), false);
  assert.equal(records.find(record => record.path === '/freed').bytes.length, 65536);
}));

test('cross-origin safelisted beacons send directly while JSON bodies require real credentialed CORS preflight', async () => fixture(async ({ window, controller, cross, base, records }) => {
  window.document.cookie = 'credentialCookie=yes';
  assert.equal(window.navigator.sendBeacon(`${cross}/plain`, 'text'), true);
  assert.equal(window.navigator.sendBeacon(`${cross}/cors`, new window.Blob(['{}'], { type: 'application/json' })), true);
  assert.equal(window.navigator.sendBeacon(`${cross}/cors?allow`, new window.Blob(['{}'], { type: 'application/json' })), true);
  await controller.whenIdle();
  const plain = records.find(record => record.index === 1 && record.path === '/plain'); assert.equal(plain.method, 'POST'); assert.match(plain.headers.cookie, /credentialCookie=yes/);
  const options = records.filter(record => record.index === 1 && record.method === 'OPTIONS'); assert.equal(options.length, 2);
  for (const request of options) { assert.equal(request.headers.origin, base); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['access-control-request-method'], 'POST'); assert.equal(request.headers['access-control-request-headers'], 'content-type'); }
  assert.equal(records.filter(record => record.index === 1 && record.path === '/cors' && record.method === 'POST').length, 1);
  assert.equal(controller.errors.length, 1); assert.match(controller.errors[0].message, /CORS/);
  assert.doesNotMatch(window.document.cookie, /preflightCookie/); assert.equal(controller.inflightBytes, 0);
}));

test('frame beacons have independent quotas and keep sending after immediate iframe removal', async () => fixture(async ({ page, window, controller, records }) => {
  const element = window.document.createElement('iframe'); window.document.body.append(element);
  const frame = page.frames.findElement(element), child = element.contentWindow, childController = installBeacon(frame, child, { enabled: true });
  assert.equal(window.navigator.sendBeacon('/hold/parent', 'x'.repeat(60000)), true);
  assert.equal(child.navigator.sendBeacon('/hold/child', 'bye'), true);
  assert.equal(child.navigator.sendBeacon('/hold/child-max', 'x'.repeat(65536 - 3)), true);
  assert.equal(child.navigator.sendBeacon('/hold/child-over', 'x'), false);
  element.remove(); await Promise.all([controller.whenIdle(), childController.whenIdle()]);
  assert.equal(records.find(record => record.path === '/hold/child').bytes.toString(), 'bye'); assert.equal(records.find(record => record.path === '/hold/child-max').bytes.length, 65533);
  assert.equal(records.some(record => record.path === '/hold/child-over'), false); assert.deepEqual(childController.errors, []);
}));

test('root navigation/close cancels queued beacons and network errors free their budgets without page callbacks', async () => fixture(async ({ page, window, controller }) => {
  let errors = 0; window.onerror = () => { errors++; };
  assert.equal(window.navigator.sendBeacon('/disconnect', 'payload'), true); await controller.whenIdle();
  assert.equal(controller.errors.length, 1); assert.equal(controller.inflightBytes, 0); assert.equal(errors, 0);
  assert.equal(window.navigator.sendBeacon('/hold/cancel', 'pending'), true);
  await page.navigate('data:text/html,<title>Next document</title>'); await controller.whenIdle();
  assert.equal(controller.pending, 0); assert.equal(controller.inflightBytes, 0); assert.ok(controller.errors.some(error => error.name === 'AbortError'));
}));

test('Window-only beacon installation and cross-realm borrowed methods retain the receiving navigator owner', async () => fixture(async ({ page, window, controller, records }) => {
  const workerRealm = vm.runInNewContext('({navigator:{},document:{}})'); assert.throws(() => installBeacon({}, workerRealm), /Window realm/);
  const element = window.document.createElement('iframe'); window.document.body.append(element);
  const frame = page.frames.findElement(element), child = element.contentWindow, childController = installBeacon(frame, child, { enabled: true });
  child.navigator.sendBeacon = () => { throw new Error('overridden method must not be invoked'); };
  assert.equal(window.Navigator.prototype.sendBeacon.call(child.navigator, '/borrowed', 'child body'), true);
  await Promise.all([controller.whenIdle(), childController.whenIdle()]); assert.equal(records.find(record => record.path === '/borrowed').bytes.toString(), 'child body');
}));
