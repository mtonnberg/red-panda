import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {getPublicSuffix}=require('tough-cookie');
const DOCUMENTS=new WeakMap();
export function captureCookieDocument(page,document){DOCUMENTS.set(page,document)}
const parent=page=>page.parentFrameId?page.registry?.findFrame(page.parentFrameId):null;
function documentURL(page){try{return(DOCUMENTS.get(page)??implForWrapper(page.dom.window.document)).URL}catch{return null}}
// Actual blank/srcdoc child contexts use their owned parent Document URL for
// network site/referrer selection, even after a URL-only History update.
export function networkDocumentURL(page){
 const seen=new Set();let owner=page;
 while(owner&&!seen.has(owner)){
  seen.add(owner);const url=documentURL(owner);
  if(url!=='about:blank'&&url!=='about:srcdoc')return url;
  const ancestor=parent(owner);if(!ancestor)return url;owner=ancestor;
 }
 return null;
}

function site(input){
 let url;try{url=new URL(input)}catch{return null}
 if(!url.hostname)return null;
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 try{return getPublicSuffix(host,{allowSpecialUseDomain:true})??host}catch{return host}
}

// The pinned transport's cookie site follows the live document URL, including
// a URL-only History rewrite. Origin/CORS/credentials authority stays separate.
// Its measured HTTP/HTTPS cookie-site comparison is host/site based.
export function cookieSameSiteContext(page,target,frameId){
 let owner=page;
 if(frameId&&frameId!==page.frameId)owner=page.frames?.findFrame(frameId)??page.frames?.executionPages().find(value=>value.frameId===frameId)??page;
 const expected=site(target),seen=new Set();if(expected===null)return'none';
 while(owner&&!seen.has(owner)){
  seen.add(owner);const current=site(networkDocumentURL(owner));
  if(current!==expected)return'none';
  owner=parent(owner);
 }
 return'strict';
}

function header(cookies,context){return cookies.filter(cookie=>context!=='none'||(cookie.sameSite??'lax')==='none').map(cookie=>cookie.cookieString()).join('; ')}
export async function cookieHeaderFor(jar,page,url,frameId){const context=cookieSameSiteContext(page,url,frameId);return header(await jar.getCookies(url,{sameSiteContext:context}),context)}
export function cookieHeaderForSync(jar,page,url,frameId){const context=cookieSameSiteContext(page,url,frameId);return header(jar.getCookiesSync(url,{sameSiteContext:context}),context)}
