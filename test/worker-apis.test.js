import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import {Browser} from '../src/browser.js';
import vm from 'node:vm';
import {installWebSocket} from '../src/worker-websocket.js';
import {installWorkerXHR} from '../src/worker-xhr.js';

const plain=value=>JSON.parse(JSON.stringify(value));
const deadline=(promise,ms=7000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned worker probe deadline')),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
async function fixture(t,{host='127.0.0.1'}={}){
  const sources=new Map(),requests=[],sockets=new Set(),timers=new Set(),connections=[],upgrades=[];
  const server=createServer(async(request,response)=>{
    const parts=[];for await(const bytes of request)parts.push(bytes);const body=Buffer.concat(parts);
    requests.push({url:request.url,method:request.method,headers:request.headers,bytes:[...body]});
    const url=new URL(request.url,'http://local.test');
    if(url.pathname==='/worker.js'){response.setHeader('content-type','text/javascript');response.end(sources.get(url.searchParams.get('id'))??'');return}
    if(url.pathname==='/echo'){response.writeHead(201,'Created',{'content-type':'application/octet-stream','content-length':body.length,'x-real':'yes','set-cookie':'worker_cookie=actual'});response.end(body);return}
    if(url.pathname==='/json'){response.setHeader('content-type','application/json');response.end('{"actual":42}');return}
    if(url.pathname==='/bytes'){response.setHeader('content-type','application/octet-stream');response.end(Buffer.from([0,255,65]));return}
    if(url.pathname==='/empty'){response.setHeader('content-length','0');response.end();return}
    if(url.pathname==='/network-failure'){response.destroy();return}
    if(url.pathname==='/cors'){
      response.setHeader('access-control-allow-origin',request.headers.origin??'null');response.setHeader('access-control-allow-methods','PUT');response.setHeader('access-control-allow-headers','x-real');
      if(request.method==='OPTIONS'){response.writeHead(204);response.end();return}
      response.setHeader('content-type','application/octet-stream');response.setHeader('x-hidden','actual-but-not-exposed');response.end(body);return;
    }
    if(url.pathname==='/cors-denied'){response.end('actual but forbidden response bytes');return}
    if(url.pathname==='/slow'){const timer=setTimeout(()=>{timers.delete(timer);if(!response.destroyed)response.end('actual late bytes')},120);timers.add(timer);return}
    response.setHeader('content-type','text/html');response.end('<body><p>Owned worker fixture</p>');
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});
  const wss=new WebSocketServer({noServer:true,handleProtocols:list=>list.has('actual')?'actual':false});
  server.on('upgrade',(request,socket,head)=>{upgrades.push({url:request.url,headers:request.headers});if(request.url==='/reject'){socket.end('HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\n\r\n');return}wss.handleUpgrade(request,socket,head,client=>wss.emit('connection',client,request))});
  wss.on('connection',(socket,request)=>{connections.push({socket,headers:request.headers});socket.on('message',(bytes,binary)=>socket.send(bytes,{binary}))});
  server.listen(0,'0.0.0.0');await once(server,'listening');const origin=`http://${host}:${server.address().port}`;
  const browser=new Browser(),page=browser.createPage(),errors=[];page.on('pageError',error=>errors.push(String(error.message)));await page.navigate(origin);
  t.after(async()=>{browser.close();for(const timer of timers)clearTimeout(timer);for(const socket of wss.clients)socket.terminate();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))});
  let next=0;
  async function run(source,input){
    const id=String(++next);sources.set(id,`(async()=>{${source}})().then(value=>postMessage({value}),error=>postMessage({failure:{name:error.name,message:error.message,stack:error.stack}}));`);
    const worker=new page.dom.window.Worker(`/worker.js?id=${id}`);
    const message=deadline(new Promise((resolve,reject)=>{worker.onmessage=event=>event.data.failure?reject(Object.assign(new Error(event.data.failure.message),event.data.failure)):resolve(event.data.value);worker.onerror=event=>reject(event.error??new Error(event.message))}));
    if(input!==undefined)worker.postMessage(input);
    try{return await message}finally{worker.terminate()}
  }
  return{origin,run,page,browser,requests,connections,upgrades,errors};
}

