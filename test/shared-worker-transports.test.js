import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {WebSocketServer} from 'ws';
import {Browser} from '../src/browser.js';
import {browserWebSocketQuota} from '../src/websocket-transports.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t,limit=8){
 const streams=[],sockets=[],wire=[];
 const server=http.createServer((request,response)=>{
  wire.push({url:request.url,headers:request.headers});
  if(request.url.startsWith('/events')){
   const entry={url:request.url,closed:false};streams.push(entry);
   response.on('close',()=>entry.closed=true);
   response.writeHead(200,{'content-type':'text/event-stream'});
   response.write('id: 7\ndata: real-stream\n\n');return;
  }
  response.writeHead(200,{'content-type':'text/html','set-cookie':'transport=actual; Path=/'});
  response.end('<!doctype html><body>Shared realtime');
 });
 const wss=new WebSocketServer({server,path:'/socket'});
 wss.on('connection',(socket,request)=>{
  const entry={headers:request.headers,closed:false};sockets.push(entry);
  socket.on('close',()=>entry.closed=true);socket.on('error',()=>{});
  socket.on('message',bytes=>socket.send('echo:'+bytes.toString()));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=new Browser({loadResources:['worker'],wsMaxConcurrent:limit});
 t.after(async()=>{browser.close();for(const socket of wss.clients)socket.terminate();server.closeAllConnections();await Promise.all([new Promise(r=>wss.close(r)),new Promise(r=>server.close(r))])});
 const page=browser.createPage();await page.navigate(origin+'/doc');
 const native=JSON.parse(await readFile(new URL('../proposals/shared-worker/shared-realtime-v2-native.json',import.meta.url),'utf8'));
 page.evaluate(native.setup);
 async function act(action){const data={action,socket:origin.replace('http:','ws:')+'/socket',events:origin+'/events?'+action};return JSON.parse(await page.evaluate(`new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owned transport deadline')),4000);actor.port.onmessage=e=>{clearTimeout(timer);resolve(JSON.stringify(e.data))};actor.port.postMessage(${JSON.stringify(data)})})`))}
 return{browser,page,native,act,streams,sockets,wire,origin};
}
test('SharedWorker real SSE/WebSocket messages, principals and parked target lifetime match Native',{timeout:10000},async t=>{
 const f=await fixture(t);
 for(const row of f.native.rows)assert.deepEqual(await f.act(row.action),JSON.parse(row.result.result.value));
 await delay(150);
 assert.deepEqual(f.streams.map(({url,closed})=>({url,closed})),f.native.beforeTargetClose.streams);
 assert.deepEqual(f.sockets.map(s=>s.closed),f.native.beforeTargetClose.sockets.map(s=>s.closed));
 for(const socket of f.sockets){assert.equal(socket.headers.origin,'null');assert.equal(socket.headers.cookie,'transport=actual')}
 for(const request of f.wire.filter(q=>q.url.startsWith('/events'))){assert.equal(request.headers.cookie,'transport=actual');assert.equal(request.headers.referer,f.origin+'/doc')}
 f.page.close();await delay(150);
 assert.deepEqual(f.streams.map(({url,closed})=>({url,closed})),f.native.streams);
 assert.deepEqual(f.sockets.map(s=>s.closed),f.native.sockets.map(s=>s.closed));
 assert.equal(browserWebSocketQuota(f.browser).usage(),0);
});
test('a closed SharedWorker retains its real browser admission until the owning Page closes',{timeout:10000},async t=>{
 const f=await fixture(t,1);assert.deepEqual(await f.act('park'),{opened:true});await delay(100);
 assert.equal(browserWebSocketQuota(f.browser).usage(),1);
 const other=f.browser.createPage();await other.navigate(f.origin+'/other');
 const connect=`new Promise(resolve=>{globalThis.socket=new WebSocket(${JSON.stringify(f.origin.replace('http:','ws:')+'/socket')});socket.onerror=()=>{};socket.onclose=()=>resolve('closed');socket.onopen=()=>resolve('open')})`;
 assert.equal(await other.evaluate(connect),'closed');
 assert.equal(f.sockets.length,1);
 f.page.close();assert.equal(browserWebSocketQuota(f.browser).usage(),0);
 assert.equal(await other.evaluate(connect),'open');
 assert.equal(f.sockets.length,2);
});
