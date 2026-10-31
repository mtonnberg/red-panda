import{parentPort,workerData}from'node:worker_threads';import http from'node:http';import{WebSocketServer}from'ws';
const wire=[],payload=request=>{const cookie=request.headers.cookie??'';const value={url:request.url,cookie,cookieBytes:[...Buffer.from(cookie,'latin1')]};wire.push(value);return value};
const server=http.createServer((request,response)=>{const value=payload(request),url=new URL(request.url,'http://actual.invalid');
 if(workerData?.scripts?.[url.pathname]){response.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});response.end(workerData.scripts[url.pathname]);return}
 if(url.pathname==='/event'){response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});response.end('data: '+JSON.stringify(value)+'\n\n');return}
 if(url.pathname==='/echo'){response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));return}
 response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});response.end('<!doctype html><script>globalThis.actualReady=true</script>');
});const sockets=new WebSocketServer({server});sockets.on('connection',(socket,request)=>{socket.send(JSON.stringify(payload(request)));socket.close()});server.listen(0,'127.0.0.1',()=>parentPort.postMessage({ready:true,origin:'http://127.0.0.1:'+server.address().port}));parentPort.on('message',message=>{if(message==='wire')parentPort.postMessage({wire})});
