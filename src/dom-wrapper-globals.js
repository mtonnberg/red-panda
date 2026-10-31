// Shared Host-only frontend allocation metadata; no DOM interface evaluation.
const globals=new WeakMap();
export function domWrapperGlobal(value,fallback){return globals.get(value)??fallback}
export function recordDOMWrapperGlobal(value,globalObject){globals.set(value,globalObject);return value}
