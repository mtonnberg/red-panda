import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Browser } from '../src/browser.js';
import { supportsRuntime, runRuntime, resetRuntime } from '../src/runtime.js';

function sessionFor(page) {
  return {
    page, worlds: new Map(), objects: new Map(),
    remote(value, byValue = false, group) {
      if (value === undefined) return { type: 'undefined' };
      if (value === null) return { type: 'object', subtype: 'null', value: null };
      const type = typeof value;
      if (['string', 'number', 'boolean'].includes(type)) return { type, value };
      if (byValue) return { type, value: JSON.parse(JSON.stringify(value)) };
      const objectId = randomUUID(); this.objects.set(objectId, { value, group });
      return { type, objectId, ...(Array.isArray(value) ? { subtype: 'array' } : {}) };
    },
    object(id) { if (!this.objects.has(id)) throw Object.assign(new Error('Unknown object'), { code: -32602 }); return this.objects.get(id).value; },
    exception(error) { return { exceptionId: 1, text: error.message ?? String(error), lineNumber: 0, columnNumber: 0,
      exception: { type: 'object', subtype: 'error', description: error.stack ?? String(error) } }; },
  };
}

async function fixture(action, options) {
  const browser = new Browser(options); const page = browser.createPage();
  const session = sessionFor(page);
  try { await action({ browser, page, session }); }
  finally { resetRuntime(session); browser.close(); }
}

test('compiled scripts validate without execution, persist once, and affect only the page realm', async () => fixture(async ({ page, session }) => {
  const compiled = await runRuntime(session, 'Runtime.compileScript', { expression: 'globalThis.compiledValue=21;compiledValue*2', sourceURL: 'compiled-runtime.js', persistScript: true });
  assert.ok(compiled.scriptId); assert.equal(page.evaluate('typeof compiledValue'), 'undefined');
  const result = await runRuntime(session, 'Runtime.runScript', { scriptId: compiled.scriptId, returnByValue: true });
  assert.deepEqual(result.result, { type: 'number', value: 42 });
  assert.equal(page.evaluate('compiledValue'), 21);
  await assert.rejects(runRuntime(session, 'Runtime.runScript', { scriptId: compiled.scriptId }), /No script with given id/);
  const transient = await runRuntime(session, 'Runtime.compileScript', { expression: 'globalThis.mustNotExecute=true', sourceURL: '', persistScript: false });
  assert.deepEqual(transient, {}); assert.equal(page.evaluate('typeof mustNotExecute'), 'undefined');
  const invalid = await runRuntime(session, 'Runtime.compileScript', { expression: 'const = ;', sourceURL: 'invalid-script.js', persistScript: true });
  assert.ok(invalid.exceptionDetails); assert.match(invalid.exceptionDetails.text, /Unexpected token/);
}));

test('running persisted scripts can await promises and reports execution exceptions with source URLs', async () => fixture(async ({ session }) => {
  const compiled = await runRuntime(session, 'Runtime.compileScript', { expression: 'Promise.resolve({answer:42})', sourceURL: 'async-script.js', persistScript: true });
  const result = await runRuntime(session, 'Runtime.runScript', { scriptId: compiled.scriptId, awaitPromise: true, returnByValue: true });
  assert.deepEqual(result.result.value, { answer: 42 });
  const throwing = await runRuntime(session, 'Runtime.compileScript', { expression: 'throw new Error("expected script exception")', sourceURL: 'throwing-script.js', persistScript: true });
  const failed = await runRuntime(session, 'Runtime.runScript', { scriptId: throwing.scriptId });
  assert.equal(failed.result.type, 'undefined'); assert.match(failed.exceptionDetails.text, /expected script exception/);
  assert.match(failed.exceptionDetails.exception.description, /throwing-script.js/);
}));

test('awaitPromise resolves and rejects real promises, preserving caller object groups', async () => fixture(async ({ page, session }) => {
  const promise = session.remote(page.evaluate('Promise.resolve({answer:42})'), false, 'promises');
  const result = await runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: promise.objectId });
  assert.equal(session.object(result.result.objectId).answer, 42);
  assert.equal(session.objects.get(result.result.objectId).group, 'promises');
  const rejected = session.remote(page.evaluate('Promise.reject(17)'));
  const failure = await runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: rejected.objectId, returnByValue: true });
  assert.deepEqual(failure.result, { type: 'number', value: 17 }); assert.match(failure.exceptionDetails.text, /17/);
  const ordinary = session.remote({ then() {} });
  await assert.rejects(runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: ordinary.objectId }), /not a Promise/);
}));

