import {captureIDLMemberFactory} from './public-idl-member.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ElementImpl = require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const HTMLElementImpl = require('jsdom/lib/jsdom/living/nodes/HTMLElement-impl.js').implementation;
const NodeImpl = require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const TextImpl = require('jsdom/lib/jsdom/living/nodes/Text-impl.js').implementation;
const SlotImpl = require('jsdom/lib/jsdom/living/nodes/HTMLSlotElement-impl.js').implementation;
const EventTargetImpl = require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const ElementInterface = require('jsdom/lib/jsdom/living/generated/Element.js');
const ShadowRootInterface = require('jsdom/lib/jsdom/living/generated/ShadowRoot.js');
const SlotInterface = require('jsdom/lib/jsdom/living/generated/HTMLSlotElement.js');
const TextInterface = require('jsdom/lib/jsdom/living/generated/Text.js');
const ShadowRootInit = require('jsdom/lib/jsdom/living/generated/ShadowRootInit.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const { cloningSteps, domSymbolTree } = require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const { ceReactionsPreSteps, ceReactionsPostSteps } = require('jsdom/lib/jsdom/living/helpers/custom-elements.js');
const focusing = require('jsdom/lib/jsdom/living/helpers/focusing.js');
const { isShadowRoot, signalSlotChange } = require('jsdom/lib/jsdom/living/helpers/shadow-dom.js');
const { signalSlotList } = require('jsdom/lib/jsdom/living/helpers/mutation-observers.js');
const nodeHelpers = require('jsdom/lib/jsdom/living/node.js');
const htmlParser = require('jsdom/lib/jsdom/browser/parser/html.js');
const serializationAdapter = require('jsdom/lib/jsdom/living/domparsing/parse5-adapter-serialization.js');
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'));
const parse5 = jsdomRequire('parse5');
const DOCUMENTS = new WeakMap();
const DISPOSED_DOCUMENTS = new WeakSet();
const ROOTS = new WeakMap();
const FORCED_FRAGMENTS = new WeakMap();
const FORCED_DOCUMENTS = new WeakMap();
const MANUAL_LISTS = new WeakMap();
const MANUAL_OWNERS = new WeakMap();
const HTML = 'http://www.w3.org/1999/xhtml';
const defaults = () => ({ serializable: false, clonable: false, delegatesFocus: false, slotAssignment: 'named', declarative: false });
const DEFAULT_FLAGS = Object.freeze(defaults());
let patched = false;
let slotChangeGeneration = 0;

function active(record) {
  return record && !record.disposed && !record.page.closed && !record.signal?.aborted && record.window.document === record.document;
}

function recordFor(document) { const record = DOCUMENTS.get(document); return active(record) ? record : null; }

function flags(root) { return ROOTS.get(root) ?? DEFAULT_FLAGS; }

function manualRoot(node) {
  if (!node) return null;
  const root = node.getRootNode({});
  return isShadowRoot(root) && flags(root).slotAssignment === 'manual' ? root : null;
}

function lightManualRoot(node) {
  const root = node?.parentNode?._shadowRoot;
  return root && flags(root).slotAssignment === 'manual' ? root : null;
}

function markSlotChange(root, slot) {
  const state = flags(root);
  state.pendingSlotChanges ??= new Map();
  const generation = ++slotChangeGeneration;
  state.pendingSlotChanges.set(slot, generation);
  signalSlotChange(slot);
  queueMicrotask(() => {
    if (state.pendingSlotChanges.get(slot) === generation) state.pendingSlotChanges.delete(slot);
  });
}

function refreshManual(root) {
  if (!root || flags(root).slotAssignment !== 'manual') return;
  const state = flags(root);
  const slots = new Set([...domSymbolTree.treeIterator(root)].filter(node => node.localName === 'slot' && node.namespaceURI === HTML));
  for (const slot of new Set([...(state.manualSlots ?? []), ...slots])) {
    const requested = MANUAL_LISTS.get(slot) ?? [];
    const next = slots.has(slot) ? requested.filter(node => node.parentNode === root.host && MANUAL_OWNERS.get(node) === slot) : [];
    const previous = state.manualAssignments?.get(slot) ?? [];
    const changed = previous.length !== next.length || previous.some((node, index) => node !== next[index]);
    // jsdom's named-slot helper may have run during the same DOM mutation.
    // Replace its private assignment and suppress only its spurious signal.
    slot._assignedNodes = next;
    if (changed) markSlotChange(root, slot);
    if (!state.pendingSlotChanges?.has(slot)) {
      for (let index = signalSlotList.length - 1; index >= 0; index--) if (signalSlotList[index] === slot) signalSlotList.splice(index, 1);
    }
    state.manualAssignments ??= new Map();
    if (slots.has(slot)) state.manualAssignments.set(slot, next);
    else state.manualAssignments.delete(slot);
  }
  state.manualSlots = slots;
  for (const child of domSymbolTree.childrenToArray(root.host)) {
    if (child.nodeType !== 1 && child.nodeType !== 3) continue;
    const owner = MANUAL_OWNERS.get(child);
    child._assignedSlot = owner && slots.has(owner) && slotContains(owner, child) ? owner : null;
  }
}

function slotContains(slot, child) { return (MANUAL_LISTS.get(slot) ?? []).includes(child); }

function assignManual(slot, nodes) {
  const touched = new Set([manualRoot(slot)]);
  for (const node of MANUAL_LISTS.get(slot) ?? []) if (MANUAL_OWNERS.get(node) === slot) MANUAL_OWNERS.delete(node);
  const unique = [...new Set(nodes)];
  for (const node of unique) {
    const previous = MANUAL_OWNERS.get(node);
    if (previous && previous !== slot) {
      MANUAL_LISTS.set(previous, (MANUAL_LISTS.get(previous) ?? []).filter(value => value !== node));
      touched.add(manualRoot(previous));
    }
    MANUAL_OWNERS.set(node, slot);
  }
  MANUAL_LISTS.set(slot, unique);
  for (const root of touched) refreshManual(root);
}

function flattenManual(slot, seen = new Set()) {
  if (seen.has(slot)) return [];
  seen.add(slot);
  const assigned = slot._assignedNodes.length ? slot._assignedNodes : domSymbolTree.childrenToArray(slot).filter(node => node.nodeType === 1 || node.nodeType === 3);
  return assigned.flatMap(node => {
    if (node.localName !== 'slot' || !isShadowRoot(node.getRootNode({}))) return [wrapperForImpl(node)];
    const root = manualRoot(node);
    if (root) { refreshManual(root); return flattenManual(node, seen); }
    return node.assignedNodes({ flatten: true });
  });
}

function patchManualSlots() {
  const insert = NodeImpl.prototype._insert;
  const remove = NodeImpl.prototype._remove;
  for (const [method, original] of [['_insert', insert], ['_remove', remove]]) NodeImpl.prototype[method] = function (...args) {
    const root = manualRoot(this) ?? (flags(this._shadowRoot).slotAssignment === 'manual' ? this._shadowRoot : null);
    const fallback = root && this.localName === 'slot' && !this._assignedNodes.length;
    const removedLightNode = method === '_remove' && root?.host === this ? args[0] : null;
    const result = original.apply(this, args);
    if (removedLightNode && removedLightNode.parentNode !== this) removedLightNode._assignedSlot = null;
    if (fallback) markSlotChange(root, this);
    refreshManual(root);
    return result;
  };
  const attribute = ElementImpl.prototype._attrModifiedSlotableMixin;
  ElementImpl.prototype._attrModifiedSlotableMixin = function (...args) {
    const result = attribute.apply(this, args); refreshManual(lightManualRoot(this)); return result;
  };
  const slotAttribute = SlotImpl.prototype._attrModified;
  SlotImpl.prototype._attrModified = function (...args) {
    const result = slotAttribute.apply(this, args); refreshManual(manualRoot(this)); return result;
  };
  for (const implementation of [ElementImpl, TextImpl]) {
    const descriptor = Object.getOwnPropertyDescriptor(implementation.prototype, 'assignedSlot');
    Object.defineProperty(implementation.prototype, 'assignedSlot', { ...descriptor, get() {
      const root = lightManualRoot(this);
      if (!root) return descriptor.get.call(this);
      refreshManual(root);
      return root.mode === 'open' ? this._assignedSlot : null;
    } });
  }
  const assignedNodes = SlotImpl.prototype.assignedNodes;
  SlotImpl.prototype.assignedNodes = function (options) {
    const root = manualRoot(this);
    if (!root) return assignedNodes.call(this, options);
    refreshManual(root);
    return options?.flatten ? flattenManual(this) : this._assignedNodes.map(wrapperForImpl);
  };
  const assignedElements = SlotImpl.prototype.assignedElements;
  SlotImpl.prototype.assignedElements = function (options) {
    return manualRoot(this) ? this.assignedNodes(options).filter(node => node.nodeType === 1) : assignedElements.call(this, options);
  };
  const dispatch = EventTargetImpl.prototype._dispatch;
  EventTargetImpl.prototype._dispatch = function (...args) {
    if (args[0]?.type === 'slotchange' && args[0].isTrusted && DISPOSED_DOCUMENTS.has(this._ownerDocument)) return true;
    if (this.nodeType) { refreshManual(lightManualRoot(this)); refreshManual(manualRoot(this)); }
    return dispatch.apply(this, args);
  };
}

function attach(host, options, declarative = false) {
  const root = host.attachShadow(options);
  ROOTS.set(root, { serializable: Boolean(options.serializable), clonable: Boolean(options.clonable),
    delegatesFocus: Boolean(options.delegatesFocus), slotAssignment: options.slotAssignment ?? 'named', declarative });
  return root;
}

function rootOptions(template) {
  const mode = template.getAttributeNS(null, 'shadowrootmode')?.toLowerCase();
  if (mode !== 'open' && mode !== 'closed') return null;
  return { mode, delegatesFocus: template.hasAttributeNS(null, 'shadowrootdelegatesfocus'),
    serializable: template.hasAttributeNS(null, 'shadowrootserializable'),
    clonable: template.hasAttributeNS(null, 'shadowrootclonable') };
}

function declarativeAdapter(adapter, record, document = record?.documentImpl, inert = false) {
  const append = adapter.appendChild;
  adapter.appendChild = function (parent, child) {
    if (active(record) && child.nodeType === 1 && child.namespaceURI === HTML && child.localName === 'template') {
      const host = parent;
      const options = rootOptions(child);
      if (options && host?.nodeType === 1 && host._ownerDocument === document && !host._shadowRoot) {
        try {
          const root = attach(host, options, true);
          // parse5 now inserts template children directly into the real root.
          // The consumed template never appears in the host's light DOM.
          child._templateContents = root;
          return;
        } catch (error) {
          if (error.name !== 'NotSupportedError') throw error;
        }
      }
    }
    const result = append.call(this, parent, child);
    if (!inert && active(record) && child.localName === 'script' && child._parserInserted && child.isConnected && isShadowRoot(child.getRootNode({}))) {
      // The real document parser executes scripts in declarative shadow trees.
      // Mark this script attached for its existing parser-pop evaluation hook;
      // attaching every shadow descendant would also register private IDs and
      // stylesheets in jsdom's document-wide caches.
      child._attached = true;
    }
    return result;
  };
  return adapter;
}

function selectedRoots(window, options) {
  if (options === null || options === undefined) options = {};
  if (!['object', 'function'].includes(typeof options)) throw new window.TypeError('getHTML options must be a dictionary');
  const explicit = new Set();
  if (options.shadowRoots !== undefined) {
    if (options.shadowRoots == null || typeof options.shadowRoots[Symbol.iterator] !== 'function') throw new window.TypeError('shadowRoots must be an iterable of ShadowRoot objects');
    for (const root of options.shadowRoots) {
      if (!ShadowRootInterface.is(root)) throw new window.TypeError('shadowRoots must contain ShadowRoot objects');
      explicit.add(implForWrapper(root));
    }
  }
  return { explicit, serializable: Boolean(options.serializableShadowRoots) };
}

function templateNode(root) {
  const state = flags(root);
  const attributes = [{ name: 'shadowrootmode', value: root.mode }];
  for (const [attribute, value] of [['shadowrootdelegatesfocus', state.delegatesFocus], ['shadowrootserializable', state.serializable], ['shadowrootclonable', state.clonable]]) {
    if (value) attributes.push({ name: attribute, value: '' });
  }
  return { nodeType: 1, namespaceURI: HTML, _qualifiedName: 'template', _attributeList: attributes, _templateContents: root };
}

function serialize(receiver, options, window) {
  const { explicit, serializable } = selectedRoots(window, options);
  const adapter = Object.create(serializationAdapter);
  adapter.getChildNodes = node => {
    const children = serializationAdapter.getChildNodes(node);
    const root = node._shadowRoot;
    if (root && (explicit.has(root) || (serializable && flags(root).serializable))) return [templateNode(root), ...children];
    return children;
  };
  return parse5.serialize(implForWrapper(receiver), { treeAdapter: adapter });
}

function setUnsafe(receiver, markup, options, window, filter) {
  if (options != null && options.sanitizer !== undefined) throw new window.DOMException('HTML sanitizer options are not implemented', 'NotSupportedError');
  markup = String(markup);
  const implementation = implForWrapper(receiver);
  const record = recordFor(implementation._ownerDocument) ?? (filter !== undefined ? recordFor(implForWrapper(implementation._globalObject._document)) : null);
  if (!record) throw new window.DOMException('The document is not registered for shadow parsing', 'InvalidStateError');
  const context = ShadowRootInterface.is(receiver) ? implementation.host : implementation;
  const target = implementation.localName === 'template' && implementation.namespaceURI === HTML ? implementation._templateContents : implementation;
  ceReactionsPreSteps(window);
  try {
    // Consume this permit at exactly one parser entry. Nested innerHTML calls
    // from custom-element constructors retain their ordinary inert semantics.
    FORCED_FRAGMENTS.set(context, { record, document:implementation._ownerDocument });
    let fragment;
    try { fragment = htmlParser.parseFragment(markup, context); }
    finally { FORCED_FRAGMENTS.delete(context); }
    if(filter)filter(fragment);
    target._replaceAll(fragment);
  } finally { ceReactionsPostSteps(window); }
}

function patchHosts() {
  if (patched) return;
  patched = true;
  patchManualSlots();
  const convert = ShadowRootInit.convert;
  ShadowRootInit.convert = function (window, value, options) {
    const result = convert(window, value, options);
    if (!recordFor(implForWrapper(window.document))) return result;
    result.serializable = Boolean(value?.serializable);
    result.clonable = Boolean(value?.clonable);
    result.delegatesFocus = Boolean(value?.delegatesFocus);
    result.slotAssignment = value?.slotAssignment === undefined ? 'named' : String(value.slotAssignment);
    if (!['named', 'manual'].includes(result.slotAssignment)) throw new window.TypeError('Invalid slotAssignment');
    return result;
  };
  const originalAttach = ElementImpl.prototype.attachShadow;
  ElementImpl.prototype.attachShadow = function (options) {
    if (!recordFor(this._ownerDocument)) return originalAttach.call(this, options);
    const existing = this._shadowRoot;
    if (existing && flags(existing).declarative) {
      if (existing.mode !== options.mode) throw new this._globalObject.DOMException('Declarative shadow root mode does not match', 'NotSupportedError');
      existing._replaceAll(null);
      ROOTS.set(existing, { ...flags(existing), declarative: false });
      return existing;
    }
    const root = originalAttach.call(this, options);
    ROOTS.set(root, { ...defaults(), serializable: Boolean(options.serializable), clonable: Boolean(options.clonable),
      delegatesFocus: Boolean(options.delegatesFocus), slotAssignment: options.slotAssignment ?? 'named' });
    return root;
  };
  const originalCloning = ElementImpl.prototype[cloningSteps];
  ElementImpl.prototype[cloningSteps] = function (copy, source, document, deep) {
    originalCloning?.call(this, copy, source, document, deep);
    const root = source._shadowRoot;
    if (!root || !flags(root).clonable) return;
    const state = flags(root);
    const clone = originalAttach.call(copy, { mode: root.mode });
    ROOTS.set(clone, { serializable: state.serializable, clonable: state.clonable,
      delegatesFocus: state.delegatesFocus, slotAssignment: state.slotAssignment, declarative: state.declarative });
    for (const child of domSymbolTree.childrenToArray(root)) clone._append(nodeHelpers.clone(child, document, true));
  };
  const parseDocument = parse5.parse;
  parse5.parse = function (markup, options) {
    const document=options?.treeAdapter?._documentImpl,permit=FORCED_DOCUMENTS.get(document);if(permit)FORCED_DOCUMENTS.delete(document);
    const record = permit?.record ?? recordFor(document);
    if (record) declarativeAdapter(options.treeAdapter, record, document, Boolean(permit?.inert));
    return parseDocument.call(this, markup, options);
  };
  const parseFragment = parse5.parseFragment;
  parse5.parseFragment = function (context, markup, options) {
    const permit = context && FORCED_FRAGMENTS.get(context);
    if (permit) {
      FORCED_FRAGMENTS.delete(context);
      declarativeAdapter(options.treeAdapter, permit.record, permit.document ?? permit.record?.documentImpl);
      if (permit.executeScripts) {
        const pop = options.treeAdapter.onItemPop;
        options.treeAdapter.onItemPop = function (node, ...args) {
          const script = node.localName === 'script' && node.namespaceURI === HTML && node._parserInserted;
          const attached = node._attached;
          // Written scripts are prepared during the real fragment parse, before
          // its live-DOM splice. isConnected still reflects the detached tree.
          if (script) node._attached = true;
          try { return pop.call(this, node, ...args); }
          finally { if (script) node._attached = attached || node.isConnected; }
        };
      }
    }
    return parseFragment.call(this, context, markup, options);
  };
  const originalFocus = HTMLElementImpl.prototype.focus;
  HTMLElementImpl.prototype.focus = function () {
    const root = this._shadowRoot;
    if (root && flags(root).delegatesFocus && recordFor(this._ownerDocument)) {
      const candidates = wrapperForImpl(root).querySelectorAll('*');
      for (const candidate of candidates) {
        const target = implForWrapper(candidate);
        if (focusing.isFocusableAreaElement(target)) { target.focus(); return; }
      }
    }
    return originalFocus.call(this);
  };
}

function installProperties(window) {
  const rootPrototype = window.ShadowRoot.prototype;
  for (const name of ['serializable', 'clonable', 'delegatesFocus', 'slotAssignment']) {
    if (name in rootPrototype) continue;
    Object.defineProperty(rootPrototype, name, { configurable: true, enumerable: true, get() {
      if (!ShadowRootInterface.is(this)) throw new window.TypeError('Illegal invocation');
      return flags(implForWrapper(this))[name];
    } });
  }
  const member=captureIDLMemberFactory(window);
  for (const Constructor of [window.Element, window.ShadowRoot]) {
    const getHTML=function getHTML(options = {}) {
      if (!(Constructor === window.Element ? ElementInterface.is(this) : ShadowRootInterface.is(this))) throw new window.TypeError('Illegal invocation');
      return serialize(this, options, window);
    };
    Object.defineProperty(Constructor.prototype, 'getHTML', { configurable: true, enumerable: true, writable: true,
      value: Constructor===window.Element?member('getHTML','value',getHTML):getHTML });
    Object.defineProperty(Constructor.prototype, 'setHTMLUnsafe', { configurable: true, enumerable: true, writable: true,
      value: function setHTMLUnsafe(markup, options = {}) {
        if (!(Constructor === window.Element ? ElementInterface.is(this) : ShadowRootInterface.is(this))) throw new window.TypeError('Illegal invocation');
        if (!arguments.length) throw new window.TypeError('setHTMLUnsafe requires markup');
        return setUnsafe(this, markup, options, window);
      } });
  }
  const prototype = window.HTMLTemplateElement.prototype;
  Object.defineProperty(prototype, 'shadowRootMode', { configurable: true, enumerable: true,
    get() { const value = this.getAttribute('shadowrootmode')?.toLowerCase(); return ['open', 'closed'].includes(value) ? value : ''; },
    set(value) { this.setAttribute('shadowrootmode', value); } });
  for (const suffix of ['DelegatesFocus', 'Clonable', 'Serializable']) Object.defineProperty(prototype, `shadowRoot${suffix}`, {
    configurable: true, enumerable: true,
    get() { return this.hasAttribute(`shadowroot${suffix.toLowerCase()}`); },
    set(value) { this.toggleAttribute(`shadowroot${suffix.toLowerCase()}`, Boolean(value)); },
  });
  if (!('assign' in window.HTMLSlotElement.prototype)) Object.defineProperty(window.HTMLSlotElement.prototype, 'assign', {
    configurable: true, enumerable: true, writable: true, value: function assign(...nodes) {
      if (!SlotInterface.is(this)) throw new window.TypeError('Illegal invocation');
      if (nodes.some(node => !ElementInterface.is(node) && !TextInterface.is(node))) throw new window.TypeError('Slot assignments require Element or Text nodes');
      assignManual(implForWrapper(this), nodes.map(implForWrapper));
    },
  });
  if (!('adoptedStyleSheets' in rootPrototype)) Object.defineProperty(rootPrototype, 'adoptedStyleSheets', {
    configurable: true, enumerable: true,
    get() { throw new window.DOMException('Shadow stylesheet adoption is not implemented', 'NotSupportedError'); },
    set() { throw new window.DOMException('Shadow stylesheet adoption is not implemented', 'NotSupportedError'); },
  });
}

export function installShadowDOM(page, window) {
  if (!page || !window?.document) throw new TypeError('Shadow DOM requires a Page and document window');
  patchHosts(); installProperties(window);
  const document = window.document;
  const documentImpl = implForWrapper(document);
  const existing = DOCUMENTS.get(documentImpl);
  if (existing?.page === page && !existing.disposed) return existing.controller;
  existing?.controller.dispose();
  const record = { page, window, document, documentImpl, signal: page.documentAbort?.signal, disposed: false, originalClose: window.close };
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true; DOCUMENTS.delete(documentImpl); DISPOSED_DOCUMENTS.add(documentImpl);
    for (let index = signalSlotList.length - 1; index >= 0; index--) {
      if (signalSlotList[index]._ownerDocument === documentImpl) signalSlotList.splice(index, 1);
    }
    record.signal?.removeEventListener('abort', dispose); page.off?.('close', dispose);
    if (window.close === record.close) window.close = record.originalClose;
  };
  record.controller = { dispose };
  if (record.signal?.aborted || page.closed) { record.disposed = true; return record.controller; }
  DISPOSED_DOCUMENTS.delete(documentImpl);
  DOCUMENTS.set(documentImpl, record);
  record.close = function () { dispose(); return record.originalClose.call(window); };
  window.close = record.close;
  record.signal?.addEventListener('abort', dispose, { once: true }); page.once?.('close', dispose);
  return record.controller;
}

