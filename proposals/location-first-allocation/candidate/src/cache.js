// Independent buffered Cache API. Data ownership is explicit so Window and real
// worker realms can share an origin store without exposing its objects to JS.
// This matches measured native matching (GET/URL/ignoreSearch); Vary comparison,
// ignoreMethod, matchAll, disk persistence and quota eviction are not supported.
const CONTEXT_STORES = new WeakMap();
export function cacheStoreFor(page) {
  const owner = page.context ?? page;
  if (!CONTEXT_STORES.has(owner)) CONTEXT_STORES.set(owner, createCacheStore());
  return CONTEXT_STORES.get(owner);
}
export function createCacheStore() {
  const origins = new Map(), handles = new Map(); let next = 1;
  const copy = value => structuredClone(value);
  const matching = (entry, query, options = {}) => {
    if (!query) return true;
    if (query.method !== 'GET') return false;
    const left = new URL(entry.url), right = new URL(query.url);
    if (options.ignoreSearch) { left.search = ''; right.search = ''; }
    return left.href === right.href;
  };
  return {
    operate(origin, operation, args = []) {
      let names = origins.get(origin);
      if (!names) { names = new Map(); origins.set(origin, names); }
      if (operation === 'open') {
        const name = args[0];
        if (!names.has(name)) { const cache = { id: next++, entries: [] }; names.set(name, cache); handles.set(cache.id, cache); }
        return names.get(name).id;
      }
      if (operation === 'hasName') return names.has(args[0]);
      if (operation === 'deleteName') return names.delete(args[0]);
      if (operation === 'names') return [...names.keys()];
      if (operation === 'storageMatch') {
        const [query, options] = args;
        const caches = options.cacheName === undefined ? [...names.values()] : [names.get(options.cacheName)].filter(Boolean);
        for (const cache of caches) { const hit = cache.entries.find(entry => matching(entry, query, options)); if (hit) return copy(hit.response); }
        return undefined;
      }
      const [id, query, options = {}] = args, cache = handles.get(id);
      if (!cache) throw new Error('Unknown Cache handle');
      if (operation === 'match') { const entry = cache.entries.find(value => matching(value, query, options)); return entry && copy(entry.response); }
      if (operation === 'keys') return cache.entries.filter(value => matching(value, query, options)).map(value => value.url);
      if (operation === 'delete') { const before = cache.entries.length; cache.entries = cache.entries.filter(value => !matching(value, query, options)); return cache.entries.length !== before; }
      if (operation === 'putAll') {
        // Input batches have already been fetched, validated and consumed.
        const entries = copy(query), next = cache.entries.slice();
        for (const entry of entries) { const index = next.findIndex(value => value.url === entry.url); if (index >= 0) next.splice(index, 1); next.push(entry); }
        cache.entries = next; return undefined;
      }
      throw new Error(`Unsupported Cache operation: ${operation}`);
    },
    clear() { origins.clear(); handles.clear(); },
  };
}

