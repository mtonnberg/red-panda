import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {connect} from '../../test/cdp-client.js';

const [binary,output]=process.argv.slice(2),started=Date.now(),deadline=started+4000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const names=['focus-owner'],expressions=[];
for(const name of names){const source=await readFile(new URL(name+'-expression.js',import.meta.url),'utf8');expressions.push({name,source,sha256:sha(source)});}
for(const key of ['NO_PROXY','no_proxy'])process.env[key]=[process.env[key],'127.0.0.1','localhost'].filter(Boolean).join(',');
let child,client,stderr='',failure,childExit,childSignal;
const requests=[],rows=[],server=createServer((request,response)=>{requests.push(request.url);response.setHeader('content-type','text/html');response.end('<!doctype html><html><head></head><body></body></html>');});
const remaining=()=>{const value=deadline-Date.now();if(value<=0)throw new Error('Four-control diagnostic deadline');return value;};
const guard=setTimeout(()=>{client?.socket.terminate();child?.kill('SIGKILL');server.closeAllConnections();},4000);
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(binary,['serve','--host','127.0.0.1','--port',String(port)],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(0,65536);});
 child.on('error',error=>{failure={name:error.name,message:error.message};});child.on('exit',(code,signal)=>{childExit=code;childSignal=signal;});
 while(true){remaining();if(child.exitCode!==null||child.signalCode!==null||failure)throw new Error('Owned Native process exited before readiness');try{if((await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(remaining())})).ok)break;}catch(error){remaining();}await new Promise(resolve=>setTimeout(resolve,5));}
 client=await connect('ws://127.0.0.1:'+port+'/',{timeout:remaining()});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.enable',{},sessionId);await client.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'},sessionId);
 while(true){remaining();const result=await client.send('Runtime.evaluate',{expression:'document.body!==null&&document.readyState==="complete"',returnByValue:true},sessionId);if(result.result.value===true)break;await new Promise(resolve=>setTimeout(resolve,5));}
 for(const {name,source,sha256} of expressions){remaining();const start=Date.now(),raw=await client.send('Runtime.evaluate',{expression:source,returnByValue:true},sessionId);rows.push({name,expressionSHA256:sha256,elapsedMS:Date.now()-start,raw,...(!raw.exceptionDetails?{value:JSON.parse(raw.result.value)}:{})});}
}catch(error){failure={name:error.name,message:error.message,stack:error.stack};}
finally{
 client?.socket.terminate();
 if(child?.pid&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
 server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));clearTimeout(guard);
 await writeFile(output,JSON.stringify({binarySHA256:sha(await readFile(binary)),driverSHA256:sha(await readFile(new URL(import.meta.url))),deadlineMS:4000,elapsedMS:Date.now()-started,requests,rows,failure,childExit,childSignal,stderr},null,2)+'\n',{flag:'wx'});
}
if(failure||rows.length!==1||rows.some(row=>row.raw.exceptionDetails))process.exitCode=1;
