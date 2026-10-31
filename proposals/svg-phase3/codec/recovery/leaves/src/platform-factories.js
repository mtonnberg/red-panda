// Host-private provenance from successful allocation/factory callsites only.
// No wrapper enumeration, authored marker reads or native heap dependency.
const factories = new WeakMap();
const subscribers = new Set();
const cloneRealms = new WeakSet();
export function registerPlatformFactory(value, { kind, implementation, globalObject, read } = {}) {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') throw new TypeError('Platform factory must return an object');
  if (typeof kind !== 'string') throw new TypeError('Platform factory kind is required');
  const record = Object.freeze({ kind, implementation, globalRef: globalObject ? new WeakRef(globalObject) : undefined, read });
  factories.set(value, record);
  for (const callback of subscribers) { try { callback(value, record); } catch { /* Observation must not change successful Web API construction. */ } }
  return record;
}
export function platformFactoryRecord(value) { return factories.get(value); }
export function subscribePlatformFactories(callback) {
  if (typeof callback !== 'function') throw new TypeError('Platform factory subscriber must be callable');
  subscribers.add(callback); return () => subscribers.delete(callback);
}

// Trusted messaging adapters register before geometry installs its classes.
export function registerPlatformCloneRealm(realm) { cloneRealms.add(realm); }
export function hasPlatformCloneRealm(realm) { return cloneRealms.has(realm); }