test('awaitPromise timeouts and context resets do not create handles for disposed realms', async () => fixture(async ({ page, session }) => {
  const never = session.remote(page.evaluate('new Promise(()=>{})'));
  const timeout = await runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: never.objectId });
  assert.match(timeout.exceptionDetails.text, /timed out/);
  let resolve;
  const pending = session.remote(new page.dom.window.Promise(done => { resolve = done; }));
  const waiting = runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: pending.objectId });
  const count = session.objects.size;
  resetRuntime(session); resolve({ stale: true });
  await assert.rejects(waiting, /context was destroyed/);
  assert.equal(session.objects.size, count);
}, { timeout: 100 }));

test('global lexical names come from the selected VM and exclude other page and host scopes', async () => fixture(async ({ browser, page, session }) => {
  const other = browser.createPage();
  page.evaluate('let selectedLexical=1; const selectedConstant=2; class SelectedClass {}; globalThis.propertyOnly=3');
  other.evaluate('let unrelatedOtherPage=1');
  const result = await runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: page.executionContextId });
  assert.ok(result.names.includes('selectedLexical')); assert.ok(result.names.includes('selectedConstant')); assert.ok(result.names.includes('SelectedClass'));
  assert.ok(!result.names.includes('unrelatedOtherPage')); assert.ok(!result.names.includes('propertyOnly'));
  assert.ok(!result.names.includes('session')); assert.ok(!result.names.includes('browser'));
  assert.equal(Object.getOwnPropertyNames(page.dom.window).some(key => key.startsWith('__redpanda_inspector_')), false);
}));

test('heap statistics and isolate identity use real V8 measurements', async () => fixture(async ({ session }) => {
  const heap = await runRuntime(session, 'Runtime.getHeapUsage');
  for (const key of ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize']) assert.equal(typeof heap[key], 'number');
  assert.ok(heap.usedSize > 0); assert.ok(heap.totalSize >= heap.usedSize);
  const first = await runRuntime(session, 'Runtime.getIsolateId');
  resetRuntime(session);
  const second = await runRuntime(session, 'Runtime.getIsolateId');
  assert.equal(typeof first.id, 'string'); assert.ok(first.id.length > 0); assert.equal(first.id, second.id);
}));

test('exception details and stack-depth configuration have observable effects and reset cleanly', async () => fixture(async ({ page, session }) => {
  const error = session.remote(page.evaluate('new Error("inspect me")'));
  assert.match((await runRuntime(session, 'Runtime.getExceptionDetails', { errorObjectId: error.objectId })).exceptionDetails.text, /inspect me/);
  const object = session.remote(page.evaluate('({ordinary:true})'));
  assert.deepEqual(await runRuntime(session, 'Runtime.getExceptionDetails', { errorObjectId: object.objectId }), {});
  const original = page.evaluate('Error.stackTraceLimit');
  await runRuntime(session, 'Runtime.setMaxCallStackSizeToCapture', { size: 0 });
  assert.equal(page.evaluate('new Error("no frames").stack.split("\\n").length'), 1);
  resetRuntime(session); assert.equal(page.evaluate('Error.stackTraceLimit'), original);
}));

test('compiled scripts and native inspector state are invalidated across navigation', async () => fixture(async ({ page, session }) => {
  const compiled = await runRuntime(session, 'Runtime.compileScript', { expression: '42', sourceURL: 'old-context.js', persistScript: true });
  page.evaluate('let previousDocumentLexical=1');
  assert.ok((await runRuntime(session, 'Runtime.globalLexicalScopeNames')).names.includes('previousDocumentLexical'));
  await page.navigate('data:text/html,<title>New realm</title>');
  await assert.rejects(runRuntime(session, 'Runtime.runScript', { scriptId: compiled.scriptId }), /No script with given id/);
  assert.ok(!(await runRuntime(session, 'Runtime.globalLexicalScopeNames')).names.includes('previousDocumentLexical'));
}));

test('unsupported execution interruption/formatting and invalid parameters return explicit errors', async () => fixture(async ({ page, session }) => {
  assert.equal(supportsRuntime('Runtime.compileScript'), true); assert.equal(supportsRuntime('Runtime.evaluate'), false);
  for (const method of ['Runtime.terminateExecution', 'Runtime.queryObjects', 'Runtime.setCustomObjectFormatterEnabled', 'Runtime.discardConsoleEntries']) {
    await assert.rejects(runRuntime(session, method), error => error.code === -32601);
  }
  await assert.rejects(runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: page.executionContextId + 1000 }), /Cannot find context/);
  await assert.rejects(runRuntime(session, 'Runtime.compileScript', { expression: '1', sourceURL: '', persistScript: 'yes' }), /must be boolean/);
  await assert.rejects(runRuntime(session, 'Runtime.setMaxCallStackSizeToCapture', { size: -1 }), /non-negative/);
}));
