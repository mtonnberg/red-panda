import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from '../src/browser.js';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';
import {openHTTPCache,setHTTPCacheDisabled} from '../src/http-cache.js';

async function fixture(t,{configured=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'red-panda-http-cache-test-')),requests=[];
 const server=http.createServer((request,response)=>{
  const ordinal=requests.length+1;requests.push({url:request.url,headers:request.headers,ordinal});
  response.setHeader('cache-control','public, max-age=600');response.setHeader('x-receipt',String(ordinal));
  if(request.url==='/document'){response.setHeader('content-type','text/html');response.end('<!doctype html><body>actual page');return}
  if(request.url==='/no-store')response.setHeader('cache-control','no-store');
  if(request.url==='/vary')response.setHeader('vary','X-Variant');
  if(request.url.startsWith('/renew-')){
   response.setHeader('etag','"actual-renewed-v1"');
   if(request.headers['if-none-match']==='"actual-renewed-v1"'){
    response.statusCode=304;const mode=request.url.slice(7);response.setHeader('cache-control',mode==='cookie'?'public, max-age=600':mode==='private'?'private, max-age=600':'no-store');
    if(mode==='cookie')response.setHeader('set-cookie','actualFuture=received; HttpOnly; SameSite=Lax; Path=/');
    response.end();return;
   }
   response.setHeader('cache-control','no-cache');
  }
  if(['/validator','/validator-cookie'].includes(request.url)){
   response.setHeader('etag','"actual-v1"');
   if(request.headers['if-none-match']==='"actual-v1"'){response.statusCode=304;response.setHeader('x-renewed',String(ordinal));if(request.url==='/validator-cookie')response.setHeader('set-cookie','actual304=received; HttpOnly; SameSite=Lax; Path=/');response.end();return}
   response.setHeader('cache-control','no-cache');
  }
  if(['/range','/range-cold'].includes(request.url)){
   const full=Buffer.from([0,65,128,255,66,67,13,10,68,69]);response.setHeader('accept-ranges','bytes');
   if(request.headers.range==='bytes=0-1'){response.statusCode=206;response.setHeader('content-range','bytes 0-1/10');response.end(full.subarray(0,2));return}
   response.end(full);return;
  }
  response.end(Buffer.concat([Buffer.from(`${request.url}:${request.headers['x-variant']??''}:${ordinal}:`),Buffer.from([0,255,128,13,10])]));
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const browser=new Browser({timeout:3000,...(configured?{httpCacheDir:directory}:{})});
 t.after(async()=>{browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})});
 const origin=`http://127.0.0.1:${server.address().port}`,page=browser.createPage();await page.navigate(origin+'/document');
 return {browser,page,requests,directory,origin};
}
async function bytes(response){return [...new Uint8Array(await response.arrayBuffer())]}

