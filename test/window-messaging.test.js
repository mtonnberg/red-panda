import { upstreamTestRoot } from './upstream-reference.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { getRuntimeBinding } from '../src/native-runtime.js';
const binding=getRuntimeBinding();
const{installBroadcast,installWindowMessaging}=await import('../src/window-messaging.js');
const{Browser}=await import('../src/browser.js');
const{startFixtureServer}=await import('../scripts/upstream-fixture-server.mjs');

async function fixture(t){
 const servers=[];for(let i=0;i<2;i++){const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><body></body>')});server.listen(0,'127.0.0.1');await once(server,'listening');servers.push(server)}
 const origins=servers.map(server=>`http://127.0.0.1:${server.address().port}`),browser=new Browser();
 t.after(async()=>{browser.close();for(const server of servers){server.closeAllConnections();await new Promise(r=>server.close(r))}});
 const page=browser.createPage();await page.navigate(origins[0]);return{browser,page,window:page.dom.window,origins};
}
function deadline(promise){return Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Messaging proposal timeout')),5000);timer.unref()})])}
const evaluate=(page,expression)=>deadline(page.evaluate(expression));

test('native entry uses actual realm arrays and data properties without invoking authored Array/Object hooks',async t=>{
 const{page,window}=await fixture(t),RealmArray=window.Array;let captured;
 const native=binding.createEntry((incumbent,receiver,args)=>{captured={incumbent,receiver,args};return args[0]},window);
 Object.defineProperty(window,'nativeProbe',{value:native,configurable:true});
 const result=page.evaluate(`(()=>{globalThis.setterCalls=0;Object.defineProperty(Array.prototype,'0',{configurable:true,set(){setterCalls++}});const OriginalObject=Object;Object.defineProperty(globalThis,'Object',{configurable:true,get(){throw new Error('authored Object getter must not be used')}});try{return{value:nativeProbe('argument'),setterCalls}}finally{delete Array.prototype[0];OriginalObject.defineProperty(globalThis,'Object',{value:OriginalObject,writable:true,configurable:true})}})()`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{value:'argument',setterCalls:0});assert.equal(captured.incumbent,window);assert.equal(captured.receiver,window);assert.equal(Object.getPrototypeOf(captured.args),RealmArray.prototype);assert.equal(Object.getOwnPropertyDescriptor(captured.args,'0').value,'argument');
});

test('native-entry Window transfer preserves cloned graph identity, receiving realm, actual entanglement and source',async t=>{
 const{page,window}=await fixture(t);
 assert.equal(Object.getPrototypeOf(window.postMessage),window.Function.prototype);
 assert.throws(()=>window.postMessage('host has no Window incumbent','*'),/source is not a registered Window/);
 const result=await evaluate(page,`new Promise(resolve=>{const channel=new MessageChannel();const payload={port:channel.port2,map:new Map()};payload.self=payload;payload.map.set(payload,payload.port);addEventListener('message',function receive(e){removeEventListener('message',receive);channel.port1.onmessage=reply=>{resolve({identity:e.ports[0]===e.data.port,mapIdentity:e.data.map.get(e.data)===e.data.port,cycle:e.data.self===e.data,source:e.source===window,origin:e.origin,realm:e.data instanceof Object&&e.ports instanceof Array&&e.data.map instanceof Map,portsFrozen:Object.isFrozen(e.ports),trusted:e.isTrusted,copy:e.data!==payload,moved:e.data.port!==channel.port2,echo:reply.data});channel.port1.close();e.data.port.close()};e.data.port.postMessage('real transferred endpoint')});postMessage(payload,'*',[channel.port2])})`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{identity:true,mapIdentity:true,cycle:true,source:true,origin:window.location.origin,realm:true,portsFrozen:true,trusted:true,copy:true,moved:true,echo:'real transferred endpoint'});
});

test('incumbent source remains independent of target, method creation realm and spoofed payload',async t=>{
 const{page,window}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{const frame=document.createElement('iframe');document.body.append(frame);const child=frame.contentWindow,events=[];const receive=target=>e=>{events.push({target,label:e.data.label,source:e.source===window?'parent':e.source===child?'child':'unknown',origin:e.origin});if(events.length===6)resolve(events)};window.addEventListener('message',receive('parent'));child.addEventListener('message',receive('child'));child.postMessage({label:'p-to-c',source:'spoof'},'*');child.eval("parent.postMessage({label:'c-to-p'},'*')");child.postMessage.call(window,{label:'borrow-child'},'*');child.eval("parent.postMessage.call(window,{label:'borrow-parent'},'*')");Promise.resolve().then(()=>child.postMessage({label:'microtask'},'*'));setTimeout(()=>child.postMessage({label:'timer'},'*'),0)})`);
 const labels=Object.fromEntries(result.map(event=>[event.label,event]));
 for(const label of['p-to-c','microtask','timer'])assert.deepEqual(JSON.parse(JSON.stringify(labels[label])),{target:'child',label,source:'parent',origin:window.location.origin});
 assert.equal(labels['c-to-p'].source,'child');assert.equal(labels['c-to-p'].origin,'null');assert.equal(labels['borrow-child'].target,'parent');assert.equal(labels['borrow-child'].source,'parent');assert.equal(labels['borrow-parent'].target,'child');assert.equal(labels['borrow-parent'].source,'child');
});

test('observed native targetOrigin and ArrayBuffer transfer gaps are explicit, with genuine buffer copies',async t=>{
 const{page}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{let getter=0,received=0;const buffer=new ArrayBuffer(3);new Uint8Array(buffer).set([1,2,3]);const out={};addEventListener('message',function on(e){received++;if(e.data.buffer){out.bytes=[...new Uint8Array(e.data.buffer)];out.copy=e.data.buffer!==buffer}if(received===4){removeEventListener('message',on);resolve({...out,received,bytesLeft:buffer.byteLength,getter})}});postMessage({buffer},'https://mismatched.example',[buffer,buffer]);postMessage('invalid','http://[');postMessage('symbol',Symbol());postMessage('dictionary',{get targetOrigin(){throw new Error('must not read targetOrigin')},get transfer(){getter++;return []}})})`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{bytes:[1,2,3],copy:true,received:4,bytesLeft:3,getter:1});
});

