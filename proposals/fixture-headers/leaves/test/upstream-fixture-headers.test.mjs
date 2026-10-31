import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startFixtureServer} from '../scripts/upstream-fixture-server.mjs';
function get(origin,path,method='GET'){return new Promise((resolve,reject)=>{const req=http.request(origin+path,{method,headers:{Connection:'keep-alive'},agent:false},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,rawHeaders:res.rawHeaders,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});}
async function raw(origin,path){const socket=net.connect(Number(new URL(origin).port),'127.0.0.1');await once(socket,'connect');const chunks=[];socket.on('data',x=>chunks.push(x));socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\n\r\n`);await once(socket,'end');socket.destroy();return Buffer.concat(chunks);}
let root,upstream;
test.before(async()=>{root=await mkdtemp(join(tmpdir(),'red-panda-fixture-headers-'));await writeFile(join(root,'plain.html'),'real plain fixture');await writeFile(join(root,'authored.html'),'authored fixture');await writeFile(join(root,'authored.html.headers'),'Date: Fri, 01 Jan 2021 00:00:00 GMT\nConnection: close\nKeep-Alive: timeout=9\n');upstream=await startFixtureServer(root,{port:0,profile:'upstream'});});
test.after(async()=>{await upstream?.close();await rm(root,{recursive:true,force:true});});
test('upstream XHR response has only its explicit content type and length',async()=>{const r=await get(upstream.origin,'/xhr');assert.equal(r.status,200);assert.equal(r.body.toString(),'1234567890'.repeat(10));assert.deepEqual(r.rawHeaders,['Content-Type','text/html; charset=utf-8','Content-Length','100']);for(const name of ['date','connection','keep-alive'])assert.equal(r.headers[name],undefined);});
test('upstream duplicate headers retain order and values without generated extras',async()=>{const r=await get(upstream.origin,'/xhr/duplicate_headers');assert.deepEqual(r.rawHeaders,['X-B','1','X-B','2, 3','X-A','a','X_C','c','Content-Length','0']);assert.equal(r.headers['x-b'],'1, 2, 3');});
test('explicit sidecar Date, Connection and Keep-Alive headers survive',async()=>{const r=await get(upstream.origin,'/src/browser/tests/authored.html');assert.equal(r.headers.date,'Fri, 01 Jan 2021 00:00:00 GMT');assert.equal(r.headers.connection,'close');assert.equal(r.headers['keep-alive'],'timeout=9');assert.equal(r.body.toString(),'authored fixture');});
test('static HEAD preserves length and streaming preserves chunking without implicit extras',async()=>{const head=await get(upstream.origin,'/src/browser/tests/plain.html','HEAD');assert.equal(head.headers['content-length'],'18');assert.equal(head.body.length,0);const stream=await get(upstream.origin,'/images/chunked.png');assert.equal(stream.headers['transfer-encoding'],'chunked');assert.equal(stream.headers.date,undefined);assert.equal(stream.headers.connection,undefined);assert.equal(stream.headers['keep-alive'],undefined);assert.equal(stream.body.toString(),'<svg xmlns="http://www.w3.org/2000/svg"/>');});
test('raw byte-exact response bypass remains unchanged',async()=>{const r=await raw(upstream.origin,'/raw/cacheable');assert.equal(r.toString(),'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nCache-Control: max-age=600\r\nContent-Length: 11\r\n\r\nhello world');});
test('legacy static and xhr-subset profiles retain Node automatic headers',async()=>{for(const profile of ['static','xhr-subset']){const server=await startFixtureServer(root,{port:0,profile});try{const r=await get(server.origin,profile==='static'?'/src/browser/tests/plain.html':'/xhr');assert(r.headers.date);assert.equal(r.headers.connection,'keep-alive');assert.equal(r.headers['keep-alive'],'timeout=5');}finally{await server.close();}}});
