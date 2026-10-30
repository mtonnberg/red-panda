import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installForms } from '../src/forms.js';

function fixture(html = '', { register = true, url = 'http://127.0.0.1:9582/start?old=1' } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole });
  const calls = [];
  const page = Object.assign(new EventEmitter(), {
    closed: false, dom, documentAbort: new AbortController(),
    navigate: async (url, options) => { calls.push({ url, options, pendingAtStart: page.pendingNavigation }); return { url }; },
  });
  const controller = register ? installForms(page, dom.window) : null;
  return { page, dom, window: dom.window, document: dom.window.document, calls, errors, controller,
    close() { page.closed = true; page.documentAbort.abort(); page.emit('close'); dom.window.close(); } };
}

test('GET submission serializes successful controls in order and replaces the action query', async () => {
  const f = fixture(`<form id="f" action="/search?discard=yes#results">
    <input name="q" value="red panda 🐼"><input name="q" value="second">
    <input value="unnamed"><input name="disabled" disabled value="no">
    <input name="checked" type="checkbox" checked><input name="unchecked" type="checkbox">
    <input name="choice" type="radio" value="a"><input name="choice" type="radio" value="b" checked>
    <fieldset disabled><legend><input name="legend" value="yes"></legend><input name="fieldset" value="no"></fieldset>
    <select multiple name="selection"><option selected value="a">a</option><option selected disabled value="no">no</option><optgroup disabled><option selected value="also-no">no</option></optgroup><option selected value="b">b</option></select>
    <textarea name="lines">first\nsecond</textarea><input type="hidden" name="_charset_" value="wrong">
    <input name="directional" dirname="direction" dir="rtl" value="text">
    <button name="button" value="skip">Submit</button></form>
    <input form="f" name="external" value="included">`);
  try {
    f.document.querySelector('form').requestSubmit();
    const pending = f.page.pendingNavigation;
    assert.equal(pending.started, false); assert.equal(f.calls.length, 0);
    await pending.promise;
    const url = new URL(f.calls[0].url);
    assert.equal(url.pathname, '/search'); assert.equal(url.hash, '#results');
    assert.deepEqual([...url.searchParams], [
      ['q', 'red panda 🐼'], ['q', 'second'], ['checked', 'on'], ['choice', 'b'], ['legend', 'yes'],
      ['selection', 'a'], ['selection', 'b'], ['lines', 'first\r\nsecond'], ['_charset_', 'UTF-8'],
      ['directional', 'text'], ['direction', 'rtl'], ['external', 'included'],
    ]);
    assert.equal(f.calls[0].options.method, 'GET'); assert.equal(f.calls[0].options.body, undefined);
    assert.equal(f.calls[0].pendingAtStart, null);
  } finally { f.close(); }
});

test('requestSubmit validates and respects invalid cancellation while submit bypasses validation and submit events', async () => {
  const f = fixture('<form action="/submit"><input name="required" required></form>');
  try {
    const form = f.document.querySelector('form'), input = form.elements[0];
    let invalid = 0, submits = 0, dataEvents = 0;
    input.addEventListener('invalid', event => { invalid++; assert.equal(event.isTrusted, true); event.preventDefault(); });
    form.addEventListener('submit', () => submits++);
    form.addEventListener('formdata', () => dataEvents++);
    form.requestSubmit();
    assert.equal(invalid, 1); assert.equal(submits, 0); assert.equal(f.page.pendingNavigation, undefined);
    form.submit(); await f.page.pendingNavigation.promise;
    assert.equal(submits, 0); assert.equal(dataEvents, 1); assert.equal(f.calls.length, 1);
    assert.equal(new URL(f.calls[0].url).searchParams.get('required'), '');
  } finally { f.close(); }
});

test('cancelable trusted submit events precede formdata and mutations determine serialization', async () => {
  const f = fixture('<form action="/before"><input name="value" value="before"><button name="go" value="yes">Go</button></form>');
  try {
    const form = f.document.querySelector('form'), button = form.querySelector('button');
    const events = [];
    form.addEventListener('submit', event => {
      assert.equal(event.isTrusted, true); assert.equal(event.bubbles, true); assert.equal(event.cancelable, true);
      assert.equal(event.submitter, button); events.push('submit');
      form.action = '/after'; form.elements.value.value = 'after';
      if (events.length === 1) event.preventDefault();
    });
    form.addEventListener('formdata', event => {
      events.push('formdata'); assert.equal(event.isTrusted, true); assert.equal(event.bubbles, true);
      assert.equal(event.cancelable, false); event.preventDefault(); assert.equal(event.defaultPrevented, false);
      event.formData.set('value', 'formdata'); event.formData.append('added', 'yes');
    });
    button.click(); assert.equal(f.page.pendingNavigation, undefined); assert.deepEqual(events, ['submit']);
    button.click(); await f.page.pendingNavigation.promise;
    assert.deepEqual(events, ['submit', 'submit', 'formdata']);
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/after?value=formdata&go=yes&added=yes');
    const synthetic = new f.window.FormDataEvent('formdata', { formData: new f.window.FormData() });
    assert.equal(synthetic.isTrusted, false); assert.equal(synthetic.formData instanceof f.window.FormData, true);
    assert.throws(() => new f.window.FormDataEvent('formdata'), /requires formData/);
  } finally { f.close(); }
});

