// Actual streaming HTTP transports. The parser consumes decoded bytes as they
// arrive; neither event contents nor success are selected by destination paths.
const fetchHTTP=globalThis.fetch,Decoder=TextDecoder,Controller=AbortController,schedule=setTimeout,cancel=clearTimeout;
const record=value=>Object.assign(Object.create(null),value);
export function createEventStreamParser({event,id,retry}){
 const decoder=new Decoder('utf-8'),state=record({line:'',skipLF:false,data:'',type:'',id:''});
 function line(value){
  if(value===''){id(state.id);if(state.data!=='')event(state.type||'message',state.data.slice(0,-1),state.id);state.data='';state.type='';return}
  if(value[0]===':')return;const colon=value.indexOf(':'),name=colon<0?value:value.slice(0,colon);let data=colon<0?'':value.slice(colon+1);if(data[0]===' ')data=data.slice(1);
  if(name==='data')state.data+=data+'\n';else if(name==='event')state.type=data;else if(name==='id'&&!data.includes('\0'))state.id=data;else if(name==='retry'&&/^[0-9]+$/.test(data)){const value=Number(data);if(Number.isSafeInteger(value))retry(value)}
 }
 const text=value=>{for(const char of value){if(state.skipLF){state.skipLF=false;if(char==='\n')continue}if(char==='\r'||char==='\n'){line(state.line);state.line='';state.skipLF=char==='\r'}else state.line+=char}};
 return{write(bytes){text(decoder.decode(bytes,{stream:true}))},end(){text(decoder.decode())},lastId(value){state.id=value}};
}
export function openEventSourceTransport({url,withCredentials,policy,emit,owner}){
 const state=record({readyState:0,closed:false,attempt:null,timer:null,retry:3000,lastId:'',url});
 const notify=(type,fields={})=>{if(!state.closed)emit(type,fields)};
 const close=()=>{if(state.closed)return;state.closed=true;state.readyState=2;if(state.timer!==null)cancel(state.timer);state.timer=null;state.attempt?.abort();state.attempt=null;owner?.delete(api)};
 const fail=fatal=>{if(state.closed)return;state.readyState=fatal?2:0;notify('error',{readyState:state.readyState});if(state.closed)return;if(fatal){state.closed=true;owner?.delete(api)}else{state.timer=schedule(()=>{state.timer=null;void connect()},Math.min(state.retry,2147483647));state.timer.unref?.()}};
 async function connect(){
  if(state.closed)return;const abort=new Controller();state.attempt=abort;let response,reader;
  try{
   let target=new URL(state.url);if(!['http:','https:'].includes(target.protocol)){fail(true);return}
   for(let redirects=0;;redirects++){
    if(redirects>20){fail(true);return}const headers=await policy.headers(target,withCredentials,state.lastId);if(state.closed)return;
    response=await fetchHTTP(target,{method:'GET',headers,redirect:'manual',signal:abort.signal});
    await policy.cookies?.(response,target,withCredentials);if(state.closed){await response.body?.cancel();return}
    if(!policy.cors(response,target,withCredentials)){await response.body?.cancel();fail(true);return}
    const location=response.headers.get('location');if([301,302,303,307,308].includes(response.status)&&location){await response.body?.cancel();target=new URL(location,target);if(!['http:','https:'].includes(target.protocol)){fail(true);return}continue}break;
   }
   if(response.status!==200||response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='text/event-stream'){await response.body?.cancel();fail(true);return}
   state.readyState=1;notify('open',{readyState:1});if(state.closed){await response.body?.cancel();return}
   const origin=new URL(response.url).origin,parser=createEventStreamParser({id:value=>{state.lastId=value},retry:value=>{state.retry=value},event:(type,data,lastEventId)=>notify('message',{type,data,lastEventId,origin})});parser.lastId(state.lastId);
   reader=response.body?.getReader();if(reader)for(;;){const chunk=await reader.read();if(state.closed)return;if(chunk.done){parser.end();break}parser.write(chunk.value);if(state.closed)return}
   fail(false);
  }catch{if(!state.closed)fail(false)}finally{if(reader)try{reader.releaseLock()}catch{}if(state.attempt===abort)state.attempt=null}
 }
 const api=record({get(key){return state[key]},close});owner?.add(api);state.timer=schedule(()=>{state.timer=null;void connect()},0);return api;
}
