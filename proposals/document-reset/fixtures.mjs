import http from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
const [root, output, binary] = process.argv.slice(2);
if (!root || !output || !binary) throw new Error('Supply unchanged fixture root, output and verified native binary');
const manifest = JSON.parse(await readFile(new URL('./manifest.json',import.meta.url)));
const snapshot = process.env.RESET_SNAPSHOT ?? manifest.snapshot;
const { Browser } = await import(pathToFileURL(`${snapshot}/src/browser.js`).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const nativeArguments = ['--load-resources','iframe','--load-resources','worker'];
const report = { kind:'bounded-unchanged-postload-reset-fixtures', snapshot, binarySHA256:hash(await readFile(binary)), nativeArguments, nativeControlReused:process.env.RESET_SKIP_NATIVE === '1', cases:[] };
if (report.binarySHA256 !== '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f') throw new Error('Unexpected native executable');
const server = http.createServer(async(request,response)=>{
  try {const name=decodeURIComponent(new URL(request.url,'http://test').pathname).replace(/^\/+/,''), file=path.resolve(root,name);
    if(!file.startsWith(path.resolve(root)+path.sep))throw new Error('Outside fixture root');
    response.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'text/html'});response.end(await readFile(file));
  }catch{response.writeHead(404);response.end('missing');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`, reference=process.env.RESET_SKIP_NATIVE === '1' ? null : await startReference(binary,{args:nativeArguments}), browser=new Browser({timeout:5000}); let client;
const expression=`(()=>{if(document.readyState!=='complete')return {pending:true};try{return {passed:window.testing?.assertOk()===true};}catch(e){return {failed:true,message:e.message};}})()`;
async function settle(evaluate){await new Promise(resolve=>setTimeout(resolve,100));const deadline=Date.now()+3000;while(Date.now()<deadline){const value=await evaluate(expression);if(value?.passed||value?.failed)return value;await new Promise(resolve=>setTimeout(resolve,10));}return {timeout:true};}
try {
  if(reference) client=await connect(reference.endpoint);
  for(const fixture of process.env.RESET_FIXTURES?.split(',') ?? ['document/write.html','custom_elements/reentrant_document_write.html','custom_elements/reentrant_document_close.html','frames/document_write.html']){
    const entry={fixture,sourceSHA256:hash(await readFile(path.join(root,fixture)))}, page=browser.createPage(), errors=[], consoleErrors=[];
    page.on('console',event=>{if(event.type==='error')consoleErrors.push(event.args.map(String).join(' '));});
    page.on('pageError',error=>errors.push(error.message));page.newDocumentScripts.set('probe',{source:'window.__lp_external_runner=true;'});
    try{await page.navigate(`${origin}/${fixture}`);entry.independent={...await settle(source=>page.evaluate(source)),errors,consoleErrors};}catch(error){entry.independent={error:error.message,errors,consoleErrors};}finally{page.close();}
    let context;
    if(client) {
    try{context=(await client.send('Target.createBrowserContext')).browserContextId;const {targetId}=await client.send('Target.createTarget',{browserContextId:context,url:'about:blank'});
      const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true}),send=(method,params={})=>client.send(method,params,sessionId);
      await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__lp_external_runner=true;'});await send('Page.navigate',{url:`${origin}/${fixture}`});
      entry.native=await settle(async source=>{const value=await send('Runtime.evaluate',{expression:source,returnByValue:true});return value.exceptionDetails?{failed:true,exception:value.exceptionDetails.text}:value.result.value;});
    }catch(error){entry.native={error:error.message};}finally{if(context)await client.send('Target.disposeBrowserContext',{browserContextId:context});}
    }
    report.cases.push(entry);process.stdout.write(`${fixture}: ${JSON.stringify({independent:entry.independent,native:entry.native})}\n`);
  }
}finally{browser.close();try{await client?.close();}finally{await reference?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
report.cleanup='owned candidate pages/browser, native contexts/connection/process and port0 HTTP server closed';await writeFile(output,JSON.stringify(report,null,2)+'\n');
