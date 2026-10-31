import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { installNavigator, createNavigatorRealm, navigatorSource, navigatorProfile } from '../src/navigator.js';

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html>', { url: 'https://navigator.test/', runScripts: 'outside-only' });
  const source = { userAgent: 'RedPanda/navigator-test', platform: 'Linux x86_64', acceptLanguage: 'en-US,en;q=0.9',
    documentGeneration: 1, documentAbort: new AbortController(), closed: false };
  const adapter = installNavigator(source, dom.window, options);
  t.after(() => { source.closed = true; source.documentAbort.abort(); adapter.dispose(); dom.window.close(); });
  return { source, window: dom.window, navigator: dom.window.navigator, adapter };
}
const workerBootstrap = `
  class Event { constructor(type){this.type=type} }
  class EventTarget {
    constructor(){this.listeners=new Map()}
    addEventListener(type,callback){const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list)}
    removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)||[]).filter(value=>value!==callback))}
    dispatchEvent(event){for(const callback of this.listeners.get(event.type)||[])callback.call(this,event);return true}
  }
  Object.assign(globalThis,{Event,EventTarget});
`;

test('Window navigator retains its interface and exposes live prototype metadata with stable API identities', t => {
  const { window, source, navigator } = fixture(t);
  assert.ok(navigator instanceof window.Navigator); assert.equal(navigator.appName, 'Netscape'); assert.equal(navigator.appCodeName, 'Mozilla');
  assert.equal(navigator.appVersion, '5.0 (X11)'); assert.equal(navigator.product, 'Gecko'); assert.equal(navigator.vendor, '');
  assert.equal(navigator.onLine, true); assert.equal(navigator.cookieEnabled, true); assert.equal(navigator.webdriver, false);
  assert.equal(navigator.doNotTrack, null); assert.equal(navigator.globalPrivacyControl, false);
  assert.equal(navigator.permissions, navigator.permissions); assert.equal(navigator.storage, navigator.storage); assert.equal(navigator.userAgentData, navigator.userAgentData);
  assert.equal(Object.getOwnPropertyDescriptor(navigator, 'permissions'), undefined);
  const descriptor = Object.getOwnPropertyDescriptor(window.Navigator.prototype, 'permissions');
  assert.equal(typeof descriptor.get, 'function'); assert.equal(descriptor.enumerable, true); assert.equal(descriptor.set, undefined);
  assert.ok(navigator.languages instanceof window.Array); assert.deepEqual([...navigator.languages], ['en-US', 'en']);
  source.userAgent = 'ConfiguredBrowser/9'; source.platform = 'Win32'; source.acceptLanguage = 'fr-CA,fr;q=0.8';
  assert.equal(navigator.userAgent, 'ConfiguredBrowser/9'); assert.equal(navigator.platform, 'Win32'); assert.equal(navigator.language, 'fr-CA');
  assert.deepEqual([...navigator.languages], ['fr-CA', 'fr']); assert.equal(navigator.userAgentData.platform, 'Windows');
  Object.defineProperty(navigator, 'userAgent', { get: () => source.userAgent });
  source.userAgent = 'UpdatedAfterInstallation/10'; assert.equal(navigator.userAgent, 'UpdatedAfterInstallation/10');
});

test('Permissions queries return fresh realm EventTargets with prompt metadata and functioning change handlers', async t => {
  const { window, navigator } = fixture(t), pending = navigator.permissions.query({ name: 'geolocation' });
  assert.ok(pending instanceof window.Promise);
  const first = await pending, second = await navigator.permissions.query({ name: 'geolocation' });
  assert.notEqual(first, second); assert.ok(first instanceof window.PermissionStatus); assert.ok(first instanceof window.EventTarget);
  assert.equal(Object.prototype.toString.call(first), '[object PermissionStatus]'); assert.equal(first.name, 'geolocation'); assert.equal(first.state, 'prompt');
  assert.equal(first.onchange, null); assert.deepEqual(Object.keys(first), []);
  let events = 0; first.onchange = () => events += 100; const handler = () => events++;
  first.onchange = handler; assert.equal(first.onchange, handler); first.addEventListener('change', () => events++);
  first.dispatchEvent(new window.Event('change')); assert.equal(events, 2); assert.equal(first.state, 'prompt');
  assert.equal((await navigator.permissions.query({ name: 'unknown-permission-name' })).state, 'prompt');
  assert.equal((await navigator.permissions.query({ name: 42 })).name, '42');
  assert.equal((await navigator.permissions.query({ name: null })).name, 'null');
  assert.equal((await navigator.permissions.query({ name: Symbol('actual') })).name, 'actual');
  assert.equal((await navigator.permissions.query({ name: 'midi', sysex: true })).state, 'prompt');
  assert.equal(navigator.permissions.request, undefined); assert.equal(navigator.permissions.revoke, undefined);
});

