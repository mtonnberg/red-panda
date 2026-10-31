import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Browser } from '../src/browser.js';
import { supportsRuntime, runRuntime, resetRuntime } from '../src/runtime.js';

function sessionFor(page) {
  return {
    page, worlds: new Map(), objects: new Map(),
    remote(value, byValue = false, group, contextId = page.executionContextId) {
      if (value === undefined) return { type: 'undefined' };
      if (value === null) return { type: 'object', subtype: 'null', value: null };
      const type = typeof value;
      if (['string', 'number', 'boolean'].includes(type)) return { type, value };
      if (byValue) return { type, value: JSON.parse(JSON.stringify(value)) };
      const objectId = randomUUID(); this.objects.set(objectId, { value, group, contextId });
      return { type, objectId, ...(Array.isArray(value) ? { subtype: 'array' } : {}) };
    },
    object(id) {
      if (!this.objects.has(id)) throw Object.assign(new Error('Unknown object'), { code: -32602 });
      const entry = this.objects.get(id); this.executionPage?.(entry.contextId); return entry.value;
    },
    exception(error, contextId = page.executionContextId) { return { exceptionId: 1, text: error.message ?? String(error), lineNumber: 0, columnNumber: 0,
      exception: { ...this.remote(error, false, undefined, contextId), subtype: 'error', description: error.stack ?? String(error) } }; },
  };
}

async function fixture(action, options) {
  const browser = new Browser(options); const page = browser.createPage();
  const session = sessionFor(page);
  try { await action({ browser, page, session }); }
  finally { resetRuntime(session); browser.close(); }
}

async function frameFixture(action) {
  return fixture(async ({ browser, page, session }) => {
    const frames = ['First frame', 'Second frame'].map(title => {
      const element = page.dom.window.document.createElement('iframe');
      element.srcdoc = `<!doctype html><title>${title}</title>`; page.dom.window.document.body.append(element);
      return { element, page: page.frames.findElement(element) };
    });
    assert.ok(frames.every(frame => frame.page));
    session.executionPage = (id = page.executionContextId) => {
      const selected = page.frames.findContext(id)?.page;
      if (!selected || selected.closed) throw Object.assign(new Error('Cannot find context with specified id'), { code: -32602 });
      return selected;
    };
    const cleanup = ({ executionContextId }) => resetRuntime(session, executionContextId);
    page.on('frameContextDestroyed', cleanup);
    try { await action({ browser, page, session, first: frames[0].page, second: frames[1].page,
      firstElement: frames[0].element, secondElement: frames[1].element }); }
    finally { page.off('frameContextDestroyed', cleanup); }
  }, { loadResources: ['iframe'] });
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
  assert.equal(result.names.some(name=>name.startsWith('__redpanda_invocation_')),false);
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
  for (const method of ['Runtime.terminateExecution', 'Runtime.setCustomObjectFormatterEnabled', 'Runtime.discardConsoleEntries']) {
    await assert.rejects(runRuntime(session, method), error => error.code === -32601);
  }
  await assert.rejects(runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: page.executionContextId + 1000 }), /Cannot find context/);
  await assert.rejects(runRuntime(session, 'Runtime.compileScript', { expression: '1', sourceURL: '', persistScript: 'yes' }), /must be boolean/);
  await assert.rejects(runRuntime(session, 'Runtime.setMaxCallStackSizeToCapture', { size: -1 }), /non-negative/);
}));

