// Genuine Node WebSocket transports and Browser/App-owned admission leases.
// The quota and transport records never enter an authored VM.
import {WebSocket as Socket} from 'ws';
const BROWSERS=new WeakMap(),apply=Reflect.apply,schedule=setTimeout,cancel=clearTimeout;
const record=value=>Object.assign(Object.create(null),value);
export function validateWebSocketLimit(value=8){if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>255)throw new RangeError('wsMaxConcurrent must be an integer from 0 to 255');return value}
export function browserWebSocketQuota(browser,selectedLimit){
 let state=BROWSERS.get(browser);if(!state){const leases=new Set(),limit=validateWebSocketLimit(selectedLimit??browser.options?.wsMaxConcurrent);state=record({limit,
  acquire(){if(leases.size>=limit)return null;const token=record({});leases.add(token);let released=false;return()=>{if(released)return;released=true;leases.delete(token)}},
  usage(){return leases.size},
 });BROWSERS.set(browser,state)}return state;
}
const blocked=new Set([1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
export function normalizeWebSocketURL(input,base){const url=new URL(input,base);if(url.protocol==='http:')url.protocol='ws:';if(url.protocol==='https:')url.protocol='wss:';if(!['ws:','wss:'].includes(url.protocol)||url.hash||url.href.includes('#')||url.username||url.password)throw new TypeError('Invalid WebSocket URL');return url}
export function validWebSocketProtocols(values){return values.every(value=>/^[!#$%&'*+.^_`|~0-9A-Za-z-]+(?![\s\S])/.test(value))}
export function socketHeaders(page,url){
 const destination=new URL(url);destination.protocol=destination.protocol==='wss:'?'https:':'http:';
 const result={'Accept':'*/*'};if(page.userAgent)result['User-Agent']=page.userAgent;if(page.acceptLanguage)result['Accept-Language']=page.acceptLanguage;
 const cookies=page.context?.cookies?.getCookieStringSync(destination.href);if(cookies)result.Cookie=cookies;return result;
}
export function openWebSocketTransport({quota,owner,url,protocols=[],origin,headers,emit,deferUpgrade=false}){
 const release=blocked.has(Number(new URL(url).port))?null:quota.acquire();
 const state=record({url,protocol:'',extensions:'',readyState:0,bufferedAmount:0,socket:null,queue:[],pendingBytes:0,closed:false,killed:false,localCancel:false,failed:false,closeRequested:false,timer:null,request:null,startRequested:!deferUpgrade,release});
 const notify=(type,fields={})=>{if(!state.killed)return emit(type,fields)};
 const relinquish=()=>{state.release?.();state.release=null};
 const end=(code,reason,wasClean)=>{if(state.closed||state.killed)return;state.closed=true;state.readyState=3;
  // Abnormal transport failure has already ended the physical attempt before
  // JS error dispatch. A client close retains its admission through dispatch.
  if(!wasClean||!state.closeRequested)relinquish();
  const finish=()=>{relinquish();owner.delete(api)};try{if(!wasClean)notify('error');const pending=notify('close',{code,reason,wasClean});if(pending&&typeof pending.then==='function')pending.then(finish,finish);else finish()}catch(error){finish();throw error}
 };
 const drain=()=>{
  if(!state.socket||state.socket.readyState!==Socket.OPEN)return;
  for(const entry of state.queue.splice(0))state.socket.send(entry.data,{binary:entry.binary},()=>{state.pendingBytes-=entry.length;entry.done?.();drain()});
  if(state.closeRequested&&state.pendingBytes===0){try{state.socket.close(state.closeCode,state.closeReason)}catch{state.failed=true;state.socket.terminate()}}
 };
 const api=record({
  get(key){if(key==='bufferedAmount')return state.pendingBytes;return state[key]},
  start(){if(state.killed||state.closed)return;state.startRequested=true;if(state.request){const request=state.request;state.request=null;request.end()}},
  send(data,binary,done){if(state.readyState!==1)return false;const bytes=typeof data==='string'?data:Buffer.from(data),length=typeof bytes==='string'?Buffer.byteLength(bytes):bytes.length;state.pendingBytes+=length;state.queue.push(record({data:bytes,binary,length,done}));queueMicrotask(drain);return true},
  close(code=1000,reason='',connecting=false){
   if(state.readyState>=2&&!connecting)return;
   if(connecting||state.readyState===0){state.localCancel=true;state.closed=true;state.readyState=3;if(state.timer!==null)cancel(state.timer);state.socket?.terminate();relinquish();owner.delete(api);state.timer=schedule(()=>{state.timer=null;notify('close',{code,reason,wasClean:false})},0);return}
   state.readyState=2;state.closeRequested=true;state.closeCode=code;state.closeReason=reason;drain();
  },
  kill(){if(state.killed)return;state.killed=true;state.readyState=3;if(state.timer!==null)cancel(state.timer);state.timer=null;state.socket?.terminate();state.queue.length=0;relinquish();owner.delete(api)},
 });owner.add(api);
 if(!release){state.timer=schedule(()=>{state.timer=null;end(1006,'',false)},0);return api}
 try{
  const offered=protocols.slice();state.socket=new Socket(url,[...new Set(offered)],{origin,headers,perMessageDeflate:false,maxPayload:1024*1024*1024,
   finishRequest(request){if(offered.length)request.setHeader('Sec-WebSocket-Protocol',offered.join(', '));if(state.startRequested)request.end();else state.request=request},
  });
 }catch{relinquish();state.timer=schedule(()=>{state.timer=null;end(1006,'',false)},0);return api}
 state.socket.on('open',()=>{if(state.killed||state.localCancel)return;state.readyState=1;state.protocol=state.socket.protocol;state.extensions=state.socket.extensions;notify('open',{protocol:state.protocol,extensions:state.extensions});drain()});
 state.socket.on('message',(bytes,binary)=>{if(state.readyState===1&&!state.killed)notify('message',{bytes:Buffer.from(bytes),binary})});
 state.socket.on('error',()=>{state.failed=true});
 state.socket.on('close',(code,reason)=>{if(!state.localCancel)end(code===1005?1000:code,reason.toString(),!state.failed&&code!==1006)});
 return api;
}
