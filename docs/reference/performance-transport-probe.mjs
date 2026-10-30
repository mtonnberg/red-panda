// Public-API transport timing controls; all HTTP/browser processes are owned.
import http from 'node:http';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const binary=process.argv[2]??'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const server=http.createServer((request,response)=>{
 if(request.url==='/resource'){response.writeHead(200,{'content-type':'text/plain','content-length':'100'});return response.end('1234567890'.repeat(10));}
 response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><p>owned timing control</p>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,client;
try{
 browser=await startReference(binary);client=await connect(browser.endpoint);
 const target=await client.send('Target.createTarget',{url:'about:blank'});
 const{sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 await client.send('Page.navigate',{url:origin+'/'},sessionId);
 const result=await client.send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const out={navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON())};performance.clearResourceTimings();
 const before=performance.now();await(await fetch(${JSON.stringify(origin+'/resource')})).text();
 out.resource=performance.getEntriesByName(${JSON.stringify(origin+'/resource')}).map(e=>({json:e.toJSON(),relativeBefore:before,relativeAfter:performance.now()}));
 try{await fetch('http://127.0.0.1:1/unreachable')}catch{}
 out.failed=performance.getEntriesByName('http://127.0.0.1:1/unreachable').map(e=>e.toJSON());
 return out;
 })()`},sessionId);
 if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
 const report={binary,sha256:createHash('sha256').update(await readFile(binary)).digest('hex'),observations:result.result.value};
 const json=JSON.stringify(report,null,2)+'\n';if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});console.log(json);
}finally{await client?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