// Scope one actual fragment-parser entry. Nested ordinary innerHTML parsing
// remains inert after the permit is consumed, as with setHTMLUnsafe.
export function parseDocumentWriteFragment(document, markup) {
  patchHosts();
  const context = document.createElement('div');
  FORCED_FRAGMENTS.set(context, { record: recordFor(document), executeScripts: true });
  try { return htmlParser.parseFragment(markup, context); }
  finally { FORCED_FRAGMENTS.delete(context); }
}

// Trusted sanitizer pipeline filters genuine parsed nodes before the one live replacement.
export function replaceSanitizerHTML(node,markup,filter){const record=recordFor(node._ownerDocument)??recordFor(implForWrapper(node._globalObject._document));if(!record)throw new node._globalObject.DOMException("The document is not registered for shadow parsing","InvalidStateError");return setUnsafe(wrapperForImpl(node),markup,undefined,record.window,filter);}

// One trusted inert-document parser entry may form real declarative roots using
// its active allocating realm, without substituting the realm document itself.
export function parseSanitizerDocument(document,markup,owner){patchHosts();const record=recordFor(owner);if(record)FORCED_DOCUMENTS.set(document,{record,inert:true});try{return htmlParser.parseIntoDocument(markup,document)}finally{FORCED_DOCUMENTS.delete(document)}}