test('dedicated worker FileReaderSync reads real native Blob bytes, encodings and error brands',async t=>{
  const f=await fixture(t),actual=await f.run(`const reader=new FileReaderSync(),blob=new Blob([new Uint8Array([0,65,195,169,255])],{type:'text/plain;charset=windows-1252'});const buffer=reader.readAsArrayBuffer(blob);let invalid,limited;try{reader.readAsText({})}catch(error){invalid={name:error.name,realm:error instanceof TypeError}}try{reader.readAsArrayBuffer(new Blob([new Uint8Array(8*1024*1024+1)]))}catch(error){limited=error.name}return{brand:Object.prototype.toString.call(reader),bytes:[...new Uint8Array(buffer)],realm:buffer instanceof ArrayBuffer,text:reader.readAsText(blob),utf8:reader.readAsText(blob,'utf-8'),invalidLabel:reader.readAsText(blob,'invalid'),binary:reader.readAsBinaryString(blob),data:reader.readAsDataURL(blob),empty:reader.readAsDataURL(new Blob([])),bom:reader.readAsText(new Blob([new Uint8Array([239,187,191,195,169])]),'windows-1252'),utf16:reader.readAsText(new Blob([new Uint8Array([255,254,65,0,233,0])])),invalid,limited,secure:isSecureContext,cookie:typeof cookieStore}`);
  assert.deepEqual(plain(actual),{brand:'[object FileReaderSync]',bytes:[0,65,195,169,255],realm:true,text:'\0AÃ©ÿ',utf8:'\0Aé�',invalidLabel:'\0AÃ©ÿ',binary:'\0AÃ©ÿ',data:'data:text/plain;charset=windows-1252;base64,AEHDqf8=',empty:'data:application/octet-stream;base64,',bom:'é',utf16:'Aé',invalid:{name:'TypeError',realm:true},limited:'NotReadableError',secure:true,cookie:'undefined'});
});

test('FileReaderSync reads actual Blob/File values cloned from the document',async t=>{
  const f=await fixture(t),file=new f.page.dom.window.File([new f.page.dom.window.Uint8Array([128,0,255])],'actual.bin',{type:'application/octet-stream'});
  const value=await f.run(`const file=await new Promise(resolve=>onmessage=event=>resolve(event.data));return{bytes:[...new Uint8Array(new FileReaderSync().readAsArrayBuffer(file))],name:file.name,file:file instanceof File}`,file);
  assert.deepEqual(plain(value),{bytes:[128,0,255],name:'actual.bin',file:true});
});

test('asynchronous worker XHR sends real bytes and delivers native measured states/trusted events',async t=>{
  const f=await fixture(t),actual=await f.run(`const x=new XMLHttpRequest(),events=[];for(const type of ['readystatechange','loadstart','progress','load','loadend'])x.addEventListener(type,event=>events.push([type,x.readyState,event.isTrusted,event instanceof ProgressEvent,event.target===x]));const done=new Promise(resolve=>x.onloadend=resolve);x.open('POST','/echo');x.responseType='arraybuffer';x.setRequestHeader('x-probe','actual');x.setRequestHeader('cookie','fake=bad');x.send(new Uint8Array([0,65,255]));await done;return{events,status:x.status,reason:x.statusText,bytes:[...new Uint8Array(x.response)],realm:x.response instanceof ArrayBuffer,header:x.getResponseHeader('x-real'),hidden:x.getResponseHeader('set-cookie'),cookie:typeof document,constructor:XMLHttpRequest instanceof Function,authorEvent:new Event('load').isTrusted}`);
  assert.deepEqual(plain(actual),{events:[['readystatechange',1,true,false,true],['readystatechange',2,true,false,true],['loadstart',2,true,true,true],['readystatechange',3,true,false,true],['progress',3,true,true,true],['readystatechange',4,true,false,true],['load',4,true,true,true],['loadend',4,true,true,true]],status:201,reason:'Created',bytes:[0,65,255],realm:true,header:'yes',hidden:null,cookie:'undefined',constructor:true,authorEvent:false});
  const request=f.requests.find(value=>value.url==='/echo');assert.deepEqual(request.bytes,[0,65,255]);assert.equal(request.headers['x-probe'],'actual');assert.equal(request.headers.cookie,undefined);assert.equal(request.headers.origin,f.origin);assert.match(f.page.dom.window.document.cookie,/worker_cookie=actual/);
});

