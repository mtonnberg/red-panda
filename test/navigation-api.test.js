import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Browser,until} from '../src/browser.js';

let server,origin,wire=[],sequence=0;
before(async()=>{
 server=http.createServer(async(request,response)=>{
  let body='';for await(const chunk of request)body+=chunk;
  wire.push({url:request.url,method:request.method,body});
  response.setHeader('content-type','text/html');
  response.end('<!doctype html><script>globalThis.actualToken='+ ++sequence+'</script><body>'+(request.url==='/root'?'<iframe name="child" src="/child"></iframe>':''));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
async function fixture(t,{frames=true}={}){
 const browser=new Browser({loadResources:frames?['iframe']:[]}),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate(origin+(frames?'/root':'/single'));
 return{browser,page,w:page.dom.window,child:frames?page.dom.window.document.querySelector('iframe'):null};
}
const value=(page,source)=>JSON.parse(page.evaluate('JSON.stringify(('+source+'))'));

test('Navigation interfaces have real selected-realm brands and reject copied or authored lookalikes',async t=>{
 const{page}=await fixture(t);
 const actual=value(page,`(()=>{const nav=navigation,entry=nav.currentEntry,errors=[];for(const C of[Navigation,NavigationHistoryEntry,NavigationDestination,NavigationActivation]){try{new C()}catch(e){errors.push([e.name,e.message,e instanceof TypeError])}}const fake=Object.create(Navigation.prototype);for(const key of Reflect.ownKeys(nav))Object.defineProperty(fake,key,Object.getOwnPropertyDescriptor(nav,key));try{fake.entries()}catch(e){errors.push([e.name,e.message,e instanceof TypeError])}const lookalike={kind:'Navigation',owner:{},entries(){return'authored'}};return{errors,nav:nav instanceof EventTarget,entry:entry instanceof EventTarget,tag:Object.prototype.toString.call(nav),transition:nav.transition,unexposed:typeof NavigationTransition,ordinary:lookalike.entries(),keys:Object.keys(lookalike)}})()`);
 assert.deepEqual(actual.errors.slice(0,4),Array(4).fill(['TypeError','Illegal Constructor',true]));
 assert.deepEqual(actual.errors[4],['TypeError','Illegal invocation',true]);assert.equal(actual.nav,true);assert.equal(actual.entry,true);assert.equal(actual.tag,'[object Navigation]');assert.equal(actual.transition,null);assert.equal(actual.unexposed,'undefined');assert.equal(actual.ordinary,'authored');assert.deepEqual(actual.keys,['kind','owner','entries']);
});

test('the actual shared Navigation is created in its first accessing frame realm with stable entries and fresh arrays',async t=>{
 const{page}=await fixture(t);
 assert.deepEqual(value(page,`(()=>{const child=document.querySelector('iframe').contentWindow,nav=child.navigation,a=nav.entries(),b=navigation.entries();return{same:nav===navigation,prototype:Object.getPrototypeOf(nav)===child.Navigation.prototype,array:Object.getPrototypeOf(a)===child.Array.prototype,entry:Object.getPrototypeOf(a[0])===child.NavigationHistoryEntry.prototype,stable:a[0]===b[0],fresh:a!==b,current:nav.currentEntry===a.at(-1),documents:a.map(e=>e.sameDocument)}})()`),{same:true,prototype:true,array:true,entry:true,stable:true,fresh:true,current:true,documents:[false,true]});
});

test('borrowed Navigation methods use their genuine method realm for actions, promises and first entry allocation',async t=>{
 const{page}=await fixture(t);
 const row=JSON.parse(await page.evaluate(`(async()=>{const c=document.querySelector('iframe').contentWindow,n=navigation;const a=Object.getOwnPropertyDescriptor(c.Navigation.prototype,'activation').get.call(n),entry=a.entry;const script=c.document.createElement('script');script.textContent="globalThis.actualReturn=navigation.navigate('#method-realm');globalThis.childPromise=actualReturn.finished instanceof Promise";c.document.body.append(script);await c.actualReturn.finished;return JSON.stringify({activationChild:a instanceof c.NavigationActivation,entryChild:entry instanceof c.NavigationHistoryEntry,childPromise:c.childPromise,parentPromise:c.actualReturn.finished instanceof Promise,root:location.href,child:c.location.href})})()`));
 assert.deepEqual(row,{activationChild:true,entryChild:true,childPromise:false,parentPromise:true,root:origin+'/root#method-realm',child:origin+'/child'});
});

test('an unread currententrychange event preserves genuine lazy entry allocation in a later borrowed getter realm',async t=>{
 const{page}=await fixture(t);
 assert.deepEqual(value(page,`(()=>{const c=document.querySelector('iframe').contentWindow,n=navigation;let event;n.addEventListener('currententrychange',e=>event=e,{once:true});history.pushState(null,'','/history-state');const activation=Object.getOwnPropertyDescriptor(c.Navigation.prototype,'activation').get.call(n),entry=activation.entry;return{child:entry instanceof c.NavigationHistoryEntry,main:entry instanceof NavigationHistoryEntry,fromSame:event.from===entry,activationURL:entry.url}})()`),{child:true,main:false,fromSame:true,activationURL:origin+'/child'});
});

test('child-owned shared Navigation emits real child-realm success for its own same-document API operation',async t=>{
 const{page}=await fixture(t);
 const row=JSON.parse(await page.evaluate(`(async()=>{const c=document.querySelector('iframe').contentWindow,n=c.navigation,events=[];for(const type of['navigate','currententrychange','navigatesuccess'])n.addEventListener(type,e=>events.push([e.type,e instanceof c.Event]));const result=n.navigate('#child-owned');await result.finished;return JSON.stringify({events,childPromise:result.finished instanceof c.Promise,root:location.href,child:c.location.href})})()`));
 assert.deepEqual(row,{events:[['currententrychange',true],['navigatesuccess',true]],childPromise:true,root:origin+'/root',child:origin+'/child#child-owned'});
});

test('same-document API navigation commits real URL/state, VM promises, events and the owned hash task',async t=>{
 const{page,w}=await fixture(t,{frames:false}),document=w.document,before=wire.length;
 const actual=await page.evaluate(`(async()=>{const events=[];for(const type of['navigate','currententrychange','navigatesuccess'])navigation.addEventListener(type,e=>events.push([type,e.isTrusted,e.target===navigation]));addEventListener('hashchange',e=>events.push([e.type,e.isTrusted,e.target===window]));const state={nested:{actual:17}},info={actual:41};let signal,sameInfo;navigation.addEventListener('navigate',e=>{signal=e.signal;sameInfo=e.info===info;const a=e.destination.getState(),b=e.destination.getState();if(a===b||a.nested===b.nested)throw Error('state aliases')},{once:true});const result=navigation.navigate('#owned',{state,info});const immediate={url:location.href,keys:Object.keys(result),promises:result.committed instanceof Promise&&result.finished instanceof Promise,distinct:result.committed!==result.finished,events:events.slice()};state.nested.actual=99;const committed=await result.committed,finished=await result.finished;await new Promise(r=>setTimeout(r,10));return JSON.stringify({immediate,committed:typeof committed,finished:typeof finished,state:history.state,entry:navigation.currentEntry.getState(),sameInfo,aborted:signal.aborted,events})})()`);
 const row=JSON.parse(actual);assert.equal(row.immediate.url,origin+'/single#owned');assert.deepEqual(row.immediate.keys,['committed','finished']);assert.equal(row.immediate.promises,true);assert.equal(row.immediate.distinct,true);assert.deepEqual(row.immediate.events,[['navigate',true,true],['currententrychange',true,true]]);assert.equal(row.committed,'undefined');assert.equal(row.finished,'undefined');assert.deepEqual(row.state,{nested:{actual:17}});assert.deepEqual(row.entry,row.state);assert.equal(row.sameInfo,true);assert.equal(row.aborted,false);assert.deepEqual(row.events.map(e=>e[0]),['navigate','currententrychange','navigatesuccess','hashchange']);assert.equal(page.dom.window.document,document);assert.equal(wire.length,before);
});

test('canceling the real navigate event rejects both API promises with the exact signal reason and makes no request',async t=>{
 const{page}=await fixture(t,{frames:false}),before=wire.length;
 const row=JSON.parse(await page.evaluate(`(async()=>{let event,error;navigation.addEventListener('navigate',e=>{event=e;e.preventDefault()},{once:true});navigation.addEventListener('navigateerror',e=>error=e,{once:true});const result=navigation.navigate('/never-requested',{state:{actual:1}});const settled=await Promise.allSettled([result.committed,result.finished]);return JSON.stringify({url:location.href,prevented:event.defaultPrevented,aborted:event.signal.aborted,same:settled.every(r=>r.reason===event.signal.reason)&&error.error===event.signal.reason,name:error.error.name,message:error.message,realm:error.error instanceof DOMException,trusted:error.isTrusted})})()`));
 assert.deepEqual(row,{url:origin+'/single',prevented:true,aborted:true,same:true,name:'AbortError',message:'AbortError: Navigation was aborted',realm:true,trusted:true});assert.equal(wire.length,before);assert.equal(page.pendingNavigation==null,true);
});

test('supersession aborts only the unfinished promise after currententrychange has committed',async t=>{
 const{page}=await fixture(t,{frames:false});
 const row=JSON.parse(await page.evaluate(`(async()=>{navigation.addEventListener('currententrychange',()=>history.pushState(null,'','#inner'),{once:true});const result=navigation.navigate('#outer');return JSON.stringify(await Promise.all([result.committed.then(()=> 'resolved',e=>'rejected '+e.name),result.finished.then(()=> 'resolved',e=>'rejected '+e.name)]))})()`));
 assert.deepEqual(row,['resolved','rejected AbortError']);assert.equal(page.url,origin+'/single#inner');
});

test('actual callback microtasks retain Native ordering around success and abort promise settlement',async t=>{
 const{page}=await fixture(t,{frames:false});
 const order=JSON.parse(await page.evaluate(`(async()=>{const order=[];navigation.addEventListener('currententrychange',()=>Promise.resolve().then(()=>order.push('current-micro')),{once:true});navigation.addEventListener('navigatesuccess',()=>{order.push('success');result.finished.then(()=>order.push('finished-in-success'));Promise.resolve().then(()=>order.push('success-micro'))},{once:true});const result=navigation.navigate('#micro');result.committed.then(()=>order.push('committed'));result.finished.then(()=>order.push('finished'));await result.finished;await Promise.resolve();return JSON.stringify(order)})()`));
 assert.deepEqual(order,['current-micro','success','committed','success-micro','finished','finished-in-success']);
 const aborted=JSON.parse(await page.evaluate(`(async()=>{const order=[];navigation.addEventListener('navigate',e=>e.signal.addEventListener('abort',()=>{result.finished.catch(()=>order.push('signal-promise'));Promise.resolve().then(()=>order.push('signal-micro'))}),{once:true});const result=navigation.navigate('#first');history.pushState(null,'','#second');result.finished.catch(()=>order.push('outside-promise'));await Promise.resolve();await Promise.resolve();return JSON.stringify(order)})()`));
 assert.deepEqual(aborted,['signal-micro','signal-promise','outside-promise']);
});

test('replace/prune dispose real removed entries last; activation remains a fresh snapshot of actual document commits',async t=>{
 const{page,child}=await fixture(t);
 const initial=value(page,`(()=>{globalThis.originalActivation=navigation.activation;const a=originalActivation,b=navigation.activation,old=navigation.currentEntry;globalThis.disposal=[];old.addEventListener('dispose',e=>disposal.push([e.type,e.isTrusted,old.index]));navigation.addEventListener('currententrychange',()=>disposal.push(['currententrychange',old.index]),{once:true});history.replaceState({classic:1},'','/replacement');return{fresh:a!==b,activation:{entry:a.entry.url,from:a.from.url,type:a.navigationType},after:navigation.activation.entry.url,old:old.url,key:old.key,currentKey:navigation.currentEntry.key,currentState:navigation.currentEntry.getState(),order:disposal}})()`);
 assert.equal(initial.fresh,true);assert.deepEqual(initial.activation,{entry:origin+'/child',from:origin+'/root',type:'push'});assert.equal(initial.after,origin+'/child');assert.equal(initial.old,origin+'/child');assert.equal(initial.key,initial.currentKey);assert.equal(initial.currentState,undefined);assert.deepEqual(initial.order,[['currententrychange',-1],['dispose',true,-1]]);
 child.src='/child-next';await until(()=>child.contentDocument?.URL===origin+'/child-next'&&child.contentDocument.readyState==='complete');
 assert.deepEqual(value(page,`({entry:navigation.activation.entry.url,from:navigation.activation.from.url,type:navigation.activation.navigationType,old:originalActivation.entry.url})`),{entry:origin+'/child-next',from:origin+'/replacement',type:'push',old:origin+'/child'});
});

test('state updates retain entry identity, JSON snapshot semantics and selected-realm getState values',async t=>{
 const{page}=await fixture(t);
 const row=value(page,`(()=>{const entry=navigation.currentEntry,events=[];navigation.addEventListener('currententrychange',e=>events.push([e.from===entry,e.navigationType]));const state={nested:{owned:1}};navigation.updateCurrentEntry({get state(){globalThis.reads=(globalThis.reads||0)+1;return state}});state.nested.owned=99;const a=entry.getState(),b=entry.getState();let missing,bigint;try{navigation.updateCurrentEntry({})}catch(e){missing=[e.name,e instanceof TypeError]}try{navigation.updateCurrentEntry({state:1n})}catch(e){bigint=[e.name,e.message,e instanceof DOMException]}return{same:entry===navigation.currentEntry,reads,state:history.state,a,fresh:a!==b&&a.nested!==b.nested,realm:Object.getPrototypeOf(a)===Object.prototype,events,missing,bigint}})()`);
 assert.deepEqual(row,{same:true,reads:1,state:{nested:{owned:1}},a:{nested:{owned:1}},fresh:true,realm:true,events:[[true,null]],missing:['TypeError',true],bigint:['DataCloneError','The object can not be cloned',true]});
});

test('an explicit undefined state is stored; the genuine JSON read reports its selected-realm SyntaxError',async t=>{
 const{page}=await fixture(t,{frames:false});
 assert.deepEqual(value(page,`(()=>{let count=0;navigation.addEventListener('currententrychange',()=>count++);navigation.updateCurrentEntry({state:undefined});let error;try{navigation.currentEntry.getState()}catch(e){error=[e.name,e instanceof SyntaxError]}return{count,error}})()`),{count:1,error:['SyntaxError',true]});
});

test('traverseTo uses actual document ownership and live keys without an HTTP request',async t=>{
 const{page,w}=await fixture(t,{frames:false}),doc=w.document,before=wire.length;
 const row=JSON.parse(await page.evaluate(`(async()=>{history.pushState({one:1},'','/state-one');const entry=navigation.currentEntry;history.pushState({two:2},'','/state-two');const events=[];navigation.addEventListener('navigate',e=>events.push([e.navigationType,e.destination.key===entry.key,e.destination.index,e.destination.sameDocument]),{once:true});const result=navigation.traverseTo(entry.key);await result.finished;return JSON.stringify({url:location.href,state:history.state,current:navigation.currentEntry===entry,events})})()`));
 assert.deepEqual(row,{url:origin+'/state-one',state:{one:1},current:true,events:[['traverse',true,1,true]]});assert.equal(wire.length,before);assert.equal(page.dom.window.document,doc);
});

test('an accepted cross-document API navigation performs real HTTP and keeps old-document promises unsettled',async t=>{
 const{page,w}=await fixture(t,{frames:false}),before=wire.length;
 page.evaluate(`globalThis.settled=[];const result=navigation.navigate('/network',{state:{actual:17}});result.committed.then(()=>settled.push('committed'));result.finished.then(()=>settled.push('finished'));true`);
 const pending=page.pendingNavigation;assert.ok(pending);await pending.promise;
 assert.equal(wire[before].url,'/network');assert.equal(wire[before].method,'GET');assert.equal(page.url,origin+'/network');assert.deepEqual(Array.from(w.settled),[]);assert.deepEqual(value(page,'({state:history.state,entry:navigation.currentEntry.getState()})'),{state:{actual:17},entry:{actual:17}});assert.notEqual(page.dom.window,w);
});

test('closing the real owning target cancels queued HTTP without acknowledging old-document API promises',async t=>{
 const{page,w}=await fixture(t,{frames:false}),before=wire.length;
 page.evaluate(`globalThis.settlements=[];const result=navigation.navigate('/closed-before-http');result.committed.then(()=>settlements.push('committed'),()=>settlements.push('rejected'));result.finished.then(()=>settlements.push('finished'),()=>settlements.push('rejected'));true`);
 const pending=page.pendingNavigation;page.close();await assert.rejects(pending.promise,error=>error.name==='AbortError');await new Promise(resolve=>setImmediate(resolve));assert.equal(page.closed,true);assert.equal(page.activeRequests.size,0);assert.deepEqual(Array.from(w.settlements),[]);assert.equal(wire.length,before);
});

test('aborting a superseded event preserves the first accepted transport when the newer event is canceled',async t=>{
 const{page}=await fixture(t,{frames:false}),before=wire.length;
 const row=value(page,`(()=>{const events=[];navigation.addEventListener('navigate',e=>events.push(e));location.href='/accepted';navigation.addEventListener('navigate',e=>e.preventDefault(),{once:true});location.href='/canceled';return{aborted:events.map(e=>e.signal.aborted),prevented:events.map(e=>e.defaultPrevented)}})()`);
 assert.deepEqual(row,{aborted:[true,true],prevented:[false,true]});const pending=page.pendingNavigation;assert.ok(pending);await pending.promise;assert.equal(wire[before].url,'/accepted');assert.equal(wire.slice(before).some(r=>r.url==='/canceled'),false);assert.equal(page.url,origin+'/accepted');
});

test('actual form and anchor producers provide their owned Element and FormData before cancellation',async t=>{
 const{page}=await fixture(t,{frames:false}),before=wire.length;
 assert.deepEqual(value(page,`(()=>{const events=[];navigation.addEventListener('navigate',e=>{events.push({source:e.sourceElement.tagName,data:e.formData&&Array.from(e.formData),trusted:e.isTrusted});e.preventDefault()});const f=document.createElement('form');f.method='post';f.action='/posted';f.innerHTML='<input name=actual value=value><button>go</button>';document.body.append(f);f.requestSubmit(f.lastChild);const a=document.createElement('a');a.href='/clicked';document.body.append(a);a.click();return events})()`),[{source:'BUTTON',data:[['actual','value']],trusted:true},{source:'A',data:null,trusted:true}]);assert.equal(wire.length,before);
});

test('javascript URLs execute real decoded code as owned tasks without navigation events or network',async t=>{
 const{page}=await fixture(t,{frames:false}),before=wire.length;
 assert.deepEqual(value(page,`(()=>{globalThis.navigationEvents=0;navigation.addEventListener('navigate',()=>navigationEvents++);location.href='javascript:globalThis.actualJavascript%3D17';return{value:globalThis.actualJavascript,url:location.href}})()`),{url:origin+'/single'});
 await until(()=>page.evaluate('globalThis.actualJavascript')===17);assert.equal(page.evaluate('navigationEvents'),0);assert.equal(wire.length,before);assert.equal(page.url,origin+'/single');
});

test('VM interruption during navigate dispatch cancels actual ownership and a later navigation still works',async t=>{
 const{page}=await fixture(t,{frames:false}),before=wire.length;page.timeout=60;
 page.evaluate(`globalThis.actualSignal=null;navigation.addEventListener('navigate',e=>{actualSignal=e.signal;for(;;){}},{once:true})`);
 assert.throws(()=>page.evaluate(`navigation.navigate('/interrupted')`),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(page.evaluate('actualSignal.aborted'),true);assert.equal(page.pendingNavigation==null,true);assert.equal(page.activeRequests.size,0);assert.equal(wire.length,before);
 await page.evaluate(`navigation.navigate('#later').finished`);assert.equal(page.url,origin+'/single#later');
});

test('committed entry disposal remains owned when a real currententrychange callback is interrupted',async t=>{
 const{page}=await fixture(t,{frames:false});page.timeout=60;
 page.evaluate(`globalThis.oldEntry=navigation.currentEntry;globalThis.disposals=0;oldEntry.addEventListener('dispose',()=>disposals++);navigation.addEventListener('currententrychange',()=>{for(;;){}},{once:true});true`);
 assert.throws(()=>page.evaluate(`history.replaceState({actual:1},'','/committed-before-interruption')`),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(page.evaluate('disposals'),1);assert.equal(page.evaluate('oldEntry.index'),-1);assert.equal(page.url,origin+'/committed-before-interruption');assert.equal(page.activeRequests.size,0);
 await page.evaluate(`navigation.navigate('#later').finished`);assert.equal(page.url,origin+'/committed-before-interruption#later');
});
