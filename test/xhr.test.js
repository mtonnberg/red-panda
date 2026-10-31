import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Browser } from '../src/browser.js';
import { installXHR } from '../src/xhr.js';

async function fixture(action, options = {}) {
  const requests = [];
  const servers = [];
  for (let index = 0; index < 2; index++) {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://fixture/');
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      requests.push({ index, path: url.pathname, method: req.method, headers: req.headers, body });
      if (url.pathname === '/') return void res.end('<!doctype html><title>XHR fixture</title>');
      if (url.pathname === '/held-response') {
        const entry = requests[requests.length - 1];
        entry.release = () => res.end('completed response');
        res.once('close', () => { entry.closedBeforeEnd = !res.writableEnded; });
        res.writeHead(200, { 'content-type': 'text/plain' }); res.write('actual pending bytes'); return;
      }
      if (url.pathname === '/slow') {
        await delay(120); if (res.destroyed) return; res.end('slow body'); return;
      }
      if (url.pathname === '/disconnect') { req.socket.destroy(); return; }
      if (url.pathname === '/redirect') {
        res.writeHead(302, { location: url.searchParams.get('to') }); res.end(); return;
      }
      if (url.pathname === '/cors') {
        if (!url.searchParams.has('deny')) res.setHeader('access-control-allow-origin', url.searchParams.has('wildcard') ? '*' : req.headers.origin ?? 'null');
        res.setHeader('access-control-allow-credentials', 'true');
        res.setHeader('access-control-allow-methods', 'GET, POST, PUT');
        res.setHeader('access-control-allow-headers', 'x-custom, content-type');
        res.setHeader('access-control-expose-headers', 'x-visible');
        res.setHeader('x-visible', 'visible'); res.setHeader('x-hidden', 'hidden');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      }
      if (['/echo', '/cors'].includes(url.pathname)) {
        res.setHeader('content-type', 'application/json');
        res.setHeader('set-cookie', 'transportCookie=received; Path=/');
        res.end(JSON.stringify({ method: req.method, headers: req.headers, body: body.toString(), base64: body.toString('base64') })); return;
      }
      if (url.pathname === '/json') { res.setHeader('content-type', 'application/json'); res.end('{"nested":{"answer":42},"list":[1,2]}'); return; }
      if (url.pathname === '/invalid-json') { res.setHeader('content-type', 'application/json'); res.end('invalid'); return; }
      if (url.pathname === '/binary') { res.setHeader('content-type', 'application/octet-stream'); res.end(Buffer.from([0, 0, 1, 2, 0, 0, 9])); return; }
      if (url.pathname === '/xml') { res.setHeader('content-type', 'application/custom+xml'); res.end('<?xml version="1.0"?><catalog><item/><item/></catalog>'); return; }
      if (url.pathname === '/html') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>response</title><a href="relative">link</a><script>globalThis.responseScriptRan=true</script>'); return; }
      if (url.pathname === '/latin') { res.setHeader('content-type', 'text/plain;charset=windows-1252'); res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9])); return; }
      if (url.pathname === '/missing') { res.writeHead(404, 'Custom missing', { 'content-type': 'text/plain', 'x-visible': 'yes', 'set-cookie': 'hidden=yes' }); res.end('missing body'); return; }
      res.end('body');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
  }
  const [base, cross] = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  const browser = new Browser({ timeout: 1000, ...options });
  const page = browser.createPage();
  try {
    await page.navigate(base); installXHR(page, page.dom.window);
    await action({ browser, page, window: page.dom.window, base, cross, requests });
  } finally {
    browser.close();
    await Promise.all(servers.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })));
  }
}

function send(window, url, { method = 'GET', body, type = '', headers = {}, configure } = {}) {
  const xhr = new window.XMLHttpRequest();
  return new Promise(resolve => {
    let outcome;
    for (const kind of ['load', 'error', 'timeout', 'abort']) xhr.addEventListener(kind, () => { outcome = kind; });
    xhr.onloadend = () => resolve({ xhr, outcome });
    xhr.open(method, url); xhr.responseType = type;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    configure?.(xhr); xhr.send(body);
  });
}

