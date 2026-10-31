import {isIP} from 'node:net';
const observers=new WeakMap(),apply=Reflect.apply;
const record=value=>Object.assign(Object.create(null),value);
export function trustworthyCookieURL(value){
 try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='wss:'||(['http:','ws:'].includes(url.protocol)&&(url.hostname==='localhost'||url.hostname==='[::1]'||(isIP(url.hostname)===4&&url.hostname.startsWith('127.'))));}catch{return false;}
}
function readContext(value){
 // tough-cookie's installed getCookies has no secure eligibility option. Only
 // its protocol selects Secure-cookie eligibility; host/path and query options
 // remain unchanged. The actual request URL is never rewritten.
 try{const url=new URL(value);if(['http:','ws:'].includes(url.protocol)&&trustworthyCookieURL(url.href)){url.protocol=url.protocol==='http:'?'https:':'wss:';return url.href;}}catch{}
 return value;
}
const snapshot=cookie=>record({name:cookie.key,value:cookie.value,domain:cookie.domain,hostOnly:cookie.hostOnly,path:cookie.path,expires:cookie.expiryTime(),secure:!!cookie.secure,httpOnly:!!cookie.httpOnly,sameSite:cookie.sameSite??'lax'});
export function observeCookieJar(jar,listener){
 let state=observers.get(jar);
 if(!state){
  const store=jar.store,put=store.putCookie,find=store.findCookie,read=jar.getCookies;
  state=record({listeners:new Set()});observers.set(jar,state);
  const notify=(kind,cookie)=>{const value=snapshot(cookie);for(const callback of [...state.listeners])callback(kind,value);};
  const mutation=(callback,operation,done)=>{if(typeof callback==='function')return operation((error,value)=>{if(!error)done();callback(error,value);});return operation(undefined).then(value=>{done();return value;});};
  // BrowserContexts use the real synchronous MemoryCookieStore. Its update
  // method delegates to putCookie, so observing put avoids duplicate updates.
  store.putCookie=function(cookie,callback){let old;apply(find,this,[cookie.domain,cookie.path,cookie.key,(_error,value)=>{old=value;}]);return mutation(callback,cb=>apply(put,this,[cookie,cb]),()=>{if(cookie.expiryTime()<=Date.now()){if(old&&old.expiryTime()>Date.now())notify('deleted',old);}else notify('changed',cookie);});};
  // Native expiry pruning and CDP jar clearing are silent; only successful
  // set/replace and expired-set deletion publish mutation notifications.
  jar.getCookies=function(url,...args){return apply(read,this,[readContext(url),...args]);};
 }
 state.listeners.add(listener);return()=>state.listeners.delete(listener);
}