test('permission and UA descriptor failures reject realm promises and interface constructors reject direct creation', async t => {
  const { window, navigator } = fixture(t);
  for (const input of [undefined, null, {}, { name: undefined }]) {
    const result = navigator.permissions.query(input); assert.ok(result instanceof window.Promise); await assert.rejects(result, window.TypeError);
  }
  await assert.rejects(window.Permissions.prototype.query.call({}, { name: 'camera' }), window.TypeError);
  await assert.rejects(window.StorageManager.prototype.estimate.call({}), window.TypeError);
  for (const input of [undefined, null, {}, 42, 'architecture']) {
    const result = navigator.userAgentData.getHighEntropyValues(input); assert.ok(result instanceof window.Promise); await assert.rejects(result, window.TypeError);
  }
  for (const name of ['Permissions', 'PermissionStatus', 'StorageManager', 'StorageEstimate', 'NavigatorUAData']) assert.throws(() => new window[name](), window.TypeError);
  const getter = Object.getOwnPropertyDescriptor(window.NavigatorUAData.prototype, 'platform').get;
  assert.throws(() => getter.call({}), window.TypeError);
});

test('StorageManager estimates snapshot actual configured backend usage and expose no fictitious persistence', async t => {
  const records = new Map();
  const { window, navigator } = fixture(t, { estimate: () => ({
    usage: [...records.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0), quota: 4096,
  }) });
  const empty = await navigator.storage.estimate(); records.set('record', 'actual bytes'); const used = await navigator.storage.estimate();
  assert.ok(empty instanceof window.StorageEstimate); assert.equal(empty.usage, 0); assert.equal(empty.quota, 4096);
  assert.equal(used.usage, Buffer.byteLength('actual bytes')); assert.equal(empty.usage, 0); assert.notEqual(empty, used);
  assert.equal(Object.prototype.toString.call(used), '[object StorageEstimate]'); assert.deepEqual(Object.keys(used), []);
  assert.equal(navigator.storage.persist, undefined); assert.equal(navigator.storage.persisted, undefined); assert.equal(navigator.storage.getDirectory, undefined);
});

test('default managed-storage budget matches the native empty-origin profile', async t => {
  const { window, navigator } = fixture(t), pending = navigator.storage.estimate(); assert.ok(pending instanceof window.Promise);
  const result = await pending; assert.equal(result.usage, 0); assert.equal(result.quota, 1024 ** 3);
  assert.ok(navigator.hardwareConcurrency > 0); assert.ok(navigator.hardwareConcurrency <= 4); assert.ok(navigator.deviceMemory > 0);
});

test('UAData returns fresh realm brand arrays and native-observed full entropy for valid hint iterables', async t => {
  const { window, source, navigator } = fixture(t), ua = navigator.userAgentData;
  assert.equal(Object.prototype.toString.call(ua), '[object NavigatorUAData]'); assert.notEqual(ua.brands, ua.brands);
  const brands = ua.brands; assert.ok(brands instanceof window.Array); assert.ok(brands[0] instanceof window.Object);
  assert.equal(brands[0].brand, 'RedPanda'); brands[0].brand = 'mutated'; assert.equal(ua.brands[0].brand, 'RedPanda');
  assert.equal(Object.isFrozen(brands), false);
  const low = ua.toJSON(); assert.deepEqual(Object.keys(low), ['brands', 'mobile', 'platform']); assert.ok(low instanceof window.Object);
  const pending = ua.getHighEntropyValues(new window.Set(['unknown-hint'])); assert.ok(pending instanceof window.Promise);
  const high = await pending; assert.equal(high.architecture, navigatorProfile.architecture); assert.equal(high.bitness, navigatorProfile.bitness);
  assert.equal(high.uaFullVersion, navigatorProfile.version); assert.ok(high.fullVersionList instanceof window.Array);
  assert.deepEqual([...high.formFactor], ['Desktop']); assert.equal(high.wow64, false); assert.equal(high.formFactors, undefined);
  source.userAgentMetadata = { platform: 'Custom OS', architecture: 'arm', bitness: '64', mobile: true,
    brands: [{ brand: 'Configured', version: '12' }], fullVersionList: [{ brand: 'Configured', version: '12.3.4' }], fullVersion: '12.3.4' };
  const updated = await ua.getHighEntropyValues([]); assert.equal(updated.platform, 'Custom OS'); assert.equal(updated.architecture, 'arm');
  assert.equal(updated.mobile, true); assert.equal(updated.brands[0].brand, 'Configured'); assert.equal(updated.fullVersionList[0].version, '12.3.4');
});

