import { cloneObjectKind } from './clone-object-kind.js';
import {ownsWorkerRuntime} from './owned-worker-context.js';
import {installPlatformFactoryHooks} from './platform-factory-hooks.js';
import { createRequire } from 'node:module';
import { registerPlatformFactory, platformFactoryRecord, hasPlatformCloneRealm } from './platform-factories.js';
const require = createRequire(import.meta.url);
let rectGetters;
function nativeRectValues(implementation){
 if(!rectGetters){const RectImpl=require('jsdom/lib/jsdom/living/geometry/DOMRectReadOnly-impl.js').implementation;rectGetters=['x','y','width','height'].map(key=>Object.getOwnPropertyDescriptor(RectImpl.prototype,key).get)}
 return rectGetters.map(get=>get.call(implementation));
}
const receivers = new WeakMap();
const arrayEvery = Array.prototype.every;
const cloneable = new Set(['DOMPoint', 'DOMPointReadOnly', 'DOMRect', 'DOMRectReadOnly']);
// Preserve pre-allocation generated hooks for every normal Host embedding.
// Owned Worker runtimes have their existing separate genuine Node producers.
if(!ownsWorkerRuntime)installPlatformFactoryHooks();
export function geometryFactoryData(value) {
  const record = platformFactoryRecord(value);
  if (!record) return null;
  if (record.kind === 'DOMMatrix' || record.kind === 'DOMMatrixReadOnly') return { kind: 'Geometry', interface: record.kind };
  if (!cloneable.has(record.kind)) return null;
  const values = record.read ? record.read() : nativeRectValues(record.implementation);
  return { kind: 'Geometry', interface: record.kind, values };
}
export function validGeometryRecord(record) {
  return record?.kind === 'Geometry' && cloneable.has(record.interface) && Array.isArray(record.values) && record.values.length === 4 && arrayEvery.call(record.values, value => typeof value === 'number');
}
export function registerGeometryRealm(realm, controller) {
  const constructors = Object.freeze(Object.fromEntries([...cloneable].map(name => [name, controller[name]])));
  receivers.set(realm, constructors);
}
export function deserializeGeometry(realm, record) {
  const constructors = receivers.get(realm);
  if (!constructors || !validGeometryRecord(record)) throw new Error('Invalid or unavailable geometry receiver');
  return new constructors[record.interface](record.values[0],record.values[1],record.values[2],record.values[3]);
}
export function createGeometryBridge(realm) {
  return {
    nativeClone: hasPlatformCloneRealm(realm),
    register(value, kind, read) { registerPlatformFactory(value, { kind, read, globalObject: realm }); },
    serialize: geometryFactoryData,
    classify: cloneObjectKind,
    deserialize(record) { return deserializeGeometry(realm, record); },
  };
}
