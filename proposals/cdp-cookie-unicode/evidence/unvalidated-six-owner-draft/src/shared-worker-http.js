import {internalCookieHeader} from './internal-cookie-header.js';
// A genuine request owner for a SharedWorker, independent of the lifetime of
// the creating Document. It owns real controllers/HTTP response byte streams.
import {httpResponseCookie} from './http-cookie-ingress.js';
const fetchHTTP=globalThis.fetch,record=value=>Object.assign(Object.create(null),value);
export function createSharedWorkerHTTP(root,page,{origin,url,blobSnapshot,blocked=false}){
 const controllers=new Set(),context=page.context,userAgent=page.userAgent,language=page.acceptLanguage,extra=new Headers(page.extraHTTPHeaders),cli=new Headers(page.cliHTTPHeaders),timeout=page.timeout??5000;let closed=false,initialBlob=blobSnapshot;
 const owner=record({context,userAgent,acceptLanguage:language,extraHTTPHeaders:extra,cliHTTPHeaders:cli,
  close(){if(closed)return;closed=true;for(const controller of controllers)controller.abort();controllers.clear()},
  async fetch(input,init={},script=false){
   if(closed)throw new Error('SharedWorker request owner is closed');if(blocked)throw new Error('SharedWorker script is not permitted');let target=new URL(input,url);
   if(target.protocol==='blob:'&&initialBlob&&input===url){const snapshot=initialBlob;initialBlob=null;const response=new Response(snapshot.bytes,{headers:{'content-type':snapshot.mimeType}});Object.defineProperty(response,'url',{value:url});return response}
   if(!['http:','https:'].includes(target.protocol))throw new Error('Unsupported SharedWorker request protocol');
   const controller=new AbortController();controllers.add(controller);const signals=[controller.signal,AbortSignal.timeout(timeout)];if(init.signal)signals.push(init.signal);const signal=AbortSignal.any(signals),headers=new Headers(init.headers);if(userAgent)headers.set('user-agent',userAgent);if(language&&!headers.has('accept-language'))headers.set('accept-language',language);
   if(script){headers.set('sec-fetch-mode','same-origin');headers.set('sec-fetch-dest','worker');headers.set('sec-fetch-site','same-origin')}
   let method=init.method??'GET',body=init.body;const credentials=init.credentials??'same-origin';
   try{for(let redirects=0;redirects<=20;redirects++){
    if(credentials!=='omit'&&(credentials!=='same-origin'||target.origin===origin)){const cookie=await context.cookies.getCookieString(target.href);if(cookie)headers.set('cookie',internalCookieHeader(cookie));else headers.delete('cookie')}else headers.delete('cookie');extra.forEach((v,n)=>headers.set(n,v));cli.forEach((v,n)=>headers.set(n,v));
    const response=await fetchHTTP(target,{...init,headers,method,body,signal,redirect:'manual'});if(credentials!=='omit'&&(credentials!=='same-origin'||target.origin===origin))for(const cookie of response.headers.getSetCookie()){const accepted=httpResponseCookie(context.cookies,cookie,target.href);if(accepted!==null)await context.cookies.setCookie(accepted,target.href,{ignoreError:true});}
    const location=response.headers.get('location');if(location&&[301,302,303,307,308].includes(response.status)){await response.body?.cancel();if(redirects===20)throw new Error('Too many SharedWorker redirects');const next=new URL(location,target);if(!['http:','https:'].includes(next.protocol))throw new Error('Unsupported SharedWorker redirect');if(next.origin!==target.origin){headers.delete('authorization');headers.delete('cookie')}if(response.status===303||[301,302].includes(response.status)&&method==='POST'){method='GET';body=undefined;headers.delete('content-type')}target=next;continue}
    const chunks=[],reader=response.body?.getReader();let size=0;if(reader)for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16*1024*1024){await reader.cancel();throw new Error('SharedWorker response exceeds16MiB')}chunks.push(value)}
    const buffered=new Response([204,205,304].includes(response.status)?null:Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});Object.defineProperty(buffered,'url',{value:target.href});return buffered;
   }}finally{controllers.delete(controller)}
  },
 });return owner;
}
