import { installCanvas,canvasSnapshot,canvasDimensions } from './canvas.js';
import { installImageData } from './image-data.js';
import {workerSocketPolicy} from './worker-socket-policy.js';
import {installWorkerAPIs,captureWorkerCreator} from './worker-apis.js';
import {completeWorkerSyncResponse,createSyncWorkerRequest,completeWorkerSocketPolicy,createSyncWorkerSocketPolicy} from './worker-sync-transport.js';
import {installServiceWorkerRealm} from './service-workers.js';
import {installCache,cacheStoreFor} from './cache.js';
import { broadcastConfig } from "./broadcast-config.js";
import { createBroadcastRealm, createBroadcastRelay } from "./broadcast-realm.js";
import vm from 'node:vm';
import { Worker as ThreadWorker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createMessagingRealm, installMessaging } from './messaging.js';
import { resolveBlobURL } from './blob-urls.js';
import { installWebCodecsProcessors } from './webcodecs-processors.js';
import { installVideoFrame } from './video-frame.js';
import { installAudioData } from './audio-data.js';
import { installWebCodecsValues } from './webcodecs-values.js';
import { installGeometry } from './geometry.js';
import { installNavigator } from './navigator.js';
import { installStreams } from './streams.js';

// Dedicated worker support. Shared workers and nested workers fail explicitly.
// Channels and transferred ports use real Node endpoints with realm adapters.
// Blob/File message values preserve native bytes and metadata through private codecs.
// SharedArrayBuffer messages reject explicitly. importScripts has an 8MiB response limit.
// Worker networking is buffered, with per-fetch AbortSignal and document abort.
// The VM worker global is an API boundary, not a
// security sandbox for hostile code. HTTP CORS/CSP policy remains a browser gap.
const SYNC_BYTES = 8 * 1024 * 1024;
export function installWorkers(page, window, { enabled = true } = {}) {
  const creatorSnapshot=captureWorkerCreator(page,window);
  const signal = page.documentAbort?.signal, owned = new Set();
  const messaging = installMessaging(page, window);
  const clone = value => messaging.receive({ data: value, ports: [] }).data;
  const serviceRequests=new Map();
  let disposed = false;
  const active = () => !disposed && !signal?.aborted && !page.closed;
  function dispose() { disposed = true; for (const worker of [...owned]) worker.terminate(); }
  signal?.addEventListener('abort', dispose, { once: true });
  class Worker extends window.EventTarget {
    #thread; #broadcastRelay; #abort = new AbortController(); #terminated = false; #requests = new Map();
    constructor(input, options = {}, serviceToken) {
      super();
      const service=serviceRequests.get(serviceToken);serviceRequests.delete(serviceToken);
      if (!active()) throw new window.DOMException('The document is disposed', 'InvalidStateError');
      const creator=creatorSnapshot();
      const url = new URL(String(input), creator.baseURL);
      if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) throw new window.DOMException(`Unsupported worker URL: ${url.protocol}`, 'NotSupportedError');
      const origin = creator.origin;
      if (url.protocol !== 'data:' && origin !== 'null' && url.origin !== origin) throw new window.DOMException('Worker URL must have the document origin', 'SecurityError');
      const type = options.type ?? 'classic';
      if (!['classic', 'module'].includes(type)) throw new TypeError('Worker type must be classic or module');
      const credentials = options.credentials ?? 'same-origin';
      if (!['omit', 'same-origin', 'include'].includes(credentials)) throw new TypeError('Invalid worker credentials');
      // A disabled resource policy intentionally creates an inert Worker, as
      // observed in native serve/fetch defaults; no script request is issued.
      if (!enabled&&!service) return;
      let startupBlob = url.protocol === 'blob:' ? resolveBlobURL(page, url.href) : undefined;
      this.#broadcastRelay = createBroadcastRelay(messaging, broadcastConfig(page,window));
      this.#thread = new ThreadWorker(new URL(import.meta.url), {
        // File-backed workers must not inherit an embedding CLI's --input-type
        // or --eval flags. Only the VM-module capability is needed here.
        execArgv: typeof vm.SourceTextModule === 'function' ? ['--experimental-vm-modules'] : [], workerData: {
        redPandaWorker: true, origin:url.protocol==='data:'?'null':creator.origin, service:service?.initial, cacheEnabled:Boolean(page.browser?.options?.experimentalFeatures?.serviceworker), secure:creator.secure, cacheOrigin:creator.origin, broadcast: broadcastConfig(page, window), url: url.href, type, name: String(options.name ?? ''),
        navigator: { userAgentMetadata: page.userAgentMetadata, userAgent: window.navigator.userAgent, language: window.navigator.language,
          languages: [...window.navigator.languages], platform: window.navigator.platform },
      } });
      service?.setControls(message=>{if(!this.#terminated)this.#thread.postMessage(message);},()=>this.terminate(),(data,transfer)=>this.postMessage(data,transfer));
      owned.add(this);
      this.#thread.on('message', async message => {
        if(message.kind==='broadcastRelay'){this.#broadcastRelay.accept(message);return;}
        if(message.kind==='broadcastReady'){this.#broadcastRelay.ready(message.id);return;}
        if(message.kind==='broadcastCancel'){this.#broadcastRelay.cancel(message.id);return;}
        if (this.#terminated || !active()) { for (const port of message.ports ?? []) port.close(); return; }
        if(message.kind==='serviceReady')service?.ready();
        else if(message.kind==='serviceLifecycle')service?.lifecycle(message.type,message.error);
        else if(message.kind==='serviceError')service?.error(message.error);
        else if(message.kind==='serviceCall'){
          try{const result=await service.call(message.operation,message.args);if(!this.#terminated&&active())this.#thread.postMessage({kind:'serviceResponse',id:message.id,result});}
          catch(error){if(!this.#terminated&&active())this.#thread.postMessage({kind:'serviceResponse',id:message.id,error:{name:error.name,message:error.message}});}
        }
        else if (message.kind === 'cacheOperation') {
          try { const result=await cacheStoreFor(page).operate(creator.origin,message.operation,message.args);if(!this.#terminated&&active())this.#thread.postMessage({kind:'cacheResponse',id:message.id,result}); }
          catch(error) {if(!this.#terminated&&active())this.#thread.postMessage({kind:'cacheResponse',id:message.id,error:{name:error.name,message:error.message}});}
        } else if (message.kind === 'message') messaging.dispatchMessage(this, message);
        else if (message.kind === 'error') {
          if(service){page.emit('console',{type:'error',args:[message.error.message]});return;}
          const error = new window.Error(message.error.message); error.name = message.error.name; error.stack = message.error.stack;
          const event = new window.ErrorEvent('error', { message: error.message, filename: message.error.filename || url.href, error, cancelable: true });
          if (this.dispatchEvent(event)) page.emit('pageError', error);
        } else if (message.kind === 'console') page.emit('console', { type: message.type, args: clone(message.args) });
        else if (message.kind === 'close') this.terminate();
        else if (message.kind === 'cancel') this.#requests.get(message.id)?.abort();
        else if(message.kind==='socketPolicy'){
          try{completeWorkerSocketPolicy(message.sync,await workerSocketPolicy(page,message.url));}
          catch(error){completeWorkerSocketPolicy(message.sync,null,error);}
        }
        else if (message.kind === 'request') {
          const requestAbort = new AbortController();
          this.#requests.set(message.id, requestAbort);
          try {
            const headers = new Headers(message.init?.headers);
            if (!headers.has('referer')) {
              const referrer = page.referrerFor?.(message.url, url.href);
              if (referrer) headers.set('referer', referrer);
            }
            const combined = AbortSignal.any([...(signal ? [signal] : []), this.#abort.signal, requestAbort.signal]);
            const blobSnapshot = message.script && message.url === url.href ? startupBlob : undefined;
            if (blobSnapshot) startupBlob = undefined;
            const response = await page.fetch(message.url, { ...message.init, headers, signal: combined,
              credentials: message.init?.credentials ?? (message.script ? credentials : 'same-origin'),
              credentialsOrigin: url.origin,
              ...(blobSnapshot ? { blobSnapshot } : {}),
            }, message.script ? 'Script' : message.resourceType ?? 'Fetch');
            const bytes = new Uint8Array(await response.arrayBuffer());
            const result = { status: response.status, statusText: response.statusText,
              headers: [...response.headers], url: response.url || message.url, bytes };
            if(message.syncBinary)completeWorkerSyncResponse(message.sync,result);
            else if (message.sync) {
              const state = new Int32Array(message.sync, 0, 2), destination = new Uint8Array(message.sync, 8);
              const encoded = new TextEncoder().encode(JSON.stringify({ ...result, bytes: undefined, source: new TextDecoder().decode(bytes) }));
              if (encoded.length > destination.length) throw new Error('importScripts response exceeds 8MiB limit');
              destination.set(encoded); Atomics.store(state, 1, encoded.length); Atomics.store(state, 0, 1); Atomics.notify(state, 0);
            } else if (!this.#terminated && active()) this.#thread.postMessage({ kind: 'response', id: message.id, result }, [bytes.buffer]);
          } catch (error) {
            if(message.syncBinary)completeWorkerSyncResponse(message.sync,null,error);
            else if (message.sync) {
              const state = new Int32Array(message.sync, 0, 2), destination = new Uint8Array(message.sync, 8);
              const encoded = new TextEncoder().encode(JSON.stringify({ error: String(error.message ?? error) }));
              destination.set(encoded.subarray(0, destination.length)); Atomics.store(state, 1, Math.min(encoded.length, destination.length)); Atomics.store(state, 0, 1); Atomics.notify(state, 0);
            } else if (!this.#terminated && active()) this.#thread.postMessage({ kind: 'response', id: message.id, error: String(error.message ?? error) });
          } finally { this.#requests.delete(message.id); }
        }
      });
      this.#thread.on('error', error => {
        if (!this.#terminated && active()) {
          if(service){service.error({name:error.name,message:error.message});return;}
          const event = new window.ErrorEvent('error', { message: error.message, error, filename: url.href, cancelable: true });
          if (this.dispatchEvent(event)) page.emit('pageError', error);
        }
      });
      this.#thread.on('messageerror', () => {
        if (!this.#terminated && active()) messaging.dispatchMessage(this, { data: null, ports: [] }, 'messageerror');
      });
      this.#thread.once('exit', () => { this.#broadcastRelay.exit(); owned.delete(this); this.#abort.abort(); this.#terminated = true; });
      // Installing a message listener refs Node's underlying MessagePort; unref
      // after installing listeners so workers cannot hold server shutdown open.
      this.#thread.unref();
    }
    postMessage(data, transfer) {
      if (!this.#terminated && active()) {
        if (this.#thread) {
          const prepared = messaging.prepare(data, transfer);
          try { this.#thread.postMessage({ kind: 'message', ...prepared.message }, prepared.transfer); prepared.commit(); }
          catch (error) { if (error?.name === 'DataCloneError') throw new window.DOMException(error.message, 'DataCloneError'); throw error; }
        } else messaging.discard(data, transfer);
      }
    }
    terminate() {
      if (this.#terminated) return;
      this.#terminated = true; owned.delete(this); this.#abort.abort(); void this.#thread?.terminate();
    }
  }
  for (const name of ['message', 'messageerror', 'error']) {
    const handlers = new WeakMap();
    Object.defineProperty(Worker.prototype, `on${name}`, { configurable: true, enumerable: true,
      get() { return handlers.get(this) ?? null; }, set(value) {
        const previous = handlers.get(this); if (previous) this.removeEventListener(name, previous);
        const handler = typeof value === 'function' ? value : null; handlers.set(this, handler);
        if (handler) this.addEventListener(name, handler);
      } });
  }
  Object.defineProperty(Worker.prototype, Symbol.toStringTag, { value: 'Worker' });
  window.Worker = Worker;
  window.SharedWorker = class SharedWorker {
    constructor() { throw new window.DOMException('SharedWorker is not implemented', 'NotSupportedError'); }
  };
  return { dispose, createService(input,options,configuration){const token=Symbol();serviceRequests.set(token,configuration);return new Worker(input,options,token);}, get size() { return owned.size; } };
}

async function runWorker() {
  const pending = new Map(), cachePending=new Map(), servicePending=new Map(), queued = [];
  let requestId = 1, ready = false, closed = false, context, emit, messaging, streams, broadcast,serviceRuntime;
  const lifetime = new AbortController();
  const error = value => ({ name: value?.name ?? 'Error', message: String(value?.message ?? value), stack: value?.stack, filename: workerData.url });
  const report = value => { if (!closed) parentPort.postMessage({ kind: 'error', error: error(value) }); };
  const request = (url, init = {}, script = false, signal, resourceType) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const id = requestId++;
    const abort = () => { pending.delete(id); parentPort.postMessage({ kind: 'cancel', id }); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) });
    parentPort.postMessage({ kind: 'request', id, url, init, script, resourceType });
  });
  const syncSource = url => {
    const sync = new SharedArrayBuffer(SYNC_BYTES + 8), state = new Int32Array(sync, 0, 2);
    parentPort.postMessage({ kind: 'request', url, script: true, sync });
    Atomics.wait(state, 0, 0);
    const result = JSON.parse(new TextDecoder().decode(new Uint8Array(sync, 8, Atomics.load(state, 1))));
    if (result.error) throw new Error(result.error);
    if (result.status < 200 || result.status >= 300) throw new Error(`importScripts load failed (${result.status}): ${url}`);
    return result;
  };
  const timers = new Map(); let timerId = 1;
  const bridge = {
    postMessage(data, transfer) {
      if (!closed) {
        const prepared = messaging.prepare(data, transfer);
        parentPort.postMessage({ kind: 'message', ...prepared.message }, prepared.transfer); prepared.commit();
      }
    },
    close() { if (!closed) {
      closed = true; lifetime.abort(); for (const handle of timers.values()) clearTimeout(handle); timers.clear(); messaging?.dispose(); broadcast?.dispose();
      for (const message of queued) for (const port of message.ports ?? []) port.close(); queued.length = 0;
      parentPort.postMessage({ kind: 'close' }); parentPort.close();
    } },
    report,
    timer(callback, delay, args, repeat) {
      const id = timerId++;
      const fire = () => {
        if (!repeat) timers.delete(id);
        if (closed) return;
        try { typeof callback === 'function' ? Reflect.apply(callback, vm.runInContext('globalThis', context), args) : vm.runInContext(String(callback), context); }
        catch (error) { dispatchError(error); }
      };
      const handle = (repeat ? setInterval : setTimeout)(fire, Math.max(0, Number(delay) || 0)); timers.set(id, handle); return id;
    },
    clear(id) { const handle = timers.get(Number(id)); if (handle) { clearTimeout(handle); clearInterval(handle); timers.delete(Number(id)); } },
    microtask(callback) { queueMicrotask(() => { if (!closed) { try { callback(); } catch (error) { dispatchError(error); } } }); },
    importScripts(...urls) {
      if (workerData.type === 'module') throw new TypeError('importScripts is unavailable in module workers');
      for (const input of urls) {
        const url = new URL(String(input), workerData.url).href, result = syncSource(url);
        vm.runInContext(result.source, context, { filename: result.url });
      }
    },
    async fetch(input, init = {}, resourceType) {
      const original = new Request(input instanceof Request ? input : new URL(String(input), workerData.url), init);
      const headers = [...new Headers(init.headers ?? original.headers)];
      const method = init.method ?? original.method;
      const body = ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : new Uint8Array(await original.clone().arrayBuffer());
      const result = await request(original.url, { method, headers, body, credentials: original.credentials }, false, init.signal ?? original.signal, resourceType);
      const response = new Response([204, 205, 304].includes(result.status) ? null : result.bytes, result);
      streams.adopt(response.body);
      Object.defineProperty(response, 'url', { value: result.url }); return response;
    },
    structuredClone(value, options) { return messaging.clone(value, options); },
    console(type, args) { parentPort.postMessage({ kind: 'console', type, args }); },
  };
  const sandbox = { __bridge: bridge, __url: workerData.url, __name: workerData.name, __navigator: workerData.navigator,
    URL, URLSearchParams, TextEncoder, TextDecoder, Headers, Request, Response, FormData, Blob, File,
    AbortController, AbortSignal, DOMException, crypto: globalThis.crypto, performance: globalThis.performance,
    atob, btoa };
  context = vm.createContext(sandbox);
  vm.runInContext(`(function () {
    const trustedEvents = new WeakSet();
    class Event {
      constructor(type, init = {}) { this.type = String(type); this.bubbles = Boolean(init.bubbles); this.cancelable = Boolean(init.cancelable); this.defaultPrevented = false; this.target = null; this.currentTarget = null; Object.defineProperty(this, 'isTrusted', { enumerable: true, get: () => trustedEvents.has(this) }); }
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
      stopPropagation() {} stopImmediatePropagation() { this.__stopped = true; }
    }
    class MessageEvent extends Event { constructor(type, init = {}) { super(type, init); this.data = init.data ?? null; this.ports = init.ports ?? []; this.origin = init.origin ?? ''; this.source = init.source ?? null; } }
    class ErrorEvent extends Event { constructor(type, init = {}) { super(type, init); Object.assign(this, init); } }
    class EventTarget {
      constructor() { this.__listeners = new Map(); }
      addEventListener(type, callback, options = {}) { if (!callback) return; type = String(type); const list = this.__listeners.get(type) ?? []; if (!list.some(item => item.callback === callback)) list.push({ callback, once: Boolean(options?.once), signal: options?.signal }); this.__listeners.set(type, list); }
      removeEventListener(type, callback) { const list = this.__listeners.get(String(type)); if (list) this.__listeners.set(String(type), list.filter(item => item.callback !== callback)); }
      dispatchEvent(event) { const receiver = this.__globalRoot ?? this; event.target = receiver; event.currentTarget = receiver; for (const item of [...this.__listeners.get(event.type) ?? []]) { if (item.signal?.aborted) continue; if (item.once) this.removeEventListener(event.type, item.callback); try { typeof item.callback === 'function' ? item.callback.call(receiver, event) : item.callback.handleEvent(event); } catch(error) { __dispatchError(error); } if (event.__stopped) break; } const handler = Object.hasOwn(this, 'on' + event.type) ? this['on' + event.type] : null; if (typeof handler === 'function' && !event.__stopped) { try { if (handler.call(receiver, event) === true && event.type === 'error') event.preventDefault(); } catch(error) { __dispatchError(error); } } event.currentTarget = null; return !event.defaultPrevented; }
    }
    Object.assign(globalThis, { Event, MessageEvent, ErrorEvent, EventTarget });
    globalThis.self = globalThis; globalThis.name = __name;
    Object.assign(globalThis, { onmessage: null, onmessageerror: null, onerror: null });
    const target = new EventTarget(); target.__globalRoot = globalThis;
    for (const name of ['addEventListener', 'removeEventListener']) globalThis[name] = target[name].bind(target);
    globalThis.dispatchEvent = event => { for (const key of ['onmessage', 'onmessageerror', 'onerror']) target[key] = globalThis[key]; return target.dispatchEvent(event); };
    let reportingError = false;
    globalThis.__dispatchError = error => { if (reportingError) return; reportingError = true; try { const event = new ErrorEvent('error', { message: String(error?.message ?? error), error, cancelable: true }); if (dispatchEvent(event)) __bridge.report(error); } finally { reportingError = false; } };
    globalThis.postMessage = (data, transfer) => __bridge.postMessage(data, transfer);
    globalThis.close = () => __bridge.close();
    globalThis.importScripts = (...urls) => __bridge.importScripts(...urls);
    globalThis.setTimeout = function(callback, delay = 0, ...args) { return __bridge.timer(callback, delay, args, false); };
    globalThis.setInterval = function(callback, delay = 0, ...args) { return __bridge.timer(callback, delay, args, true); };
    globalThis.clearTimeout = globalThis.clearInterval = id => __bridge.clear(id);
    globalThis.queueMicrotask = callback => __bridge.microtask(callback);
    globalThis.fetch = async (input, init) => __bridge.fetch(input, init);
    globalThis.structuredClone = (value, options) => __bridge.structuredClone(value, options);
    globalThis.console = Object.fromEntries(['log','info','warn','error','debug'].map(type => [type, (...args) => __bridge.console(type, args)]));
    class WorkerLocation { constructor(url) { for (const key of ['href','origin','protocol','host','hostname','port','pathname','search','hash']) Object.defineProperty(this, key, { value: url[key], enumerable: true }); } toString() { return this.href; } }
    Object.assign(globalThis, { WorkerLocation, location: new WorkerLocation(new URL(__url)) });
    class WorkerNavigator {} Object.assign(WorkerNavigator.prototype, { appName: 'Netscape', onLine: true });
    const nav = new WorkerNavigator(); Object.assign(nav, __navigator); Object.defineProperty(WorkerNavigator.prototype, Symbol.toStringTag, { value: 'WorkerNavigator' });
    Object.assign(globalThis, { WorkerNavigator, navigator: nav });
    globalThis.Worker = class Worker { constructor() { throw new DOMException('Nested workers are not implemented', 'NotSupportedError'); } };
    globalThis.__trustWorkerEvent=event=>{trustedEvents.add(event);return event;};
    const createTrustedMessage = (type, data, ports, origin = '') => { const event = new MessageEvent(type, { data, ports, origin }); trustedEvents.add(event); return event; };
    globalThis.__createTrustedMessage = createTrustedMessage;
    globalThis.__emitMessage = (data, ports) => dispatchEvent(createTrustedMessage('message', data, ports));
  })();`, context);
  emit = vm.runInContext('__emitMessage', context);
  const createTrustedMessage = vm.runInContext('__createTrustedMessage', context);
  const trustWorkerEvent=vm.runInContext('__trustWorkerEvent',context);
  messaging = createMessagingRealm(vm.runInContext('globalThis', context), {
    active: () => !closed,
    dispatch: (target, type, data, ports) => target.dispatchEvent(createTrustedMessage(type, data, ports)),
    reportError: value => dispatchError(value),
  });
  Object.assign(context, { MessageChannel: messaging.MessageChannel, MessagePort: messaging.MessagePort });
  broadcast = createBroadcastRealm(vm.runInContext('globalThis', context), {messaging, config:workerData.broadcast, active:()=>!closed, relay:value=>parentPort.postMessage(value), dispatch:(target,type,data,ports,origin)=>target.dispatchEvent(createTrustedMessage(type,data,ports,origin)), reportError:value=>dispatchError(value)});
  Object.assign(context,{BroadcastChannel:broadcast.BroadcastChannel});
  installNavigator(workerData.navigator, vm.runInContext('globalThis', context), { worker: true, active: () => !closed });
  streams = installStreams(null, vm.runInContext('globalThis', context), { signal: lifetime.signal });
  installImageData(vm.runInContext('globalThis', context));
  installCanvas(vm.runInContext('globalThis', context));
  installGeometry(vm.runInContext('globalThis', context));
  installWebCodecsValues(vm.runInContext('globalThis', context));
  installAudioData(vm.runInContext('globalThis', context));
  installVideoFrame(vm.runInContext('globalThis', context),{canvasSnapshot,canvasDimensions});
  installWebCodecsProcessors(vm.runInContext('globalThis', context),{trustEvent:trustWorkerEvent});
  installWorkerAPIs(vm.runInContext('globalThis',context),{evaluate:source=>vm.runInContext(source,context),fetch:(input,init)=>bridge.fetch(input,init,'XHR'),syncRequest:createSyncWorkerRequest(parentPort),socketPolicy:createSyncWorkerSocketPolicy(parentPort),origin:workerData.origin,baseURL:()=>workerData.url,secure:workerData.secure,signal:lifetime.signal,active:()=>!closed,trustEvent:trustWorkerEvent,dedicated:!workerData.service});
  installCache({url:workerData.url,securityOrigin:workerData.cacheOrigin,documentAbort:lifetime},vm.runInContext('globalThis',context),{enabled:workerData.cacheEnabled,secure:workerData.secure,baseURL:()=>workerData.url,
    store:{operate(_origin,operation,args){return new Promise((resolve,reject)=>{const id=requestId++;cachePending.set(id,{resolve,reject});parentPort.postMessage({kind:'cacheOperation',id,operation,args});});}},evaluate:source=>vm.runInContext(source,context)});

  if(workerData.service)serviceRuntime=installServiceWorkerRealm(vm.runInContext('globalThis',context),{evaluate:source=>vm.runInContext(source,context),initial:workerData.service,active:()=>!closed,trustEvent:trustWorkerEvent,
    call(operation,args){return new Promise((resolve,reject)=>{const id=requestId++;servicePending.set(id,{resolve,reject});parentPort.postMessage({kind:'serviceCall',id,operation,args});});}});
  vm.runInContext('delete globalThis.__emitMessage; delete globalThis.__createTrustedMessage;delete globalThis.__trustWorkerEvent;', context);
  const dispatchError = value => vm.runInContext('__dispatchError', context)(value);
  parentPort.on('message', message => {
    if (closed) return;
    if(message.kind==='serviceState'){serviceRuntime?.update(message.record,true);}
    else if(message.kind==='serviceLifecycle'){serviceRuntime.dispatch(message.type).then(()=>{if(!closed)parentPort.postMessage({kind:'serviceLifecycle',type:message.type});},failure=>{if(!closed)parentPort.postMessage({kind:'serviceLifecycle',type:message.type,error:error(failure)});});}
    else if(message.kind==='serviceResponse'){const entry=servicePending.get(message.id);if(!entry)return;servicePending.delete(message.id);message.error?entry.reject(Object.assign(new Error(message.error.message),{name:message.error.name})):entry.resolve(message.result);}
    else if(message.kind==='cacheResponse') {const entry=cachePending.get(message.id);if(!entry)return;cachePending.delete(message.id);message.error?entry.reject(Object.assign(new Error(message.error.message),{name:message.error.name})):entry.resolve(message.result);}
    else if (message.kind === 'response') {
      const entry = pending.get(message.id); if (!entry) return; pending.delete(message.id); entry.cleanup();
      message.error ? entry.reject(new Error(message.error)) : entry.resolve(message.result);
    } else if (message.kind === 'message') {
      if (!ready) queued.push(message); else { messaging.deliver(vm.runInContext('globalThis', context), message, ({data,ports})=>emit(data,ports)); }
    }
  });
  process.on('unhandledRejection', dispatchError);
  try {
    const result = await request(workerData.url, {}, true);
    if (result.status < 200 || result.status >= 300) throw new Error(`Worker load failed (${result.status}): ${workerData.url}`);
    workerData.url = result.url;
    context.__resolvedURL = result.url;
    vm.runInContext('globalThis.location = new WorkerLocation(new URL(__resolvedURL)); delete globalThis.__resolvedURL;', context);
    const source = new TextDecoder().decode(result.bytes);
    {
      const modules = new Map(), evaluations = new WeakMap();
      let linking = Promise.resolve();
      const validateModule = result => {
        const mime = new Headers(result.headers).get('content-type') ?? '';
        if (!/^(?:text|application)\/(?:javascript|ecmascript|x-javascript)(?:\s*;|$)/i.test(mime)) throw new TypeError(`Worker module has unsupported MIME type: ${mime}`);
      };
      const specifierURL = (specifier, parent) => {
        if (!/^(?:[./]|[a-zA-Z][a-zA-Z\d+.-]*:)/.test(specifier)) throw new TypeError(`Unmapped bare worker module specifier: ${specifier}`);
        return new URL(specifier, parent.identifier).href;
      };
      const attributes = value => { if (Object.keys(value?.attributes ?? value ?? {}).length) throw new TypeError('Worker module import attributes are not supported'); };
      const dynamicImport = async (specifier, parent, extra) => {
        attributes(extra); const module = await load(specifierURL(specifier, parent)); await evaluate(module); return module;
      };
      const compile = (source, url) => {
        if (!vm.SourceTextModule) throw new Error('Worker module imports require Node --experimental-vm-modules');
        return new vm.SourceTextModule(source, { context, identifier: url,
          initializeImportMeta(meta) { meta.url = url; }, importModuleDynamically: dynamicImport });
      };
      const load = url => {
        if (!modules.has(url)) modules.set(url, request(url, {}, true).then(result => {
          if (result.status < 200 || result.status >= 300) throw new TypeError('Abort', { cause: new Error(`Worker module load failed (${result.status}): ${url}`) });
          validateModule(result);
          return compile(new TextDecoder().decode(result.bytes), result.url);
        }));
        return modules.get(url);
      };
      const linker = (specifier, parent, extra) => { attributes(extra); return load(specifierURL(specifier, parent)); };
      const evaluate = async module => {
        const linked = linking.then(async () => { if (module.status === 'unlinked') await module.link(linker); });
        linking = linked.catch(() => {}); await linked;
        if (!evaluations.has(module)) evaluations.set(module, module.evaluate());
        return evaluations.get(module);
      };
      if (workerData.type === 'module') {
        validateModule(result);
        const root = compile(source, workerData.url); modules.set(workerData.url, Promise.resolve(root));
        await evaluate(root);
      } else vm.runInContext(source, context, { filename: workerData.url,
        importModuleDynamically: (specifier, _script, extra) => dynamicImport(specifier, { identifier: workerData.url }, extra),
      });
    }
    ready = true;
    if(workerData.service)parentPort.postMessage({kind:'serviceReady'});
    for (const message of queued) { if (!closed) { messaging.deliver(vm.runInContext('globalThis', context), message, ({data,ports})=>emit(data,ports)); } }
    queued.length = 0;
  } catch (failure) { if(workerData.service)parentPort.postMessage({kind:'serviceError',error:error(failure)});else dispatchError(failure); }
}

if (!isMainThread && workerData?.redPandaWorker) void runWorker();
