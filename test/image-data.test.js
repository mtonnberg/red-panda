import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
import {imageDataRecord,validImageDataRecord} from '../src/image-data.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body></body>');return{browser,page,window:page.dom.window}}
const plain=v=>JSON.parse(JSON.stringify(v));
for(const file of['image-data-native','image-data-deep-v2-native','image-data-conversion-native'])test(`actual ImageData measured Native controls: ${file}`,async t=>{
 const{page}=await fixture(t),expression=await readFile(new URL(`../docs/reference/${file}-expression.js`,import.meta.url),'utf8');
 const expected=JSON.parse(await readFile(new URL(`../docs/reference/${file}.json`,import.meta.url),'utf8')).observations;
 const actual=plain(await page.evaluate(expression));
 // Native structuredClone does not detach ArrayBuffers; this backend's actual
 // transfer detaches them. Keep that known transport divergence outside value
 // constructor/metadata assertions instead of manufacturing attached buffers.
 const exclude=new Set(['detached','dataByteTransfer']);
 assert.deepEqual(actual.filter(row=>!exclude.has(row.name)),expected.filter(row=>!exclude.has(row.name)));
});

test('private ImageData factory records hold genuine clamped bytes and reject copied descriptors/prototype lookalikes',async t=>{
 const{window}=await fixture(t);const image=new window.ImageData(2,1);image.data.set([7,8,9,10]);const record=imageDataRecord(image);
 assert.equal(platformFactoryRecord(image).kind,'ImageData');assert.equal(validImageDataRecord(record),true);assert.deepEqual([...record.bytes],[7,8,9,10,0,0,0,0]);
 const fake=Object.create(window.ImageData.prototype,Object.getOwnPropertyDescriptors(image));assert.equal(imageDataRecord(fake),null);assert.equal(platformFactoryRecord(fake),undefined);
 image.data[0]=99;assert.equal(record.bytes[0],7);const clone=window.structuredClone(image);assert.ok(clone instanceof window.ImageData);assert.equal(clone.data[0],99);
});

test('ImageData uses captured real typed-array slots and constructors without authored getter or constructor calls',async t=>{
 const{page}=await fixture(t);const actual=page.evaluate(`(()=>{const Image=ImageData,C=Uint8ClampedArray,data=new C(4);let calls=0;for(const key of['length','byteLength','buffer'])Object.defineProperty(data,key,{get(){calls++;throw Error('authored')}});globalThis.ImageData=globalThis.Uint8ClampedArray=function(){throw Error('authored constructor')};const image=new Image(data,1),clone=structuredClone(image);return{calls,same:image.data===data,brand:clone instanceof Image,array:clone.data instanceof C,width:clone.width,height:clone.height,byte:clone.data[0]}})()`);
 assert.deepEqual(plain(actual),{calls:0,same:true,brand:true,array:true,width:1,height:1,byte:0});
});

test('ImageData structured clone isolates backing bytes while preserving graph aliases and actual buffer transfers',async t=>{
 const{page}=await fixture(t);const actual=page.evaluate(`(()=>{const image=new ImageData(1,1),data=image.data;data.set([1,2,3,4]);const graph={image,again:image,data,buffer:data.buffer};graph.self=graph;const c=structuredClone(graph,{transfer:[data.buffer]});return{cycle:c.self===c,alias:c.image===c.again,brand:c.image instanceof ImageData,imageBytes:[...c.image.data],dataBytes:[...c.data],bufferAlias:c.data.buffer===c.buffer,separate:c.image.data.buffer!==c.buffer,detached:data.byteLength===0}})()`);
 assert.deepEqual(plain(actual),{cycle:true,alias:true,brand:true,imageBytes:[1,2,3,4],dataBytes:[1,2,3,4],bufferAlias:true,separate:true,detached:true});
});

test('ImageData crosses actual ports and BroadcastChannel as independent receiver values alongside real Files',async t=>{
 const{page}=await fixture(t);const actual=await page.evaluate(`new Promise(resolve=>{const image=new ImageData(1,1);image.data.set([9,8,7,6]);const pair=new MessageChannel();pair.port2.onmessage=async e=>{const p=e.data.image;const name='image-'+Math.random(),a=new BroadcastChannel(name),b=new BroadcastChannel(name);b.onmessage=async event=>{const q=event.data.image;resolve({port:p instanceof ImageData,portArray:p.data instanceof Uint8ClampedArray,portAlias:e.data.again===p,bc:q instanceof ImageData,bytes:[...q.data],different:q!==p,file:await event.data.file.text()});a.close();b.close();pair.port1.close();pair.port2.close()};a.postMessage({image:p,file:e.data.file})};pair.port1.postMessage({image,again:image,file:new File(['bytes'],'image.txt')})})`);
 assert.deepEqual(plain(actual),{port:true,portArray:true,portAlias:true,bc:true,bytes:[9,8,7,6],different:true,file:'bytes'});
});

test('actual worker ImageData values preserve bytes, aliases and independent clamped-array realms in both directions',async t=>{
 const{page}=await fixture(t);const actual=await page.evaluate(`new Promise(resolve=>{const worker=new Worker(URL.createObjectURL(new Blob(["onmessage=e=>{const image=e.data.image,local=new ImageData(1,1);local.data.set([5,6,7,8]);postMessage({local,again:local,seen:{brand:image instanceof ImageData,array:image.data instanceof Uint8ClampedArray,bytes:[...image.data],alias:e.data.again===image}})}"],{type:'text/javascript'})));worker.onerror=e=>{e.preventDefault();resolve({error:e.message})};worker.onmessage=e=>{resolve({brand:e.data.local instanceof ImageData,array:e.data.local.data instanceof Uint8ClampedArray,bytes:[...e.data.local.data],alias:e.data.local===e.data.again,seen:e.data.seen});worker.terminate()};const image=new ImageData(1,1);image.data.set([1,2,3,4]);worker.postMessage({image,again:image})})`);
 assert.deepEqual(plain(actual),{brand:true,array:true,bytes:[5,6,7,8],alias:true,seen:{brand:true,array:true,bytes:[1,2,3,4],alias:true}});
});

