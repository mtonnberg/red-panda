// Optional upstream test inputs, kept outside production source. The verified
// archive preserves its original license; no native engine is built or loaded.
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const commit = '948d773786380bae36f046639fc61e2ddddd212a';
const archiveSHA256 = 'b4e3f3c1471fefcddc4be0783b5d36711b51028ab8386fc25d5cf7a1ac584643';
const harnessSHA256 = '23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b';
const cache = fileURLToPath(new URL('../.cache/lightpanda-reference/', import.meta.url));
const source = join(cache, `browser-${commit.slice(0, 10)}`), archive = join(cache, `${commit}.tar.gz`);
const inventory = JSON.parse(await readFile(new URL('../docs/reference/upstream-fixture-inventory.json', import.meta.url), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function verify(directory) {
  const root = join(directory, 'src/browser/tests');
  if (digest(await readFile(join(root, 'testing.js'))) !== harnessSHA256) throw new Error('Reference harness differs from its pinned digest');
  for (const fixture of inventory.fixtures) {
    if (digest(await readFile(join(root, fixture.path))) !== fixture.sha256) throw new Error(`Reference fixture differs from its pinned digest: ${fixture.path}`);
  }
  await access(join(directory, 'LICENSE')); await access(join(directory, 'LICENSING.md'));
}
await mkdir(cache, { recursive: true });
if (!await exists(source)) {
  if (!await exists(archive)) {
    const response = await fetch(`https://codeload.github.com/lightpanda-io/browser/tar.gz/${commit.slice(0, 9)}`, { redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Reference archive HTTP ${response.status}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.byteLength; if (size > 32 * 1024 * 1024) throw new Error('Reference archive exceeds 32 MiB'); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    if (digest(bytes) !== archiveSHA256) throw new Error('Reference archive digest mismatch');
    await writeFile(archive, bytes, { flag: 'wx' });
  }
  if (digest(await readFile(archive)) !== archiveSHA256) throw new Error('Cached reference archive digest mismatch');
  const temporary = await mkdtemp(join(cache, 'extract-'));
  try {
    await promisify(execFile)('tar', ['-xzf', archive, '--strip-components=1', '-C', temporary]);
    await verify(temporary); await rename(temporary, source);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}
await verify(source);
console.log(JSON.stringify({ source, commit, archiveSHA256, fixtureCount: inventory.fixtures.length, harnessSHA256, productionEngineImported: false }));
