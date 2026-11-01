import {captureIDLMemberFactory} from './public-idl-member.js';
import { createRequire } from 'node:module';
import { arch, availableParallelism, totalmem } from 'node:os';
import {permissionStateProvider} from './permission-control.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const cpu = arch();
export const navigatorProfile = Object.freeze({
  brand: 'RedPanda', version,
  architecture: /^(?:x64|ia32)$/.test(cpu) ? 'x86' : /^arm/.test(cpu) ? 'arm' : cpu.replace(/64$/, ''),
  bitness: /64|s390x/.test(cpu) ? '64' : '32', hardwareConcurrency: Math.min(4, availableParallelism()),
  deviceMemory: Math.min(8, Math.max(0.25, 2 ** Math.floor(Math.log2(totalmem() / 1024 ** 3)))),
  storageQuota: 1024 ** 3,
});

/** Pure realm factory, also available as navigatorSource for vm bootstrap.
 * get(name) supplies live navigator configuration; profile carries engine/CPU
 * metadata. estimate() optionally reads a real managed-storage provider.
 * Default managed storage is empty with the observed 1-GiB virtual origin
 * budget. Device access is not performed. Permissions capture the actual
 * private owner provider state at query time (prompt without a provider); each
 * name is string-coerced and each query returns a new snapshot status.
 */
