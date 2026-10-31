import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser } from '../src/browser.js';
import {enableNetworkCapture,capturedResponseBody} from '../src/network-capture.js';
import { createFixture } from './fixture.js';

const exec = promisify(execFile);
let fixture;
before(async () => { fixture = await createFixture(); });
after(async () => { await fixture.close(); });

test('load runs inline and external JavaScript; done includes fetch and timers', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    await page.navigate(fixture.url, { waitUntil: 'networkidle0' });
    assert.equal(page.evaluate('document.title'), 'Red Panda fixture');
    assert.equal(page.evaluate("document.querySelector('h1').textContent"), 'external script ran');
    assert.equal(page.evaluate("document.querySelector('#async').textContent"), 'async data');
    assert.equal(page.evaluate("document.querySelector('#timer').textContent"), 'timer ran');
    assert.deepEqual(JSON.parse(page.dump('links')), [{ text: 'Next', href: `${fixture.url}next` }]);
    assert.match(page.dump('markdown'), /# external script ran/);
    assert.match(page.dump('markdown'), new RegExp(`\\[Next\\]\\(http://127\\.0\\.0\\.1:`));
    assert.doesNotMatch(page.dump('markdown'), /addEventListener/);
  } finally { browser.close(); }
});

test('selector and script waiting observe asynchronous DOM changes', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    await page.navigate(fixture.url, { selector: '#async:not(:empty)', script: "document.querySelector('#timer').textContent === 'timer ran'" });
    assert.equal(page.evaluate("document.querySelector('#async').textContent"), 'async data');
  } finally { browser.close(); }
});

test('JavaScript can be disabled without fetching external scripts', async () => {
  const browser = new Browser({ javascript: false });
  try {
    const page = browser.createPage();
    const requests = []; page.on('request', request => requests.push(request.url));
    await page.navigate(fixture.url);
    assert.equal(page.evaluate("document.querySelector('h1').textContent"), 'original');
    assert.deepEqual(requests, [fixture.url]);
  } finally { browser.close(); }
});

test('cookies survive redirects and contexts isolate them', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    await page.navigate(`${fixture.url}redirect`);
    assert.equal(page.url, `${fixture.url}next`);
    assert.equal(page.evaluate('document.cookie'), 'redirect=kept');
    const echoed = await page.fetch('/echo-cookie');
    assert.match(await echoed.text(), /redirect=kept/);
    const isolated = browser.createPage(browser.createContext());
    await isolated.navigate(`${fixture.url}next`);
    assert.equal(isolated.evaluate('document.cookie'), '');
  } finally { browser.close(); }
});

test('HTTP error documents are usable and navigation failures reject', async () => {
  const browser = new Browser({ timeout: 1500 });
  try {
    const page = browser.createPage();
    await page.navigate(`${fixture.url}missing`);
    assert.equal(page.status, 404);
    assert.match(page.dump(), /Not found/);
    await assert.rejects(page.navigate(`${fixture.url}loop`), /Too many redirects/);
    page.timeout = 150;
    await assert.rejects(page.navigate(`${fixture.url}slow`), /abort|timeout/i);
    await assert.rejects(page.navigate('file:///etc/passwd'), /Only HTTP/);
  } finally { browser.close(); }
});

test('script exceptions are observable and do not discard the document', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    const errors = []; page.on('pageError', error => errors.push(error.message));
    await page.navigate(`${fixture.url}script-error`);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /fixture exception/);
    assert.match(page.dump('text'), /still usable/);
  } finally { browser.close(); }
});

test('selector deadline rejects and closing releases pages and timers', async () => {
  const browser = new Browser({ timeout: 200 });
  const page = browser.createPage();
  try { await assert.rejects(page.navigate(fixture.url, { selector: '#does-not-exist' }), /Timed out/); }
  finally { browser.close(); }
  assert.equal(browser.pages.size, 0);
  assert.throws(() => page.evaluate('1'), /closed/);
});

