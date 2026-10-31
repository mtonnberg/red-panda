import {buildHeap} from './build-heap.mjs';
import { buildCollections } from './build-collections.mjs';
import { buildRuntime } from './build-runtime.mjs';

const [collections, runtime, heap] = await Promise.all([buildCollections(), buildRuntime(), buildHeap()]);
process.stdout.write(JSON.stringify({ collections, runtime, heap }) + '\n');
