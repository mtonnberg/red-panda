import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRuntimePath } from '../native/build-runtime.mjs';
import { getRuntimeBinding, loadRuntimeBinding } from '../src/native-runtime.js';

test('native entry identifies the real incumbent across borrowed calls, jobs and timers', async () => {
  const binding = getRuntimeBinding(), a = vm.createContext({}), b = vm.createContext({});
  const globalA = vm.runInContext('globalThis', a), globalB = vm.runInContext('globalThis', b);
  const calls = [];
  const entry = binding.createEntry((source, receiver, args) => { calls.push({ source, receiver, args }); return args[0]; }, globalA);
  a.entry = b.entry = entry;
  assert.equal(vm.runInContext('entry(1)', a), 1);
  assert.equal(vm.runInContext('entry.call(globalThis,2)', b), 2);
  await vm.runInContext('Promise.resolve().then(()=>entry(3))', b);
  await new Promise(resolve => setImmediate(() => { vm.runInContext('entry(4)', a); resolve(); }));
  assert.deepEqual(calls.map(call => call.source), [globalA, globalB, globalB, globalA]);
  assert.equal(calls[1].receiver, globalB);
  assert.equal(Object.getPrototypeOf(entry), vm.runInContext('Function.prototype', a));
  assert.equal(Object.getPrototypeOf(calls[1].args), vm.runInContext('Array.prototype', a));
  assert.throws(() => new entry(), TypeError);
});

test('native entry captures arguments without invoking authored numeric prototype setters', () => {
  const binding = getRuntimeBinding(), context = vm.createContext({});
  const global = vm.runInContext('globalThis', context);
  let args;
  context.entry = binding.createEntry((_source, _receiver, values) => { args = values; return values.length; }, global);
  vm.runInContext("Object.defineProperty(Array.prototype,'0',{configurable:true,set(){throw new Error('authored setter')}})", context);
  try { assert.equal(vm.runInContext('entry(7)', context), 1); assert.equal(Object.getOwnPropertyDescriptor(args, '0').value, 7); }
  finally { vm.runInContext('delete Array.prototype[0]', context); }
});

test('native checkpoints execute real jobs and decline nested/running microtask entry', async () => {
  const binding = getRuntimeBinding(), context = vm.createContext({ checkpoint: binding.checkpoint });
  await new Promise((resolve, reject) => setImmediate(() => {
    try {
      vm.runInContext('globalThis.trace=[];Promise.resolve().then(()=>{trace.push(42);globalThis.nested=checkpoint()})', context);
      const result = binding.checkpoint();
      assert.equal(result.ran, true); assert.equal(vm.runInContext('trace[0]', context), 42);
      assert.equal(vm.runInContext('nested.ran', context), false);
      assert.equal(vm.runInContext('nested.running && nested.reentrant', context), true);
      resolve();
    } catch (error) { reject(error); }
  }));
  const insideJob = await Promise.resolve().then(() => binding.checkpoint());
  assert.equal(insideJob.ran, false); assert.equal(insideJob.running, true);
});

test('runtime loader checks version, binary and source before dlopen', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'red-panda-runtime-addon-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'runtime.node');
  await copyFile(defaultRuntimePath, output);
  const manifest = JSON.parse(await readFile(defaultRuntimePath + '.json', 'utf8'));
  const rejectManifest = async (patch, expected) => {
    await writeFile(output + '.json', JSON.stringify({ ...manifest, ...patch }));
    assert.throws(() => loadRuntimeBinding(output), expected);
  };
  await rejectManifest({ node: 'v0.0.0' }, /does not match the running Node/);
  await rejectManifest({ binarySHA256: 'invalid' }, /binary digest/);
  await rejectManifest({ sourceSHA256: 'invalid' }, /source changed/);
});
