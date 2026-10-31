import {test,before,after} from 'node:test';
import http from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';

async function fixture(t){
 const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,'+encodeURIComponent('<!doctype html><html><head><title>Actual old document</title><script>globalThis.actualMarker="kept";globalThis.actualRuns=[];</script></head><body><p>Actual old body</p></body></html>'));
 const document=page.dom.window.document,ObjectType=page.dom.window.Object,context=page.executionContextId,loader=page.loaderId,url=page.url,requests=[];page.on('request',request=>requests.push(request));
 return{page,requests,checkIdentity(){assert.equal(page.dom.window.document,document);assert.equal(page.dom.window.Object,ObjectType);assert.equal(page.executionContextId,context);assert.equal(page.loaderId,loader);assert.equal(page.url,url);assert.equal(page.evaluate('actualMarker'),'kept');assert.equal(requests.length,0)}};
}
const value=(page,expression)=>JSON.parse(page.evaluate('JSON.stringify(('+expression+'))'));
const turn=page=>page.evaluate('new Promise(resolve=>setTimeout(resolve,0))');

test('Location JavaScript URLs execute actual decoded code after sync/microtasks without replacing the document or fetching',async t=>{
 const{page,checkIdentity}=await fixture(t);
 const immediate=page.evaluate(`location.href='javascript:actualRuns.push("actual%20decoded")';actualRuns.push('sync');queueMicrotask(()=>actualRuns.push('microtask'));setTimeout(()=>actualRuns.push('timer'),0);JSON.stringify(actualRuns)`);
 assert.deepEqual(JSON.parse(immediate),['sync']);await turn(page);assert.deepEqual(value(page,'actualRuns'),['sync','microtask','actual decoded','timer']);checkIdentity();
 page.evaluate(`location.assign('  JaVaScRiPt:void actualRuns.push("assign")');location.replace('javascript:void actualRuns.push("replace")')`);await turn(page);assert.deepEqual(value(page,'actualRuns.slice(-2)'),['assign','replace']);checkIdentity();
});

test('GET and POST JavaScript form actions execute their actual source without adding form data to the code URL',async t=>{
 const{page,checkIdentity}=await fixture(t);const initialLength=page.evaluate('history.length');
 for(const method of['get','post']){
  page.evaluate(`(()=>{const form=document.createElement('form');form.method=${JSON.stringify(method)};form.action='javascript:void actualRuns.push('+JSON.stringify(${JSON.stringify(method)})+')';form.innerHTML='<input name=actual value=payload>';document.body.appendChild(form);form.requestSubmit()})()`);
  await turn(page);assert.equal(page.evaluate('actualRuns.at(-1)'),method);checkIdentity();
 }
 assert.equal(page.evaluate('history.length'),initialLength);
});

test('a JavaScript hyperlink download attribute still queues genuine script execution',async t=>{
 const{page,checkIdentity}=await fixture(t);page.evaluate(`(()=>{const link=document.createElement('a');link.download='actual.txt';link.href='javascript:void actualRuns.push("download-script")';document.body.appendChild(link);link.click();actualRuns.push('sync')})()`);
 assert.deepEqual(value(page,'actualRuns'),['sync']);await turn(page);assert.deepEqual(value(page,'actualRuns'),['sync','download-script']);checkIdentity();
});

test('actual click and submit cancellation prevent JavaScript URL default actions',async t=>{
 const{page,checkIdentity}=await fixture(t);page.evaluate(`(()=>{const link=document.createElement('a');link.href='javascript:void actualRuns.push("unwanted-link")';link.onclick=event=>{actualRuns.push('click');event.preventDefault()};document.body.appendChild(link);link.click();const form=document.createElement('form');form.action='javascript:void actualRuns.push("unwanted-form")';form.onsubmit=event=>{actualRuns.push('submit');event.preventDefault()};document.body.appendChild(form);form.requestSubmit()})()`);
 await turn(page);assert.deepEqual(value(page,'actualRuns'),['click','submit']);checkIdentity();
});

test('stop preserves queued JavaScript tasks, assignments retain order, and returned HTML is not a document replacement',async t=>{
 const{page,checkIdentity}=await fixture(t);page.evaluate(`location.assign('javascript:void actualRuns.push("first")');stop();location.assign('javascript:void actualRuns.push("second")');location.replace('javascript:"<p>Returned bytes</p>"');actualRuns.push('sync')`);await turn(page);
 assert.deepEqual(value(page,'actualRuns'),['sync','first','second']);assert.equal(page.evaluate('document.body.textContent'),'Actual old body');checkIdentity();
});

test('a thrown JavaScript URL error dispatches a genuine trusted same-realm ErrorEvent',async t=>{
 const{page,checkIdentity}=await fixture(t),errors=[];page.on('pageError',error=>errors.push(error));
 page.evaluate(`globalThis.actualErrors=[];addEventListener('error',event=>{actualErrors.push({message:event.message,name:event.error.name,realm:event.error instanceof TypeError,trusted:event.isTrusted});event.preventDefault()});location.assign('javascript:throw new TypeError("actual-JSURL-error")')`);await turn(page);
 assert.deepEqual(value(page,'actualErrors'),[{message:'TypeError: actual-JSURL-error',name:'TypeError',realm:true,trusted:true}]);assert.equal(errors.length,0);checkIdentity();
});