test('XHR uses shared UA, headers, cookies and CDP events with trusted state/progress events', async () => fixture(async ({ page, window, base }) => {
  page.userAgent = 'RedPanda-XHR-test'; page.extraHTTPHeaders.set('x-network-default', 'configured');
  window.document.cookie = 'documentCookie=present';
  const network = []; page.on('request', request => network.push(request));
  const xhr = new window.XMLHttpRequest();
  assert.equal(xhr.readyState, 0); assert.equal(xhr.status, 0); assert.equal(xhr.responseText, '');
  assert.equal(xhr.getAllResponseHeaders(), ''); assert.equal(xhr.getResponseHeader('content-type'), null);
  assert.ok(xhr instanceof window.XMLHttpRequestEventTarget); assert.ok(xhr.upload instanceof window.EventTarget);
  assert.equal(xhr.upload.constructor.name, 'XMLHttpRequestUpload');
  assert.equal(window.XMLHttpRequest.DONE, xhr.DONE); assert.equal(xhr.DONE, 4);
  const states = [], events = [];
  xhr.onreadystatechange = event => { assert.equal(event.currentTarget, xhr); assert.equal(event.isTrusted, true); states.push(xhr.readyState); };
  for (const kind of ['loadstart', 'progress', 'load', 'loadend']) xhr.addEventListener(kind, event => {
    assert.ok(event instanceof window.ProgressEvent); assert.equal(event.isTrusted, true);
    assert.equal(event.cancelable, false); assert.equal(event.bubbles, false); events.push([kind, event.loaded]);
  });
  const complete = once(xhr, 'loadend');
  xhr.open('get', `${base}/echo`);
  xhr.setRequestHeader('X-Multi', 'a'); xhr.setRequestHeader('x-multi', 'b');
  xhr.setRequestHeader('User-Agent', 'forbidden'); xhr.setRequestHeader('Cookie', 'injected=yes'); xhr.setRequestHeader('Sec-Test', 'no');
  xhr.send(); await complete;
  assert.deepEqual(states, [1, 2, 3, 4]);
  assert.deepEqual(events.map(([name]) => name), ['loadstart', 'progress', 'load', 'loadend']); assert.ok(events[1][1] > 0);
  const response = JSON.parse(xhr.responseText);
  assert.equal(response.headers['user-agent'], 'RedPanda-XHR-test'); assert.equal(response.headers['x-network-default'], 'configured');
  assert.equal(response.headers['x-multi'], 'a, b'); assert.equal(response.headers['sec-test'], undefined);
  assert.match(response.headers.cookie, /documentCookie=present/); assert.doesNotMatch(response.headers.cookie, /injected/);
  assert.equal(response.headers.referer, `${base}/`); assert.match(window.document.cookie, /transportCookie=received/);
  assert.equal(xhr.getResponseHeader('set-cookie'), null); assert.doesNotMatch(xhr.getAllResponseHeaders(), /set-cookie/);
  assert.equal(network.length, 1); assert.equal(network[0].type, 'XHR'); assert.equal(network[0].url, `${base}/echo`);
}));

