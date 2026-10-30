// Explicit isolated-proposal checks. This file is deliberately outside the
// default production test glob until the coordinator integrates the proposal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parserResetCases } from './parser-reset-cases.mjs';

const { snapshot } = JSON.parse(await readFile(new URL('./parser-write-proposal.json', import.meta.url)));
const { Browser } = await import(pathToFileURL(`${snapshot}/src/browser.js`).href);
const plain = value => JSON.parse(JSON.stringify(value));
async function fixture(t, html, routes = {}) {
  const timers = new Set(), server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://fixture.test').pathname;
    if (pathname === '/page.html') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); return; }
    const route = routes[pathname];
    if (!route) { response.writeHead(404); response.end('missing'); return; }
    const send = () => { if (!response.destroyed) { response.writeHead(200, { 'content-type': route.type ?? 'text/javascript' }); response.end(route.body); } };
    if (route.delay) { const timer = setTimeout(() => { timers.delete(timer); send(); }, route.delay); timers.add(timer); } else send();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = new Browser({ timeout: 5000 }), page = browser.createPage(), errors = [];
  page.on('pageError', error => errors.push(error.message));
  t.after(async () => {
    browser.close(); for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  await page.navigate(`http://127.0.0.1:${server.address().port}/page.html`);
  return { page, errors };
}

test('successive external writes preserve observed native DOM call order and currentScript restoration', async t => {
  const scenario = parserResetCases[0]; const { page, errors } = await fixture(t, scenario.html, scenario.routes);
  const result = plain(page.evaluate('window.probeResult'));
  assert.deepEqual(result.ids, ['outer', 'written', 'one', 'two', 'nested', 'inner', 'tail']);
  assert.deepEqual(result.steps[0], { at: 'before', tail: false, current: 'outer' });
  assert.deepEqual(result.steps.at(-1), { at: 'after', tail: false, inner: true, current: 'outer' });
  // Native's fragment-per-call behavior is retained: separate external calls
  // neither reopen the section nor join a split start tag into a parser token.
  assert.deepEqual(result.sectionChildren, []); assert.equal(result.splitText, null);
  assert.deepEqual(errors, []);
});

test('document.open during a directly executing inline parser script is the observed native no-op', async t => {
  const scenario = parserResetCases[1]; const { page, errors } = await fixture(t, scenario.html, scenario.routes);
  assert.deepEqual(plain(page.evaluate('window.probeResult')), {
    steps: [{ sameResult: true, sameDocument: true, state: 'loading', current: 'SCRIPT' }, { written: true }],
    written: true, tail: true, state: 'complete',
  });
  assert.deepEqual(errors, []);
});

test('a stylesheet-delayed inline parser script retains parser nesting outside the tokenizer loop', async t => {
  const { page, errors } = await fixture(t, `<!doctype html><link rel="stylesheet" href="/slow.css"><p id="before">before</p>
    <script>window.same=document.open()===document;document.write('<b id="written">written</b>');</script><p id="tail">tail</p>`, {
    '/slow.css': { delay: 25, type: 'text/css', body: 'b { color: red }' },
  });
  assert.deepEqual(plain(page.evaluate(`({same, before:!!document.getElementById('before'),written:!!document.getElementById('written'),tail:!!document.getElementById('tail')})`)), {
    same: true, before: true, written: true, tail: true,
  });
  assert.deepEqual(errors, []);
});

test('a dynamic inline script nested inside an external parser script inherits its open guard', async t => {
  const { page, errors } = await fixture(t, '<!doctype html><script id="outer" src="/outer.js"></script><p id="tail">tail</p>', {
    '/outer.js': { body: `const nested=document.createElement('script');nested.text='window.same=document.open()===document;document.write("<b id=written>written</b>");';document.head.append(nested);window.outerConnected=document.currentScript.isConnected;` },
  });
  assert.deepEqual(plain(page.evaluate(`({same, outerConnected, written:!!document.getElementById('written'),tail:!!document.getElementById('tail')})`)), {
    same: true, outerConnected: true, written: true, tail: true,
  });
  assert.deepEqual(errors, []);
});

test('parser-script nesting unwinds before a later post-load open', async t => {
  const { page } = await fixture(t, '<!doctype html><script>document.open();</script><p id="tail">tail</p>');
  assert.equal(page.evaluate('!!document.getElementById("tail")'), true);
  // This checks only that the new no-op guard has unwound. Complete post-load
  // readyState/listener/resource/parser reset support is a separate open gap.
  assert.deepEqual(plain(page.evaluate(`(()=>{const old=document;const returned=document.open();return {same:returned===old,empty:document.documentElement===null};})()`)), {
    same: true, empty: true,
  });
});
