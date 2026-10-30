import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser.js';

async function fixture(t) {
  const browser = new Browser(), page = browser.createPage();
  t.after(() => browser.close());
  await page.navigate('data:text/html,<body></body>');
  return page.dom.window;
}

test('Fetch value validation uses native-observed header messages, methods and realm errors', async t => {
  const w = await fixture(t);
  assert.throws(() => new w.Headers({ 'bad name': 'x' }), error => error instanceof w.TypeError && error.message === 'Invalid header name');
  assert.throws(() => new w.Headers({ x: 'a\nb' }), error => error instanceof w.TypeError && error.message === 'Invalid header value');
  assert.throws(() => new w.URLSearchParams([['one']]), w.TypeError);
  assert.equal(new w.Request('https://example.com/', { method: 'propfind' }).method, 'PROPFIND');
  assert.throws(() => new w.Request('https://example.com/', { method: 'foo' }), w.TypeError);
  assert.throws(() => new w.Request('https://example.com/', { method: 'PUT', mode: 'no-cors' }), error => error instanceof w.TypeError && error.message === "'PUT' is unsupported in no-cors mode");
});

test('Response reads init before extracting a real buffer and rejects shared backing stores', async t => {
  const w = await fixture(t), body = new w.Uint8Array([1, 2, 3]);
  const response = new w.Response(body, { get status() { body.buffer.transfer(0); return 200; } });
  assert.deepEqual([...await response.bytes()], []);
  const shared = new SharedArrayBuffer(4);
  for (const value of [shared, new Uint8Array(shared), new DataView(shared)]) assert.throws(() => new w.Response(value), w.TypeError);
  const value = new w.Uint8Array([0, 255, 4]);
  const copied = new w.Response(value.subarray(1)); value.fill(8);
  assert.deepEqual([...await copied.bytes()], [255, 4]);
});

test('multipart parsing ignores filename-star but preserves actual files and boundary-like data', async t => {
  const w = await fixture(t);
  const body = '--B\r\nContent-Disposition: form-data; filename*=UTF-8\'\'a.jpg; name="n"\r\n\r\nv\r\n--B\r\nContent-Disposition: form-data; name="f"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--Bfake\r\nworld\r\n--B--\r\n';
  const response = new w.Response(body, { headers: { 'content-type': 'multipart/form-data; boundary=B' } });
  const data = await response.formData();
  assert.equal(data instanceof w.FormData, true); assert.equal(data.get('n'), 'v');
  assert.equal(data.get('f') instanceof w.File, true); assert.equal(data.get('f').name, 'a.txt');
  assert.equal(await data.get('f').text(), 'hello\r\n--Bfake\r\nworld');
  assert.equal(response.bodyUsed, true); await assert.rejects(response.formData(), error => error instanceof w.TypeError && error.message === 'Body has already been read');
});

test('Request and Response textStream consume genuine UTF8 bytes and expose immediate disturbed state', async t => {
  const w = await fixture(t);
  for (const value of [new w.Request('https://example.com/', { method: 'POST', body: 'héllo 🐼' }), new w.Response('héllo 🐼')]) {
    const stream = value.textStream(); assert.equal(value.bodyUsed, true); assert.equal(stream instanceof w.ReadableStream, true);
    const reader = stream.getReader(); let text = '';
    while (true) { const result = await reader.read(); if (result.done) break; text += result.value; }
    assert.equal(text, 'héllo 🐼'); assert.throws(() => value.textStream(), w.TypeError);
  }
  const empty = new w.Response();
  assert.notEqual(empty.textStream(), empty.textStream()); assert.equal(empty.bodyUsed, false);
  const locked = new w.Request('https://example.com/', { method: 'POST', body: 'x' }); locked.body.getReader();
  assert.throws(() => locked.textStream(), w.TypeError);
});

test('Blob/File byte reads copy actual data in the owning realm and survive document closure', async t => {
  const w = await fixture(t), source = new w.Uint8Array([0, 4, 255]), blob = new w.Blob([source]); source.fill(8);
  const first = await blob.bytes(); assert.equal(first instanceof w.Uint8Array, true); assert.deepEqual([...first], [0, 4, 255]);
  first.fill(1); assert.deepEqual([...await blob.bytes()], [0, 4, 255]);
  await assert.rejects(w.Blob.prototype.bytes.call({}), w.TypeError);
  assert.throws(() => w.Blob.prototype.stream.call({}), w.TypeError);
  const reader = blob.stream().getReader(); assert.deepEqual([...(await reader.read()).value], [0, 4, 255]); assert.equal((await reader.read()).done, true);
  w.close(); assert.deepEqual([...await blob.bytes()], [0, 4, 255]);
});
