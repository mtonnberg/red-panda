import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {setImmediate as turn} from 'node:timers/promises';
import {Browser} from '../src/browser.js';
async function fixture(t,options={}){
 const workers=[];t.after(async()=>{for(const worker of workers)await worker.terminate()});
 async function server(){const worker=new Worker(new URL('./sync-http-server.mjs',import.meta.url));workers.push(worker);const [info]=await once(worker,'message');return `http://127.0.0.1:${info.port}`}
 const base=await server(),cross=await server(),browser=new Browser({timeout:1500,...options});t.after(()=>browser.close());const page=browser.createPage();await page.navigate(base);return{base,cross,browser,page,window:page.dom.window};
}
test('Window synchronous XHR performs actual thread HTTP, trusted direct 1→4 events and cookies',async t=>{
 const {page,window,base}=await fixture(t),events=[],network=[];for(const type of ['request','response','requestFailed'])page.on(type,value=>network.push([type,value]));
 const xhr=new window.XMLHttpRequest();for(const type of ['readystatechange','loadstart','progress','load','loadend','error'])xhr.addEventListener(type,event=>events.push([type,xhr.readyState,event.isTrusted]));
 xhr.open('GET',base+'/echo',false);xhr.send();assert.equal(xhr.status,200);assert.equal(JSON.parse(xhr.responseText).method,'GET');
 assert.deepEqual(events,[['readystatechange',1,true],['readystatechange',4,true],['load',4,true],['loadend',4,true]]);
 assert.match(window.document.cookie,/syncCookie=received/);assert.equal(page.activeRequests.size,0);assert.deepEqual(network.map(e=>e[0]),['request','response']);assert.equal(network[0][1].id,network[1][1].id);
});
test('Window sync bodies retain binary slices, Blob, FormData, params and native Document string conversion',async t=>{
 const {window,base}=await fixture(t);function echo(body){const xhr=new window.XMLHttpRequest();xhr.open('POST',base+'/echo',false);xhr.send(body);return JSON.parse(xhr.responseText)}
 const view=new window.Uint8Array([4,0,255,6]).subarray(1,3);Object.defineProperties(view,{buffer:{get(){throw Error('authored buffer')}},byteOffset:{get(){throw Error('authored offset')}}});assert.equal(echo(view).base64,'AP8=');
 assert.equal(echo(new window.Blob(['é'],{type:'text/custom'})).base64,'w6k=');
 assert.equal(echo(new window.URLSearchParams('x=é')).body,'x=%C3%A9');
 const form=new window.FormData();form.append('field','value');form.append('file',new window.File([new Uint8Array([0,255])],'bytes.bin',{type:'application/octet-stream'}));const actual=echo(form);assert.match(actual.headers['content-type'],/^multipart\/form-data; boundary=/);assert.match(actual.body,/name="field"\r\n\r\nvalue/);assert.match(actual.body,/filename="bytes.bin"/);assert.ok(Buffer.from(actual.base64,'base64').includes(Buffer.from([0,255])));
 const doc=new window.DOMParser().parseFromString('<root/>','application/xml');assert.equal(echo(doc).body,'[object XMLDocument]');
});
test('Window sync redirects preserve original responseURL, real POST changes and per-hop cookie/header policy',async t=>{
 const {page,window,base}=await fixture(t);page.setExtraHTTPHeaders({'x-cdp':'present'});const xhr=new window.XMLHttpRequest();const url=base+'/redirect?status=302&to='+encodeURIComponent(base+'/echo');xhr.open('POST',url,false);xhr.send('original');const result=JSON.parse(xhr.responseText);assert.equal(result.method,'GET');assert.equal(result.body,'');assert.equal(result.headers['x-cdp'],'present');assert.equal(xhr.responseURL,url);assert.equal(page.activeRequests.size,0);
});
test('Window sync preflight and exposed response headers use real CORS requests',async t=>{
 const {window,cross}=await fixture(t);const xhr=new window.XMLHttpRequest();xhr.open('PUT',cross+'/cors',false);xhr.setRequestHeader('x-custom','real');xhr.withCredentials=true;xhr.send('body');assert.equal(xhr.status,200);assert.equal(xhr.getResponseHeader('x-visible'),'yes');assert.equal(xhr.getResponseHeader('x-hidden'),'secret');assert.equal(xhr.getResponseHeader('set-cookie'),null);const requests=await(await fetch(cross+'/log')).json();assert.deepEqual(requests.slice(0,2).map(r=>r.method),['OPTIONS','PUT']);
 const denied=new window.XMLHttpRequest();denied.open('GET',cross+'/cors?deny',false);assert.throws(()=>denied.send(),{name:'NetworkError'});assert.equal(denied.readyState,4);assert.equal(denied.status,0);
});
test('Window sync properties reject forbidden modes and network failures have no invented events',async t=>{
 const {window,base}=await fixture(t);const xhr=new window.XMLHttpRequest();xhr.responseType='json';xhr.open('GET',base+'/echo',false);assert.throws(()=>xhr.send(),{name:'InvalidAccessError'});assert.equal(xhr.readyState,1);assert.throws(()=>{xhr.responseType=''}, {name:'InvalidAccessError'});assert.throws(()=>{xhr.timeout=0},{name:'InvalidAccessError'});
 const broken=new window.XMLHttpRequest(),events=[];for(const type of ['error','load','loadend','readystatechange'])broken.addEventListener(type,()=>events.push(type));broken.open('GET',base+'/close',false);assert.throws(()=>broken.send(),{name:'NetworkError'});assert.equal(broken.readyState,4);assert.deepEqual(events,['readystatechange']);
 const latin=new window.XMLHttpRequest();latin.open('GET',base+'/latin',false);latin.overrideMimeType('text/plain;charset=windows-1252');latin.send();assert.equal(latin.responseText,'\ufeffcaf�');
});
test('Window sync VM interruption during a response listener cannot retain request ownership',async t=>{
 const {page,base,browser}=await fixture(t);page.evaluate(`const warm=new XMLHttpRequest();warm.open('GET',${JSON.stringify(base+'/echo')},false);warm.send()`);let target;page.on('response',event=>{if(event.type==='XHR'){target=event.id;while(true){}}});
 assert.throws(()=>vm.runInContext(`const x=new XMLHttpRequest();x.open('GET',${JSON.stringify(base+'/echo')},false);x.send()`,page.dom.getInternalVMContext(),{timeout:200}),/timed out/);await turn();assert.ok(target);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);
});
test('Window sync VM interruption in request emission or failure emission cleans only its owned IDs',async t=>{
 for(const stage of ['request','requestFailed']){
  const {page,base,browser}=await fixture(t);page.evaluate(`const warm=new XMLHttpRequest();warm.open('GET',${JSON.stringify(base+'/echo')},false);warm.send()`);page.activeRequests.add('unrelated-async');page.on(stage,event=>{if(stage==='requestFailed'||event.type==='XHR')while(true){}});
  assert.throws(()=>vm.runInContext(`const x=new XMLHttpRequest();x.open('GET',${JSON.stringify(base+(stage==='request'?'/echo':'/close'))},false);x.send()`,page.dom.getInternalVMContext(),{timeout:200}),/timed out/);await turn();assert.deepEqual([...page.activeRequests],['unrelated-async']);assert.equal(browser.syncHTTP.operations.size,0);
 }
});
test('Window sync interrupted blocking wait cancels the transport and a child frame shares its browser backend',async t=>{
 const {page,window,base,browser}=await fixture(t);assert.throws(()=>vm.runInContext(`const x=new XMLHttpRequest();x.open('GET',${JSON.stringify(base+'/slow')},false);x.send()`,page.dom.getInternalVMContext(),{timeout:80}),/timed out/);await turn();assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);
 page.timeout=1500;const frame=window.document.createElement('iframe');window.document.body.append(frame);await turn();const child=frame.contentWindow,xhr=new child.XMLHttpRequest();xhr.open('POST',base+'/echo',false);xhr.send('frame');assert.equal(xhr.status,200);assert.equal(JSON.parse(xhr.responseText).headers.origin,base);assert.equal(JSON.parse(xhr.responseText).headers.referer,base+'/');frame.remove();
 const again=new window.XMLHttpRequest();again.open('GET',base+'/echo',false);again.send();assert.equal(again.status,200);
});
test('Window sync interruption in actual cookie processing preserves cleanup until policy completes',async t=>{
 const {page,base,browser}=await fixture(t);page.evaluate(`const warm=new XMLHttpRequest();warm.open('GET',${JSON.stringify(base+'/echo')},false);warm.send()`);
 const jar=page.context.cookies,original=jar.setCookieSync;let entered=false;
 jar.setCookieSync=function(...args){const result=original.apply(this,args);entered=true;while(true){};return result};
 t.after(()=>{jar.setCookieSync=original});page.activeRequests.add('unrelated');
 assert.throws(()=>vm.runInContext(`const x=new XMLHttpRequest();x.open('GET',${JSON.stringify(base+'/echo')},false);x.send()`,page.dom.getInternalVMContext(),{timeout:200}),/timed out/);
 await turn();assert.equal(entered,true);assert.deepEqual([...page.activeRequests],['unrelated']);assert.equal(browser.syncHTTP.operations.size,0);assert.match(jar.getCookieStringSync(base),/syncCookie=received/);
});
test('Window sync private Blob provenance rejects copied implementation symbols without reading an authored symbol getter',async t=>{
 const {page,window,base}=await fixture(t),blob=new window.Blob(['private bytes']),fake=Object.create(window.Blob.prototype);let reads=0;
 for(const key of Reflect.ownKeys(blob))Object.defineProperty(fake,key,{get(){reads++;throw Error('forged symbol')}});
 const xhr=new window.XMLHttpRequest();xhr.open('POST',base+'/echo',false);xhr.send(fake);assert.equal(reads,0);assert.equal(JSON.parse(xhr.responseText).body,'[object Blob]');assert.equal(page.activeRequests.size,0);
});
test('Window sync callback document retirement prevents dispatch after cancellation and leaves another page usable',async t=>{
 const {page,base,browser}=await fixture(t),other=browser.createPage();await other.navigate(base);
 let started=0;page.on('request',event=>{if(event.type==='XHR'){started++;page.close()}});
 assert.throws(()=>page.evaluate(`const x=new XMLHttpRequest();x.open('GET',${JSON.stringify(base+'/echo')},false);x.send()`),/network error/i);
 assert.equal(started,1);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);
 const x=new other.dom.window.XMLHttpRequest();x.open('GET',base+'/echo',false);x.send();assert.equal(x.status,200);
});
test('Window sync native Symbol body descriptions and conversion failures occur before sending',async t=>{
 const {page,window,base,browser}=await fixture(t);
 for(const [body,expected]of [[Symbol('body'),'body'],[Symbol(),'undefined']]){const xhr=new window.XMLHttpRequest();xhr.open('POST',base+'/echo',false);xhr.send(body);assert.equal(JSON.parse(xhr.responseText).body,expected)}
 const xhr=new window.XMLHttpRequest();xhr.open('POST',base+'/echo',false);assert.throws(()=>xhr.send({toString(){throw new TypeError('body conversion')}}),{name:'TypeError',message:'body conversion'});assert.equal(xhr.readyState,1);assert.equal(page.activeRequests.size,0);assert.equal(browser.syncHTTP.operations.size,0);
});
