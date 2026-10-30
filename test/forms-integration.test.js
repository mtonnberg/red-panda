import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Browser } from '../src/browser.js';

async function fixture(t) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/redirect-submit') { res.writeHead(303, { location: '/submitted' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    if (url.pathname === '/submitted') res.end('<!doctype html><h1>Submitted</h1>');
    else res.end(`<!doctype html><form action="${url.searchParams.get('action') ?? '/submitted?old=1#done'}" method="${url.searchParams.get('method') ?? 'get'}" enctype="${url.searchParams.get('enctype') ?? 'application/x-www-form-urlencoded'}"><input name="q" value="red panda 🐼"><button id="submit" name="go" value="yes">Submit</button></form>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = new Browser(), page = browser.createPage();
  t.after(async () => { browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { page, requests, base: `http://127.0.0.1:${server.address().port}` };
}

test('GET form activation sends successful controls through Browser and follows the actual document', async t => {
  const { page, requests, base } = await fixture(t);
  await page.navigate(`${base}/form`);
  page.evaluate('document.getElementById("submit").click()');
  await page.pendingNavigation.promise;
  assert.equal(page.url, `${base}/submitted?q=red+panda+%F0%9F%90%BC&go=yes#done`);
  assert.equal(requests.at(-1).method, 'GET'); assert.equal(requests.at(-1).body, '');
  assert.equal(page.evaluate('document.querySelector("h1").textContent'), 'Submitted');
});

test('POST form requests retain method, encoding and bytes when reloaded', async t => {
  const { page, requests, base } = await fixture(t);
  await page.navigate(`${base}/form?method=post`);
  page.evaluate('document.forms[0].requestSubmit(document.getElementById("submit"))');
  await page.pendingNavigation.promise;
  const submitted = requests.at(-1);
  assert.equal(submitted.method, 'POST'); assert.equal(submitted.body, 'q=red+panda+%F0%9F%90%BC&go=yes');
  assert.equal(submitted.headers.origin, base); assert.equal(submitted.headers['content-type'], 'application/x-www-form-urlencoded');
  await page.navigate(page.url, { historyMode: 'reload' });
  assert.equal(requests.at(-1).method, 'POST'); assert.equal(requests.at(-1).body, submitted.body);
  assert.equal(page.history.length, 2);
});

test('POST redirects store the final GET request so reloading does not resend its body', async t => {
  const { page, requests, base } = await fixture(t);
  await page.navigate(`${base}/form?method=post&action=/redirect-submit`);
  page.evaluate('document.forms[0].requestSubmit()'); await page.pendingNavigation.promise;
  assert.equal(requests.at(-2).method, 'POST'); assert.equal(requests.at(-1).method, 'GET');
  await page.navigate(page.url, { historyMode: 'reload' });
  assert.equal(requests.at(-1).method, 'GET'); assert.equal(requests.at(-1).body, '');
});

test('multipart and text form bodies reach the HTTP server without losing payload bytes', async t => {
  const { page, requests, base } = await fixture(t);
  for (const enctype of ['multipart/form-data', 'text/plain']) {
    await page.navigate(`${base}/form?method=post&enctype=${encodeURIComponent(enctype)}`);
    page.evaluate('document.forms[0].submit()'); await page.pendingNavigation.promise;
    const request = requests.at(-1);
    assert.equal(request.method, 'POST'); assert.match(request.headers['content-type'], new RegExp(`^${enctype}`));
    assert.match(request.body, /red panda 🐼/);
    if (enctype === 'multipart/form-data') assert.match(request.body, /name="q"\r\n\r\nred panda/);
    else assert.equal(request.body, 'q=red panda 🐼\r\n');
  }
});
