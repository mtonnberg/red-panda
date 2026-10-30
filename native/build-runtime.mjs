import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCollections } from './build-collections.mjs';

export const defaultRuntimePath = fileURLToPath(new URL(`./build/${process.platform}-${process.arch}/node-${process.versions.node}/runtime.node`, import.meta.url));
export function buildRuntime({ headers = process.env.RED_PANDA_NODE_HEADERS, output = defaultRuntimePath } = {}) {
  return buildCollections({ headers, output, sourcePath: fileURLToPath(new URL('./runtime.cc', import.meta.url)),
    moduleName: 'red_panda_runtime', label: 'Runtime' });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  process.stdout.write(JSON.stringify(await buildRuntime({ headers: option('--headers'), output: option('--output') })) + '\n');
}