test('synchronous worker XHR blocks only its worker and retains arbitrary response bytes',async t=>{
  const f=await fixture(t),actual=await f.run(`const x=new XMLHttpRequest(),events=[];for(const type of ['readystatechange','loadstart','progress','load','loadend'])x.addEventListener(type,event=>events.push([type,x.readyState,event.isTrusted]));x.open('POST','/echo',false);x.responseType='arraybuffer';x.send(new Uint8Array([0,65,255]));return{events,status:x.status,bytes:[...new Uint8Array(x.response)],realm:x.response instanceof ArrayBuffer}`);
  assert.deepEqual(plain(actual),{events:[['readystatechange',1,true],['readystatechange',4,true],['load',4,true],['loadend',4,true]],status:201,bytes:[0,65,255],realm:true});assert.deepEqual(f.requests.find(value=>value.url==='/echo').bytes,[0,65,255]);
});

test('abort/timeout cancel real worker requests and suppress late completion',async t=>{
  const f=await fixture(t),actual=await f.run(`const results={};for(const mode of ['abort','timeout']){const x=new XMLHttpRequest(),events=[];for(const type of ['readystatechange','loadstart','progress','load','error','abort','timeout','loadend'])x.addEventListener(type,event=>events.push([type,x.readyState,event.isTrusted]));x.open('GET','/slow');if(mode==='timeout')x.timeout=20;const done=new Promise(resolve=>x.onloadend=resolve);x.send();if(mode==='abort')x.abort();await done;await new Promise(resolve=>setTimeout(resolve,150));results[mode]={events,status:x.status,state:x.readyState}}return results`);
  assert.deepEqual(plain(actual),{abort:{events:[['readystatechange',1,true],['readystatechange',0,true],['abort',0,true],['loadend',0,true]],status:0,state:0},timeout:{events:[['readystatechange',1,true],['readystatechange',4,true],['timeout',4,true],['loadend',4,true]],status:0,state:4}});
});

test('worker XHR JSON and Blob responses retain genuine realm values and real data',async t=>{
  const f=await fixture(t),actual=await f.run(`const results={};for(const mode of ['json','blob']){const x=new XMLHttpRequest();x.open('GET',mode==='json'?'/json':'/bytes');x.responseType=mode;const done=new Promise(resolve=>x.onloadend=resolve);x.send();await done;results[mode]=mode==='json'?{data:x.response,realm:Object.getPrototypeOf(x.response)===Object.prototype}:{bytes:[...new Uint8Array(await x.response.arrayBuffer())],type:x.response.type,blob:x.response instanceof Blob}}return results`);
  assert.deepEqual(plain(actual),{json:{data:{actual:42},realm:true},blob:{bytes:[0,255,65],type:'application/octet-stream',blob:true}});
});

test('worker WebSocket performs actual protocol/origin handshakes, echo bytes and clean close',async t=>{
  const f=await fixture(t),actual=await f.run(`const socket=new WebSocket(new URL('/socket',location.href).href.replace('http:','ws:'),['actual']),events=[];let early,badCode;try{socket.send('early')}catch(error){early=error.name}try{socket.close(1001)}catch(error){badCode=error.name}const done=new Promise(resolve=>{let count=0;socket.onopen=event=>{events.push([event.type,event.isTrusted]);socket.send('text');socket.send(new Uint8Array([0,255,65]))};socket.onmessage=async event=>{const blob=event.data instanceof Blob;events.push([event.type,event.isTrusted,event.origin,blob,blob?[...new Uint8Array(await event.data.arrayBuffer())]:event.data]);if(++count===2)socket.close(1000,'finished')};socket.onclose=event=>{events.push([event.type,event.isTrusted,event.code,event.reason,event.wasClean]);resolve()};socket.onerror=()=>resolve()});await done;return{events,early,badCode,state:socket.readyState,protocol:socket.protocol,binaryType:socket.binaryType,constructor:WebSocket instanceof Function}`);
  assert.deepEqual(plain(actual),{events:[['open',true],['message',true,'',false,'text'],['message',true,'',true,[0,255,65]],['close',true,1000,'finished',true]],early:'InvalidStateError',badCode:'InvalidAccessError',state:3,protocol:'actual',binaryType:'blob',constructor:true});assert.equal(f.connections[0].headers.origin,f.origin);assert.equal(f.connections[0].headers['sec-websocket-protocol'],'actual');
});

