// Independent HTML emission from real nodes. XML-mode serialization stays with
// its existing namespace-aware serializer; no finished markup is rewritten.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const adapter = require('jsdom/lib/jsdom/living/domparsing/parse5-adapter-serialization.js');
const XMLSerializerImpl = require('jsdom/lib/jsdom/living/domparsing/XMLSerializer-impl.js').implementation;
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/living/domparsing/serialization.js'));
const parse5Require = createRequire(jsdomRequire.resolve('parse5'));
const serializer = parse5Require('./serializer/index.js');
const windows = new WeakMap();
const HTML = 'http://www.w3.org/1999/xhtml';
const voids = new Set(['area', 'base', 'basefont', 'bgsound', 'link', 'meta', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'param', 'source', 'track', 'wbr']);
const rawText = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
// Native public controls recognize this subset even on a different element tag.
const booleans = new Set(['async', 'autofocus', 'autoplay', 'checked', 'controls', 'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'ismap', 'loop', 'multiple', 'muted', 'novalidate', 'open', 'readonly', 'required', 'reversed', 'selected']);
const entities = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\u00a0': '&nbsp;' };
let patched = false;

export function escapeHTMLAttribute(value) { return value.replace(/[&"<>\u00a0]/g, character => entities[character]); }
function escapeText(value) { return value.replace(/[&<>\u00a0]/g, character => entities[character]); }
function implementation(node) { return implForWrapper(node) ?? node; }
function active(record) { return record && !record.disposed && !record.signal?.aborted && !record.page.closed && record.window.document === record.document; }
function owner(node) {
  const document = node.nodeType === 9 ? node : node._ownerDocument;
  if (!document || document._parsingMode !== 'html') return null;
  const record = windows.get(document._globalObject);
  return active(record) ? record : null;
}

function attributeName(attribute) {
  const name = attribute.name;
  if (attribute.prefix && !name.startsWith(`${attribute.prefix}:`)) return `${attribute.prefix}:${name}`;
  return name;
}

/** HTML fragment/document serialization. Custom adapters include real shadow selections. */
export function serializeHTML(node, { outer = true, treeAdapter = adapter, scriptingEnabled = true } = {}) {
  const root = implementation(node);
  const children = current => {
    const template = treeAdapter.isElementNode(current) && treeAdapter.getNamespaceURI(current) === HTML && treeAdapter.getTagName(current) === 'template';
    return treeAdapter.getChildNodes(template ? treeAdapter.getTemplateContent(current) : current);
  };
  const context = current => current && treeAdapter.isElementNode(current) ? {
    tag: treeAdapter.getTagName(current), namespace: treeAdapter.getNamespaceURI(current),
  } : null;
  const text = (current, parent) => {
    const contents = treeAdapter.getTextNodeContent(current);
    return parent?.namespace === HTML && (rawText.has(parent.tag) || parent.tag === 'noscript' && scriptingEnabled) ? contents : escapeText(contents);
  };
  const emit = (current, parent) => {
    if (treeAdapter.isTextNode(current)) return text(current, parent);
    if (treeAdapter.isCommentNode(current)) return `<!--${treeAdapter.getCommentNodeContent(current)}-->`;
    if (treeAdapter.isDocumentTypeNode(current)) {
      const name = treeAdapter.getDocumentTypeNodeName(current), publicId = treeAdapter.getDocumentTypeNodePublicId(current), systemId = treeAdapter.getDocumentTypeNodeSystemId(current);
      return `<!DOCTYPE ${name}${publicId ? ` PUBLIC "${publicId}"` : systemId ? ' SYSTEM' : ''}${systemId ? ` "${systemId}"` : ''}>`;
    }
    if (!treeAdapter.isElementNode(current)) return children(current).map(child => emit(child, null) + (current.nodeType === 9 && treeAdapter.isDocumentTypeNode(child) ? '\n' : '')).join('');
    const own = context(current), attributes = treeAdapter.getAttrList(current).map(attribute => {
      const name = attributeName(attribute), value = attribute.value;
      return ` ${name}${value === '' && booleans.has(name.toLowerCase()) ? '' : `="${escapeHTMLAttribute(value)}"`}`;
    }).join('');
    const opening = `<${own.tag}${attributes}>`;
    if (own.namespace === HTML && voids.has(own.tag)) return opening;
    return opening + children(current).map(child => emit(child, own)).join('') + `</${own.tag}>`;
  };
  if (outer || !treeAdapter.isElementNode(root)) return emit(root, context(treeAdapter.getParentNode(root)));
  const own = context(root);
  if (own.namespace === HTML && voids.has(own.tag)) return '';
  return children(root).map(child => emit(child, own)).join('');
}

function patch() {
  if (patched) return;
  patched = true;
  for (const [name, outer] of [['serialize', false], ['serializeOuter', true]]) {
    const original = serializer[name];
    serializer[name] = function (node, options = {}) {
      return owner(node) ? serializeHTML(node, { ...options, outer }) : original.call(this, node, options);
    };
  }
  const original = XMLSerializerImpl.prototype.serializeToString;
  XMLSerializerImpl.prototype.serializeToString = function (root) {
    if (owner(root) && [1, 3, 8, 9, 10, 11].includes(root.nodeType)) return serializeHTML(root);
    return original.call(this, root);
  };
}

export function installSerialization(page, window) {
  const previous = windows.get(window);
  if (active(previous)) return previous.controller;
  patch();
  const record = { page, window, document: window.document, signal: page.documentAbort?.signal, disposed: false };
  windows.set(window, record); windows.set(implForWrapper(window)._globalObject, record);
  const originalClose = window.close;
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true; record.signal?.removeEventListener('abort', dispose);
    if (window.close === close) window.close = originalClose;
  };
  function close(...args) { dispose(); return Reflect.apply(originalClose, this, args); }
  window.close = close;
  record.controller = Object.freeze({ dispose });
  record.signal?.addEventListener('abort', dispose, { once: true });
  return record.controller;
}
