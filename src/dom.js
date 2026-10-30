import {canonicalUtilityValue} from './isolated-world.js';
import {wrapUtilityDOMNode} from './world-sessions.js';
import { randomUUID } from 'node:crypto';
import { createInternalMutationObserver } from './mutations.js';

const methods = new Set([
  'DOM.enable', 'DOM.disable', 'DOM.getDocument', 'DOM.describeNode',
  'DOM.querySelector', 'DOM.querySelectorAll', 'DOM.resolveNode', 'DOM.requestNode',
  'DOM.requestChildNodes', 'DOM.getOuterHTML', 'DOM.focus',
  'DOM.performSearch', 'DOM.getSearchResults', 'DOM.discardSearchResults',
  'DOM.getAttributes', 'DOM.setAttributeValue', 'DOM.removeAttribute',
  'DOM.setNodeValue', 'DOM.setOuterHTML', 'DOM.removeNode',
  'DOM.getContentQuads', 'DOM.getBoxModel', 'DOM.scrollIntoViewIfNeeded',
  'DOM.getFrameOwner',
]);
const states = new WeakMap();

export const supportsDOM = method => methods.has(method);

function error(message, code = -32602) {
  return Object.assign(new Error(message), { code });
}

export function resetDOM(session) {
  states.get(session)?.observer?.disconnect();
  states.delete(session);
}

function stateFor(session) {
  const document = session.page.dom.window.document;
  let state = states.get(session);
  if (state?.document !== document) {
    resetDOM(session);
    state = { document, known: new Set(), expanded: new Set(), searches: new Map(), includeWhitespace: false };
    states.set(session, state);
  }
  return state;
}

function isNode(session, value) {
  if (!value) return false;
  try { return session.page.dom.window.Node.prototype.isSameNode.call(value, value); }
  catch { return false; }
}

function nodeFor(session, params, identifiers = ['nodeId', 'backendNodeId', 'objectId']) {
  const provided = identifiers.filter(key => params[key] !== undefined);
  if (provided.length !== 1) throw error('Exactly one node identifier is required');
  const key = provided[0];
  let node;
  if (key === 'objectId') {
    if (typeof params.objectId !== 'string') throw error('Invalid object identifier');
    node = canonicalUtilityValue(session.object(params.objectId));
  } else {
    if (!Number.isInteger(params[key]) || params[key] <= 0) throw error('Invalid DOM node identifier');
    node = session.nodes?.get(params[key]);
  }
  if (!isNode(session, node)) throw error('Unknown DOM node');
  return node;
}

function string(value, name) {
  if (typeof value !== 'string') throw error(`${name} must be a string`);
  return value;
}

function depthFor(value, allowZero = true) {
  const depth = value ?? 1;
  if (!Number.isInteger(depth) || depth < -1 || (!allowZero && depth === 0)) {
    throw error('Depth must be -1 or a non-negative integer');
  }
  return depth;
}

function childrenFor(state, node) {
  return [...node.childNodes].filter(child => state.includeWhitespace || child.nodeType !== 3 || /\S/.test(child.data));
}

function serialize(session, state, node, depth = 0, pierce = false, budget = { remaining: 100000 }) {
  if (--budget.remaining < 0) throw error('DOM tree exceeds the 100000-node response budget', -32000);
  const id = session.backendId(node);
  state.known.add(node);
  const result = {
    nodeId: id, backendNodeId: id, nodeType: node.nodeType, nodeName: node.nodeName,
    localName: node.localName ?? '', nodeValue: node.nodeValue ?? '',
  };
  if (node.parentNode && state.known.has(node.parentNode)) result.parentId = session.backendId(node.parentNode);
  if ([1, 9, 11].includes(node.nodeType)) {
    const children = childrenFor(state, node);
    result.childNodeCount = children.length;
    if (depth !== 0) {
      state.expanded.add(node);
      result.children = children.map(child => serialize(session, state, child, depth === -1 ? -1 : depth - 1, pierce, budget));
    }
  }
  if (node.nodeType === 1) {
    result.attributes = [...node.attributes].flatMap(attribute => [attribute.name, attribute.value]);
    const frame = session.page.frames?.findElement(node);
    if (frame) result.frameId = frame.frameId;
    if (node.namespaceURI === 'http://www.w3.org/2000/svg') result.isSVG = true;
    if (pierce && node.shadowRoot) result.shadowRoots = [serialize(session, state, node.shadowRoot, depth === -1 ? -1 : Math.max(0, depth - 1), pierce, budget)];
    if (pierce && node.contentDocument) result.contentDocument = serialize(session, state, node.contentDocument, depth === -1 ? -1 : Math.max(0, depth - 1), pierce, budget);
    if (node.localName === 'template') result.templateContent = serialize(session, state, node.content, depth === -1 ? -1 : Math.max(0, depth - 1), pierce, budget);
  } else if (node.nodeType === 9) {
    result.documentURL = node.URL;
    result.baseURL = node.baseURI;
    result.compatibilityMode = node.compatMode === 'BackCompat' ? 'QuirksMode' : 'NoQuirksMode';
  } else if (node.nodeType === 10) {
    result.publicId = node.publicId;
    result.systemId = node.systemId;
  } else if (node.nodeType === 2) {
    result.name = node.name;
    result.value = node.value;
  }
  if (node.nodeType === 11 && node.host) result.shadowRootType = node.mode;
  return result;
}

