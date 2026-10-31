import {supportsFileInput,rememberFileInputContext,forgetFileInputContext,runFileInput} from './cdp-file-input.js';
import {dumpMarkdownNode} from './markdown-node.js';
import{enableNetworkCapture,disableNetworkCapture,capturedResponseBody,capturedRequestPostData}from'./network-capture.js';
import{setWindowDeviceMetrics}from'./window-viewport.js';
import {supportsPermissionControl,initializePermissionConnection,permissionOwnerForConnection,releasePermissionConnection,runPermissionControl} from './permission-control.js';
import {consoleProtocolType} from './console.js';
import {stopPageLoading} from './window-lifecycle-timers.js';
import {onPageClosing} from './page-closing.js';
import {installHeapUtilityFactories} from './heap-worlds.js';
import {ProtocolSerializer} from './protocol-serialization.js';
import {initializeUtilitySession,utilitySessionController} from './world-sessions.js';
import {canonicalUtilityValue} from './isolated-world.js';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { protocolValue } from './realm-values.js';
import { WebSocketServer, WebSocket } from 'ws';
import { Browser, VERSION, withTimeout } from './browser.js';
import {initializeCDPCookieMetadata,markCDPCookieContext,selectCDPCookieContext,listCDPCookies} from './cdp-cookie-metadata.js';
import {setCDPCookie,setCDPCookies} from './cdp-cookies.js';
import {cookieActionContext,requireCookieSession,decodeCookieDeletion,deleteCDPCookies} from './cdp-cookie-actions.js';
import { supportsDOM, runDOM, resetDOM } from './dom.js';
import { supportsInput, runInput } from './input.js';
import { createWebDriver } from './webdriver.js';
import { supportsRuntime, runRuntime, resetRuntime } from './runtime.js';
import {armJavaScriptDialog,selectJavaScriptDialogContext,subscribeJavaScriptDialogs} from './javascript-dialogs.js';
import { primitiveRemoteValue, describeRemoteValue, needsRemoteHandle, ownerDocumentOf, protocolErrorFields, exceptionDetailsFor } from './remote-values.js';

const timestamp = () => performance.now() / 1000;
const protocolErrors = new WeakSet();
const protocolCompletions=new WeakMap();
function completedResponse(result,complete){const token=Object.create(null);protocolCompletions.set(token,{result,complete});return token;}
// DOM lifecycle is owned by supportsDOM/runDOM above Session's generic branch.
// Keep existing known Root extensions explicit; arbitrary suffixes never brand
// a wire method as a supported domain command.
const SESSION_ENABLE_METHODS = new Set(['Page.enable','Runtime.enable','Network.enable','Log.enable','Performance.enable','Audits.enable']);
const SESSION_DISABLE_METHODS = new Set(['Page.disable','Runtime.disable','Network.disable','Log.disable','Performance.disable','Audits.disable']);
// These reference commands acknowledge configuration without requiring a
// loaded target or changing CSS, Inspector, or TLS state.
const CONFIGURATION_ACK_METHODS = new Set(['CSS.enable','Inspector.enable','Inspector.disable','Security.enable','Security.disable']);
class ProtocolError extends Error {
  constructor(message, code = -32602) { super(message); this.code = code; protocolErrors.add(this); }
}
function dialogParameters(params){
  if(!Object.hasOwn(params,'accept'))throw new ProtocolError('MissingField',-31998);
  if(typeof params.accept!=='boolean'||params.promptText!==undefined&&params.promptText!==null&&typeof params.promptText!=='string')throw new ProtocolError('UnexpectedToken',-31998);
  return params;
}
function dialogCommand(browser,method,params,context){
  const value=dialogParameters(params);
  if(method==='Page.handleJavaScriptDialog')throw new ProtocolError('No dialog is showing',-32000);
  if(!armJavaScriptDialog(browser,context??selectJavaScriptDialogContext(browser),value.accept,value.promptText))throw new ProtocolError('NoBrowserContext',-31998);
  return {};
}

function markdownAlias(page,params,resolveNode){
  let id=params.nodeId;
  if(id!==undefined&&id!==null){
    if(typeof id==='string'){
      if(!/^[0-9]+$/.test(id))throw new ProtocolError('InvalidCharacter',-31998);
      id=Number(id);
    }
    if(typeof id!=='number')throw new ProtocolError('UnexpectedToken',-31998);
    if(!Number.isInteger(id))throw new ProtocolError('InvalidNumber',-31998);
    if(id<0||id>4294967295)throw new ProtocolError('Overflow',-31998);
  }
  const root=id===undefined||id===null?page.dom.window.document:resolveNode(id);
  if(!root)throw new ProtocolError('InvalidNodeId',-31998);
  return { markdown: dumpMarkdownNode(root,{context:page.dom.window.document}) };
}

export function targetInfo(page) {
  return { targetId: page.id, type: 'page', title: page.dom.window.document.title,
    url: page.url, attached: true, canAccessOpener: false,
    browserContextId: page.context.id };
}
function frameInfo(page) {
  return { id: page.frameId, loaderId: page.loaderId, url: page.url,
    securityOrigin: page.securityOrigin ?? new URL(page.url).origin, mimeType: page.mimeType ?? page.dom.window.document.contentType,
    domainAndRegistry: '', secureContextType: 'InsecureScheme',
    crossOriginIsolatedContextType: 'NotIsolated', gatedAPIFeatures: [] };
}

