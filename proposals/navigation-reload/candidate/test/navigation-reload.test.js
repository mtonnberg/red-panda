import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Browser,until} from '../src/browser.js';

let server,origin,wire=[],sequence=0;const counts=new Map();
before(async()=>{
 server=http.createServer((request,response)=>{
  const count=(counts.get(request.url)??0)+1;counts.set(request.url,count);
  wire.push({url:request.url,method:request.method,referer:request.headers.referer});
  if(request.url.startsWith('/redirect-')&&count>1){response.writeHead(302,{location:origin+request.url.replace('/redirect-','/final-')});response.end();return}
  response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
  response.end('<!doctype html><script>globalThis.actualToken='+ ++sequence+'</script><body>'+(request.url==='/root'?'<iframe src="/child"></iframe>':''));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
async function fixture(t,path='/single'){
 const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate(origin+path);return{browser,page,w:page.dom.window};
}
const value=(page,expression)=>JSON.parse(page.evaluate('JSON.stringify(('+expression+'))'));

test('bare initial activation is absent; real first document and explicit blank popup have null predecessor',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());assert.equal(page.dom.window.navigation.activation,null);
 const initial=browser.createPage();assert.equal(initial.dom.window.navigation.currentEntry.id,'0');initial.evaluate('navigation.reload();true');await initial.pendingNavigation.promise;
 assert.deepEqual(value(initial,`({id:navigation.currentEntry.id,key:navigation.currentEntry.key,from:navigation.activation.from,type:navigation.activation.navigationType})`),{id:'1',key:'0',from:null,type:'replace'});
 await page.navigate(origin+'/activation');assert.deepEqual(value(page,`({entry:navigation.activation.entry.url,from:navigation.activation.from,type:navigation.activation.navigationType})`),{entry:origin+'/activation',from:null,type:'replace'});
 assert.deepEqual(value(page,`(()=>{const p=open('about:blank','reload-activation'),a=p.navigation.activation;const result={url:a.entry.url,id:a.entry.id,key:a.entry.key,from:a.from,type:a.navigationType,independent:p.navigation!==navigation};p.close();return result})()`),{url:'about:blank',id:'1',key:'0',from:null,type:'replace',independent:true});
});

test('canceled reload exposes fresh destination metadata/state without mutating the actual current entry or sending HTTP',async t=>{
 const{page}=await fixture(t),before=wire.length;
 const row=JSON.parse(await page.evaluate(`(async()=>{navigation.updateCurrentEntry({state:{initial:1}});const entry=navigation.currentEntry,events=[];let signal;navigation.addEventListener('navigate',e=>{signal=e.signal;events.push({type:e.navigationType,key:e.destination.key,id:e.destination.id,index:e.destination.index,sameDocument:e.destination.sameDocument,state:e.destination.getState(),before:entry.getState()});e.preventDefault()},{once:true});navigation.addEventListener('currententrychange',e=>events.push({type:e.type}));const result=navigation.reload({state:{actual:1}}),settled=await Promise.allSettled([result.committed,result.finished]);return JSON.stringify({events,same:entry===navigation.currentEntry,state:history.state,entry:entry.getState(),aborted:signal.aborted,reasons:settled.every(r=>r.reason===signal.reason),error:signal.reason.name})})()`));
 assert.deepEqual(row,{events:[{type:'reload',key:'',id:'',index:-1,sameDocument:false,state:{actual:1},before:{initial:1}}],same:true,state:{initial:1},entry:{initial:1},aborted:true,reasons:true,error:'AbortError'});assert.equal(wire.length,before);assert.equal(page.pendingNavigation==null,true);
});

test('explicit reload state commits synchronously on the same entry before the actual GET and survives the new document',async t=>{
 const{page,w}=await fixture(t),before=wire.length,doc=w.document,token=w.actualToken;
 const row=value(page,`(()=>{navigation.updateCurrentEntry({state:{initial:1}});globalThis.oldEntry=navigation.currentEntry;const events=[];navigation.addEventListener('navigate',e=>events.push([e.type,e.navigationType,history.state,e.destination.getState()]));navigation.addEventListener('currententrychange',e=>events.push([e.type,e.navigationType,e.from===oldEntry,history.state]));globalThis.settled=[];const result=navigation.reload({state:{actual:17}});result.committed.then(()=>settled.push('committed'));result.finished.then(()=>settled.push('finished'));return{events,same:oldEntry===navigation.currentEntry,state:history.state,id:oldEntry.id,key:oldEntry.key}})()`);
 assert.deepEqual(row.events,[['navigate','reload',{initial:1},{actual:17}],['currententrychange','reload',true,{actual:17}]]);assert.equal(row.same,true);assert.deepEqual(row.state,{actual:17});assert.equal(wire.length,before);
 await page.pendingNavigation.promise;assert.equal(wire[before].url,'/single');assert.equal(wire[before].method,'GET');assert.notEqual(page.dom.window.document,doc);assert.notEqual(page.dom.window.actualToken,token);assert.deepEqual(Array.from(w.settled),[]);
 assert.deepEqual(value(page,`({state:history.state,entry:navigation.currentEntry.getState(),id:navigation.currentEntry.id,key:navigation.currentEntry.key,type:navigation.activation.navigationType})`),{state:{actual:17},entry:{actual:17},id:row.id,key:row.key,type:'reload'});
});

test('undefined reload state keeps its real snapshot and state.toJSON effects precede selecting the target entry',async t=>{
 const{page}=await fixture(t);page.evaluate(`navigation.updateCurrentEntry({state:{kept:1}});navigation.reload({state:undefined});true`);await page.pendingNavigation.promise;assert.deepEqual(value(page,'navigation.currentEntry.getState()'),{kept:1});
 const before=wire.length,row=value(page,`(()=>{const order=[];navigation.addEventListener('navigate',e=>{order.push([e.navigationType,e.destination.url,e.destination.getState()]);if(e.navigationType==='reload')e.preventDefault()});const state={toJSON(){order.push(['toJSON']);history.pushState({moved:1},'','/moved-before-reload');return{actual:1}}};const result=navigation.reload({state});result.committed.catch(()=>{});result.finished.catch(()=>{});return{order,url:location.href,state:history.state}})()`);
 assert.deepEqual(row,{order:[['toJSON'],['push',origin+'/moved-before-reload',null],['reload',origin+'/moved-before-reload',{actual:1}]],url:origin+'/moved-before-reload',state:{moved:1}});assert.equal(wire.length,before);
});

test('real redirect reload preserves journal URL while Location follows response, and a later API reload fetches the journal target',async t=>{
 const{page}=await fixture(t,'/redirect-api');page.evaluate(`navigation.updateCurrentEntry({state:{actual:1}});navigation.reload();true`);await page.pendingNavigation.promise;
 assert.equal(page.url,origin+'/final-api');assert.equal(page.evaluate('navigation.currentEntry.url'),origin+'/redirect-api');assert.deepEqual(value(page,'history.state'),{actual:1});const before=wire.length;
 page.evaluate('navigation.reload();true');await page.pendingNavigation.promise;assert.deepEqual(wire.slice(before),[{url:'/redirect-api',method:'GET',referer:origin+'/final-api'},{url:'/final-api',method:'GET',referer:origin+'/final-api'}]);assert.equal(page.url,origin+'/final-api');assert.equal(page.evaluate('navigation.currentEntry.url'),origin+'/redirect-api');
});

test('child Location reload retains its actual journal entry URL without overwriting the final redirected document URL',async t=>{
 const{page,w}=await fixture(t,'/root'),element=w.document.querySelector('iframe');element.src='/redirect-frame';await until(()=>element.contentDocument?.URL===origin+'/redirect-frame'&&element.contentDocument.readyState==='complete');
 page.evaluate(`globalThis.entryBeforeReload=navigation.currentEntry;document.querySelector('iframe').contentWindow.location.reload();true`);const old=page.frames.findElement(element);await old.pendingNavigation.promise;
 assert.equal(element.contentDocument.URL,origin+'/final-frame');assert.equal(element.contentWindow.location.href,origin+'/final-frame');assert.equal(page.evaluate('navigation.currentEntry===entryBeforeReload'),true);assert.equal(page.evaluate('navigation.currentEntry.url'),origin+'/redirect-frame');assert.equal(page.evaluate('navigation.activation.navigationType'),'reload');
});

test('a reload-state listener can supersede its event while its accepted real GET continues',async t=>{
 const{page}=await fixture(t),before=wire.length;
 const row=value(page,`(()=>{let signal;const order=[];navigation.addEventListener('navigate',e=>{order.push([e.type,e.navigationType]);if(e.navigationType==='reload')signal=e.signal});navigation.addEventListener('navigateerror',e=>order.push([e.type,e.error===signal.reason]));navigation.addEventListener('currententrychange',e=>{order.push([e.type,e.navigationType]);if(e.navigationType==='reload')history.pushState({nested:1},'','#nested')});const result=navigation.reload({state:{actual:1}});return{order,url:location.href,state:history.state,aborted:signal.aborted}})()`);
 assert.deepEqual(row,{order:[['navigate','reload'],['currententrychange','reload'],['navigateerror',true],['navigate','push'],['currententrychange','push']],url:origin+'/single#nested',state:{nested:1},aborted:true});await page.pendingNavigation.promise;assert.equal(wire[before].url,'/single');assert.equal(wire[before].method,'GET');assert.equal(page.url,origin+'/single');assert.equal(page.evaluate('navigation.currentEntry.url'),origin+'/single#nested');assert.deepEqual(value(page,'history.state'),{nested:1});
});

test('superseded child method context uses the genuine registered incumbent while retaining its old-function TypeError realm',async t=>{
 const{page}=await fixture(t,'/root');
 const row=JSON.parse(await page.evaluate(`(async()=>{const element=document.querySelector('iframe'),oldWindow=element.contentWindow,n=oldWindow.navigation,old={Entry:oldWindow.NavigationHistoryEntry,TypeError:oldWindow.TypeError,Promise:oldWindow.Promise,Object:oldWindow.Object,get:Object.getOwnPropertyDescriptor(oldWindow.Navigation.prototype,'currentEntry').get,navigate:oldWindow.Navigation.prototype.navigate};const loaded=new Promise(r=>element.addEventListener('load',r,{once:true}));element.src='/new-child';await loaded;const fresh=element.contentWindow,entry=old.get.call(n);let invalid;try{old.get.call({})}catch(e){invalid={old:e instanceof old.TypeError,fresh:e instanceof fresh.TypeError}}const result=old.navigate.call(n,'#incumbent');await result.finished;return JSON.stringify({entryRoot:entry instanceof NavigationHistoryEntry,entryOld:entry instanceof old.Entry,objectChanged:old.Object!==fresh.Object,rootPromise:result.finished instanceof Promise,oldPromise:result.finished instanceof old.Promise,invalid,root:location.href,child:fresh.location.href})})()`));
 assert.deepEqual(row,{entryRoot:true,entryOld:false,objectChanged:true,rootPromise:true,oldPromise:false,invalid:{old:true,fresh:false},root:origin+'/root#incumbent',child:origin+'/new-child'});
});

test('interruption during the real reload-state callback releases pre-transport ownership without acknowledging a load',async t=>{
 const{page}=await fixture(t),before=wire.length;page.timeout=60;
 page.evaluate(`globalThis.reloadSignal=null;navigation.addEventListener('navigate',e=>reloadSignal=e.signal,{once:true});navigation.addEventListener('currententrychange',()=>{for(;;){}},{once:true});true`);
 assert.throws(()=>page.evaluate(`navigation.reload({state:{actual:1}})`),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(wire.length,before);assert.equal(page.pendingNavigation==null,true);assert.equal(page.activeRequests.size,0);assert.equal(page.evaluate('reloadSignal.aborted'),true);assert.deepEqual(value(page,'history.state'),{actual:1});
 await page.evaluate(`navigation.navigate('#recovered').finished`);assert.equal(page.url,origin+'/single#recovered');
});
