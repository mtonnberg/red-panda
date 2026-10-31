import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../scripts/reference-server.mjs';
import {createFixture} from '../../test/fixture.js';
import {connect} from '../../test/cdp-client.js';
const output=process.argv[2],expression=await readFile(new URL('./native-expression.js',import.meta.url),'utf8');let fixture,reference,client,result,error;
const started=Date.now(),guard=setTimeout(()=>{client?.socket.terminate();reference?.process.kill('SIGKILL');fixture?.server.closeAllConnections()},15000);
try{fixture=await createFixture();reference=await startReference('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',{args:['--load-resources','iframe']});client=await connect(reference.endpoint,{timeout:10000});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);await client.send('Page.navigate',{url:fixture.url},sessionId);
 const deadline=Date.now()+10000;for(;;){const ready=await client.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},sessionId);if(ready.result.value==='complete')break;if(Date.now()>=deadline)throw Error('10 second load deadline');await new Promise(resolve=>setTimeout(resolve,5))}
 result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
}catch(e){error={name:e.name,message:e.message,stack:e.stack}}
finally{await client?.close();await reference?.close();await fixture?.close();clearTimeout(guard);await writeFile(output,JSON.stringify({pid:process.pid,nativePID:reference?.process.pid,nativeExit:reference?.process.exitCode,nativeSignal:reference?.process.signalCode,stderr:reference?.stderr,elapsedMS:Date.now()-started,expressionSHA256:createHash('sha256').update(expression).digest('hex'),result,error},null,2)+'\n',{flag:'wx'})}
if(error||result?.exceptionDetails)process.exitCode=1;