export function createNavigatorRealm(realm, {
  worker = false, get = () => undefined, profile = {}, estimate, active = () => true, permissionState, navigatorAttribute,
} = {}) {
  const Object = realm.Object, Array = realm.Array, Promise = realm.Promise, TypeErrorConstructor = realm.TypeError;
  const symbolDescription = Object.getOwnPropertyDescriptor(realm.Symbol.prototype, 'description').get;
  const addListener = realm.EventTarget.prototype.addEventListener, removeListener = realm.EventTarget.prototype.removeEventListener;
  const secret = {}, navigatorObjects = new WeakSet(), permissionsObjects = new WeakSet(),
    storageObjects = new WeakSet(), uaObjects = new WeakSet(), statuses = new WeakMap(), estimates = new WeakMap();
  let disposed = false;
  const live = () => !disposed && active();
  const fail = (message = 'Illegal invocation') => { throw new TypeErrorConstructor(message); };
  const text = value => typeof value === 'symbol' ? fail('Cannot convert a Symbol to a string') : String(value);
  const object = entries => Object.assign(new Object(), entries);
  const list = values => Array.from(values);
  const promise = task => new Promise((resolve, reject) => {
    Promise.resolve().then(task).then(value => { if (live()) resolve(value); }, error => { if (live()) reject(error); });
  });
  const check = (registry, receiver) => registry.has(receiver) || fail();
  const attribute = (prototype, name, getter) => Object.defineProperty(prototype, name,
    { enumerable: true, configurable: true, get: getter });
  const metadata = () => get('userAgentMetadata') ?? {};
  const platform = () => text(get('platform') ?? 'Linux x86_64');
  const uaPlatform = () => {
    const override = metadata().platform;
    if (override !== undefined) return text(override);
    const value = platform();
    return /mac/i.test(value) ? 'macOS' : /win/i.test(value) ? 'Windows' : /linux/i.test(value) ? 'Linux' : /freebsd/i.test(value) ? 'FreeBSD' : 'Unknown';
  };
  const brands = () => list(metadata().brands ?? [{ brand: profile.brand ?? 'RedPanda', version: profile.version ?? '' }])
    .map(value => object({ brand: text(value.brand), version: text(value.version) }));
  const mobile = () => Boolean(metadata().mobile ?? false);
  const lowEntropy = () => object({ brands: brands(), mobile: mobile(), platform: uaPlatform() });
  const languageList = () => {
    const configured = get('languages');
    if (configured !== undefined) return list(configured).map(text);
    return list(['en-US', 'en']);
  };
  class PermissionStatus extends realm.EventTarget {
    constructor(token, name) {
      super(); if (token !== secret) fail('Illegal constructor'); statuses.set(this, { name, state:arguments[2]??'prompt', onchange: null });
    }
    get name() { const value = statuses.get(this); if (!value) fail(); return value.name; }
    get state() { const value=statuses.get(this);if(!value)fail();return value.state; }
    get onchange() { const value = statuses.get(this); if (!value) fail(); return value.onchange; }
    set onchange(value) {
      const state = statuses.get(this); if (!state) fail();
      if (state.onchange) Reflect.apply(removeListener, this, ['change', state.onchange]);
      state.onchange = typeof value === 'function' ? value : null;
      if (state.onchange) Reflect.apply(addListener, this, ['change', state.onchange]);
    }
    get [Symbol.toStringTag]() { return 'PermissionStatus'; }
  }
  class Permissions {
    constructor(token) { if (token !== secret) fail('Illegal constructor'); permissionsObjects.add(this); }
    query(descriptor) {
      let name, state, failure, failed = false;
      // Native argument conversion runs before returning the realm Promise.
      // Actual settlement still belongs to this document's private lifetime.
      try {
        check(permissionsObjects, this);
        if (descriptor === null || descriptor === undefined) fail('invalid argument');
        const input = descriptor.name;
        if (input === undefined) fail('invalid argument');
        name = typeof input === 'symbol' ? String(Reflect.apply(symbolDescription, input, [])) : text(input);
        state=permissionState?permissionState(name):'prompt';
      } catch (error) { failed = true; failure = error; }
      return promise(() => {
        if (failed) throw failure;
        return new PermissionStatus(secret, name, state);
      });
    }
    get [Symbol.toStringTag]() { return 'Permissions'; }
  }
  class StorageEstimate {
    constructor(token, value) { if (token !== secret) fail('Illegal constructor'); estimates.set(this, value); }
    get usage() { const value = estimates.get(this); if (!value) fail(); return value.usage; }
    get quota() { const value = estimates.get(this); if (!value) fail(); return value.quota; }
    get [Symbol.toStringTag]() { return 'StorageEstimate'; }
  }
  class StorageManager {
    constructor(token) { if (token !== secret) fail('Illegal constructor'); storageObjects.add(this); }
    estimate() {
      return promise(async () => {
        check(storageObjects, this);
        const value = estimate ? await estimate() : { usage: 0, quota: profile.storageQuota ?? 1024 ** 3 };
        if (!value || !Number.isFinite(value.usage) || value.usage < 0 || !Number.isFinite(value.quota) || value.quota < 0) {
          fail('Storage provider returned an invalid estimate');
        }
        return new StorageEstimate(secret, { usage: value.usage, quota: value.quota });
      });
    }
    get [Symbol.toStringTag]() { return 'StorageManager'; }
  }
  class NavigatorUAData {
    constructor(token) { if (token !== secret) fail('Illegal constructor'); uaObjects.add(this); }
    get brands() { check(uaObjects, this); return brands(); }
    get mobile() { check(uaObjects, this); return mobile(); }
    get platform() { check(uaObjects, this); return uaPlatform(); }
    toJSON() { check(uaObjects, this); return lowEntropy(); }
    getHighEntropyValues(hints) {
      return promise(() => {
        check(uaObjects, this);
        if (hints === null || typeof hints !== 'object' || typeof hints[Symbol.iterator] !== 'function') fail('Hints must be an iterable object');
        Array.from(hints, text);
        const meta = metadata();
        return Object.assign(lowEntropy(), {
          architecture: text(meta.architecture ?? profile.architecture ?? ''), bitness: text(meta.bitness ?? profile.bitness ?? ''),
          model: text(meta.model ?? ''), platformVersion: text(meta.platformVersion ?? ''),
          uaFullVersion: text(meta.uaFullVersion ?? meta.fullVersion ?? profile.version ?? ''),
          fullVersionList: list(meta.fullVersionList ?? brands()).map(value => object({ brand: text(value.brand), version: text(value.version) })),
          wow64: Boolean(meta.wow64 ?? false), formFactor: list(meta.formFactor ?? meta.formFactors ?? ['Desktop']).map(text),
        });
      });
    }
    get [Symbol.toStringTag]() { return 'NavigatorUAData'; }
  }
  class WorkerNavigator {
    constructor(token) { if (token !== secret) fail('Illegal constructor'); navigatorObjects.add(this); }
    get [Symbol.toStringTag]() { return 'WorkerNavigator'; }
  }
  const navigator = worker ? new WorkerNavigator(secret) : realm.navigator;
  if (!navigator) fail('A Window navigator is required');
  navigatorObjects.add(navigator);
  const prototype = Object.getPrototypeOf(navigator);
  const permissions = new Permissions(secret), storage = new StorageManager(secret), ua = new NavigatorUAData(secret);
  const values = {
    userAgent: () => text(get('userAgent') ?? 'RedPanda'), appName: () => 'Netscape', appCodeName: () => 'Mozilla',
    appVersion: () => /win/i.test(platform()) ? '5.0 (Windows)' : /mac/i.test(platform()) ? '5.0 (Macintosh)' : '5.0 (X11)',
    platform, product: () => 'Gecko', vendor: () => '', onLine: () => Boolean(get('onLine') ?? true),
    language: () => text(get('language') ?? languageList()[0] ?? ''), languages: languageList,
    hardwareConcurrency: () => get('hardwareConcurrency') ?? profile.hardwareConcurrency ?? 4,
    deviceMemory: () => get('deviceMemory') ?? profile.deviceMemory ?? 8,
    globalPrivacyControl: () => Boolean(get('globalPrivacyControl') ?? false),
    permissions: () => permissions, storage: () => storage, userAgentData: () => ua,
  };
  if (!worker) Object.assign(values, { cookieEnabled: () => Boolean(get('cookieEnabled') ?? true),
    maxTouchPoints: () => get('maxTouchPoints') ?? 0, webdriver: () => Boolean(get('webdriver') ?? false), doNotTrack: () => get('doNotTrack') ?? null });
  for (const [name, getter] of Object.entries(values)) {
    const operation = function () { check(navigatorObjects, this); return getter(); };
    attribute(prototype, name, navigatorAttribute ? navigatorAttribute(name, operation) : operation);
  }
  if (!worker) {
    for (const name of ['vendorSub', 'productSub']) if (Object.getOwnPropertyDescriptor(prototype, name)?.configurable) delete prototype[name];
  }
  const interfaces = { Permissions, PermissionStatus, StorageManager, StorageEstimate, NavigatorUAData, ...(worker ? { WorkerNavigator } : {}) };
  for (const Constructor of Object.values(interfaces)) {
    if (Constructor !== PermissionStatus) {
      Object.setPrototypeOf(Constructor, realm.Function.prototype); Object.setPrototypeOf(Constructor.prototype, Object.prototype);
    }
    for (const name of Object.getOwnPropertyNames(Constructor.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(Constructor.prototype, name);
      Object.defineProperty(Constructor.prototype, name, { ...descriptor, enumerable: true });
    }
  }
  for (const [name, value] of Object.entries(interfaces)) Object.defineProperty(realm, name, { value, configurable: true, writable: true });
  if (worker) Object.defineProperty(realm, 'navigator', { value: navigator, configurable: true, writable: false });
  return { navigator, ...interfaces, dispose() { disposed = true; } };
}

export const navigatorSource = `(${createNavigatorRealm.toString()})`;
const INSTALLED = new WeakMap();

/** Window: installNavigator(page,window). Worker after EventTarget bootstrap:
 * installNavigator(workerData.navigator,scope,{worker:true,active:()=>!closed}).
 * The Worker form replaces its minimal navigator without exporting Navigator or
 * Window-only properties. Reads stay live against source fields or options.get.
 */
export function installNavigator(source, realm, options = {}) {
  if (INSTALLED.has(realm)) return INSTALLED.get(realm);
  const original = realm.navigator;
  const fallback = Object.fromEntries(['userAgent', 'platform', 'language', 'languages'].map(name => [name, original?.[name]]));
  const generation = source?.documentGeneration, signal = source?.documentAbort?.signal;
  const get = options.get ?? (name => {
    if (source?.[name] !== undefined) return source[name];
    if (name === 'language' || name === 'languages') {
      if (source?.acceptLanguage !== undefined) {
        const values = String(source.acceptLanguage).split(',').map(value => value.split(';')[0].trim()).filter(Boolean);
        return name === 'language' ? values[0] ?? '' : values;
      }
    }
    return fallback[name];
  });
  const active = options.active ?? (() => !source?.closed && (!signal || !signal.aborted) &&
    (generation === undefined || source?.documentGeneration === generation) && (options.worker || !!realm.document));
  const permissionState=options.permissionState??(source?.browser?permissionStateProvider(source):undefined);
  let navigatorAttribute;
  if (source?.browser && !options.worker) {
    // Trusted owned-Window startup, before authored scripts/preloads. Real V8
    // entries are born in this VM; the original operations remain private.
    const member = captureIDLMemberFactory(realm);
    const names = new Set(['userAgent', 'appName', 'appCodeName', 'appVersion', 'platform',
      'language', 'languages', 'onLine', 'cookieEnabled', 'hardwareConcurrency',
      'deviceMemory', 'maxTouchPoints', 'vendor', 'product', 'webdriver', 'doNotTrack',
      'globalPrivacyControl']);
    navigatorAttribute = (name, operation) => names.has(name) ? member(name, 'get', operation) : operation;
    // plugins keeps its genuine generated operation/backend and original cache.
    const prototype = Object.getPrototypeOf(original);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'plugins');
    if (typeof descriptor?.get !== 'function') throw new TypeError('An original Navigator plugins getter is required');
    Object.defineProperty(prototype, 'plugins', { ...descriptor, get: member('plugins', 'get', descriptor.get) });
  }
  const result = createNavigatorRealm(realm, { ...options, get, active, permissionState, navigatorAttribute, profile: { ...navigatorProfile, ...options.profile } });
  signal?.addEventListener('abort', () => result.dispose(), { once: true });
  INSTALLED.set(realm, result); return result;
}
