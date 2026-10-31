import http from'node:http';import{once}from'node:events';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import{startReference}from'../scripts/reference-server.mjs';import{connect}from'../test/cdp-client.js';import{serve}from'../src/cdp.js';
const sha=x=>createHash('sha256').update(x).digest('hex'),binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',binarySHA256=sha(await readFile(binary));if(binarySHA256!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw Error('Unexpected native binary');
const fixture='<!doctype html><p>root</p><iframe id="f" srcdoc="<p>original child</p>"></iframe>',requests=[];
const server=http.createServer((req,res)=>{requests.push(req.url);res.setHeader('content-type','text/html');res.end(fixture)});server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const output={binarySHA256,fixtureSHA256:sha(fixture),driverSHA256:sha(await readFile(new URL(import.meta.url))),engines:{}};
async function run(engine){let service,client;const rows=[];try{
 service=engine==='native'?await startReference(binary,{args:['--load-resources','iframe']}):await serve({host:'127.0.0.1',port:0,loadResources:['iframe']});const endpoint=service.endpoint??`ws://127.0.0.1:${service.port}/`;client=await connect(endpoint);
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const call=(method,params={})=>client.send(method,params,sessionId);await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:origin+'/'});
 let childId,childContext;for(let i=0;i<100;i++){const t=await call('Page.getFrameTree');childId=t.frameTree.childFrames?.[0]?.frame.id;childContext=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.auxData?.isDefault&&e.params.context.auxData?.frameId===childId)?.params.context.id;if(childContext)break;await new Promise(r=>setTimeout(r,10))}if(!childContext)throw Error('No actual child context');
 async function evaluate(label,expression,contextId){let result;try{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId?{contextId}:{})});result=r.exceptionDetails?{exception:r.exceptionDetails.text,detail:r.exceptionDetails.exception?.description}:{value:r.result.value}}catch(error){result={protocolError:{code:error.code,message:error.message}}}rows.push({label,expression,...result});return result.value}
 const read=`async url=>{try{const response=await fetch(url);return{ok:response.ok,status:response.status,text:await response.text()}}catch(e){return{error:e.name}}}`;
 await evaluate('prepare-root',`globalThis.child=document.getElementById('f').contentWindow;globalThis.rootURL=URL.createObjectURL(new Blob(['root-owned']));globalThis.readBlobURL=${read};true`);
 const old=await evaluate('create-before-remove',`globalThis.beforeURL=URL.createObjectURL(new Blob(['child-before'],{type:'text/plain'}));({url:beforeURL,closed,view:document.defaultView===window})`,childContext);
 const oldURL=old.url;
 await evaluate('fetch-parent-before',`readBlobURL(${JSON.stringify(oldURL)})`);
 await evaluate('retain-real-response',`(async()=>{globalThis.retainedResponse=await fetch(${JSON.stringify(oldURL)});globalThis.retainedBlob=await (await fetch(${JSON.stringify(oldURL)})).blob();return{status:retainedResponse.status,type:retainedBlob.type,size:retainedBlob.size}})()`);
 await evaluate('fetch-child-before',`(${read})(${JSON.stringify(oldURL)})`,childContext);
 await evaluate('remove-frame',`document.getElementById('f').remove();({closed:child.closed,viewNull:child.document.defaultView===null,length})`);
 await evaluate('fetch-parent-old-after',`readBlobURL(${JSON.stringify(oldURL)})`);
 await evaluate('fetch-child-old-after',`(${read})(${JSON.stringify(oldURL)})`,childContext);
 await evaluate('retained-response-after',`retainedResponse.text()`);
 await evaluate('retained-blob-after',`retainedBlob.text()`);
 const later=await evaluate('create-after-remove',`globalThis.afterURL=URL.createObjectURL(new Blob(['child-after'],{type:'text/plain'}));({url:afterURL,closed,viewNull:document.defaultView===null})`,childContext);
 if(later?.url){await evaluate('fetch-parent-new-after',`readBlobURL(${JSON.stringify(later.url)})`);await evaluate('fetch-child-new-after',`(${read})(${JSON.stringify(later.url)})`,childContext);await evaluate('revoke-after-retirement',`URL.revokeObjectURL(afterURL);true`,childContext);await evaluate('fetch-parent-new-revoked',`readBlobURL(${JSON.stringify(later.url)})`)}
 await evaluate('root-owned-survives',`readBlobURL(rootURL)`);
 await evaluate('root-revoke-old',`URL.revokeObjectURL(${JSON.stringify(oldURL)});true`);
 await evaluate('old-after-root-revoke',`readBlobURL(${JSON.stringify(oldURL)})`);
 await evaluate('root-retained-bytes-after-revokes',`retainedBlob.text()`);
 const survivor=await evaluate('create-root-close-control',`globalThis.survivorURL=URL.createObjectURL(new Blob(['survivor-bytes']));survivorURL`,childContext);
 const{targetId:peerTarget}=await client.send('Target.createTarget',{url:origin+'/peer'});const{sessionId:peerSession}=await client.send('Target.attachToTarget',{targetId:peerTarget,flatten:true});
 async function peerEvaluate(label,expression){const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},peerSession);const result=r.exceptionDetails?{exception:r.exceptionDetails.text}:{value:r.result.value};rows.push({label,expression,...result});return result.value}
 for(let i=0;i<100;i++){const r=await client.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},peerSession);if(r.result.value==='complete')break;await new Promise(r=>setTimeout(r,10))}
 await peerEvaluate('peer-prepare-before-root-close',`(async()=>{globalThis.readBlobURL=${read};globalThis.peerURL=URL.createObjectURL(new Blob(['peer-owned']));globalThis.retainedPeerBlob=await(await fetch(${JSON.stringify(survivor)})).blob();return{blobSize:retainedPeerBlob.size,before:await readBlobURL(${JSON.stringify(survivor)})}})()`);
 await call('Target.closeTarget',{targetId});
 await peerEvaluate('peer-child-url-after-root-close',`readBlobURL(${JSON.stringify(survivor)})`);
 await peerEvaluate('peer-owned-after-root-close',`readBlobURL(peerURL)`);
 await peerEvaluate('peer-retained-bytes-after-root-close',`retainedPeerBlob.text()`);
 await client.send('Target.closeTarget',{targetId:peerTarget});
 }finally{await client?.close();await service?.close();output.engines[engine]=rows}}
try{await run('native');await run('candidate')}finally{server.closeAllConnections();await new Promise(r=>server.close(r));output.requests=requests;await writeFile(new URL(process.argv[2]??'./blob-retirement-fixed-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n')}
console.log(output.engines);
