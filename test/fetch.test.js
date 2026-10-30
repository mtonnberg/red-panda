import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Browser } from '../src/browser.js';
import { installFetch } from '../src/fetch.js';

async function fixture(action) {
  const requests = [], servers = [];
  for (let index = 0; index < 2; index++) {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://fixture/'), chunks = [];
      try { for await (const chunk of req) chunks.push(chunk); } catch { return; }
      const body = Buffer.concat(chunks); requests.push({ index, url, method: req.method, headers: req.headers, body });
      if (url.pathname === '/') return void res.end('<!doctype html><title>fetch fixture</title>');
      if (url.pathname === '/slow') { await delay(100); if (!res.destroyed) res.end('late body'); return; }
      if (url.pathname === '/disconnect') return void req.socket.destroy();
      if (url.pathname === '/redirect') { res.writeHead(302, { location: url.searchParams.get('to') }); res.end(); return; }
      if (url.pathname === '/cors') {
        if (!url.searchParams.has('deny')) res.setHeader('access-control-allow-origin', url.searchParams.has('wildcard') ? '*' : req.headers.origin ?? 'null');
        res.setHeader('access-control-allow-credentials', 'true');
        res.setHeader('access-control-allow-methods', 'GET, POST, PUT');
        res.setHeader('access-control-allow-headers', 'x-custom, content-type');
        res.setHeader('access-control-expose-headers', 'x-visible');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      }
      res.setHeader('x-visible', 'visible'); res.setHeader('x-hidden', 'hidden'); res.setHeader('set-cookie', 'received=yes; Path=/');
      if (url.pathname === '/binary') { res.setHeader('content-type', 'application/octet-stream'); res.end(Buffer.from([0, 1, 254, 255])); return; }
      if (url.pathname === '/form') { res.setHeader('content-type', 'application/x-www-form-urlencoded'); res.end('field=one+two&field=three'); return; }
      if (url.pathname === '/missing') { res.writeHead(404); res.end('missing'); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ method: req.method, headers: req.headers, body: body.toString(), base64: body.toString('base64'), values: [1, 2] }));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
  }
  const [base, cross] = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  const browser = new Browser({ timeout: 1500 }), page = browser.createPage();
  try { await page.navigate(`${base}/`); installFetch(page, page.dom.window); await action({ browser, page, window: page.dom.window, base, cross, requests }); }
  finally { browser.close(); await Promise.all(servers.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }))); }
}

test('fetch uses transport UA, cookies, CDP defaults and document-realm promises/results', async () => fixture(async ({ page, window, base }) => {
  page.userAgent = 'RedPanda-Fetch-Test'; page.extraHTTPHeaders.set('x-network-default', 'configured');
  window.document.cookie = 'documentCookie=yes';
  const network = []; page.on('request', request => network.push(request));
  const pending = window.fetch('/echo', { headers: { 'x-custom': 'value', cookie: 'injected=bad', 'user-agent': 'fake' } });
  assert.ok(pending instanceof window.Promise);
  const response = await pending;
  assert.ok(response instanceof window.Response); assert.ok(response.headers instanceof window.Headers);
  assert.equal(response.type, 'basic'); assert.equal(response.url, `${base}/echo`); assert.equal(response.status, 200); assert.equal(response.ok, true);
  assert.equal(response.headers.get('set-cookie'), null); assert.deepEqual([...response.headers.getSetCookie()], []);
  assert.throws(() => response.headers.set('x-change', 'no'), window.TypeError);
  const read = response.json(); assert.ok(read instanceof window.Promise); assert.equal(response.bodyUsed, true);
  const json = await read; assert.ok(json instanceof window.Object); assert.ok(json.values instanceof window.Array);
  assert.equal(json.headers['user-agent'], 'RedPanda-Fetch-Test'); assert.equal(json.headers['x-network-default'], 'configured');
  assert.equal(json.headers['x-custom'], 'value'); assert.match(json.headers.cookie, /documentCookie=yes/); assert.doesNotMatch(json.headers.cookie, /injected/);
  assert.equal(json.headers.referer, `${base}/`); assert.match(window.document.cookie, /received=yes/);
  assert.equal(network.length, 1); assert.equal(network[0].type, 'Fetch');
  await assert.rejects(response.text(), window.TypeError);
}));

