import './integration.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Blob as NativeBlob,File as NativeFile} from 'node:buffer';
import {setTimeout as delay} from 'node:timers/promises';
import {MessageChannel as NativeChannel,Worker as ThreadWorker} from 'node:worker_threads';
const{Browser}=await import('../../src/browser.js');
const{installMessaging}=await import('../../src/messaging.js');
const{broadcastConfig,installBroadcast}=await import('./messaging.mjs');
const{createBroadcastRealm,createBroadcastRelay}=await import('./broadcast-realm.mjs');

async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body></body>');return{browser,page,window:page.dom.window,bridge:installMessaging(page,page.dom.window)}}
function deadline(promise){return Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Platform codec fixture timed out')),5000);timer.unref()})])}
const result=value=>JSON.parse(JSON.stringify(value));

test('synchronous Window structuredClone preserves actual Blob/File bytes, private metadata, cycles and aliases',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`(async()=>{const bytes=new Uint8Array([0,3,255]),blob=new Blob(['plain'],{type:'text/plain'}),file=new File([bytes],'original.bin',{type:'application/octet-stream',lastModified:1234});Object.defineProperty(file,'name',{get(){throw new Error('authored name getter')}});Object.defineProperty(file,'type',{get(){throw new Error('authored type getter')}});const source={blob,file,again:file,list:[blob],map:new Map([[file,blob]]),set:new Set([file]),authored:{kind:'File',name:'not-platform',bytes:[1,2]}};source.self=source;const copy=structuredClone(source);return{cycle:copy.self===copy,aliases:copy.again===copy.file&&copy.list[0]===copy.blob&&copy.map.get(copy.file)===copy.blob&&copy.set.has(copy.file),newObjects:copy.blob!==blob&&copy.file!==file,brands:copy.blob instanceof Blob&&copy.file instanceof File&&copy.file instanceof Blob,blob:{text:await copy.blob.text(),type:copy.blob.type,size:copy.blob.size},file:{bytes:[...new Uint8Array(await copy.file.arrayBuffer())],type:copy.file.type,size:copy.file.size,name:copy.file.name,lastModified:copy.file.lastModified},authoredPlain:!(copy.authored instanceof File)&&copy.authored.kind==='File',keys:Object.keys(copy.file)}})()`));
 assert.deepEqual(result(value),{cycle:true,aliases:true,newObjects:true,brands:true,blob:{text:'plain',type:'text/plain',size:5},file:{bytes:[0,3,255],type:'application/octet-stream',size:3,name:'original.bin',lastModified:1234},authoredPlain:true,keys:[]});
});

test('real MessagePort transport preserves Blob/File graph nodes alongside actual transferred ports and buffers',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`new Promise(resolve=>{const carrier=new MessageChannel(),inner=new MessageChannel(),buffer=new Uint8Array([9,8,7]);const file=new File(['contents'],'port.txt',{type:'text/plain',lastModified:456}),payload={file,again:file,port:inner.port2,buffer};payload.self=payload;carrier.port2.onmessage=async event=>{inner.port1.onmessage=reply=>{resolve({bytes:event.data.buffer.length,detached:buffer.byteLength===0,portIdentity:event.ports[0]===event.data.port,cycle:event.data.self===event.data,alias:event.data.again===event.data.file,brand:event.data.file instanceof File,name:event.data.file.name,modified:event.data.file.lastModified,text:reply.data});carrier.port1.close();carrier.port2.close();inner.port1.close();event.data.port.close()};event.data.port.postMessage(await event.data.file.text())};carrier.port1.postMessage(payload,[inner.port2,buffer.buffer])})`));
 assert.deepEqual(result(value),{bytes:3,detached:true,portIdentity:true,cycle:true,alias:true,brand:true,name:'port.txt',modified:456,text:'contents'});
});

test('Window delivery preserves real File nodes and native-observed buffer behavior while transferring an entangled port',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`new Promise(resolve=>{const channel=new MessageChannel(),file=new File(['window-file'],'window.txt',{lastModified:10}),buffer=new Uint8Array([4]);addEventListener('message',async function receive(event){removeEventListener('message',receive);channel.port1.onmessage=e=>{resolve({name:event.data.file.name,text:e.data,brand:event.data.file instanceof File,alias:event.data.again===event.data.file,source:event.source===window,portIdentity:event.ports[0]===event.data.port,originalBufferAttached:buffer.byteLength===1});channel.port1.close();event.data.port.close()};event.data.port.postMessage(await event.data.file.text())});postMessage({file,again:file,port:channel.port2,buffer},'*',[channel.port2,buffer.buffer])})`));
 assert.deepEqual(result(value),{name:'window.txt',text:'window-file',brand:true,alias:true,source:true,portIdentity:true,originalBufferAttached:true});
});

