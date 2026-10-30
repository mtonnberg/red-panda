import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { connect } from './cdp-client.mjs';
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',requests=[],sockets=new Set();
const source=`(async()=>{const socket=new WebSocket('/socket');await new Promise(resolve=>{socket.onopen=()=>socket.send('actual');socket.onmessage=()=>{socket.close();resolve()};socket.onerror=()=>resolve()});postMessage('complete')})()`;
const server=createServer((request,response)=>{requests.push({url:request.url,headers:request.headers});if(request.url==='/worker.js'){response.setHeader('content-type','text/javascript');response.end(source);return}response.setHeader('content-type','text/html');response.end('<script>globalThis.done=false;const worker=new Worker("/worker.js");worker.onmessage=()=>globalThis.done=true;</script>')});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});
const wss=new WebSocketServer({server});wss.on('connection',(socket,request)=>{requests.push({websocket:true,url:request.url,headers:request.headers});socket.on('message',(data,binary)=>socket.send(data,{binary}))});
server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const args=['serve','--host','127.0.0.1','--port',String(port),'--load-resources','worker'];
const child=spawn('/usr/bin/prlimit',['--core=0','--',binary,...args],{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NO_PROXY:'*',no_proxy:'*'}});let stdout='',stderr='',killedByWatchdog=false,client;
child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);const watchdog=setTimeout(()=>{killedByWatchdog=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},10000);
const actions=[];let failure;
try{
 let ready=false;for(let count=0;count<100&&!ready;count++){try{ready=(await fetch('http://127.0.0.1:'+port+'/json/version')).ok}catch{}if(!ready)await new Promise(resolve=>setTimeout(resolve,20))}if(!ready)throw Error('Owned native endpoint not ready');
 client=await connect('ws://127.0.0.1:'+port+'/',{timeout:5000});const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=async(method,params={})=>{const result=await client.send(method,params,sessionId);actions.push({method,params,result});return result};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Network.setUserAgentOverride',{userAgent:'phase-two-cdp-agent',acceptLanguage:'zz-ZZ'});
 await send('Network.setExtraHTTPHeaders',{headers:{'X-Policy':'cdp-extra','Cookie':'cdp_cookie=forced','Accept-Language':'xx-XX'}});
 await send('Network.setCookies',{cookies:[{name:'root_cookie',value:'actual',url:origin},{name:'root_http',value:'hidden',httpOnly:true,url:origin}]});
 await send('Page.navigate',{url:origin});let done=false;
 for(let count=0;count<80&&!done;count++){const response=await client.send('Runtime.evaluate',{expression:'globalThis.done===true',returnByValue:true},sessionId);done=response.result.value===true;if(!done)await new Promise(resolve=>setTimeout(resolve,25))}
 actions.push({observedWorkerCompletion:done});
}catch(error){failure={name:error.name,message:error.message}}
finally{
 await client?.close();const close=once(child,'close');if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const force=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},500);const[exitCode,signal]=await close;clearTimeout(force);clearTimeout(watchdog);
 for(const socket of wss.clients)socket.terminate();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
 const result={binary,binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),probeSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),args,origin,actions,requests,stdout,stderr,failure,exitCode,signal,killedByWatchdog};
 await writeFile(new URL('../docs/reference/native-socket-cdp.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({failure,requests,exitCode,signal,killedByWatchdog}));
}
