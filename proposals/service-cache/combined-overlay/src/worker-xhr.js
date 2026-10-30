const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN = new Set(['accept-charset','accept-encoding','access-control-request-headers','access-control-request-method','connection','content-length','cookie','cookie2','date','dnt','expect','host','keep-alive','origin','referer','te','trailer','transfer-encoding','upgrade','user-agent','via']);
const SIMPLE_RESPONSE = new Set(['cache-control','content-language','content-length','content-type','expires','last-modified','pragma']);
const TYPES = new Set(['','text','json','blob','arraybuffer','document']);

/** Worker XHR over the same real parent request transport as worker fetch.
 * Response bodies are buffered; progress represents actual buffered bytes.
 */
export function installWorkerXHR(realm, { evaluate, fetch, syncRequest, origin, baseURL, signal, active = () => !signal?.aborted, trustEvent = value => value } = {}) {
  if (typeof evaluate !== 'function' || typeof fetch !== 'function') throw new TypeError('An actual realm evaluator and fetch transport are required');
  const ownerActive = active; let disposed = false;
  active = () => !disposed && ownerActive();
  const states = new WeakMap(), live = new Set(); let emit;
  const error = (message, name = 'InvalidStateError') => new realm.DOMException(message, name);
  const state = object => { const s = states.get(object); if (!s) throw new realm.TypeError('Illegal invocation'); return s; };
  const reset = s => { s.status=0;s.statusText='';s.responseURL='';s.headers=new Headers();s.bytes=new Uint8Array();s.text='';s.cached=undefined; };
  const current = (s, op) => active() && s.op === op;
  const fire = (target, type, loaded = 0, total = 0, lengthComputable = false) => emit(target,type,type==='readystatechange'?null:{loaded,total,lengthComputable});
  const cancel = op => { if (op) { op.done=true;clearTimeout(op.timer);op.controller.abort();live.delete(op); } };
  function terminal(object,s,op,kind) {
    if (!current(s,op)||op.done)return;
    cancel(op);s.sending=false;reset(s);s.readyState=kind==='abort'?0:4;
    fire(object,'readystatechange');if(!current(s,op))return;
    fire(object,kind);if(current(s,op))fire(object,'loadend');
  }
  function timeout(object,s,op) {
    clearTimeout(op.timer);
    if(s.timeout&&!op.done)op.timer=setTimeout(()=>terminal(object,s,op,'timeout'),Math.max(0,s.timeout-(Date.now()-op.started)));
  }
  function simpleHeader(name,value) {
    if(value.length>128)return false;
    if(['accept-language','content-language'].includes(name))return /^[0-9A-Za-z *,\-.;=]*$/.test(value);
    if(name==='accept')return !/[\x00-\x08\x0a-\x1f\x7f"():<>?@[\]{}]/.test(value);
    if(name==='content-type')return /^(?:application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)(?:\s*;|$)/i.test(value)&&!/[\x00-\x08\x0a-\x1f\x7f"():<>?@[\]{}]/.test(value);
    return false;
  }
  function allowed(response,credentials) {
    const allow=response.headers.get('access-control-allow-origin');
    if(allow!==origin&&!(allow==='*'&&!credentials))throw error('CORS origin is not allowed','NetworkError');
    if(credentials&&response.headers.get('access-control-allow-credentials')!=='true')throw error('CORS credentials are not allowed','NetworkError');
  }
  function bodySync(value,headers) {
    if(value==null)return undefined;
    if(value instanceof Blob){const reader=new realm.FileReaderSync();if(value.type&&!headers.has('content-type'))headers.set('content-type',value.type);return new Uint8Array(reader.readAsArrayBuffer(value));}
    if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice();
    if(Object.prototype.toString.call(value)==='[object ArrayBuffer]')return new Uint8Array(value).slice();
    if(value instanceof FormData)throw error('Synchronous FormData encoding is not implemented','NotSupportedError');
    if(!headers.has('content-type'))headers.set('content-type',value instanceof URLSearchParams?'application/x-www-form-urlencoded;charset=UTF-8':'text/plain;charset=UTF-8');
    return String(value);
  }
  async function bodyAsync(value,headers) {
    if(value instanceof Blob){if(value.type&&!headers.has('content-type'))headers.set('content-type',value.type);return new Uint8Array(await Blob.prototype.arrayBuffer.call(value));}
    if(value instanceof FormData){const request=new Request('http://form.invalid/',{method:'POST',body:value});if(!headers.has('content-type'))headers.set('content-type',request.headers.get('content-type'));return new Uint8Array(await request.arrayBuffer());}
    return bodySync(value,headers);
  }
  function finish(object,s,op,result) {
    if(!current(s,op)||op.done)return;
    const cross=['http:','https:'].includes(new URL(result.url).protocol)&&new URL(result.url).origin!==origin;
    if(cross)allowed(result,s.withCredentials);
    const exposed=new Set((result.headers.get('access-control-expose-headers')??'').split(',').map(value=>value.trim().toLowerCase()));
    s.headers=new Headers([...result.headers].filter(([name])=>!['set-cookie','set-cookie2'].includes(name)&&(!cross||SIMPLE_RESPONSE.has(name)||exposed.has(name)||(exposed.has('*')&&!s.withCredentials))));
    s.status=result.status;s.statusText=result.statusText;s.responseURL=result.url;s.bytes=new Uint8Array(result.bytes);s.mime=s.overrideMime??result.headers.get('content-type')??'';
    let charset=s.responseType==='json'?'utf-8':/charset\s*=\s*"?([^;"\s]+)/i.exec(s.mime)?.[1]??'utf-8';
    try{s.text=new TextDecoder(charset).decode(s.bytes)}catch{s.text=new TextDecoder().decode(s.bytes)}
    const length=result.headers.get('content-length'),total=length!==null&&/^\d+$/.test(length)?Number(length):0;
    if(s.async){
      s.readyState=2;fire(object,'readystatechange');if(!current(s,op)||op.done)return;
      fire(object,'loadstart',0,total,false);if(!current(s,op)||op.done)return;
      s.readyState=3;fire(object,'readystatechange');if(!current(s,op)||op.done)return;
      if(s.bytes.length){fire(object,'progress',s.bytes.length,total,false);if(!current(s,op)||op.done)return;}
    }
    cancel(op);s.sending=false;s.readyState=4;fire(object,'readystatechange');if(!current(s,op))return;
    fire(object,'load',s.bytes.length,total,!s.async&&length!==null);if(current(s,op))fire(object,'loadend',s.bytes.length,total,!s.async&&length!==null);
  }
  async function perform(object,s,op,body) {
    try {
      const headers=new Headers(s.requestHeaders);if(!headers.has('accept'))headers.set('accept','*/*');
      const bytes=['GET','HEAD'].includes(s.method)?undefined:await bodyAsync(body,headers);if(!current(s,op)||op.done)return;
      const cross=['http:','https:'].includes(new URL(s.url).protocol)&&new URL(s.url).origin!==origin;
      const unsafe=[...headers].filter(([name,value])=>!simpleHeader(name,value)).map(([name])=>name).sort();
      if(cross||!['GET','HEAD'].includes(s.method))headers.set('origin',origin);
      const init={method:s.method,headers,body:bytes,signal:op.controller.signal,credentials:s.withCredentials?'include':'same-origin'};
      const preflight=cross&&(!['GET','HEAD','POST'].includes(s.method)||unsafe.length);
      if(preflight){const h=new Headers({'origin':origin,'access-control-request-method':s.method});if(unsafe.length)h.set('access-control-request-headers',unsafe.join(', '));const r=await fetch(s.url,{method:'OPTIONS',headers:h,signal:op.controller.signal,credentials:'omit'});allowed(r,s.withCredentials);if(!r.ok)throw error('CORS preflight failed','NetworkError');const methods=(r.headers.get('access-control-allow-methods')??'').split(',').map(x=>x.trim());if(!methods.includes(s.method)&&!(methods.includes('*')&&!s.withCredentials))throw error('CORS method is not allowed','NetworkError');const names=(r.headers.get('access-control-allow-headers')??'').toLowerCase().split(',').map(x=>x.trim());if(unsafe.some(name=>!names.includes(name)&&!(names.includes('*')&&!s.withCredentials&&name!=='authorization')))throw error('CORS headers are not allowed','NetworkError');}
      const response=await fetch(s.url,init),result={status:response.status,statusText:response.statusText,url:response.url||s.url,headers:response.headers,bytes:new Uint8Array(await response.arrayBuffer())};
      if(preflight&&new URL(result.url).origin!==new URL(s.url).origin)throw error('Redirect requires a fresh CORS preflight','NetworkError');
      finish(object,s,op,result);
    }catch{terminal(object,s,op,'error')}
  }
  const bridge = {
    init(object,upload){states.set(object,{readyState:0,responseType:'',withCredentials:false,timeout:0,requestHeaders:new Headers(),sending:false,upload,async:true});reset(state(object));},
    open(object,args){
      if(args.length<2)throw new realm.TypeError('open requires a method and URL');const s=state(object);let[method,input,async=true,username,password]=args;
      method=String(method);if(!TOKEN.test(method))throw error('Invalid HTTP method','SyntaxError');if(['CONNECT','TRACE','TRACK'].includes(method.toUpperCase()))throw error('Forbidden HTTP method','SecurityError');
      if(!active())throw error('The worker is disposed');
      let url;try{url=new URL(String(input),typeof baseURL==='function'?baseURL():baseURL??realm.location.href)}catch{throw error('Invalid request URL','SyntaxError')}
      if(username!=null)url.username=String(username);if(password!=null)url.password=String(password);
      if(url.username||url.password)throw error('URL credentials are not yet supported by worker XHR','NotSupportedError');url.hash='';
      cancel(s.op);s.op=null;s.sending=false;s.method=['DELETE','GET','HEAD','OPTIONS','POST','PUT'].includes(method.toUpperCase())?method.toUpperCase():method;s.url=url.href;s.async=Boolean(async);s.requestHeaders=new Headers();s.overrideMime=undefined;reset(s);
      if(s.readyState!==1){s.readyState=1;fire(object,'readystatechange')}
    },
    header(object,name,value){const s=state(object);if(s.readyState!==1||s.sending)throw error('Request is not OPENED');name=String(name);value=String(value).replace(/^[\t ]+|[\t ]+$/g,'');if(!TOKEN.test(name)||/[^\t\x20-\x7e\x80-\xff]/.test(value))throw error('Invalid HTTP header','SyntaxError');name=name.toLowerCase();if(FORBIDDEN.has(name)||name.startsWith('sec-')||name.startsWith('proxy-'))return;s.requestHeaders.append(name,value)},
    send(object,body){
      const s=state(object);if(s.readyState!==1||s.sending)throw error('Request is not OPENED or has already been sent');if(!active())throw error('The worker is disposed');s.sending=true;
      const op={controller:new AbortController(),started:Date.now(),done:false};s.op=op;live.add(op);
      if(s.async){timeout(object,s,op);void perform(object,s,op,body);return}
      if(typeof syncRequest!=='function'){cancel(op);s.sending=false;throw error('Synchronous XHR transport is unavailable','NotSupportedError')}
      try{
        const headers=new Headers(s.requestHeaders);if(!headers.has('accept'))headers.set('accept','*/*');const bytes=['GET','HEAD'].includes(s.method)?undefined:bodySync(body,headers);
        const cross=['http:','https:'].includes(new URL(s.url).protocol)&&new URL(s.url).origin!==origin;if(cross)throw error('Synchronous cross-origin XHR is not implemented','NotSupportedError');
        if(!['GET','HEAD'].includes(s.method))headers.set('origin',origin);
        const result=syncRequest(s.url,{method:s.method,headers:[...headers],body:bytes,credentials:s.withCredentials?'include':'same-origin'},s.timeout);
        result.headers=new Headers(result.headers);finish(object,s,op,result);
      }catch(cause){terminal(object,s,op,'error');throw cause}
    },
    abort(object){const s=state(object);if(s.sending&&s.op&&!s.op.done)terminal(object,s,s.op,'abort');else{cancel(s.op);s.op=null;s.sending=false;reset(s);s.readyState=0}},
    override(object,value){const s=state(object);if([3,4].includes(s.readyState))throw error('Cannot override MIME type after loading starts');s.overrideMime=String(value)},
    get(object,key){const s=state(object);if(key==='responseText'){if(!['','text'].includes(s.responseType))throw error('responseType is not text');return s.readyState>=3?s.text:''}
      if(key==='responseXML'){if(s.readyState===4&&['','document'].includes(s.responseType))throw new realm.Error('NotSupportedInWorker');return null}
      if(key!=='response')return s[key];if(['','text'].includes(s.responseType))return s.readyState>=3?s.text:'';if(s.readyState!==4||!s.status)return null;if(s.cached!==undefined)return s.cached;
      if(s.responseType==='json'){try{s.cached=realm.JSON.parse(s.text)}catch{s.cached=null}}else if(s.responseType==='document')s.cached=null;else{const bytes=new realm.Uint8Array(s.bytes.length);bytes.set(s.bytes);s.cached=s.responseType==='blob'?new realm.Blob([bytes.buffer],{type:s.mime}):bytes.buffer}return s.cached;
    },
    set(object,key,value){const s=state(object);if(key==='responseType'){value=String(value);if(!TYPES.has(value))return;if([3,4].includes(s.readyState))throw error('Cannot change responseType after loading starts');s.responseType=value}
      else if(key==='withCredentials'){if(![0,1].includes(s.readyState)||s.sending)throw error('Cannot change credentials after sending');s.withCredentials=Boolean(value)}
      else if(key==='timeout'){const number=Number(value);s.timeout=Number.isFinite(number)?Math.trunc(number)>>>0:0;if(s.sending)timeout(object,s,s.op)}
    },
    responseHeader(object,name){const s=state(object);if(s.readyState<2)return null;try{return s.headers.get(String(name))}catch{return null}},
    responseHeaders(object){const s=state(object);return s.readyState<2?'':[...s.headers].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,value])=>name+': '+value+'\r\n').join('')},
    trust: trustEvent,
  };
  const result=evaluate(`(bridge=>{
    class ProgressEvent extends Event {constructor(type,init={}){super(type,init);Object.defineProperties(this,{loaded:{value:Number(init.loaded??0),enumerable:true},total:{value:Number(init.total??0),enumerable:true},lengthComputable:{value:Boolean(init.lengthComputable),enumerable:true}})}get [Symbol.toStringTag](){return 'ProgressEvent'}}
    class XMLHttpRequestEventTarget extends EventTarget {get [Symbol.toStringTag](){return 'XMLHttpRequestEventTarget'}}
    class XMLHttpRequestUpload extends XMLHttpRequestEventTarget {get [Symbol.toStringTag](){return 'XMLHttpRequestUpload'}}
    class XMLHttpRequest extends XMLHttpRequestEventTarget {
      constructor(){super();bridge.init(this,new XMLHttpRequestUpload())}
      open(...args){return bridge.open(this,args)}setRequestHeader(name,value){if(arguments.length<2)throw new TypeError('setRequestHeader requires two arguments');return bridge.header(this,name,value)}
      send(body=null){return bridge.send(this,body)}abort(){return bridge.abort(this)}overrideMimeType(value){return bridge.override(this,value)}
      getResponseHeader(name){return bridge.responseHeader(this,name)}getAllResponseHeaders(){return bridge.responseHeaders(this)}
      get [Symbol.toStringTag](){return 'XMLHttpRequest'}
    }
    for(const key of ['readyState','status','statusText','responseURL','upload','responseText','responseXML','response'])Object.defineProperty(XMLHttpRequest.prototype,key,{get(){return bridge.get(this,key)},enumerable:true,configurable:true});
    for(const key of ['responseType','timeout','withCredentials'])Object.defineProperty(XMLHttpRequest.prototype,key,{get(){return bridge.get(this,key)},set(value){bridge.set(this,key,value)},enumerable:true,configurable:true});
    const handlers=new WeakMap();for(const type of ['readystatechange','loadstart','progress','load','error','timeout','abort','loadend'])Object.defineProperty(XMLHttpRequestEventTarget.prototype,'on'+type,{get(){return handlers.get(this)?.[type]??null},set(value){let entries=handlers.get(this);if(!entries){entries=Object.create(null);handlers.set(this,entries)}if(entries[type])this.removeEventListener(type,entries[type]);entries[type]=typeof value==='function'?value:null;if(entries[type])this.addEventListener(type,entries[type])},enumerable:true,configurable:true});
    for(const[name,value]of Object.entries({UNSENT:0,OPENED:1,HEADERS_RECEIVED:2,LOADING:3,DONE:4}))for(const target of[XMLHttpRequest,XMLHttpRequest.prototype])Object.defineProperty(target,name,{value,enumerable:true});
    return {XMLHttpRequest,XMLHttpRequestEventTarget,XMLHttpRequestUpload,ProgressEvent,emit(object,type,progress){const event=progress===null?new Event(type):new ProgressEvent(type,progress);object.dispatchEvent(bridge.trust(event))}};
  })`)(bridge);
  emit=result.emit;for(const key of ['XMLHttpRequest','XMLHttpRequestEventTarget','XMLHttpRequestUpload','ProgressEvent'])Object.defineProperty(realm,key,{value:result[key],configurable:true,writable:true});
  const dispose=()=>{disposed=true;for(const op of live)cancel(op);signal?.removeEventListener('abort',dispose)};signal?.addEventListener('abort',dispose,{once:true});return{dispose};
}