test('CLI JSON exposes the DOM dump and HTTP status; HTTP errors exit 22', async () => {
  const { stdout } = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', '--wait-until', 'done', fixture.url]);
  const data = JSON.parse(stdout);
  assert.equal(data.http_status, 200);
  assert.equal(data.error, null);
  assert.match(data.content, /async data/);
  await assert.rejects(exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', '--fail-on-http-error', `${fixture.url}missing`]), error => {
    assert.equal(error.code, 22);
    assert.equal(JSON.parse(error.stdout).http_status, 404);
    assert.match(JSON.parse(error.stdout).content, /Not found/);
    return true;
  });
});

test('CLI rejects invalid formats, deadlines and commands', async () => {
  for (const args of [['fetch', '--dump', 'unsupported', fixture.url], ['fetch', '--wait-ms', 'NaN', fixture.url], ['unexpected']]) {
    await assert.rejects(exec(process.execPath, ['bin/red-panda.js', ...args]), error => error.code === 1);
  }
});

test('batch CLI keeps order, includes failed pages and prioritizes failure exit 1 over 22', async () => {
  await assert.rejects(exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', '--fail-on-http-error',
    `${fixture.url}missing`, 'http://127.0.0.1:1/unreachable', `${fixture.url}next`]), error => {
    assert.equal(error.code, 1);
    const data = JSON.parse(error.stdout);
    assert.deepEqual(data.results.map(result => result.http_status), [404, 0, 200]);
    assert.deepEqual(data.results.map(result => Boolean(result.error)), [false, true, false]);
    assert.match(data.results[1].content, /Navigation failed/);
    assert.match(data.results[2].content, /Next page/);
    return true;
  });
  await assert.rejects(exec(process.execPath, ['bin/red-panda.js', 'fetch', fixture.url, `${fixture.url}next`]), /requires --json/);
});

test('single URL failures remain structured JSON and preserve the requested URL', async () => {
  await assert.rejects(exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', 'http://127.0.0.1:1/unreachable']), error => {
    const result = JSON.parse(error.stdout);
    assert.equal(error.code, 1);
    assert.equal(result.url, 'http://127.0.0.1:1/unreachable');
    assert.equal(result.http_status, 0);
    assert.equal(result.error, 'CouldntConnect');
    return true;
  });
});

test('CLI mixes inline and file preloads in command-line order before page code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'red-panda-preload-'));
  try {
    const path = join(directory, 'middle.js');
    await writeFile(path, 'globalThis.boot += "B";');
    const page = 'data:text/html,<h1></h1><script>document.querySelector("h1").textContent=globalThis.boot</script>';
    const { stdout } = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json',
      '--inject-script', 'globalThis.boot="A"', '--inject-script-file', path, '--inject-script', 'globalThis.boot+="C"', page]);
    assert.match(JSON.parse(stdout).content, /<h1>ABC<\/h1>/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('batch pages isolate newly set cookies; a saved jar can seed a later CLI run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'red-panda-cli-cookies-'));
  const jar = join(directory, 'cookies.json');
  try {
    const { stdout } = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', '--cookie-jar', jar,
      fixture.url, `${fixture.url}echo-cookie`]);
    assert.doesNotMatch(JSON.parse(stdout).results[1].content, /server=present/);
    assert.ok(JSON.parse(await readFile(jar, 'utf8')).some(cookie => cookie.name === 'server' && cookie.httpOnly));
    const loaded = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', '--cookie', jar, `${fixture.url}echo-cookie`]);
    assert.match(JSON.parse(loaded.stdout).content, /server=present/);
    const netscape = join(directory, 'legacy.txt');
    await writeFile(netscape, '#HttpOnly_127.0.0.1\tFALSE\t/\tFALSE\t0\tlegacy\tdummy\n');
    const legacy = await exec(process.execPath, ['bin/red-panda.js', 'fetch', '--dump', 'html', '--json', '--cookie', netscape, `${fixture.url}echo-cookie`]);
    assert.match(JSON.parse(legacy.stdout).content, /legacy=dummy/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('preload exceptions are reported and subsequent scripts still execute', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    const errors = []; page.on('pageError', error => errors.push(error.message));
    page.newDocumentScripts.set('first', { source: 'throw new Error("preload exception")' });
    page.newDocumentScripts.set('second', { source: 'globalThis.fixturePreload="after error"' });
    await page.navigate(fixture.url);
    assert.deepEqual(errors, ['preload exception']);
    assert.equal(page.evaluate('globalThis.observedPreload'), 'after error');
  } finally { browser.close(); }
});

