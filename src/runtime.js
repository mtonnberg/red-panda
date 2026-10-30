import { Session as InspectorSession } from 'node:inspector';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import vm from 'node:vm';
import { withTimeout } from './browser.js';

const methods = new Set([
  'Runtime.awaitPromise', 'Runtime.compileScript', 'Runtime.runScript',
  'Runtime.globalLexicalScopeNames', 'Runtime.getHeapUsage', 'Runtime.getIsolateId',
  'Runtime.getExceptionDetails', 'Runtime.setMaxCallStackSizeToCapture',
]);
const states = new WeakMap();
const stackConfigurations = new WeakMap();

class RuntimeError extends Error {
  constructor(message, code = -32602) { super(message); this.code = code; }
}
const string = (value, name) => {
  if (typeof value !== 'string') throw new RuntimeError(`${name} must be a string`);
  return value;
};
function boolean(value, name, optional = true) {
  if (value === undefined && optional) return;
  if (typeof value !== 'boolean') throw new RuntimeError(`${name} must be boolean`);
}
function context(session, id) {
  if (id === undefined) return;
  if (!Number.isInteger(id) || (id !== session.page.executionContextId && ![...(session.worlds?.values() ?? [])].includes(id))) {
    throw new RuntimeError('Cannot find context with specified id');
  }
}
function details(session, error) {
  // Existing Session.exception accepts Error-like objects, not null/undefined.
  const printable = error !== null && (typeof error === 'object' || typeof error === 'function') ? error : new Error(String(error));
  return session.exception(printable);
}

class RealmInspector {
  constructor(page) {
    this.page = page; this.inspector = new InspectorSession(); this.inspector.connect();
    this.contexts = new Set(); this.enabled = false; this.selected = undefined; this.closed = false;
    this.inspector.on('Runtime.executionContextCreated', ({ params }) => {
      // Never evaluate anything in Node's default execution context.
      if (params.context.auxData?.isDefault === false) this.contexts.add(params.context.id);
    });
    this.inspector.on('Runtime.executionContextDestroyed', ({ params }) => this.contexts.delete(params.executionContextId));
  }
  post(method, params = {}) {
    if (this.closed) return Promise.reject(new RuntimeError('Execution context was destroyed', -32000));
    return new Promise((resolve, reject) => {
      this.inspector.post(method, params, (error, result) => {
        if (error) reject(new RuntimeError(error.message.replace(/^Inspector error -?\d+: /, ''), -32000));
        else resolve(result);
      });
    });
  }
  async realm() {
    if (this.selected !== undefined) return this.selected;
    const window = this.page.dom.window;
    const key = `__redpanda_inspector_${randomUUID().replaceAll('-', '')}`, value = randomUUID();
    Object.defineProperty(window, key, { value, configurable: true });
    try {
      if (!this.enabled) { await this.post('Runtime.enable'); this.enabled = true; }
      const matches = [];
      for (const contextId of this.contexts) {
        // Non-default VM contexts are asked only about this unpredictable marker.
        try {
          const reply = await this.post('Runtime.callFunctionOn', {
            functionDeclaration: 'function(key,value){return this[key]===value}', executionContextId: contextId,
            arguments: [{ value: key }, { value }], returnByValue: true, silent: true,
          });
          if (reply.result?.value === true) matches.push(contextId);
        } catch { /* A context may disappear while the inspector enumerates it. */ }
      }
      if (matches.length !== 1) throw new RuntimeError('Could not identify one selected page execution context', -32000);
      this.selected = matches[0]; return this.selected;
    } finally { delete window[key]; }
  }
  async lexicalNames() { return this.post('Runtime.globalLexicalScopeNames', { executionContextId: await this.realm() }); }
  close() {
    if (this.closed) return;
    this.closed = true; this.inspector.disconnect(); this.contexts.clear();
  }
}

function releaseStack(session, state) {
  const constructor = state.errorConstructor;
  if (!constructor) return;
  const config = stackConfigurations.get(constructor);
  if (!config) return;
  config.sessions.delete(session);
  if (config.sessions.size) constructor.stackTraceLimit = [...config.sessions.values()].at(-1);
  else {
    if (config.original) Object.defineProperty(constructor, 'stackTraceLimit', config.original);
    else delete constructor.stackTraceLimit;
    stackConfigurations.delete(constructor);
  }
}

function stateFor(session) {
  if (session.page.closed) throw new RuntimeError('Execution context was destroyed', -32000);
  let state = states.get(session);
  if (state && state.contextId !== session.page.executionContextId) { resetRuntime(session); state = undefined; }
  if (!state) {
    state = { contextId: session.page.executionContextId, scripts: new Map(), inspector: null, closed: false };
    states.set(session, state);
  }
  return state;
}

