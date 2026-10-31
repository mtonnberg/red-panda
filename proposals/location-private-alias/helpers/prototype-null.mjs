import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startReference} from '/workspace/red-panda/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const target=process.argv[2],output=process.argv[3],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const source='<!doctype html><body>Actual prototype-null document<script>globalThis.actualReady=true</script>';
let service,client,browserContextId,sessionId,failure;const observations=[];
try{
 if(target==='native')service=await startReference(binary);else{const{serve}=await import(pathToFileURL(resolve(target,'src/cdp.js')));service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/'}
 client=await connect(service.endpoint);({browserContextId}=await client.send('Target.createBrowserContext'));
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});({sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true}));
 const send=(method,params={})=>client.send(method,params,sessionId,{timeout:1500});await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'data:text/html,'+encodeURIComponent(source)});
 for(let attempt=0;attempt<100;attempt++){const result=await send('Runtime.evaluate',{expression:'Boolean(globalThis.actualReady)&&document.readyState==="complete"',returnByValue:true});if(result.result?.value)break;if(attempt===99)throw Error('Actual document readiness missing');await new Promise(resolve=>setTimeout(resolve,5))}
 observations.push({stage:'main-before',result:await send('Runtime.evaluate',{expression:'JSON.stringify((()=>{globalThis.actualLocation=location;globalThis.actualHrefGetter=Object.getOwnPropertyDescriptor(Location.prototype,"href").get;Object.setPrototypeOf(actualLocation,null);return{prototypeNull:Object.getPrototypeOf(actualLocation)===null,sameDocument:document.location===actualLocation,href:actualHrefGetter.call(actualLocation),body:document.body.textContent}})())',returnByValue:true})});
 const tree=await send('Page.getFrameTree');const created=await send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'actual-prototype-null-utility'});observations.push({stage:'created',result:created});
 observations.push({stage:'utility',result:await send('Runtime.evaluate',{contextId:created.executionContextId,expression:'JSON.stringify({sameDocument:location===document.location,prototype:Object.getPrototypeOf(location)===Location.prototype,href:Object.getOwnPropertyDescriptor(Location.prototype,"href").get.call(location),body:document.body.textContent})',returnByValue:true})});
}catch(error){failure={name:error.name,message:error.message,stack:error.stack}}
finally{
 if(client&&sessionId)try{await client.send('Runtime.evaluate',{expression:'if(globalThis.actualLocation)Object.setPrototypeOf(actualLocation,Location.prototype)',returnByValue:true},sessionId,{timeout:500})}catch{}
 if(client&&browserContextId)try{await client.send('Target.disposeBrowserContext',{browserContextId},undefined,{timeout:500})}catch{}
 await client?.close();await service?.close();const sha=bytes=>createHash('sha256').update(bytes).digest('hex');await writeFile(output,JSON.stringify({target,source,sourceSHA256:sha(source),helperSHA256:sha(await readFile(new URL(import.meta.url))),nativeSHA256:sha(await readFile(binary)),observations,failure},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({target,failure}));
}
