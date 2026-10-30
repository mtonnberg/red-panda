import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { parserResetCases } from '../proposals/document-write/native-cases.mjs';
import { Browser } from '../src/browser.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw Error('bounded document-write wait expired');await tick();}}
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t,html,routes={}){
 const requests=[],browser=new Browser({timeout:4000,loadResources:['iframe','stylesheet']}),page=browser.createPage(),errors=[];
 page.on('pageError',error=>errors.push(error.message));
 const server=http.createServer((request,response)=>{requests.push(request.url);if(request.url==='/case.html'){response.setHeader('content-type','text/html');response.end(html);return;}const route=routes[request.url];if(typeof route==='function'){route(request,response);return;}if(!route){response.writeHead(404);response.end();return;}response.setHeader('content-type',route.type??'text/javascript');response.end(route.body);});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 await page.navigate(`${origin}/case.html`);return{page,errors,requests,origin};
}
for(const scenario of parserResetCases)test(`native contract: ${scenario.name}`,async t=>{
 const{page,errors}=await fixture(t,scenario.html,scenario.routes);await until(()=>page.dom.window.probeResult);
 const result=plain(page.dom.window.probeResult);
 const native=JSON.parse(await readFile(new URL('../proposals/document-write/native.json',import.meta.url))).cases.find(entry=>entry.name===scenario.name).observed;
 assert.deepEqual(result,native);assert.deepEqual(errors,[]);
});
test('inactive frame trees retain identity while timers stop and public mutation remains real',async t=>{
 const{page,errors}=await fixture(t,'<body><iframe src="/old.html"></iframe>',{'/old.html':{type:'text/html',body:'<body><p id="keep">keep</p><script>window.ticks=0;setInterval(()=>ticks++,2)</script>'},'/new.html':{type:'text/html',body:'<body>new'}});
 page.evaluate(`window.frame=document.querySelector('iframe');window.oldDoc=frame.contentDocument;window.oldWindow=frame.contentWindow;window.oldBody=oldDoc.body;window.oldNode=oldDoc.getElementById('keep');window.mutations=[];new MutationObserver(records=>mutations.push(...records.map(r=>r.type))).observe(oldBody,{childList:true});frame.src='/new.html';`);
 await until(()=>page.dom.window.frame.contentDocument?.body?.textContent==='new');
 const ticks=page.dom.window.oldWindow.ticks;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(page.dom.window.oldWindow.ticks,ticks);
 assert.deepEqual(plain(page.evaluate(`(()=>{oldDoc.writeln('ignored');oldDoc.open();oldDoc.write('ignored');oldDoc.close();return {body:oldDoc.body===oldBody,node:oldDoc.getElementById('keep')===oldNode,html:oldBody.innerHTML,view:oldDoc.defaultView,connected:oldNode.isConnected,mutations:mutations.slice()};})()`)),{body:true,node:true,html:'<p id="keep">keep</p><script>window.ticks=0;setInterval(()=>ticks++,2)</script>',view:null,connected:true,mutations:[]});
 page.evaluate(`oldBody.replaceChildren(oldDoc.createElement('b'))`);await tick();assert.equal(page.dom.window.oldBody.innerHTML,'<b></b>');assert.deepEqual([...page.dom.window.mutations],['childList']);assert.deepEqual(errors,[]);
});
test('queued fetched stylesheets do not deliver into a discarded frame',async t=>{
 let held,cssSent=false,aborted=false;
 const{page,errors}=await fixture(t,'<body><iframe src="/old.html"></iframe>',{'/old.html':{type:'text/html',body:'<body>old'},'/new.html':{type:'text/html',body:'<body>new'},'/held.js':(request,response)=>{held=response;response.on('close',()=>{aborted=!response.writableEnded;});},'/ready.css':(request,response)=>{response.setHeader('content-type','text/css');response.end('body{color:red}');cssSent=true;}});
 page.evaluate(`window.frame=document.querySelector('iframe');window.oldDoc=frame.contentDocument;window.events=[];const script=oldDoc.createElement('script');script.async=false;script.src='/held.js';script.onload=()=>events.push('script-load');script.onerror=()=>events.push('script-error');oldDoc.body.append(script);const link=oldDoc.createElement('link');link.rel='stylesheet';link.href='/ready.css';link.onload=()=>events.push('style-load');link.onerror=()=>events.push('style-error');oldDoc.head.append(link);`);
 await until(()=>held&&cssSent);await tick();assert.equal(page.dom.window.oldDoc.styleSheets.length,0);
 page.evaluate(`frame.src='/new.html'`);await until(()=>page.dom.window.frame.contentDocument?.body?.textContent==='new');await until(()=>aborted);await tick();await tick();
 assert.equal(page.dom.window.oldDoc.styleSheets.length,0);assert.deepEqual([...page.dom.window.events],[]);assert.deepEqual(errors,[]);
});
test('written scripts run once in the detached fragment and clones preserve already-started state',async t=>{
 const html=`<body><script>window.runs=[];document.write('<div id="written"><script>runs.push({connected:document.currentScript.isConnected,id:document.currentScript.parentNode.id});<\/scr'+'ipt></div>');const clone=document.querySelector('#written script').cloneNode(true);document.body.append(clone);window.probeResult=runs;</script>`;
 const{page,errors}=await fixture(t,html);assert.deepEqual(plain(page.dom.window.probeResult),[{connected:false,id:'written'}]);assert.deepEqual(errors,[]);
});
test('a written script can remove the live writing anchor without a stale-parent splice',async t=>{
 const html=`<body><section id="container"><script>document.write('<script>document.getElementById("container").remove();window.removed=true;<\/scr'+'ipt><p id="late">late</p>');window.afterWrite=true;</script></section>`;
 const{page,errors}=await fixture(t,html);assert.equal(page.dom.window.removed,true);assert.equal(page.dom.window.afterWrite,true);assert.equal(page.dom.window.document.getElementById('late'),null);assert.deepEqual(errors,[]);
});
test('written classic exceptions report through the real realm and later fragment nodes survive',async t=>{
 const html=`<body><script>document.write('<script>throw new Error("written-failure");<\/scr'+'ipt><b id="after-error">after</b>');window.outerContinued=true;</script>`;
 const{page,errors}=await fixture(t,html);assert.equal(page.dom.window.outerContinued,true);assert.equal(page.dom.window.document.getElementById('after-error').textContent,'after');assert.equal(errors.length,1);assert.match(errors[0],/written-failure/);
});
test('ordinary innerHTML remains inert after a written fragment has consumed its parser permit',async t=>{
 const html=`<body><script>window.count=0;document.write('<script>count++;<\/scr'+'ipt><div id="container"></div>');document.getElementById('container').innerHTML='<script>count++;<\/scr'+'ipt><template shadowrootmode="open"><b>inert</b></template>';</script>`;
 const{page,errors}=await fixture(t,html);assert.equal(page.dom.window.count,1);const container=page.dom.window.document.getElementById('container');assert.equal(container.shadowRoot,null);assert.ok(container.querySelector('template'));assert.deepEqual(errors,[]);
});
