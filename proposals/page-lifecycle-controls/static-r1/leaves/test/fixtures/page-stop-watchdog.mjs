import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {serve} from '../../src/cdp.js';
import {connect} from '../cdp-client.js';
const requests=[],server=createServer((req,res)=>{requests.push(req.url);if(req.url==='/held')return;res.setHeader('content-type','text/html');res.end('<!doctype html><body>real guarded page</body>')});
let service,client,report={effectiveTimeout:200};
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));service=await serve({port:0,timeout:200});client=await connect('ws://127.0.0.1:'+service.port+'/',{timeout:2000});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId);await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
 await send('Runtime.evaluate',{expression:'globalThis.entered=false;globalThis.x=new XMLHttpRequest();x.open("GET","/held");x.addEventListener("abort",()=>{entered=true;while(true){}});x.send();true'});
 const end=Date.now()+2000;while(!requests.includes('/held')){if(Date.now()>=end)throw Error('Original2s actual request deadline');await new Promise(r=>setTimeout(r,5))}
 process.stdout.write(JSON.stringify({marker:'armed',effectiveTimeout:200})+'\n');
 const begin=Date.now();try{report.stop=await send('Page.stopLoading')}catch(error){report.stopError={message:error.message,code:error.code}}report.stopElapsedMS=Date.now()-begin;
 const query=await send('Runtime.evaluate',{expression:'({entered,alive:document.body.textContent,ready:document.readyState})',returnByValue:true});assert.equal(query.exceptionDetails,undefined);report.entered=query.result.value.entered;report.recovered=query.result.value.alive==='real guarded page';
 assert.equal(report.entered,true);assert.equal(report.recovered,true);assert.ok(report.stopElapsedMS<1500);
 await send('Page.close');report.disposed=service.browser.pages.size===0;
}finally{await client?.close();await service?.close();server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify(report));
