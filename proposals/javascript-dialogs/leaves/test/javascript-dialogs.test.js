import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';
import {configureUtilityFactories} from '../src/world-sessions.js';
import {getHeapBinding} from '../src/native-heap.js';

async function setup(t){
 const service=await serve({port:0,loadResources:['iframe']}),client=await connect(`ws://127.0.0.1:${service.port}/`);
 t.after(async()=>{await client.close();await service.close();});
 const root=(method,params={})=>client.send(method,params);
 const create=async browserContextId=>{const{targetId}=await root('Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}:{})});const{sessionId}=await root('Target.attachToTarget',{targetId,flatten:true});const send=(method,params={})=>client.send(method,params,sessionId);await send('Runtime.enable');return{targetId,sessionId,send,page:service.browser.pages.get(targetId)};};
 return{service,client,root,create};
}
async function value(send,expression,contextId){const result=await send('Runtime.evaluate',{expression,returnByValue:true,...(contextId?{contextId}:{})});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result));return result.result.value;}
async function until(send,expression){const deadline=Date.now()+2000;while(Date.now()<deadline){if(await value(send,expression))return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Actual document/task condition not observed within2000ms');}
async function fixture(t){
 const server=http.createServer((req,res)=>{const pages={
  '/inline':'<!doctype html><title>before</title><script>globalThis.results=[confirm("inline-confirm"),prompt("inline-prompt","page-default"),typeof alert("inline-alert")];document.title="after";setTimeout(()=>{globalThis.taskResult=confirm("task-confirm");globalThis.taskDone=true},0)</script>',
  '/parent':'<!doctype html><iframe src="/child"></iframe>',
  '/child':'<!doctype html><p>actual child</p>',
  '/next':'<!doctype html><p>actual new child</p>',
 };const body=pages[req.url];if(body===undefined){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':Buffer.byteLength(body)});res.end(body);});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});return'http://127.0.0.1:'+server.address().port;
}

test('real context responses survive target recreation and clear on actual context disposal',async t=>{
 const{root,create}=await setup(t);
 const absent=error=>error.code===-31998&&error.message==='NoBrowserContext';
 await assert.rejects(root('LP.handleJavaScriptDialog',{accept:true}),absent);
 await assert.rejects(root('Page.handleJavaScriptDialog',{accept:true}),error=>error.code===-32000&&error.message==='No dialog is showing');
 const{browserContextId}=await root('Target.createBrowserContext');
 await root('LP.handleJavaScriptDialog',{accept:true});
 let target=await create(browserContextId);assert.equal(await value(target.send,'confirm("before-target-arm")'),true);
 await target.send('LP.handleJavaScriptDialog',{accept:true,promptText:'actual client Δ'});
 for(const[params,message]of[[{},'MissingField'],[{accept:'yes'},'UnexpectedToken'],[{accept:true,promptText:17},'UnexpectedToken']])await assert.rejects(target.send('LP.handleJavaScriptDialog',params),error=>error.code===-31998&&error.message===message);
 assert.equal(await value(target.send,'prompt("actual prompt","page default")'),'actual client Δ');
 await target.send('LP.handleJavaScriptDialog',{accept:true});await assert.rejects(target.send('Page.handleJavaScriptDialog',{accept:false}),error=>error.code===-32000);
 await root('Target.closeTarget',{targetId:target.targetId});target=await create(browserContextId);assert.equal(await value(target.send,'confirm("survives-target-close")'),true);
 await target.send('LP.handleJavaScriptDialog',{accept:true});await root('Target.closeTarget',{targetId:target.targetId});await root('Target.disposeBrowserContext',{browserContextId});
 await assert.rejects(root('LP.handleJavaScriptDialog',{accept:true}),absent);target=await create();assert.equal(await value(target.send,'confirm("disposed-response-cannot-leak")'),false);
});

test('actual inline and later-task dialogs continue and opening events ignore Page.enable while selecting the primary session',async t=>{
 const{root,client,create}=await setup(t),origin=await fixture(t),target=await create();
 const{sessionId:secondary}=await root('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 await target.send('Page.navigate',{url:origin+'/inline'});await until(target.send,'document.readyState==="complete"&&globalThis.taskDone===true');
 assert.deepEqual(await value(target.send,'({results,title:document.title,taskResult})'),{results:[false,null,'undefined'],title:'after',taskResult:false});
 let events=client.events.filter(event=>event.method==='Page.javascriptDialogOpening');assert.equal(events.length,4);assert.ok(events.every(event=>event.sessionId===target.sessionId&&event.params.url===origin+'/inline'&&!event.params.hasBrowserHandler&&event.params.defaultPrompt===''));
 await client.send('LP.handleJavaScriptDialog',{accept:true,promptText:'from secondary'},secondary);
 assert.equal(await value((method,params)=>client.send(method,params,secondary),'prompt("secondary","page")'),'from secondary');
 await target.send('LP.handleJavaScriptDialog',{accept:true});await value(target.send,'alert("consuming-alert")');assert.equal(await value(target.send,'confirm("after-alert")'),false);
 await target.send('LP.handleJavaScriptDialog',{accept:true});await value(target.send,'globalThis.laterDone=false;setTimeout(()=>{globalThis.laterValue=confirm("armed-later-task");globalThis.laterDone=true},0);true');await until(target.send,'globalThis.laterDone===true');assert.equal(await value(target.send,'laterValue'),true);
 events=client.events.filter(event=>event.method==='Page.javascriptDialogOpening');assert.ok(events.every(event=>event.sessionId===target.sessionId));assert.equal(client.events.filter(event=>event.method==='Page.javascriptDialogClosed').length,0);
});

test('main, frame and utility dialog entries and real receiver errors have actual selected V8 creation contexts',async t=>{
 const authorities=[];configureUtilityFactories({onRealm(global,context){authorities.push({global,context});}});t.after(()=>configureUtilityFactories({}));
 const{create}=await setup(t),origin=await fixture(t),target=await create();await target.send('Page.navigate',{url:origin+'/parent'});await until(target.send,'document.readyState==="complete"');
 const tree=await target.send('Page.getFrameTree'),child=target.page.frames.findFrame(tree.frameTree.childFrames[0].frame.id);
 const{executionContextId}=await target.send('Page.createIsolatedWorld',{frameId:target.page.frameId,worldName:'actual-dialog-entry-realm'});
 assert.equal(authorities.length,1);
 const binding=getHeapBinding(),host={};
 for(const global of[target.page.dom.window,child.dom.window,authorities[0].global]){
  const anchor=global.Object.prototype;
  for(const name of['alert','confirm','prompt']){
   const fn=global[name],d=Object.getOwnPropertyDescriptor(global,name);
   assert.equal(fn.name,name);assert.equal(fn.length,0);assert.equal(Object.hasOwn(fn,'prototype'),false);assert.equal(Object.getPrototypeOf(fn),global.Function.prototype);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(d.writable,true);
   assert.equal(binding.sameRealm(fn,anchor),true);assert.equal(binding.sameRealm(fn,host),false);assert.equal(binding.creationGlobal(fn),binding.creationGlobal(anchor));Object.setPrototypeOf(fn,null);assert.equal(binding.sameRealm(fn,anchor),true);assert.equal(binding.sameRealm(fn,host),false);
  }
 }
 // Each function still executes after prototype removal. Its private bridge
 // authenticates exact real Windows and uses captured genuine intrinsics.
 for(const contextId of[undefined,child.executionContextId,executionContextId]){
  await target.send('LP.handleJavaScriptDialog',{accept:true});
  const result=await value(target.send,'(()=>{const apply=Reflect.apply,TE=TypeError,S=String,description=Object.getOwnPropertyDescriptor(Symbol.prototype,"description");globalThis.dialogBrandHits=0;const fake=new Proxy({}, {get(){dialogBrandHits++;throw Error("untrusted get")},getPrototypeOf(){dialogBrandHits++;throw Error("untrusted prototype")}});globalThis.String=()=>{throw Error("authored String")};globalThis.TypeError=()=>{throw Error("authored TypeError")};Object.defineProperty(Symbol.prototype,"description",{get(){dialogBrandHits++;throw Error("authored description")},configurable:true});let caught;try{apply(confirm,fake,["fake"])}catch(error){caught=error;globalThis.actualDialogError=error}try{return {real:apply(confirm,globalThis,[Symbol("captured-description")]),brand:caught instanceof TE,message:caught.message,hits:dialogBrandHits}}finally{globalThis.String=S;globalThis.TypeError=TE;Object.defineProperty(Symbol.prototype,"description",description)}})()',contextId);
  assert.deepEqual(result,{real:true,brand:true,message:'Illegal invocation',hits:0});
 }
 for(const global of[target.page.dom.window,child.dom.window,authorities[0].global]){const error=global.actualDialogError;assert.equal(binding.sameRealm(error,global.Object.prototype),true);Object.setPrototypeOf(error,null);assert.equal(binding.sameRealm(error,global.Object.prototype),true);assert.equal(binding.sameRealm(error,host),false);}
});

test('real retained frame methods consume context state through their actual active incumbent without retargeting old documents',async t=>{
 const{client,create}=await setup(t),origin=await fixture(t),target=await create();await target.send('Page.navigate',{url:origin+'/parent'});await until(target.send,'document.readyState==="complete"');
 await value(target.send,'(()=>{const w=document.querySelector("iframe").contentWindow;globalThis.oldDialog={window:w,document:w.document,method:w.confirm};return true})()');
 await value(target.send,'document.querySelector("iframe").src="/next";true');await until(target.send,'!!document.querySelector("iframe").contentDocument&&document.querySelector("iframe").contentDocument.URL.endsWith("/next")&&document.querySelector("iframe").contentDocument.readyState==="complete"');
 for(const removed of[false,true]){
  if(removed)await value(target.send,'document.querySelector("iframe").remove();true');
  await target.send('LP.handleJavaScriptDialog',{accept:true});assert.equal(await value(target.send,'oldDialog.method.call(oldDialog.window,"actual-retained-call")'),true);assert.equal(await value(target.send,'confirm("after-retained-call")'),false);
  const event=client.events.filter(event=>event.method==='Page.javascriptDialogOpening'&&event.params.message==='actual-retained-call').at(-1);assert.equal(event.params.url,origin+'/parent');
 }
});