test('pure factory source installs WorkerNavigator without exposing Window-only properties', async () => {
  const context = vm.createContext({ DOMException }); vm.runInContext(workerBootstrap, context);
  const scope = vm.runInContext('globalThis', context), source = { userAgent: 'WorkerClient/1', platform: 'MacIntel', language: 'en', languages: ['en'] };
  const factory = vm.runInContext(navigatorSource, context), adapter = factory(scope, { worker: true, get: name => source[name], profile: navigatorProfile });
  const nav = scope.navigator;
  assert.equal(Object.getPrototypeOf(nav), scope.WorkerNavigator.prototype); assert.equal(Object.prototype.toString.call(nav), '[object WorkerNavigator]');
  assert.equal(scope.Navigator, undefined); assert.equal(nav.userAgent, 'WorkerClient/1'); assert.equal(nav.userAgentData.platform, 'macOS');
  for (const name of ['plugins', 'registerProtocolHandler', 'modelContext', 'sendBeacon', 'cookieEnabled', 'webdriver', 'doNotTrack', 'maxTouchPoints']) assert.equal(nav[name], undefined);
  assert.equal(nav.vendor, ''); assert.equal(nav.globalPrivacyControl, false); assert.ok(nav.languages instanceof scope.Array);
  const permission = await nav.permissions.query({ name: 'geolocation' }); assert.ok(permission instanceof scope.EventTarget); assert.equal(permission.state, 'prompt');
  source.userAgent = 'WorkerClient/2'; assert.equal(nav.userAgent, 'WorkerClient/2'); adapter.dispose();
});

test('navigator APIs run in an actual worker thread and return the requesting VM realm values', async t => {
  const moduleURL = new URL('../src/navigator.js', import.meta.url).href;
  const thread = new Worker(`const {parentPort}=require('node:worker_threads');const vm=require('node:vm');
    (async()=>{const {installNavigator}=await import(${JSON.stringify(moduleURL)});const context=vm.createContext({DOMException});vm.runInContext(${JSON.stringify(workerBootstrap)},context);const scope=vm.runInContext('globalThis',context);installNavigator({userAgent:'ActualWorker/8',platform:'Linux x86_64',language:'en-US',languages:['en-US','en']},scope,{worker:true});
    const result=await vm.runInContext('(async()=>{const permission=await navigator.permissions.query({name:"geolocation"});const estimate=await navigator.storage.estimate();const high=await navigator.userAgentData.getHighEntropyValues(["architecture"]);return {userAgent:navigator.userAgent,name:permission.name,state:permission.state,target:permission instanceof EventTarget,quota:estimate.quota,usage:estimate.usage,architecture:high.architecture,realm:high instanceof Object&&high.brands instanceof Array,worker:Object.getPrototypeOf(navigator)===WorkerNavigator.prototype,noWindow:typeof Navigator==="undefined"&&navigator.plugins===undefined&&navigator.sendBeacon===undefined&&navigator.cookieEnabled===undefined}})()',context);parentPort.postMessage(result)})().catch(error=>{throw error});`, { eval: true });
  t.after(() => thread.terminate()); const [result] = await once(thread, 'message');
  assert.equal(result.userAgent, 'ActualWorker/8'); assert.equal(result.name, 'geolocation'); assert.equal(result.state, 'prompt');
  assert.equal(result.target, true); assert.equal(result.quota, 1024 ** 3); assert.equal(result.usage, 0); assert.equal(typeof result.architecture, 'string');
  assert.equal(result.realm, true); assert.equal(result.worker, true); assert.equal(result.noWindow, true);
});

test('document disposal suppresses pending navigator promise callbacks', async t => {
  let resolveEstimate; const backend = new Promise(resolve => { resolveEstimate = resolve; });
  const { navigator, source } = fixture(t, { estimate: () => backend });
  let callbacks = 0; navigator.storage.estimate().then(() => callbacks++, () => callbacks++);
  navigator.permissions.query({ name: 'geolocation' }).then(() => callbacks++, () => callbacks++);
  source.documentAbort.abort(); resolveEstimate({ usage: 10, quota: 100 }); await delay(10); assert.equal(callbacks, 0);
});
