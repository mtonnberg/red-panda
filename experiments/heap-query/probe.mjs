// Invoked only in an owned subprocess by validation.mjs. Native heap calls
// never execute inside the main test runner's browser/inspector isolate.
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Session } from 'node:inspector';
import { JSDOM } from 'jsdom';
import { loadHeapQueryBinding, queryHeapObjects } from './loader.js';

const [mode, addonPath, directory] = process.argv.slice(2);
const query = (prototype, options = {}) => queryHeapObjects(prototype, { addonPath, ...options });
if (mode === 'loader') {
  const binding = loadHeapQueryBinding(addonPath);
  assert.equal(binding.headersVersion, process.version); assert.equal(String(binding.abiVersion), process.versions.modules);
  assert.equal(loadHeapQueryBinding(addonPath), binding);
  const original = JSON.parse(await readFile(`${addonPath}.json`, 'utf8'));
  const invalid = `${directory}/invalid.node`; await copyFile(addonPath, invalid);
  for (const [key, value] of [['node', 'v0.0.0'], ['abi', '0'], ['v8', 'wrong'], ['platform', 'other'], ['architecture', 'other'], ['sourceSHA256', '0'], ['binarySHA256', '0']]) {
    await writeFile(`${invalid}.json`, JSON.stringify({ ...original, [key]: value }));
    assert.throws(() => loadHeapQueryBinding(invalid), /does not match|source changed/);
  }
  assert.throws(() => loadHeapQueryBinding(`${directory}/missing.node`), /addon missing/);
  await writeFile(`${invalid}.json`, JSON.stringify(original));
  // The digest check runs before dlopen, including for an otherwise valid manifest.
  await writeFile(invalid, 'not native binary');
  assert.throws(() => loadHeapQueryBinding(invalid), /binary digest/);
  console.log(JSON.stringify({ mode, passed: true }));
} else if (mode === 'contracts') {
  const dom = new JSDOM('', { runScripts: 'outside-only' }), w = dom.window;
  try {
    const proto = w.eval(`globalThis.base={};globalThis.direct=Object.create(base);globalThis.middle=Object.create(base);globalThis.indirect=Object.create(middle);globalThis.fake={};Object.defineProperty(fake,'__proto__',{value:base});base`);
    const result = query(proto); assert.equal(Object.getPrototypeOf(result), w.Array.prototype);
    assert.equal(result.length, 3); assert.ok(result.includes(w.direct)); assert.ok(result.includes(w.middle)); assert.ok(result.includes(w.indirect)); assert.ok(!result.includes(w.fake));
    result.find(object => object === w.direct).actualChange = 'real'; assert.equal(w.direct.actualChange, 'real');
    const foreign = vm.createContext({ shared: proto });
    const foreignObject = vm.runInContext('globalThis.child=Object.create(shared);child', foreign);
    assert.ok(query(proto).includes(foreignObject));
    w.eval(`globalThis.traps=0;globalThis.proxy=new Proxy(direct,{getPrototypeOf(){traps++;return base}});globalThis.beyond=Object.create(proxy)`);
    const proxies = query(proto); assert.ok(!proxies.includes(w.proxy)); assert.ok(!proxies.includes(w.beyond)); assert.equal(w.traps, 0);
    assert.deepEqual(Array.from(query(w.proxy)), [w.beyond]); assert.equal(w.traps, 0);
    w.eval(`globalThis.setterCalls=0;Object.defineProperty(Array.prototype,'0',{set(){setterCalls++},configurable:true})`);
    const guarded = query(proto); assert.equal(guarded.length, 4); assert.equal(w.setterCalls, 0);
    delete w.Array.prototype[0];
    assert.throws(() => query(null), TypeError); assert.throws(() => query(1), TypeError);
    assert.throws(() => query(proto, { maxResults: 1 }), /result limit/);
    assert.throws(() => query(proto, { maxNodes: 1 }), /node limit/);
    assert.throws(() => query(proto, { maxEdges: 1 }), /edge limit/);
    for (const maxResults of [0, -1, 1.5, '1', Infinity]) assert.throws(() => query(proto, { maxResults }), RangeError);
    // Limit failures released their snapshots and left no synthetic success.
    assert.equal(query(proto).length, 4);
    console.log(JSON.stringify({ mode, passed: true }));
  } finally { w.close(); }
} else if (mode === 'lifecycle') {
  const times = [];
  for (let index = 0; index < 4; index++) {
    const inspector = new Session(); inspector.connect();
    const dom = new JSDOM('', { runScripts: 'outside-only' }), w = dom.window;
    try {
      await new Promise((resolve, reject) => inspector.post('Runtime.enable', {}, error => error ? reject(error) : resolve()));
      const prototype = w.eval('globalThis.proto={};globalThis.instance=Object.create(proto);proto');
      const before = performance.now(), result = query(prototype); times.push(Math.round(performance.now() - before));
      assert.equal(result.length, 1); assert.equal(result[0], w.instance); assert.ok(result instanceof w.Array);
      await new Promise((resolve, reject) => inspector.post('Runtime.getHeapUsage', {}, error => error ? reject(error) : resolve()));
    } finally { inspector.disconnect(); w.close(); }
    if (globalThis.gc) globalThis.gc(); await new Promise(resolve => setImmediate(resolve));
  }
  console.log(JSON.stringify({ mode, passed: true, node: process.version, iterations: times.length, timings: times }));
} else throw new Error(`Unknown isolated heap-query probe: ${mode}`);