test('worker binaryType arraybuffer yields a real same-realm buffer',async t=>{
  const f=await fixture(t),actual=await f.run(`const socket=new WebSocket(new URL('/socket',location.href).href.replace('http:','ws:'));socket.binaryType='arraybuffer';return await new Promise(resolve=>{socket.onopen=()=>socket.send(new Uint8Array([128,0,255]));socket.onmessage=event=>{socket.close();resolve({bytes:[...new Uint8Array(event.data)],realm:event.data instanceof ArrayBuffer})}})`);
  assert.deepEqual(plain(actual),{bytes:[128,0,255],realm:true});
});

test('worker secure context follows the actual non-loopback HTTP creator',async t=>{
  const f=await fixture(t,{host:'0.0.0.0'}),actual=await f.run(`return{secure:isSecureContext,location:location.href}`);
  assert.equal(actual.secure,false);assert.ok(actual.location.startsWith('http://0.0.0.0:'));
});

test('empty XHR emits the measured loading state without invented progress or upload events',async t=>{
  const f=await fixture(t),actual=await f.run(`const x=new XMLHttpRequest(),events=[],upload=[];for(const type of ['readystatechange','loadstart','progress','load','loadend']){x.addEventListener(type,event=>events.push([type,x.readyState]));x.upload.addEventListener(type,event=>upload.push(type))}x.open('GET','/empty');const done=new Promise(resolve=>x.onloadend=resolve);x.send();await done;return{events,upload,status:x.status,text:x.responseText}`);
  assert.deepEqual(plain(actual),{events:[['readystatechange',1],['readystatechange',2],['loadstart',2],['readystatechange',3],['readystatechange',4],['load',4],['loadend',4]],upload:[],status:200,text:''});
});

test('worker principal and secure inheritance ignore authored public metadata overrides',async t=>{
  const f=await fixture(t),window=f.page.dom.window;
  Object.defineProperty(window,'isSecureContext',{value:false,configurable:true});
  Object.defineProperty(window,'origin',{value:'http://unowned.invalid',configurable:true});
  Object.defineProperty(window.document,'baseURI',{value:'http://unowned.invalid/',configurable:true});
  const actual=await f.run(`return{secure:isSecureContext,origin:location.origin}`);
  assert.deepEqual(plain(actual),{secure:true,origin:f.origin});
  assert.throws(()=>new window.Worker('http://unowned.invalid/worker.js'),error=>error.name==='SecurityError');
  assert.ok(f.requests.every(request=>!request.headers.host.includes('unowned')));
});

test('an insecure creator cannot grant worker secure context through public property overrides',async t=>{
  const f=await fixture(t,{host:'0.0.0.0'}),window=f.page.dom.window;
  Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});Object.defineProperty(window,'origin',{value:'https://fake.invalid',configurable:true});
  assert.equal((await f.run('return{secure:isSecureContext}')).secure,false);
});

test('opaque data workers retain actual creator security while their own URL origin is null',async t=>{
  const f=await fixture(t),worker=new f.page.dom.window.Worker('data:text/javascript,'+encodeURIComponent('postMessage({secure:isSecureContext,origin:location.origin})'));
  try{const actual=await deadline(new Promise((resolve,reject)=>{worker.onmessage=event=>resolve(event.data);worker.onerror=event=>reject(event.error)}));assert.deepEqual(plain(actual),{secure:true,origin:'null'})}finally{worker.terminate()}
});

test('worker XHR performs real CORS preflight and blocks unapproved response bytes',async t=>{
  const f=await fixture(t),cross=f.origin.replace('127.0.0.1','0.0.0.0');
  const actual=await f.run(`const results={};for(const mode of ['cors','cors-denied']){const x=new XMLHttpRequest();x.open(mode==='cors'?'PUT':'GET',${JSON.stringify(cross)}+'/'+mode);if(mode==='cors'){x.responseType='arraybuffer';x.setRequestHeader('x-real','actual')}const done=new Promise(resolve=>x.onloadend=resolve);let failed=false;x.onerror=()=>failed=true;x.send(mode==='cors'?new Uint8Array([0,128,255]):null);await done;results[mode]={status:x.status,failed,bytes:mode==='cors'?[...new Uint8Array(x.response)]:x.responseText,hidden:x.getResponseHeader('x-hidden')}}return results`);
  assert.deepEqual(plain(actual),{cors:{status:200,failed:false,bytes:[0,128,255],hidden:null},'cors-denied':{status:0,failed:true,bytes:'',hidden:null}});
  const preflight=f.requests.find(request=>request.method==='OPTIONS');assert.equal(preflight.headers['access-control-request-method'],'PUT');assert.equal(preflight.headers['access-control-request-headers'],'x-real');assert.equal(preflight.headers.origin,f.origin);
});