test('Window clone/transfer failures are synchronous and atomic, and missing/invalid receivers fail',async t=>{
 const{page}=await fixture(t);
 const result=page.evaluate(`(()=>{const errors=[],channel=new MessageChannel();const attempt=fn=>{try{fn();return 'accepted'}catch(e){return e.name}};errors.push(attempt(()=>postMessage()),attempt(()=>postMessage.call({},'x','*')),attempt(()=>postMessage(()=>{},'*',[channel.port2])),attempt(()=>postMessage('invalid','*',[{}])));const moved=attempt(()=>postMessage({port:channel.port2},'*',[channel.port2]));const detached=attempt(()=>postMessage(null,'*',[channel.port2]));return{errors,moved,detached}})()`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{errors:['TypeError','TypeError','DataCloneError','DataCloneError'],moved:'accepted',detached:'DataCloneError'});
});

test('BroadcastChannel delivers native asynchronous per-receiver clones with accurate event metadata and no self delivery',async t=>{
 const{page,window}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{const sender=new BroadcastChannel('room'),a=new BroadcastChannel('room'),b=new BroadcastChannel('room'),other=new BroadcastChannel('other');let self=0,wrong=0,first,second,received=0,sync;const payload={n:1};payload.self=payload;sender.onmessage=()=>self++;other.onmessage=()=>wrong++;const finish=()=>{if(++received===2){resolve({sync,self,wrong,first,second,sender:payload.n});for(const c of[sender,a,b,other])c.close()}};a.onmessage=e=>{first={cycle:e.data.self===e.data,copy:e.data!==payload,realm:e.data instanceof Object,origin:e.origin,trusted:e.isTrusted,sourceNull:e.source===null,ports:e.ports.length,bubbles:e.bubbles,cancelable:e.cancelable};e.data.n=9;finish()};b.addEventListener('message',e=>{second={n:e.data.n,copy:e.data!==payload};finish()});sender.postMessage(payload);sync=received})`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{sync:0,self:0,wrong:0,first:{cycle:true,copy:true,realm:true,origin:window.location.origin,trusted:true,sourceNull:true,ports:0,bubbles:false,cancelable:false},second:{n:1,copy:true},sender:1});
});

test('BroadcastChannel close and cloning errors retain genuine brand/arity/state semantics',async t=>{
 const{page,window}=await fixture(t);
 const result=page.evaluate(`(()=>{const attempt=fn=>{try{fn();return'accepted'}catch(e){return e.name}},bc=new BroadcastChannel('errors'),channel=new MessageChannel();const out={constructorName:BroadcastChannel.name,length:BroadcastChannel.length,name:bc.name,tag:Object.prototype.toString.call(bc),eventTarget:bc instanceof EventTarget,errors:[attempt(()=>new BroadcastChannel()),attempt(()=>bc.postMessage()),attempt(()=>bc.postMessage(()=>{})),attempt(()=>bc.postMessage(channel.port1)),attempt(()=>BroadcastChannel.prototype.postMessage.call({},'x'))]};bc.close();bc.close();out.closed=attempt(()=>bc.postMessage(()=>{}));out.nameAfterClose=bc.name;return out})()`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{constructorName:'BroadcastChannel',length:1,name:'errors',tag:'[object BroadcastChannel]',eventTarget:true,errors:['TypeError','TypeError','DataCloneError','DataCloneError','TypeError'],closed:'InvalidStateError',nameAfterClose:'errors'});
 assert.equal(Object.getOwnPropertyDescriptor(window.BroadcastChannel.prototype,'name').enumerable,true);
 assert.deepEqual(Object.getOwnPropertyDescriptor(window.BroadcastChannel.prototype,Symbol.toStringTag),{value:'BroadcastChannel',writable:false,enumerable:false,configurable:true});
});

test('BroadcastChannel recipient snapshot excludes late channels and closed receivers',async t=>{
 const{page}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{const sender=new BroadcastChannel('late'),early=new BroadcastChannel('late'),closed=new BroadcastChannel('late');let closedGot=0;closed.onmessage=()=>closedGot++;closed.close();early.onmessage=()=>{early.close();const late=new BroadcastChannel('late');late.onmessage=e=>{resolve({data:e.data,closedGot});late.close();sender.close()};sender.postMessage('after')};sender.postMessage('before');early.postMessage('not-for-late')})`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{data:'after',closedGot:0});
});

