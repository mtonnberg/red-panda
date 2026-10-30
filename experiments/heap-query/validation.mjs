import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeapQuery } from './build.mjs';

let directory, addonPath;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'red-panda-heap-query-'));
  addonPath = join(directory, 'heap-query.node');
  await buildHeapQuery({ output: addonPath });
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
async function isolated(mode) {
  const child = spawn('/bin/bash', [fileURLToPath(new URL('./run-probe.sh', import.meta.url)), process.execPath, '--expose-gc', fileURLToPath(new URL('./probe.mjs', import.meta.url)), mode, addonPath, directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 120000);
  try {
    const [code, signal] = await once(child, 'exit');
    assert.equal(signal, null, `isolated ${mode} terminated: ${signal}\n${stderr}`);
    assert.equal(code, 0, `isolated ${mode} failed\n${stderr}`);
    const result = JSON.parse(stdout.trim()); assert.equal(result.passed, true); return result;
  } finally { clearTimeout(timeout); }
}
test('heap-query loader rejects exact Node/V8/ABI/platform/source/binary mismatches before loading', async () => {
  await isolated('loader');
});
test('heap-query returns actual realm arrays/objects, true prototype descendants and explicit bound failures', async () => {
  await isolated('contracts');
});
test('heap-query survives repeated jsdom realm teardown with connected inspector sessions in an isolated process', async () => {
  const result = await isolated('lifecycle'); assert.equal(result.iterations, 4);
});
