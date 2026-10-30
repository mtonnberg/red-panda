import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { installFetch } from '../src/fetch.js';

function fixture(t, origin='http://127.0.0.1/') {
 const page=Object.assign(new EventEmitter(),{closed:false,documentGeneration:0,documentAbort:new AbortController(),fetch:(url,options)=>globalThis.fetch(url,options)});
 const{window}=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:origin});installFetch(page,window);t.after(()=>{page.documentAbort.abort();window.close()});return window;
}
const body=(w,chunks)=>new w.ReadableStream({start(c){for(const chunk of chunks)c.enqueue(chunk);c.close()}});
const request=(w,stream)=>new w.Request('http://127.0.0.1/',{method:'POST',body:stream});

test('Request preserves genuine stream identity, ignores duplex getters and does not synthesize content-type',t=>{
 const w=fixture(t);for(const s of[new w.ReadableStream(),body(w,[new w.Uint8Array([65])])]){const r=new w.Request('http://127.0.0.1/',{method:'POST',body:s,get duplex(){throw new Error('must not read')}});assert.equal(r.body,s);assert.equal(r.bodyUsed,false);assert.equal(s.locked,false);assert.equal(r.headers.get('content-type'),null)}
 for(const method of['GET','HEAD'])assert.throws(()=>new w.Request('http://127.0.0.1/',{method,body:body(w,[])}),w.TypeError);
});

test('closed source extraction consumes actual UTF8/binary queue bytes and immediately locks and marks used',async t=>{
 const w=fixture(t),s=body(w,[new w.TextEncoder().encode('hé 🐼'),new w.Uint8Array([0,255])]),r=request(w,s),p=r.bytes();assert.equal(r.body,s);assert.equal(r.bodyUsed,true);assert.equal(s.locked,true);const bytes=await p;assert.ok(bytes instanceof w.Uint8Array);assert.deepEqual([...bytes],[104,195,169,32,240,159,144,188,0,255]);await assert.rejects(r.text(),e=>e instanceof w.TypeError&&e.message==='Body has already been read');
});

test('open source first consumption rejects unchanged, then actual late enqueue and close enables consumption',async t=>{
 const w=fixture(t);let controller;const s=new w.ReadableStream({start(c){controller=c}}),r=request(w,s);await assert.rejects(r.text(),e=>e instanceof w.TypeError&&e.message==='Failed to read ReadableStream body');assert.equal(r.bodyUsed,false);assert.equal(s.locked,false);controller.enqueue(new w.TextEncoder().encode('late'));controller.close();assert.equal(await r.text(),'late');assert.equal(r.bodyUsed,true);
});

test('native string and BufferSource chunks use real view offsets and invalid values stay in the real queue',async t=>{
 const w=fixture(t),buffer=new w.Uint8Array([0,65,66,0]).buffer;
 for(const [chunk,expected]of[['abc',[97,98,99]],[buffer,[0,65,66,0]],[new w.Int8Array([-1,2]),[255,2]],[new w.DataView(buffer,1,2),[65,66]]])assert.deepEqual([...await request(w,body(w,[chunk])).bytes()],expected);
 const invalid=[65,66],s=body(w,[invalid]),r=request(w,s);await assert.rejects(r.text(),w.TypeError);assert.equal(s.locked,false);assert.equal(r.bodyUsed,false);const reader=s.getReader();assert.equal((await reader.read()).value,invalid);reader.releaseLock();assert.equal(await r.text(),'');
});

test('clone really empties source unlocked and caches independent byte snapshots for original and copy',async t=>{
 const w=fixture(t),chunk=new w.Uint8Array([65,66,67]),s=body(w,[chunk]),r=request(w,s),copy=r.clone();assert.equal(r.body,s);assert.notEqual(copy.body,s);assert.equal(s.locked,false);assert.equal(r.bodyUsed,false);assert.equal(copy.bodyUsed,false);chunk.fill(90);assert.equal(await copy.text(),'ABC');assert.equal(await r.text(),'ABC');assert.equal(s.locked,true);
 const second=body(w,['real']),original=request(w,second),cloned=original.clone(),reader=second.getReader();assert.equal((await reader.read()).done,true);reader.releaseLock();await assert.rejects(original.text(),e=>e.message==='Body is disturbed or locked');assert.equal(await cloned.text(),'real');
});