/** Route supported Runtime commands here; reset on Session context clear/close.
 * Inspector operations are scoped to the selected jsdom VM by a random marker.
 * Heap usage/isolate IDs describe the shared Node V8 isolate, not a separate page
 * process. Heap object enumeration is deliberately unsupported: Node/V8
 * queryObjects crashed during teardown/recreation of jsdom VM contexts.
 */
export function supportsRuntime(method) { return methods.has(method); }

export async function runRuntime(session, method, params = {}) {
  if (!supportsRuntime(method)) throw new RuntimeError(`Unsupported Runtime method: ${method}`, -32601);
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new RuntimeError('Parameters must be an object');
  const state = stateFor(session), page = session.page;
  const inspector = () => state.inspector ??= new RealmInspector(page);
  switch (method) {
    case 'Runtime.compileScript': {
      context(session, params.executionContextId); string(params.expression, 'expression'); string(params.sourceURL, 'sourceURL');
      boolean(params.persistScript, 'persistScript', false);
      try {
        const script = new vm.Script(params.expression, { filename: params.sourceURL || '<anonymous>' });
        if (!params.persistScript) return {};
        const scriptId = randomUUID(); state.scripts.set(scriptId, script); return { scriptId };
      } catch (error) { return { exceptionDetails: details(session, error) }; }
    }
    case 'Runtime.runScript': {
      context(session, params.executionContextId); string(params.scriptId, 'scriptId');
      boolean(params.awaitPromise, 'awaitPromise'); boolean(params.returnByValue, 'returnByValue');
      if (params.objectGroup !== undefined) string(params.objectGroup, 'objectGroup');
      if (params.includeCommandLineAPI) throw new RuntimeError('Command-line API injection is not implemented', -32601);
      const script = state.scripts.get(params.scriptId);
      if (!script) throw new RuntimeError('No script with given id', -32000);
      state.scripts.delete(params.scriptId); // V8 persisted scripts are single-use.
      try {
        let value;
        try { value = script.runInContext(page.dom.getInternalVMContext(), { timeout: Math.min(page.timeout, 2000) }); }
        finally { page.reconcileURL?.(); }
        if (params.awaitPromise) value = await withTimeout(Promise.resolve(value), page.timeout, 'Promise await timed out');
        if (state.closed || page.executionContextId !== state.contextId || page.closed) throw new RuntimeError('Execution context was destroyed', -32000);
        return { result: session.remote(value, params.returnByValue, params.objectGroup) };
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        return { result: { type: 'undefined' }, exceptionDetails: details(session, error) };
      }
    }
    case 'Runtime.awaitPromise': {
      string(params.promiseObjectId, 'promiseObjectId'); boolean(params.returnByValue, 'returnByValue');
      const promise = session.object(params.promiseObjectId);
      if (!types.isPromise(promise)) throw new RuntimeError('Object is not a Promise');
      const group = session.objects?.get(params.promiseObjectId)?.group;
      try {
        const value = await withTimeout(promise, page.timeout, 'Promise await timed out');
        if (state.closed || page.executionContextId !== state.contextId || page.closed) throw new RuntimeError('Execution context was destroyed', -32000);
        return { result: session.remote(value, params.returnByValue, group) };
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        return { result: session.remote(error, params.returnByValue, group), exceptionDetails: details(session, error) };
      }
    }
    case 'Runtime.globalLexicalScopeNames': context(session, params.executionContextId); return inspector().lexicalNames();
    case 'Runtime.getHeapUsage': return inspector().post('Runtime.getHeapUsage');
    case 'Runtime.getIsolateId': return inspector().post('Runtime.getIsolateId');
    case 'Runtime.getExceptionDetails': {
      string(params.errorObjectId, 'errorObjectId'); const error = session.object(params.errorObjectId);
      return types.isNativeError(error) ? { exceptionDetails: details(session, error) } : {};
    }
    case 'Runtime.setMaxCallStackSizeToCapture': {
      if (!Number.isSafeInteger(params.size) || params.size < 0) throw new RuntimeError('size must be a non-negative integer');
      const constructor = page.evaluate('Error');
      let config = stackConfigurations.get(constructor);
      if (!config) { config = { original: Object.getOwnPropertyDescriptor(constructor, 'stackTraceLimit'), sessions: new Map() }; stackConfigurations.set(constructor, config); }
      config.sessions.delete(session); config.sessions.set(session, params.size);
      state.errorConstructor = constructor; constructor.stackTraceLimit = params.size; return {};
    }
  }
}

export function resetRuntime(session) {
  const state = states.get(session);
  if (!state) return;
  state.closed = true; state.scripts.clear(); state.inspector?.close(); releaseStack(session, state); states.delete(session);
}