let originA,originB,servers,wire=[];
before(async()=>{
 servers=['A','B'].map(label=>http.createServer((request,response)=>{
  wire.push({label,url:request.url,method:request.method});response.writeHead(200,{'content-type':'text/html'});
  response.end('<!doctype html><html><head><script>globalThis.actualMarker='+JSON.stringify(label)+';globalThis.actualRuns=[];globalThis.actualParent=parent;</script></head><body>'+(request.url==='/root'?'<iframe name=same src="'+originA+'/child"></iframe><iframe name=foreign src="'+originB+'/child"></iframe>':'Actual '+label)+'</body></html>');
 }));
 for(let i=0;i<servers.length;i++)servers[i].listen(0,i?'127.0.0.2':'127.0.0.1');await Promise.all(servers.map(server=>once(server,'listening')));originA='http://127.0.0.1:'+servers[0].address().port;originB='http://127.0.0.2:'+servers[1].address().port;
});
after(async()=>{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}});
async function frameFixture(t){const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate(originA+'/root');return page;}

test('JavaScript form targets use actual original document identity across URL-only History changes',async t=>{
 const page=await frameFixture(t),requests=wire.length;const rows=page.frames.executionPages(),same=rows.find(row=>row.url===originA+'/child'),foreign=rows.find(row=>row.url===originB+'/child');assert.ok(same);assert.ok(foreign);
 const submit=(target,code)=>page.evaluate(`(()=>{const form=document.createElement('form');form.target=${JSON.stringify(target)};form.action='javascript:'+${JSON.stringify(code)};document.body.appendChild(form);form.requestSubmit()})()`);
 submit('same','void actualRuns.push("original-A")');submit('foreign','void actualRuns.push("unwanted-B")');await turn(page);assert.deepEqual(value(same,'actualRuns'),['original-A']);assert.deepEqual(value(foreign,'actualRuns'),[]);
 page.evaluate('history.pushState(null,"",'+JSON.stringify(originB+'/displayed-only')+')');submit('same','void actualRuns.push("still-principal-A")');submit('foreign','void actualRuns.push("unwanted-new-display-origin")');await turn(page);
 assert.equal(page.securityOrigin,originA);assert.equal(page.url,originB+'/displayed-only');assert.deepEqual(value(same,'actualRuns'),['original-A','still-principal-A']);assert.deepEqual(value(foreign,'actualRuns'),[]);assert.equal(wire.length,requests);
});

test('frame removal cancels only existing JavaScript navigation tasks; a fresh retained-window assignment still executes',async t=>{
 const page=await frameFixture(t),requests=wire.length;page.evaluate(`globalThis.actualChild=frames[0];actualChild.location.assign('javascript:void actualParent.actualRuns.push("unwanted-queued")');document.querySelector('iframe[name=same]').remove()`);await turn(page);assert.deepEqual(value(page,'actualRuns'),[]);
 page.evaluate(`actualChild.location.assign('javascript:void actualParent.actualRuns.push("fresh-retained")')`);await turn(page);assert.deepEqual(value(page,'actualRuns'),['fresh-retained']);assert.equal(wire.length,requests);
});

test('JavaScript form navigation permits its own opaque document and denies every different opaque document, including inherited srcdoc',async t=>{
 const{page,requests}=await fixture(t);const data='data:text/html,'+encodeURIComponent('<!doctype html><html><head><script>globalThis.actualRuns=[];globalThis.actualMarker="D";</script></head><body>D</body></html>');
 await page.evaluate(`(async()=>{for(const kind of['inherited','independent']){const frame=document.createElement('iframe');frame.name=kind;if(kind==='inherited')frame.srcdoc='<script>globalThis.actualRuns=[];globalThis.actualMarker="I";<\\/script>';else frame.src=${JSON.stringify(data)};const loaded=new Promise(resolve=>frame.onload=resolve);document.body.appendChild(frame);await loaded}})()`);
 const rows=page.frames.executionPages(),inherited=rows.find(row=>row.url==='about:srcdoc'),independent=rows.find(row=>row.url===data);assert.ok(inherited);assert.ok(independent);assert.equal(inherited.securityOrigin,'null');assert.equal(independent.securityOrigin,'null');const count=requests.length;
 page.evaluate(`(()=>{for(const target of['inherited','independent','_self']){const form=document.createElement('form');form.target=target;form.action='javascript:void actualRuns.push('+JSON.stringify(target)+')';document.body.appendChild(form);form.requestSubmit()}})()`);await turn(page);
 assert.deepEqual(value(inherited,'actualRuns'),[]);assert.deepEqual(value(independent,'actualRuns'),[]);assert.deepEqual(value(page,'actualRuns'),['_self']);assert.equal(requests.length,count);
});

test('VM-control errors stay outside Web callbacks while genuine authored Error objects with the same code remain observable',async t=>{
 const{page}=await fixture(t),diagnostics=[];page.on('pageError',error=>diagnostics.push(error));
 page.evaluate(`globalThis.actualWebErrors=[];addEventListener('error',event=>{actualWebErrors.push({name:event.error?.name,code:event.error?.code,realm:event.error instanceof Error,same:event.error===globalThis.actualAuthoredError});event.preventDefault()})`);
 const originalTimeout=page.timeout;page.timeout=20;
 try{page.evaluate(`location.assign('javascript:while(true){}')`);await turn(page);}finally{page.timeout=originalTimeout}
 assert.deepEqual(value(page,'actualWebErrors'),[]);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].code,'ERR_SCRIPT_EXECUTION_TIMEOUT');
 page.evaluate(`location.assign('javascript:globalThis.actualAuthoredError=new Error("authored VM value");actualAuthoredError.code="ERR_SCRIPT_EXECUTION_TIMEOUT";throw actualAuthoredError')`);await turn(page);
 assert.deepEqual(value(page,'actualWebErrors'),[{name:'Error',code:'ERR_SCRIPT_EXECUTION_TIMEOUT',realm:true,same:true}]);assert.equal(diagnostics.length,1);
});
