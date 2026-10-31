import {registerHeapFactoryValue} from './heap-registry.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const utils = require('jsdom/lib/jsdom/living/generated/utils.js');
const FormIDL = require('jsdom/lib/jsdom/living/generated/HTMLFormElement.js');
const ControlsIDL = require('jsdom/lib/jsdom/living/generated/HTMLFormControlsCollection.js');
const FormImpl = require('jsdom/lib/jsdom/living/nodes/HTMLFormElement-impl.js').implementation;
const documents = new WeakMap();
let patched = false;
const absent = Symbol('absent form control');
const index = key => typeof key === 'string' && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < 0xffffffff;

function active(document) { return documents.get(document)?.() === true; }

// The reference exposes live virtual properties without enumerating them.
// Named descriptors are writable and nonenumerable; assigning one creates an
// ordinary nonenumerable shadow, and deleting that shadow restores the lookup.
// Prototype members take precedence over controls with the same name.
function wrap(raw, implementation, collection, globalObject, replace) {
  const value = key => {
    if (typeof key !== 'string' || Reflect.has(raw, key)) return absent;
    let result;
    if (index(key)) result = collection ? implementation.item(Number(key)) : implementation._getElementNodes()[Number(key)];
    else if (key) result = collection ? implementation.namedItem(key) : implementation.elements.namedItem(key);
    return result == null ? absent : utils.tryWrapperForImpl(result);
  };
  const wrapper = new Proxy(raw, {
    get(target, key, receiver) {
      const item = value(key);
      return item === absent ? Reflect.get(target, key, receiver) : item;
    },
    has(target, key) { return Reflect.has(target, key) || value(key) !== absent; },
    getOwnPropertyDescriptor(target, key) {
      const own = Reflect.getOwnPropertyDescriptor(target, key);
      if (own) return own;
      const item = value(key);
      return item === absent ? undefined : { value: item, writable: !index(key), enumerable: index(key), configurable: true };
    },
    set(target, key, item, receiver) {
      if (value(key) !== absent) {
        if (index(key)) return false;
        return Reflect.defineProperty(target, key, { value: item, writable: true, enumerable: false, configurable: true });
      }
      return Reflect.set(target, key, item, receiver);
    },
    defineProperty(target, key, descriptor) {
      // The native indexed getter remains authoritative after a configurable
      // definition. Reject a nonconfigurable definition rather than violating
      // the host Proxy's descriptor invariants.
      if (index(key) && value(key) !== absent) return descriptor.configurable !== false;
      return Reflect.defineProperty(target, key, descriptor);
    },
    deleteProperty: (target, key) => Reflect.deleteProperty(target, key),
    ownKeys: target => Reflect.ownKeys(target),
    preventExtensions: () => false,
  });
  registerHeapFactoryValue(wrapper,{implementation,globalObject,replace});
  implementation[utils.wrapperSymbol] = wrapper;
  return wrapper;
}

function patch() {
  if (patched) return;
  patched = true;
  for (const [IDL, collection] of [[FormIDL, false], [ControlsIDL, true]]) {
    const setup = IDL.setup;
    IDL.setup = function (raw, globalObject, ...args) {
      const original = setup.call(this, raw, globalObject, ...args);
      const implementation = utils.implForWrapper(original);
      const document = collection ? utils.implForWrapper(globalObject.document) : implementation._ownerDocument;
      return active(document) ? wrap(raw, implementation, collection, globalObject, original) : original;
    };
  }
  const createForm = FormIDL.new;
  FormIDL.new = function (globalObject, newTarget) {
    if (!active(utils.implForWrapper(globalObject.document))) return createForm.call(this, globalObject, newTarget);
    const prototype = newTarget?.prototype;
    const raw = Object.create(utils.isObject(prototype) ? prototype : globalObject[utils.ctorRegistrySymbol].HTMLFormElement.prototype);
    FormIDL._internalSetup(raw, globalObject);
    const implementation = Object.create(FormImpl.prototype);
    Object.defineProperty(raw, utils.implSymbol, { value: implementation, configurable: true });
    wrap(raw, implementation, false, globalObject);
    return implementation;
  };
  for (const name of ['Button', 'FieldSet', 'Input', 'Object', 'Output', 'Select', 'TextArea']) {
    const prototype = require(`jsdom/lib/jsdom/living/nodes/HTML${name}Element-impl.js`).implementation.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'form');
    if (!descriptor?.get) continue;
    Object.defineProperty(prototype, 'form', { ...descriptor, get() {
      if (!active(this._ownerDocument) || this.isConnected) return descriptor.get.call(this);
      for (let ancestor = this.parentNode; ancestor; ancestor = ancestor.parentNode) {
        if (ancestor.localName === 'form' && ancestor.namespaceURI === 'http://www.w3.org/1999/xhtml') return ancestor;
      }
      return null;
    } });
  }
}

export function installFormControls(window, isActive) {
  patch();
  documents.set(utils.implForWrapper(window.document), isActive);
}