function enable(session, state) {
  session.domains?.add('DOM');
  if (state.observer) return;
  state.observer = createInternalMutationObserver(session.page.dom.window, records => {
    for (const record of records) {
      if (!state.known.has(record.target)) continue;
      const id = session.backendId(record.target);
      if (record.type === 'attributes') {
        const value = record.target.getAttribute(record.attributeName);
        session.event(value === null ? 'DOM.attributeRemoved' : 'DOM.attributeModified', {
          nodeId: id, name: record.attributeName, ...(value === null ? {} : { value }),
        });
      } else if (record.type === 'characterData') {
        session.event('DOM.characterDataModified', { nodeId: id, characterData: record.target.data });
      } else if (record.type === 'childList') {
        if (!state.expanded.has(record.target)) {
          session.event('DOM.childNodeCountUpdated', { nodeId: id, childNodeCount: childrenFor(state, record.target).length });
          continue;
        }
        for (const node of record.removedNodes) {
          if (state.known.has(node)) session.event('DOM.childNodeRemoved', { parentNodeId: id, nodeId: session.backendId(node) });
        }
        for (const node of record.addedNodes) {
          if (!state.includeWhitespace && node.nodeType === 3 && !/\S/.test(node.data)) continue;
          let previous = node.previousSibling;
          while (previous && !state.known.has(previous)) previous = previous.previousSibling;
          session.event('DOM.childNodeInserted', {
            parentNodeId: id, previousNodeId: previous ? session.backendId(previous) : 0,
            node: serialize(session, state, node),
          });
        }
      }
    }
  });
  state.observer.observe(state.document, { attributes: true, characterData: true, childList: true, subtree: true });
}

function reveal(session, state, node) {
  const path = [];
  for (let current = node; current; current = current.parentNode) path.push(current);
  path.reverse();
  for (let index = 0; index < path.length; index++) {
    const current = path[index];
    if (!state.known.has(current)) serialize(session, state, current);
    if (index === path.length - 1 || state.expanded.has(current)) continue;
    state.expanded.add(current);
    session.event('DOM.setChildNodes', {
      parentId: session.backendId(current), nodes: childrenFor(state, current).map(child => serialize(session, state, child)),
    });
  }
  return session.backendId(node);
}

function outerHTML(session, node) {
  if (node === session.page.dom.window.document) return session.page.dom.serialize();
  if (typeof node.outerHTML === 'string') return node.outerHTML;
  if (node.nodeType === 9 || node.nodeType === 11) return [...node.childNodes].map(child => outerHTML(session, child)).join('');
  return new session.page.dom.window.XMLSerializer().serializeToString(node);
}

function elementFor(session, params) {
  const node = nodeFor(session, params);
  if (node.nodeType !== 1) throw error('DOM node is not an element');
  return node;
}

function search(state, query) {
  // The reference's performSearch accepts selectors and XPath; an invalid query
  // returns no matches. querySelector/All keep their stricter selector errors.
  try {
    if (query.startsWith('/') || query.startsWith('(')) {
      const result = state.document.evaluate(query, state.document, null, 7, null);
      return Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index));
    }
    return [...state.document.querySelectorAll(query)];
  } catch { return []; }
}

