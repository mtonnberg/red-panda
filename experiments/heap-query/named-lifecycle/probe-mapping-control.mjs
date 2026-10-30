// Prepared diagnostic only. Do not run until the parent releases the pause.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { Browser, until } from './base/src/browser.js';
import { runRuntime, resetRuntime, diagnosticNamedSelection } from './base/src/runtime.js';
import { nameForVMContext } from './base/src/context-names.js';

const [mode = 'mapping', addonPath, cycleArgument = '4'] = process.argv.slice(2);
if (!['mapping', 'snapshot', 'direct'].includes(mode)) throw new Error('Unknown named-context diagnostic mode');
const cycles = Number(cycleArgument), require = createRequire(import.meta.url);
const heap = mode === 'mapping' ? undefined : require(addonPath);
const observations = [], oldHandles = [], times = [];
let stage = { mode };
const log = message => console.error(JSON.stringify({ ...stage, stage: message, elapsed: Math.round(performance.now()) }));
function sessionFor(page) {
  return { page, worlds: new Map(), objects: new Map(),
    remote(value) { return { value }; }, exception(error) { return { text: String(error) }; },
    executionPage(id = page.executionContextId) {
      const selected = page.frames.findContext(id)?.page;
      if (!selected || selected.closed) throw Object.assign(new Error('Cannot find context with specified id'), { code: -32602 });
      return selected;
    } };
}
function prepare(page, label) {
  const marker = `__named_${label}`, context = page.dom.getInternalVMContext();
  const name = nameForVMContext(context); assert.equal(typeof name, 'string');
  new vm.Script(`let ${marker}=1;globalThis.ownedPrototype={};globalThis.ownedDirect=Object.create(ownedPrototype);globalThis.ownedMiddle=Object.create(ownedPrototype);globalThis.ownedIndirect=Object.create(ownedMiddle);`).runInContext(context);
  return { page, label, marker, context, name, prototype: page.evaluate('ownedPrototype'), direct: page.evaluate('ownedDirect'), middle: page.evaluate('ownedMiddle'), indirect: page.evaluate('ownedIndirect') };
}
async function select(session, realm, allMarkers) {
  stage.realm = realm.label; log('beforeNamedSelection');
  const result = await runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: realm.page.executionContextId });
  assert.ok(result.names.includes(realm.marker));
  for (const marker of allMarkers) if (marker !== realm.marker) assert.ok(!result.names.includes(marker));
  const identity = diagnosticNamedSelection(session, realm.page.executionContextId);
  assert.equal(identity.inspectorContextName, realm.name);
  assert.equal(identity.knownNonDefaultContext, true);
  assert.ok(Number.isInteger(identity.inspectorContextId));
  observations.push({ label: realm.label, contextName: realm.name, selectedMarker: realm.marker, ...identity });
  log('afterNamedSelection');
}
function query(realm, expected = [realm.direct, realm.middle, realm.indirect]) {
  if (!heap) return;
  stage.realm = realm.label; log('beforeHeapQuery');
  const start = performance.now(), result = heap.queryObjects(realm.prototype); times.push(Math.round(performance.now() - start));
  assert.equal(Object.getPrototypeOf(result), realm.page.dom.window.Array.prototype);
  assert.equal(result.length, expected.length);
  for (const value of expected) assert.ok(result.includes(value));
  result.find(value => value === realm.direct).actualMutation = realm.label;
  assert.equal(realm.direct.actualMutation, realm.label);
  oldHandles.push(result); log('afterHeapQuery');
}
async function frame(parent, label) {
  const element = parent.dom.window.document.createElement('iframe');
  element.srcdoc = `<title>${label}</title>`; parent.dom.window.document.body.append(element);
  await until(() => parent.frames.findElement(element)?.dom.window.document.title === label, { timeout: 3000 });
  return { element, page: parent.frames.findElement(element) };
}
for (let cycle = 0; cycle < cycles; cycle++) {
  stage = { mode, cycle }; log('beforeBrowser');
  const browser = new Browser({ loadResources: ['iframe'] }), sessions = [];
  try {
    const first = browser.createPage(), second = browser.createPage();
    // Navigate in reversed page creation order. Later frame creation means the
    // correct selected root is not generally the latest inspector context.
    await second.navigate('data:text/html,<title>second</title>');
    await first.navigate('data:text/html,<title>first</title>');
    const one = await frame(first, 'frame-one'), two = await frame(first, 'frame-two');
    const firstSession = sessionFor(first), secondSession = sessionFor(second); sessions.push(firstSession, secondSession);
    const cleanup = ({ executionContextId }) => resetRuntime(firstSession, executionContextId);
    first.on('frameContextDestroyed', cleanup);
    const realms = [prepare(second, `second_${cycle}`), prepare(first, `first_${cycle}`), prepare(one.page, `frame_one_${cycle}`), prepare(two.page, `frame_two_${cycle}`)];
    assert.equal(new Set(realms.map(realm => realm.name)).size, realms.length);
    const allMarkers = realms.map(realm => realm.marker);
    // Deliberately neither creation order nor reverse-ID order.
    for (const index of [0, 3, 1, 2]) {
      const realm = realms[index], session = index === 0 ? secondSession : firstSession;
      await select(session, realm, allMarkers); query(realm);
    }
    // A foreign-realm object may genuinely inherit from the queried prototype.
    // Preserve identity and the result array's prototype-creation realm.
    if (heap) {
      const foreign = second.dom.window.Object.create(realms[1].prototype);
      oldHandles.push(foreign); query(realms[1], [realms[1].direct, realms[1].middle, realms[1].indirect, foreign]);
      const w = first.dom.window;
      w.eval('globalThis.proxyHits=0;globalThis.queryProxy=new Proxy(ownedDirect,{getPrototypeOf(){proxyHits++;return ownedPrototype}});globalThis.queryBeyond=Object.create(queryProxy)');
      const base = heap.queryObjects(realms[1].prototype); assert.ok(!base.includes(w.queryProxy)); assert.ok(!base.includes(w.queryBeyond));
      const proxy = heap.queryObjects(w.queryProxy); assert.deepEqual(Array.from(proxy), [w.queryBeyond]); assert.equal(w.proxyHits, 0);
    }
    // Replacing the earlier frame creates a newer context after the other live
    // frame. Existing names must still select that other frame correctly.
    oldHandles.push(...realms.flatMap(realm => [realm.context, realm.prototype, realm.direct]));
    one.element.srcdoc = '<title>frame-one-replaced</title>';
    await until(() => { const replacement = first.frames.findElement(one.element); return replacement && !replacement.closed && replacement.executionContextId !== one.page.executionContextId && replacement.dom.window.document.title === 'frame-one-replaced'; }, { timeout: 3000 });
    const replaced = prepare(first.frames.findElement(one.element), `frame_replaced_${cycle}`);
    assert.notEqual(replaced.name, realms[2].name);
    await select(firstSession, realms[3], [...allMarkers, replaced.marker]); query(realms[3]);
    await select(firstSession, replaced, [...allMarkers, replaced.marker]); query(replaced);
    const staleId = realms[2].page.executionContextId;
    await assert.rejects(runRuntime(firstSession, 'Runtime.globalLexicalScopeNames', { executionContextId: staleId }), /Cannot find context/);
    // Navigate a root while keeping earlier handles alive, reproducing the
    // older-closed-context precondition without executing any marker there.
    resetRuntime(secondSession);
    await second.navigate('data:text/html,<title>second-replaced</title>');
    const next = prepare(second, `second_replaced_${cycle}`);
    await select(secondSession, next, [...allMarkers, next.marker]); query(next);
    first.off('frameContextDestroyed', cleanup);
    log('beforeCleanup');
  } finally { for (const session of sessions) resetRuntime(session); browser.close(); log('afterCleanup'); }
  if (globalThis.gc) globalThis.gc(); await new Promise(resolve => setImmediate(resolve)); log('cycleComplete');
}
const loadedHeapAddons = Object.keys(require.cache).filter(path => /\/(?:heap-query[^/]*|direct[^/]*)\.node$/.test(path));
if (mode === 'mapping') { assert.equal(times.length, 0); assert.equal(loadedHeapAddons.length, 0); }
console.log(JSON.stringify({ mode, cycles, passed: true, observations, heapQueryTimings: times, loadedHeapAddons, retainedHandles: oldHandles.length, node: process.version, memory: process.memoryUsage() }));
