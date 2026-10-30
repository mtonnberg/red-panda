import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = new URL('./heap-query.cc', import.meta.url);
const defaultPath = fileURLToPath(new URL(`../../.cache/heap-query-experiment/${process.platform}-${process.arch}/node-${process.versions.node}/heap-query.node`, import.meta.url));
const loaded = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');

/** Validate exact runtime/source/binary identity before dlopen. No auto-build. */
export function loadHeapQueryBinding(filename = process.env.RED_PANDA_HEAP_QUERY_ADDON ?? defaultPath) {
  filename = path.resolve(filename);
  let manifest;
  try { manifest = JSON.parse(readFileSync(`${filename}.json`, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Heap-query addon missing for Node ${process.version}; run node experiments/heap-query/build.mjs with this Node executable`, { cause: error });
    throw error;
  }
  const expected = { kind: 'red-panda-heap-query', schema: 1,
    node: process.version, abi: process.versions.modules, v8: process.versions.v8,
    platform: process.platform, architecture: process.arch };
  for (const [key, value] of Object.entries(expected)) if (manifest[key] !== value) {
    throw new Error(`Heap-query addon ${key} does not match the running Node process; rebuild for ${process.version}`);
  }
  if (manifest.sourceSHA256 !== digest(readFileSync(source))) throw new Error('Heap-query addon source changed; rebuild it');
  if (manifest.binarySHA256 !== digest(readFileSync(filename))) throw new Error('Heap-query addon binary digest does not match its build manifest');
  const previous = loaded.get(filename);
  if (previous && previous.digest !== manifest.binarySHA256) throw new Error('Heap-query addon was replaced after loading; restart this Node process');
  if (previous) return previous.binding;
  const binding = require(filename);
  if (binding.headersVersion !== process.version || String(binding.abiVersion) !== process.versions.modules || typeof binding.queryObjects !== 'function') {
    throw new Error('Heap-query addon was compiled against different Node headers');
  }
  loaded.set(filename, { digest: manifest.binarySHA256, binding });
  return binding;
}

/** Synchronous whole-isolate heap query returning actual objects, never counts
 * or reconstructed copies. Bounds reject rather than truncate. The caller must
 * validate the prototype handle's page/context authority before calling.
 * Snapshot construction blocks and cooperative timeout checks cannot preempt
 * every V8 snapshot phase; this is not an execution-isolation boundary.
 */
export function queryHeapObjects(prototype, { maxResults = 100000, maxNodes = 2000000,
  timeout = 10000, maxEdges = 10000000, addonPath } = {}) {
  return loadHeapQueryBinding(addonPath).queryObjects(prototype, maxResults, maxNodes, timeout, maxEdges);
}
