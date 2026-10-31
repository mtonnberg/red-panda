import 'jsdom';
// Real DOM attributes and generated DOMTokenList objects, with native-observed
// supported-token tables and PutForwards setters. No cloned surrogate elements.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const Element = require('jsdom/lib/jsdom/living/generated/Element.js');
const Document = require('jsdom/lib/jsdom/living/generated/Document.js');
const TokenList = require('jsdom/lib/jsdom/living/generated/DOMTokenList.js');
const installed = new WeakMap(), lists = new WeakMap();
const linkTokens = new Set(['stylesheet','modulepreload','preload','dns-prefetch','preconnect','prefetch']);
const openerTokens = new Set(['noopener','noreferrer','opener']);
const sandboxTokens = new Set(['allow-forms','allow-modals','allow-orientation-lock','allow-pointer-lock','allow-popups','allow-popups-to-escape-sandbox','allow-presentation','allow-same-origin','allow-scripts','allow-storage-access-by-user-activation','allow-top-navigation','allow-top-navigation-by-user-activation','allow-top-navigation-to-custom-protocols','allow-downloads']);
function listFor(element, attribute, supportedTokens) {
  let state = lists.get(element); if (!state) { state = new Map(); lists.set(element, state); }
  if (!state.has(attribute)) {
    const implementation = implForWrapper(element), global = implementation._globalObject;
    const list = TokenList.create(global, [], { element: implementation, attributeLocalName: attribute, supportedTokens });
    const value = implForWrapper(list), synchronize = value._syncWithElement;
    // These extra reflected attributes are not in jsdom's attributeRegistry.
    // Read the actual current attribute on every genuine token operation.
    value._syncWithElement = function () { this._dirty = true; return synchronize.call(this); };
    value._validationSteps = function (token) { if (!supportedTokens) throw new global.TypeError(''); return supportedTokens.has(token.replace(/[A-Z]/g, x=>x.toLowerCase())); };
    state.set(attribute, list);
  }
  return state.get(attribute);
}
function factory(g, bridge) {
  const attrGet=g.Element.prototype.getAttribute,attrSet=g.Element.prototype.setAttribute,bodyGet=Object.getOwnPropertyDescriptor(g.Document.prototype,'body').get;
  const string = value => { if (typeof value === 'symbol') throw new g.TypeError('Cannot convert a Symbol value to a string'); return String(value); };
  const define = (prototype, name, attribute, supported, interfaceName='Element') => {
    Object.defineProperty(prototype, name, { configurable:true, enumerable:true,
      get() { if (!bridge.valid(this,interfaceName)) throw new g.TypeError('Illegal invocation'); return bridge.list(this, attribute, supported); },
      set(value) { if (!bridge.valid(this,interfaceName)) throw new g.TypeError('Illegal invocation'); bridge.list(this, attribute, supported).value = value; },
    });
  };
  define(g.Element.prototype, 'part', 'part');
  for (const [Constructor, property, attribute, supported] of [
    [g.HTMLLinkElement,'relList','rel','link'],[g.HTMLLinkElement,'sizes','sizes'],
    [g.HTMLAnchorElement,'relList','rel','opener'],[g.HTMLAreaElement,'relList','rel','opener'],
    [g.HTMLFormElement,'relList','rel','opener'],[g.HTMLOutputElement,'htmlFor','for'],[g.HTMLIFrameElement,'sandbox','sandbox','sandbox'],
    [g.SVGAElement,'relList','rel','opener'],
  ]) if (Constructor) define(Constructor.prototype,property,attribute,supported,Constructor.name);
  Object.defineProperty(g.HTMLFormElement.prototype,'rel',{configurable:true,enumerable:true,
    get(){if(!bridge.isForm(this))throw new g.TypeError('Illegal invocation');return attrGet.call(this,'rel')??'';},
    set(value){if(!bridge.isForm(this))throw new g.TypeError('Illegal invocation');attrSet.call(this,'rel',string(value));}});
  for (const [name,attribute] of [['fgColor','text'],['linkColor','link'],['vlinkColor','vlink'],['alinkColor','alink'],['bgColor','bgcolor']]) {
    Object.defineProperty(g.Document.prototype,name,{configurable:true,enumerable:true,
      get(){if(!bridge.isDocument(this))throw new g.TypeError('Illegal invocation');const body=bodyGet.call(this);return body?attrGet.call(body,attribute)??'':'';},
      set(value){if(!bridge.isDocument(this))throw new g.TypeError('Illegal invocation');value=value===null?'':string(value);const body=bodyGet.call(this);if(body)attrSet.call(body,attribute,value);}});
  }
}
export function installDOMIDL(page, window) {
  if (installed.has(window)) return installed.get(window);
  const Form = require('jsdom/lib/jsdom/living/generated/HTMLFormElement.js');
  window.eval(`(${factory.toString()})`)(window, { isElement:Element.is,isDocument:Document.is,isForm:Form.is,valid(element,name){if(name==='SVGAElement')return Element.is(element)&&implForWrapper(element)._namespaceURI==='http://www.w3.org/2000/svg'&&implForWrapper(element)._localName==='a';try{return require('jsdom/lib/jsdom/living/generated/'+name+'.js').is(element);}catch{return false;}},
    list(element,attribute,supported){return listFor(element,attribute,({link:linkTokens,opener:openerTokens,sandbox:sandboxTokens})[supported]);} });
  const controller = {}; installed.set(window,controller); return controller;
}
