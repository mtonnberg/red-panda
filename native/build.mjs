import { buildCollections } from './build-collections.mjs';
import { buildRuntime } from './build-runtime.mjs';

const [collections, runtime] = await Promise.all([buildCollections(), buildRuntime()]);
process.stdout.write(JSON.stringify({ collections, runtime }) + '\n');
