import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Browser, until } from '../src/browser.js';

async function fixture(t) {
  const requests = [];
  const routes = {
    '/start': '<!doctype html><script>location.assign("/middle")</script>',
    '/middle': '<!doctype html><script>location.replace("/final")</script>',
    '/final': '<!doctype html><title>Final</title><h1>Reached</h1>',
    '/links': '<!doctype html><a id="normal" href="/final">Next</a><a id="private" rel="noreferrer" href="/final">Private</a>',
    '/module': '<!doctype html><script type="module">const {answer}=await import("./value.js");await new Promise(r=>setTimeout(r,20));document.title=String(answer);</script>',
    '/module-navigation': '<!doctype html><script type="module">await Promise.resolve();location.href="/final";</script>',
    '/value.js': 'export const answer=42;',
  };
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, referrer: req.headers.referer });
    res.writeHead(routes[req.url] ? 200 : 404, { 'content-type': req.url.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(routes[req.url] ?? 'Missing');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = new Browser(), page = browser.createPage();
  t.after(async () => { browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { page, requests, base: `http://127.0.0.1:${server.address().port}` };
}

test('Page navigation follows script redirects and replacement history through the final load', async t => {
  const { page, base, requests } = await fixture(t);
  const loads = []; page.on('load', () => loads.push(page.url));
  const result = await page.navigate(`${base}/start`);
  assert.equal(result.url, `${base}/final`);
  assert.equal(page.evaluate('document.title'), 'Final');
  assert.deepEqual(loads, [`${base}/final`]);
  assert.deepEqual(page.history.map(entry => entry.url), [`${base}/final`]);
  assert.equal(requests.find(request => request.path === '/middle').referrer, `${base}/start`);
  assert.equal(requests.find(request => request.path === '/final').referrer, `${base}/middle`);
});

test('anchor navigation obeys cancellation and noreferrer, and fragment replacement preserves history length', async t => {
  const { page, base, requests } = await fixture(t);
  await page.navigate(`${base}/links`);
  page.evaluate('document.getElementById("normal").addEventListener("click",e=>e.preventDefault());document.getElementById("normal").click()');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(page.pendingNavigation, undefined);
  assert.equal(page.url, `${base}/links`);
  const length = page.history.length;
  page.evaluate('location.replace("#section")');
  assert.equal(page.url, `${base}/links#section`); assert.equal(page.history.length, length);
  page.evaluate('document.getElementById("private").click()');
  await page.pendingNavigation.promise;
  assert.equal(page.url, `${base}/final`);
  assert.equal(requests.at(-1).referrer, undefined);
});

test('Page module readiness includes imports and top-level await, and module navigation follows its child', async t => {
  const { page, base } = await fixture(t);
  await page.navigate(`${base}/module`);
  await page.moduleReady;
  assert.equal(page.evaluate('document.title'), '42');
  await page.navigate(`${base}/module-navigation`);
  assert.equal(page.url, `${base}/final`);
  assert.equal(page.evaluate('document.title'), 'Final');
});

test('queued location assignments from an active page replace the owning document', async t => {
  const { page, base } = await fixture(t);
  await page.navigate(`${base}/links`);
  const previousGeneration = page.documentGeneration;
  page.evaluate('location.href="/final"');
  await page.pendingNavigation.promise;
  await until(() => page.documentGeneration > previousGeneration);
  assert.equal(page.url, `${base}/final`);
  assert.equal(page.evaluate('document.querySelector("h1").textContent'), 'Reached');
});
