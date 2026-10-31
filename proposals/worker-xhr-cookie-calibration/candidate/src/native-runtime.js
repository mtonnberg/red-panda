import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const defaultPath = fileURLToPath(new URL(`../native/build/${process.platform}-${process.arch}/node-${process.versions.node}/runtime.node`, import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
let defaultBinding;

export function loadRuntimeBinding(filename = process.env.RED_PANDA_RUNTIME_ADDON ?? defaultPath) {
  filename = path.resolve(filename);
  let manifest;
  try { manifest = JSON.parse(readFileSync(`${filename}.json`, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Runtime addon missing for Node ${process.version}; run npm run build:native with this Node executable`, { cause: error });
    throw error;
  }
  const expected = { node: process.version, abi: process.versions.modules, v8: process.versions.v8, platform: process.platform, architecture: process.arch };
  for (const [key, value] of Object.entries(expected)) if (manifest[key] !== value) throw new Error(`Runtime addon ${key} does not match the running Node process; rebuild for ${process.version}`);
  if (manifest.binarySHA256 !== digest(readFileSync(filename))) throw new Error('Runtime addon binary digest does not match its build manifest');
  if (manifest.sourceSHA256 !== digest(readFileSync(new URL('../native/runtime.cc', import.meta.url)))) throw new Error('Runtime addon source changed; rebuild it');
  const binding = require(filename);
  if (binding.headersVersion !== process.version || String(binding.abiVersion) !== process.versions.modules || typeof binding.checkpoint !== 'function' || typeof binding.createEntry !== 'function') throw new Error('Runtime addon was compiled against different Node headers');
  return binding;
}
export function getRuntimeBinding() { return defaultBinding ??= loadRuntimeBinding(); }
