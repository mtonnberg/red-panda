import { createHash } from 'node:crypto';
import { access, mkdir, readFile, realpath, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const source = fileURLToPath(new URL('./collections.cc', import.meta.url));
export const defaultCollectionPath = fileURLToPath(new URL(`./build/${process.platform}-${process.arch}/node-${process.versions.node}/collections.node`, import.meta.url));

export async function buildCollections({ headers = process.env.RED_PANDA_NODE_HEADERS, output = defaultCollectionPath } = {}) {
  if (process.platform !== 'linux') throw new Error('The independent collection addon currently has a Linux build recipe');
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
  await access(path.join(include, 'v8.h'));
  output = path.resolve(output); await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.CXX ?? 'g++', ['-std=c++20', '-O2', '-fno-strict-aliasing', '-fPIC', '-shared', '-Wall', '-Wextra',
      '-Wno-unused-parameter', '-DNODE_GYP_MODULE_NAME=red_panda_collections', `-I${include}`, source, '-o', temporary], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { if (stderr.length < 20000) stderr += data; });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Collection addon compiler exited ${code}: ${stderr}`)));
  });
  const manifest = { node: process.version, abi: process.versions.modules, v8: process.versions.v8,
    platform: process.platform, architecture: process.arch, headers: include,
    sourceSHA256: createHash('sha256').update(await readFile(source)).digest('hex'),
    binarySHA256: createHash('sha256').update(await readFile(temporary)).digest('hex') };
  await rename(temporary, output);
  await writeFile(`${output}.json`, JSON.stringify(manifest, null, 2) + '\n');
  return { output, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  const option = name => { const index = arguments_.indexOf(name); return index < 0 ? undefined : arguments_[index + 1]; };
  const result = await buildCollections({ headers: option('--headers'), output: option('--output') });
  process.stdout.write(JSON.stringify(result) + '\n');
}
