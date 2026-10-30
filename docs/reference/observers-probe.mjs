// Public-API observations of the verified external browser; no engine source.
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const binary=process.argv[2]??'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const browser=await startReference(binary);let client;
try {
  client=await connect(browser.endpoint);
  const target=await client.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await client.send('Page.navigate',{url:'data:text/html,<div id="t" style="width:100px;height:60px;padding:10px;border:2px solid"></div>'},sessionId);
  const result=await client.send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async()=>{
    const capture=fn=>{try{return{value:fn()}}catch(e){return{error:e.name,message:e.message}}};
    const out={performance:{},resize:{}};const p=out.performance,r=out.resize;
    p.types=PerformanceObserver.supportedEntryTypes;
    p.constructors={};for(const name of ['PerformanceEntry','PerformanceMark','PerformanceMeasure','PerformanceObserverEntryList','ResizeObserverEntry','ResizeObserverSize'])p.constructors[name]=capture(()=>{new globalThis[name]('x');return 'constructed'});
    p.markNegative=capture(()=>performance.mark('negative',{startTime:-1}).toJSON());
    p.markInfinity=capture(()=>performance.mark('inf',{startTime:Infinity}).toJSON());
    p.markNaN=capture(()=>performance.mark('nan',{startTime:NaN}).toJSON());
    const detail={x:1};const m=performance.mark('detail',{startTime:2,detail});detail.x=2;p.mark={json:m.toJSON(),sameDetail:m.detail===detail,tag:Object.prototype.toString.call(m)};
    p.measureDurationOnly=capture(()=>performance.measure('d',{duration:7}).toJSON());
    p.measureAll=capture(()=>performance.measure('bad',{start:1,end:4,duration:2}).toJSON());
    p.measureNegative=capture(()=>performance.measure('n',{start:4,end:1}).toJSON());
    p.missingMark=capture(()=>performance.measure('missing','absent').toJSON());
    p.newMark=capture(()=>new PerformanceMark('direct',{startTime:4,detail:{a:1}}).toJSON());
    p.directMarkIsRecorded=performance.getEntriesByName('direct').length;
    const po=new PerformanceObserver(()=>{});po.observe({type:'mark'});performance.mark('queued',{startTime:3});p.takeRecords=po.takeRecords().map(e=>e.name);po.disconnect();
    p.modeAfterDisconnect=capture(()=>{po.observe({entryTypes:['mark']});return true});
    p.unknownType=capture(()=>{new PerformanceObserver(()=>{}).observe({type:'unknown'});return true});
    p.order=await new Promise(resolve=>{const log=[];const o=new PerformanceObserver(list=>{log.push('observer');o.disconnect();resolve(log)});o.observe({type:'mark'});performance.mark('order');Promise.resolve().then(()=>log.push('promise'));log.push('sync');});
    r.validation={missing:capture(()=>new ResizeObserver()),badTarget:capture(()=>new ResizeObserver(()=>{}).observe({})),badBox:capture(()=>new ResizeObserver(()=>{}).observe(document.getElementById('t'),{box:'bad'}))};
    r.entries=await new Promise(resolve=>{const o=new ResizeObserver(entries=>{o.disconnect();resolve(entries.map(e=>({keys:Object.keys(e),tag:Object.prototype.toString.call(e),rect:e.contentRect.toJSON(),content:Array.from(e.contentBoxSize,s=>({inline:s.inlineSize,block:s.blockSize,tag:Object.prototype.toString.call(s)})),border:Array.from(e.borderBoxSize,s=>({inline:s.inlineSize,block:s.blockSize})),device:Array.from(e.devicePixelContentBoxSize,s=>({inline:s.inlineSize,block:s.blockSize})),entryConstructor:e instanceof ResizeObserverEntry,rectConstructor:e.contentRect instanceof DOMRectReadOnly,arrayFrozen:Object.isFrozen(e.contentBoxSize)})))});o.observe(document.getElementById('t'));});
    r.detached=await new Promise(resolve=>{const t=document.createElement('div');t.style.width='40px';let n=0;const o=new ResizeObserver(()=>n++);o.observe(t);setTimeout(()=>{o.disconnect();resolve(n)},30)});
    return out;
  })()`},sessionId);
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  const report={binary,sha256:createHash('sha256').update(await readFile(binary)).digest('hex'),observations:result.result.value};
  const json=JSON.stringify(report,null,2)+'\n';
  if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});console.log(json);
}finally{await client?.close();await browser.close();}