class Session {
  constructor(connection, page, id = randomUUID()) {
    this.connection = connection;
    this.page = page;
    this.id = id;
    this.domains = new Set();
    this.objects = new Map();
    this.serializer = new ProtocolSerializer();
    this.streams = new Map();
    this.nextStreamId = 1;
    this.worlds = new Map();
    this.frameWorlds = new Map();
    this.nodeContexts = new Map();
    this.worldNames = new Set();
    this.scripts = new Map();
    this.bindings = new Set();
    this.listeners = [];
    this.nextBackendNodeId = 1;
    this.lifecycle = false;
    initializeUtilitySession(this,resetRuntime);
    this.utility = utilitySessionController(this,ProtocolError);
    const listen = (event, callback) => { page.on(event, callback); this.listeners.push([event, callback]); };
    listen('navigationStarted', () => {
      this.event('Page.frameStartedNavigating', { frameId: page.frameId, url: page.url, loaderId: page.loaderId, navigationType: 'differentDocument' });
      this.event('Page.frameStartedLoading', { frameId: page.frameId });
    });
    listen('contextsCleared', () => {
      resetDOM(this);
      resetRuntime(this);
      this.objects.clear(); this.worlds.clear(); this.frameWorlds.clear(); this.nodes?.clear(); this.nodeContexts.clear();
      this.event('Runtime.executionContextsCleared', {});
    });
    listen('navigated', () => {
      this.event('Page.frameNavigated', { frame: frameInfo(page), type: 'Navigation' });
      this.event('DOM.documentUpdated', {});
      this.lifecycleEvent('init');
      connection.targetChanged(page);
    });
    listen('withinDocument', ({ url, navigationType }) => {
      this.event('Page.navigatedWithinDocument', { frameId: page.frameId, url, navigationType });
      connection.targetChanged(page);
    });
    listen('contextCreated', () => {
      this.contextCreated();
      for (const name of this.worldNames) this.isolatedWorld(page,name);
    });
    listen('frameAttached', params => this.event('Page.frameAttached', params));
    listen('frameDetached', params => this.event('Page.frameDetached', params));
    listen('frameNavigationStarted', params => {
      this.event('Page.frameStartedNavigating', { ...params, navigationType: 'differentDocument' });
      this.event('Page.frameStartedLoading', { frameId: params.frameId });
    });
    listen('frameNavigated', ({ frame, page: child }) => {
      this.event('Page.frameNavigated', { frame, type: 'Navigation' });
      this.lifecycleEvent('init', child);
    });
    listen('frameWithinDocument', params => this.event('Page.navigatedWithinDocument', params));
    listen('frameContextCreated', ({ page: child }) => {
      this.contextCreated('', child.executionContextId, child);
      for (const name of this.worldNames) this.isolatedWorld(child, name);
    });
    listen('frameContextDestroyed', params => {
      const ids = new Set([params.executionContextId]);
      for (const [key, world] of this.frameWorlds) if (world.page.frameId === params.frameId) {
        ids.add(world.id); this.frameWorlds.delete(key);
        this.event('Runtime.executionContextDestroyed', { executionContextId: world.id });
      }
      for (const [id, object] of this.objects) if (ids.has(object.contextId)) this.objects.delete(id);
      for (const [id, context] of this.nodeContexts) if (ids.has(context)) { this.nodes?.delete(id); this.nodeContexts.delete(id); }
      resetRuntime(this, params.executionContextId);
      this.event('Runtime.executionContextDestroyed', { executionContextId: params.executionContextId,
        executionContextUniqueId: params.executionContextUniqueId });
    });
    listen('frameDOMContentLoaded', params => {
      const child = page.frames?.findFrame(params.frameId);
      if (child) this.lifecycleEvent('DOMContentLoaded', child);
    });
    listen('frameLoad', params => {
      const child = page.frames?.findFrame(params.frameId);
      if (!child) return;
      if (child.closed) return;
      this.lifecycleEvent('load', child); this.event('Page.frameStoppedLoading', { frameId: params.frameId });
    });
    listen('framePageError', ({ error, executionContextId }) => this.event('Runtime.exceptionThrown', {
      timestamp: Date.now(), exceptionDetails: this.exception(error, executionContextId),
    }));
    listen('frameConsole', ({ type, args, executionContextId }) => this.event('Runtime.consoleAPICalled', {
      type: consoleProtocolType(type), args: args.map(arg => this.remote(arg, false, undefined, executionContextId)), executionContextId, timestamp: Date.now(),
    }));
    listen('domContentLoaded', () => {
      this.event('Page.domContentEventFired', { timestamp: timestamp() });
      this.lifecycleEvent('DOMContentLoaded');
    });
    listen('load', () => {
      this.event('Page.loadEventFired', { timestamp: timestamp() });
      this.lifecycleEvent('load');
      this.event('Page.frameStoppedLoading', { frameId: page.frameId });
      // Network idle is observed rather than emitted immediately after load.
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.checkIdle(), 510);
    });
    listen('navigationError', error => {
      this.event('Page.frameStoppedLoading', { frameId: page.frameId });
      this.event('Runtime.exceptionThrown', { timestamp: timestamp(), exceptionDetails: this.exception(error) });
    });
    listen('request', request => {
      this.event('Network.requestWillBeSent', {
        requestId: request.id, loaderId: request.loaderId ?? page.loaderId, documentURL: page.frames?.findFrame(request.frameId)?.url ?? page.url,
        request: { url: request.url, method: request.method, headers: request.headers,
          ...request.postDataFields,initialPriority: 'High', referrerPolicy: 'no-referrer-when-downgrade' },
        timestamp: request.timestamp, wallTime: Date.now() / 1000,
        initiator: { type: 'other' }, type: request.type, frameId: request.frameId ?? page.frameId,
        hasUserGesture: false,
        ...(request.redirectResponse ? { redirectResponse: request.redirectResponse, redirectHasExtraInfo: false } : {}),
      });
    });
    listen('response', response => {
      this.event('Network.responseReceived', {
        requestId: response.id, loaderId: response.loaderId ?? page.loaderId, timestamp: response.timestamp,
        type: response.type, hasExtraInfo: false, frameId: response.frameId ?? page.frameId,
        response: { url: response.url, status: response.status, statusText: http.STATUS_CODES[response.status] ?? '',
          headers: response.headers, mimeType: (response.headers['content-type'] ?? 'text/html').split(';')[0],
          connectionReused: false, connectionId: 0, encodedDataLength: response.size,
          securityState: 'neutral', protocol: 'http/1.1', fromDiskCache: false, fromServiceWorker: false },
      });
      this.event('Network.loadingFinished', { requestId: response.id, timestamp: response.timestamp, encodedDataLength: response.size });
    });
    listen('requestFailed', request => this.event('Network.loadingFailed', {
      requestId: request.id, timestamp: request.timestamp, type: 'Document', errorText: request.message, canceled: request.canceled??false,
    }));
    listen('console', ({ type, args, executionContextId = page.executionContextId }) => this.event('Runtime.consoleAPICalled', {
      type: consoleProtocolType(type), args: args.map(arg => this.remote(arg, false, undefined, executionContextId)),
      executionContextId, timestamp: Date.now(),
    }));
    listen('pageError', error => this.event('Runtime.exceptionThrown', { timestamp: Date.now(), exceptionDetails: this.exception(error) }));
    this.releaseClosing=onPageClosing(page,()=>connection.detach(this.id,{targetClosed:true}));
    this.disposeJavaScriptDialogs=subscribeJavaScriptDialogs(page,connection,params=>connection.send({method:'Page.javascriptDialogOpening',params,...(this.id?{sessionId:this.id}:{})}));
  }
  event(method, params) {
    if (this.domains.has(method.split('.')[0])) this.connection.send({ method, params, ...(this.id ? { sessionId: this.id } : {}) });
  }
  lifecycleEvent(name, page = this.page) {
    if (this.lifecycle) this.event('Page.lifecycleEvent', { frameId: page.frameId, loaderId: page.loaderId, name, timestamp: timestamp() });
  }
  checkIdle() {
    if (this.page.closed) return;
    if (!this.page.activeRequests.size && Date.now() - this.page.lastActivity >= 500) {
      this.lifecycleEvent('networkAlmostIdle'); this.lifecycleEvent('networkIdle');
    } else this.idleTimer = setTimeout(() => this.checkIdle(), 100);
  }
  contextCreated(name = '', id = this.page.executionContextId, page = this.page) {
    if(this.utility.contextCreated(name,id,page))return;
    for (const binding of this.bindings) this.installBinding(binding, page);
    this.event('Runtime.executionContextCreated', { context: {
      id, origin: page.securityOrigin ?? new URL(page.url).origin, name, uniqueId: this.utility.uniqueId(page),
      auxData: { isDefault: !name, type: name ? 'isolated' : 'default', frameId: page.frameId },
    } });
    this.utility.mainContextAnnounced(page);
  }
  isolatedWorld(page, name) {
    return this.utility.isolatedWorld(page,name);
  }
  executionPage(id) {
    const utility=this.utility.executionPage(id);
    if(utility)return utility;
    if (id === undefined || id === this.page.executionContextId) return this.page;
    const found = this.page.frames?.findContext(id)?.page;
    if (found) return found;
    throw new ProtocolError('Cannot find context with specified id');
  }
  valueContext(value) {
    const utility=this.utility.valueContext(value);if(utility!==undefined)return utility;
    const document = ownerDocumentOf(value);
    for (const page of this.page.frames?.executionPages?.()??this.page.frames?.frames.values()??[]) {
      if (document && document === page.dom.window.document || value === page.dom.window) return page.executionContextId;
    }
    return this.page.executionContextId;
  }
  installBinding(name, page = this.page) {
    return this.utility.installBinding(name,page);
  }
  remote(value, byValue = false, group, contextId = this.valueContext(value)) {
    const primitive = primitiveRemoteValue(value);
    if (primitive) return primitive;
    const metadata = describeRemoteValue(value);
    if (byValue) {
      if (typeof value === 'symbol') throw new ProtocolError("Object couldn't be returned by value", -32000);
      try { return this.serializer.serialize(value,this.executionPage(contextId)); }
      catch(error) { throw new ProtocolError(error.message,Number.isInteger(error.code)?error.code:-32603); }
    }
    const objectId = randomUUID();
    this.executionPage(contextId);
    this.objects.set(objectId, { value, group, contextId });
    return { ...metadata, objectId };
  }
  object(id) {
    if (!this.objects.has(id)) {
      const valid = typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
      throw new ProtocolError(valid ? 'Could not find object with given id' : 'Invalid remote object id', -32000);
    }
    const entry = this.objects.get(id); this.executionPage(entry.contextId); return entry.value;
  }
  argument(arg, contextId, window) {
    if (arg.objectId !== undefined) {
      const value = this.object(arg.objectId);
      if (this.objects.get(arg.objectId).contextId !== contextId) throw new ProtocolError('Argument should belong to the same JavaScript world as target object', -32000);
      return value;
    }
    if (arg.unserializableValue) {
      const value = arg.unserializableValue;
      if (value.endsWith('n')) return BigInt(value.slice(0, -1));
      if (value === 'NaN') return NaN;
      if (value === 'Infinity') return Infinity;
      if (value === '-Infinity') return -Infinity;
      if (value === '-0') return -0;
      throw new ProtocolError('Invalid unserializable value');
    }
    return protocolValue(window, arg.value);
  }
  exception(error, contextId = this.page.executionContextId, group) {
    return exceptionDetailsFor(error, { executionContextId: contextId,
      remote: value => this.remote(value, false, group, contextId) });
  }
  async run(method, params) {
    const page = this.page;
    if (supportsDOM(method)) return runDOM(this, method, params);
    if (supportsInput(method)) return runInput(this, method, params);
    if (supportsRuntime(method)) return runRuntime(this, method, params);
    if(method==='Network.enable')enableNetworkCapture(page.context,params);
    if(method==='Network.disable')disableNetworkCapture(page.context);
    if (SESSION_ENABLE_METHODS.has(method)) {
      if(method==='Runtime.enable'&&this.domains.has('Runtime'))return {};
      this.domains.add(method.split('.')[0]);
      if (method === 'Runtime.enable') {
        this.contextCreated();
        for (const child of page.frames?.executionPages?.()??page.frames?.frames.values()??[]) if (child !== page) this.contextCreated('', child.executionContextId, child);
        this.utility.runtimeEnabled();
      }
      return {};
    }
    if (SESSION_DISABLE_METHODS.has(method)) { if(method==='Runtime.disable'&&this.domains.has('Runtime'))this.utility.runtimeDisabled();this.domains.delete(method.split('.')[0]); return {}; }
    switch (method) {
      case 'Page.close':return completedResponse({},()=>page.close());
      case 'Page.stopLoading':stopPageLoading(page);return {};
      case 'Page.getFrameTree': return { frameTree: page.frames?.getTree() ?? { frame: frameInfo(page) } };
      case 'Page.getLayoutMetrics': {
        const { width, height } = page.layout.viewport, { x, y } = page.layout.scroll;
        const layoutViewport = { pageX: x, pageY: y, clientWidth: width, clientHeight: height };
        const visualViewport = { offsetX: 0, offsetY: 0, pageX: x, pageY: y, clientWidth: width, clientHeight: height, scale: 1, zoom: 1 };
        const contentSize = { x: 0, y: 0, ...page.layout.documentSize };
        return { layoutViewport, visualViewport, contentSize, cssLayoutViewport: layoutViewport, cssVisualViewport: visualViewport, cssContentSize: contentSize };
      }
      case 'Emulation.setDeviceMetricsOverride': {
        if (![params.width, params.height].every(value => Number.isInteger(value) && value >= 0 && value <= 4294967295) || ['screenWidth','screenHeight'].some(name=>params[name]!=null&&(!Number.isInteger(params[name])||params[name]<0||params[name]>4294967295)) || ['deviceScaleFactor','scale'].some(name=>params[name]!=null&&(typeof params[name]!=='number'||!Number.isFinite(params[name]))) || params.mobile!=null&&typeof params.mobile!=='boolean') throw new ProtocolError('Invalid viewport dimensions');
        setWindowDeviceMetrics(page,params); return {};
      }
      case 'Emulation.clearDeviceMetricsOverride': page.viewport = undefined; setWindowDeviceMetrics(page,{ width: 1920, height: 1080,deviceScaleFactor:1 },{clear:true}); return {};
      case 'Page.setLifecycleEventsEnabled': this.lifecycle = params.enabled; return {};
      case 'Page.navigate': {
        const target = params.frameId && params.frameId !== page.frameId ? page.frames?.findFrame(params.frameId) : page;
        if (!target) throw new ProtocolError('Unknown frame');
        const url = new URL(params.url, target.url).href;
        if (!['http:', 'https:', 'data:', 'about:'].includes(new URL(url).protocol) || (url.startsWith('about:') && url !== 'about:blank')) {
          return { frameId: page.frameId, errorText: 'Unsupported URL protocol' };
        }
        if (target !== page) {
          try { const result = await target.navigate(url, { referrer: params.referrer }); return { frameId: result.frameId, loaderId: result.loaderId, isDownload: false }; }
          catch (error) { return { frameId: target.frameId, errorText: error.message }; }
        }
        // Reply after commit so clients receive fetch errors, but before waiting for load.
        let settled = false;
        return await new Promise(resolve => {
          const finish = result => { if (settled) return; settled = true; resolve(result); };
          const committed = () => finish({ frameId: page.frameId, loaderId: page.loaderId, isDownload: false });
          page.navigate(url, { onCommit: committed, referrer: params.referrer }).catch(error => finish({ frameId: page.frameId, loaderId: page.loaderId, errorText: error.message }));
        });
      }
      case 'Page.reload': await page.navigate(page.url, { historyMode: 'reload' }); return {};
      case 'Page.getNavigationHistory': return page.navigationHistory();
      case 'Page.navigateToHistoryEntry': {
        const index = page.history.findIndex(entry => entry.id === params.entryId);
        if (index < 0) throw new ProtocolError('Unknown history entry');
        await page.traverseHistory(index, { forceReload: true });
        return { frameId: page.frameId, loaderId: page.loaderId };
      }
      case 'Page.createIsolatedWorld': {
        if(params.worldName===undefined)throw new ProtocolError('MissingField',-31998);
        if(typeof params.worldName!=='string')throw new ProtocolError('UnexpectedToken',-31998);
        const target = params.frameId === page.frameId ? page : page.frames?.findFrame(params.frameId);
        if (!target) throw new ProtocolError('Frame with the given id does not belong to the target.',-32000);
        const name = params.worldName ?? '';
        if (target === page) this.worldNames.add(name);
        const id = this.isolatedWorld(target, name);
        return { executionContextId: id };
      }
      case 'Page.addScriptToEvaluateOnNewDocument': {
        const id = randomUUID();
        const script = { source: params.source, worldName: params.worldName ?? '' };
        this.scripts.set(id, script); page.newDocumentScripts.set(id, script);
        if (params.worldName) this.worldNames.add(params.worldName);
        return { identifier: id };
      }
      case 'Page.removeScriptToEvaluateOnNewDocument': this.scripts.delete(params.identifier); page.newDocumentScripts.delete(params.identifier); return {};
      case 'Page.setDocumentContent': {
        if (typeof params.html !== 'string') throw new ProtocolError('Invalid parameters');
        const target = params.frameId === undefined || params.frameId === page.frameId ? page : page.frames?.findFrame(params.frameId);
        if (!target || target.closed) throw new ProtocolError('No frame for given id');
        target.evaluate(`document.open(); document.write(${JSON.stringify(params.html)}); document.close();`);
        // The actual parser/reset lifecycle forwards DCL/load after its real
        // resource queues finish. This extension adds no premature completion.
        return {};
      }
      case 'Runtime.evaluate':
      case 'Runtime.callFunctionOn': {
        const invoking = method === 'Runtime.callFunctionOn';
        if (invoking && [params.objectId, params.executionContextId, params.uniqueContextId].filter(value => value !== undefined).length > 1) {
          throw new ProtocolError('ObjectId, executionContextId and uniqueContextId must mutually exclude each other');
        }
        if (invoking && params.objectId !== undefined) this.object(params.objectId);
        const receiver = invoking ? this.objects.get(params.objectId) : undefined;
        const group = params.objectGroup !== undefined ? params.objectGroup : receiver?.group;
        // Caller mutual-exclusion and receiver validation above precede unique
        // context lookup. The selected record owns a real VM context.
        const uniqueId=params.uniqueContextId===undefined?undefined:this.utility.uniqueContextId(params.uniqueContextId);
        const contextId = params.contextId ?? params.executionContextId ?? uniqueId ?? receiver?.contextId ?? page.executionContextId;
        let target = page, value;
        try {
          target = this.executionPage(contextId);
          value = method === 'Runtime.evaluate' ? target.evaluate(params.expression) : target.callFunction(
            params.functionDeclaration,
            params.objectId !== undefined ? this.object(params.objectId) : target.dom.window,
            (params.arguments ?? []).map(arg => this.argument(arg, contextId, target.dom.window)),
          );
          if (params.awaitPromise) value = await withTimeout(Promise.resolve(value), target.timeout);
        } catch (error) {
          if (protocolErrors.has(error)) throw error;
          return { result: this.remote(error, false, group, contextId),
            exceptionDetails: this.exception(error, contextId, group) };
        }
        return { result: this.remote(value, params.returnByValue, group, contextId) };
      }
      case 'Runtime.getProperties': {
        if (typeof params.objectId !== 'string') throw new ProtocolError('Invalid parameters');
        const object = this.object(params.objectId);
        const contextId = this.objects.get(params.objectId).contextId;
        const group = this.objects.get(params.objectId).group;
        const result = Object.getOwnPropertyNames(object).map(name => {
          const descriptor = Object.getOwnPropertyDescriptor(object, name) ?? {};
          return { name, configurable: !!descriptor.configurable, enumerable: !!descriptor.enumerable,
            isOwn: true, ...(Object.hasOwn(descriptor, 'value') ? { value: this.remote(descriptor.value, false, group, contextId), writable: !!descriptor.writable } : {}),
            ...(descriptor.get ? { get: this.remote(descriptor.get, false, group, contextId) } : {}), ...(descriptor.set ? { set: this.remote(descriptor.set, false, group, contextId) } : {}) };
        });
        const prototype = needsRemoteHandle(object) && typeof object !== 'symbol' && !types.isProxy(object) ? Object.getPrototypeOf(object) : null;
        return { result, internalProperties: prototype === null ? [] : [{ name: '[[Prototype]]', value: this.remote(prototype, false, group, contextId) }] };
      }
      case 'Runtime.releaseObject': this.objects.delete(params.objectId); return {};
      case 'Runtime.releaseObjectGroup': for (const [id, object] of this.objects) if (object.group === params.objectGroup) this.objects.delete(id); return {};
      case 'Runtime.addBinding': this.utility.addBinding(params);return {};
      case 'Runtime.removeBinding': this.utility.removeBinding(params.name);return {};
      case 'Runtime.runIfWaitingForDebugger': return {};
      case 'Network.getCookies': {
        const urls = params.urls ?? [page.url];
        return { cookies: await listCDPCookies(page.context.cookies, urls.map(value=>value)) };
      }
      case 'Storage.getCookies': return this.connection.run(method,params,this);
      case 'Storage.setCookies':
      case 'Storage.clearCookies':
      case 'Network.deleteCookies': return this.connection.run(method,params,this);
      case 'Network.getAllCookies': return { cookies: await listCDPCookies(page.context.cookies) };
      case 'Network.setCookie': return { success: await setCDPCookie(page.context.cookies, params, page.url) };
      case 'Network.setCookies': await setCDPCookies(page.context.cookies, params.cookies, page.url); return {};
      case 'Network.clearBrowserCookies': await page.context.cookies.removeAllCookies(); return {};
      case 'Network.getResponseBody': return capturedResponseBody(page.context,params);
      case 'Network.getRequestPostData': return capturedRequestPostData(page.context,params);
      case 'Network.setExtraHTTPHeaders': page.setExtraHTTPHeaders(params.headers); return {};
      case 'Network.setUserAgentOverride': page.setUserAgentOverride(params); return {};
      case 'Page.captureScreenshot': {
        if (params.format !== undefined && params.format !== 'png') throw new ProtocolError('unsupported screenshot format.', -32000);
        const { width, height } = page.layout.viewport;
        let rendered;
        try { rendered = await page.render('png', { width, height, fullPage: params.captureBeyondViewport ?? false, clip: params.clip }); }
        catch (error) { throw new ProtocolError(error.code === 'RENDER_SCREENSHOT_OPTIONS' ? 'InvalidScreenshotOptions' : error.message, error.code === 'RENDER_SCREENSHOT_OPTIONS' ? -31998 : -32000); }
        return { data: rendered.bytes.toString('base64') };
      }
      case 'Page.printToPDF': {
        if (params.transferMode !== undefined && !['ReturnAsBase64', 'ReturnAsStream'].includes(params.transferMode)) throw new ProtocolError('Invalid transferMode');
        for (const name of ['paperWidth', 'paperHeight', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'scale']) {
          if (params[name] !== undefined && (!Number.isFinite(params[name]) || params[name] < 0)) throw new ProtocolError('invalid print parameters');
        }
        if (params.scale !== undefined && (params.scale < .1 || params.scale > 2) || params.paperWidth === 0 || params.paperHeight === 0) throw new ProtocolError('invalid print parameters');
        // The measured native renderer ignores header/footer templates.
        let rendered;
        try { rendered = await page.render('pdf', { paperWidth: (params.paperWidth ?? 8.5) * 72,
          paperHeight: (params.paperHeight ?? 11) * 72, landscape: params.landscape ?? false,
          PDFscale: params.scale ?? 1, pageRanges: params.pageRanges ?? '',
          marginTop: (params.marginTop ?? .4) * 72, marginBottom: (params.marginBottom ?? .4) * 72,
          marginLeft: (params.marginLeft ?? .4) * 72, marginRight: (params.marginRight ?? .4) * 72 }); }
        catch (error) { throw new ProtocolError(error.message, error.code === 'RENDER_BOUNDS' ? -32602 : -32000); }
        if (params.transferMode === 'ReturnAsStream') {
          const handle = String(this.nextStreamId++); this.streams.set(handle, { bytes: rendered.bytes, offset: 0 });
          return { data: '', stream: handle };
        }
        return { data: rendered.bytes.toString('base64') };
      }
      case 'IO.read': {
        const stream = this.streams.get(params.handle);
        if (!stream) throw new ProtocolError('Invalid stream handle', -32000);
        for (const key of ['offset', 'size']) if (params[key] !== undefined && (!Number.isSafeInteger(params[key]) || params[key] < (key === 'size' ? 1 : 0))) throw new ProtocolError(`Invalid ${key}`);
        const offset = params.offset ?? stream.offset, size = params.size ?? 65536;
        const end = Math.min(stream.bytes.length, offset + size);
        const data = stream.bytes.subarray(offset, end); stream.offset = end;
        return { base64Encoded: true, data: data.toString('base64'), eof: end >= stream.bytes.length };
      }
      case 'IO.close': {
        if (!this.streams.delete(params.handle)) throw new ProtocolError('Invalid stream handle', -32000);
        return {};
      }
      case 'Page.handleJavaScriptDialog':
      case 'LP.handleJavaScriptDialog': return dialogCommand(page.browser,method,params,page.context);
      case 'LP.version': return { version: VERSION };
      case 'LP.getMarkdown': return markdownAlias(page,params,id=>this.nodes?.get(id));
      case 'LP.dump': {
        const format = params.format ?? 'html';
        if (params.strip !== undefined && (!params.strip || typeof params.strip !== 'object' || Array.isArray(params.strip))) throw new ProtocolError('strip must be an object');
        const stripModes = Object.entries(params.strip ?? {}).filter(([, enabled]) => enabled).map(([name]) => name);
        const rootNode = params.backendNodeId === undefined ? undefined : this.nodes?.get(params.backendNodeId);
        if (params.backendNodeId !== undefined && !rootNode) throw new ProtocolError('Unknown DOM node');
        try {
          if (['png', 'pdf'].includes(format)) {
            const rendered = await page.render(format, { selector: params.selector, node: rootNode, stripModes });
            return { format, content: rendered.bytes.toString('base64') };
          }
          return { format, content: page.dump(format, { selector: params.selector, rootNode, maxBytes: params.maxBytes,
            stripModes, nodeIdFor: node => this.backendId(node) }) };
        } catch (error) { throw new ProtocolError(error.message, error.code === 'UnsupportedDumpFormat' ? -32601 : -32602); }
      }
      // Acknowledgements for protocol configuration that does not require layout.
      case 'Network.setCacheDisabled':
      case 'Page.setInterceptFileChooserDialog':
      case 'Emulation.setFocusEmulationEnabled':
      case 'Emulation.setEmulatedMedia':
      case 'Emulation.setTouchEmulationEnabled':
      case 'Performance.setTimeDomain':
      case 'Target.setAutoAttach': return {};
      case 'Emulation.setScriptExecutionDisabled': page.javascript = !params.value; return {};
      default: throw new ProtocolError(`Unsupported CDP method: ${method}`, -32601);
    }
  }
  backendId(node) {
    node=canonicalUtilityValue(node);
    this.nodes ??= new Map();
    for (const [id, value] of this.nodes) if (value === node) return id;
    const id = this.nextBackendNodeId++; this.nodes.set(id, node); this.nodeContexts.set(id, this.valueContext(node)); return id;
  }
  close() {
    if(this.closed)return;this.closed=true;
    this.releaseClosing?.();
    this.serializer.close();
    this.disposeJavaScriptDialogs?.();
    this.utility.close();
    clearTimeout(this.idleTimer);
    resetDOM(this);
    resetRuntime(this);
    for (const [event, callback] of this.listeners) this.page.off(event, callback);
    this.objects.clear(); this.nodes?.clear(); this.streams.clear();
    for (const id of this.scripts.keys()) this.page.newDocumentScripts.delete(id);
  }
}

