// Real independently scheduled HTTP server, including synchronous-XHR callers.
import{parentPort}from'node:worker_threads';import http from'node:http';
const requests=[],timers=new Set(),prefix=Buffer.from('first actual prefix 🐼\n'),suffix=Buffer.from('second actual suffix\n'),binary=Buffer.from([0,255,128,195,40,65]);
const workerScript=`onmessage=async event=>{try{const r=await fetch(event.data.url);postMessage({url:r.url,status:r.status,bytes:[...new Uint8Array(await r.arrayBuffer())]})}catch(error){postMessage({error:{name:error.name,message:error.message}})}};`;
const server=http.createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const incoming=Buffer.concat(chunks),url=new URL(req.url,'http://127.0.0.1');let bytes,mime='text/plain; charset=UTF-8';
 if(url.pathname==='/doc'||url.pathname==='/frame'){bytes=Buffer.from('<!doctype html><meta charset=utf-8><body>Actual owned HTTP');mime='text/html; charset=UTF-8'}
 else if(url.pathname==='/worker.js'){bytes=Buffer.from(workerScript);mime='text/javascript; charset=UTF-8'}
 else if(url.pathname==='/binary'){bytes=binary;mime='application/octet-stream'}
 else if(url.pathname==='/echo'){bytes=incoming;mime=req.headers['content-type']??'application/octet-stream'}
 else if(url.pathname==='/encoding'){bytes=Buffer.from('actual é 🐼');mime=url.searchParams.get('type')??'text/plain'}
 else if(url.pathname==='/empty'){bytes=Buffer.alloc(0);mime='text/plain; charset=UTF-8'}
 else if(url.pathname==='/slow'){bytes=Buffer.concat([prefix,suffix]);mime='text/plain; charset=UTF-8'}else{res.writeHead(404);res.end('unknown owned route');return}
 const record={url:req.url,method:req.method,headers:req.headers,rawHeaders:req.rawHeaders,requestHex:incoming.toString('hex'),responseHex:bytes.toString('hex'),contentType:mime};requests.push(record);parentPort.postMessage({kind:'request',record});res.setHeader('content-type',mime);res.setHeader('content-length',bytes.length);
 if(url.pathname==='/slow'){res.flushHeaders();res.write(prefix);parentPort.postMessage({kind:'progress',url:req.url,stage:'sender-first-chunk',bytes:prefix.length});const timer=setTimeout(()=>{timers.delete(timer);if(!res.destroyed)res.end(suffix)},300);timers.add(timer);res.once('close',()=>{clearTimeout(timer);timers.delete(timer);parentPort.postMessage({kind:'progress',url:req.url,stage:'response-close'})})}else res.end(bytes);
});
server.listen(0,'127.0.0.1',()=>parentPort.postMessage({kind:'ready',port:server.address().port}));parentPort.on('message',message=>{if(message.kind==='close'){for(const timer of timers)clearTimeout(timer);server.closeAllConnections();server.close(()=>{parentPort.postMessage({kind:'closed'});parentPort.close()})}});
