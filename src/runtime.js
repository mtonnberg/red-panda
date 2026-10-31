import {runHeapQuery} from './heap-query.js';
import {invocationBindingFor} from './invocation.js';
import { Session as InspectorSession } from 'node:inspector';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import vm from 'node:vm';
import { nameForVMContext, isOwnedVMContextName } from './context-names.js';
import { withTimeout } from './browser.js';

const methods = new Set([
  'Runtime.queryObjects', 'Runtime.awaitPromise', 'Runtime.compileScript', 'Runtime.runScript',
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
function executionPage(session, id) {
  if (id !== undefined && !Number.isInteger(id)) throw new RuntimeError('Cannot find context with specified id');
  if (typeof session.executionPage === 'function') {
    const page = session.executionPage(id);
    if (!page || page.closed) throw new RuntimeError('Cannot find context with specified id');
    return page;
  }
  if (id !== undefined && id !== session.page.executionContextId && ![...(session.worlds?.values() ?? [])].includes(id)) {
    throw new RuntimeError('Cannot find context with specified id');
  }
  if (session.page.closed) throw new RuntimeError('Execution context was destroyed', -32000);
  return session.page;
}
function details(session, error, contextId) {
  return { ...session.exception(error, contextId), executionContextId: contextId };
}

class RealmInspector {
  constructor(page) {
    this.page = page; this.inspector = new InspectorSession(); this.inspector.connect();
    this.contexts = new Map(); this.enabled = false; this.selected = undefined; this.closed = false;
    this.inspector.on('Runtime.executionContextCreated', ({ params }) => {
      // Never evaluate anything in Node's default execution context.
      if (params.context.auxData?.isDefault === false && isOwnedVMContextName(params.context.name)) {
        this.contexts.set(params.context.id, params.context.name);
      }
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
    const name = nameForVMContext(this.page.dom.getInternalVMContext());
    if (!name) throw new RuntimeError('Selected page VM context has no registered name', -32000);
    if (this.selected !== undefined && this.contexts.get(this.selected) === name) return this.selected;
    if (!this.enabled) { await this.post('Runtime.enable'); this.enabled = true; }
    const matches = [...this.contexts].filter(([, candidate]) => candidate === name).map(([id]) => id);
    if (matches.length !== 1) throw new RuntimeError('Could not identify one named page execution context', -32000);
    this.selected = matches[0]; return this.selected;
  }
  async lexicalNames() { return this.post('Runtime.globalLexicalScopeNames', { executionContextId: await this.realm() }); }
  close() {
    if (this.closed) return;
    this.closed = true; this.inspector.disconnect(); this.contexts.clear();
  }
}

function releaseStack(state) {
  const constructor = state.errorConstructor;
  if (!constructor) return;
  const config = stackConfigurations.get(constructor);
  if (!config) return;
  config.overrides.delete(state);
  if (config.overrides.size) constructor.stackTraceLimit = [...config.overrides.values()].at(-1);
  else {
    if (config.original) Object.defineProperty(constructor, 'stackTraceLimit', config.original);
    else delete constructor.stackTraceLimit;
    stackConfigurations.delete(constructor);
  }
}

function current(state) {
  return !state.closed && !state.page.closed && !state.page.documentAbort?.signal.aborted &&
    state.page.executionContextId === state.pageContextId && state.page.dom.window === state.window && !!state.window.document;
}
function closeState(state) {
  if (state.closed) return;
  state.closed = true; state.abort.abort(new RuntimeError('Execution context was destroyed', -32000));
  state.scripts.clear(); state.inspector?.close(); releaseStack(state);
}
function prune(session) {
  const realms = states.get(session);
  if (!realms) return;
  for (const [id, state] of realms) if (!current(state)) { closeState(state); realms.delete(id); }
  if (!realms.size) states.delete(session);
}
function stateFor(session, page, contextId = page.executionContextId) {
  let realms = states.get(session);
  if (!realms) { realms = new Map(); states.set(session, realms); }
  let state = realms.get(contextId);
  if (state && state.page !== page) { closeState(state); realms.delete(contextId); state = undefined; }
  if (!state) {
    state = { contextId, page, pageContextId: page.executionContextId, window: page.dom.window,
      scripts: new Map(), inspector: null, closed: false, abort: new AbortController() };
    realms.set(contextId, state);
  }
  return state;
}
async function awaitInState(state, value) {
  if (!current(state)) throw new RuntimeError('Execution context was destroyed', -32000);
  let abort;
  const destroyed = new Promise((resolve, reject) => {
    abort = () => reject(state.abort.signal.reason);
    state.abort.signal.addEventListener('abort', abort, { once: true });
  });
  try { return await withTimeout(Promise.race([Promise.resolve(value), destroyed]), state.page.timeout, 'Promise await timed out'); }
  finally { state.abort.signal.removeEventListener('abort', abort); }
}

/** Route supported Runtime commands here; resetRuntime(session, contextId?)
 * releases one context or the entire Session. Session.executionPage(id) selects
 * an actual page/frame facade; old unit fixtures may omit it for root fallback.
 * Inspector operations select the actual VM context through its registered name.
 * Heap usage/isolate IDs describe the shared Node V8 isolate, not a separate page
 * process. Heap object enumeration is deliberately unsupported: Node/V8
 * queryObjects crashed during teardown/recreation of jsdom VM contexts.
 */
export function supportsRuntime(method) { return methods.has(method); }

export async function runRuntime(session, method, params = {}) {
  if(method==='Runtime.queryObjects')return runHeapQuery(session,params);
  if (!supportsRuntime(method)) throw new RuntimeError(`Unsupported Runtime method: ${method}`, -32601);
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new RuntimeError('Parameters must be an object');
  prune(session);
  if (params.executionContextId !== undefined && params.contextId !== undefined && params.executionContextId !== params.contextId) {
    throw new RuntimeError('Conflicting execution context ids');
  }
  let contextId = params.executionContextId ?? params.contextId;
  let scriptState;
  if (method === 'Runtime.runScript' && typeof params.scriptId === 'string') {
    scriptState = [...(states.get(session)?.values() ?? [])].find(state => state.scripts.has(params.scriptId));
    if (scriptState && contextId === undefined) contextId = scriptState.contextId;
    if (scriptState && contextId !== scriptState.contextId) throw new RuntimeError('Script belongs to a different execution context', -32000);
  }
  const objectId = method === 'Runtime.awaitPromise' ? params.promiseObjectId : method === 'Runtime.getExceptionDetails' ? params.errorObjectId : undefined;
  if (objectId !== undefined) {
    const objectContext = session.objects?.get(objectId)?.contextId;
    if (objectContext !== undefined) {
      if (contextId !== undefined && contextId !== objectContext) throw new RuntimeError('Object belongs to a different execution context');
      contextId = objectContext;
    }
  }
  const page = executionPage(session, contextId);
  contextId ??= page.executionContextId;
  const state = stateFor(session, page, contextId);
  const inspector = () => state.inspector ??= new RealmInspector(page);
  switch (method) {
    case 'Runtime.compileScript': {
      string(params.expression, 'expression'); string(params.sourceURL, 'sourceURL');
      boolean(params.persistScript, 'persistScript', false);
      try {
        const script = new vm.Script(params.expression, { filename: params.sourceURL || '<anonymous>' });
        if (!params.persistScript) return {};
        const scriptId = randomUUID(); state.scripts.set(scriptId, script); return { scriptId };
      } catch (error) { return { exceptionDetails: details(session, error, contextId) }; }
    }
    case 'Runtime.runScript': {
      string(params.scriptId, 'scriptId');
      boolean(params.awaitPromise, 'awaitPromise'); boolean(params.returnByValue, 'returnByValue');
      if (params.objectGroup !== undefined) string(params.objectGroup, 'objectGroup');
      if (params.includeCommandLineAPI) throw new RuntimeError('Command-line API injection is not implemented', -32601);
      const script = state.scripts.get(params.scriptId);
      if (!script) throw new RuntimeError('No script with given id', -32000);
      state.scripts.delete(params.scriptId); // V8 persisted scripts are single-use.
      try {
        let value;
        try { value = script.runInContext(page.dom.getInternalVMContext(), { timeout: Math.min(page.timeout, 2000), displayErrors: false }); }
        finally { page.reconcileURL?.(); }
        if (params.awaitPromise) value = await awaitInState(state, value);
        if (!current(state)) throw new RuntimeError('Execution context was destroyed', -32000);
        return { result: session.remote(value, params.returnByValue, params.objectGroup, contextId) };
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        if (!current(state)) throw new RuntimeError('Execution context was destroyed', -32000);
        return { result: { type: 'undefined' }, exceptionDetails: details(session, error, contextId) };
      }
    }
    case 'Runtime.awaitPromise': {
      string(params.promiseObjectId, 'promiseObjectId'); boolean(params.returnByValue, 'returnByValue');
      const promise = session.object(params.promiseObjectId);
      if (!types.isPromise(promise)) throw new RuntimeError('Object is not a Promise');
      const group = session.objects?.get(params.promiseObjectId)?.group;
      try {
        const value = await awaitInState(state, promise);
        if (!current(state)) throw new RuntimeError('Execution context was destroyed', -32000);
        return { result: session.remote(value, params.returnByValue, group, contextId) };
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        if (!current(state)) throw new RuntimeError('Execution context was destroyed', -32000);
        return { result: session.remote(error, params.returnByValue, group, contextId), exceptionDetails: details(session, error, contextId) };
      }
    }
    case 'Runtime.globalLexicalScopeNames': {
      const result=await inspector().lexicalNames(),owned=invocationBindingFor(page.dom.getInternalVMContext());
      return {...result,names:result.names.filter(name=>name!==owned)};
    }
    case 'Runtime.getHeapUsage': return inspector().post('Runtime.getHeapUsage');
    case 'Runtime.getIsolateId': return inspector().post('Runtime.getIsolateId');
    case 'Runtime.getExceptionDetails': {
      string(params.errorObjectId, 'errorObjectId'); const error = session.object(params.errorObjectId);
      return types.isNativeError(error) ? { exceptionDetails: details(session, error, contextId) } : {};
    }
    case 'Runtime.setMaxCallStackSizeToCapture': {
      if (!Number.isSafeInteger(params.size) || params.size < 0) throw new RuntimeError('size must be a non-negative integer');
      const constructor = page.evaluate('Error');
      let config = stackConfigurations.get(constructor);
      if (!config) { config = { original: Object.getOwnPropertyDescriptor(constructor, 'stackTraceLimit'), overrides: new Map() }; stackConfigurations.set(constructor, config); }
      config.overrides.delete(state); config.overrides.set(state, params.size);
      state.errorConstructor = constructor; constructor.stackTraceLimit = params.size; return {};
    }
  }
}

export function resetRuntime(session, contextId) {
  const realms = states.get(session);
  if (!realms) return;
  if (contextId === undefined) {
    for (const state of realms.values()) closeState(state);
    realms.clear(); states.delete(session);
  } else {
    for (const [id, state] of realms) {
      // A compatibility world alias can share the actual VM context. Destroying
      // that VM also destroys every alias's pending work and stack overrides.
      if (id === contextId || state.pageContextId === contextId) { closeState(state); realms.delete(id); }
    }
    if (!realms.size) states.delete(session);
  }
}
