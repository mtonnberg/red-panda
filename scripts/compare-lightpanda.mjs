import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { JSDOM } from 'jsdom';
import { createFixture } from '../test/fixture.js';
import { connect } from '../test/cdp-client.js';
import { serve } from '../src/cdp.js';
import { until } from '../src/browser.js';
import { startReference } from './reference-server.mjs';
import { probeRequestHeaders } from '../test/header-probe.js';
import { probeHistory, historyObservation } from '../test/history-probe.js';

const exec = promisify(execFile);
const binary = process.argv[2];
if (!binary) { console.error('Usage: npm run test:reference -- /path/to/verified/lightpanda'); process.exit(1); }
const reference = resolve(binary);
const sha256 = createHash('sha256').update(await readFile(reference)).digest('hex');
const fixture = await createFixture();
const temporary = await mkdtemp(join(tmpdir(), 'red-panda-comparison-'));
let official, service;
const results = [];
const run = async (command, prefix, args) => {
  try { return { ...(await exec(command, [...prefix, ...args], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 })), code: 0 }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return { stdout: error.stdout, stderr: error.stderr, code: error.code }; }
};
const compare = async (name, args, project) => {
  const baseline = await run(reference, [], args);
  const expected = await project(baseline);
  const candidate = await run(process.execPath, ['bin/red-panda.js'], args);
  assert.deepEqual(await project(candidate), expected, name);
  results.push({ name, passed: true }); console.log(`PASS ${name}`);
};
try {
  await compare('scripts, async fetch, timers and resolved links after done',
    ['fetch', '--dump', 'html', '--wait-until', 'done', '--wait-ms', '3000', fixture.url], result => {
      assert.equal(result.code, 0);
      const dom = new JSDOM(result.stdout, { url: fixture.url });
      const document = dom.window.document;
      const value = { title: document.title, heading: document.querySelector('h1').textContent,
        async: document.querySelector('#async').textContent, timer: document.querySelector('#timer').textContent,
        links: [...document.links].map(link => link.href) };
      dom.window.close(); return value;
    });
  await compare('selector readiness observes fetched data',
    ['fetch', '--dump', 'html', '--wait-selector', '#async:not(:empty)', '--wait-ms', '3000', fixture.url], result => {
      assert.equal(result.code, 0); const dom = new JSDOM(result.stdout);
      const text = dom.window.document.querySelector('#async').textContent; dom.window.close(); return text;
    });
  await compare('markdown headings, absolute links and script removal',
    ['fetch', '--dump', 'markdown', '--wait-until', 'done', '--wait-ms', '3000', fixture.url], result => {
      assert.equal(result.code, 0); return { heading: result.stdout.includes('# external script ran'),
        link: result.stdout.includes(`[Next](${fixture.url}next)`), scriptRemoved: !result.stdout.includes('addEventListener') };
    });
  await compare('HTTP 404 dump and exit 22',
    ['fetch', '--dump', 'html', '--json', '--fail-on-http-error', `${fixture.url}missing`], result => {
      assert.equal(result.code, 22); const data = JSON.parse(result.stdout);
      return { status: data.http_status, content: data.content.includes('Not found'), error: data.error };
    });

  await compare('batch results preserve order and failures override HTTP-error exits',
    ['fetch', '--dump', 'html', '--json', '--fail-on-http-error', `${fixture.url}missing`,
      'http://127.0.0.1:1/unreachable', `${fixture.url}next`], result => {
      assert.equal(result.code, 1);
      return JSON.parse(result.stdout).results.map(row => ({ url: row.url, status: row.http_status, error: row.error }));
    });
  const middle = join(temporary, 'middle.js');
  await writeFile(middle, 'globalThis.boot += "B";');
  const preloadPage = 'data:text/html,<h1></h1><script>document.querySelector("h1").textContent=globalThis.boot</script>';
  await compare('inline and file preload ordering before page scripts',
    ['fetch', '--dump', 'html', '--json', '--inject-script', 'globalThis.boot="A"',
      '--inject-script-file', middle, '--inject-script', 'globalThis.boot+="C"', preloadPage], result => {
      assert.equal(result.code, 0);
      const dom = new JSDOM(JSON.parse(result.stdout).content);
      const heading = dom.window.document.querySelector('h1').textContent; dom.window.close(); return heading;
    });
  const jar = join(temporary, 'cookies.json');
  await compare('batch pages isolate cookies and export the collected jar',
    ['fetch', '--dump', 'html', '--json', '--cookie-jar', jar, fixture.url, `${fixture.url}echo-cookie`], async result => {
      assert.equal(result.code, 0);
      const rows = JSON.parse(result.stdout).results;
      const dom = new JSDOM(rows[1].content);
      const echoed = dom.window.document.body.textContent; dom.window.close();
      const cookies = JSON.parse(await readFile(jar, 'utf8')).map(({ name, value, domain, path, httpOnly }) => ({ name, value, domain, path, httpOnly }));
      return { echoed, cookies };
    });
  const cookieEcho = result => {
    assert.equal(result.code, 0);
    const dom = new JSDOM(JSON.parse(result.stdout).content);
    const text = dom.window.document.body.textContent; dom.window.close(); return text;
  };
  await compare('a saved JSON cookie jar seeds a later fetch',
    ['fetch', '--dump', 'html', '--json', '--cookie', jar, `${fixture.url}echo-cookie`], cookieEcho);
  const netscape = join(temporary, 'cookies.txt');
  await writeFile(netscape, '# Netscape HTTP Cookie File\n#HttpOnly_127.0.0.1\tFALSE\t/\tFALSE\t0\tlegacy\tdummy\n');
  await compare('Netscape HttpOnly cookie import',
    ['fetch', '--dump', 'html', '--json', '--cookie', netscape, `${fixture.url}echo-cookie`], cookieEcho);
  await compare('plain-text responses preserve literal markup',
    ['fetch', '--dump', 'html', '--json', `${fixture.url}plain-text`], result => {
      assert.equal(result.code, 0);
      const dom = new JSDOM(JSON.parse(result.stdout).content);
      const value = { text: dom.window.document.body.textContent, parsedElements: dom.window.document.querySelectorAll('script,b').length };
      dom.window.close(); return value;
    });

  official = await startReference(reference);
  service = await serve({ port: 0 });
  const probe = async endpoint => {
    const client = await connect(endpoint);
    let browserContextId;
    try {
      ({ browserContextId } = await client.send('Target.createBrowserContext'));
      const { targetId } = await client.send('Target.createTarget', { browserContextId, url: 'about:blank' });
      const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params = {}) => client.send(method, params, sessionId);
      await send('Page.enable'); await send('Runtime.enable');
      await send('Page.navigate', { url: fixture.url });
      await until(async () => (await send('Runtime.evaluate', { expression: "document.querySelector('#async')?.textContent", returnByValue: true })).result?.value === 'async data');
      const heading = await send('Runtime.evaluate', { expression: "document.querySelector('h1').textContent", returnByValue: true });
      const clicked = await send('Runtime.evaluate', { expression: "document.querySelector('button').click(); document.querySelector('h1').textContent", returnByValue: true });
      await send('Network.setCookie', { url: fixture.url, name: 'comparison', value: 'works' });
      const cookies = await send('Network.getCookies', { urls: [fixture.url] });
      const dump = await send('LP.dump', { format: 'markdown' });
      return { heading: heading.result.value, clicked: clicked.result.value,
        cookie: cookies.cookies.find(cookie => cookie.name === 'comparison')?.value,
        dump: { format: dump.format, heading: dump.content?.includes('# clicked'), link: dump.content?.includes(`[Next](${fixture.url}next)`) } };
    } finally {
      if (browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId });
      await client.close();
    }
  };
  assert.deepEqual(await probe(`ws://127.0.0.1:${service.port}/`), await probe(official.endpoint));
  results.push({ name: 'CDP contexts, navigation, evaluation, DOM clicks and cookies', passed: true });
  console.log('PASS CDP contexts, navigation, evaluation, DOM clicks and cookies');
  assert.deepEqual(
    await probeRequestHeaders(`ws://127.0.0.1:${service.port}/`, fixture.url, { enableNetwork: true }),
    await probeRequestHeaders(official.endpoint, fixture.url, { enableNetwork: true }),
  );
  results.push({ name: 'CDP extra headers, user agent, language, referrers and clearing', passed: true });
  console.log('PASS CDP extra headers, user agent, language, referrers and clearing');
  assert.deepEqual(
    historyObservation(await probeHistory(`ws://127.0.0.1:${service.port}/`, fixture.url, { scripted: true })),
    historyObservation(await probeHistory(official.endpoint, fixture.url, { scripted: true })),
  );
  results.push({ name: 'History API, scripted fragments, traversal and navigation events', passed: true });
  console.log('PASS History API, scripted fragments, traversal and navigation events');
  console.log(JSON.stringify({ referenceSHA256: sha256, checks: results }, null, 2));
} finally {
  await service?.close();
  await official?.close();
  await fixture.close();
  await rm(temporary, { recursive: true, force: true });
}