export function runDOM(session, method, params = {}) {
  try {
    if (!supportsDOM(method)) throw error(`Unsupported CDP method: ${method}`, -32601);
    const state = stateFor(session);
    switch (method) {
      case 'DOM.enable':
        if (params.includeWhitespace !== undefined && !['none', 'all'].includes(params.includeWhitespace)) throw error('Invalid whitespace mode');
        state.includeWhitespace = params.includeWhitespace === 'all';
        enable(session, state); return {};
      case 'DOM.disable': session.domains?.delete('DOM'); resetDOM(session); return {};
      case 'DOM.getDocument':
        enable(session, state);
        return { root: serialize(session, state, state.document, depthFor(params.depth), !!params.pierce) };
      case 'DOM.describeNode': return { node: serialize(session, state, nodeFor(session, params), depthFor(params.depth), !!params.pierce) };
      case 'DOM.querySelector':
      case 'DOM.querySelectorAll': {
        const root = nodeFor(session, params, ['nodeId']);
        const selector = string(params.selector, 'Selector');
        if (typeof root.querySelectorAll !== 'function') throw error('DOM node does not support selectors');
        if (method === 'DOM.querySelectorAll') return { nodeIds: [...root.querySelectorAll(selector)].map(node => reveal(session, state, node)) };
        const node = root.querySelector(selector);
        return { nodeId: node ? reveal(session, state, node) : 0 };
      }
      case 'DOM.resolveNode': {
        let page = session.page;
        if (params.executionContextId !== undefined) {
          if (session.executionPage) page = session.executionPage(params.executionContextId);
          else if (params.executionContextId !== session.page.executionContextId && ![...(session.worlds?.values() ?? [])].includes(params.executionContextId)) throw error('Cannot find context with specified id');
        }
        const node = nodeFor(session, params, ['nodeId', 'backendNodeId']);
        if (params.executionContextId !== undefined && (node.ownerDocument ?? node) !== canonicalUtilityValue(page.dom.window.document)) throw error('Node belongs to a different frame');
        return { object: session.remote(wrapUtilityDOMNode(session,node,params.executionContextId), false, params.objectGroup, params.executionContextId) };
      }
      case 'DOM.getFrameOwner': {
        const frame = session.page.frames?.findFrame(params.frameId);
        const node = frame?.dom.window.frameElement;
        if (!node) throw error('Frame has no owner element');
        return { backendNodeId: session.backendId(node), nodeId: reveal(session, state, node) };
      }
      case 'DOM.requestNode': return { nodeId: reveal(session, state, nodeFor(session, params, ['objectId'])) };
      case 'DOM.requestChildNodes': {
        const node = nodeFor(session, params, ['nodeId']);
        const depth = depthFor(params.depth, false);
        state.known.add(node); state.expanded.add(node);
        session.event('DOM.setChildNodes', {
          parentId: session.backendId(node),
          nodes: childrenFor(state, node).map(child => serialize(session, state, child, depth === -1 ? -1 : depth - 1, !!params.pierce)),
        });
        return {};
      }
      case 'DOM.getOuterHTML':
        if (params.includeShadowDOM) throw error('Shadow DOM HTML serialization is not implemented', -32601);
        return { outerHTML: outerHTML(session, nodeFor(session, params)) };
      case 'DOM.focus': {
        const node = elementFor(session, params);
        if (typeof node.focus !== 'function') throw error('Element cannot be focused');
        node.focus();
        if (node.ownerDocument.activeElement !== node && node.getRootNode().activeElement !== node) throw error('Element cannot be focused');
        return {};
      }
      case 'DOM.getContentQuads': return { quads: session.page.layout.quads(nodeFor(session, params)) };
      case 'DOM.getBoxModel': return { model: session.page.layout.boxModel(nodeFor(session, params)) };
      case 'DOM.scrollIntoViewIfNeeded': {
        const node = nodeFor(session, params);
        if (!node.isConnected) throw error('Node is detached from document');
        const region = params.rect;
        if (region && !['x', 'y', 'width', 'height'].every(key => Number.isFinite(region[key]))) throw error('Invalid scroll rectangle');
        session.page.layout.scrollIntoView(node, region);
        return {};
      }
      case 'DOM.performSearch': {
        const nodes = search(state, string(params.query, 'Search query'));
        const searchId = randomUUID(); state.searches.set(searchId, nodes);
        return { searchId, resultCount: nodes.length };
      }
      case 'DOM.getSearchResults': {
        const nodes = state.searches.get(params.searchId);
        if (!nodes) throw error('Unknown search identifier');
        if (!Number.isInteger(params.fromIndex) || !Number.isInteger(params.toIndex) || params.fromIndex < 0 ||
            params.toIndex < params.fromIndex || params.toIndex > nodes.length) throw error('Invalid search result range');
        return { nodeIds: nodes.slice(params.fromIndex, params.toIndex).map(node => reveal(session, state, node)) };
      }
      case 'DOM.discardSearchResults':
        if (!state.searches.delete(params.searchId)) throw error('Unknown search identifier');
        return {};
      case 'DOM.getAttributes': return { attributes: [...elementFor(session, params).attributes].flatMap(attribute => [attribute.name, attribute.value]) };
      case 'DOM.setAttributeValue': {
        const node = elementFor(session, params);
        node.setAttribute(string(params.name, 'Attribute name'), string(params.value, 'Attribute value')); return {};
      }
      case 'DOM.removeAttribute': elementFor(session, params).removeAttribute(string(params.name, 'Attribute name')); return {};
      case 'DOM.setNodeValue': {
        const node = nodeFor(session, params);
        if (node.nodeValue === null) throw error('DOM node does not have a text value');
        node.nodeValue = string(params.value, 'Node value'); return {};
      }
      case 'DOM.setOuterHTML': {
        const node = elementFor(session, params);
        if (!node.parentNode) throw error('Cannot replace a detached element');
        node.outerHTML = string(params.outerHTML, 'Outer HTML'); return {};
      }
      case 'DOM.removeNode': {
        const node = nodeFor(session, params);
        if (!node.parentNode) throw error('Cannot remove a detached node');
        node.parentNode.removeChild(node); return {};
      }
    }
  } catch (cause) {
    if (typeof cause.code === 'number' && cause.code < 0) throw cause;
    throw error(cause.message ?? String(cause));
  }
}
