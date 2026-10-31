import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const installed = new WeakMap(), faces = new WeakMap(), sets = new WeakSet(), documents = new WeakMap();

// Measured native profile: FontFace is loaded metadata, not a decoded font.
// Sources are not fetched, descriptors use fixed defaults, and FontFaceSet.add
// does not retain membership. The native API has no iteration/has/delete/clear.
// These APIs do not enable authored font rendering or custom font embedding.
function fontsFactory(g, bridge) {
  const Promise_ = g.Promise;
  const defaults = { status: 'loaded', style: 'normal', weight: 'normal', stretch: 'normal',
    unicodeRange: 'U+0-10FFFF', variant: 'normal', featureSettings: 'normal', display: 'auto' };
  const invalid = () => { throw new TypeError('invalid argument'); };
  const faceBrand = object => { if (!bridge.hasFace(object)) throw new TypeError('Illegal invocation'); };
  const setBrand = object => { if (!bridge.hasSet(object)) throw new TypeError('Illegal invocation'); };
  class FontFace {
    constructor(family, source) {
      if (arguments.length < 2) invalid();
      family = '' + family;
      // Buffer sources bypass string conversion; invalid CSS is accepted in
      // this metadata-only profile, while a throwing source coercion propagates.
      if (!ArrayBuffer.isView(source) && Object.prototype.toString.call(source) !== '[object ArrayBuffer]') '' + source;
      bridge.registerFace(this, family);
    }
    get family() { faceBrand(this); return bridge.family(this); }
    get loaded() { faceBrand(this); return Promise_.resolve(); }
    load() { faceBrand(this); return Promise_.resolve(); }
  }
  for (const [name, value] of Object.entries(defaults)) Object.defineProperty(FontFace.prototype, name, {
    configurable: true, enumerable: true, get() { faceBrand(this); return value; },
  });
  const token = {};
  class FontFaceSet extends g.EventTarget {
    constructor(secret) {
      super(); if (secret !== token) throw new TypeError('Illegal Constructor'); bridge.registerSet(this);
    }
    get size() { setBrand(this); return 0; }
    get status() { setBrand(this); return 'loaded'; }
    get ready() { setBrand(this); return Promise_.resolve(); }
    check(font) { setBrand(this); if (!arguments.length) invalid(); return true; }
    load(font) {
      setBrand(this); if (!arguments.length) invalid();
      bridge.dispatch(this, new g.Event('loading'));
      bridge.dispatch(this, new g.Event('loadingdone'));
      return Promise_.resolve();
    }
    add(face) { setBrand(this); if (!arguments.length || !bridge.hasFace(face)) invalid(); return this; }
  }
  for (const Constructor of [FontFace, FontFaceSet]) {
    Object.defineProperty(Constructor.prototype, Symbol.toStringTag, { configurable: true, value: Constructor.name });
    for (const key of Object.getOwnPropertyNames(Constructor.prototype)) if (key !== 'constructor') {
      const descriptor = Object.getOwnPropertyDescriptor(Constructor.prototype, key);
      Object.defineProperty(Constructor.prototype, key, { ...descriptor, enumerable: true });
    }
    Object.defineProperty(g, Constructor.name, { configurable: true, writable: true, value: Constructor });
  }
  const documentBrand = Object.getOwnPropertyDescriptor(g.Document.prototype, 'documentElement').get;
  function getFonts(document) {
    documentBrand.call(document);
    let fonts = bridge.documentFonts(document);
    if (!fonts) { fonts = new FontFaceSet(token); bridge.registerDocument(document, fonts); }
    return fonts;
  }
  Object.defineProperty(g.Document.prototype, 'fonts', { configurable: true, enumerable: true, get() { return getFonts(this); } });
  return { FontFace, FontFaceSet, getFonts };
}

// Window only: enabled native dedicated workers were measured to expose neither
// FontFace, FontFaceSet nor self.fonts. No worker globals are synthesized here.
export function installFonts(window) {
  if (installed.has(window)) return installed.get(window);
  if (typeof window?.eval !== 'function' || !window.Document) throw new TypeError('Font metadata installation requires a document realm');
  const factory = window.eval(`(${fontsFactory.toString()})`);
  const controller = factory(window, {
    hasFace: value => faces.has(value), registerFace: (face, family) => faces.set(face, family), family: face => faces.get(face),
    hasSet: value => sets.has(value), registerSet: set => sets.add(set),
    documentFonts: document => documents.get(document), registerDocument: (document, set) => documents.set(document, set),
    dispatch(target, event) {
      // Public dispatchEvent intentionally clears isTrusted. The pinned native
      // event path preserves browser-generated loading event trust instead.
      const eventImpl = implForWrapper(event); eventImpl.isTrusted = true;
      return implForWrapper(target)._dispatch(eventImpl);
    },
  });
  installed.set(window, controller); return controller;
}
