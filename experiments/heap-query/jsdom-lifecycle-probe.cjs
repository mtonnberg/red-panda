const assert=require('node:assert/strict');
const vm=require('node:vm');
const {Session}=require('node:inspector');
const {JSDOM}=require('jsdom');
const query=require(process.argv[2]);
const iterations=Number(process.argv[3]||10);
(async()=>{
 const baseline=process.memoryUsage();const timings=[];
 for(let i=0;i<iterations;i++){
  const dom=new JSDOM('<title>owned heap query</title>',{runScripts:'outside-only'}),w=dom.window;
  const proto=w.eval(`globalThis.base={kind:'base'};globalThis.direct=Object.create(base);direct.kind='direct';globalThis.child=Object.create(base);child.kind='child';globalThis.indirect=Object.create(child);indirect.kind='indirect';globalThis.fake={};Object.defineProperty(fake,'__proto__',{value:base});base`);
  const start=Date.now();const matches=query.queryObjects(proto);timings.push(Date.now()-start);
  assert.ok(matches instanceof w.Array);assert.equal(matches.length,3);
  assert.deepEqual(Array.from(matches,x=>x.kind).sort(),['child','direct','indirect']);
  assert.ok(matches.includes(w.direct));assert.ok(!matches.includes(w.fake));
  matches.find(x=>x.kind==='direct').mutation=21;assert.equal(w.direct.mutation,21);
  const context=vm.createContext({foreignPrototype:proto});
  const foreign=vm.runInContext('globalThis.foreign=Object.create(foreignPrototype);foreign',context);
  const cross=query.queryObjects(proto);assert.ok(cross.includes(foreign));assert.equal(cross.length,4);
  const nullp=w.eval('Object.create(null)');assert.equal(query.queryObjects(nullp).length,0);
  assert.throws(()=>query.queryObjects(1),TypeError);
  assert.throws(()=>query.queryObjects(proto,1),/result limit/);
  assert.throws(()=>query.queryObjects(proto,100000,1),/node limit/);
  const inspector=new Session();inspector.connect();
  await new Promise((resolve,reject)=>inspector.post('Runtime.enable',{},e=>e?reject(e):resolve()));
  await new Promise((resolve,reject)=>inspector.post('Runtime.getHeapUsage',{},e=>e?reject(e):resolve()));
  inspector.disconnect();dom.window.close();
  if(global.gc)global.gc();
  await new Promise(resolve=>setImmediate(resolve));
 }
 console.log(JSON.stringify({node:process.version,v8:process.versions.v8,iterations,timings,baselineMemory:baseline,finalMemory:process.memoryUsage(),passed:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