test('real child-frame ImageData owns selected realm arrays while foreign constructor input retains original identity',async t=>{
 const{page}=await fixture(t);const actual=page.evaluate(`(()=>{const f=document.createElement('iframe');document.body.append(f);const w=f.contentWindow,image=new w.ImageData(1,1),foreign=new ImageData(image.data,1);const c=structuredClone(image);return{child:image instanceof w.ImageData,childArray:image.data instanceof w.Uint8ClampedArray,notMain:!(image instanceof ImageData),foreignSame:foreign.data===image.data,cloneMain:c instanceof ImageData&&c.data instanceof Uint8ClampedArray}})()`);
 assert.deepEqual(plain(actual),{child:true,childArray:true,notMain:true,foreignSame:true,cloneMain:true});
});

test('ImageData allocation bounds and failed clone remain explicit and atomic for transferables',async t=>{
 const{page}=await fixture(t);const actual=page.evaluate(`(()=>{let bound;try{new ImageData(10000,10000)}catch(e){bound=e.name}const image=new ImageData(1,1),buffer=new ArrayBuffer(4);let error;try{structuredClone({image,callback(){}},{transfer:[buffer]})}catch(e){error=e.name}return{bound,error,attached:buffer.byteLength===4}})()`);
 assert.deepEqual(plain(actual),{bound:'RangeError',error:'DataCloneError',attached:true});
});

test('actual utility ImageData compiles in selected VM and preserves foreign authored values without alias globals',async t=>{
 const{serve}=await import('../src/cdp.js'),{connect}=await import('./cdp-client.js');const service=await serve({host:'127.0.0.1',port:0}),client=await connect(`ws://127.0.0.1:${service.port}/`);t.after(async()=>{await client.close();await service.close()});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(m,p)=>client.send(m,p,sessionId);
 const{frameTree}=await send('Page.getFrameTree',{}),{executionContextId}=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'image-data-control'});
 const expression=await readFile(new URL('../docs/reference/image-data-utility-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/image-data-utility-native.json',import.meta.url),'utf8')).observations;
 const value=await send('Runtime.evaluate',{expression,contextId:executionContextId,returnByValue:true});assert.equal(value.exceptionDetails,undefined);assert.deepEqual(value.result.value,expected);
 await send('Runtime.evaluate',{contextId:executionContextId,expression:"document.addEventListener('image-value',e=>{globalThis.foreignResult={foreign:!(e.detail instanceof ImageData),arrayForeign:!(e.detail.data instanceof Uint8ClampedArray),identity:new ImageData(e.detail.data,1).data===e.detail.data}})"});
 await send('Runtime.evaluate',{expression:"document.dispatchEvent(new CustomEvent('image-value',{detail:new ImageData(1,1)}))"});
 const foreign=await send('Runtime.evaluate',{contextId:executionContextId,expression:'foreignResult',returnByValue:true});assert.deepEqual(foreign.result.value,{foreign:true,arrayForeign:true,identity:true});
});

test('unchanged pinned image_data.html fixture runs nonzero native-branch assertions',async t=>{
 const{upstreamTestRoot}=await import('./upstream-reference.js'),{startFixtureServer}=await import('../scripts/upstream-fixture-server.mjs'),{createHash}=await import('node:crypto');
 const root=await upstreamTestRoot(),source=await readFile(`${root}/image_data.html`);assert.equal(createHash('sha256').update(source).digest('hex'),'ba24860cd7d51cae38bbf8f2d10cec27d8be02b4437ea71a6057b78adb277526');
 const server=await startFixtureServer(root,{port:0,profile:'static'});t.after(()=>server.close());const browser=new Browser({userAgent:'Lightpanda/1.0'});t.after(()=>browser.close());const page=browser.createPage(),errors=[];page.on('console',e=>{if(e.type==='error')errors.push(e.args.map(String).join(' '))});page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});
 await page.navigate(`${server.origin}/src/browser/tests/image_data.html`);assert.equal(page.evaluate('testing.IS_TEST_RUNNER'),true);assert.equal(page.evaluate('testing.assertOk()'),true,JSON.stringify(errors));assert.deepEqual(errors,[]);
});

test('actual heap queries return real ImageData identities without exposing mutable private slot records',async t=>{
 const{page,window}=await fixture(t);window.imageForHeap=new window.ImageData(1,1);const {queryHeapObjects}=await import('../src/heap-query.js'),context=page.dom.getInternalVMContext();
 const images=queryHeapObjects(window.ImageData.prototype,context).objects;assert.ok(images.includes(window.imageForHeap));assert.equal(Object.getPrototypeOf(images),window.Array.prototype);
 const objects=queryHeapObjects(window.Object.prototype,context).objects;
 const slots=objects.filter(value=>{const w=Object.getOwnPropertyDescriptor(value,'width'),h=Object.getOwnPropertyDescriptor(value,'height'),d=Object.getOwnPropertyDescriptor(value,'data');return w?.value===1&&h?.value===1&&d?.value===window.imageForHeap.data});
 assert.equal(slots.length,0,'Host-private slots must not become public VM objects through Runtime.queryObjects');
});
