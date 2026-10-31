// Owned transport thread: synchronous Window XHR must not depend on the blocked
// parent event loop. Cookies, redirects, CORS and tracing stay with its Page.
import { parentPort } from 'node:worker_threads';
const requests=new Map();
parentPort.on('message',async message=>{
 if(message.cancel){requests.get(message.cancel)?.abort();return}
 const {id,url,init,shared,maxBodyBytes=16*1024*1024}=message,state=new Int32Array(shared,0,3),output=new Uint8Array(shared,12),controller=new AbortController();
 requests.set(id,controller);
 try {
  const response=await fetch(url,{...init,headers:new Headers(init.headers),signal:controller.signal,redirect:'manual'});
  const chunks=[];let size=0;
  if(response.body)for await(const chunk of response.body){size+=chunk.byteLength;if(size>maxBodyBytes)throw Error(maxBodyBytes===16*1024*1024?'Response exceeds 16 MiB limit':'Response exceeds '+maxBodyBytes+' byte limit');chunks.push(chunk)}
  const bytes=Buffer.concat(chunks),meta=Buffer.from(JSON.stringify({status:response.status,statusText:response.statusText,headers:[...response.headers],cookies:response.headers.getSetCookie(),url:response.url||url}));
  if(meta.length+bytes.length>output.length)throw Error('Synchronous response exceeds transport limit');
  output.set(meta);output.set(bytes,meta.length);Atomics.store(state,1,meta.length);Atomics.store(state,2,bytes.length);Atomics.store(state,0,1);
 }catch(error){const text=Buffer.from(JSON.stringify({error:String(error.message)}));output.set(text.subarray(0,output.length));Atomics.store(state,1,Math.min(text.length,output.length));Atomics.store(state,0,2)}
 finally{requests.delete(id);Atomics.notify(state,0)}
});