test('native Window argument and received-port arrays do not execute authored numeric prototype setters',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`new Promise(resolve=>{let calls=0;const pair=new MessageChannel();Object.defineProperty(Array.prototype,'0',{configurable:true,set(){calls++}});addEventListener('message',function receive(e){removeEventListener('message',receive);const captured=calls;delete Array.prototype[0];resolve({calls:captured,identity:e.ports[0]===e.data.port,realm:e.ports instanceof Array,frozen:Object.isFrozen(e.ports)});pair.port1.close();e.data.port.close()});postMessage({port:pair.port2},'*',[pair.port2])})`));
 assert.deepEqual(result(value),{calls:0,identity:true,realm:true,frozen:true});
});

test('BroadcastChannel recipients independently receive actual File brands, byte snapshots and shared graph aliases',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`new Promise(resolve=>{const sender=new BroadcastChannel('file'),a=new BroadcastChannel('file'),b=new BroadcastChannel('file'),file=new File(['broadcast'],'broadcast.txt',{lastModified:789});let first,second,firstObject;const finish=()=>{if(first&&second){resolve({first,second,distinct:firstObject!==second.object,senderName:file.name});sender.close();a.close();b.close()}};a.onmessage=async e=>{firstObject=e.data.file;Object.defineProperty(e.data.file,'authored',{value:true});first={brand:e.data.file instanceof File,text:await e.data.file.text(),name:e.data.file.name,alias:e.data.file===e.data.again};finish()};b.onmessage=async e=>{second={object:e.data.file,brand:e.data.file instanceof File,text:await e.data.file.text(),modified:e.data.file.lastModified,isolated:!Object.hasOwn(e.data.file,'authored')};finish()};sender.postMessage({file,again:file})})`));
 assert.deepEqual(result(value),{first:{brand:true,text:'broadcast',name:'broadcast.txt',alias:true},second:{object:{},brand:true,text:'broadcast',modified:789,isolated:true},distinct:true,senderName:'broadcast.txt'});
});

test('real workers clone actual Node/DOM File and Blob values in both directions with metadata, aliases and transfer interactions',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`new Promise(resolve=>{const worker=new Worker(URL.createObjectURL(new Blob([
  "onmessage=async e=>{const seen={brand:e.data.file instanceof File,blob:e.data.blob instanceof Blob,name:e.data.file.name,modified:e.data.file.lastModified,text:await e.data.file.text(),alias:e.data.again===e.data.file};const file=new File([new Uint8Array([1,0,255])],'worker.bin',{type:'application/octet-stream',lastModified:321}),blob=new Blob(['node-blob'],{type:'text/plain'}),pair=new MessageChannel(),buffer=new Uint8Array([6,5]);const localClone=structuredClone({file,again:file,blob});seen.localClone=localClone.file instanceof File&&localClone.file!==file&&localClone.again===localClone.file&&localClone.blob instanceof Blob;pair.port1.onmessage=e=>pair.port1.postMessage(e.data);postMessage({kind:'file',file,again:file,blob,map:new Map([[file,blob]]),port:pair.port2,buffer,seen},[pair.port2,buffer.buffer]);postMessage({kind:'later',detached:buffer.byteLength===0})}"
 ],{type:'text/javascript'})));const order=[];let details,later,echo;const finish=()=>{if(details&&later&&echo){resolve({order,details,later,echo});worker.terminate()}};worker.onmessage=async e=>{order.push(e.data.kind);if(e.data.kind==='later'){later=e.data;finish();return}const file=e.data.file;details={brand:file instanceof File,blob:e.data.blob instanceof Blob,name:file.name,type:file.type,modified:file.lastModified,bytes:[...new Uint8Array(await file.arrayBuffer())],blobText:await e.data.blob.text(),alias:e.data.again===file&&e.data.map.get(file)===e.data.blob,portIdentity:e.ports[0]===e.data.port,buffer:[...e.data.buffer],seen:e.data.seen};e.data.port.onmessage=e=>{echo=e.data;finish()};e.data.port.postMessage('codec plus native port');finish()};worker.onerror=e=>{e.preventDefault();resolve({error:e.message})};const file=new File(['parent-file'],'parent.txt',{lastModified:222}),blob=new Blob(['parent-blob']);worker.postMessage({file,again:file,blob})})`));
 assert.deepEqual(result(value),{order:['file','later'],details:{brand:true,blob:true,name:'worker.bin',type:'application/octet-stream',modified:321,bytes:[1,0,255],blobText:'node-blob',alias:true,portIdentity:true,buffer:[6,5],seen:{brand:true,blob:true,name:'parent.txt',modified:222,text:'parent-file',alias:true,localClone:true}},later:{kind:'later',detached:true},echo:'codec plus native port'});
});

