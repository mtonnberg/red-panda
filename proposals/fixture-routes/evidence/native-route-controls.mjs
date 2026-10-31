import { startFixtureServer } from './scripts/upstream-fixture-server.mjs';
import { startReference } from './scripts/reference-server.mjs';
import { connect } from './test/cdp-client.js';
import { mkdtemp,readFile,readdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const report={scope:'Actual Native route-specific authored controls; separate from unchanged fixture registrations',binary:'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',sourceProfile:{resources:['iframe','worker'],experimentalFeatures:{}},controls:[]};
let server,browser,client,context;const directory=await mkdtemp(join(tmpdir(),'red-panda-native-download-'));
try{
 server=await startFixtureServer('/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests',{port:9582,profile:'upstream',webSocketPort:9584});
 browser=await startReference(report.binary,{args:['--load-resources','iframe','--load-resources','worker']});client=await connect(browser.endpoint,{timeout:5000});
 context=(await client.send('Target.createBrowserContext')).browserContextId;const target=await client.send('Target.createTarget',{url:'about:blank',browserContextId:context});const session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 const send=(method,params={})=>client.send(method,params,session);
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setUserAgentOverride',{userAgent:'Lightpanda/1.0'});await send('Page.navigate',{url:server.origin+'/'});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return result.exceptionDetails?{exception:result.exceptionDetails}:result.result.value;};
 report.version=await client.send('Browser.getVersion');
 const control=async(name,source,expected)=>{const result=await evaluate(source);report.controls.push({name,source,expected,result,passed:JSON.stringify(result)===JSON.stringify(expected)});};
 await control('cors-preflight-real-reflected-origin',`(async()=>{const r=await fetch('http://localhost:9582/echo_headers',{headers:{'X-Hop':'route-positive'}});return {status:r.status,type:r.type,bodyHasHeader:(await r.text()).toLowerCase().includes('x-hop: route-positive')};})()`,{status:200,type:'cors',bodyHasHeader:true});
 await control('cors-denied-real-missing-acao',`(async()=>{try{await fetch('http://localhost:9582/xhr');return 'unexpected success';}catch(e){return e.name;}})()`,'TypeError');
 await control('brotli-real-compressed-request-native-decoder',`(async()=>{const bytes=new TextEncoder().encode('actual native brotli transport');const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('brotli'));const compressed=await new Response(stream).arrayBuffer();const r=await fetch('/echo_brotli',{method:'POST',body:compressed});return [r.status,await r.text()];})()`,[200,'actual native brotli transport']);
 await control('gzip-exact-raw-bytes-native-decoder',`(async()=>{const r=await fetch('/raw/gzip');return [r.status,r.headers.get('content-encoding'),(await r.text()).length];})()`,[200,'gzip',1000]);
 await control('websocket-single-text-binary-origin-close',`new Promise(resolve=>{const seen=[],ws=new WebSocket('ws://127.0.0.1:9584/');const timer=setTimeout(()=>{ws.close();resolve({timeout:true,seen});},3000);ws.binaryType='arraybuffer';ws.onopen=()=>{seen.push('open');ws.send('actual');};ws.onmessage=e=>{if(typeof e.data==='string'){seen.push(e.data);if(e.data==='echo-actual')ws.send(new Uint8Array([1,2]));else ws.close(1000,'done');}else{seen.push(Array.from(new Uint8Array(e.data)));ws.send('get-origin');}};ws.onclose=e=>{clearTimeout(timer);seen.push([e.code,e.reason,e.wasClean]);resolve(seen);};ws.onerror=()=>seen.push('error');})`,['open','echo-actual',[238,1,2],'origin:http://127.0.0.1:9582',[1000,'done',true]]);
 await client.send('Browser.setDownloadBehavior',{browserContextId:context,behavior:'allow',downloadPath:directory,eventsEnabled:true});
 const offset=client.events.length;const navigate=await send('Page.navigate',{url:server.origin+'/download/report.csv'});let downloaded=null;
 for(let i=0;i<100;i++){try{downloaded=(await readFile(join(directory,'report.csv'))).toString();break;}catch{}await new Promise(resolve=>setTimeout(resolve,10));}
 report.controls.push({name:'attachment-real-file-and-events',navigate,bytes:downloaded,expectedBytes:'col1,col2\nhello,world\n42,1337\n',files:await readdir(directory),events:client.events.slice(offset).filter(x=>x.method.startsWith('Browser.download')),passed:downloaded==='col1,col2\nhello,world\n42,1337\n'});
 const missingOffset=client.events.length;const missingNavigate=await send('Page.navigate',{url:server.origin+'/download/missing.csv'});await new Promise(resolve=>setTimeout(resolve,100));const files=await readdir(directory);
 report.controls.push({name:'attachment-404-no-file',navigate:missingNavigate,files,events:client.events.slice(missingOffset).filter(x=>x.method.startsWith('Browser.download')),passed:!files.includes('missing.csv')});
 report.requests=server.requests;report.webSocketRequests=server.webSocket.requests;
}catch(error){report.setupError={message:error.message,stack:error.stack};process.exitCode=1;}
finally{if(context)await client?.send('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});await client?.close();await browser?.close();report.ownedBrowser=browser?{pid:browser.process.pid,exitCode:browser.process.exitCode,signal:browser.process.signalCode,stderr:browser.stderr,stderrTruncated:browser.stderrTruncated}:null;await server?.close();await rm(directory,{recursive:true,force:true});report.counts={selected:report.controls.length,passed:report.controls.filter(x=>x.passed).length,failed:report.controls.filter(x=>!x.passed).length};report.binarySHA256=createHash('sha256').update(await readFile(report.binary)).digest('hex');await writeFile('/workspace/red-panda/proposals/fixture-routes/evidence/native-route-controls.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});if(report.counts.failed)process.exitCode=1;console.log(report.counts);}
