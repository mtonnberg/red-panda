import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

function cli(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/red-panda.js', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`CLI deadline: ${args[0]}`)); }, 15000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ stdout, stderr, code, signal }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

test('saved-script CLI executes files and stdin and retains console output on failure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'red-panda-cli-script-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'browser.js');
  await writeFile(path, 'const page=new Page();await page.goto("data:text/html,<h1>Script CLI</h1>");return page.evaluate("document.querySelector(\'h1\').textContent");');
  const file = await cli(['run', path]);
  assert.equal(file.code, 0, file.stderr); assert.equal(file.stdout, 'Script CLI\n');
  const stdin = await cli(['run', '-'], 'console.log("stdin");return {answer:42};');
  assert.equal(stdin.code, 0, stdin.stderr); assert.equal(stdin.stdout, 'stdin\n{"answer":42}\n');
  const failed = await cli(['run', '-'], 'console.log("before failure");throw new Error("intentional script failure");');
  assert.equal(failed.code, 1); assert.equal(failed.stdout, 'before failure\n'); assert.match(failed.stderr, /intentional script failure/);
});

test('MCP stdio CLI initializes, discovers tools, rejects malformed JSON and closes at EOF', async () => {
  const result = await cli(['mcp'], [
    '{bad json}',
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  ].join('\n') + '\n');
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(messages.length, 3); assert.equal(messages[0].error.code, -32700);
  assert.equal(messages[1].result.serverInfo.name, 'red-panda');
  assert.ok(messages[2].result.tools.some(tool => tool.name === 'goto'));
});

test('fetch defaults to no dump and dump errors remain isolated within a batch', async () => {
  const url = 'data:text/html,<h1>Default output</h1>';
  const plain = await cli(['fetch', url]); assert.equal(plain.code, 0, plain.stderr); assert.equal(plain.stdout, '');
  const json = await cli(['fetch', '--json', url]); const status = JSON.parse(json.stdout);
  assert.equal(status.dump, ''); assert.equal(status.content, ''); assert.equal(status.http_status, 200);
  const mixed = await cli(['fetch', '--json', '--dump', 'html', '--dump-selector', '#present',
    'data:text/html,<h1>Missing</h1>', 'data:text/html,<section id=present>Found</section>']);
  assert.equal(mixed.code, 1); const { results } = JSON.parse(mixed.stdout);
  assert.equal(results[0].error, 'SelectorNotFound'); assert.equal(results[0].content, '');
  assert.equal(results[1].error, null); assert.equal(results[1].content, '<section id="present">Found</section>');
});

test('fetch dump flags preserve Unicode boundaries and remove requested groups', async () => {
  const url = 'data:text/html,' + encodeURIComponent('<!doctype html><style>p{color:red}</style><h1 id="target">🐼 Panda</h1><script>globalThis.ran=true</script>');
  const capped = await cli(['fetch', '--json', '--dump', 'html', '--dump-selector', '#target', '--dump-max-bytes', '24', url]);
  assert.equal(capped.code, 0, capped.stderr);
  const content = JSON.parse(capped.stdout).content;
  assert.equal(content, '<h1 id="target">🐼 Pan\n\n[truncated]\n');
  assert.doesNotMatch(content, /\uFFFD/);
  const stripped = await cli(['fetch', '--json', '--dump', 'html', '--strip-mode', 'js', '--strip-mode', 'css', url]);
  assert.equal(stripped.code, 0, stripped.stderr);
  assert.doesNotMatch(JSON.parse(stripped.stdout).content, /<(?:style|script)/);
  const semantic = await cli(['fetch', '--json', '--dump', 'semantic_tree', url]);
  assert.equal(semantic.code, 0, semantic.stderr); assert.ok(JSON.parse(JSON.parse(semantic.stdout).content));
});

test('Markdown alternate CLI selects authored response metadata and preserves failed-origin status', async t => {
  const requested = [];
  const server = http.createServer((req, res) => {
    requested.push(req.url);
    if (req.url === '/docs/note.md') {
      res.writeHead(206, { 'content-type': 'text/plain', 'x-source': 'alternate' }); res.end('# Authored Markdown\n');
    } else {
      res.writeHead(req.url === '/origin-failed' ? 404 : 200, { 'content-type': 'text/html', 'x-source': 'html' });
      res.end('<!doctype html><base href="/docs/"><h1>DOM fallback</h1><link rel="alternate" type="text/markdown" href="note.md">');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const flags = ['fetch', '--json', '--dump', 'markdown', '--markdown-alternate'];
  const selected = await cli([...flags, `${base}/article`]);
  assert.equal(selected.code, 0, selected.stderr);
  const output = JSON.parse(selected.stdout);
  assert.equal(output.content, '# Authored Markdown\n'); assert.equal(output.url, `${base}/docs/note.md`);
  assert.equal(output.http_status, 206); assert.equal(output.headers.find(header => header.name === 'x-source').value, 'alternate');
  const count = requested.length;
  const conflict = await cli([...flags, '--dump-selector', 'h1', `${base}/never`]);
  assert.equal(conflict.code, 1); assert.equal(requested.length, count);
  const failed = await cli([...flags, '--fail-on-http-error', `${base}/origin-failed`]);
  assert.equal(failed.code, 22); const preserved = JSON.parse(failed.stdout);
  assert.equal(preserved.url, `${base}/origin-failed`); assert.equal(preserved.http_status, 404);
  assert.match(preserved.content, /# DOM fallback/); assert.equal(preserved.error, null);
  assert.equal(requested.filter(path => path === '/docs/note.md').length, 1);
});
