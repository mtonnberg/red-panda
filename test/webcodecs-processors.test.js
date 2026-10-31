import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
import {queryHeapObjects} from '../src/heap-query.js';
import {createFixture} from './fixture.js';

const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser({loadResources:['worker','iframe']});t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body>codecs</body>');return{browser,page,w:page.dom.window,context:page.dom.getInternalVMContext()}}
for(const group of['config','state','detail','options','bitrate','receiver','descriptor'])test('actual Native '+group+' controls match codec configuration/state behavior',async t=>{
 const {page}=await fixture(t),expression=await readFile(new URL('../oracle/webcodecs-codecs-'+group+'-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../oracle/webcodecs-codecs-native-'+group+'.json',import.meta.url),'utf8')).result.result.value;
 assert.deepEqual(plain(await page.evaluate(expression)),expected);
});

test('unsupported queued decode closes with real error before flush handlers and a trusted dequeue',async t=>{
 const {page}=await fixture(t);const value=await page.evaluate(`(async()=>{const events=[],d=new VideoDecoder({output(){events.push('unexpected output')},error:e=>events.push(['error',e.name,d.state])});d.ondequeue=e=>events.push(['dequeue',e.isTrusted,d.decodeQueueSize]);d.configure({codec:'vp8'});d.decode(new EncodedVideoChunk({type:'key',timestamp:0,data:new Uint8Array([1])}));const before=[d.state,d.decodeQueueSize];await d.flush().catch(e=>events.push(['flush',e.name]));await new Promise(r=>setTimeout(r,10));return{before,events,state:d.state}})()`);assert.deepEqual(plain(value),{before:['configured',1],events:[['error','NotSupportedError','closed'],['flush','NotSupportedError'],['dequeue',true,0]],state:'closed'});
});

test('reset and close cancel actual queued configuration, reject all owned flushes and preserve unrelated codecs',async t=>{
 const {page}=await fixture(t);const value=await page.evaluate(`(async()=>{const errors=[],a=new AudioEncoder({output(){},error:e=>errors.push('a:'+e.name)}),b=new VideoDecoder({output(){},error:e=>errors.push('b:'+e.name)});a.configure({codec:'opus',sampleRate:48000,numberOfChannels:2});b.configure({codec:'vp8'});const first=a.flush().catch(e=>e.name),second=a.flush().catch(e=>e.name),other=b.flush().catch(e=>e.name);a.reset();a.close();const outcomes=await Promise.all([first,second,other]);await new Promise(r=>setTimeout(r,10));return{outcomes,errors,a:a.state,b:b.state}})()`);assert.deepEqual(plain(value),{outcomes:['AbortError','AbortError','NotSupportedError'],errors:['b:NotSupportedError'],a:'closed',b:'closed'});
});

test('support queries copy actual description bytes, keep realm Promises and ignore unknown properties',async t=>{
 const {page}=await fixture(t);const value=await page.evaluate(`(async()=>{const bytes=new Uint8Array([3,4]),promise=VideoDecoder.isConfigSupported({codec:'vp8',description:bytes,get ignored(){throw Error('unknown field read')}});bytes.fill(0);const support=await promise;return{supported:support.supported,promise:promise instanceof Promise,object:Object.getPrototypeOf(support)===Object.prototype,config:Object.getPrototypeOf(support.config)===Object.prototype,buffer:support.config.description instanceof ArrayBuffer,bytes:[...new Uint8Array(support.config.description)]}})()`);assert.deepEqual(plain(value),{supported:false,promise:true,object:true,config:true,buffer:true,bytes:[3,4]});
});

test('real heap queries preserve authored lookalikes without private processor slots or normalized queue config',async t=>{
 const {page,w,context}=await fixture(t);await page.evaluate(`globalThis.authoredState={interface:'VideoDecoder',state:'configured',queueSize:1,work:[]};globalThis.config={codec:'private-queue-sentinel',flip:false,hardwareAcceleration:'no-preference',optimizeForLatency:false,rotation:0};globalThis.codec=new VideoDecoder({output(){},error(){}});true`);
 // Configure outside an await boundary so its actual queued task cannot finish
 // before the synchronous profiler walk.
 w.codec.configure(w.config);w.codec.decode(new w.EncodedVideoChunk({type:'key',timestamp:0,data:new w.Uint8Array([1])}));
 const values=queryHeapObjects(w.Object.prototype,context).objects,own=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
 assert.ok(values.includes(w.authoredState));assert.ok(values.includes(w.config));
 assert.deepEqual([...values.filter(value=>own(value,'interface')==='VideoDecoder'&&own(value,'work')&&own(value,'state')==='configured')],[w.authoredState]);
 assert.deepEqual([...values.filter(value=>own(value,'codec')==='private-queue-sentinel'&&own(value,'hardwareAcceleration')==='no-preference')],[w.config]);w.codec.close();
});

test('actual worker codec tasks produce state/error/dequeue events without invented output',async t=>{
 const {page}=await fixture(t);const value=await page.evaluate(`new Promise((resolve,reject)=>{const source='const errors=[];onmessage=async()=>{const events=[],c=new VideoDecoder({output(){events.push("unexpected output")},error:e=>events.push(["error",e.name,c.state])});c.ondequeue=e=>events.push(["dequeue",e.isTrusted,c.decodeQueueSize]);c.configure({codec:"vp8"});c.decode(new EncodedVideoChunk({type:"key",timestamp:0,data:new Uint8Array([1])}));await c.flush().catch(e=>events.push(["flush",e.name]));await new Promise(r=>setTimeout(r,10));postMessage({state:c.state,events,support:(await AudioEncoder.isConfigSupported({codec:"opus",sampleRate:48000,numberOfChannels:2})).supported})}';const url=URL.createObjectURL(new Blob([source])),worker=new Worker(url),timer=setTimeout(()=>{worker.terminate();reject(Error('worker deadline'))},5000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message))};worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);worker.terminate();URL.revokeObjectURL(url)};worker.postMessage('start')})`);assert.deepEqual(plain(value),{state:'closed',events:[['error','NotSupportedError','closed'],['flush','NotSupportedError'],['dequeue',true,0]],support:false});
});

test('throwing error callbacks report genuine Window errors after owned flush cancellation',async t=>{
 const {page}=await fixture(t);const value=await page.evaluate(`(async()=>{const events=[];addEventListener('error',e=>{if(e.message.includes('codec callback')){events.push(['window-error',e.error instanceof Error]);e.preventDefault()}});const c=new VideoDecoder({output(){},error(){events.push(['error']);throw Error('codec callback')}});c.configure({codec:'vp8'});await c.flush().catch(e=>events.push(['flush',e.name]));await new Promise(r=>setTimeout(r,10));return{events,state:c.state}})()`);assert.deepEqual(plain(value),{events:[['error'],['window-error',true],['flush','NotSupportedError']],state:'closed'});
});

for(const group of['realm','realm-errors'])test('borrowed codec '+group+' preserves actual Native Promise/error realms',async t=>{
 const {page}=await fixture(t),server=await createFixture();t.after(()=>server.close());await page.navigate(server.url+'next');const expression=await readFile(new URL('../oracle/webcodecs-codecs-'+group+'-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../oracle/webcodecs-codecs-native-'+group+'.json',import.meta.url),'utf8')).result.result.value;assert.deepEqual(plain(await page.evaluate(expression)),expected);
});