test('persistent scripts remain bound to actual frame realms without overwriting sibling scripts', async () => frameFixture(async ({ page, session, first, second }) => {
  const compile = (target, expression) => runRuntime(session, 'Runtime.compileScript', {
    expression, sourceURL: `frame-${target.executionContextId}.js`, persistScript: true, executionContextId: target.executionContextId,
  });
  const root = await compile(page, 'globalThis.rootRuntimeValue=7;rootRuntimeValue');
  const child = await compile(first, 'globalThis.childRuntimeValue=42;({title:document.title})');
  const sibling = await compile(second, 'globalThis.childRuntimeValue=73;childRuntimeValue');
  await assert.rejects(runRuntime(session, 'Runtime.runScript', { scriptId: child.scriptId, executionContextId: second.executionContextId }), /different execution context/);
  const result = await runRuntime(session, 'Runtime.runScript', { scriptId: child.scriptId, objectGroup: 'frame results' });
  assert.equal(session.object(result.result.objectId).title, 'First frame');
  assert.ok(session.object(result.result.objectId) instanceof first.dom.window.Object);
  assert.equal(session.objects.get(result.result.objectId).contextId, first.executionContextId);
  assert.equal(session.objects.get(result.result.objectId).group, 'frame results');
  assert.equal(page.evaluate('typeof childRuntimeValue'), 'undefined'); assert.equal(second.evaluate('typeof childRuntimeValue'), 'undefined');
  assert.equal((await runRuntime(session, 'Runtime.runScript', { scriptId: sibling.scriptId, returnByValue: true })).result.value, 73);
  assert.equal((await runRuntime(session, 'Runtime.runScript', { scriptId: root.scriptId, returnByValue: true })).result.value, 7);
  const invalid = await runRuntime(session, 'Runtime.compileScript', {
    expression: 'let = ;', sourceURL: 'frame-syntax.js', persistScript: true, contextId: first.executionContextId,
  });
  assert.equal(invalid.exceptionDetails.executionContextId, first.executionContextId);
  assert.equal(session.objects.get(invalid.exceptionDetails.exception.objectId).contextId, first.executionContextId);
}));

test('promise and exception handles infer their actual owning frame and preserve result/error contexts', async () => frameFixture(async ({ session, first, second }) => {
  const promise = session.remote(first.evaluate('Promise.resolve({title:document.title})'), false, 'frame promises', first.executionContextId);
  const reply = await runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: promise.objectId });
  assert.equal(session.object(reply.result.objectId).title, 'First frame'); assert.ok(session.object(reply.result.objectId) instanceof first.dom.window.Object);
  assert.equal(session.objects.get(reply.result.objectId).contextId, first.executionContextId); assert.equal(session.objects.get(reply.result.objectId).group, 'frame promises');
  await assert.rejects(runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: promise.objectId, contextId: second.executionContextId }), /different execution context/);
  const failure = session.remote(first.evaluate('Promise.reject(new Error("frame rejection"))'), false, 'frame errors', first.executionContextId);
  const rejected = await runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: failure.objectId });
  assert.equal(rejected.exceptionDetails.executionContextId, first.executionContextId);
  assert.equal(session.objects.get(rejected.result.objectId).contextId, first.executionContextId);
  assert.equal(session.objects.get(rejected.exceptionDetails.exception.objectId).contextId, first.executionContextId);
  const details = await runRuntime(session, 'Runtime.getExceptionDetails', { errorObjectId: rejected.result.objectId });
  assert.equal(details.exceptionDetails.executionContextId, first.executionContextId); assert.match(details.exceptionDetails.text, /frame rejection/);
}));

test('frame retirement retains real Runtime work until owning-page destruction and leaves siblings intact', async () => frameFixture(async ({ page, session, first, second, firstElement }) => {
  const compile = (target, expression) => runRuntime(session, 'Runtime.compileScript', {
    expression, sourceURL: 'pending-frame.js', persistScript: true, executionContextId: target.executionContextId,
  });
  const parent = await compile(page, '42'), sibling = await compile(second, '73');
  const pendingScript = await compile(first, 'new Promise(()=>{})');
  const pendingPromise = session.remote(first.evaluate('new Promise(()=>{})'), false, 'pending', first.executionContextId);
  const waitingScript = assert.rejects(runRuntime(session, 'Runtime.runScript', { scriptId: pendingScript.scriptId, awaitPromise: true }), /context was destroyed/);
  const waitingPromise = assert.rejects(runRuntime(session, 'Runtime.awaitPromise', { promiseObjectId: pendingPromise.objectId }), /context was destroyed/);
  const before = session.objects.size;
  firstElement.remove();assert.equal(first.retired,true);assert.equal(first.documentAbort.signal.aborted,false);
  assert.equal(session.object(pendingPromise.objectId) instanceof first.dom.window.Promise,true);
  assert.equal(first.evaluate("document.defaultView"),null);
  const settled=await Promise.race([Promise.all([waitingScript,waitingPromise]).then(()=>true),new Promise(resolve=>setImmediate(()=>resolve(false)))]);assert.equal(settled,false);
  assert.equal((await runRuntime(session, 'Runtime.runScript', { scriptId: parent.scriptId, returnByValue: true })).result.value, 42);
  assert.equal((await runRuntime(session, 'Runtime.runScript', { scriptId: sibling.scriptId, returnByValue: true })).result.value, 73);
  page.documentAbort.abort();await Promise.all([waitingScript,waitingPromise]);assert.equal(session.objects.size,before);assert.throws(()=>session.object(pendingPromise.objectId),/Cannot find context/);
}));

