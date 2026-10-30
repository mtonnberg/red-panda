import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Browser } from '../src/browser.js';
import { alternateMarkdown } from '../src/markdown-alternate.js';
import { createMCPHandler } from '../src/mcp.js';

let server, origin;
const requests = [];
const authored = '# Authored markdown\n\nOwn document.\n';
const fallback = '\n# DOM fallback\n\nOriginal body\n';

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    requests.push({ path: request.url, headers: Object.fromEntries(['accept', 'cookie', 'referer', 'x-own'].map(name => [name, request.headers[name] ?? null])) });
    if (url.pathname === '/page') {
      const kind = url.searchParams.get('kind') ?? 'markdown';
      let links = `<link rel=alternate type=text/markdown href="/alternate?kind=${kind}">`;
      if (kind === 'missing') links = '';
      if (kind === 'attrplain') links = '<link rel=alternate type=text/plain href="/alternate?kind=plain">';
      if (kind === 'attrcase') links = '<link rel="other alternate" type="TEXT/MARKDOWN" href="/alternate?kind=markdown">';
      if (kind === 'parameters') links = '<link rel=alternate type="text/markdown; charset=utf-8" href="/alternate?kind=markdown">';
      if (kind === 'multiple') links = '<link rel=alternate type=text/markdown href="/alternate?kind=wrong"><link rel=alternate type=text/markdown href="/alternate?kind=markdown">';
      if (kind === 'base') links = '<base href="/assets/"><link rel=alternate type=text/markdown href="own.md">';
      if (kind === 'unsupported') links = '<link rel=alternate type=text/markdown href="javascript:42">';
      if (kind === 'invalid') links = '<link rel=alternate type=text/markdown href="http://[invalid">';
      const send = () => {
        response.writeHead(kind === 'original404' ? 404 : kind === 'original300' ? 300 : 202,
          { 'content-type': 'text/html', 'x-origin-fixture': 'html', 'set-cookie': 'own_fixture=present; Path=/' });
        response.end(`<!doctype html><title>Alternate fixture</title>${links}<h1>DOM fallback</h1><p>Original body</p>`);
      };
      if (url.searchParams.has('delay')) setTimeout(send, Number(url.searchParams.get('delay'))); else send();
      return;
    }
    if (url.pathname === '/assets/own.md') {
      response.writeHead(200, { 'content-type': 'text/markdown', 'x-alternate-fixture': 'base' }); response.end('# Base markdown\n'); return;
    }
    if (url.pathname === '/alternate') {
      const kind = url.searchParams.get('kind');
      if (kind === 'redirect') { response.writeHead(302, { location: '/alternate?kind=markdown' }); response.end(); return; }
      if (kind === 'disconnect') { response.destroy(); return; }
      const send = () => {
        response.writeHead(({ status404: 404, status201: 201, status204: 204, status206: 206, status300: 300 })[kind] ?? 200,
          { 'content-type': kind === 'wrong' ? 'text/html' : kind === 'plain' ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8', 'x-alternate-fixture': 'markdown' });
        response.end(kind === 'wrong' ? '<h1>Not Markdown</h1>' : kind === 'empty' ? '' : kind === 'whitespace' ? '\n' : authored);
      };
      if (kind === 'slow' || kind === 'long') setTimeout(send, kind === 'long' ? 900 : 250); else send();
      return;
    }
    response.writeHead(404); response.end('Missing own fixture');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(accept => server.close(accept)); });

async function pageFor(kind, body) {
  const browser = new Browser({ timeout: 2000 });
  try {
    const page = browser.createPage(); page.setExtraHTTPHeaders({ 'x-own': 'dummy-fixture' });
    await page.navigate(`${origin}/page?kind=${kind}`);
    return await body(page);
  } finally { browser.close(); }
}
const header = (result, name) => result.headers.find(item => item.name.toLowerCase() === name)?.value;

