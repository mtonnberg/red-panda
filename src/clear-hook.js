// Drain real V8 jobs at the actual outer classic evaluator's private clear slot.
import { getRuntimeBinding } from './native-runtime.js';
let calls = 0, ran = 0;
const states = new WeakMap(), scopes = [];
let completed = 0, nestedSkipped = 0, inactiveSkipped = 0;
export function withClassicEvaluation(record, script, evaluate) {
  const scope = { record, script, cleared: false };
  scopes.push(scope);
  try { return evaluate(); }
  finally {
    if (scopes.pop() !== scope) throw new Error('Unbalanced owned classic evaluation');
  }
}
export function installCurrentScriptCheckpoint(record, isActive) {
  const document = record.document;
  const checkpoint = record.page.browser?.runtimeBinding?.checkpoint ?? getRuntimeBinding().checkpoint;
  if (states.has(document)) return states.get(document).controller;
  const original = Object.getOwnPropertyDescriptor(document, '_currentScript');
  if (!original || !('value' in original) || !original.configurable || !original.writable) throw new Error('Pinned currentScript slot is unavailable');
  const state = { value: original.value, disposed: false, setting: 0 };
  function restore() {
    const descriptor = Object.getOwnPropertyDescriptor(document, '_currentScript');
    if (descriptor?.get === get && descriptor?.set === set) Object.defineProperty(document, '_currentScript', { ...original, value: state.value });
    states.delete(document);
  }
  function get() { return state.value; }
  function set(value) {
    state.setting++;
    try {
      const scope = scopes.at(-1);
      if (value === null && state.value !== null && scope?.record === record && scope.script === state.value && !scope.cleared) {
        if (scopes.length !== 1) nestedSkipped++;
        else if (state.disposed || !isActive()) inactiveSkipped++;
        else {
          scope.cleared = true;
          // Real jsdom finally is clearing the actual private slot, after its
          // exception reporter. Callback execution comes from the V8 queue.
          const result = checkpoint(); calls++; if (result.ran) ran++; completed++;
        }
      }
    } finally {
      state.value = value;
      state.setting--;
      if (state.disposed && !state.setting) restore();
    }
  }
  const controller = { dispose() {
    if (state.disposed) return;
    state.disposed = true;
    if (!state.setting) restore();
  } };
  state.controller = controller;
  states.set(document, state);
  Object.defineProperty(document, '_currentScript', { configurable: original.configurable, enumerable: original.enumerable, get, set });
  return controller;
}
export function checkpointStatistics() {
  return { calls, ran, skipped: calls - ran, runtime: process.version, activeScopes: scopes.length, completed, nestedSkipped, inactiveSkipped };
}