test('cross-realm borrowed BroadcastChannel methods retain actual receiver branding and ownership',async t=>{
 const{page}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{const iframe=document.createElement('iframe');document.body.append(iframe);const child=iframe.contentWindow,receiver=new BroadcastChannel('borrow'),sender=new child.BroadcastChannel('borrow');receiver.onmessage=e=>{BroadcastChannel.prototype.close.call(sender);resolve({value:e.data,childName:Object.getOwnPropertyDescriptor(BroadcastChannel.prototype,'name').get.call(sender),closed:(()=>{try{BroadcastChannel.prototype.postMessage.call(sender,'closed');return false}catch(e){return e.name==='InvalidStateError'}})()});receiver.close();iframe.remove()};BroadcastChannel.prototype.postMessage.call(sender,'actual child channel')})`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{value:'actual child channel',childName:'borrow',closed:true});
});

test('BroadcastChannel shares same-origin BrowserContext pages while isolating names, origins, contexts and opaque documents',async t=>{
 const{browser,page,origins}=await fixture(t),peer=browser.createPage(),cross=browser.createPage(),isolated=browser.createPage(browser.createContext()),opaque1=browser.createPage(),opaque2=browser.createPage();
 await Promise.all([peer.navigate(origins[0]),cross.navigate(origins[1]),isolated.navigate(origins[0]),opaque1.navigate('data:text/html,<body>one'),opaque2.navigate('data:text/html,<body>two')]);
 for(const current of[peer,cross,isolated,opaque1,opaque2])current.evaluate("globalThis.received=[];globalThis.channel=new BroadcastChannel('partition');channel.onmessage=e=>received.push(e.data)");
 page.evaluate("globalThis.channel=new BroadcastChannel('partition');channel.postMessage('same-origin')");opaque1.evaluate("channel.postMessage('opaque')");await delay(50);
 assert.deepEqual([...peer.evaluate('received')],['same-origin']);for(const current of[cross,isolated,opaque1,opaque2])assert.deepEqual([...current.evaluate('received')],[]);
});

test('actual iframe channels and port transfers use the iframe realm; removal closes only locally owned channels',async t=>{
 const{page,window}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{const frame=document.createElement('iframe');document.body.append(frame);const child=frame.contentWindow;const bc=new BroadcastChannel('frames');child.eval("globalThis.channel=new BroadcastChannel('frames');channel.onmessage=e=>parent.postMessage({frameValue:e.data,frameRealm:e.data instanceof Object},'*');channel.postMessage('from-frame')");let gotFrame=false,gotPort=false;const complete=()=>{if(gotFrame&&gotPort){frame.remove();resolve({frameValue:gotFrame,portValue:gotPort});bc.close()}};bc.onmessage=e=>{bc.postMessage({hello:'to-frame'})};addEventListener('message',function receive(e){if(e.data?.frameValue){gotFrame=e.data.frameValue.hello+':'+e.data.frameRealm;complete()}else if(e.data?.port){const channel=e.data.port;channel.onmessage=message=>{gotPort=message.data;complete()};channel.postMessage('through iframe port')}});const pair=new MessageChannel();pair.port1.onmessage=e=>pair.port1.postMessage(e.data);child.postMessage({port:pair.port2},'*',[pair.port2]);child.addEventListener('message',e=>{if(e.data?.port)window.postMessage({port:e.data.port},'*',[e.data.port])})})`);
 assert.equal(result.frameValue,'to-frame:true');assert.equal(result.portValue,'through iframe port');
 assert.equal(installWindowMessaging(page,window,{entry:binding}).pending,0);
});

