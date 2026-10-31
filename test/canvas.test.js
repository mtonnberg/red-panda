import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body></body>');return{browser,page,window:page.dom.window}}
const plain=v=>JSON.parse(JSON.stringify(v));
for(const file of['canvas-context-native','canvas-slots-native','canvas-conversion-native','canvas-extra-native','canvas-bitmap-native','canvas-async-native'])test(`real Native Canvas controls: ${file}`,async t=>{
 const{page}=await fixture(t),expression=await readFile(new URL(`../docs/reference/${file}-expression.js`,import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL(`../docs/reference/${file}.json`,import.meta.url),'utf8')).observations;
 const actual=plain(await page.evaluate(expression));
 // Native ignores a null transfer-list entry; established candidate transport
 // explicitly rejects nontransferables. Both raw outcomes are preserved.
 const skip=new Set(file==='canvas-bitmap-native'?['transfer']:[]);
 assert.deepEqual(actual.filter(v=>!skip.has(v.name)),expected.filter(v=>!skip.has(v.name)));
});

const fixtureHashes={'canvas/canvas_rendering_context_2d.html':'255c85f6026fbe04778f7fa754e785354a7dc2cb4ca7e7d0e02bbc32eb9ebf79','canvas/canvas_serialization.html':'c4439ae93104c9f578f8cdf70c7ede2d2358afa6d1ed7a8907377df3790f6c8d','canvas/offscreen_canvas.html':'40788c2460a3f08873d732ca66765b31e978b8b42d6d29fa944b7c8a73f31932','canvas/path2d.html':'5813f8c46cfa42c2d8d9aacc4646fead07f5440548994543260d111ba17ae67c'};
for(const[path,hash]of Object.entries(fixtureHashes))test(`unchanged native-positive Canvas fixture ${path}`,async t=>{
 const{upstreamTestRoot}=await import('./upstream-reference.js'),{startFixtureServer}=await import('../scripts/upstream-fixture-server.mjs'),{createHash}=await import('node:crypto');const root=await upstreamTestRoot(),source=await readFile(`${root}/${path}`);assert.equal(createHash('sha256').update(source).digest('hex'),hash);
 const server=await startFixtureServer(root,{port:0,profile:'static'});t.after(()=>server.close());const browser=new Browser({userAgent:'Lightpanda/1.0'});t.after(()=>browser.close());const page=browser.createPage(),errors=[];page.on('console',e=>{if(e.type==='error')errors.push(e.args.map(String).join(' '))});page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});await page.navigate(`${server.origin}/src/browser/tests/${path}`);let passed=false;for(let i=0;i<200;i++){passed=page.evaluate('testing.assertOk()')===true;if(passed)break;await new Promise(r=>setTimeout(r,25))}assert.equal(page.evaluate('testing.IS_TEST_RUNNER'),true);assert.equal(passed,true,JSON.stringify(errors));assert.deepEqual(errors,[]);
});

test('real private Canvas producers carry actual dimensions and independently copied transparent bytes; fakes have no authority',async t=>{
 const{page,window}=await fixture(t),{canvasSnapshot,canvasDimensions}=await import('../src/canvas.js');const html=window.document.createElement('canvas');html.width=3;html.height=2;const ctx=html.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,3,2);const image=new window.ImageData(1,1);image.data.set([1,2,3,4]);ctx.putImageData(image,0,0);
 for(const canvas of[html,new window.OffscreenCanvas(3,2)]){const a=canvasSnapshot(canvas),b=canvasSnapshot(canvas);assert.equal(a.width,3);assert.equal(a.height,2);assert.equal(a.bytes.length,24);assert.ok(a.bytes.every(v=>v===0));a.bytes[0]=99;assert.equal(b.bytes[0],0)}
 assert.equal(canvasSnapshot(Object.create(window.OffscreenCanvas.prototype)),null);assert.equal(canvasDimensions(Object.create(window.OffscreenCanvas.prototype)),null);const large=new window.OffscreenCanvas(100000,100000);assert.deepEqual(canvasDimensions(large),{width:100000,height:100000});assert.throws(()=>canvasSnapshot(large),RangeError);const fake=Object.create(window.HTMLCanvasElement.prototype,Object.getOwnPropertyDescriptors(html));assert.equal(canvasSnapshot(fake),null);assert.throws(()=>window.OffscreenCanvas.prototype.getContext.call({},'2d'),window.TypeError);
});