test('plain-text and JSON responses display text rather than executing or parsing HTML', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    enableNetworkCapture(page.context);
    await page.navigate(`${fixture.url}plain-text`);
    assert.equal(page.evaluate('document.contentType'), 'text/plain');
    assert.equal(page.evaluate('typeof globalThis.shouldNotRun'), 'undefined');
    assert.equal(page.dom.window.document.querySelector('b'), null);
    assert.equal(page.evaluate('document.body.textContent'), '\n<script>globalThis.shouldNotRun=true</script><b>literal & text</b>');
    assert.deepEqual(capturedResponseBody(page.context,{requestId:page.loaderId}), {body:'\n<script>globalThis.shouldNotRun=true</script><b>literal & text</b>',base64Encoded:false});
    await page.navigate(`${fixture.url}api`);
    assert.equal(page.evaluate('document.contentType'), 'application/json');
    assert.equal(page.evaluate('document.querySelector("pre").textContent'), '{"message":"async data"}');
  } finally { browser.close(); }
});

test('external scripts retain headers, redirects and separate Set-Cookie values through the shared transport', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    page.setExtraHTTPHeaders({ 'X-Client': 'resource-test' });
    const requests = []; page.on('request', request => requests.push(request));
    await page.navigate(`${fixture.url}resource-redirect-page`);
    assert.equal(page.evaluate("JSON.parse(document.querySelector('#resource').textContent)['x-client']"), 'resource-test');
    assert.match(page.evaluate('document.cookie'), /resource-one=a/);
    assert.match(page.evaluate('document.cookie'), /resource-two=b/);
    assert.ok(requests.filter(request => request.type === 'Script').every(request => request.headers['x-client'] === 'resource-test'));
  } finally { browser.close(); }
});

test('HTTP script failures retain resource diagnostics without reporting authored exceptions', async () => {
  const browser = new Browser();
  try {
    const page = browser.createPage();
    const errors = [], resources = []; page.on('pageError', error => errors.push(error)); page.on('resourceError', error => resources.push(error));
    await page.navigate(`${fixture.url}resource-error-page`);
    assert.equal(page.evaluate("document.querySelector('h1').textContent"), 'Document survived');
    assert.deepEqual(errors, []);
    assert.equal(resources.length, 1);
    assert.match(resources[0].message, /Could not load script/);
    assert.equal(page.evaluate('document.readyState'), 'complete');
  } finally { browser.close(); }
});

test('cross-origin redirects remove authored authorization and reduce automatic referrers to the origin', async () => {
  const destination = await createFixture();
  const received = [];
  destination.server.on('request', request => received.push(request.headers));
  const browser = new Browser();
  try {
    const page = browser.createPage();
    await page.navigate(`${fixture.url}next?private=fixture-only`);
    const response = await page.fetch(`${fixture.url}redirect-to?url=${encodeURIComponent(`${destination.url}header-api`)}`, {
      headers: { Authorization: 'fixture-authorization' },
    });
    const data = await response.json();
    assert.equal(data.referer, fixture.url);
    assert.equal(received.length, 1);
    assert.equal(received[0].authorization, undefined);
    assert.equal(page.referrerFor('http://elsewhere.test/', 'https://origin.test/private'), null);
  } finally { browser.close(); await destination.close(); }
});