test('native Blob/File hydration preserves ordered delivery and suppresses disposed targets without authored markers',async t=>{
 const{page,window,bridge}=await fixture(t),native=new NativeFile(['host-native'],'native.txt',{lastModified:444,type:'text/plain'});
 const encode=data=>{const prepared=bridge.prepare(data);const envelope=structuredClone(prepared.message,{transfer:prepared.transfer});prepared.commit();return envelope};
 const received=[],target=new window.EventTarget();
 const first=bridge.deliver(target,encode({file:native,again:native}),data=>received.push(data));bridge.deliver(target,encode('after'),data=>received.push(data));await first;await delay(0);
 assert.equal(received.length,2);assert.ok(received[0].data.file instanceof window.File);assert.equal(received[0].data.file,received[0].data.again);assert.equal(received[0].data.file.name,'native.txt');assert.equal(await received[0].data.file.text(),'host-native');assert.equal(received[1].data,'after');
 const pending=bridge.deliver(new window.EventTarget(),encode(new NativeBlob(['cancelled'])),()=>received.push('should not dispatch'));queueMicrotask(()=>page.documentAbort.abort());await pending;assert.equal(received.length,2);
});

test('native BC reservation fixes recipient snapshots/FIFO while a real parent-port clone outlives sender close',async t=>{
 const{page,window,bridge}=await fixture(t),config=broadcastConfig(page,window),relay=createBroadcastRelay(bridge,config),ports=new NativeChannel(),messages=[];
 t.after(()=>{ports.port1.close();ports.port2.close()});
 ports.port2.on('message',message=>{if(message.kind==='broadcastRelay'){relay.accept(message);messages.push(message)}else if(message.kind==='broadcastReady')messages.push(message)});
 const sourceRealm=createBroadcastRealm(window,{messaging:bridge,config,relay:message=>ports.port1.postMessage(message)});t.after(()=>sourceRealm.dispose());
 const sender=new sourceRealm.BroadcastChannel('reserved'),early=new window.BroadcastChannel('reserved'),closed=new window.BroadcastChannel('reserved'),events=[];let lateEvents=0,closedEvents=0;
 const received=new Promise(resolve=>{early.onmessage=async event=>{events.push(event.data.kind);if(event.data.kind==='file')assert.equal(await event.data.file.text(),'reserved bytes');if(events.length===2)resolve()}});
 closed.onmessage=()=>closedEvents++;
 sender.postMessage({kind:'file',file:new NativeFile(['reserved bytes'],'reserved.txt')});sender.postMessage({kind:'after'});sender.close();
 const controller=installBroadcast(page,window);
 for(let i=0;i<100&&(messages.length<2||controller.pending<2);i++)await delay(2);
 assert.equal(messages.length,2);assert.equal(events.length,0);assert.ok(controller.pending>=2);
 const late=new window.BroadcastChannel('reserved');late.onmessage=()=>lateEvents++;closed.close();
 relay.ready(messages.find(message=>message.kind==='broadcastReady').id);await deadline(received);await delay(20);
 assert.deepEqual(events,['file','after']);assert.equal(lateEvents,0);assert.equal(closedEvents,0);assert.equal(controller.pending,0);early.close();late.close();
});

