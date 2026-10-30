import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Session as InspectorSession } from 'node:inspector';
import { Browser, until } from '../src/browser.js';
import { nameForVMContext, isOwnedVMContextName } from '../src/context-names.js';
import { runRuntime, resetRuntime } from '../src/runtime.js';

const post = (inspector, method, params = {}) => new Promise((resolve, reject) => inspector.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
function sessionFor(page) {
  return { page, objects: new Map(), worlds: new Map(), remote(value) { return { value }; }, exception(error) { return { text: String(error) }; },
    executionPage(id = page.executionContextId) {
      const selected = page.frames.findContext(id)?.page;
      if (!selected || selected.closed) throw Object.assign(new Error('Cannot find context with specified id'), { code: -32602 });
      return selected;
    } };
}
async function frame(page, title) {
  const element = page.dom.window.document.createElement('iframe');
  element.srcdoc = `<title>${title}</title>`; page.dom.window.document.body.append(element);
  await until(() => page.frames.findElement(element)?.dom.window.document.title === title, { timeout: 2500 });
  return { element, page: page.frames.findElement(element) };
}
function declare(page, marker) { new vm.Script(`let ${marker}=1`).runInContext(page.dom.getInternalVMContext()); }

test('VM names preserve actual context identity and native code-generation options', () => {
  let receiver;
  const options = Object.freeze({ name: 'external-name', get codeGeneration() { receiver = this; return { strings: false, wasm: false }; } });
  const context = vm.createContext({}, options), name = nameForVMContext(context);
  assert.equal(receiver, options); assert.equal(typeof name, 'string'); assert.equal(isOwnedVMContextName(name), true);
  assert.throws(() => vm.runInContext('eval("1")', context), /code generation from strings disallowed/i);
  assert.equal(vm.createContext(context, { name: 'attempted-rename' }), context);
  assert.equal(nameForVMContext(context), name);
  assert.throws(() => vm.createContext({}, null), TypeError);
});

test('actual page/frame context names match unique non-default inspector notifications', async () => {
  const inspector = new InspectorSession(), observed = new Map();
  inspector.on('Runtime.executionContextCreated', ({ params }) => observed.set(params.context.name, params.context));
  inspector.connect(); const browser = new Browser({ loadResources: ['iframe'] });
  try {
    await post(inspector, 'Runtime.enable');
    const first = browser.createPage(), second = browser.createPage();
    await second.navigate('data:text/html,<title>second</title>'); await first.navigate('data:text/html,<title>first</title>');
    const one = await frame(first, 'one'), two = await frame(first, 'two');
    const names = [first, second, one.page, two.page].map(page => {
      page.dom.window.name = 'ordinary-window-name';
      const name = nameForVMContext(page.dom.getInternalVMContext());
      assert.equal(isOwnedVMContextName(name), true); assert.notEqual(name, page.dom.window.name);
      assert.equal(observed.get(name)?.auxData?.isDefault, false); return name;
    });
    assert.equal(new Set(names).size, 4);
    assert.notEqual(observed.get(names[1]).id, Math.max(...[...observed.values()].filter(context => isOwnedVMContextName(context.name)).map(context => context.id)));
  } finally { inspector.disconnect(); browser.close(); }
});

test('Runtime selects reordered pages/frames and successors without probing old/default candidates', async () => {
  const originalPost = InspectorSession.prototype.post, calls = [];
  InspectorSession.prototype.post = function (method, ...args) { calls.push(method); return Reflect.apply(originalPost, this, [method, ...args]); };
  const browser = new Browser({ loadResources: ['iframe'] }), sessions = [], retained = [];
  try {
    const first = browser.createPage(), second = browser.createPage();
    await second.navigate('data:text/html,<title>second</title>'); await first.navigate('data:text/html,<title>first</title>');
    const one = await frame(first, 'one'), two = await frame(first, 'two');
    const a = sessionFor(first), b = sessionFor(second); sessions.push(a, b);
    const cleanup = ({ executionContextId }) => resetRuntime(a, executionContextId); first.on('frameContextDestroyed', cleanup);
    const realms = [[second, b, '__onlySecond'], [two.page, a, '__onlyFrameTwo'], [first, a, '__onlyFirst'], [one.page, a, '__onlyFrameOne']];
    for (const [page, , marker] of realms) { declare(page, marker); retained.push(page.dom.getInternalVMContext()); }
    for (const [page, session, marker] of realms) {
      const result = await runRuntime(session, 'Runtime.globalLexicalScopeNames', { executionContextId: page.executionContextId });
      assert.ok(result.names.includes(marker));
      for (const [, , other] of realms) if (other !== marker) assert.ok(!result.names.includes(other));
    }
    const oldFrameId = one.page.executionContextId, oldName = nameForVMContext(one.page.dom.getInternalVMContext());
    one.element.srcdoc = '<title>replacement</title>';
    await until(() => { const page = first.frames.findElement(one.element); return page && page.executionContextId !== oldFrameId && page.dom.window.document.title === 'replacement'; }, { timeout: 2500 });
    const replacement = first.frames.findElement(one.element); declare(replacement, '__onlyReplacement');
    assert.notEqual(nameForVMContext(replacement.dom.getInternalVMContext()), oldName);
    assert.ok((await runRuntime(a, 'Runtime.globalLexicalScopeNames', { executionContextId: two.page.executionContextId })).names.includes('__onlyFrameTwo'));
    assert.ok((await runRuntime(a, 'Runtime.globalLexicalScopeNames', { executionContextId: replacement.executionContextId })).names.includes('__onlyReplacement'));
    await assert.rejects(runRuntime(a, 'Runtime.globalLexicalScopeNames', { executionContextId: oldFrameId }), /Cannot find context/);
    resetRuntime(b); await second.navigate('data:text/html,<title>successor</title>'); declare(second, '__onlySuccessor');
    assert.ok((await runRuntime(b, 'Runtime.globalLexicalScopeNames', { executionContextId: second.executionContextId })).names.includes('__onlySuccessor'));
    assert.ok(retained.length >= 4); assert.ok(calls.includes('Runtime.globalLexicalScopeNames'));
    assert.equal(calls.includes('Runtime.callFunctionOn'), false);
    assert.equal(calls.includes('Runtime.evaluate'), false);
    first.off('frameContextDestroyed', cleanup);
  } finally {
    for (const session of sessions) resetRuntime(session); browser.close(); InspectorSession.prototype.post = originalPost;
  }
});
