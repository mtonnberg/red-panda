import {createRequire} from 'node:module';
import {selectCDPCookieContext} from './cdp-cookie-metadata.js';
import {removeObservedCookie} from './cookie-jar-observer.js';
const{canonicalDomain,domainMatch,defaultPath}=createRequire(import.meta.url)('tough-cookie');
const apply=Reflect.apply,record=value=>Object.assign(Object.create(null),value);
function failure(message,code=-31998){const error=Error(message);Object.defineProperty(error,'code',{value:code});throw error;}
function optional(value){if(value===undefined||value===null)return undefined;if(typeof value!=='string')failure('UnexpectedToken');return value;}
export function requireCookieSession(browser,parent){if(parent&&(parent.page.closed||browser.contexts.get(parent.page.context.id)!==parent.page.context))failure('Unknown sessionId',-32001);}
export function cookieActionContext(browser,parent,id){
 requireCookieSession(browser,parent);
 const current=parent?.page.context??selectCDPCookieContext(browser);
 if(!current)failure('BrowserContextNotLoaded');
 const selector=optional(id);if(selector===undefined)return current;
 const context=selectCDPCookieContext(browser,selector);if(!context)failure('UnknownBrowserContextId');return context;
}
export function decodeCookieDeletion(params){
 if(params.name===undefined)failure('MissingField');if(typeof params.name!=='string')failure('UnexpectedToken');
 return record({name:params.name,url:optional(params.url),domain:optional(params.domain),path:optional(params.path)});
}
function deletionScope(input){
 if(!input.url&&!input.domain)failure('InvalidDomain');
 let url;if(input.url){try{url=new URL(input.url)}catch{return null;}if(!url.hostname)failure('InvalidDomain');}
 const explicit=input.domain,raw=explicit??url.hostname,domain=canonicalDomain(raw);
 if(!domain)failure('InvalidDomain');
 if(url&&explicit&&!domainMatch(url.hostname.replace(/^\[|\]$/g,''),domain))failure('InvalidDomain');
 const path=input.path?.startsWith('/')?input.path:(url?defaultPath(url.pathname):'/');
 return record({domain,path});
}
export async function deleteCDPCookies(jar,input){
 const scope=deletionScope(input);if(!scope)return;
 // Read and mutate the real store. Its existing trusted metadata observers own
 // callback/Promise timing and group history; inspector arrays are not filtered.
 const store=jar.store,cookies=await apply(store.getAllCookies,store,[]);
 for(const cookie of cookies)if(cookie.key===input.name&&cookie.domain===scope.domain&&cookie.path===scope.path)await removeObservedCookie(jar,cookie.domain,cookie.path,cookie.key);
}