test('external source reads and carried Request values retain separate real used state',async t=>{
 const w=fixture(t),s=body(w,['first','remaining']),r=request(w,s),reader=s.getReader();assert.equal((await reader.read()).value,'first');reader.releaseLock();assert.equal(r.bodyUsed,false);assert.equal(await r.text(),'remaining');
 const source=body(w,['carried']),original=request(w,source),carried=new w.Request(original);assert.equal(carried.body,source);assert.equal(await carried.text(),'carried');assert.equal(original.bodyUsed,false);await assert.rejects(original.text(),e=>e.message==='Body is disturbed or locked');
});

test('source failures and invalid closed controller operations cannot fabricate bytes or usable state',async t=>{
 const w=fixture(t),sentinel=new w.Error('source');let c;const source=new w.ReadableStream({start(x){c=x;x.enqueue('discarded');x.error(sentinel)}}),r=request(w,source);await assert.rejects(r.text(),e=>e instanceof w.TypeError&&e.message==='Failed to read ReadableStream body');assert.equal(r.bodyUsed,false);assert.equal(source.locked,false);await assert.rejects(source.getReader().read(),e=>e===sentinel);
 let closed;const actual=new w.ReadableStream({start(x){closed=x;x.enqueue('kept');x.close()}});assert.throws(()=>closed.enqueue('not queued'),w.TypeError);assert.throws(()=>closed.close(),w.TypeError);assert.equal(await request(w,actual).text(),'kept');
});

test('async source completion updates actual closed state while rejection preserves actual source error',async t=>{
 const w=fixture(t);let resolve;const wait=new w.Promise(r=>{resolve=r});const s=new w.ReadableStream({async start(c){await wait;c.enqueue('async');c.close()}}),r=request(w,s);await assert.rejects(r.text(),w.TypeError);resolve();await wait;await w.Promise.resolve();assert.equal(await r.text(),'async');
 const failure=new w.Error('async failure'),errored=new w.ReadableStream({async start(c){c.enqueue('not available');await w.Promise.resolve();throw failure}});await w.Promise.resolve();await w.Promise.resolve();const failed=request(w,errored);await assert.rejects(failed.text(),w.TypeError);assert.equal(failed.bodyUsed,false);
});

test('real loopback upload receives exact source bytes, no default content-type, and no request for open/error bodies',async t=>{
 const rows=[],server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const row={bytes:[...Buffer.concat(chunks)],contentType:req.headers['content-type']??null};rows.push(row);res.setHeader('content-type','application/json');res.end(JSON.stringify(row))});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});const origin=`http://127.0.0.1:${server.address().port}/`,w=fixture(t,origin),s=body(w,[new w.Uint8Array([0,255,65])]),original=new w.Request(origin,{method:'POST',body:s});const response=await w.fetch(original);assert.equal(response.status,200);assert.deepEqual(JSON.parse(await response.text()),{bytes:[0,255,65],contentType:null});assert.equal(original.body,s);assert.equal(original.bodyUsed,false);assert.equal(s.locked,false);const reader=s.getReader();assert.equal((await reader.read()).done,true);reader.releaseLock();await assert.rejects(original.text(),e=>e.message==='Failed to read ReadableStream body');
 for(const stream of[new w.ReadableStream(),new w.ReadableStream({start(c){c.error(new w.Error('upload error'))}})])await assert.rejects(w.fetch(origin,{method:'POST',body:stream}),w.TypeError);assert.equal(rows.length,1);
});


test('releasing a real pending read cannot lose later actual queued bytes in the private mirror',async t=>{
 const w=fixture(t);let controller;const s=new w.ReadableStream({start(c){controller=c}}),reader=s.getReader(),pending=reader.read();reader.releaseLock();await assert.rejects(pending,w.TypeError);controller.enqueue('after-release');controller.close();assert.equal(await request(w,s).text(),'after-release');
});
