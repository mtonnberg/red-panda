import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp,readFile,writeFile,symlink,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync,brotliCompressSync,brotliDecompressSync } from 'node:zlib';
import { startFixtureServer } from '../scripts/upstream-fixture-server.mjs';
const fixtureRoot=process.env.LP_FIXTURE_ROOT??'/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests';
function request(origin,path,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=http.request(origin+path,{method,headers},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,reason:res.statusMessage,headers:res.headers,rawHeaders:res.rawHeaders,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end(body);});}
async function raw(port,path,headers=''){const socket=net.connect(port,'127.0.0.1');await once(socket,'connect');const chunks=[];socket.on('data',x=>chunks.push(x));socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\n${headers}\r\n`);await once(socket,'end');socket.destroy();return Buffer.concat(chunks);}
let server;
test.before(async()=>{server=await startFixtureServer(fixtureRoot,{port:0,profile:'upstream',webSocketPort:0});});
test.after(async()=>{await server?.close();});
test('route bytes, statuses, headers and canonical redirects',async()=>{
 assert.deepEqual(server.metadata.unsupportedRouteGroups,[]);assert.equal(server.metadata.webSocketPort,server.webSocket.port);
 const cases=[
 ['/resource-timing/tao',200,'window.__rt_tao = true;','timing-allow-origin','https://example.com, *'],
 ['/resource-timing/plain',200,'window.__rt_plain = true;'],
 ['/resource-timing/redirect',302,'','location','/resource-timing/plain'],
 ['/redirect-no-fragment',302,'','location','/redirect-target'],
 ['/redirect-with-fragment',302,'','location','/redirect-target#target_fragment'],
 ['/redirect-cross-origin/src/browser/tests/hi.html',302,'','location','http://localhost:9582/src/browser/tests/hi.html'],
 ['/redirect-cross-origin-x-hop',302,'','location','http://localhost:9582/echo-x-hop'],
 ['/redirect-target',200,'<!DOCTYPE html><title>landed</title>'],
 ['/303-no-location',303,'<!DOCTYPE html><title>landed</title><p>see other body</p>'],
 ['/300-with-location',300,'<!DOCTYPE html><title>choices</title><p>multiple choices body</p>','location','http://127.0.0.1:9582/hi.html'],
 ['/xhr/redirect',302,'','location','http://127.0.0.1:9582/xhr'],
 ['/defer-marker.js',200,'window.__deferRan = true;'],
 ['/challenge/vercel',429,'<title>Vercel Security Checkpoint</title>','x-vercel-mitigated','challenge'],
 ['/styles/important-cascade.css',200,'.no-js-flex { display: none !important; }'],
 ['/styles/visibility.css',200,'.ext-hide { display: none; }'],
 ['/styles/visibility2.css',200,'.ext-hide-2 { display: none; }'],
 ['/styles/404.css',404,'/* unused */'],
 ['/sse/simple',200,'retry: 1000\ndata: first\n\n: comment\nid: 42\nevent: custom\ndata: a\ndata: b\n\n'],
 ['/sse/long_retry',200,'retry: 60000\ndata: x\n\n'],['/sse/404',404,'data: x\n\n'],['/sse/badmime',200,'data: x\n\n','content-type','text/plain'],
 ['/download/report.csv',200,'col1,col2\nhello,world\n42,1337\n','content-disposition','attachment; filename="report.csv"'],
 ['/download/missing.csv',404,'not found','content-disposition','attachment; filename="missing.csv"'],
 ['/download_tool/no_content',204,''],['/favicon.ico',404,''],['/totally-unimplemented',404,'Unsupported fixture route'],
 ['/redirect_same_echo_referer',302,'','location','/echo_referer'],['/redirect_cross_echo_referer',302,'','location','http://localhost:9582/echo_referer'],
 ['/redirect_to_echo',302,'','location','/echo_method'],['/images/500.png',500,'boom'],['/images/404.png?unique',404,'not here'],['/images/redirect.png',302,'','location','/images/ok.png'],
 ];
 for(const[path,status,body,key,value]of cases){const r=await request(server.origin,path);assert.equal(r.status,status,path);assert.equal(r.body.toString(),body,path);if(key)assert.equal(r.headers[key],value,path);}
 assert.equal((await request(server.origin,'/303-no-location')).headers.location,undefined);
});
test('raw response byte counts, gzip, cache and case-sensitive conditional headers',async()=>{
 const port=Number(new URL(server.origin).port),r=await raw(port,'/raw/gzip');
 const split=r.indexOf('\r\n\r\n')+4;assert.equal(split,89);assert.equal(r.length,118);assert.equal(gunzipSync(r.subarray(split)).toString(),'a'.repeat(1000));
 const cache=await raw(port,'/raw/cacheable');assert.equal(cache.toString(),'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nCache-Control: max-age=600\r\nContent-Length: 11\r\n\r\nhello world');
 const conditional=await raw(port,'/raw/not-a-name','If-None-Match: "v1"\r\n');assert.equal(conditional.toString(),'HTTP/1.1 304 Not Modified\r\nCache-Control: no-cache\r\nETag: "v1"\r\n\r\n');
 assert.match((await raw(port,'/raw/revalidated','if-none-match: "v1"\r\n')).toString(),/^HTTP\/1.1 200/);
 const embedded=await raw(port,'/raw/cacheable','X-Probe: If-None-Match: anywhere\r\n');assert.match(embedded.toString(),/^HTTP\/1.1 304/);
 const large=await raw(port,'/raw/large');assert.equal(large.subarray(large.indexOf('\r\n\r\n')+4).length,262144);
 const latin=await raw(port,'/latin1_response');assert(latin.includes(Buffer.from('HTTP/1.1 200 Caf\xe9\r\n','latin1')));assert(latin.includes(Buffer.from('X-Caf\xe9: 1','latin1')));
});
test('real raw request body echo, brotli transport and CORS/header methods',async()=>{
 const bytes=Buffer.from([0,255,10,128]);assert.deepEqual((await request(server.origin,'/echo_body',{method:'POST',body:bytes})).body,bytes);
 const br=brotliCompressSync(Buffer.from('real brotli bytes'));const r=await request(server.origin,'/echo_brotli',{method:'POST',body:br});assert.equal(r.headers['content-encoding'],'br');assert.deepEqual(r.body,br);assert.equal(brotliDecompressSync(r.body).toString(),'real brotli bytes');
 const cors=await request(server.origin,'/echo_headers',{method:'OPTIONS',headers:{Origin:'http://localhost:9582','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-hop'}});assert.equal(cors.headers['access-control-allow-origin'],'http://localhost:9582');assert.equal(cors.headers['access-control-allow-methods'],'GET');assert.equal(cors.headers['access-control-allow-headers'],'x-hop');
 assert.match((await request(server.origin,'/echo_headers',{headers:{'X-Hop':'actual123'}})).body.toString(),/X-Hop: actual123\n/);
 assert.equal((await request(server.origin,'/echo-x-hop',{headers:{'X-Hop':'alive'}})).body.toString(),'alive');
 assert.equal((await request(server.origin,'/echo_referer',{headers:{Referer:'http://x.test/a'}})).body.toString(),'<html><body>referer=http://x.test/a</body></html>');
 assert.equal((await request(server.origin,'/echo_method',{method:'POST',body:'abc'})).body.toString(),'<html><body>method=POST</body></html>');
});
test('counters and beacon records survive real requests and reset',async()=>{
 await request(server.origin,'/reset');assert.equal((await request(server.origin,'/serve-count/defer.js')).body.toString(),'window.__serve_count_defer = 1;');assert.equal((await request(server.origin,'/serve-count/defer.js')).body.toString(),'window.__serve_count_defer = 2;');assert.equal((await request(server.origin,'/serve-count/unknown.js')).status,404);
 assert.equal((await request(server.origin,'/beacon/read/id')).body.toString(),'(missing)');
 await request(server.origin,'/beacon/store/id',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:Buffer.from([65,0,66])});assert.deepEqual((await request(server.origin,'/beacon/read/id')).body,Buffer.from('POST|application/octet-stream|3|A\0B'));
 await request(server.origin,'/beacon/store/id',{method:'POST',body:'later'});assert.equal((await request(server.origin,'/beacon/read/id')).body.toString(),'POST|application/octet-stream|3|A\0B');
 assert.equal((await request(server.origin,'/sse/reconnect')).body.toString(),'retry: 10\ndata: one\n\n');assert.equal((await request(server.origin,'/sse/reconnect')).body.toString(),'data: two\n\n');
 await request(server.origin,'/reset');assert.equal((await request(server.origin,'/beacon/read/id')).body.toString(),'(missing)');assert.equal((await request(server.origin,'/serve-count/defer.js')).body.toString(),'window.__serve_count_defer = 1;');assert.equal((await request(server.origin,'/sse/reconnect')).body.toString(),'retry: 10\ndata: one\n\n');
});
test('SSE is progressive and second event requires a distinct flag request',async()=>{
 await new Promise((resolve,reject)=>{http.get(server.origin+'/sse/streaming',res=>{const parts=[];let flagged=false;res.on('data',part=>{parts.push(part.toString());if(!flagged){flagged=true;assert.equal(parts.join(''),'data: first\n\n');request(server.origin,'/sse/flag').catch(reject);}});res.on('end',()=>{try{assert.deepEqual(parts,['data: first\n\n','data: sec','ond\n\n']);resolve();}catch(e){reject(e);}});}).on('error',reject);});
});
test('image bytes, actual dimensions inputs, streaming and encoding boundaries',async()=>{
 const image=await readFile(join(fixtureRoot,'fixtures/images/1000x750.png')),padded=(await request(server.origin,'/images/ok.png?one')).body;assert.equal(padded.length,16385);assert.deepEqual(padded.subarray(0,image.length),image);assert(padded.subarray(image.length).every(x=>x===120));
 assert.deepEqual((await request(server.origin,'/images/small.png?one')).body,await readFile(join(fixtureRoot,'fixtures/images/320x240.png')));
 assert.deepEqual((await request(server.origin,'/images/photo.jpg')).body,await readFile(join(fixtureRoot,'fixtures/images/1000x750.jpg')));
 const stream=await request(server.origin,'/images/chunked.png');assert.equal(stream.headers['content-length'],undefined);assert.equal(stream.headers['transfer-encoding'],'chunked');assert.equal(stream.body.toString(),'<svg xmlns="http://www.w3.org/2000/svg"/>');
 assert((await request(server.origin,'/styles/latin1-header.css')).body.includes(233));assert.equal((await request(server.origin,'/styles/truncated-utf8.css')).body.at(-1),226);assert.deepEqual((await request(server.origin,'/scripts/bom-over-header.js')).body.subarray(0,3),Buffer.from([239,187,191]));
 assert.equal((await request(server.origin,'/scripts/latin1/named.js')).body.toString('latin1'),"window['named'] = 'café';");
 assert((await request(server.origin,'/styles/large.css')).body.length>2*1024*1024);assert((await request(server.origin,'/styles/oversize.css')).body.length>4*1024*1024);
});
test('static root confinement, slash normalization, exact bytes and sidecars',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'red-panda-fixture-'));let owned;
 try{await writeFile(join(temp,'fixture.html'),Buffer.from([65,0,255]));await writeFile(join(temp,'fixture.html.headers'),'X-Custom: actual\nContent-Type: text/plain\n');await symlink('/etc/passwd',join(temp,'escape.html'));
 owned=await startFixtureServer(temp,{port:0,profile:'upstream'});assert.deepEqual(owned.metadata.unsupportedRouteGroups,['WebSocket transport not enabled; pass webSocketPort explicitly']);
 for(const path of ['/src/browser/tests/fixture.html','/src/browser/tests//fixture.html','/src/browser/tests///fixture.html']){const r=await request(owned.origin,path);assert.deepEqual(r.body,Buffer.from([65,0,255]));assert.equal(r.headers['x-custom'],'actual');assert.equal(r.headers['content-type'],'text/plain');assert.equal(r.headers['cache-control'],undefined);}
 for(const method of ['POST','PUT']){const r=await request(owned.origin,'/src/browser/tests/fixture.html',{method,body:'actual submitted request'});assert.equal(r.status,200);assert.deepEqual(r.body,Buffer.from([65,0,255]));assert.equal(r.headers['x-custom'],'actual');}
 assert.equal((await request(owned.origin,'/src/browser/tests/escape.html')).status,403);assert.equal((await request(owned.origin,'/src/browser/tests/%2e%2e%2foutside')).status,403);assert.equal((await request(owned.origin,'/src/browser/tests/a%5cb')).status,404);
 }finally{await owned?.close();await rm(temp,{recursive:true,force:true});}
});
function clientFrame(opcode,bytes){const n=bytes.length,head=n<126?Buffer.from([128|opcode,128|n]):Buffer.from([128|opcode,254,n>>8,n&255]);const mask=Buffer.from([1,2,3,4]),copy=Buffer.from(bytes);for(let i=0;i<n;i++)copy[i]^=mask[i%4];return Buffer.concat([head,mask,copy]);}
async function wireWebSocket(port){const socket=net.connect(port,'127.0.0.1');await once(socket,'connect');let buffer=Buffer.alloc(0),ready=false;const frames=[],waiters=[];socket.on('data',part=>{buffer=Buffer.concat([buffer,part]);if(!ready){const i=buffer.indexOf('\r\n\r\n');if(i<0)return;assert.match(buffer.subarray(0,i).toString(),/Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);buffer=buffer.subarray(i+4);ready=true;}while(buffer.length>=2){let size=buffer[1]&127,off=2;if(size===126){if(buffer.length<4)return;size=buffer.readUInt16BE(2);off=4;}if(size===127){if(buffer.length<10)return;size=Number(buffer.readBigUInt64BE(2));off=10;}if(buffer.length<off+size)return;const f={opcode:buffer[0]&15,bytes:Buffer.from(buffer.subarray(off,off+size))};buffer=buffer.subarray(off+size);if(waiters.length)waiters.shift()(f);else frames.push(f);}});socket.write('GET /somepath HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nCookie: actual=123\r\nOrigin: http://127.0.0.1:9582\r\n\r\n');return {socket,next:()=>frames.length?Promise.resolve(frames.shift()):new Promise(resolve=>waiters.push(resolve)),send:(opcode,bytes)=>socket.write(clientFrame(opcode,Buffer.from(bytes)))};}
test('WebSocket handshake, fragmented TCP/coalesced frames, binary, commands and close',async()=>{
 const c=await wireWebSocket(server.webSocket.port);try{
 const split=clientFrame(1,Buffer.from('hello'));c.socket.write(split.subarray(0,3));c.socket.write(split.subarray(3));assert.equal((await c.next()).bytes.toString(),'echo-hello');
 c.socket.write(Buffer.concat([clientFrame(1,Buffer.from('get-cookie')),clientFrame(1,Buffer.from('get-origin'))]));assert.equal((await c.next()).bytes.toString(),'cookie:actual=123');assert.equal((await c.next()).bytes.toString(),'origin:http://127.0.0.1:9582');
 c.send(2,[0,1,255]);assert.deepEqual((await c.next()).bytes,Buffer.from([238,0,1,255]));
 c.send(1,'send-large:70000');const large=(await c.next()).bytes;assert.equal(large.length,70000);assert(large.every((x,i)=>x===65+i%26));
 c.send(1,'close:1001:actual reason');const close=await c.next();assert.equal(close.opcode,8);assert.equal(close.bytes.readUInt16BE(0),1001);assert.equal(close.bytes.subarray(2).toString(),'actual reason');c.send(8,close.bytes);await once(c.socket,'end');
 }finally{c.socket.destroy();}
});
test('close cancels pending SSE/timers and all owned transports',async()=>{const owned=await startFixtureServer(fixtureRoot,{port:0,profile:'upstream',webSocketPort:0});const req=http.get(owned.origin+'/sse/streaming');req.on('error',()=>{});await once(req,'response');await owned.close();assert(true);});
