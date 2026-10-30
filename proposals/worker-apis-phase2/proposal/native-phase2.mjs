import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { JSDOM } from 'jsdom';

const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const requests=[],connections=new Set();let originA,originB;
const source=`const report=(phase,data)=>postMessage({phase,data});
const failure=error=>({name:error.name,message:error.message});
const xhr=(url,{sync=false,credentials=false,method='GET',body=null,headers={}}={})=>{
const x=new XMLHttpRequest(),events=[];x.open(method,url,!sync);x.withCredentials=credentials;x.responseType='json';for(const[name,value]of Object.entries(headers))x.setRequestHeader(name,value);for(const type of['load','error','timeout','abort'])x.addEventListener(type,e=>events.push(type));
if(sync){try{x.send(body);return{status:x.status,response:x.response,events}}catch(error){return{status:x.status,error:failure(error),events}}}
return new Promise(resolve=>{x.onloadend=()=>resolve({status:x.status,response:x.response,events});x.send(body)})};
(async()=>{const mode=new URL(location.href).searchParams.get('mode'),cross=${'__CROSS__'};
if(mode==='cors'||mode==='cors-sync')for(const credentials of[false,true]){
const sync=mode==='cors-sync';report('simple-'+credentials,await xhr(cross+'/cors?credentials='+credentials,{credentials,sync}));
report('preflight-'+credentials,await xhr(cross+'/cors?credentials='+credentials,{credentials,sync,method:'PUT',headers:{'x-actual':'real'},body:new Uint8Array([0,128,255])}));
} 
if(mode==='cors'||mode==='cors-sync')report('denied',await xhr(cross+'/cors?wildcard=1',{credentials:true,sync:mode==='cors-sync'}));
if(mode==='forms')for(const sync of[false,true]){const form=new FormData();form.append('line','a\\nb\\rc\\r\\nd');form.append('duplicate','one');form.append('duplicate','two');form.append('file',new File([new Uint8Array([0,128,255])],'café"\\r\\n.bin',{type:'application/octet-stream'}));report('form-'+sync,await xhr('/form',{sync,method:'POST',body:form}));}
if(mode==='socket'||mode==='socket-cli'||mode==='socket-cookie'){
const socket=new WebSocket('/socket'),events=[];await new Promise(resolve=>{socket.onopen=()=>{events.push('open');socket.send('real')};socket.onmessage=e=>{events.push(e.data);socket.close(1000,'done')};socket.onerror=()=>events.push('error');socket.onclose=()=>resolve()});report('socket',{events,after:await xhr('/cookies')});
}
report('complete',{});
})().catch(error=>{report('failure',failure(error));report('complete',{})});`;
async function handler(label,request,response){
 const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks),url=new URL(request.url,'http://owned.test');
 const entry={server:label,url:request.url,method:request.method,headers:request.headers,bytes:[...body]};requests.push(entry);
 if(url.pathname==='/worker.js'){response.setHeader('content-type','text/javascript');response.end(source.replace('__CROSS__',JSON.stringify(originB)));return}
 if(url.pathname==='/cors'){
  response.setHeader('access-control-allow-origin',url.searchParams.has('wildcard')?'*':originA);response.setHeader('access-control-allow-credentials','true');response.setHeader('access-control-allow-methods','PUT, GET');response.setHeader('access-control-allow-headers','x-actual');
  response.setHeader('content-type','application/json');if(request.method==='OPTIONS'){response.writeHead(204);response.end();return}
  response.end(JSON.stringify({cookie:request.headers.cookie??'',origin:request.headers.origin??'',method:request.method,bytes:[...body],custom:request.headers['x-actual']??''}));return;
 }
 if(url.pathname==='/form'){
  try{const form=await new Request(originA+'/form',{method:'POST',headers:request.headers,body}).formData(),entries=[];for(const[name,value]of form)entries.push(typeof value==='string'?{name,text:value}:{name,filename:value.name,type:value.type,bytes:[...new Uint8Array(await value.arrayBuffer())]});entry.multipart=entries;response.setHeader('content-type','application/json');response.end(JSON.stringify({entries}));}catch(error){entry.parseError=error.message;response.writeHead(400);response.end(JSON.stringify({error:error.message}))}return;
 }
 if(url.pathname==='/cookies'){response.setHeader('content-type','application/json');response.end(JSON.stringify({cookie:request.headers.cookie??'',agent:request.headers['user-agent'],policy:request.headers['x-policy']??''}));return}
 const mode=url.searchParams.get('mode')??'cors';
 response.setHeader('set-cookie',['root_cookie=actual; Path=/','root_http=hidden; HttpOnly; Path=/']);response.setHeader('content-type','text/html');
 response.end(`<script>globalThis.reports=[];globalThis.__done=false;const worker=new Worker('/worker.js?mode=${mode}');worker.onmessage=event=>{reports.push(event.data);document.getElementById('result').textContent=JSON.stringify(reports);if(event.data.phase==='complete')globalThis.__done=true};worker.onerror=event=>{reports.push({error:event.message});globalThis.__done=true;document.getElementById('result').textContent=JSON.stringify(reports)};</script><pre id="result"></pre>`);
}
const a=createServer((req,res)=>void handler('a',req,res)),b=createServer((req,res)=>void handler('b',req,res));
for(const server of[a,b]){server.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket))});server.listen(0,'127.0.0.1');await once(server,'listening')}
originA='http://127.0.0.1:'+a.address().port;originB='http://127.0.0.1:'+b.address().port;
const wss=new WebSocketServer({server:a});wss.on('headers',headers=>headers.push('Set-Cookie: handshake_cookie=from_socket; Path=/; HttpOnly'));
wss.on('connection',(socket,request)=>{requests.push({websocket:true,url:request.url,headers:request.headers});socket.on('message',(bytes,binary)=>socket.send(bytes,{binary}))});
const results=[];
try{
 for(const mode of['cors','cors-sync','forms','socket','socket-cli','socket-cookie']){
  if(process.argv[3]&&!process.argv[3].split(',').includes(mode))continue;
  const offset=requests.length,args=['fetch','--load-resources','worker','--wait-script','globalThis.__done===true','--wait-ms','1500','--dump','html','--json'];
  if(mode==='socket-cli')args.push('--http-header','X-Policy: forced','--user-agent','phase-two-agent');
  if(mode==='socket-cookie')args.push('--http-header','Cookie: cli_cookie=forced');args.push(originA+'/?mode='+mode);
  const start=performance.now(),child=spawn('/usr/bin/prlimit',['--core=0','--',binary,...args],{detached:true,env:{...process.env,NO_PROXY:'*',no_proxy:'*'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='',killedByWatchdog=false;
  child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);const watchdog=setTimeout(()=>{killedByWatchdog=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},5000);
  const[exitCode,signal]=await once(child,'close');clearTimeout(watchdog);let observations=null,parseError=null;
  try{const data=JSON.parse(stdout),dom=new JSDOM(data.content);observations=JSON.parse(dom.window.document.getElementById('result').textContent);dom.window.close()}catch(error){parseError=error.message}
  const result={mode,args,elapsedMs:performance.now()-start,exitCode,signal,killedByWatchdog,stdout,stderr,observations,parseError,requests:requests.slice(offset)};results.push(result);console.log(JSON.stringify({mode,exitCode,signal,killedByWatchdog,observations}));
 }
 await writeFile(process.argv[2]??new URL('../docs/reference/native-phase2.json',import.meta.url),JSON.stringify({binary,binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),probeSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),coreLimit:0,originA,originB,source,results},null,2)+'\n');
}finally{for(const socket of wss.clients)socket.terminate();for(const socket of connections)socket.destroy();await Promise.all([a,b].map(server=>new Promise(resolve=>server.close(resolve))))}
