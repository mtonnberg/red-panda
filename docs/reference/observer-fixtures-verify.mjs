// Execute unchanged external HTML/testing.js in a document realm with the new
// observer installers. This is installer-level evidence, not a CDP browser run.
import {JSDOM,VirtualConsole,ResourceLoader} from 'jsdom';
import {EventEmitter} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {installStyles} from '../../src/styles.js';
import {installLayout} from '../../src/layout.js';
import {installModuleScripts} from '../../src/modules.js';
import {installResizeObserver} from '../../src/resize-observer.js';
import {installPerformance} from '../../src/performance.js';
import {startFixtureServer} from '../../scripts/upstream-fixture-server.mjs';
const root=process.argv[2];if(!root)throw new Error('Supply external src/browser/tests root');
const sources=['src/resize-observer.js','src/performance.js','src/layout.js','src/styles.js','src/modules.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../../'+path,import.meta.url))).digest('hex')])));
const sourceSHA256=await hashes();
const tests=['resize_observer/basic.html','resize_observer/resize.html','resize_observer/unobserve.html','resize_observer/disconnect_during_delivery.html','performance_observer/callback_throws.html','performance_observer/performance_observer.html'];
const server=await startFixtureServer(root,{port:0,profile:'static'}),results=[];
try{
 for(const path of tests){
  const errors=[],logs=[];const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController(),fetch});page.on('pageError',error=>errors.push(String(error)));
  const bytes=await readFile(join(root,path)),virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(String(error)));for(const type of ['error','warn','log'])virtualConsole.on(type,(...args)=>logs.push(args.map(String).join(' ')));
  const dom=new JSDOM(bytes.toString(),{url:`${server.origin}/src/browser/tests/${path}`,runScripts:'dangerously',resources:new ResourceLoader({userAgent:'Lightpanda/1.0'}),virtualConsole,pretendToBeVisual:true,
   beforeParse(window){Object.defineProperty(window.navigator,'userAgent',{configurable:true,get:()=> 'Lightpanda/1.0'});window.__lp_external_runner=true;installStyles(page,window);const layout=installLayout(page,window);installResizeObserver(page,window,layout);installPerformance(page,window);installModuleScripts(page,window);}});
  page.dom=dom;const deadline=Date.now()+1500;let status='timeout',error=null;
  try{while(Date.now()<deadline){if(dom.window.testing?.assertOk()){status='passed';break;}await new Promise(resolve=>setTimeout(resolve,10));}}catch(cause){status='failed';error=String(cause);}
  if(status==='timeout')dom.window.testing?.printTimeoutState();
  results.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),status,error,errors,logs});console.error(`${status.toUpperCase()} ${path}`);
  page.documentAbort.abort();dom.window.close();
 }
 const after=await hashes();if(JSON.stringify(sourceSHA256)!==JSON.stringify(after))throw new Error('Installer source changed during verification');
 const report={scope:'Installer-level unchanged external fixtures; not a production Browser integration result',node:process.version,sourceSHA256,sourceHarnessSHA256:createHash('sha256').update(await readFile(join(root,'testing.js'))).digest('hex'),transportEventSource:'Helper page uses raw fetch without Page transport events; real resource/navigation producers are tested separately using owned HTTP in test/performance.test.js',results};
 const json=JSON.stringify(report,null,2)+'\n';if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});console.log(json);
}finally{await server.close();}
