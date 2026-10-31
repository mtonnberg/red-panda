import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Browser } from '../src/browser.js';
import { platformFactoryRecord, subscribePlatformFactories } from '../src/platform-factories.js';

async function fixture(t) { const browser = new Browser(); t.after(() => browser.close()); const page = browser.createPage(); await page.navigate('data:text/html,<body></body>'); return { browser, page, window: page.dom.window }; }
const plain = value => JSON.parse(JSON.stringify(value));
function deadline(promise) { return Promise.race([promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Geometry transport timed out')), 8000); timer.unref(); })]); }

test('all16 measured native ordinary/SVG producer clone outcomes match, including matrix rejection', async t => {
  const { page } = await fixture(t);
  const expression = await readFile(new URL('../docs/reference/svg-phase3-clone-native-expression.js', import.meta.url), 'utf8');
  const control = JSON.parse(await readFile(new URL('../docs/reference/svg-phase3-clone-native-observation.json', import.meta.url), 'utf8')).observations;
  // Source screenCTM offset is a separately retained layout diagnostic; this
  // test compares every measured clone result/error and resulting coordinates.
  const outcome = ({ before, ...clone }) => clone;
  assert.deepEqual(plain(page.evaluate(expression)).map(outcome), control.map(outcome));
});

test('private factory brands preserve raw point/rect coordinates, readonly variants, graph aliases and captured constructors', async t => {
  const { page } = await fixture(t);
  const result = page.evaluate(`(()=>{const P=DOMPoint,R=DOMRect,PR=DOMPointReadOnly,RR=DOMRectReadOnly,p=new P(1,2,NaN,-0),r=new R(3,4,Infinity,-0),ro=new PR(5,6),rr=new RR(7,8,9,10);let reads=0;for(const value of[p,r]){Object.defineProperty(value,'x',{get(){reads++;throw Error('authored x')}});Object.defineProperty(value,Symbol.toStringTag,{get(){reads++;throw Error('authored tag')}})}const source={p,r,ro,rr,again:p,map:new Map([[p,r]]),set:new Set([ro])};source.self=source;globalThis.DOMPoint=globalThis.DOMRect=globalThis.DOMPointReadOnly=globalThis.DOMRectReadOnly=function Authored(){throw Error('authored constructor')};const copy=structuredClone(source);return{reads,cycle:copy.self===copy,aliases:copy.again===copy.p&&copy.map.get(copy.p)===copy.r&&copy.set.has(copy.ro),brands:copy.p instanceof P&&copy.r instanceof R&&copy.ro instanceof PR&&!(copy.ro instanceof P)&&copy.rr instanceof RR&&!(copy.rr instanceof R),values:[copy.p.x,copy.p.y,copy.r.x,copy.r.y,copy.rr.width],special:Number.isNaN(copy.p.z)&&Object.is(copy.p.w,-0)&&copy.r.width===Infinity&&Object.is(copy.r.height,-0),readonly:Reflect.set(copy.ro,'x',42)===false&&Reflect.set(copy.rr,'x',42)===false}})()`);
  assert.deepEqual(plain(result), { reads:0, cycle:true, aliases:true, brands:true, values:[1,2,3,4,9], special:true, readonly:true });
});

test('authored implementation-symbol getters/copied data and DOM prototype lookalikes stay ordinary without getter calls', async t => {
  const { page } = await fixture(t);
  const result = page.evaluate(`(()=>{const blob=new Blob(['actual']),symbol=Object.getOwnPropertySymbols(blob).find(s=>s.description==='impl');let reads=0;const getter={user:3};Object.defineProperty(getter,symbol,{get(){reads++;throw Error('implementation getter')}});Object.defineProperty(getter,Symbol.toStringTag,{get(){reads++;throw Error('tag getter')}});const copied={user:4};Object.defineProperty(copied,symbol,{value:Object.getOwnPropertyDescriptor(blob,symbol).value});const values=[getter,copied,...[Blob,File,DOMPoint,DOMMatrix,DOMRect].map(C=>Object.assign(Object.create(C.prototype),{user:5}))];const copy=structuredClone(values);return{reads,users:copy.map(x=>x.user),plain:copy.every(x=>Object.getPrototypeOf(x)===Object.prototype),unbranded:copy.every(x=>!(x instanceof Blob)&&!(x instanceof DOMPoint)&&!(x instanceof DOMMatrix)&&!(x instanceof DOMRect))}})()`);
  assert.deepEqual(plain(result), { reads:0, users:[3,4,5,5,5,5,5], plain:true, unbranded:true });
});

test('genuine generated DOM rectangles allocated before geometry consumers remain privately registered without changing constructors', async t => {
  const { page, window } = await fixture(t);
  const element = window.document.createElement('div'); element.style.width = '17px'; element.style.height = '9px'; window.document.body.append(element);
  const box = element.getBoundingClientRect(), record = platformFactoryRecord(box);
  assert.equal(record.kind, 'DOMRect'); assert.ok(record.implementation); assert.ok(record.globalRef.deref());
  assert.ok(box instanceof window.DOMRect); const clone = window.structuredClone(box); assert.ok(clone instanceof window.DOMRect); assert.equal(clone.width, box.width);
  assert.throws(() => window.structuredClone(element), { name:'DataCloneError' });
  assert.equal(page.closed, false);
});

test('MessagePort carries geometry and immutable File bytes with actual aliases, ports and buffer detachment', async t => {
  const { page } = await fixture(t);
  const result = await deadline(page.evaluate(`new Promise(resolve=>{const pair=new MessageChannel(),inner=new MessageChannel(),buffer=new Uint8Array([2,3]),point=new DOMPoint(1,2),rect=new DOMRect(3,4,5,6),file=new File(['actual bytes'],'geometry.txt',{lastModified:123});const data={point,again:point,rect,file,port:inner.port2,buffer,map:new Map([[point,rect]])};data.self=data;pair.port2.onmessage=async event=>{resolve({brands:event.data.point instanceof DOMPoint&&event.data.rect instanceof DOMRect&&event.data.file instanceof File,values:[event.data.point.x,event.data.rect.width],aliases:event.data.again===event.data.point&&event.data.map.get(event.data.point)===event.data.rect&&event.data.self===event.data,text:await event.data.file.text(),file:event.data.file.name,port:event.ports[0]===event.data.port,detached:buffer.byteLength===0,bytes:[...event.data.buffer]});pair.port1.close();pair.port2.close();inner.port1.close();event.data.port.close()};pair.port1.postMessage(data,[inner.port2,buffer.buffer]);point.x=99})`));
  assert.deepEqual(plain(result), { brands:true, values:[1,5], aliases:true, text:'actual bytes', file:'geometry.txt', port:true, detached:true, bytes:[2,3] });
});

test('BroadcastChannel creates independent branded geometry and File objects at each actual recipient', async t => {
  const { page } = await fixture(t);
  const result = await deadline(page.evaluate(`new Promise(resolve=>{const a=new BroadcastChannel('geometry'),b=new BroadcastChannel('geometry'),sender=new BroadcastChannel('geometry');const values=[],objects=[];for(const c of[a,b])c.onmessage=async event=>{objects.push(event.data.point);values.push({point:event.data.point instanceof DOMPoint,rect:event.data.rect instanceof DOMRect,file:event.data.file instanceof File,alias:event.data.again===event.data.point,x:event.data.point.x,text:await event.data.file.text()});event.data.point.x=80;if(values.length===2){resolve({values,distinct:objects[0]!==objects[1]});a.close();b.close();sender.close()}};const point=new DOMPoint(7,8);sender.postMessage({point,again:point,rect:new DOMRect(1,2,3,4),file:new File(['broadcast bytes'],'actual.txt')})})`));
  assert.deepEqual(plain(result), { values:[0,1].map(() => ({ point:true, rect:true, file:true, alias:true, x:7, text:'broadcast bytes' })), distinct:true });
});

test('real workers clone points/rectangles both ways without losing Blob/File bytes or readonly subtype', async t => {
  const { page } = await fixture(t);
  const result = await deadline(page.evaluate(`new Promise(resolve=>{const worker=new Worker(URL.createObjectURL(new Blob(["onmessage=async e=>{const p=e.data.point,r=e.data.rect;const seen={point:p instanceof DOMPoint,rect:r instanceof DOMRectReadOnly,readonly:!(r instanceof DOMRect),text:await e.data.file.text(),x:p.x,width:r.width};const point=new DOMPoint(9,10),file=new File(['worker bytes'],'worker.txt');const local=structuredClone({point,rect:new DOMRectReadOnly(1,2,3,4)});seen.local=local.point instanceof DOMPoint&&local.rect instanceof DOMRectReadOnly;postMessage({point,again:point,rect:new DOMRectReadOnly(2,3,4,5),file,seen})}"],{type:'text/javascript'})));worker.onerror=e=>{e.preventDefault();resolve({error:e.message})};worker.onmessage=async e=>{resolve({point:e.data.point instanceof DOMPoint,rect:e.data.rect instanceof DOMRectReadOnly&&!(e.data.rect instanceof DOMRect),file:e.data.file instanceof File,text:await e.data.file.text(),alias:e.data.again===e.data.point,x:e.data.point.x,width:e.data.rect.width,seen:e.data.seen});worker.terminate()};worker.postMessage({point:new DOMPoint(5,6),rect:new DOMRectReadOnly(7,8,9,10),file:new File(['parent bytes'],'parent.txt')});})`));
  assert.deepEqual(plain(result), { point:true, rect:true, file:true, text:'worker bytes', alias:true, x:9, width:4, seen:{ point:true, rect:true, readonly:true, text:'parent bytes', x:5, width:9, local:true } });
});

test('matrix clone errors are atomic for actual transfers and do not consume a retryable MessagePort', async t => {
  const { page } = await fixture(t);
  const result = page.evaluate(`(()=>{const a=new MessageChannel(),inner=new MessageChannel(),buffer=new ArrayBuffer(4);let matrix,readonly,retry=false;try{a.port1.postMessage({matrix:new DOMMatrix(),port:inner.port2,buffer},[inner.port2,buffer])}catch(e){matrix=e.name}try{structuredClone(new DOMMatrixReadOnly())}catch(e){readonly=e.name}try{a.port1.postMessage({port:inner.port2},[inner.port2]);retry=true}catch{}a.port1.close();a.port2.close();inner.port1.close();return{matrix,readonly,retry,bytes:buffer.byteLength}})()`);
  assert.deepEqual(plain(result), { matrix:'DataCloneError', readonly:'DataCloneError', retry:true, bytes:4 });
});

test('factory subscriptions cannot make successful constructors fail or turn copied records into provenance', async t => {
  const { window } = await fixture(t), seen = [];
  const stopThrow = subscribePlatformFactories(() => { throw new Error('observer failure'); });
  const stop = subscribePlatformFactories((value, record) => seen.push([value, record]));
  try {
    const point = new window.DOMPoint(1, 2), rect = new window.DOMRect(1, 2, 3, 4), blob = new window.Blob(['real']);
    for (const [value, kind] of [[point, 'DOMPoint'], [rect, 'DOMRect'], [blob, 'Blob']]) {
      const record = platformFactoryRecord(value); assert.equal(record.kind, kind); assert.ok(record.globalRef.deref()); assert.ok(seen.some(([object, metadata]) => object === value && metadata === record));
      assert.equal(platformFactoryRecord({ ...record }), undefined);
    }
  } finally { stop(); stopThrow(); }
});

test('geometry clone reads captured private state despite authored WeakMap/Array prototype methods', async t => {
  const { page } = await fixture(t);
  const result = page.evaluate(`(()=>{const methods={get:WeakMap.prototype.get,set:WeakMap.prototype.set,has:WeakMap.prototype.has,iterator:Array.prototype[Symbol.iterator],every:Array.prototype.every};let reads=0;try{const fail=()=>{reads++;throw Error('authored private-state method')};WeakMap.prototype.get=WeakMap.prototype.set=WeakMap.prototype.has=fail;Array.prototype[Symbol.iterator]=Array.prototype.every=fail;const point=new DOMPoint(3,4),readonly=new DOMPointReadOnly(5,6),rect=new DOMRect(1,2,7,8),copy=structuredClone({point,readonly,rect});return{reads,x:copy.point.x,y:copy.readonly.y,width:copy.rect.width,point:copy.point instanceof DOMPoint,readonly:copy.readonly instanceof DOMPointReadOnly&&!(copy.readonly instanceof DOMPoint)}}finally{WeakMap.prototype.get=methods.get;WeakMap.prototype.set=methods.set;WeakMap.prototype.has=methods.has;Array.prototype[Symbol.iterator]=methods.iterator;Array.prototype.every=methods.every}})()`);
  assert.deepEqual(plain(result), { reads:0, x:3, y:6, width:7, point:true, readonly:true });
});

test('worker copied Node Blob/File handles never confer brands or invoke hidden-symbol getters', async t => {
  const { page } = await fixture(t);
  const result = await deadline(page.evaluate(`new Promise(resolve=>{const worker=new Worker(URL.createObjectURL(new Blob(["const blob=new Blob(['real']),file=new File(['file'],'real.txt'),copies=[];let reads=0;for(const value of[blob,file]){const fake=Object.create(Object.getPrototypeOf(value));for(const key of Reflect.ownKeys(value))Object.defineProperty(fake,key,Object.getOwnPropertyDescriptor(value,key));fake.user='actual';copies.push(fake)}const tricky=Object.create(Blob.prototype);tricky.user='getter';Object.defineProperty(tricky,Object.getOwnPropertySymbols(blob)[0],{get(){reads++;throw Error('hidden getter')}});copies.push(tricky);const cloned=structuredClone(copies);postMessage({reads,users:cloned.map(x=>x.user),plain:cloned.every(x=>Object.getPrototypeOf(x)===Object.prototype),unbranded:cloned.every(x=>!(x instanceof Blob)&&!(x instanceof File)),real:structuredClone(blob)instanceof Blob});"],{type:'text/javascript'})));worker.onmessage=e=>{resolve(e.data);worker.terminate()};worker.onerror=e=>{e.preventDefault();resolve({error:e.message})}})`));
  assert.deepEqual(plain(result), { reads:0, users:['actual','actual','getter'], plain:true, unbranded:true, real:true });
});

test('worker Blob slice, Request/Response readers and FormData normalization register their actual fresh results', async t => {
  const { page } = await fixture(t);
  const result = await deadline(page.evaluate(`new Promise(resolve=>{const worker=new Worker(URL.createObjectURL(new Blob(["(async()=>{class Derived extends Blob{};const source=new Derived(['source'],{type:'text/plain'}),slice=source.slice(1),response=await new Response('response').blob(),request=await new Request('https://example.test/',{method:'POST',body:'request'}).blob(),form=new FormData();form.append('file',new Blob(['form']),'actual.txt');const file=form.get('file'),parsed=await new Response(form).formData(),parsedFile=parsed.get('file');const copy=structuredClone({source,slice,response,request,file,parsedFile});postMessage({brands:copy.source instanceof Blob&&copy.slice instanceof Blob&&copy.response instanceof Blob&&copy.request instanceof Blob&&copy.file instanceof File&&copy.parsedFile instanceof File,plainBlob:!(copy.source instanceof Derived),texts:await Promise.all([copy.source.text(),copy.slice.text(),copy.response.text(),copy.request.text(),copy.file.text(),copy.parsedFile.text()]),names:[copy.file.name,copy.parsedFile.name]})})().catch(e=>postMessage({error:e.name,message:e.message}));"],{type:'text/javascript'})));worker.onmessage=e=>{resolve(e.data);worker.terminate()};worker.onerror=e=>{e.preventDefault();resolve({error:e.message})}})`));
  assert.deepEqual(plain(result), { brands:true, plainBlob:true, texts:['source','ource','response','request','form','form'], names:['actual.txt','actual.txt'] });
});


test('worker FormData later mutations do not authenticate earlier forged File handles', async t => {
 const {page}=await fixture(t);
 const result=await deadline(page.evaluate(`new Promise(resolve=>{const worker=new Worker(URL.createObjectURL(new Blob(["const real=new File(['real'],'actual.txt'),fake=Object.create(File.prototype);for(const key of Reflect.ownKeys(real))Object.defineProperty(fake,key,Object.getOwnPropertyDescriptor(real,key));fake.user='ordinary';const form=new FormData();form.append('fake',fake);form.append('real',new Blob(['actual']),'fresh.txt');form.set('text','later');const clone=structuredClone(fake),fresh=structuredClone(form.get('real'));postMessage({plain:Object.getPrototypeOf(clone)===Object.prototype,user:clone.user,unbranded:!(clone instanceof Blob)&&!(clone instanceof File),fresh:fresh instanceof File,name:fresh.name});"],{type:'text/javascript'})));worker.onmessage=e=>{resolve(e.data);worker.terminate()};worker.onerror=e=>{e.preventDefault();resolve({error:e.message})}})`));
 assert.deepEqual(plain(result),{plain:true,user:'ordinary',unbranded:true,fresh:true,name:'fresh.txt'});
});