test('native inspector names and stack-depth settings are scoped to actual iframe VM contexts', async () => frameFixture(async ({ page, session, first, second }) => {
  page.evaluate('let mainLexicalOnly=1'); first.evaluate('let selectedFrameLexical=2'); second.evaluate('let siblingLexicalOnly=3');
  const root = await runRuntime(session, 'Runtime.globalLexicalScopeNames'); assert.ok(root.names.includes('mainLexicalOnly'));
  const child = await runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: first.executionContextId });
  assert.ok(child.names.includes('selectedFrameLexical')); assert.equal(child.names.includes('mainLexicalOnly'), false); assert.equal(child.names.includes('siblingLexicalOnly'), false);
  assert.equal(Object.getOwnPropertyNames(first.dom.window).some(key => key.startsWith('__redpanda_inspector_')), false);
  const original = first.evaluate('Error.stackTraceLimit'), parentLimit = page.evaluate('Error.stackTraceLimit');
  await runRuntime(session, 'Runtime.setMaxCallStackSizeToCapture', { size: 0, contextId: first.executionContextId });
  await runRuntime(session, 'Runtime.setMaxCallStackSizeToCapture', { size: 3, contextId: second.executionContextId });
  assert.equal(first.evaluate('new Error("no frames").stack.split("\\n").length'), 1); assert.equal(page.evaluate('Error.stackTraceLimit'), parentLimit);
  resetRuntime(session, first.executionContextId); assert.equal(first.evaluate('Error.stackTraceLimit'), original); assert.equal(second.evaluate('Error.stackTraceLimit'), 3);
  assert.ok((await runRuntime(session, 'Runtime.globalLexicalScopeNames')).names.includes('mainLexicalOnly'));
  assert.ok((await runRuntime(session, 'Runtime.globalLexicalScopeNames', { contextId: first.executionContextId })).names.includes('selectedFrameLexical'));
}));

test('child navigation invalidates only its scripts/inspector and rejects obsolete context selectors', async () => frameFixture(async ({ page, session, first, firstElement }) => {
  const oldId = first.executionContextId;
  const child = await runRuntime(session, 'Runtime.compileScript', { expression: '42', sourceURL: 'old-frame.js', persistScript: true, executionContextId: oldId });
  const parent = await runRuntime(session, 'Runtime.compileScript', { expression: '73', sourceURL: 'parent.js', persistScript: true });
  first.evaluate('let previousFrameLexical=1');
  assert.ok((await runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: oldId })).names.includes('previousFrameLexical'));
  await first.navigate('data:text/html,<title>Replacement</title>');
  const replacement = page.frames.findElement(firstElement); assert.notEqual(replacement.executionContextId, oldId);
  await assert.rejects(runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: oldId }), /Cannot find context/);
  await assert.rejects(runRuntime(session, 'Runtime.runScript', { scriptId: child.scriptId }), /No script with given id/);
  assert.equal((await runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: replacement.executionContextId })).names.includes('previousFrameLexical'), false);
  assert.equal((await runRuntime(session, 'Runtime.runScript', { scriptId: parent.scriptId, returnByValue: true })).result.value, 73);
}));