test('HTTP cache is absent by default and real repeated requests stay distinct',{timeout:15000},async t=>{
 const {browser,page,requests,directory}=await fixture(t,{configured:false});
 assert.equal(browser.httpCache,null);const a=await bytes(await page.fetch('/bytes')),b=await bytes(await page.fetch('/bytes'));
 assert.notDeepEqual(a,b);assert.equal(requests.length,3);assert.deepEqual(await readdir(directory),[]);
});
test('HTTP cache retains actual binary bytes and publishes real hit provenance',{timeout:15000},async t=>{
 const {page,requests,directory}=await fixture(t),events=[];
 page.on('requestServedFromCache',event=>events.push(['cache',event.id]));page.on('response',event=>events.push(['response',event.id,event.fromDiskCache??false]));
 const first=await page.fetch('/bytes'),body=await bytes(first),second=await page.fetch('/bytes');
 assert.deepEqual(await bytes(second),body);assert.equal(second.headers.get('x-receipt'),first.headers.get('x-receipt'));assert.equal(requests.length,2);
 assert.deepEqual(events.map(event=>[event[0],event[2]]),[['response',false],['cache',undefined],['response',true]]);assert.equal(events[1][1],events[2][1]);
 assert.ok((await readdir(directory)).includes('red-panda-http-cache.sqlite'));
});
test('HTTP cache never stores no-store and bypasses top-level navigation',{timeout:15000},async t=>{
 const {page,requests,origin}=await fixture(t);await page.fetch('/no-store');await page.fetch('/no-store');await page.navigate(origin+'/document');await page.navigate(origin+'/document');
 assert.equal(requests.filter(row=>row.url==='/no-store').length,2);assert.equal(requests.filter(row=>row.url==='/document').length,3);
});
test('HTTP cache disable bypasses both reading and replacement of retained bytes',{timeout:15000},async t=>{
 const {browser,page,requests}=await fixture(t),first=await bytes(await page.fetch('/bytes'));
 setHTTPCacheDisabled(page.context,true);const bypass=await bytes(await page.fetch('/bytes'));assert.notDeepEqual(bypass,first);
 setHTTPCacheDisabled(page.context,false);assert.deepEqual(await bytes(await page.fetch('/bytes')),first);assert.equal(requests.length,3);
 browser.httpCache.clear();assert.notDeepEqual(await bytes(await page.fetch('/bytes')),first);assert.equal(requests.length,4);
});
test('HTTP cache uses one actual Vary variant per URL',{timeout:15000},async t=>{
 const {page,requests}=await fixture(t),fetchVariant=async value=>bytes(await page.fetch('/vary',{headers:{'x-variant':value}}));
 const a=await fetchVariant('A');assert.deepEqual(await fetchVariant('A'),a);const b=await fetchVariant('B');assert.notDeepEqual(b,a);assert.deepEqual(await fetchVariant('B'),b);assert.notDeepEqual(await fetchVariant('A'),a);
 assert.deepEqual(requests.filter(row=>row.url==='/vary').map(row=>row.headers['x-variant']),['A','B','A']);
});
test('HTTP cache genuinely revalidates 304 and renews only the future header snapshot',{timeout:15000},async t=>{
 const {page,requests}=await fixture(t),first=await page.fetch('/validator'),old=[...first.headers],body=await bytes(first),second=await page.fetch('/validator');
 assert.equal(second.status,200);assert.equal(second.statusText,'Not Modified');assert.deepEqual([...second.headers],old);assert.deepEqual(await bytes(second),body);
 const third=await page.fetch('/validator');assert.equal(third.statusText,'OK');assert.deepEqual(await bytes(third),body);assert.notEqual(third.headers.get('x-receipt'),first.headers.get('x-receipt'));assert.ok(third.headers.has('x-renewed'));
 assert.deepEqual(requests.filter(row=>row.url==='/validator').map(row=>row.headers['if-none-match']??null),[null,'"actual-v1"']);
});
test('HTTP cache is browser-owned across context disposal and independent browser reopen',{timeout:15000},async t=>{
 const {browser,page,requests,directory,origin}=await fixture(t),first=await bytes(await page.fetch('/bytes'));
 const id=browser.createContext(),child=browser.createPage(id);await child.navigate(origin+'/document');assert.deepEqual(await bytes(await child.fetch('/bytes')),first);browser.disposeContext(id);
 browser.close();const reopened=new Browser({timeout:3000,httpCacheDir:directory});t.after(()=>reopened.close());const next=reopened.createPage();await next.navigate(origin+'/document');assert.deepEqual(await bytes(await next.fetch('/bytes')),first);assert.equal(requests.filter(row=>row.url==='/bytes').length,1);
});
test('HTTP cache validates options and rejects storage authority after real clear or close',{timeout:15000},async t=>{
 assert.throws(()=>openHTTPCache({httpCacheEntryLimit:-1}),TypeError);assert.throws(()=>openHTTPCache({httpCacheDir:''}),TypeError);
 const directory=await mkdtemp(join(tmpdir(),'red-panda-cache-policy-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const cache=openHTTPCache({httpCacheDir:directory}),context={},headers=new Headers(),response=new Response('actual',{headers:{'cache-control':'public, max-age=600'}});
 const beforeClear=cache.begin(context,'https://example.test/item','GET',headers);cache.clear();cache.store(beforeClear,response,Buffer.from('abandoned'));assert.equal(cache.begin(context,'https://example.test/item','GET',headers).entry,null);
 const beforeClose=cache.begin(context,'https://example.test/item','GET',headers);cache.close();cache.store(beforeClose,response,Buffer.from('abandoned'));assert.equal(cache.cachedResponse(beforeClose),null);cache.close();
});
test('CDP cache controls act on transport and preserve the ignore-toggle gate',{timeout:15000},async t=>{
 const {directory,origin,requests}=await fixture(t),service=await serve({httpCacheDir:directory,timeout:3000,port:0}),client=await connect(`ws://127.0.0.1:${service.port}/`,{timeout:2500});
 try{
 const page=service.browser.createPage();await page.navigate(origin+'/document');
 const {sessionId}=await client.send('Target.attachToTarget',{targetId:page.id,flatten:true});await client.send('Network.enable',{},sessionId);
 assert.deepEqual(await client.send('Network.canClearBrowserCache',{},sessionId),{result:true});
 const get=()=>client.send('Runtime.evaluate',{expression:`fetch(${JSON.stringify(origin+'/bytes')}).then(r=>r.arrayBuffer()).then(b=>Array.from(new Uint8Array(b)))`,awaitPromise:true,returnByValue:true},sessionId);
 const first=await get();await get();await client.send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);const bypass=await get();assert.notDeepEqual(first.result.value,bypass.result.value);
 await client.send('Network.setCacheDisabled',{cacheDisabled:false},sessionId);await client.send('LP.configureCDP',{disableSetCacheDisabled:true},sessionId);await client.send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);assert.deepEqual((await get()).result.value,first.result.value);
 assert.equal(requests.filter(row=>row.url==='/bytes').length,2);const hits=client.events.filter(row=>row.method==='Network.requestServedFromCache');assert.equal(hits.length,2);const cachedResponses=client.events.filter(row=>row.method==='Network.responseReceived'&&row.params.response.fromDiskCache);assert.deepEqual(cachedResponses.map(row=>row.params.response.statusText),['','']);
 await client.send('Network.clearBrowserCache',{},sessionId);await get();assert.equal(requests.filter(row=>row.url==='/bytes').length,3); }finally{await client.close();await service.close()}
});
test('real 304 cookies reach the jar and HTTP while the consumer keeps old headers',{timeout:15000},async t=>{
 const {browser,page,origin,requests}=await fixture(t),first=await page.fetch('/validator-cookie'),body=await bytes(first),second=await page.fetch('/validator-cookie');
 assert.equal(second.statusText,'Not Modified');assert.deepEqual(await bytes(second),body);assert.equal(second.headers.has('set-cookie'),false);
 const cookies=await browser.contexts.get('default').cookies.getCookies(origin+'/');const cookie=cookies.find(value=>value.key==='actual304');assert.ok(cookie);assert.equal(cookie.value,'received');assert.equal(cookie.httpOnly,true);
 await page.fetch('/echo-cookie');assert.match(requests.at(-1).headers.cookie,/actual304=received/);assert.equal(requests.filter(row=>row.url==='/validator-cookie').length,2);
});
test('measured Range requests reuse a real full cache entry while cold Range reaches HTTP',{timeout:15000},async t=>{
 const {page,requests}=await fixture(t),range={headers:{Range:'bytes=0-1'}},cold=await page.fetch('/range-cold',range);
 assert.equal(cold.status,206);assert.deepEqual(await bytes(cold),[0,65]);const first=await page.fetch('/range'),full=await bytes(first);
 for(let i=0;i<2;i++){const response=await page.fetch('/range',range);assert.equal(response.status,200);assert.deepEqual(await bytes(response),full);assert.equal(response.headers.get('x-receipt'),first.headers.get('x-receipt'))}
 assert.equal(requests.filter(row=>row.url==='/range').length,1);assert.equal(requests.filter(row=>row.url==='/range-cold').length,1);
});
test('measured Vary value matching reuses upper-case bytes for lower-case values',{timeout:15000},async t=>{
 const {page,requests}=await fixture(t),get=async value=>bytes(await page.fetch('/vary',{headers:{'X-Variant':value}}));
 const first=await get('A');for(const value of ['a','a','A'])assert.deepEqual(await get(value),first);assert.equal(requests.filter(row=>row.url==='/vary').length,1);
});
test('real 304 renewal applies its own metadata policy while preserving current consumer headers',{timeout:15000},async t=>{
 const {page,requests,browser,origin}=await fixture(t);
 for(const mode of ['cookie','private','no-store']){
  const path='/renew-'+mode,first=await page.fetch(path),body=await bytes(first),oldReceipt=first.headers.get('x-receipt');
  const second=await page.fetch(path);assert.equal(second.statusText,'Not Modified');assert.deepEqual(await bytes(second),body);assert.equal(second.headers.get('cache-control'),'no-cache');assert.equal(second.headers.get('x-receipt'),oldReceipt);
  const third=await page.fetch(path);assert.deepEqual(await bytes(third),body);assert.notEqual(third.headers.get('x-receipt'),oldReceipt);
  assert.equal(third.headers.get('cache-control'),mode==='cookie'?'public, max-age=600':mode==='private'?'private, max-age=600':'no-store');
  const fourth=await page.fetch(path);assert.deepEqual(await bytes(fourth),body);
  assert.equal(third.statusText,mode==='no-store'?'Not Modified':'OK');assert.equal(fourth.statusText,third.statusText);
  assert.equal(requests.filter(row=>row.url===path).length,mode==='no-store'?4:2);
  if(mode==='cookie'){
   assert.match(third.headers.get('set-cookie'),/actualFuture=received/);
   const exposed=await page.evaluate(`fetch(${JSON.stringify(origin+path)}).then(r=>({cookie:r.headers.get('set-cookie'),status:r.status}))`);assert.deepEqual(JSON.parse(JSON.stringify(exposed)),{cookie:null,status:200});
   const cookies=await browser.contexts.get('default').cookies.getCookies(origin+'/');assert.equal(cookies.find(value=>value.key==='actualFuture')?.value,'received');
  }
 }
});
