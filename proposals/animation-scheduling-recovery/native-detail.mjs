import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../scripts/reference-server.mjs';
import {createFixture} from '../../test/fixture.js';
import {connect} from '../../test/cdp-client.js';
const output=process.argv[2],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',source=await readFile(new URL('../../oracle/animations-detail-expression.js',import.meta.url),'utf8'),began=Date.now(),requests=[];let reference,fixture,client,result,error;
for(const key of ['NO_PROXY','no_proxy'])process.env[key]=[process.env[key],'127.0.0.1','localhost'].filter(Boolean).join(',');
const guard=setTimeout(()=>{client?.socket.terminate();reference?.process.kill('SIGKILL');fixture?.server.closeAllConnections()},15000);
try{
 fixture=await createFixture();fixture.server.on('request',req=>requests.push({url:req.url,at:Date.now()-began}));reference=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});client=await connect(reference.endpoint,{timeout:10000});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Page.navigate',{url:fixture.url},sessionId);
 const deadline=Date.now()+10000;for(;;){const state=await client.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},sessionId);if(state.result.value==='complete')break;if(Date.now()>=deadline)throw Error('Original10s load deadline');await new Promise(r=>setTimeout(r,5))}
 result=await client.send('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true},sessionId);
}catch(e){error={name:e.name,message:e.message,stack:e.stack}}
finally{await client?.close();await reference?.close();await fixture?.close();clearTimeout(guard);await writeFile(output,JSON.stringify({scope:'Exactunchangeddetail expression and actualoriginalfixture/profile',sourceSHA256:createHash('sha256').update(source).digest('hex'),binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),pid:reference?.process.pid,childExit:reference?.process.exitCode,childSignal:reference?.process.signalCode,stderr:reference?.stderr,requests,result,error,elapsedMS:Date.now()-began,commandLoadBudgets:10000,outerWatchdogMS:15000},null,2)+'\n',{flag:'wx'})}
if(error||result?.exceptionDetails)process.exitCode=1;
