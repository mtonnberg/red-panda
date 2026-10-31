// Captured built-in state checks and descriptor reads never invoke authored
// implementation-symbol or toStringTag getters to identify a clone candidate.
import { types } from 'node:util';
import { platformFactoryRecord } from './platform-factories.js';
import { knownPlatformFactoryKind } from './platform-factory-hooks.js';
const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
const geometryKinds = new Set(['DOMPoint','DOMPointReadOnly','DOMRect','DOMRectReadOnly','DOMMatrix','DOMMatrixReadOnly','DOMQuad']);
export function cloneObjectKind(value) {
  if (Array.isArray(value)) return 'Array';
  for (const [kind, test] of [['Map',types.isMap],['Set',types.isSet],['Error',types.isNativeError],['ArrayBuffer',types.isAnyArrayBuffer],['View',ArrayBuffer.isView],['Date',types.isDate],['RegExp',types.isRegExp]]) if (test(value)) return kind;
  if (platformFactoryRecord(value)) return 'Platform';
  if (types.isPromise(value)||types.isWeakMap(value)||types.isWeakSet(value)||types.isBoxedPrimitive(value)||types.isGeneratorObject(value)||types.isMapIterator(value)||types.isSetIterator(value)||types.isExternal(value)||types.isCryptoKey(value)||types.isKeyObject(value)) return 'Other';
  for (let current=value;current!==null;current=prototype(current)) {
    if (types.isProxy(current)) return 'Object';
    const tag=descriptor(current,Symbol.toStringTag); if(!tag)continue;
    if(current===value||!('value'in tag))return 'Object';
    if(typeof tag.value!=='string'||tag.value==='Object'||knownPlatformFactoryKind(tag.value)||geometryKinds.has(tag.value)||/^SVG[A-Z]/.test(tag.value))return 'Object';
    // Preserve the pre-existing unsupported exotic guard for unregistered
    // inherited static tags (e.g. Intl/WeakRef). This is not platform branding.
    return 'Other';
  }
  return 'Object';
}
