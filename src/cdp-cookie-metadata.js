// CDP-only metadata over actual BrowserContext CookieJars. Private mutation
// history follows successful real backend changes; no public fields brand it.
import {isIP} from 'node:net';
import {toughCookie} from 'jsdom';
const jars=new WeakMap(),browsers=new WeakMap(),apply=Reflect.apply;
const key=cookie=>JSON.stringify([cookie.domain,cookie.path,cookie.key]);
function site(domain){const host=domain.replace(/^\./,'');if(isIP(host))return host;if(host==='localhost'||host.endsWith('.localhost'))return'localhost';try{return toughCookie.getPublicSuffix(host,{allowSpecialUseDomain:true})??host}catch{return host}}
function watch(jar){
 let state=jars.get(jar);if(state)return state;
 const store=jar.store,read=store.getAllCookies,groups=new Map();if(!(store instanceof toughCookie.MemoryCookieStore)||store.synchronous!==true)throw Error('CDP metadata requires the actual synchronous MemoryCookieStore');state={store,read,groups};jars.set(jar,state);
 const remove=(domain,path,name)=>{if(domain==null||path==null||name==null)return;const group=groups.get(site(domain));if(!group)return;group.delete(JSON.stringify([domain,path,name]));if(!group.size)groups.delete(site(domain))};
 const put=cookie=>{if(cookie.domain==null||cookie.path==null||cookie.key==null)return;if(cookie.expiryTime()<=Date.now()){remove(cookie.domain,cookie.path,cookie.key);return}let group=groups.get(site(cookie.domain));if(!group){group=new Map();groups.set(site(cookie.domain),group)}group.set(key(cookie),cookie)};
 // The actual backend is synchronous MemoryCookieStore; preserve callback timing,
 // original returned Promises, this/arguments and failures on every observer.
 const hook=(name,callbackIndex,done)=>{const original=store[name];store[name]=function(...args){if(this!==store)return apply(original,this,args);if(typeof args[callbackIndex]==='function'){const callback=args[callbackIndex];args[callbackIndex]=function(error,value){if(!error)done(args);return apply(callback,this,[error,value])};return apply(original,this,args)}const result=apply(original,this,args);done(args);return result}};
 apply(read,store,[(error,cookies)=>{if(error)throw error;for(const cookie of cookies)put(cookie)}]);
 hook('putCookie',1,args=>put(args[0]));
 // updateCookie delegates to putCookie; observing both would duplicate mutations.
 hook('removeCookie',3,args=>remove(args[0],args[1],args[2]));
 hook('removeCookies',2,args=>{for(const group of [...groups.values()])for(const cookie of [...group.values()])if(cookie.domain===args[0]&&(!args[1]||cookie.path===args[1]))remove(cookie.domain,cookie.path,cookie.key)});
 hook('removeAllCookies',0,()=>groups.clear());return state;
}
export function markCDPCookieContext(browser,context){if(!context||browser.contexts.get(context.id)!==context)return;const state=browsers.get(browser);if(!state)throw Error('CDP cookie owner is not initialized');watch(context.cookies);state.loaded.add(context)}
export function initializeCDPCookieMetadata(browser){
 if(browsers.has(browser))return;const state={loaded:new WeakSet()};browsers.set(browser,state);for(const context of browser.contexts.values())watch(context.cookies);
 browser.on('targetCreated',page=>{if(browser.pages.get(page.id)===page&&browser.contexts.get(page.context.id)===page.context)markCDPCookieContext(browser,page.context)});
}
export function selectCDPCookieContext(browser,id){
 if(id!==undefined)return browser.contexts.get(id);
 const state=browsers.get(browser),fallback=browser.contexts.get('default');if(state.loaded.has(fallback))return fallback;
 const loaded=[...browser.contexts.values()].filter(context=>state.loaded.has(context));
 if(loaded.length===1)return loaded[0];
 // Native exposes one loaded context. Retain the existing Root default-context
 // choice for its independently supported parallel-context extension.
 return loaded.length>1?fallback:undefined;
}
export function formatCDPCookie(cookie){const expires=cookie.expiryTime();return{name:cookie.key,value:cookie.value,domain:`${cookie.hostOnly?'':'.'}${cookie.domain}`,path:cookie.path,expires:expires===Infinity?-1:expires/1000,size:Buffer.byteLength(cookie.key)+Buffer.byteLength(cookie.value),httpOnly:!!cookie.httpOnly,secure:!!cookie.secure,session:expires===Infinity,...(cookie.sameSite?{sameSite:cookie.sameSite[0].toUpperCase()+cookie.sameSite.slice(1)}:{})}}
export async function listCDPCookies(jar,urls){
 const state=watch(jar);let allowed;
 if(urls!==undefined){allowed=new Set();for(const url of urls)for(const cookie of await jar.getCookies(url))allowed.add(key(cookie))}
 const cookies=await new Promise((resolve,reject)=>apply(state.read,state.store,[(error,values)=>error?reject(error):resolve(values)]));
 // Native inspector reads prune the actual jar silently. This does not produce
 // CookieStore notifications, matching its existing real backend removal path.
 for(const cookie of cookies)if(cookie.expiryTime()<=Date.now())await new Promise((resolve,reject)=>state.store.removeCookie(cookie.domain,cookie.path,cookie.key,error=>error?reject(error):resolve()));
 const result=[];for(const group of state.groups.values()){
  const values=[...group.values()].sort((a,b)=>(b.path?.length??0)-(a.path?.length??0)||a.creation-b.creation||(a.creationIndex??0)-(b.creationIndex??0));
  for(const cookie of values)if(!allowed||allowed.has(key(cookie)))result.push(formatCDPCookie(cookie));
 }return result;
}
