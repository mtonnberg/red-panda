import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{Browser}from'../src/browser.js';
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(action){const browser=new Browser({timeout:3000}),page=browser.createPage();try{await page.navigate('data:text/html,<body>Audio waves');await action({page,w:page.dom.window});}finally{browser.close()}}
test('real Fourier/wavetable oscillator samples and metadata exactly match retained Native controls',()=>fixture(async({page})=>{
 const input=await readFile(new URL('../docs/reference/audio-waves/audio-waves-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-waves/audio-waves-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(plain(await page.evaluate(input)),expected);
}));
test('untouched pinned audio_graph fixture executes actual oscillator and automation assertions',async t=>{
 const{upstreamTestRoot}=await import('./upstream-reference.js'),{startFixtureServer}=await import('../scripts/upstream-fixture-server.mjs');const root=await upstreamTestRoot(),path='webaudio/audio_graph.html',source=await readFile(`${root}/${path}`);assert.equal(createHash('sha256').update(source).digest('hex'),'10b6ad114dbac171e38167a6a62c4cd55021e545e825bd4ba03a712206b53a64');const server=await startFixtureServer(root,{port:0,profile:'static'});t.after(()=>server.close());const browser=new Browser({userAgent:'Lightpanda/1.0'});t.after(()=>browser.close());const page=browser.createPage(),errors=[];page.on('console',e=>{if(e.type==='error')errors.push(e.args.map(String).join(' '))});page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});await page.navigate(`${server.origin}/src/browser/tests/${path}`);let passed=false;for(let i=0;i<200;i++){passed=page.evaluate('testing.assertOk()')===true;if(passed)break;await new Promise(r=>setTimeout(r,20))}assert.equal(page.evaluate('testing.IS_TEST_RUNNER'),true);assert.equal(passed,true,JSON.stringify(errors));assert.deepEqual(errors,[]);
});
test('Native coefficient ownership, conversions, private brands and suspended oscillator changes',()=>fixture(async({page})=>{
 const input=await readFile(new URL('../docs/reference/audio-waves/audio-waves-extra-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-waves/audio-waves-extra-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(plain(await page.evaluate(input)),expected);
}));
test('wave allocation/rendering captures intrinsics and cross-frame private brands remain genuine',()=>fixture(async({page})=>{
 const input=await readFile(new URL('../docs/reference/audio-waves/audio-waves-private-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-waves/audio-waves-private-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(plain(await page.evaluate(input)),expected);
}));
test('public oscillator/wave/parameter/sample values have actual selected VM creation contexts',()=>fixture(async({w})=>{
 const{getHeapBinding}=await import('../src/native-heap.js'),heap=getHeapBinding(),c=new w.OfflineAudioContext(1,4,8000),o=new w.OscillatorNode(c,{frequency:1000}),wave=new w.PeriodicWave(c),param=o.frequency,gain=c.createGain(),buffer=c.createBuffer(1,4,8000),source=c.createBufferSource();let complete,ended;c.oncomplete=e=>complete=e;o.onended=e=>ended=e;o.setPeriodicWave(wave);o.connect(c.destination);o.start();o.stop(4/8000);const output=(await c.startRendering()).getChannelData(0),anchor=w.Object.prototype,host={};
 for(const[name,value]of Object.entries({oscillator:o,context:c,gain,buffer,source,complete,ended,wave,param,output,waveFunction:w.PeriodicWave,oscillatorFunction:w.OscillatorNode,frequencyGetter:Object.getOwnPropertyDescriptor(w.OscillatorNode.prototype,'frequency').get})){assert.equal(heap.sameRealm(value,anchor),true,name);assert.equal(heap.sameRealm(value,host),false,name);assert.equal(heap.creationGlobal(value),heap.creationGlobal(anchor),name);Object.setPrototypeOf(value,null);assert.equal(heap.sameRealm(value,anchor),true,name);assert.equal(heap.sameRealm(value,host),false,name)}
}));
test('first getter chooses one genuine lazy AudioParam wrapper with stable identity and real state',()=>fixture(async({page})=>{
 const input=await readFile(new URL('../docs/reference/audio-waves/audio-param-views-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-waves/audio-param-views-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(plain(await page.evaluate(input)),expected);
}));
test('owned audio delivery uses captured genuine backends despite authored implementation getters',()=>fixture(async({w})=>{
 const c=new w.OfflineAudioContext(1,4,8000),o=new w.OscillatorNode(c,{frequency:1000});let hits=0,event;o.connect(c.destination);
 for(const value of[c,o])for(const key of Object.getOwnPropertySymbols(value))if(key.description==='impl')Object.defineProperty(value,key,{get(){hits++;throw Error('authored implementation')}});
 o.onended=e=>event=e;o.start();o.stop(4/8000);const buffer=await c.startRendering();assert.deepEqual([...buffer.getChannelData(0)],[0,Math.fround(Math.SQRT1_2),1,Math.fround(Math.SQRT1_2)]);assert.equal(event.isTrusted,true);assert.equal(event.target,o);assert.equal(hits,0);
}));
