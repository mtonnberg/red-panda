import {prepareCookie} from './cookies.js';
import {createRequire} from 'node:module';
import {isIP} from 'node:net';
const{Cookie}=createRequire(import.meta.url)('tough-cookie');
const record=value=>Object.assign(Object.create(null),value);
function failure(message,code){const error=Error(message);Object.defineProperty(error,'code',{value:code});throw error;}
const missing=()=>failure('MissingField',-31998),unexpected=()=>failure('UnexpectedToken',-31998);
function optional(value,type){if(value===null||value===undefined)return undefined;if(typeof value!==type)unexpected();return value;}
function decode(value){
 if(value===null||typeof value!=='object')unexpected();
 if(value.name===undefined||value.value===undefined)missing();
 if(typeof value.name!=='string'||typeof value.value!=='string')unexpected();
 const input=record({name:value.name,value:value.value});
 for(const key of ['url','domain','path','sameSite']){const field=optional(value[key],'string');if(field!==undefined)input[key]=field;}
 const secure=optional(value.secure,'boolean'),httpOnly=optional(value.httpOnly,'boolean'),expires=optional(value.expires,'number');
 if(secure!==undefined)input.secure=secure;if(httpOnly!==undefined)input.httpOnly=httpOnly;if(expires!==undefined)input.expires=expires;
 return input;
}
function emptyNameCookie(input,url,secure){
 for(const key of ['domain','path'])if(input[key]!==undefined&&/[;\r\n]/.test(input[key]))failure('Sanitizing cookie failed',-32602);
 let text=`=${input.value}; Path=${input.path??'/'}`;
 if(input.domain?.startsWith('.')&&!isIP(input.domain.slice(1)))text+=`; Domain=${input.domain}`;
 if(secure)text+='; Secure';if(input.httpOnly)text+='; HttpOnly';if(input.sameSite)text+=`; SameSite=${input.sameSite}`;
 if(input.expires!==undefined)text+=`; Expires=${new Date(input.expires*1000).toUTCString()}`;
 const cookie=Cookie.parse(text,{loose:true});if(!cookie)return null;
 // CDP supplies the name and value separately; an '=' in an empty-name value
 // must not be reinterpreted as a different cookie's name by loose parsing.
 cookie.key=input.name;cookie.value=input.value;return record({url:url.href,cookie});
}
function prepare(input,fallback){
 if(!input.url&&!input.domain)failure('At least one of the url or domain needs to be specified',-32602);
 if(/[;\r\n]/.test(input.name+input.value))failure('Sanitizing cookie failed',-32602);
 if(!['None','Lax','Strict'].includes(input.sameSite))delete input.sameSite;
 let url;try{url=new URL(input.url||`${input.secure?'https':'http'}://${input.domain.replace(/^\./,'')}${input.path??'/'}`)}catch{return null;}
 if(url.protocol!=='http:'&&url.protocol!=='https:')return null;
 const effectiveSecure=input.secure===true||url.protocol==='https:';
 // The measured None policy rejection precedes cookie serialization.
 if(input.sameSite==='None'&&!effectiveSecure)return null;
 // CDP uses negative expiry values as session cookies; zero is a real expiry.
 if(input.expires<0)delete input.expires;
 if(!input.name)return emptyNameCookie(input,url,effectiveSecure);
 let prepared;try{prepared=prepareCookie(input,fallback)}catch(error){if(error?.code==='ERR_INVALID_URL'||error?.message==='Cookies require an HTTP(S) URL or domain')return null;throw error;}
 return record({url:prepared.url.href,text:prepared.text+(effectiveSecure&&!input.secure?'; Secure':'')});
}
async function store(jar,prepared){if(!prepared)return false;try{return Boolean(await jar.setCookie(prepared.cookie??prepared.text,prepared.url))}catch{return false;}}
export async function setCDPCookie(jar,input,fallback){return store(jar,prepare(decode(input),fallback));}
export async function setCDPCookies(jar,inputs,fallback){
 if(inputs===undefined)missing();if(!Array.isArray(inputs))unexpected();
 // Schema conversion precedes successful mutation. Cookie-policy rejections
 // are skipped individually, retaining valid batch members.
 const decoded=inputs.map(decode);
 for(const cookie of decoded)if((!cookie.url&&!cookie.domain)||/[;\r\n]/.test(cookie.name+cookie.value))failure('Invalid cookie fields',-32602);
 for(const cookie of decoded)await store(jar,prepare(cookie,fallback));
}
