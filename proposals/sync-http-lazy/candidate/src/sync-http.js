import {cookieHeaderForSync} from './cookie-site.js';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import {requestMetadataPolicy} from './request-metadata.js';
const enqueue=queueMicrotask;
const clock=()=>performance.now()/1000;
/** One browser-owned real transport; the worker never owns document policy. */
export class SyncHTTP {
 constructor(){this.operations=new Set();this.closed=false;}
 // Start the real independent transport only when a synchronous request exists.
 // Node queues its first message until the actual worker listener is installed.
 #ensureWorker(){
  if(this.closed||this.error)throw this.error??Error('Synchronous transport is closed');
  if(!this.worker){
   this.worker=new Worker(new URL('./sync-http-thread.js',import.meta.url),{execArgv:[]});
   this.worker.on('error',error=>{this.error=error});
   this.worker.once('exit',code=>{if(!this.closed&&!this.error)this.error=Error('Synchronous HTTP transport exited with code '+code)});
   this.worker.unref();
  }
  return this.worker;
 }
 close(){if(this.closed)return;this.closed=true;for(const op of this.operations)op.cancel();void this.worker?.terminate()}
 fetch(page,input,init={}){
  const metadata=requestMetadataPolicy(init);
  if(this.closed||this.error)throw this.error??Error('Synchronous transport is closed');
  const resourceType=init.resourceType??'XHR',maxBodyBytes=init.maxBodyBytes??16*1024*1024;if(typeof resourceType!=='string'||!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>16*1024*1024)throw TypeError('Invalid synchronous resource options');
  const owned=new Set(),op={complete:false,canceled:false,cancel:()=>{
   op.canceled=true;init.signal?.removeEventListener('abort',onAbort);
   for(const id of owned){page.activeRequests.delete(id);this.worker?.postMessage({cancel:id})}
   owned.clear();this.operations.delete(op);
  }};
  const onAbort=()=>op.cancel();
  this.operations.add(op);init.signal?.addEventListener('abort',onAbort,{once:true});
  const checkpoint=()=>{if(op.canceled||this.closed||init.signal?.aborted)throw Error('Synchronous request was canceled')};
  // VM termination can bypass every JS finally on the interrupted host stack.
  // Keep ownership until response policy and callbacks have also completed.
  enqueue(()=>{if(!op.complete)op.cancel()});
  let url=new URL(input,page.url).href,method=init.method??'GET',body=init.body,redirectResponse;
  const headers=new Headers(init.headers),deadline=Date.now()+page.timeout;
  headers.set('user-agent',page.userAgent);if(!headers.has('accept-language'))headers.set('accept-language',page.acceptLanguage);
  try {
   for(let redirects=0;redirects<=20;redirects++){
    checkpoint();
    const useCookies=init.credentials!=='omit'&&(init.credentials!=='same-origin'||new URL(url).origin===init.credentialsOrigin);
    const cookie=useCookies?cookieHeaderForSync(page.context.cookies,page,url,init.frameId):'';if(cookie)headers.set('cookie',cookie);else headers.delete('cookie');
    metadata(headers,url);
    page.extraHTTPHeaders.forEach((value,key)=>headers.set(key,value));page.cliHTTPHeaders.forEach((value,key)=>headers.set(key,value));
    const id=randomUUID();owned.add(id);page.activeRequests.add(id);page.lastActivity=Date.now();
    page.emit('request',{id,url,type:resourceType,method,headers:Object.fromEntries(headers),timestamp:clock(),redirectResponse,frameId:init.frameId??page.frameId,loaderId:init.loaderId??page.loaderId});
    checkpoint();
    const shared=new SharedArrayBuffer(16*1024*1024+1024*1024+12),state=new Int32Array(shared,0,3);
    this.#ensureWorker().postMessage({id,url,init:{method,headers:[...headers],body},shared,maxBodyBytes});
    const remaining=deadline-Date.now();
    if(remaining<=0||Atomics.wait(state,0,0,remaining)==='timed-out')throw Error('Synchronous HTTP request timed out');
    const meta=JSON.parse(Buffer.from(shared,12,Atomics.load(state,1)).toString('utf8'));if(meta.error)throw Error(meta.error);
    const bytes=Buffer.from(new Uint8Array(shared,12+Atomics.load(state,1),Atomics.load(state,2))),response={...meta,headers:new Headers(meta.headers),bytes};
    checkpoint();
    if(useCookies)for(const value of meta.cookies){page.context.cookies.setCookieSync(value,url,{ignoreError:true});checkpoint()}
    const location=response.headers.get('location');
    if(location&&[301,302,303,307,308].includes(response.status)){
     if(redirects===20)throw Error('Too many redirects');
     const next=new URL(location,url);if(!['http:','https:'].includes(next.protocol))throw Error('Unsupported redirect protocol');
     init.onRedirect?.(response,next.href,url,headers);checkpoint();
     if(next.origin!==new URL(url).origin){headers.delete('authorization');headers.delete('cookie')}
     if(headers.has('referer')){const referrer=page.referrerFor(next.href,headers.get('referer'));if(referrer)headers.set('referer',referrer);else headers.delete('referer')}
     if(response.status===303||([301,302].includes(response.status)&&method.toUpperCase()==='POST')){method='GET';body=undefined;headers.delete('content-type');headers.delete('content-length')}
     page.activeRequests.delete(id);owned.delete(id);
     redirectResponse={url,status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers),mimeType:response.headers.get('content-type')??'text/html',connectionReused:false,connectionId:0,encodedDataLength:0,securityState:'neutral'};
     url=next.href;continue;
    }
    page.responseBodies??=new Map();if(page.responseBodies.size>=100)page.responseBodies.delete(page.responseBodies.keys().next().value);
    page.responseBodies.set(id,bytes.toString('utf8'));
    // Remove the captured id before entering arbitrary event callbacks. The
    // operation itself remains owned until those callbacks return normally.
    page.activeRequests.delete(id);
    page.requestFinished(id,url,response.status,bytes.length,Object.fromEntries(response.headers),resourceType,init.frameId,init.loaderId);
    owned.delete(id);op.complete=true;init.signal?.removeEventListener('abort',onAbort);this.operations.delete(op);return response;
   }
  }catch(error){
   const failed=[...owned];op.cancel();
   // Failure bookkeeping is complete before any authored/driver listener runs.
   for(const id of failed)page.requestFailed(id,error);
   throw error;
  }
 }
}
