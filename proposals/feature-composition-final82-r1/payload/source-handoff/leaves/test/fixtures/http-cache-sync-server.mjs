import http from 'node:http';
import {parentPort} from 'node:worker_threads';

const requests=[];
const server=http.createServer((request,response)=>{
 if(request.url==='/log'){response.setHeader('content-type','application/json');response.end(JSON.stringify(requests));return}
 const ordinal=requests.length+1;requests.push({url:request.url,headers:request.headers,ordinal});
 response.setHeader('cache-control','public, max-age=600');response.setHeader('x-receipt',String(ordinal));
 if(request.url==='/document'){response.setHeader('content-type','text/html');response.end('<!doctype html><body>actual cache transport page');return}
 if(request.url==='/worker.js'){
  response.setHeader('content-type','application/javascript');
  response.end(`onmessage=async event=>{try{const xhr=new XMLHttpRequest();xhr.open('GET',event.data,false);xhr.responseType='arraybuffer';xhr.send();postMessage({status:xhr.status,text:xhr.statusText,receipt:xhr.getResponseHeader('x-receipt'),bytes:Array.from(new Uint8Array(xhr.response))})}catch(error){postMessage({error:{name:error.name,message:error.message}})}}`);return;
 }
 if(request.url==='/echo-cookie'){response.setHeader('cache-control','no-store');response.end(request.headers.cookie??'');return}
 if(request.url==='/validator'){
  response.setHeader('etag','"actual-sync-v1"');
  if(request.headers['if-none-match']==='"actual-sync-v1"'){response.statusCode=304;response.setHeader('set-cookie','actualSync=received; HttpOnly; SameSite=Lax; Path=/');response.end();return}
  response.setHeader('cache-control','no-cache');
 }
 response.end(Buffer.concat([Buffer.from(`${request.url}:actual ${ordinal}:`),Buffer.from([0,65,128,255,13,10,226,130,172])]));
});
server.listen(0,'127.0.0.1',()=>parentPort.postMessage({port:server.address().port}));
