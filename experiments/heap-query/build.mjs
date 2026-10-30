import { createHash } from 'node:crypto';
import { access, mkdir, readFile, realpath, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const source = fileURLToPath(new URL('./heap-query.cc', import.meta.url));
export const defaultHeapQueryPath = fileURLToPath(new URL(`../../.cache/heap-query-experiment/${process.platform}-${process.arch}/node-${process.versions.node}/heap-query.node`, import.meta.url));

/** Explicit separate build; importing does not compile or load native code. */
export async function buildHeapQuery({ headers = process.env.RED_PANDA_NODE_HEADERS, output = defaultHeapQueryPath } = {}) {
  if (process.platform !== 'linux') throw new Error('The independent heap-query addon currently has a Linux build recipe');
  const executable = await realpath(process.execPath);
  const candidates = [headers, path.resolve(path.dirname(executable), '../include/node'),
    path.resolve(path.dirname(executable), `../node_modules/node-${process.platform}-${process.arch}/include/node`),
    `/workspace/shared/node-headers/${process.version}/node-${process.version}/include/node`, '/usr/include/node'].filter(Boolean);
  let include;
  for (const candidate of candidates) {
    try {
      const version = await readFile(path.join(candidate, 'node_version.h'), 'utf8');
      const part = name => version.match(new RegExp(`^#define NODE_${name}_VERSION (\\d+)$`, 'm'))?.[1];
      if (`${part('MAJOR')}.${part('MINOR')}.${part('PATCH')}` === process.versions.node) { include = candidate; break; }
      if (headers === candidate) throw new Error(`Node headers do not match runtime ${process.version}`);
    } catch (error) { if (headers === candidate) throw error; }
  }
  if (!include) throw new Error(`Matching headers for Node ${process.version} are required; set RED_PANDA_NODE_HEADERS`);
  await access(path.join(include, 'v8-profiler.h'));
  output = path.resolve(output); await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`, temporaryManifest = `${temporary}.json`;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.CXX ?? 'g++', ['-std=c++20', '-O2', '-fno-strict-aliasing', '-fPIC', '-shared', '-Wall', '-Wextra',
        '-Wno-unused-parameter', '-Wno-cast-function-type', '-DNODE_GYP_MODULE_NAME=red_panda_heap_query', `-I${include}`, source, '-o', temporary],
      { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', data => { if (stderr.length < 20000) stderr += data; });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Heap-query addon compiler exited ${code}: ${stderr}`)));
    });
    const manifest = { kind: 'red-panda-heap-query', schema: 1,
      node: process.version, abi: process.versions.modules, v8: process.versions.v8,
      platform: process.platform, architecture: process.arch, headers: include,
      sourceSHA256: createHash('sha256').update(await readFile(source)).digest('hex'),
      binarySHA256: createHash('sha256').update(await readFile(temporary)).digest('hex') };
    await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n');
    await rename(temporary, output); await rename(temporaryManifest, `${output}.json`);
    return { output, manifest };
  } finally {
    await Promise.all([rm(temporary, { force: true }), rm(temporaryManifest, { force: true })]);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2), options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = { '--headers': 'headers', '--output': 'output' }[arguments_[index]];
    if (!key || !arguments_[index + 1]) throw new Error('Usage: experiments/heap-query/build.mjs [--headers PATH] [--output PATH]');
    options[key] = arguments_[index + 1];
  }
  process.stdout.write(JSON.stringify(await buildHeapQuery(options)) + '\n');
}