test('network XHR and WebSocket failures deliver genuine trusted terminal events',async t=>{
  const f=await fixture(t),actual=await f.run(`const x=new XMLHttpRequest(),events=[];for(const type of ['readystatechange','error','loadend'])x.addEventListener(type,event=>events.push([type,x.readyState,event.isTrusted]));x.open('GET','/network-failure');let done=new Promise(resolve=>x.onloadend=resolve);x.send();await done;const socket=new WebSocket('/reject'),socketEvents=[];done=new Promise(resolve=>{socket.onerror=event=>socketEvents.push([event.type,event.isTrusted]);socket.onclose=event=>{socketEvents.push([event.type,event.isTrusted,event.code,event.reason,event.wasClean]);resolve()}});await done;return{events,status:x.status,text:x.responseText,socketEvents}`);
  assert.deepEqual(plain(actual),{events:[['readystatechange',1,true],['readystatechange',4,true],['error',4,true],['loadend',4,true]],status:0,text:'',socketEvents:[['error',true],['close',true,1006,'',false]]});
});

test('worker-owned request/socket bases remain actual after authored location replacement',async t=>{
  const f=await fixture(t),actual=await f.run(`globalThis.location={href:'http://unowned.invalid/',origin:'http://unowned.invalid'};const x=new XMLHttpRequest();x.open('GET','/bytes');x.responseType='arraybuffer';let done=new Promise(resolve=>x.onloadend=resolve);x.send();await done;const socket=new WebSocket('/socket');done=new Promise(resolve=>{socket.onopen=()=>socket.send('actual');socket.onmessage=event=>{socket.close();resolve(event.data)}});return{bytes:[...new Uint8Array(x.response)],message:await done,url:socket.url}`);
  assert.deepEqual([...actual.bytes],[0,255,65]);assert.equal(actual.message,'actual');assert.equal(actual.url,f.origin.replace('http:','ws:')+'/socket');assert.equal(f.connections[0].headers.origin,f.origin);
});

test('duplicate socket protocols use a real repeated upgrade offer and genuine server rejection',async t=>{
  const f=await fixture(t),actual=await f.run(`const socket=new WebSocket('/socket',['actual','actual']),events=[];await new Promise(resolve=>{socket.onerror=event=>events.push(event.type);socket.onclose=event=>{events.push([event.type,event.code,event.wasClean]);resolve()}});return{events,state:socket.readyState}`);
  assert.deepEqual(plain(actual),{events:['error',['close',1006,false]],state:3});assert.equal(f.upgrades[0].headers['sec-websocket-protocol'],'actual, actual');assert.equal(f.connections.length,0);
});

test('explicit API controller disposal silently cancels real requests and prevents new connections',async t=>{
  const f=await fixture(t),context=vm.createContext({Event,EventTarget,MessageEvent,DOMException,Blob});
  const realm=vm.runInContext('globalThis',context),evaluate=source=>vm.runInContext(source,context),signal=new AbortController().signal;
  const sockets=installWebSocket(realm,{evaluate,origin:f.origin,baseURL:f.origin,signal});
  const fetches=[];const xhr=installWorkerXHR(realm,{evaluate,origin:f.origin,baseURL:f.origin,signal,fetch:(url,init)=>{fetches.push({url,signal:init.signal});return fetch(url,init)}});
  const request=new realm.XMLHttpRequest();request.open('GET','/slow');const events=[];request.onloadend=()=>events.push('end');request.send();await new Promise(resolve=>setTimeout(resolve,15));
  sockets.dispose();xhr.dispose();assert.equal(signal.aborted,false);assert.equal(fetches[0].signal.aborted,true);
  assert.throws(()=>new realm.WebSocket('/socket'),error=>error.name==='InvalidStateError');assert.throws(()=>new realm.XMLHttpRequest().open('GET','/bytes'),error=>error.name==='InvalidStateError');
  await new Promise(resolve=>setTimeout(resolve,150));assert.deepEqual(events,[]);assert.equal(f.upgrades.length,0);
});