test('selected-realm Canvas public values and bytes survive authored internal array/global replacements',async t=>{
 const{page}=await fixture(t);const value=page.evaluate(`(()=>{const C=OffscreenCanvas,SavedArray=Array,oldPush=Array.prototype.push,oldSome=Array.prototype.some,oldIterator=Array.prototype[Symbol.iterator];const c=new C(2,2),x=c.getContext('2d');let hits=0;try{Object.defineProperty(Array.prototype,'0',{configurable:true,set(){hits++;throw Error('index')}});Array.prototype.push=Array.prototype.some=()=>{hits++;throw Error('private method')};const g=x.createLinearGradient(1,2,3,4);x.setLineDash(new Set([3]));const dash=x.getLineDash();Object.defineProperty(globalThis,'Object',{configurable:true,get(){hits++;throw Error('global')}});const m=x.measureText('ab');return{hits,width:m.width,gradient:g instanceof CanvasGradient,dash:dash instanceof SavedArray&&dash.length===2&&dash[0]===3}}finally{delete Array.prototype[0];Array.prototype.push=oldPush;Array.prototype.some=oldSome;Array.prototype[Symbol.iterator]=oldIterator}})()`);assert.deepEqual(plain(value),{hits:0,width:12,gradient:true,dash:true});
});

test('actual Canvas heap queries preserve public identities and omit mutable private context/path slots',async t=>{
 const{page,window}=await fixture(t),{queryHeapObjects}=await import('../src/heap-query.js');window.heapCanvas=new window.OffscreenCanvas(2,3);window.heapContext=window.heapCanvas.getContext('2d');window.heapPath=new window.Path2D('M0 0L1 1');const realm=page.dom.getInternalVMContext();
 for(const[name,value]of[['OffscreenCanvas',window.heapCanvas],['OffscreenCanvasRenderingContext2D',window.heapContext],['Path2D',window.heapPath]]){const list=queryHeapObjects(window[name].prototype,realm).objects;assert.ok(list.includes(value));assert.equal(Object.getPrototypeOf(list),window.Array.prototype)}
 const list=queryHeapObjects(window.Object.prototype,realm).objects;assert.equal(list.some(value=>Object.getOwnPropertyDescriptor(value,'owner')?.value===window.heapCanvas&&Object.hasOwn(value,'dash')),false);assert.equal(list.some(value=>Object.getOwnPropertyDescriptor(value,'source')?.value==='M0 0L1 1'),false);
});

test('genuine utility Canvas wrappers share actual backing state while ordinary JS expandos stay per-world',async t=>{
 const{serve}=await import('../src/cdp.js'),{connect}=await import('./cdp-client.js');const service=await serve({host:'127.0.0.1',port:0}),client=await connect(`ws://127.0.0.1:${service.port}/`);t.after(async()=>{await client.close();await service.close()});const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const send=(m,p)=>client.send(m,p,sessionId),evaluate=(expression,contextId)=>send('Runtime.evaluate',{expression,contextId,returnByValue:true});
 await evaluate("globalThis.crossCanvas=document.createElement('canvas');crossCanvas.id='cross-canvas';document.body.append(crossCanvas);globalThis.mainContext=crossCanvas.getContext('2d');mainContext.font='20px serif';mainContext.fillStyle='red';mainContext.setLineDash([3]);mainContext.lineWidth=4;");const{frameTree}=await send('Page.getFrameTree',{}),{executionContextId}=await send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'canvas-control'});
 const utilityExpression=await readFile(new URL('../docs/reference/canvas-utility-native-expression.js',import.meta.url),'utf8'),utilityExpected=JSON.parse(await readFile(new URL('../docs/reference/canvas-utility-native.json',import.meta.url),'utf8')).observations,utility=await evaluate(utilityExpression,executionContextId);assert.equal(utility.exceptionDetails,undefined);assert.deepEqual(utility.result.value,utilityExpected);
 const expression=await readFile(new URL('../docs/reference/canvas-cross-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/canvas-cross-after-native.json',import.meta.url),'utf8')).observations;
 const before=await evaluate(expression,executionContextId);assert.equal(before.exceptionDetails,undefined);assert.deepEqual(before.result.value,expected.before);const after=await evaluate('({font:mainContext.font,style:mainContext.fillStyle,dash:mainContext.getLineDash(),lineWidth:mainContext.lineWidth})');assert.deepEqual(after.result.value,expected.after);
});
