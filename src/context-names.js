// Private VM context identity for inspector selection; no page-global markers.
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const HOOK = Symbol.for('red-panda.vm-context-name-registry.v1');
let registry;
export function installVMContextNames() {
  if (registry) return;
  // Duplicate module instances must share the actual factory's association;
  // stacked name overrides would otherwise invalidate the outer module's map.
  if (vm.createContext[HOOK]) { registry = vm.createContext[HOOK]; return; }
  const original = vm.createContext, names = new WeakMap();
  const prefix = `red-panda-vm-${randomUUID()}-`;
  let sequence = 0;
  function createContext(contextObject, options) {
    const objectInput = contextObject !== null && ['object', 'function'].includes(typeof contextObject);
    // Calling the original factory on an already contextified object does not
    // rename it. Never invent an association for a pre-existing unknown context.
    if (objectInput && vm.isContext(contextObject)) return Reflect.apply(original, this, arguments);
    // Preserve native validation for malformed options instead of normalizing
    // them into accepted options merely to attach a name.
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
      return Reflect.apply(original, this, arguments);
    }
    const name = `${prefix}${++sequence}`;
    const sourceOptions = options ?? {};
    // A fresh proxy target avoids violating an existing frozen options.name
    // descriptor while preserving other option getter receivers.
    const namedOptions = new Proxy({}, {
      get(_, key) { return key === 'name' ? name : Reflect.get(sourceOptions, key, sourceOptions); },
      has(_, key) { return key === 'name' || Reflect.has(sourceOptions, key); },
    });
    const context = Reflect.apply(original, this, [contextObject, namedOptions]);
    names.set(context, name);
    return context;
  }
  Object.defineProperty(createContext, 'name', { value: original.name, configurable: true });
  Object.defineProperty(createContext, 'length', { value: original.length, configurable: true });
  registry = { names, prefix };
  Object.defineProperty(createContext, HOOK, { value: registry });
  vm.createContext = createContext;
}
export function nameForVMContext(context) { return registry?.names.get(context); }
export function isOwnedVMContextName(name) { return typeof name === 'string' && !!registry && name.startsWith(registry.prefix); }
