import {readFile,writeFile} from 'node:fs/promises';
import {writeSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createFixture} from '../../test/fixture.js';
const[mode,output,reportDirectory]=process.argv.slice(2),started=Date.now(),marks=[],rows=[],mark=(phase,data={})=>{const item={phase,at:Date.now()-started,...data};marks.push(item);writeSync(1,JSON.stringify(item)+'\n')};
let browser,fixture,error;
process.report.excludeEnv=true;process.report.excludeNetwork=true;
if(process.report.excludeEnv!==true)throw Error('Diagnostic report environment exclusion is unavailable');
process.report.directory=reportDirectory;process.report.signal='SIGUSR2';process.report.reportOnSignal=true;
mark('startup',{mode,pid:process.pid,node:process.version,envProxy:process.env.NODE_USE_ENV_PROXY,reportExcludesEnvironment:process.report.excludeEnv});
const guard=setTimeout(()=>{mark('owned-15s-watchdog');fixture?.server.closeAllConnections()},15000);
try{
 mark('fixture-create-before');fixture=await createFixture();mark('fixture-create-after');fixture.server.on('request',request=>mark('http-request',{url:request.url}));
 const folder=mode==='Root'?'/workspace/red-panda':'/workspace/shared/animation-scheduler-only-20261031';
 mark('engine-import-before');const{Browser}=await import(pathToFileURL(folder+'/src/browser.js'));mark('engine-import-after');browser=new Browser({timeout:10000,loadResources:['iframe','worker']});mark('browser-created');
 const template=await readFile(new URL('./timing-expression.js',import.meta.url),'utf8');
 for(const blockMS of[0,20]){
  mark('page-create-before',{blockMS});const page=browser.createPage();mark('page-create-after',{blockMS});
  for(const name of['navigationStarted','navigated','domContentLoaded','load','close'])page.on(name,()=>mark('page-event',{name,blockMS}));
  page.on('pageError',value=>mark('pageError',{blockMS,message:value.message,stack:value.stack}));page.on('navigationError',value=>mark('navigationError',{blockMS,message:value.message}));
  mark('data-navigate-before',{blockMS});await page.navigate('data:text/html,<body>animations</body>');mark('data-navigate-after',{blockMS});
  mark('http-navigate-before',{blockMS});await page.navigate(fixture.url);mark('http-navigate-after',{blockMS});
  const expression=template.replace('__BLOCK_MS__',String(blockMS));mark('evaluate-before',{blockMS});const pending=page.evaluate(expression);mark('evaluate-returned',{blockMS});const value=await pending;mark('evaluate-resolved',{blockMS});rows.push({blockMS,sourceSHA256:createHash('sha256').update(expression).digest('hex'),value:JSON.parse(JSON.stringify(value))});
  mark('page-close-before',{blockMS});page.close();mark('page-close-after',{blockMS});
 }
}catch(value){error={name:value.name,message:value.message,stack:value.stack};mark('caught',error)}
finally{
 mark('finally-before');browser?.close();mark('browser-close-after');if(fixture){mark('fixture-close-before');await fixture.close();mark('fixture-close-after')}clearTimeout(guard);
 await writeFile(output,JSON.stringify({scope:'Instrumented Node26 stage diagnosis only, not unchanged original acceptance',mode,pid:process.pid,node:process.version,marks,rows,error,elapsedMS:Date.now()-started,APIAndLoadMS:10000,ownedWatchdogMS:15000},null,2)+'\n',{flag:'wx'});mark('report-written');
}
if(error)process.exitCode=1;