test('MCP Markdown alternates read authored content and retain the loaded document', async () => {
  const handler = createMCPHandler();
  try {
    const result = await handler.callTool('markdown', { url: `${origin}/page?kind=markdown`, alternate: true });
    assert.equal(result.content[0].text, authored); assert.equal(handler.page.dom.window.document.querySelector('h1').textContent, 'DOM fallback');
    assert.equal(handler.page.url, `${origin}/page?kind=markdown`);
    const before = requests.length;
    await assert.rejects(handler.callTool('markdown', { alternate: true, selector: 'h1' }), /cannot be scoped/);
    assert.equal(requests.length, before);
    const fallbackResult = await handler.callTool('markdown', { url: `${origin}/page?kind=wrong`, alternate: true });
    assert.equal(fallbackResult.content[0].text, fallback);
  } finally { handler.close(); }
});

test('authored Markdown replaces output metadata while preserving the loaded page', async () => {
  await pageFor('markdown', async page => {
    const before = requests.length, original = { url: page.url, status: page.status, document: page.dom.window.document };
    const result = await alternateMarkdown(page, { deadline: Date.now() + 1500 });
    assert.equal(result.content, authored); assert.equal(result.url, `${origin}/alternate?kind=markdown`);
    assert.equal(result.sourceURL, result.url); assert.equal(result.navigationURL, original.url); assert.equal(result.httpStatus, 200);
    assert.equal(header(result, 'x-alternate-fixture'), 'markdown'); assert.equal(header(result, 'x-origin-fixture'), undefined);
    assert.equal(result.usedAlternate, true); assert.equal(page.url, original.url); assert.equal(page.status, 202);
    assert.equal(page.dom.window.document, original.document);
    const request = requests[before];
    assert.equal(request.headers.cookie, 'own_fixture=present'); assert.equal(request.headers['x-own'], 'dummy-fixture');
    assert.equal(request.headers.referer, null); assert.equal(request.headers.accept, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  });
});

test('plain text, case-insensitive link types, base URI, redirects and successful statuses are supported', async () => {
  for (const kind of ['plain', 'attrcase', 'base', 'redirect', 'status201', 'status206']) await pageFor(kind, async page => {
    const result = await alternateMarkdown(page);
    assert.equal(result.usedAlternate, true); assert.equal(result.content, kind === 'base' ? '# Base markdown\n' : authored);
    assert.equal(result.httpStatus, kind === 'status201' ? 201 : kind === 'status206' ? 206 : 200);
    assert.equal(result.url, kind === 'base' ? `${origin}/assets/own.md` : `${origin}/alternate?kind=${['attrcase', 'redirect'].includes(kind) ? 'markdown' : kind}`);
  });
});

test('absent/nonqualifying links do not fetch and preserve original navigation metadata', async () => {
  for (const kind of ['missing', 'attrplain', 'parameters']) await pageFor(kind, async page => {
    const before = requests.length, result = await alternateMarkdown(page);
    assert.equal(result.content, fallback); assert.equal(result.url, page.url); assert.equal(result.httpStatus, 202);
    assert.equal(header(result, 'x-origin-fixture'), 'html'); assert.equal(result.usedAlternate, false);
    assert.equal(result.fallbackReason, 'missing-link'); assert.equal(requests.length, before);
  });
});

test('failed status, unsupported MIME, empty body and network failure fall back to DOM output', async () => {
  for (const [kind, reason] of [['status404', 'http-status'], ['status204', 'empty-body'], ['wrong', 'content-type'], ['empty', 'empty-body'], ['disconnect', 'fetch-failed']]) await pageFor(kind, async page => {
    const result = await alternateMarkdown(page);
    assert.equal(result.usedAlternate, false); assert.equal(result.fallbackReason, reason); assert.equal(result.content, fallback);
    assert.equal(result.url, page.url); assert.equal(result.httpStatus, 202); assert.equal(header(result, 'x-alternate-fixture'), undefined);
  });
  await pageFor('whitespace', async page => {
    const result = await alternateMarkdown(page); assert.equal(result.usedAlternate, true); assert.equal(result.content, '\n');
  });
});

test('only the first qualifying alternate is attempted', async () => {
  await pageFor('multiple', async page => {
    const before = requests.length, result = await alternateMarkdown(page);
    assert.equal(result.usedAlternate, false); assert.equal(result.content, fallback);
    assert.deepEqual(requests.slice(before).map(item => item.path), ['/alternate?kind=wrong']);
  });
});

test('origin errors are not masked by an alternate, while nonredirect origin300 may use one', async () => {
  await pageFor('original404', async page => {
    const before = requests.length, result = await alternateMarkdown(page);
    assert.equal(result.httpStatus, 404); assert.equal(result.url, page.url); assert.equal(result.content, fallback);
    assert.equal(result.usedAlternate, false); assert.equal(result.fallbackReason, 'navigation-status');
    assert.equal(requests.length, before);
  });
  await pageFor('original300', async page => {
    const result = await alternateMarkdown(page); assert.equal(result.usedAlternate, true); assert.equal(result.httpStatus, 200);
  });
  await pageFor('status300', async page => {
    const result = await alternateMarkdown(page); assert.equal(result.usedAlternate, false); assert.equal(result.fallbackReason, 'http-status');
  });
});

test('remaining navigation deadline governs alternate fetch, with fresh DOM conversion on fallback', async () => {
  const browser = new Browser({ timeout: 2000 });
  try {
    const page = browser.createPage(), started = Date.now(), diagnostics = [];
    await page.navigate(`${origin}/page?kind=long&delay=70`);
    page.evaluate('setTimeout(()=>document.querySelector("h1").textContent="Updated during wait",20)');
    const result = await alternateMarkdown(page, { deadline: started + 500, onDiagnostic: value => diagnostics.push(value) });
    assert.equal(result.usedAlternate, false); assert.equal(result.fallbackReason, 'deadline');
    assert.match(result.content, /Updated during wait/); assert.equal(result.url, page.url); assert.equal(page.activeRequests.size, 0);
    assert.deepEqual(diagnostics.map(item => item.reason), ['wait budget used up']);
  } finally { browser.close(); }
});

test('exhausted deadlines, abort and invalid destinations return explicit fallback reasons', async () => {
  await pageFor('markdown', async page => {
    const before = requests.length;
    assert.equal((await alternateMarkdown(page, { deadline: Date.now() - 1 })).fallbackReason, 'deadline');
    assert.equal((await alternateMarkdown(page, { signal: AbortSignal.abort() })).fallbackReason, 'aborted');
    assert.equal(requests.length, before);
  });
  await pageFor('invalid', async page => assert.equal((await alternateMarkdown(page)).fallbackReason, 'invalid-url'));
  await pageFor('unsupported', async page => assert.equal((await alternateMarkdown(page)).fallbackReason, 'unsupported-protocol'));
});

test('authored Markdown uses UTF-8 cap, retains raw content and rejects selector conflicts before fetching', async () => {
  await pageFor('markdown', async page => {
    assert.equal((await alternateMarkdown(page, { maxBytes: 0 })).content, '\n\n[truncated]\n');
    assert.equal((await alternateMarkdown(page, { maxBytes: 6 })).content, '# Auth\n\n[truncated]\n');
    assert.equal((await alternateMarkdown(page, { stripModes: ['clutter', 'js'] })).content, authored);
    const before = requests.length;
    await assert.rejects(alternateMarkdown(page, { selector: '#absent' }), /conflicts with --dump-selector/);
    await assert.rejects(alternateMarkdown(page, { maxBytes: -1 }), /non-negative integer/);
    await assert.rejects(alternateMarkdown(page, { stripModes: ['invented'] }), /Unknown strip mode/);
    assert.equal(requests.length, before);
  });
});

test('owned HTTP cases agree with captured native content, selected URL/status and header provenance', async () => {
  const { observations } = JSON.parse(await readFile(new URL('../docs/reference/markdown-alternate-observations.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const sample of observations) await pageFor(sample.kind, async page => {
    const result = await alternateMarkdown(page, { deadline: Date.now() + (sample.kind === 'slow' ? 150 : 1500) });
    const nativeURL = new URL(sample.result.url), selectedURL = `${origin}${nativeURL.pathname}${nativeURL.search}`;
    assert.equal(result.url, selectedURL, sample.kind); assert.equal(result.httpStatus, sample.result.http_status, sample.kind);
    assert.equal(result.content, sample.result.content, sample.kind);
    const provenance = sample.result.headers.find(item => ['x-origin-fixture', 'x-alternate-fixture'].includes(item.name));
    assert.equal(header(result, provenance.name), provenance.value); checked++;
  });
  assert.equal(checked, 12);
});