test('Request bodies and clones preserve Blob, multipart, URLSearchParams and typed-view bytes', async () => fixture(async ({ window, base }) => {
  const echo = async body => (await window.fetch('/echo', { method: 'POST', body })).json();
  assert.equal((await echo('héllo')).body, 'héllo');
  const params = await echo(new window.URLSearchParams({ field: 'one two' })); assert.equal(params.body, 'field=one+two');
  const view = await echo(new window.Uint8Array([9, 1, 2, 8]).subarray(1, 3)); assert.equal(view.base64, 'AQI=');
  const blob = await echo(new window.Blob([new window.Uint8Array([0, 4, 255])], { type: 'application/test' }));
  assert.equal(blob.base64, 'AAT/'); assert.equal(blob.headers['content-type'], 'application/test');
  const form = new window.FormData(); form.append('field', 'value'); form.append('file', new window.Blob(['file body'], { type: 'text/plain' }), 'sample.txt');
  const request = new window.Request('/echo', { method: 'POST', body: form }); const clone = request.clone();
  form.set('field', 'changed after request construction');
  const sent = await window.fetch(request); assert.equal(request.bodyUsed, false);
  const json = await sent.json(); assert.match(json.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.match(json.body, /name="field"\r\n\r\nvalue/); assert.doesNotMatch(json.body, /changed after/); assert.match(json.body, /filename="sample.txt"/);
  const cloned = await clone.formData(); assert.ok(cloned instanceof window.FormData); assert.equal(cloned.get('field'), 'value');
  assert.ok(cloned.get('file') instanceof window.File); assert.equal(cloned.get('file').name, 'sample.txt');
  const afterUpload = await request.clone().formData(); assert.equal(afterUpload.get('field'), 'value'); assert.equal(await afterUpload.get('file').text(), 'file body');
  assert.equal(new window.Request('/echo').url, `${base}/echo`);
}));

test('Response clone and body methods retain page values, metadata and header guards', async () => fixture(async ({ window }) => {
  const response = await window.fetch('/binary'), clone = response.clone();
  assert.equal(clone.type, response.type); assert.equal(clone.url, response.url);
  assert.throws(() => clone.headers.delete('content-type'), window.TypeError);
  const buffer = await response.arrayBuffer(); assert.ok(buffer instanceof window.ArrayBuffer); assert.deepEqual([...new window.Uint8Array(buffer)], [0, 1, 254, 255]);
  const streamed = await window.fetch('/binary');
  const reader = streamed.body.getReader(), chunk = await reader.read(); assert.ok(chunk.value instanceof window.Uint8Array);
  assert.deepEqual([...chunk.value], [0, 1, 254, 255]); assert.equal((await reader.read()).done, true);
  const blob = await clone.blob(); assert.ok(blob instanceof window.Blob); assert.equal(blob.type, 'application/octet-stream'); assert.equal(blob.size, 4);
  const form = await (await window.fetch('/form')).formData(); assert.ok(form instanceof window.FormData); assert.deepEqual([...form.getAll('field')], ['one two', 'three']);
  const built = window.Response.json({ answer: 42 }); built.headers.set('x-mutable', 'yes');
  assert.equal(built.status, 200); assert.equal(built.headers.get('content-type'), 'application/json'); assert.equal((await built.json()).answer, 42);
  const empty = window.Response.error(); assert.equal(empty.type, 'error'); assert.equal(empty.status, 0); assert.equal(empty.body, null);
  assert.equal(await new window.Response(new window.Response('stream body').body).text(), 'stream body');
  const redirect = window.Response.redirect('/target'); assert.equal(redirect.status, 302); assert.match(redirect.headers.get('location'), /\/target$/);
  assert.throws(() => redirect.headers.set('x-test', 'no'), window.TypeError);
  const headers = new window.Headers([['X-Test', 'one'], ['x-test', 'two']]);
  assert.equal(headers.get('X-TEST'), 'one, two'); assert.ok(headers.entries().next().value instanceof window.Array);
  assert.equal(new window.Response(null, { headers: { 'set-cookie': 'hidden=yes' } }).headers.get('set-cookie'), null);
}));

test('CORS enforces preflight, origin, credential policy, and exposed response headers', async () => fixture(async ({ window, base, cross, requests }) => {
  window.document.cookie = 'originCookie=yes';
  const response = await window.fetch(`${cross}/cors`); assert.equal(response.type, 'cors');
  assert.equal(response.headers.get('x-visible'), 'visible'); assert.equal(response.headers.get('x-hidden'), null); assert.equal(response.headers.get('set-cookie'), null);
  const ordinary = await response.json(); assert.equal(ordinary.headers.origin, base); assert.equal(ordinary.headers.cookie, undefined);
  const credentials = await (await window.fetch(`${cross}/cors`, { credentials: 'include' })).json(); assert.match(credentials.headers.cookie, /originCookie=yes/);
  const preflight = await window.fetch(`${cross}/cors`, { method: 'PUT', headers: { 'x-custom': 'value' }, body: 'payload' });
  assert.equal((await preflight.json()).body, 'payload');
  const options = requests.find(request => request.index === 1 && request.method === 'OPTIONS');
  assert.equal(options.headers.origin, base); assert.equal(options.headers.cookie, undefined);
  assert.equal(options.headers['access-control-request-method'], 'PUT'); assert.equal(options.headers['access-control-request-headers'], 'x-custom');
  await assert.rejects(window.fetch(`${cross}/cors?deny`), window.TypeError);
  await assert.rejects(window.fetch(`${cross}/cors?wildcard`, { credentials: 'include' }), window.TypeError);
  const before = requests.length;
  await assert.rejects(window.fetch(`${cross}/cors`, { mode: 'same-origin' }), window.TypeError); assert.equal(requests.length, before);
}));

test('no-cors requests have safelisted headers and opaque cross-origin responses', async () => fixture(async ({ window, cross, requests }) => {
  const request = new window.Request(`${cross}/echo`, { mode: 'no-cors', method: 'POST', body: 'payload', headers: { 'x-forbidden': 'hidden', 'content-type': 'application/json' } });
  assert.equal(request.headers.get('x-forbidden'), null); assert.match(request.headers.get('content-type'), /^text\/plain/);
  request.headers.set('x-other', 'no'); request.headers.set('accept-language', 'en');
  const response = await window.fetch(request);
  assert.equal(response.type, 'opaque'); assert.equal(response.status, 0); assert.equal(response.statusText, ''); assert.equal(response.url, '');
  assert.equal(response.ok, false); assert.equal(response.body, null); assert.deepEqual([...response.headers], []); assert.equal(await response.text(), '');
  assert.equal((await response.clone().arrayBuffer()).byteLength, 0); await assert.rejects(response.json(), window.SyntaxError);
  const actual = requests.find(request => request.index === 1 && request.url.pathname === '/echo');
  assert.equal(actual.headers['x-forbidden'], undefined); assert.equal(actual.headers['x-other'], undefined); assert.equal(actual.headers['accept-language'], 'en');
  await assert.rejects(window.fetch(`${cross}/echo`, { mode: 'no-cors', method: 'PUT' }), window.TypeError);
  const same = await window.fetch('/echo', { mode: 'no-cors' }); assert.equal(same.type, 'basic'); assert.equal(same.status, 200);
}));

test('redirect follow, manual, error and cross-origin credentials have deliberate behavior', async () => fixture(async ({ window, base, cross, requests }) => {
  window.document.cookie = 'originCookie=yes';
  const location = `/redirect?to=${encodeURIComponent(`${base}/echo`)}`;
  const followed = await window.fetch(location); assert.equal(followed.url, `${base}/echo`); assert.equal(followed.redirected, true);
  const manual = await window.fetch(location, { redirect: 'manual' }); assert.equal(manual.type, 'opaqueredirect'); assert.equal(manual.status, 0);
  assert.equal(manual.headers.get('location'), null); assert.equal(manual.url, ''); assert.equal(await manual.text(), '');
  const before = requests.filter(request => request.url.pathname === '/echo').length;
  await assert.rejects(window.fetch(location, { redirect: 'error' }), window.TypeError);
  assert.equal(requests.filter(request => request.url.pathname === '/echo').length, before);
  const redirected = await window.fetch(`/redirect?to=${encodeURIComponent(`${cross}/cors`)}`);
  assert.equal(redirected.type, 'cors'); assert.equal((await redirected.json()).headers.cookie, undefined);
  await assert.rejects(window.fetch(`/redirect?to=${encodeURIComponent(`${cross}/cors`)}`, { mode: 'same-origin' }), window.TypeError);
  await assert.rejects(window.fetch(`/redirect?to=${encodeURIComponent(`${cross}/cors`)}`, { headers: { 'x-custom': 'value' } }), /preflight/);
}));

test('credentials omit disables cookies and referrer policies control the actual network header', async () => fixture(async ({ window, page, base, cross }) => {
  window.document.cookie = 'present=yes';
  const omitted = await (await window.fetch('/echo', { credentials: 'omit', referrerPolicy: 'no-referrer' })).json();
  assert.equal(omitted.headers.cookie, undefined); assert.equal(omitted.headers.referer, undefined);
  assert.doesNotMatch(window.document.cookie, /received=yes/);
  const explicit = await (await window.fetch('/echo', { referrer: '' })).json(); assert.equal(explicit.headers.referer, undefined);
  await page.navigate(`${base}/path?secret=value`); const current = page.dom.window; installFetch(page, current);
  const origin = await (await current.fetch(`${cross}/cors`, { referrerPolicy: 'origin' })).json(); assert.equal(origin.headers.referer, `${base}/`);
  const unsafe = await (await current.fetch(`${cross}/cors`, { referrerPolicy: 'unsafe-url' })).json(); assert.equal(unsafe.headers.referer, `${base}/path?secret=value`);
}));

test('signals, malformed requests, HTTP errors and network failures preserve observable errors', async () => fixture(async ({ window }) => {
  const controller = new window.AbortController(); const reason = { requested: 'cancel' };
  const pending = window.fetch('/slow', { signal: controller.signal }); controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  const already = new window.AbortController(); already.abort();
  await assert.rejects(window.fetch('/echo', { signal: already.signal }), { name: 'AbortError' });
  await assert.rejects(window.fetch('/disconnect'), window.TypeError);
  await assert.rejects(window.fetch(), window.TypeError);
  await assert.rejects(window.fetch('/echo', { method: 'GET', body: 'invalid' }), window.TypeError);
  const uploaded = await (await window.fetch('/echo', { method: 'POST', body: new window.Response('upload').body, get duplex() { throw new Error('duplex getter must not run'); } })).json(); assert.equal(uploaded.body, 'upload'); assert.equal(uploaded.headers['content-type'] ?? null, null);
  const missing = await window.fetch('/missing'); assert.equal(missing.status, 404); assert.equal(missing.ok, false); assert.equal(await missing.text(), 'missing');
  const data = await window.fetch('data:text/plain;base64,aGVsbG8='); assert.equal(await data.text(), 'hello');
}));

test('aborting a resolved response errors unread bodies, clones and stream readers with the original reason', async () => fixture(async ({ window }) => {
  const controller = new window.AbortController(), reason = { original: 'body abort reason' };
  const response = await window.fetch('/echo', { signal: controller.signal }), clone = response.clone();
  // Give the native tee time to prefetch; each unread branch must still abort.
  await delay(5); controller.abort(reason);
  await assert.rejects(response.text(), error => error === reason);
  await assert.rejects(clone.json(), error => error === reason);
  const streamAbort = new window.AbortController();
  const streamed = await window.fetch('/echo', { signal: streamAbort.signal }); streamAbort.abort(reason);
  await assert.rejects(streamed.body.getReader().read(), error => error === reason);
  const completeAbort = new window.AbortController();
  const complete = await window.fetch('/echo', { signal: completeAbort.signal });
  const text = await complete.text(); completeAbort.abort(); assert.ok(text.length > 0);
}));

test('inherited iframe origins remain same-origin and cannot be forged through window.origin', async () => fixture(async ({ page, window, base }) => {
  window.document.cookie = 'inheritedCookie=yes';
  const iframe = window.document.createElement('iframe'); window.document.body.append(iframe);
  const child = iframe.contentWindow; installFetch(page, child);
  assert.equal(child.location.origin, 'null'); assert.equal(child.origin, base);
  child.origin = 'http://forged.invalid';
  const response = await child.fetch(`${base}/echo`, { mode: 'same-origin' });
  assert.equal(response.type, 'basic'); assert.match((await response.json()).headers.cookie, /inheritedCookie=yes/);
  const foreignRequest = new window.Request('/echo', { method: 'POST', body: 'cross-realm request' });
  assert.equal((await (await child.fetch(foreignRequest)).json()).body, 'cross-realm request');
}));

test('document navigation, window close and page close suppress old-realm promise callbacks', async () => fixture(async ({ browser, page, window, base }) => {
  let callbacks = 0;
  window.fetch('/slow').then(() => callbacks++, () => callbacks++);
  await page.navigate(`${base}/echo`); await delay(130); assert.equal(callbacks, 0);
  let current = page.dom.window; installFetch(page, current);
  current.fetch('/slow').then(() => callbacks++, () => callbacks++); page.close(); await delay(130); assert.equal(callbacks, 0);
  const other = browser.createPage(); await other.navigate(base); current = other.dom.window; installFetch(other, current);
  current.fetch('/slow').then(() => callbacks++, () => callbacks++); current.close(); await delay(130); assert.equal(callbacks, 0);
}));
