import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

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
