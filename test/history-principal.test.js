import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Browser} from '../src/browser.js';

let a,b,servers,requests=[],sequence=0;
before(async()=>{
 servers=['A','B'].map(label=>http.createServer(async(request,response)=>{
  let body='';for await(const chunk of request)body+=chunk;
  requests.push({label,url:request.url,method:request.method,body,headers:request.headers});
  const allowed=[a,b,'null'].includes(request.headers.origin)?request.headers.origin:null;
  const cors=allowed?{'access-control-allow-origin':allowed,'access-control-allow-credentials':'true'}:{};
  if(request.url.startsWith('/probe')){response.writeHead(200,{'content-type':'application/json',...cors});response.end(JSON.stringify({label,origin:request.headers.origin??null,referer:request.headers.referer??null,cookie:request.headers.cookie??null,body}));return}
  if(request.url.startsWith('/worker.js')){response.writeHead(200,{'content-type':'application/javascript'});response.end(`onmessage=async e=>{const rows=[];for(const [label,url]of e.data.urls){try{rows.push({label,result:await(await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},credentials:'include',body:e.data.phase+'-'+label})).json()})}catch(error){rows.push({label,error:error.name})}}postMessage({id:e.data.id,rows,location:location.href})};postMessage({ready:true})`);return}
  response.writeHead(200,{'content-type':'text/html','cache-control':'no-store','set-cookie':[label.toLowerCase()+'_public=owned-'+label+'; Path=/',label.toLowerCase()+'_hidden=hidden-'+label+'; Path=/; HttpOnly']});
  const children=request.url.startsWith('/root')?'<iframe src="'+b+'/other"></iframe>':'';
  response.end('<!doctype html><script>globalThis.actualToken='+ ++sequence+';localStorage.setItem("principal-marker",'+JSON.stringify(label)+')</script><body><p>actual '+label+'</p>'+children);
 }));
 for(let i=0;i<servers.length;i++)servers[i].listen(0,i?'127.0.0.2':'127.0.0.1');await Promise.all(servers.map(server=>once(server,'listening')));
 a='http://127.0.0.1:'+servers[0].address().port;b='http://127.0.0.2:'+servers[1].address().port;
});
after(async()=>{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}});
async function fixture(t,frames=true){const browser=new Browser({loadResources:['iframe','worker']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate(a+(frames?'/root':'/plain'));return{browser,page,w:page.dom.window}}
const value=(page,expression)=>JSON.parse(page.evaluate('JSON.stringify(('+expression+'))'));

test('push and replace update real URL/history while retaining Document, VM, storage and principal',async t=>{
 const{page,w}=await fixture(t),doc=w.document,ObjectType=w.Object,loader=page.loaderId,context=page.executionContextId,token=w.actualToken,before=requests.length;
 const row=value(page,`(()=>{const held=localStorage,entry=navigation.currentEntry;sessionStorage.setItem('actual-session','A');history.pushState({actual:1},'',${JSON.stringify(b+'/presented')});const afterPush={url:location.href,locationOrigin:location.origin,windowOrigin:origin,base:document.baseURI,state:history.state,current:navigation.currentEntry.url,storage:localStorage.getItem('principal-marker'),session:sessionStorage.getItem('actual-session'),sameStorage:held===localStorage};history.replaceState({actual:2},'',${JSON.stringify(b+'/replaced')});return{afterPush,afterReplace:{url:location.href,state:history.state,current:navigation.currentEntry.url}}})()`);
 assert.deepEqual(row,{afterPush:{url:b+'/presented',locationOrigin:b,windowOrigin:a,base:b+'/presented',state:{actual:1},current:b+'/presented',storage:'A',session:'A',sameStorage:true},afterReplace:{url:b+'/replaced',state:{actual:2},current:b+'/replaced'}});
 assert.equal(page.securityOrigin,a);assert.equal(page.frames.getTree().frame.securityOrigin,a);assert.equal(page.dom.window.document,doc);assert.equal(page.dom.window.Object,ObjectType);assert.equal(page.executionContextId,context);assert.equal(page.loaderId,loader);assert.equal(w.actualToken,token);assert.equal(requests.length,before);
});

test('data, JavaScript, about, file and credential URL records remain URL-only and malformed input does not mutate state',async t=>{
 const{page,w}=await fixture(t),doc=w.document,token=w.actualToken,before=requests.length;
 for(const url of['data:text/html,<script>globalThis.unwanted=1</script>','javascript:globalThis.unwanted=1','about:blank','file:///tmp/principal-control-never-read',b.replace('http://','http://u:p@')+'/credential']){
  page.evaluate('history.pushState({actual:1},"",'+JSON.stringify(url)+')');assert.equal(page.url,url);assert.equal(page.securityOrigin,a);assert.equal(page.dom.window.origin,a);assert.equal(page.dom.window.document,doc);assert.equal(page.dom.window.actualToken,token);assert.equal(page.evaluate('globalThis.unwanted'),undefined);
 }
 const length=page.history.length,old=page.url;assert.throws(()=>page.evaluate('history.pushState({},"","http://[")'),error=>error.name==='TypeError');assert.equal(page.history.length,length);assert.equal(page.url,old);assert.equal(requests.length,before);
});

test('default Fetch referrer uses live URL while credentials authority stays original and Lax cookie delivery uses live site',async t=>{
 const{page}=await fixture(t);const row=JSON.parse(await page.evaluate(`(async()=>{history.pushState(null,'',${JSON.stringify(b+'/new-source')});const rows=[];for(const credentials of['same-origin','include'])for(const[label,url]of[['A',${JSON.stringify(a+'/probe')}],['B',${JSON.stringify(b+'/probe')}]])rows.push({credentials,label,value:await(await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},credentials,body:'actual-'+label})).json()});return JSON.stringify(rows)})()`));
 for(const record of row){assert.equal(record.value.origin,a);assert.equal(record.value.referer,record.label==='A'?b+'/':b+'/new-source');if(record.credentials==='include'&&record.label==='B')assert.equal(record.value.cookie,'b_public=owned-B; b_hidden=hidden-B');else assert.equal(record.value.cookie,null)}
});

test('HTTPS display URL suppresses downgraded Referer but preserves Native host-based cookie site and original Origin',async t=>{
 const{page}=await fixture(t),shown=b.replace('http://','https://')+'/display-only';const row=JSON.parse(await page.evaluate(`(async()=>{history.replaceState(null,'',${JSON.stringify(shown)});return JSON.stringify(await(await fetch(${JSON.stringify(b+'/probe')},{method:'POST',headers:{'content-type':'text/plain'},credentials:'include',body:'scheme-control'})).json())})()`));
 assert.equal(page.url,shown);assert.equal(page.securityOrigin,a);assert.equal(row.origin,a);assert.equal(row.referer,null);assert.equal(row.cookie,'b_public=owned-B; b_hidden=hidden-B');
});

test('default CookieStore follows actual URL, explicit URL still authenticates principal, and real writes/events stay backed by the jar',async t=>{
 const{page}=await fixture(t);const row=JSON.parse(await page.evaluate(`(async()=>{const held=cookieStore,events=[];held.addEventListener('change',e=>events.push({changed:e.changed.map(c=>[c.name,c.value,c.secure]),trusted:e.isTrusted}));history.pushState(null,'',${JSON.stringify(b+'/cookies')});let currentError,originalError;try{await held.getAll({url:location.href})}catch(e){currentError=[e.name,e.message]}try{await held.getAll({url:${JSON.stringify(a+'/root')}})}catch(e){originalError=[e.name,e.message]}const before=(await held.getAll()).map(c=>c.name);await held.set({name:'actual-rewrite',value:'actual-value',sameSite:'lax',path:'/'});await new Promise(r=>setTimeout(r,10));return JSON.stringify({same:held===cookieStore,before,currentError,originalError,events,cookie:document.cookie,values:(await held.getAll()).map(c=>[c.name,c.value,c.secure])})})()`));
 assert.equal(row.same,true);assert.deepEqual(row.before,['b_public']);assert.deepEqual(row.currentError,['TypeError','SecurityError']);assert.deepEqual(row.originalError,['TypeError','InvalidUrl']);assert.deepEqual(row.events,[{changed:[['actual-rewrite','actual-value',true]],trusted:true}]);assert.equal(row.cookie.includes('b_public=owned-B'),true);assert.equal(row.cookie.includes('b_hidden'),false);assert.deepEqual(row.values,[['b_public','owned-B',false],['actual-rewrite','actual-value',true]]);
 const actual=await page.context.cookies.getCookies(b+'/cookies');assert.equal(actual.some(cookie=>cookie.key==='actual-rewrite'&&cookie.value==='actual-value'&&cookie.secure),true);
});

test('object URL origin and resource-timing detail follow original principal while message-origin metadata follows current URL',async t=>{
 const{page}=await fixture(t);const row=JSON.parse(await page.evaluate(`(async()=>{history.pushState(null,'',${JSON.stringify(b+'/metadata')});const uri=URL.createObjectURL(new Blob(['actual-blob-bytes']));const blob={origin:new URL(uri).origin,text:await(await fetch(uri)).text()};URL.revokeObjectURL(uri);const message=await new Promise(resolve=>{addEventListener('message',e=>resolve({origin:e.origin,source:e.source===window}),{once:true});postMessage('actual-message','*')});const urls=[${JSON.stringify(a+'/probe?timing=A')},${JSON.stringify(b+'/probe?timing=B')}];for(const url of urls)await(await fetch(url,{method:'POST',headers:{'content-type':'text/plain'},body:'actual-resource-body'})).text();return JSON.stringify({blob,message,entries:urls.map(url=>{const e=performance.getEntriesByName(url)[0];return{size:e.decodedBodySize,status:e.responseStatus}})})})()`));
 assert.deepEqual(row.blob,{origin:a,text:'actual-blob-bytes'});assert.deepEqual(row.message,{origin:b,source:true});assert.equal(row.entries[0].size>0,true);assert.equal(row.entries[0].status,200);assert.deepEqual(row.entries[1],{size:0,status:0});
});

test('existing dedicated worker retains original Origin/referrer while live creator URL changes cookie delivery site',async t=>{
 const{page}=await fixture(t);const row=JSON.parse(await page.evaluate(`(async()=>{const worker=new Worker(${JSON.stringify(a+'/worker.js')}),ready=new Promise(resolve=>worker.onmessage=e=>e.data.ready&&resolve());await ready;const ask=phase=>new Promise(resolve=>{worker.onmessage=e=>e.data.id===phase&&resolve(e.data);worker.postMessage({id:phase,phase,urls:[['A',${JSON.stringify(a+'/probe')}],['B',${JSON.stringify(b+'/probe')}]]})});try{const before=await ask('before');history.pushState(null,'',${JSON.stringify(b+'/live-owner')});return JSON.stringify({before,after:await ask('after')})}finally{worker.terminate()}})()`));
 assert.equal(row.before.rows[0].result.cookie,'a_public=owned-A; a_hidden=hidden-A');assert.equal(row.before.rows[1].result.cookie,null);assert.equal(row.after.rows[0].result.cookie,null);assert.equal(row.after.rows[1].result.cookie,'b_public=owned-B; b_hidden=hidden-B');for(const record of row.after.rows)assert.equal(record.result.origin,a);assert.equal(row.after.location,a+'/worker.js');assert.equal(row.after.rows[0].result.referer,a+'/worker.js');assert.equal(row.after.rows[1].result.referer,a+'/');
});

test('same-document traversal restores URL/state across origins without replacing the VM or principal',async t=>{
 const{page,w}=await fixture(t,false),doc=w.document,before=requests.length;page.evaluate(`history.pushState({one:1},'',${JSON.stringify(b+'/one')});history.pushState({two:2},'','data:text/html,actual-two');history.back();true`);
 assert.equal(page.url,b+'/one');assert.deepEqual(value(page,'history.state'),{one:1});assert.equal(page.securityOrigin,a);assert.equal(page.dom.window.document,doc);assert.equal(requests.length,before);page.evaluate('history.back();true');assert.equal(page.url,a+'/plain');assert.equal(page.securityOrigin,a);
});

test('owned blank/srcdoc and History-about:blank child Fetch uses real parent URL for cookie site and default referrer',async t=>{
 const{page}=await fixture(t,false);const rows=JSON.parse(await page.evaluate(`(async()=>{const rows=[];for(const kind of['blank','srcdoc','http','history-blank']){const frame=document.createElement('iframe');if(kind==='srcdoc')frame.srcdoc='<p>actual child</p>';if(kind==='http'||kind==='history-blank')frame.src=${JSON.stringify(a+'/frame-a')};const loaded=new Promise(resolve=>frame.onload=resolve);document.body.appendChild(frame);await loaded;const child=frame.contentWindow;if(kind==='history-blank')child.history.pushState(null,'','about:blank');try{rows.push({kind,url:child.location.href,origin:child.origin,response:await(await child.fetch(${JSON.stringify(a+'/probe')},{method:'POST',headers:{'content-type':'text/plain'},credentials:'include',body:'actual-'+kind})).json()})}finally{frame.remove()}}return JSON.stringify(rows)})()`));
 assert.equal(rows.length,4);for(const row of rows){assert.equal(row.origin,a);assert.equal(row.response.origin,a);assert.equal(row.response.cookie,'a_public=owned-A; a_hidden=hidden-A');assert.equal(row.response.referer,a+(row.kind==='http'?'/frame-a':'/plain'))}
 assert.deepEqual(rows.map(row=>row.url),['about:blank','about:srcdoc',a+'/frame-a','about:blank']);
});