test('BroadcastChannel crosses real dedicated Worker threads in both directions with inherited origin/storage partition',async t=>{
 const{page,window}=await fixture(t);
 const result=await evaluate(page,`new Promise(resolve=>{const c=new BroadcastChannel('thread');const worker=new Worker(URL.createObjectURL(new Blob(["const c=new BroadcastChannel('thread');c.onmessage=e=>{postMessage({reply:e.data,origin:e.origin,realm:e.data instanceof Object});c.close();close()};postMessage({ready:true});c.postMessage({from:'worker'})"],{type:'text/javascript'})));let received,reply;const complete=()=>{if(received&&reply){resolve({received,reply});c.close();worker.terminate()}};c.onmessage=e=>{received={data:e.data,origin:e.origin,realm:e.data instanceof Object};complete()};worker.onmessage=e=>{if(e.data.ready)c.postMessage({from:'window'});else{reply=e.data;complete()}};worker.onerror=e=>{e.preventDefault();resolve({error:e.message})}})`);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{received:{data:{from:'worker'},origin:window.location.origin,realm:true},reply:{reply:{from:'window'},origin:window.location.origin,realm:true}});
});

test('navigation disposes native broadcasts and suppresses queued Window messages without retaining host tasks',async t=>{
 const{page,window}=await fixture(t);page.evaluate("globalThis.channel=new BroadcastChannel('dispose');globalThis.called=0;onmessage=()=>called++;postMessage('queued','*')");
 const controller=installBroadcast(page,window);assert.equal(controller.size,1);
 await page.navigate('data:text/html,<body>next');await delay(20);assert.equal(controller.size,0);assert.equal(window.called,0);
 assert.equal(installWindowMessaging(page,page.dom.window,{entry:binding}).pending,0);
});

test('native BroadcastChannels with listeners do not retain the host event loop',async()=>{
 const moduleURL=new URL('../src/window-messaging.js',import.meta.url).href;
 const source=`import{JSDOM}from'jsdom';import{installBroadcast}from${JSON.stringify(moduleURL)};const d=new JSDOM('',{runScripts:'outside-only',url:'https://broadcast.test'});installBroadcast({context:{},documentAbort:new AbortController()},d.window);const c=new d.window.BroadcastChannel('unref');c.onmessage=()=>{};console.log('broadcast unref complete')`;
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),timeout:4000});assert.match(result.stdout,/broadcast unref complete/);
});

const fixtureHashes={'message_channel.html':'1e4985864aa724bb7c83d641188164db8da58d45e0005062151123b8724b3223','broadcast_channel.html':'cfbabf0452b5c7b4d231ec64445cbd40e6cc8882533cd01a2d0dc48f9b68adbf','window/post_message.html':'9f46ce6487d23273155ba5f9b8ebe47d3c57785bd7cacf73e7b7c1cf9ce3abb9'};
for(const path of Object.keys(fixtureHashes))test(`unchanged upstream ${path} records nonzero native-branch assertions`,async t=>{
 const root=await upstreamTestRoot(),server=await startFixtureServer(root,{port:0,profile:'static'});t.after(()=>server.close());
 const browser=new Browser({userAgent:'Lightpanda/1.0'});t.after(()=>browser.close());const page=browser.createPage(),diagnostics=[];page.on('console',e=>{if(e.type==='error')diagnostics.push(e.args.map(String).join(' '))});page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});
 const source=await readFile(`${root}/${path}`);await page.navigate(`${server.origin}/src/browser/tests/${path}`);
 let passed=false,error;for(let i=0;i<80;i++){try{passed=page.evaluate('testing.assertOk()')===true;if(passed)break}catch(cause){error=cause;break}await delay(25)}
 assert.equal(page.evaluate('testing.IS_TEST_RUNNER'),true);assert.equal(passed,true,`${error?.message??'pending'} ${JSON.stringify(diagnostics)}`);
 assert.deepEqual(diagnostics,[]);assert.equal(createHash('sha256').update(source).digest('hex'),fixtureHashes[path]);
});
