import 'jsdom';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { registerPlatformFactory } from './platform-factories.js';
const require = createRequire(import.meta.url);
let installed = false;
const knownKinds = new Set();
export function knownPlatformFactoryKind(kind) { return knownKinds.has(kind); }
// Known names only affect ordinary lookalike classification, never branding.
export function registerPlatformFactoryKind(kind) {
  if (typeof kind !== 'string' || !kind) throw new TypeError('Platform factory kind is required');
  knownKinds.add(kind);
}
// Only successful trusted generated setup/new returns register an identity.
// Candidate classification never discovers brands from implementation symbols.
export function installPlatformFactoryHooks() {
  if (installed) return; installed = true;
  const directory = path.dirname(require.resolve('jsdom/lib/jsdom/living/generated/utils.js'));
  const modules = readdirSync(directory).filter(name => name.endsWith('.js') && name !== 'utils.js').map(name => ({ filename:path.join(directory,name), kind:path.basename(name,'.js'), utils:require('jsdom/lib/jsdom/living/generated/utils.js') }));
  for (const kind of ['URL','URLSearchParams']) modules.push({ filename:require.resolve(`whatwg-url/lib/${kind}.js`), kind, utils:require('whatwg-url/lib/utils.js') });
  for (const { filename, kind, utils } of modules) {
    const factory = require(filename), setup = factory.setup, allocate = factory.new;
    if(typeof setup==='function'||typeof allocate==='function')knownKinds.add(kind);
    if (typeof setup === 'function') factory.setup = function (wrapper, globalObject, ...args) {
      const value = setup.call(this, wrapper, globalObject, ...args);
      const descriptor = Object.getOwnPropertyDescriptor(wrapper, utils.implSymbol);
      registerPlatformFactory(value, { kind, implementation:descriptor?.value, globalObject });
      return value;
    };
    if (typeof allocate === 'function') factory.new = function (globalObject, ...args) {
      const implementation = allocate.call(this, globalObject, ...args);
      const descriptor = Object.getOwnPropertyDescriptor(implementation, utils.wrapperSymbol);
      if (descriptor?.value) registerPlatformFactory(descriptor.value, { kind, implementation, globalObject });
      return implementation;
    };
  }
}
