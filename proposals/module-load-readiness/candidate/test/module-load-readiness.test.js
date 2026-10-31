import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Browser,until} from '../src/browser.js';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';

const pending='<!doctype html><script type="module">globalThis.started=true;await new Promise(resolve=>globalThis.release=resolve);globalThis.finished=true;</script>';
async function fixture(t){
 const requests=[],server=http.createServer((request,response)=>{requests.push(request.url);response.writeHead(200,{'Content-Type':'text/html'});response.end(request.url==='/parent'?'<!doctype html><iframe src="/pending"></iframe>':pending)});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))});
 return {origin:'http://127.0.0.1:'+server.address().port,requests};
}

test('real document load and Browser navigation complete while moduleReady retains suspended evaluation',async t=>{
 const {origin}=await fixture(t),browser=new Browser({timeout:1500}),page=browser.createPage();t.after(()=>browser.close());const loads=[];page.on('load',()=>loads.push(page.url));
 await page.navigate(origin+'/pending');
 assert.equal(page.evaluate('document.readyState'),'complete');assert.equal(page.evaluate('started'),true);assert.equal(page.evaluate('globalThis.finished'),undefined);assert.deepEqual(loads,[origin+'/pending']);
 let drained=false;page.moduleReady.then(()=>{drained=true});await new Promise(resolve=>setImmediate(resolve));assert.equal(drained,false);
 page.evaluate('release()');await page.moduleReady;assert.equal(page.evaluate('finished'),true);assert.equal(drained,true);assert.equal(loads.length,1);
});

test('a child frame navigation observes document load without draining its suspended module',async t=>{
 const {origin}=await fixture(t),browser=new Browser({loadResources:['iframe'],timeout:1500}),page=browser.createPage();t.after(()=>browser.close());await page.navigate(origin+'/parent');
 const frame=page.frames.findElement(page.dom.window.document.querySelector('iframe'));
 assert.equal(frame.evaluate('document.readyState'),'complete');assert.equal(frame.evaluate('started'),true);assert.equal(frame.evaluate('globalThis.finished'),undefined);
 await frame.navigate(origin+'/next');const current=page.frames.findElement(page.dom.window.document.querySelector('iframe'));
 assert.equal(current.evaluate('document.readyState'),'complete');assert.equal(current.evaluate('globalThis.finished'),undefined);current.evaluate('release()');await current.moduleReady;assert.equal(current.evaluate('finished'),true);
});

test('CDP emits root and child load lifecycle events before their real module evaluation settles',async t=>{
 const {origin}=await fixture(t),service=await serve({port:0,loadResources:['iframe']});t.after(()=>service.close());const client=await connect('ws://127.0.0.1:'+service.port+'/');t.after(()=>client.close());const {targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true}),send=(method,params={})=>client.send(method,params,sessionId);
 await send('Page.enable');await send('Runtime.enable');await send('Page.setLifecycleEventsEnabled',{enabled:true});const offset=client.events.length;
 await send('Page.navigate',{url:origin+'/parent'});
 await until(()=>client.events.slice(offset).filter(e=>e.method==='Page.lifecycleEvent'&&e.params.name==='load').length===2,{timeout:1500});
 const state=await send('Runtime.evaluate',{expression:'JSON.stringify({root:document.readyState,child:document.querySelector("iframe").contentDocument.readyState,started:frames[0].started,finished:frames[0].finished===true})',returnByValue:true});assert.deepEqual(JSON.parse(state.result.value),{root:'complete',child:'complete',started:true,finished:false});
 const evaluate=await send('Runtime.evaluate',{expression:'frames[0].release();true',returnByValue:true});assert.equal(evaluate.result.value,true);
});
