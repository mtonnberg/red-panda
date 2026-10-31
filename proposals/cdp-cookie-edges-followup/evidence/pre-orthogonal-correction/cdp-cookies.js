import {prepareCookie} from './cookies.js';
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
function prepare(input,fallback){
 if(input.url===undefined&&!input.domain)failure('At least one of the url or domain needs to be specified',-32602);
 if(/[;\r\n]/.test(input.name+input.value))failure('Sanitizing cookie failed',-31998);
 if(!['None','Lax','Strict'].includes(input.sameSite))delete input.sameSite;
 let url;try{url=new URL(input.url??`${input.secure?'https':'http'}://${input.domain.replace(/^\./,'')}${input.path??'/'}`)}catch{return null;}
 if(url.protocol!=='http:'&&url.protocol!=='https:')return null;
 const effectiveSecure=input.secure===true||url.protocol==='https:';
 // This observed policy rejection precedes empty-name/expiry serialization.
 // No global semantic rule for those unmeasured policy-valid inputs is added.
 if(input.sameSite==='None'&&!effectiveSecure)return null;
 if(!input.name)failure('Sanitizing cookie failed',-31998);
 let prepared;try{prepared=prepareCookie(input,fallback)}catch(error){if(error?.code==='ERR_INVALID_URL'||error?.message==='Cookies require an HTTP(S) URL or domain')return null;throw error;}
 return record({url:prepared.url.href,text:prepared.text+(effectiveSecure&&!input.secure?'; Secure':'')});
}
async function store(jar,prepared){if(!prepared)return false;try{return Boolean(await jar.setCookie(prepared.text,prepared.url))}catch{return false;}}
export async function setCDPCookie(jar,input,fallback){return store(jar,prepare(decode(input),fallback));}
export async function setCDPCookies(jar,inputs,fallback){
 if(inputs===undefined)missing();if(!Array.isArray(inputs))unexpected();
 // Schema conversion precedes successful mutation. Cookie-policy rejections
 // are skipped individually, retaining valid batch members.
 const decoded=inputs.map(decode);
 for(const cookie of decoded)if(/[;\r\n]/.test(cookie.name+cookie.value))failure('Invalid cookie fields',-32602);
 for(const cookie of decoded)await store(jar,prepare(cookie,fallback));
}