test('submitter overrides action, method, encoding and constraint validation', async () => {
  const f = fixture('<base href="http://127.0.0.1:9582/base/"><form action="/wrong" method="get"><input required name="x"><button name="send" value="ok" formaction="child" formmethod="post" formenctype="text/plain" formnovalidate formtarget="_self">Go</button><button name="unused" value="no">Other</button></form>');
  try {
    f.document.querySelector('button').click(); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/base/child');
    assert.equal(f.calls[0].options.method, 'POST');
    assert.equal(f.calls[0].options.body, 'x=\r\nsend=ok\r\n');
    assert.equal(f.calls[0].options.headers['content-type'], 'text/plain');
    assert.equal(f.calls[0].options.headers.origin, 'http://127.0.0.1:9582');
  } finally { f.close(); }
});

test('missing submitter properties reflect overrides and empty GET submissions retain an empty query', async () => {
  const f = fixture('<form action="/empty" method="get"><button>Go</button></form>');
  try {
    const form = f.document.querySelector('form'), button = form.querySelector('button');
    assert.equal(button.formMethod, ''); assert.equal(button.formEnctype, '');
    assert.equal(button.formAction, f.window.location.href);
    form.requestSubmit(button); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/empty?');
    button.formAction = '/override'; button.formMethod = 'POST'; button.formEnctype = 'text/plain';
    assert.equal(button.getAttribute('formaction'), '/override'); assert.equal(button.formMethod, 'post');
    assert.equal(button.formEnctype, 'text/plain'); assert.equal(button.formAction, 'http://127.0.0.1:9582/override');
    form.requestSubmit(button); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[1].url, 'http://127.0.0.1:9582/override'); assert.equal(f.calls[1].options.method, 'POST');
    button.formMethod = 'invalid'; assert.equal(button.formMethod, 'get');
    button.formEnctype = 'invalid'; assert.equal(button.formEnctype, 'application/x-www-form-urlencoded');
  } finally { f.close(); }
});

test('noreferrer suppresses form referrers and rejected activation can be retried', async () => {
  const f = fixture('<form action="/self" target="_blank" rel="noopener noreferrer"><button>Go</button></form>');
  try {
    const form = f.document.querySelector('form'), button = form.querySelector('button');
    assert.throws(() => button.click(), /Form target _blank/);
    form.target = '_self'; button.click(); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].options.referrer, ''); assert.equal(f.calls.length, 1);
  } finally { f.close(); }
});

