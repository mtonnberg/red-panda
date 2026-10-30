import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Browser } from '../src/browser.js';

test('same-origin fetch credentials are recalculated at every redirect and foreign cookies are not imported', async t => {
  const received = [];
  const foreign = http.createServer((req, res) => {
    received.push(req.headers.cookie ?? '');
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'foreign=yes; Path=/' }); res.end('{}');
  });
  await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve));
  const destination = `http://127.0.0.1:${foreign.address().port}/foreign`;
  const source = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: destination }); res.end(); }
    else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><h1>Credentials</h1>'); }
  });
  await new Promise(resolve => source.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${source.address().port}`, browser = new Browser(), page = browser.createPage();
  t.after(async () => { browser.close(); for (const server of [source, foreign]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });
  await page.navigate(base);
  await page.context.cookies.setCookie('session=source; Path=/', base);
  await page.evaluate('fetch("/redirect").then(r=>r.text())');
  assert.equal(received.at(-1), '');
  assert.equal((await page.context.cookies.getCookies(base)).some(cookie => cookie.key === 'foreign'), false);
  await page.evaluate(`fetch(${JSON.stringify(destination)},{credentials:'include'}).then(r=>r.text())`);
  assert.match(received.at(-1), /session=source/);
  assert.equal((await page.context.cookies.getCookies(base)).some(cookie => cookie.key === 'foreign'), true);
  await page.evaluate(`fetch(${JSON.stringify(destination)},{credentials:'omit'}).then(r=>r.text())`);
  assert.equal(received.at(-1), '');
});
