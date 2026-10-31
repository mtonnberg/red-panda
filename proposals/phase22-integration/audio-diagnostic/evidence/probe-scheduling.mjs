// Static-prepared diagnostic: execute only after Parent grants a quiet slot.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const graph=process.env.AUDIO_DIAGNOSTIC_GRAPH;if(!graph)throw Error('Actual captured candidate graph required');
const label=process.env.AUDIO_DIAGNOSTIC_LABEL??'current';
const blockEvent=process.env.AUDIO_DIAGNOSTIC_BLOCK_EVENT;if(!['DOMContentLoaded','load'].includes(blockEvent))throw Error('Authored scheduling event required');
const blockSource=`addEventListener(${JSON.stringify(blockEvent)},()=>{globalThis.__ownedAudioBlock={event:${JSON.stringify(blockEvent)},start:performance.now(),ready:document.readyState};const end=performance.now()+180;while(performance.now()<end){}__ownedAudioBlock.end=performance.now()},{once:true})`;
const {Browser}=await import(pathToFileURL(graph+'/src/browser.js'));
const {upstreamTestRoot}=await import(pathToFileURL(graph+'/test/upstream-reference.js'));
const {startFixtureServer}=await import(pathToFileURL(graph+'/scripts/upstream-fixture-server.mjs'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const root=await upstreamTestRoot(),path='webaudio/audio_context.html',source=await readFile(root+'/'+path);
if(sha(source)!=='5fe4545027f8ea1f11e06f61dc385e4c4846b5ee4efa78a345254bd33e3a96c3')throw Error('Original audio_context fixture changed');
const start=performance.now(),result={label,graph,node:process.version,sourceSHA256:sha(source),sourcePath:root+'/'+path,pollPolicy:{iterations:200,hostDelayMs:20,stopImmediatelyOnOriginalAssertOkThrow:true},console:[],pageErrors:[],resourceErrors:[],polls:[],boundary:'Independent real lifecycle-event CPU block180ms; unchanged fixture body and original Browser/default Source load settings. This is a scheduling diagnostic, not unchanged Source acceptance. This diagnostic is not a full-suite acceptance or a causal proof.'};
const errorShape=error=>{const out={type:typeof error};for(const key of ['name','message','stack','code'])try{if(error?.[key]!==undefined)out[key]=String(error[key])}catch(value){out[key+'GetterError']=String(value)}return out};
const argShape=value=>{const out={type:typeof value};try{out.text=String(value)}catch(error){out.textError=errorShape(error)}if(value!==null&&(typeof value==='object'||typeof value==='function'))Object.assign(out,errorShape(value));return out};
let server,browser,page;
try{
 server=await startFixtureServer(root,{port:0,profile:'static'});result.origin=server.origin;
 browser=new Browser({userAgent:'Lightpanda/1.0'});page=browser.createPage();
 page.on('console',event=>{const row={type:event.type,ms:performance.now()-start,args:event.args.map(argShape)};result.console.push(row);if(event.type==='error'||event.type==='warn')process.stdout.write(JSON.stringify({label,console:row})+'\n')});
 page.on('pageError',error=>result.pageErrors.push({ms:performance.now()-start,error:errorShape(error)}));
 page.on('resourceError',error=>result.resourceErrors.push({ms:performance.now()-start,error:errorShape(error)}));
 page.on('navigationError',error=>{(result.navigationErrors??=[]).push({ms:performance.now()-start,error:errorShape(error)})});
 page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});
 result.authoredBlockSource=blockSource;page.newDocumentScripts.set('independent-block',{source:blockSource});
 await page.navigate(server.origin+'/src/browser/tests/'+path);result.navigationMs=performance.now()-start;result.passed=false;
 for(let i=0;i<200;i++){
  try{const passed=page.evaluate('testing.assertOk()')===true;result.polls.push({iteration:i,ms:performance.now()-start,passed});if(passed){result.passed=true;break}}
  catch(error){result.assertOkThrow={iteration:i,ms:performance.now()-start,error:errorShape(error)};break}
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 try{result.testRunner=page.evaluate('testing.IS_TEST_RUNNER');result.context=JSON.parse(page.evaluate(`JSON.stringify({url:document.URL,readyState:document.readyState,closed,now:performance.now(),currentScript:document.currentScript?.id??null,actualAuthoredBlock:globalThis.__ownedAudioBlock,modules:[...document.querySelectorAll('script[type=module]')].map(s=>({id:s.id,source:s.src}))})`))}catch(error){result.contextError=errorShape(error)}
 result.requests=server.requests;
}catch(error){result.setupOrDriverFailure=errorShape(error)}
finally{browser?.close();await server?.close();result.seconds=(performance.now()-start)/1000;await writeFile(new URL(label+'-initial.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify({label,passed:result.passed,assertOkThrow:result.assertOkThrow,setupOrDriverFailure:result.setupOrDriverFailure,seconds:result.seconds})+'\n')}
