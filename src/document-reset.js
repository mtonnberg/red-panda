// Post-load Document resets preserve the existing Window and JavaScript realm.
import { createRequire } from 'node:module';
import { createWriteParser } from './write-created-parser.js';
import { installListenerOwnership } from './listener-ownership.js';
const require = createRequire(import.meta.url);
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const DocumentImpl = require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const ResourceQueue = require('jsdom/lib/jsdom/browser/resources/resource-queue.js');
const AsyncResourceQueue = require('jsdom/lib/jsdom/browser/resources/async-resource-queue.js');
const RequestManager = require('jsdom/lib/jsdom/browser/resources/request-manager.js');
const PerDocumentResourceLoader = require('jsdom/lib/jsdom/browser/resources/per-document-resource-loader.js');
const { fireAnEvent } = require('jsdom/lib/jsdom/living/helpers/events.js');
const contexts = new WeakMap();
let patched = false, underlyingOpen;
function active(context) {
  return !context.disposed && !context.page.closed && !context.record.signal?.aborted &&
    implForWrapper(context.window.document) === context.document;
}
function eligible(context) {
  return context && active(context) && context.loaded &&
    (context.document.readyState === 'complete' || context.current?.kind === 'write');
}
function reset(context, args) {
  const { record, document, window, ownership } = context;
  // This path deliberately does not apply to an initial loading/network parse.
  // Parser-script no-op and original XML/custom-element guards remain outside.
  context.current?.abort('Superseded write-created parser');
  record.stream?.abort('Superseded post-load parser');
  for (const manager of context.retired) if (!manager.size()) context.retired.delete(manager);
  if (document._requestManager.size()) context.retired.add(document._requestManager);
  ownership.eraseAuthoredListeners();
  context.open.apply(document, args);
  // Keep the original Window and Document, observers and Page.documentAbort.
  document._asyncQueue = new AsyncResourceQueue();
  document._queue = new ResourceQueue({ asyncQueue: document._asyncQueue, paused: false });
  document._deferQueue = new ResourceQueue({ paused: true });
  document._requestManager = new RequestManager();
  document._resourceLoader = new PerDocumentResourceLoader(document);
  document.readyState = 'loading';
  record.styles.clear(); record.blocker = null; record.closeRequested = null;
  const options = { ...record.parserOptions,
    treeAdapter: new record.parserOptions.treeAdapter.constructor(document) };
  const parser = context.makeParser(record, options);
  record.parser = parser; record.parserDone = false;
  const cycle = { kind: 'write', generation: ++context.generation, closedDelivered: false };
  const controller = createWriteParser(parser, {
    signal: record.signal,
    active: () => active(context) && context.current === cycle && record.parser === parser,
    onComplete: () => context.finishParser(record, parser),
    onError: error => context.page.emit?.('pageError', error),
  });
  Object.defineProperties(cycle, Object.getOwnPropertyDescriptors(controller));
  context.current = cycle; record.stream = cycle;
  if (!context.bridgeInstalled) {
    context.bridgeInstalled = true;
    // The old unmarked jsdom bridge was erased. Initial Window load already
    // happened, so its pending nextTick registration cannot race this bridge.
    ownership.add(window.document, 'load', () => {
      if (active(context)) fireAnEvent('load', window, undefined, {}, true);
    });
  }
  context.page.moduleScripts?.beginParseCycle(document._deferQueue, cycle);
  return document;
}
function patch() {
  if (patched) return; patched = true;
  const open = DocumentImpl.prototype.open, write = DocumentImpl.prototype.write, close = DocumentImpl.prototype.close;
  underlyingOpen = open;
  DocumentImpl.prototype.open = function (...args) {
    const context = contexts.get(this);
    if (eligible(context) && this._throwOnDynamicMarkupInsertionCounter) throw new context.Exception('Cannot open document during custom element construction', 'InvalidStateError');
    if (!eligible(context) || context.record.parserScriptDepth > 0 || this._parsingMode !== 'html' || this._throwOnDynamicMarkupInsertionCounter) return open.apply(this, args);
    return reset(context, args);
  };
  DocumentImpl.prototype.write = function (...args) {
    const context = contexts.get(this);
    if (this._parsingMode === 'xml' || this._throwOnDynamicMarkupInsertionCounter) return write.apply(this, args);
    if (context && active(context)) {
      if ((!context.current || context.current.state.status === 'complete') &&
          eligible(context) && !this._writeAfterElement && args.join('')) reset(context, []);
      if (context.current && context.current.state.status === 'open') {
        context.current.write(args.join('')); return;
      }
    }
    return write.apply(this, args);
  };
  DocumentImpl.prototype.close = function (...args) {
    const context = contexts.get(this), cycle = context?.current;
    if (cycle && active(context) && this._throwOnDynamicMarkupInsertionCounter) throw new context.Exception('Cannot close document during custom element construction', 'InvalidStateError');
    if (cycle && active(context)) {
      if (cycle.state.status === 'open') { context.record.closeRequested = args; cycle.close(); return; }
      if (cycle.state.status === 'complete') {
        if (cycle.closedDelivered) return;
        cycle.closedDelivered = true;
      }
    }
    return close.apply(this, args);
  };
  return open;
}
export function installDocumentReset(page, window, record, makeParser, finishParser) {
  patch();
  if (contexts.has(record.document)) return contexts.get(record.document);
  const context = { page, window, record, document: record.document, ownership: installListenerOwnership(window),
    open: underlyingOpen, makeParser, finishParser, Exception: window.DOMException,
    loaded: false, disposed: false, generation: 0, current: null, retired: new Set() };
  contexts.set(record.document, context);
  context.ownership.add(window.document, 'DOMContentLoaded', () => {
    if (active(context) && context.current && !page.registry) page.emit?.('domContentLoaded');
  });
  context.ownership.add(window, 'load', async () => {
    context.loaded = true;
    const cycle = context.current;
    if (cycle && !page.registry) {
      await page.moduleReady;
      if (active(context) && context.current === cycle) page.emit?.('load');
    }
  });
  context.dispose = () => {
    if (context.disposed) return; context.disposed = true;
    context.current?.abort(); for (const manager of context.retired) manager.close(); context.retired.clear();
  };
  return context;
}