test('text, URLSearchParams, typed views, Blob, FormData and Document bodies preserve actual bytes', async () => fixture(async ({ window, base }) => {
  const echo = async body => {
    const { xhr, outcome } = await send(window, `${base}/echo`, { method: 'POST', body, type: 'json' });
    assert.equal(outcome, 'load'); return xhr.response;
  };
  const text = await echo('héllo'); assert.equal(text.body, 'héllo'); assert.match(text.headers['content-type'], /^text\/plain;charset=UTF-8$/i);
  const params = await echo(new window.URLSearchParams({ a: 'one two', b: '+' })); assert.equal(params.body, 'a=one+two&b=%2B');
  const view = await echo(new window.Uint8Array([9, 1, 2, 8]).subarray(1, 3)); assert.equal(view.base64, 'AQI=');
  const blob = await echo(new window.Blob([new window.Uint8Array([0, 4, 255])], { type: 'application/test' }));
  assert.equal(blob.base64, 'AAT/'); assert.equal(blob.headers['content-type'], 'application/test');
  const data = new window.FormData(); data.append('field', 'value'); data.append('file', new window.Blob(['file body'], { type: 'text/plain' }), 'sample.txt');
  const form = await echo(data); assert.match(form.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.match(form.body, /name="field"\r\n\r\nvalue/); assert.match(form.body, /filename="sample.txt"/); assert.match(form.body, /file body/);
  const doc = new window.DOMParser().parseFromString('<catalog><item/></catalog>', 'application/xml');
  const xml = await echo(doc); assert.equal(xml.body, '[object XMLDocument]'); assert.match(xml.headers['content-type'], /^text\/plain;charset=UTF-8$/i);
}));

test('Document bodies use Native string conversion without consulting XMLSerializer or contentType', async () => fixture(async ({ window, base }) => {
  const xml = new window.DOMParser().parseFromString('<catalog><item/></catalog>', 'application/xml');
  const html = new window.DOMParser().parseFromString('<p>body</p>', 'text/html');
  assert.equal(new window.XMLSerializer().serializeToString(xml), '<catalog><item></item></catalog>');
  let serializerReads = 0, contentTypeReads = 0, stringCalls = 0;
  Object.defineProperty(window, 'XMLSerializer', { configurable: true, get() { serializerReads++; throw new Error('authored serializer'); } });
  for (const doc of [xml, html]) Object.defineProperty(doc, 'contentType', { configurable: true, get() { contentTypeReads++; throw new Error('authored content type'); } });
  const echo = async (body, expected) => {
    const { xhr, outcome } = await send(window, `${base}/echo`, { method: 'POST', body, type: 'json' });
    assert.equal(outcome, 'load'); assert.equal(xhr.response.body, expected);
    assert.match(xhr.response.headers['content-type'], /^text\/plain;charset=UTF-8$/i);
  };
  await echo(xml, '[object XMLDocument]'); await echo(html, '[object HTMLDocument]');
  xml.toString = () => { stringCalls++; return 'authored-document-body'; };
  await echo(xml, 'authored-document-body');
  assert.equal(serializerReads, 0); assert.equal(contentTypeReads, 0); assert.equal(stringCalls, 1);
}));

test('response values belong to the page realm, cache correctly, and remain usable after reopen', async () => fixture(async ({ browser, page, window, base }) => {
  const other = browser.createPage();
  const json = (await send(window, `${base}/json`, { type: 'json' })).xhr;
  assert.ok(json.response instanceof window.Object); assert.ok(json.response.list instanceof window.Array);
  assert.equal(json.response instanceof other.dom.window.Object, false); assert.equal(json.response, json.response);
  const first = json.response; json.open('GET', `${base}/json`); assert.equal(first.nested.answer, 42); assert.equal(json.response, null);
  assert.throws(() => json.responseText, { name: 'InvalidStateError' });
  const binary = (await send(window, `${base}/binary`, { type: 'arraybuffer' })).xhr;
  assert.ok(binary.response instanceof window.ArrayBuffer); assert.deepEqual([...new window.Uint8Array(binary.response)], [0, 0, 1, 2, 0, 0, 9]);
  const blob = (await send(window, `${base}/binary`, { type: 'blob' })).xhr;
  const firstBlob = blob.response; assert.ok(firstBlob instanceof window.Blob); assert.equal(firstBlob, blob.response);
  assert.equal(firstBlob.type, 'application/octet-stream'); blob.open('GET', `${base}/binary`);
  const reading = firstBlob.arrayBuffer(); assert.ok(reading instanceof window.Promise);
  const buffer = await reading; assert.ok(buffer instanceof window.ArrayBuffer); assert.deepEqual([...new window.Uint8Array(buffer)], [0, 0, 1, 2, 0, 0, 9]);
  assert.equal((await send(window, `${base}/invalid-json`, { type: 'json' })).xhr.response, null);
  assert.equal(page.closed, false);
}));

test('document responses parse XML/HTML without scripts, use final URLs, and honor MIME/encoding overrides', async () => fixture(async ({ window, base }) => {
  const html = (await send(window, `${base}/html`, { type: 'document' })).xhr;
  assert.ok(html.response instanceof window.Document); assert.equal(html.response.title, 'response'); assert.equal(html.response.URL, `${base}/html`);
  assert.equal(html.response.querySelector('a').href, `${base}/relative`); assert.equal(window.responseScriptRan, undefined);
  assert.equal(html.responseXML, html.response); assert.equal(html.response.contentType, 'text/html');
  assert.equal((await send(window, `${base}/html`)).xhr.responseXML, null);
  const xml = (await send(window, `${base}/xml`)).xhr;
  assert.ok(xml.responseXML instanceof window.XMLDocument); assert.equal(xml.responseXML.documentElement.children.length, 2);
  assert.equal(xml.responseXML.contentType, 'application/custom+xml'); assert.equal(xml.responseXML, xml.responseXML);
  const latin = (await send(window, `${base}/latin`)).xhr; assert.equal(latin.responseText, 'café');
  const overrideAtHeaders = (await send(window, `${base}/latin`, { configure: xhr => {
    xhr.onreadystatechange = () => { if (xhr.readyState === 2) xhr.overrideMimeType('text/plain;charset=utf-8'); };
  } })).xhr;
  assert.equal(overrideAtHeaders.responseText, 'caf\uFFFD');
  const malformed = (await send(window, `${base}/html`, { configure: xhr => xhr.overrideMimeType('application/xml') })).xhr;
  assert.equal(malformed.responseXML, null);
  const blob = (await send(window, `${base}/html`, { type: 'blob' })).xhr; assert.equal(blob.response.type, 'text/html; charset=utf-8');
  const invalid = (await send(window, `${base}/html`, { type: 'blob', configure: xhr => xhr.overrideMimeType('nonsense') })).xhr;
  assert.equal(invalid.response.type, 'application/octet-stream');
  assert.throws(() => invalid.overrideMimeType('text/plain'), { name: 'InvalidStateError' });
}));

test('HTTP errors load normally, redirects expose the final URL, and data URLs work', async () => fixture(async ({ window, base }) => {
  const missing = await send(window, `${base}/missing`); assert.equal(missing.outcome, 'load');
  assert.equal(missing.xhr.status, 404); assert.equal(missing.xhr.statusText, 'Custom missing'); assert.equal(missing.xhr.responseText, 'missing body');
  const redirected = (await send(window, `${base}/redirect?to=${encodeURIComponent(`${base}/json`)}`, { type: 'json' })).xhr;
  assert.equal(redirected.responseURL, `${base}/json`); assert.equal(redirected.response.nested.answer, 42);
  const data = await send(window, 'data:text/plain;base64,aGVsbG8='); assert.equal(data.outcome, 'load'); assert.equal(data.xhr.responseText, 'hello');
  const authURL = new URL(`${base}/echo`); authURL.username = 'user name'; authURL.password = 'pass:word';
  const auth = await send(window, authURL.href, { type: 'json' });
  assert.equal(auth.outcome, 'load'); assert.equal(auth.xhr.response.headers.authorization, `Basic ${Buffer.from('user name:pass:word').toString('base64')}`);
  assert.equal(auth.xhr.responseURL, `${base}/echo`);
}));

test('abort and timeout produce distinct terminal events and cancel the underlying requests', async () => fixture(async ({ window, base, page }) => {
  const xhr = new window.XMLHttpRequest(), kinds = [];
  for (const kind of ['abort', 'error', 'load', 'timeout', 'loadend']) xhr.addEventListener(kind, () => kinds.push(kind));
  xhr.open('GET', `${base}/slow`); xhr.send(); await delay(15); xhr.abort();
  assert.equal(xhr.readyState, 0); assert.equal(xhr.status, 0); assert.deepEqual(kinds, ['abort', 'loadend']);
  await delay(135); assert.deepEqual(kinds, ['abort', 'loadend']); assert.equal(page.activeRequests.size, 0);
  const timeout = await send(window, `${base}/slow`, { configure: request => { request.timeout = 20; } });
  assert.equal(timeout.outcome, 'timeout'); assert.equal(timeout.xhr.status, 0); assert.equal(timeout.xhr.readyState, 4);
  const rescheduled = await send(window, `${base}/slow`, { configure: request => { request.timeout = 10; setTimeout(() => { request.timeout = 200; }, 2); } });
  assert.equal(rescheduled.outcome, 'load');
  const abortedAtHeaders = await send(window, `${base}/json`, { configure: request => {
    request.onreadystatechange = () => { if (request.readyState === 2) request.abort(); };
  } });
  assert.equal(abortedAtHeaders.outcome, 'abort'); assert.equal(abortedAtHeaders.xhr.readyState, 0);
  const recursiveAbort = await send(window, `${base}/json`, { configure: request => {
    request.onreadystatechange = () => request.abort();
  } });
  assert.equal(recursiveAbort.outcome, 'abort'); assert.equal(recursiveAbort.xhr.readyState, 0);
}));

test('network errors are observable and request reuse from error/load handlers cannot lose cancellation', async () => fixture(async ({ window, base }) => {
  const failed = await send(window, `${base}/disconnect`); assert.equal(failed.outcome, 'error'); assert.equal(failed.xhr.status, 0);
  const xhr = new window.XMLHttpRequest(), kinds = [];
  const done = new Promise(resolve => {
    xhr.onerror = () => { kinds.push('error'); xhr.open('GET', `${base}/slow`); xhr.send(); setTimeout(() => xhr.abort(), 5); };
    xhr.onload = () => kinds.push('load'); xhr.onabort = () => kinds.push('abort');
    xhr.onloadend = () => { kinds.push('loadend'); if (kinds.includes('abort')) resolve(); };
  });
  xhr.open('GET', `${base}/disconnect`); xhr.send(); await done; await delay(140);
  assert.deepEqual(kinds, ['error', 'abort', 'loadend']); assert.equal(xhr.readyState, 0);
  let count = 0;
  await new Promise(resolve => {
    xhr.onerror = null; xhr.onloadend = null;
    xhr.onload = () => { if (++count === 1) { xhr.open('GET', `${base}/json`); xhr.send(); } else resolve(); };
    xhr.open('GET', `${base}/json`); xhr.send();
  });
  assert.equal(count, 2);
}));

test('navigation and owned Page closure dispose XHR while main Window.close preserves the live request', async () => fixture(async ({ browser, window, page, base, requests }) => {
  let callbacks = 0;
  const xhr = new window.XMLHttpRequest();
  for (const kind of ['load', 'error', 'abort', 'timeout', 'loadend']) xhr.addEventListener(kind, () => callbacks++);
  // Keep a real response pending until commit: a short XHR timeout may
  // legitimately fire while the navigation's HTTP response is still pending.
  xhr.open('GET', `${base}/held-response`); xhr.send();
  const deadline = Date.now() + 1000;
  while (!requests.some(entry => entry.path === '/held-response') && Date.now() < deadline) await delay(2);
  assert.ok(requests.some(entry => entry.path === '/held-response'));
  await page.navigate(`${base}/json`); await delay(150);
  assert.equal(requests.find(entry => entry.path === '/held-response').closedBeforeEnd, true);
  assert.equal(callbacks, 0); assert.throws(() => { xhr.open('GET', `${base}/json`); xhr.send(); }, { name: 'InvalidStateError' });
  const nextWindow = page.dom.window; installXHR(page, nextWindow);
  const pending = new nextWindow.XMLHttpRequest(); pending.onload = () => callbacks++; pending.onerror = () => callbacks++;
  pending.open('GET', `${base}/slow`); pending.timeout = 30; pending.send(); page.close(); await delay(150); assert.equal(callbacks, 0);
  const thirdPage = browser.createPage(); await thirdPage.navigate(base); const third = thirdPage.dom.window; installXHR(thirdPage, third);
  const completed = Promise.withResolvers();
  const closedWindow = new third.XMLHttpRequest();
  closedWindow.onload = closedWindow.onerror = () => { callbacks++; completed.resolve(); };
  const originalDocument = third.document;
  closedWindow.open('GET', `${base}/held-response`); closedWindow.send();
  const arrivalDeadline = Date.now() + thirdPage.timeout;
  while (requests.filter(entry => entry.path === '/held-response').length < 2 && Date.now() < arrivalDeadline) await delay(2);
  const held = requests.filter(entry => entry.path === '/held-response'); assert.equal(held.length, 2);
  third.close(); assert.equal(callbacks, 0);
  held[1].release();
  let completionTimer;
  try {
    await Promise.race([completed.promise, new Promise((_, reject) => {
      completionTimer = setTimeout(() => reject(new Error('Window.close request did not complete')), thirdPage.timeout);
    })]);
  } finally { clearTimeout(completionTimer); }
  assert.equal(callbacks, 1); assert.equal(third.closed, false); assert.strictEqual(third.document, originalDocument);
  assert.equal(closedWindow.readyState, 4); assert.equal(closedWindow.status, 200);
}));

test('cross-origin requests enforce preflight, credentials, response exposure and redirect restrictions', async () => fixture(async ({ page, window, base, cross, requests }) => {
  window.document.cookie = 'originCookie=yes';
  const simple = await send(window, `${cross}/cors`, { type: 'json' });
  assert.equal(simple.outcome, 'load'); assert.equal(simple.xhr.response.headers.cookie, undefined);
  assert.equal(simple.xhr.response.headers.origin, base); assert.equal(simple.xhr.getResponseHeader('x-visible'), 'visible');
  assert.equal(simple.xhr.getResponseHeader('x-hidden'), null); assert.equal(simple.xhr.getResponseHeader('set-cookie'), null);
  const credentialed = await send(window, `${cross}/cors`, { type: 'json', configure: xhr => { xhr.withCredentials = true; } });
  assert.equal(credentialed.outcome, 'load'); assert.match(credentialed.xhr.response.headers.cookie, /originCookie=yes/);
  const preflight = await send(window, `${cross}/cors`, { method: 'PUT', body: 'payload', headers: { 'X-Custom': 'value' }, type: 'json' });
  assert.equal(preflight.outcome, 'load'); assert.equal(preflight.xhr.response.body, 'payload');
  const options = requests.find(request => request.index === 1 && request.method === 'OPTIONS');
  assert.equal(options.headers['access-control-request-method'], 'PUT'); assert.equal(options.headers['access-control-request-headers'], 'x-custom');
  assert.equal(options.headers.cookie, undefined);
  const denied = await send(window, `${cross}/cors?deny`, { type: 'json' }); assert.equal(denied.outcome, 'error'); assert.equal(denied.xhr.response, null);
  const wildcardCredentials = await send(window, `${cross}/cors?wildcard`, { configure: xhr => { xhr.withCredentials = true; } }); assert.equal(wildcardCredentials.outcome, 'error');
  const redirected = await send(window, `${base}/redirect?to=${encodeURIComponent(`${cross}/cors`)}`, { type: 'json' });
  assert.equal(redirected.outcome, 'load'); assert.equal(redirected.xhr.response.headers.cookie, undefined);
  const unsafeRedirect = await send(window, `${base}/redirect?to=${encodeURIComponent(`${cross}/cors`)}`, { headers: { 'x-custom': 'yes' } });
  assert.equal(unsafeRedirect.outcome, 'error');
  assert.equal(page.activeRequests.size, 0);
}));

test('upload event contracts, validation, forbidden headers and synchronous property guards', async () => fixture(async ({ window, base }) => {
  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', base, false);
  assert.throws(() => { xhr.timeout = 1; }, { name: 'InvalidAccessError' });
  xhr.abort();
  assert.throws(() => xhr.open('TRACE', base), { name: 'SecurityError' });
  assert.throws(() => xhr.open('GET invalid', base), { name: 'SyntaxError' });
  assert.throws(() => xhr.send(), { name: 'InvalidStateError' });
  xhr.open('POST', `${base}/echo`); assert.throws(() => xhr.setRequestHeader('bad name', 'x'), { name: 'SyntaxError' });
  assert.throws(() => xhr.setRequestHeader('x-test', 'bad\r\nvalue'), { name: 'SyntaxError' });
  const uploads = [];
  for (const kind of ['loadstart', 'progress', 'load', 'loadend']) xhr.upload.addEventListener(kind, event => {
    assert.equal(event.currentTarget, xhr.upload); assert.equal(event.isTrusted, true); assert.ok(event instanceof window.ProgressEvent);
    uploads.push([kind, event.loaded, event.total]);
  });
  const complete = once(xhr, 'loadend'); xhr.send('é');
  assert.throws(() => xhr.send(), { name: 'InvalidStateError' }); assert.throws(() => { xhr.withCredentials = true; }, { name: 'InvalidStateError' });
  await complete;
  assert.deepEqual(uploads, [['loadstart', 0, 0], ['progress', 2, 2], ['load', 2, 2], ['loadend', 2, 2]]);
  let handlerCalls = 0;
  xhr.onload = () => { handlerCalls += 100; }; const handler = () => handlerCalls++;
  xhr.onload = handler; assert.equal(xhr.onload, handler); xhr.dispatchEvent(new window.Event('load')); assert.equal(handlerCalls, 1);
}));

test('about:blank iframe XHR uses its inherited document origin despite a replaceable window.origin', async () => fixture(async ({ page, window, base }) => {
  window.document.cookie = 'inheritedCookie=yes';
  const iframe = window.document.createElement('iframe'); window.document.body.append(iframe);
  const child = iframe.contentWindow; installXHR(page, child);
  assert.equal(child.location.origin, 'null'); assert.equal(child.origin, base); child.origin = 'http://forged.invalid';
  const result = await send(child, `${base}/echo`, { type: 'json' });
  assert.equal(result.outcome, 'load'); assert.match(result.xhr.response.headers.cookie, /inheritedCookie=yes/);
}));
