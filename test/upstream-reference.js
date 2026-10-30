import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = process.env.RED_PANDA_REFERENCE_TESTS_ROOT ?? fileURLToPath(new URL('../.cache/lightpanda-reference/browser-948d773786/src/browser/tests/', import.meta.url));
export async function upstreamTestRoot() {
  let harness;
  try { harness = await readFile(join(root, 'testing.js')); }
  catch (error) { throw new Error('Pinned upstream test inputs are missing; run npm run prepare:reference', { cause: error }); }
  if (createHash('sha256').update(harness).digest('hex') !== '23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b') throw new Error('Upstream test harness digest mismatch');
  return root;
}
