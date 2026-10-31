import {createRequire} from 'node:module';
const {Cookie}=createRequire(import.meta.url)('tough-cookie');

// HTTP response ingress only: preserve the unmeasured HTTPS response path and
// all document/import APIs. The actual jar parser owns every other field.
export function httpResponseCookie(jar,value,url){
 if(new URL(url).protocol!=='http:'||typeof value!=='string')return value;
 const cookie=Cookie.parse(value,{loose:jar.enableLooseMode});if(!cookie)return value;
 let sameSite;
 // Native keeps the last recognized value; unknown/quoted attributes do not
 // erase a preceding recognized SameSite value.
 for(const attribute of value.split(';').slice(1)){
  const separator=attribute.indexOf('=');if(separator<0)continue;
  if(attribute.slice(0,separator).trim().toLowerCase()!=='samesite')continue;
  const next=attribute.slice(separator+1).trim().toLowerCase();
  if(next==='none'||next==='lax'||next==='strict')sameSite=next;
 }
 cookie.sameSite=sameSite;
 return sameSite==='none'&&!cookie.secure?null:cookie;
}