installHeapUtilityFactories();
class Connection {
  constructor(socket, browser, directPage) {
    this.socket = socket;
    this.browser = browser;
    initializePermissionConnection(this,directPage);
    this.sessions = new Map();
    this.discover = false;
    this.autoAttach = false;
    if (directPage) this.sessions.set('', new Session(this, directPage, ''));
    this.created = page => {
      if (this.discover) this.send({ method: 'Target.targetCreated', params: { targetInfo: targetInfo(page) } });
      if (this.autoAttach) this.attach(page);
    };
    this.destroyed = page => {
      for(const session of [...this.sessions.values()])if(session.page===page)this.detach(session.id,{targetClosed:true});
      if (this.discover) this.send({ method: 'Target.targetDestroyed', params: { targetId: page.id } });
    };
    browser.on('targetCreated', this.created);
    browser.on('targetDestroyed', this.destroyed);
    socket.on('message', raw => this.receive(raw));
    socket.on('close', () => this.close());
    socket.on('error', () => this.close());
  }
  send(message) { if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  targetChanged(page) { if (this.discover) this.send({ method: 'Target.targetInfoChanged', params: { targetInfo: targetInfo(page) } }); }
  attach(page) {
    const session = new Session(this, page);
    this.sessions.set(session.id, session);
    this.send({ method: 'Target.attachedToTarget', params: { sessionId: session.id, targetInfo: targetInfo(page), waitingForDebugger: false } });
    return session.id;
  }
  detach(id,{targetClosed=false}={}) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.close(); this.sessions.delete(id);
    if(targetClosed)this.send({method:'Inspector.detached',params:{reason:'Render process gone.'},sessionId:id});
    this.send({ method: 'Target.detachedFromTarget', params: { sessionId: id, targetId: session.page.id,...(targetClosed?{reason:'Render process gone.'}:{}) } });
  }
  async receive(raw) {
    let message,dispatchedSession,replied=false;
    try {
      message = JSON.parse(raw);
      if (!message || !Number.isInteger(message.id) || typeof message.method !== 'string' ||
          (message.params !== undefined && !(message.params === null && (CONFIGURATION_ACK_METHODS.has(message.method) || message.method === 'LP.getMarkdown' || message.method === 'LP.version' || supportsPermissionControl(message.method))) &&
            (!message.params || Array.isArray(message.params) || typeof message.params !== 'object'))) {
        throw new ProtocolError('Invalid CDP request', -32600);
      }
      const { method, sessionId } = message;
      const params = message.params ?? {};
      const session = this.sessions.get(sessionId ?? '');
      if (sessionId && !session) throw new ProtocolError('Unknown sessionId', -32001);
      const sessionCommand=session&&!method.startsWith('Browser.')&&!method.startsWith('Target.')&&!CONFIGURATION_ACK_METHODS.has(method);
      dispatchedSession=sessionCommand?session:undefined;
      const result = supportsFileInput(method) ? runFileInput(this,session,params,ProtocolError) : supportsPermissionControl(method) ? runPermissionControl(permissionOwnerForConnection(this,session?.page),method,message.params,Object.hasOwn(message,'params'),ProtocolError) : CONFIGURATION_ACK_METHODS.has(method) ? {} : session && !method.startsWith('Browser.') && !method.startsWith('Target.')
        ? await session.run(method, params) : await this.run(method, params, session);
      // Closed sessions have no receiver for their pending command replies.
      // Page.close itself completes only after its successful response below.
      if(dispatchedSession&&this.sessions.get(dispatchedSession.id)!==dispatchedSession)return;
      const completion=protocolCompletions.get(result);
      this.send({ id: message.id, result:completion?completion.result:result, ...(sessionId ? { sessionId } : {}) });replied=true;
      completion?.complete();
    } catch (error) {
      if(replied||dispatchedSession&&this.sessions.get(dispatchedSession.id)!==dispatchedSession)return;
      this.send({ id: message?.id ?? null, error: protocolErrorFields(error), ...(message?.sessionId ? { sessionId: message.sessionId } : {}) });
    }
  }
  async run(method, params, parent) {
    const browser = this.browser;
    switch (method) {
      case 'LP.version': return { version: VERSION };
      case 'LP.getMarkdown': {
        const context=selectCDPCookieContext(browser);
        if(!context)throw new ProtocolError('NoBrowserContext',-31998);
        const page=[...browser.pages.values()].find(value=>value.context===context&&!value.closed);
        if(!page)throw new ProtocolError('FrameNotLoaded',-31998);
        return markdownAlias(page,params,id=>{
          const matches=new Set();
          for(const session of this.sessions.values())if(session.page===page){const node=session.nodes?.get(id);if(node)matches.add(node)}
          return matches.size===1?[...matches][0]:undefined;
        });
      }
      case 'Browser.getVersion': return { protocolVersion: '1.3', product: `RedPanda/${VERSION}`, revision: VERSION, userAgent: `RedPanda/${VERSION}`, jsVersion: process.versions.v8 };
      case 'Browser.getBrowserCommandLine': return { arguments: [] };
      case 'Target.setDiscoverTargets':
        this.discover = params.discover;
        if (params.discover) for (const page of browser.pages.values()) this.send({ method: 'Target.targetCreated', params: { targetInfo: targetInfo(page) } });
        return {};
      case 'Target.setAutoAttach':
        if (!parent) {
          this.autoAttach = params.autoAttach;
          if (this.autoAttach) for (const page of browser.pages.values()) if (![...this.sessions.values()].some(session => session.page === page)) this.attach(page);
        }
        return {};
      case 'Target.getTargets': return { targetInfos: [...browser.pages.values()].map(targetInfo) };
      case 'Target.getBrowserContexts': return { browserContextIds: [...browser.contexts.keys()].filter(id => id !== 'default') };
      case 'Target.createBrowserContext': {const id=browser.createContext({permissionOwner:permissionOwnerForConnection(this)});markCDPCookieContext(browser,browser.contexts.get(id));rememberFileInputContext(this,browser.contexts.get(id));return {browserContextId:id};}
      case 'Target.disposeBrowserContext': browser.disposeContext(params.browserContextId);forgetFileInputContext(this,params.browserContextId); return {};
      case 'Target.createTarget': {
        const page = browser.createPage(params.browserContextId,{permissionOwner:permissionOwnerForConnection(this)});
        rememberFileInputContext(this,page.context);
        if (params.url && params.url !== 'about:blank') queueMicrotask(() => page.navigate(params.url).catch(() => {}));
        return { targetId: page.id };
      }
      case 'Target.getTargetInfo': {
        const page = browser.pages.get(params.targetId) ?? parent?.page;
        if (!page) throw new ProtocolError('Unknown target');
        return { targetInfo: targetInfo(page) };
      }
      case 'Target.attachToTarget': {
        const page = browser.pages.get(params.targetId);
        if (!page) throw new ProtocolError('Unknown target');
        return { sessionId: this.attach(page) };
      }
      case 'Target.detachFromTarget': this.detach(params.sessionId); return {};
      case 'Target.closeTarget': {
        const page = browser.pages.get(params.targetId);
        if (!page){
          const context=parent?.page.context??selectCDPCookieContext(browser);
          throw new ProtocolError(!context?'BrowserContextNotLoaded':[...browser.pages.values()].some(value=>value.context===context)?'UnknownTargetId':'TargetNotLoaded',-31998);
        }
        return completedResponse({success:true},()=>page.close());
      }
      case 'Browser.close': browser.close(); return {};
      case 'Page.handleJavaScriptDialog':
      case 'LP.handleJavaScriptDialog': return dialogCommand(browser,method,params,parent?.page.context);
      case 'Storage.getCookies': {
        const context = params.browserContextId===undefined&&parent?parent.page.context:selectCDPCookieContext(browser,params.browserContextId);
        if (!context) throw new ProtocolError(params.browserContextId===undefined?'BrowserContextNotLoaded':'Unknown browser context',params.browserContextId===undefined?-31998:-32602);
        return { cookies: await listCDPCookies(context.cookies) };
      }
      case 'Storage.setCookies': {
        const context = cookieActionContext(browser,parent,params.browserContextId);
        await setCDPCookies(context.cookies, params.cookies, 'about:blank');
        return {};
      }
      case 'Storage.clearCookies': {
        const context=cookieActionContext(browser,parent,params.browserContextId);await context.cookies.removeAllCookies();return {};
      }
      case 'Network.deleteCookies': {
        requireCookieSession(browser,parent);const input=decodeCookieDeletion(params),context=cookieActionContext(browser,parent);await deleteCDPCookies(context.cookies,input);return {};
      }
      case 'Page.close':case 'Page.stopLoading':{
        const context=selectCDPCookieContext(browser);
        if(!context)throw new ProtocolError('BrowserContextNotLoaded',-31998);
        const loaded=[...browser.pages.values()].filter(page=>page.context===context);
        if(loaded.length!==1)throw new ProtocolError('TargetNotLoaded',-31998);
        const page=loaded[0];
        if(method==='Page.close')return completedResponse({},()=>page.close());
        stopPageLoading(page);return {};
      }
      default: throw new ProtocolError(`Unsupported CDP method: ${method}`, -32601);
    }
  }
  close() {
    releasePermissionConnection(this);
    this.browser.off('targetCreated', this.created);
    this.browser.off('targetDestroyed', this.destroyed);
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}

export async function serve({ host = '127.0.0.1', port = 9222, ...options } = {}) {
  const protocols = new Set(options.protocols ?? ['cdp']);
  if (!protocols.size || [...protocols].some(protocol => !['cdp', 'webdriver'].includes(protocol))) throw new Error('Unsupported automation protocol');
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const browser = new Browser(options);
  initializeCDPCookieMetadata(browser);
  const connections = new Set();
  const authority = () => `${host.includes(':') ? `[${host}]` : host}:${server.address().port}`;
  const driver = protocols.has('webdriver') ? createWebDriver(browser, {
    sessionTimeout: options.httpSessionTimeout ?? 60,
    webSocketUrl: sessionId => `ws://${authority()}/session/${sessionId}`,
  }) : null;
  const server = http.createServer(async (request, response) => {
    const address = server.address();
    const currentAuthority = `${host.includes(':') ? `[${host}]` : host}:${address.port}`;
    const url = new URL(request.url, `http://${currentAuthority}`);
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
    try { if (driver && await driver.handle(request, response, url)) return; }
    catch (error) { send(500, { error: error.message }); return; }
    if (request.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
    if (protocols.has('cdp') && url.pathname === '/json/version') send(200, {
      Browser: `RedPanda/${VERSION}`, 'Protocol-Version': '1.3', 'User-Agent': `RedPanda/${VERSION}`,
      'V8-Version': process.versions.v8, webSocketDebuggerUrl: `ws://${currentAuthority}/`,
    });
    else if (protocols.has('cdp') && (url.pathname === '/json' || url.pathname === '/json/list')) send(200, [...browser.pages.values()].map(page => ({
      ...targetInfo(page), id: page.id, webSocketDebuggerUrl: `ws://${currentAuthority}/devtools/page/${page.id}`,
    })));
    else if (url.pathname === '/health') send(200, { status: 'ok', browser: `RedPanda/${VERSION}`, pages: browser.pages.size, protocols: [...protocols] });
    else send(404, { error: 'Not found' });
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  server.on('upgrade', (request, socket, head) => {
    // CDP executes JavaScript. A browser webpage must not attach cross-origin.
    if (request.headers.origin && !allowedOrigins.has('*') && !allowedOrigins.has(request.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const path = request.url.split('?')[0];
    const page = path.startsWith('/devtools/page/') ? browser.pages.get(path.slice('/devtools/page/'.length)) : undefined;
    let bidi;
    try { bidi = driver?.accepts(request.url); }
    catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
    if (!bidi && (!protocols.has('cdp') || (path !== '/' && !page))) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, ws => {
      if (bidi) { driver.attach(ws, { path: request.url, webSocketUrl: `ws://${authority()}` }); return; }
      const connection = new Connection(ws, browser, page);
      connections.add(connection);
      ws.once('close', () => connections.delete(connection));
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const address = server.address();
  return {
    browser, server, port: address.port, host,
    close: async () => {
      driver?.close();
      browser.close();
      for (const connection of connections) { connection.close(); connection.socket.terminate(); }
      sockets.close();
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
