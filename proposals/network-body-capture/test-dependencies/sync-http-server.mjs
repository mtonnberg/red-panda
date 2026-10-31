import {parentPort} from 'node:worker_threads';
import http from 'node:http';
const log=[],sockets=new Set();
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture'),chunks=[];for await(const chunk of req)chunks.push(chunk);
 const body=Buffer.concat(chunks);log.push({path:url.pathname,method:req.method,headers:req.headers,body:body.toString('base64')});
 if(url.pathname==='/log'){res.setHeader('content-type','application/json');res.end(JSON.stringify(log));return}
 if(url.pathname==='/slow'){setTimeout(()=>res.end('slow'),500);return}
 if(url.pathname==='/close'){req.socket.destroy();return}
 if(url.pathname==='/redirect'){res.writeHead(Number(url.searchParams.get('status')??302),{location:url.searchParams.get('to')});res.end();return}
 if(url.pathname==='/latin'){res.setHeader('content-type','text/plain;charset=windows-1252');res.end(Buffer.from([0xef,0xbb,0xbf,0x63,0x61,0x66,0xe9]));return}
 if(url.pathname==='/cors'){
  res.setHeader('access-control-allow-origin',url.searchParams.has('deny')?'http://denied.invalid':req.headers.origin??'null');
  res.setHeader('access-control-allow-credentials','true');res.setHeader('access-control-allow-methods','GET, POST, PUT');res.setHeader('access-control-allow-headers','x-custom, content-type');
  res.setHeader('access-control-expose-headers','x-visible');res.setHeader('x-visible','yes');res.setHeader('x-hidden','secret');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 }
 if(url.pathname==='/')return res.end('<!doctype html><title>Sync XHR</title>');
 res.setHeader('content-type','application/json');res.setHeader('set-cookie','syncCookie=received; Path=/');
 res.end(JSON.stringify({method:req.method,headers:req.headers,body:body.toString(),base64:body.toString('base64')}));
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});
server.listen(0,'127.0.0.1',()=>parentPort.postMessage({port:server.address().port}));
parentPort.on('message',message=>{if(message==='close'){for(const socket of sockets)socket.destroy();server.close(()=>parentPort.close())}});