test('multiple Window receivers get actual Worker File bytes in FIFO even when the Worker is terminated immediately',async t=>{
 const{page}=await fixture(t);
 const value=await deadline(page.evaluate(`new Promise(resolve=>{const a=new BroadcastChannel('worker-file'),b=new BroadcastChannel('worker-file'),worker=new Worker(URL.createObjectURL(new Blob(["const c=new BroadcastChannel('worker-file');const file=new File(['worker broadcast bytes'],'worker-broadcast.txt',{type:'text/plain',lastModified:999});c.postMessage({kind:'file',file,again:file});c.postMessage({kind:'after'});postMessage('posted');while(true){}"],{type:'text/javascript'})));const orders=[[],[]],files=[];let stopped=false;const finish=()=>{if(files.length===2&&orders.every(order=>order.length===2)&&stopped){resolve({orders,files,stopped});a.close();b.close()}};[a,b].forEach((c,index)=>c.onmessage=async e=>{orders[index].push(e.data.kind);if(e.data.kind==='file')files.push({brand:e.data.file instanceof File,text:await e.data.file.text(),name:e.data.file.name,mtime:e.data.file.lastModified,alias:e.data.file===e.data.again});finish()});worker.onmessage=()=>{worker.terminate();stopped=true;finish()};worker.onerror=e=>{e.preventDefault();resolve({error:e.message})}})`));
 assert.deepEqual(result(value),{orders:[['file','after'],['file','after']],files:[{brand:true,text:'worker broadcast bytes',name:'worker-broadcast.txt',mtime:999,alias:true},{brand:true,text:'worker broadcast bytes',name:'worker-broadcast.txt',mtime:999,alias:true}],stopped:true});
});

test('physical thread termination between actual reservation and ready still flushes the parent-owned immutable clone',async t=>{
 const{page,window,bridge}=await fixture(t),config=broadcastConfig(page,window),relay=createBroadcastRelay(bridge,config),receivers=[new window.BroadcastChannel('terminated'),new window.BroadcastChannel('terminated')];let reachedGap=false;
 const results=receivers.map(channel=>new Promise(resolve=>{channel.onmessage=async event=>{resolve({text:await event.data.file.text(),name:event.data.file.name,mtime:event.data.file.lastModified,brand:event.data.file instanceof window.File,alias:event.data.file===event.data.again});channel.close()}}));
 const thread=new ThreadWorker(new URL('./critical-relay-worker.mjs',import.meta.url),{execArgv:['--import',new URL('./frozen-base.mjs',import.meta.url).href,'--import',new URL('./integration.mjs',import.meta.url).href],workerData:{config,name:'terminated',gate:new SharedArrayBuffer(4)}});
 t.after(()=>thread.terminate());
 thread.on('message',message=>{if(message.kind==='broadcastRelay')relay.accept(message);else if(message.kind==='broadcastReady')relay.ready(message.id);else if(message.kind==='atReady'){reachedGap=true;void thread.terminate()}});
 thread.on('exit',()=>relay.exit());
 const received=await deadline(Promise.all(results));assert.equal(reachedGap,true);assert.deepEqual(received,[0,1].map(()=>({text:'survives physical thread termination',name:'terminated.txt',mtime:654,brand:true,alias:true})));assert.equal(relay.size,0);
});

test('platform clone errors remain atomic, native SAB rejects and authored graph-node-shaped objects stay ordinary',async t=>{
 const{page,window,bridge}=await fixture(t);
 const value=page.evaluate(`(()=>{const carrier=new MessageChannel(),inner=new MessageChannel(),buffer=new ArrayBuffer(2),file=new File(['real'],'real.txt');let error;try{carrier.port1.postMessage({file,fn(){}},[inner.port2,buffer])}catch(e){error=e.name}const plain=structuredClone({kind:'File',name:'authored',lastModified:1,blob:{kind:'Blob'},bytes:[1,2]});let retry;try{carrier.port1.postMessage({port:inner.port2},[inner.port2]);retry=true}catch{retry=false}return{error,bufferBytes:buffer.byteLength,retry,plain:!(plain instanceof File)&&plain.kind==='File'&&!(plain.blob instanceof Blob)}})()`);
 assert.deepEqual(result(value),{error:'DataCloneError',bufferBytes:2,retry:true,plain:true});
 assert.throws(()=>bridge.clone(new NativeBlob(['async host backing in synchronous DOM clone'])),{name:'DataCloneError'});
 assert.throws(()=>window.structuredClone(new SharedArrayBuffer(1)),{name:'DataCloneError'});
});
