import {registerHeapWrapper} from './heap-registry.js';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HTMLCollection = require('jsdom/lib/jsdom/living/generated/HTMLCollection.js');
const RadioNodeListImpl = require('jsdom/lib/jsdom/living/nodes/RadioNodeList-impl.js').implementation;
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const defaultPath = fileURLToPath(new URL(`../native/build/${process.platform}-${process.arch}/node-${process.versions.node}/collections.node`, import.meta.url));
const installed = new WeakMap();
const collectionGlobals = new WeakSet();
let patchedRadioUpdates = false;

// Reject mismatches before dlopen: Node ABI alone does not identify a V8 patch.
// Builds are explicit and require a process restart when an addon is replaced.
export function loadCollectionsBinding(filename = process.env.RED_PANDA_COLLECTIONS_ADDON ?? defaultPath) {
  filename = path.resolve(filename);
  let manifest;
  try { manifest = JSON.parse(readFileSync(`${filename}.json`, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Collection addon missing for Node ${process.version}; run npm run build:native with this Node executable`, { cause: error });
    throw error;
  }
  const expected = { node: process.version, abi: process.versions.modules, v8: process.versions.v8,
    platform: process.platform, architecture: process.arch };
  for (const [key, value] of Object.entries(expected)) if (manifest[key] !== value) {
    throw new Error(`Collection addon ${key} does not match the running Node process; rebuild for ${process.version}`);
  }
  const digest = value => createHash('sha256').update(value).digest('hex');
  if (manifest.binarySHA256 !== digest(readFileSync(filename))) throw new Error('Collection addon binary digest does not match its build manifest');
  if (manifest.sourceSHA256 !== digest(readFileSync(new URL('../native/collections.cc', import.meta.url)))) throw new Error('Collection addon source changed; rebuild it');
  const binding = require(filename);
  if (binding.headersVersion !== process.version || String(binding.abiVersion) !== process.versions.modules || typeof binding.create !== 'function') {
    throw new Error('Collection addon was compiled against different Node headers');
  }
  return binding;
}

const allNamedTags = new Set(['a', 'button', 'embed', 'form', 'frame', 'frameset', 'iframe', 'img',
  'input', 'map', 'meta', 'object', 'select', 'textarea']);
const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const arrayIndex = value => /^(?:0|[1-9]\d*)$/.test(value) && Number(value) < 0xffffffff;

// Call in beforeParse with an already loaded binding. There is deliberately no
// Proxy/undefined fallback: neither can supply [[IsHTMLDDA]]. Collection writes,
// delete/defineProperty corner cases and cross-realm borrowed getters still need
// broader conformance coverage; the live read/call/named property core is tested.
export function installCollections(window, options = {}) {
  if (installed.has(window)) return installed.get(window);
  const binding = options.binding ?? loadCollectionsBinding();
  if (typeof binding?.create !== 'function') throw new TypeError('A native HTMLDDA collection binding is required');
  const states = new WeakMap();
  const getElements = window.Document.prototype.getElementsByTagName;
  const getAttribute = window.Element.prototype.getAttribute;
  const HTMLAllCollection = window.eval('(function HTMLAllCollection() { throw new TypeError("Illegal constructor"); })');
  const prototype = HTMLAllCollection.prototype;
  const brand = value => {
    if (!states.has(value)) throw new window.TypeError('Invalid HTMLAllCollection receiver');
    return states.get(value);
  };
  const string = value => {
    if (typeof value === 'symbol') throw new window.TypeError('A Symbol cannot be converted to a DOMString');
    return String(value);
  };
  const attribute = (element, name) => getAttribute.call(element, name);
  const matching = (element, key) => attribute(element, 'id') === key ||
    (element.namespaceURI === htmlNamespace && allNamedTags.has(element.localName) && attribute(element, 'name') === key);
  function named(state, input) {
    const key = string(input);
    if (!key) return null;
    const matches = Array.from(state.elements).filter(element => matching(element, key));
    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];
    return HTMLCollection.create(window, [], { element: implForWrapper(state.document),
      query: () => Array.from(state.elements).filter(element => matching(element, key)).map(implForWrapper) });
  }
  function item(state, input) {
    const key = string(input);
    return arrayIndex(key) ? state.elements.item(Number(key)) : named(state, key);
  }
  Object.defineProperties(prototype, {
    length: { configurable: true, enumerable: true, get() { return brand(this).elements.length; } },
    item: { configurable: true, writable: true, enumerable: true, value: function item_(nameOrIndex) {
      const state = brand(this); return arguments.length ? item(state, nameOrIndex) : null;
    } },
    namedItem: { configurable: true, writable: true, enumerable: true, value: function namedItem(name) {
      const state = brand(this); if (!arguments.length) throw new window.TypeError('namedItem requires a name'); return named(state, name);
    } },
    [Symbol.iterator]: { configurable: true, writable: true, value: function* values() {
      const state = brand(this); for (let index = 0; index < state.elements.length; index++) yield state.elements[index];
    } },
    [Symbol.toStringTag]: { configurable: true, value: 'HTMLAllCollection' },
  });
  Object.defineProperty(prototype.item, 'name', { configurable: true, value: 'item' });
  function collection(document) {
    // The captured WebIDL method supplies the real Document brand check and a
    // live collection, including SVG/MathML elements and dynamically added nodes.
    const state = { document, elements: getElements.call(document, '*') };
    const names = () => {
      const keys = new Set();
      for (const element of state.elements) {
        const id = attribute(element, 'id'), name = attribute(element, 'name');
        if (id && !arrayIndex(id)) keys.add(id);
        if (name && !arrayIndex(name) && element.namespaceURI === htmlNamespace && allNamedTags.has(element.localName)) keys.add(name);
      }
      return [...keys];
    };
    const result = binding.create({
      has: key => !(key in prototype) && named(state, key) !== null,
      get: key => named(state, key), keys: () => names().filter(key => !(key in prototype)),
      hasIndex: index => index < state.elements.length,
      getIndex: index => state.elements[index],
      indices: () => Array.from({ length: state.elements.length }, (_, index) => index),
      call: arguments_ => arguments_.length ? item(state, arguments_[0]) : null,
    }, prototype);
    states.set(result, state); return registerHeapWrapper(result,window);
  }
  Object.defineProperty(window.Document.prototype, 'all', { configurable: true, enumerable: true, get() { return collection(this); } });
  Object.defineProperty(window, 'HTMLAllCollection', { configurable: true, writable: true, value: HTMLAllCollection });

  // jsdom's live RadioNodeList points at a controls collection whose version is
  // itself lazy. Refresh that parent before consulting the derived list. Scope
  // the private implementation hook to globals that installed this adapter.
  collectionGlobals.add(window); collectionGlobals.add(window._globalObject ?? window);
  if (!patchedRadioUpdates) {
    patchedRadioUpdates = true;
    const update = RadioNodeListImpl.prototype._update;
    RadioNodeListImpl.prototype._update = function () {
      if (collectionGlobals.has(this._element?._globalObject?.window)) this._element._update?.();
      return update.call(this);
    };
  }
  // Its value setter additionally omits the list update. Preserve native
  // WebIDL conversion and brand checks while refreshing membership first.
  const radio = Object.getOwnPropertyDescriptor(window.RadioNodeList.prototype, 'value');
  const nodeListLength = Object.getOwnPropertyDescriptor(window.NodeList.prototype, 'length').get;
  Object.defineProperty(window.RadioNodeList.prototype, 'value', { ...radio, set(value) {
    nodeListLength.call(this); return radio.set.call(this, value);
  } });
  const controller = { HTMLAllCollection };
  installed.set(window, controller); return controller;
}