test('urlencoded POST normalizes names, newlines, unicode, filenames and formdata additions', async () => {
  const f = fixture('<form action="/post?keep=yes" method="post"><textarea name="text">one\ntwo</textarea><input type="file" name="empty"><input name="a b" value="&🐼"></form>');
  try {
    const form = f.document.querySelector('form');
    form.addEventListener('formdata', event => event.formData.append('file', new f.window.File(['bytes'], 'a🐼.txt')));
    form.requestSubmit(); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/post?keep=yes');
    assert.equal(f.calls[0].options.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.deepEqual([...new URLSearchParams(f.calls[0].options.body)], [
      ['text', 'one\r\ntwo'], ['empty', ''], ['a b', '&🐼'], ['file', 'a🐼.txt'],
    ]);
  } finally { f.close(); }
});

test('multipart POST preserves file bytes and escapes header syntax without corrupting unicode', async () => {
  const f = fixture('<form action="/upload" method="post" enctype="multipart/form-data"><textarea name="text">one\ntwo</textarea></form>');
  try {
    const form = f.document.querySelector('form');
    form.addEventListener('formdata', event => {
      event.formData.append('field"\r\nname', new f.window.File([new Uint8Array([0, 255, 13, 10])], '🐼"\n.bin', { type: 'application/octet-stream' }));
    });
    form.requestSubmit(); await f.page.pendingNavigation.promise;
    const { body, headers } = f.calls[0].options;
    assert.equal(Buffer.isBuffer(body), true);
    const boundary = headers['content-type'].split('boundary=')[1];
    assert.ok(boundary.length > 30);
    assert.ok(body.includes(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\none\r\ntwo\r\n`)));
    assert.ok(body.includes(Buffer.from('name="field%22%0D%0Aname"; filename="🐼%22%0A.bin"\r\nContent-Type: application/octet-stream\r\n\r\n')));
    assert.ok(body.includes(Buffer.from([0, 255, 13, 10])));
    assert.ok(body.toString().endsWith(`\r\n--${boundary}--\r\n`));
  } finally { f.close(); }
});

test('image submission uses the selected coordinate and other submit buttons stay excluded', async () => {
  const f = fixture('<form action="/image"><input type="image" name="point"><input type="submit" name="other" value="no"></form>');
  try {
    const form = f.document.querySelector('form'), image = form.querySelector('[type=image]');
    form.requestSubmit(image); await f.page.pendingNavigation.promise;
    assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/image?point.x=0&point.y=0');
    image.dispatchEvent(new f.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 34 }));
    await f.page.pendingNavigation.promise;
    assert.equal(f.calls[1].url, 'http://127.0.0.1:9582/image?point.x=12&point.y=34');
  } finally { f.close(); }
});

test('invalid submitter ownership and unsupported navigation are explicit failures', () => {
  const f = fixture('<form id="first" action="/self"><input><button>Submit</button></form><form id="other"><button>Other</button></form>');
  try {
    const form = f.document.querySelector('#first');
    assert.throws(() => form.requestSubmit(form.querySelector('input')), error => error.name === 'TypeError');
    assert.throws(() => form.requestSubmit(f.document.querySelector('#other button')), error => error.name === 'NotFoundError');
    form.target = '_blank'; assert.throws(() => form.requestSubmit(), /Form target _blank/);
    form.target = '_self'; form.method = 'dialog'; assert.throws(() => form.requestSubmit(), /Dialog form submission/);
    form.method = 'post'; form.action = 'mailto:example@example.org'; assert.throws(() => form.submit(), /protocol mailto:/);
    assert.equal(f.page.pendingNavigation, undefined);
  } finally { f.close(); }
});

test('disabled and disconnected activation does not submit and novalidate bypasses required fields', async () => {
  const f = fixture('<form action="/submit"><input required name="x"><button disabled>Go</button></form>');
  try {
    const form = f.document.querySelector('form');
    form.querySelector('button').click(); assert.equal(f.page.pendingNavigation, undefined);
    form.remove(); form.submit(); form.requestSubmit(); assert.equal(f.page.pendingNavigation, undefined);
    f.document.body.append(form); form.noValidate = true;
    form.requestSubmit(); await f.page.pendingNavigation.promise;
    assert.equal(f.calls.length, 1);
  } finally { f.close(); }
});

test('recursive requestSubmit and formdata submission are guarded while direct submit from a submit listener works', async () => {
  const f = fixture('<form action="/nested"><input name="x" value="1"></form>');
  try {
    const form = f.document.querySelector('form'); let submits = 0, formdata = 0;
    form.addEventListener('submit', event => { submits++; form.requestSubmit(); form.submit(); event.preventDefault(); });
    form.addEventListener('formdata', () => { formdata++; form.submit(); form.requestSubmit(); });
    form.requestSubmit(); await f.page.pendingNavigation.promise;
    assert.equal(submits, 1); assert.equal(formdata, 1); assert.equal(f.calls.length, 1);
  } finally { f.close(); }
});

test('queued forms share navigation cancellation and supersession semantics', async () => {
  const f = fixture('<form action="/form"><input name="x" value="1"></form>');
  try {
    const form = f.document.querySelector('form');
    form.submit(); const first = f.page.pendingNavigation;
    f.window.location.assign('/location'); const second = f.page.pendingNavigation;
    assert.equal(first.supersededBy, second); await first.promise;
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, 'http://127.0.0.1:9582/location');
    form.submit(); const canceled = f.page.pendingNavigation;
    f.page.documentAbort.abort(); await assert.rejects(canceled.promise, error => error.name === 'AbortError');
    assert.equal(f.calls.length, 1);
  } finally { f.close(); }
});

test('closing the owned Window cancels a queued submission without leaking Page listeners', async () => {
  const f = fixture('<form action="/queued"></form>');
  try {
    f.document.querySelector('form').submit(); const pending = f.page.pendingNavigation;
    assert.equal(f.page.listenerCount('close'), 2);
    f.window.close();
    await assert.rejects(pending.promise, error => error.name === 'AbortError');
    assert.equal(f.page.listenerCount('close'), 0); assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});

test('form hooks retain jsdom fallback behavior for unregistered documents', () => {
  const registered = fixture(); const other = fixture('<form><button>Go</button></form>', { register: false });
  try {
    other.document.querySelector('form').submit(); other.document.querySelector('form').requestSubmit();
    assert.equal(other.errors.length, 2);
    assert.ok(other.errors.every(error => /Not implemented: HTMLFormElement/.test(error.message)));
    assert.equal(registered.calls.length, 0);
  } finally { registered.close(); other.close(); }
});

test('serialized POST data reaches an actual HTTP endpoint through the navigation request interface', async () => {
  let received;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received = { method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks) };
    response.setHeader('content-type', 'text/html'); response.end('<title>Submitted</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const f = fixture('<form action="/received" method="post"><input name="value" value="red panda"></form>', { url: `http://127.0.0.1:${address.port}/form` });
  try {
    f.page.navigate = async (url, options) => {
      const response = await fetch(url, options);
      return { url: response.url, html: await response.text() };
    };
    f.document.querySelector('form').requestSubmit();
    const result = await f.page.pendingNavigation.promise;
    assert.equal(result.html, '<title>Submitted</title>');
    assert.equal(received.method, 'POST'); assert.equal(received.url, '/received');
    assert.equal(received.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(received.body.toString(), 'value=red+panda');
  } finally { f.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