function cacheRealm(bridge, enabled) {
  const Request=globalThis.Request,Response=globalThis.Response,URL=globalThis.URL,Uint8Array=globalThis.Uint8Array;
  const secret = {}, caches = new WeakMap(), storages = new WeakSet();
  const guard = () => { if (!bridge.active()) throw new DOMException('The Cache owner is disposed', 'InvalidStateError'); };
  const cacheId = receiver => { if (!caches.has(receiver)) throw new TypeError('Illegal invocation'); return caches.get(receiver); };
  const storage = receiver => { if (!storages.has(receiver)) throw new TypeError('Illegal invocation'); };
  const options = input => ({ ignoreSearch: Boolean(input?.ignoreSearch), ...(input?.cacheName === undefined ? {} : {cacheName: String(input.cacheName)}) });
  const requestURL=Object.getOwnPropertyDescriptor(Request.prototype,'url').get;
  const requestMethod=Object.getOwnPropertyDescriptor(Request.prototype,'method').get;
  const requestHeaders=Object.getOwnPropertyDescriptor(Request.prototype,'headers').get;
  const requestCredentials=Object.getOwnPropertyDescriptor(Request.prototype,'credentials').get;
  const request = input => {
    let value=input;try{requestURL.call(value);}catch{value=new Request(new URL(String(input),bridge.baseURL()).href);}
    const url=new URL(requestURL.call(value));url.hash='';
    return{url:url.href,method:requestMethod.call(value),headers:Array.from(requestHeaders.call(value),pair=>Array.from(pair)),credentials:requestCredentials.call(value)};
  };
  const valid = query => { if (!/^https?:/.test(query.url) || query.method !== 'GET') throw new TypeError('Cache requires an HTTP(S) GET request'); };
  const responseStatus=Object.getOwnPropertyDescriptor(Response.prototype,'status').get;
  const responseStatusText=Object.getOwnPropertyDescriptor(Response.prototype,'statusText').get;
  const responseHeaders=Object.getOwnPropertyDescriptor(Response.prototype,'headers').get;
  const responseBytes=Response.prototype.arrayBuffer;
  const responseSnapshot = async value => {
    const status=responseStatus.call(value),statusText=responseStatusText.call(value),headers=responseHeaders.call(value);
    if (status === 206 || headers.get('vary')?.split(',').some(token => token.trim() === '*')) throw new TypeError('Response is not cacheable');
    if (status === 0) throw new TypeError('Opaque/error Response caching is not implemented');
    const result = {status,statusText,headers:Array.from(headers, pair => Array.from(pair)),bytes:Array.from(new Uint8Array(await responseBytes.call(value)))};
    guard(); return result;
  };
  const response = value => value === undefined ? undefined : new Response([204,205,304].includes(value.status)?null:new Uint8Array(value.bytes), {status:value.status,statusText:value.statusText,headers:value.headers});
  const operate = async (name, args) => { guard(); const result = await bridge.operate(name,args); guard(); return result; };
  const addBatch=async(receiver,inputs)=>{
      const id=cacheId(receiver),queries=Array.from(inputs,request);queries.forEach(valid);
      if(new Set(queries.map(query=>query.url)).size!==queries.length)throw new TypeError('Duplicate Cache request');
      const entries=await Promise.all(queries.map(async query=>{const result=await bridge.fetch(query.url,{method:query.method,headers:query.headers,credentials:query.credentials});if(!result.ok)throw new TypeError('Cache add requires a successful response');return{url:query.url,response:await responseSnapshot(result)};}));
      await operate('putAll',[id,entries]);
  };
  class Cache {
    constructor(token,id) { if(token!==secret)throw new TypeError('Illegal Constructor');caches.set(this,id); }
    async match(input, init) {const id=cacheId(this),query=request(input);return response(await operate('match',[id,query,options(init)]));}
    async put(input, value) {const id=cacheId(this),query=request(input);valid(query);const bytes=await responseSnapshot(value);await operate('putAll',[id,[{url:query.url,response:bytes}]]);}
    async add(input) {return addBatch(this,[input]);}
    async addAll(inputs) {return addBatch(this,inputs);}
    async delete(input,init) {return operate('delete',[cacheId(this),request(input),options(init)]);}
    async keys(input,init) {const id=cacheId(this),query=input===undefined?undefined:request(input);return Array.from(await operate('keys',[id,query,options(init)]),url=>new Request(url));}
  }
  class CacheStorage {
    constructor(token) {if(token!==secret)throw new TypeError('Illegal Constructor');storages.add(this);}
    async open(name) {storage(this);if(!arguments.length)throw new TypeError('Cache name is required');return new Cache(secret,await operate('open',[String(name)]));}
    async has(name) {storage(this);if(!arguments.length)throw new TypeError('Cache name is required');return operate('hasName',[String(name)]);}
    async delete(name) {storage(this);if(!arguments.length)throw new TypeError('Cache name is required');return operate('deleteName',[String(name)]);}
    async keys() {storage(this);return Array.from(await operate('names',[]),String);}
    async match(input,init) {storage(this);return response(await operate('storageMatch',[request(input),options(init)]));}
  }
  for(const value of [Cache,CacheStorage])Object.defineProperty(value.prototype,Symbol.toStringTag,{value:value.name,configurable:true});
  Object.assign(globalThis,{Cache,CacheStorage});
  if(enabled) {const value=new CacheStorage(secret);Object.defineProperty(globalThis,'caches',{get:()=>value,configurable:true,enumerable:true});}
}
export const CACHE_REALM_SOURCE = `(${cacheRealm.toString()})`;

export function installCache(page, realm, {enabled=false, secure=false, store=cacheStoreFor(page), baseURL=()=>page.url, evaluate=source=>realm.eval(source)}={}) {
  const signal=page.documentAbort?.signal, generation=page.documentGeneration;let disposed=false;
  const active=()=>!disposed&&!page.closed&&!signal?.aborted&&page.documentGeneration===generation;
  const origin=()=>page.securityOrigin??new URL(page.url).origin;
  const bridge={baseURL,active,operate:(operation,args)=>store.operate(origin(),operation,args),fetch:(input,init)=>realm.fetch(input,init)};
  evaluate(CACHE_REALM_SOURCE)(bridge,Boolean(enabled&&secure));
  const dispose=()=>{disposed=true;};signal?.addEventListener('abort',dispose,{once:true});
  return{dispose,store};
}
