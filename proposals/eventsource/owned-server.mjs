import http from'node:http';import{once}from'node:events';
export async function createOwnedSSEServer(){const requests=[],sockets=new Set(),counters=new Map();let origin,cross;
function handle(q,s){const u=new URL(q.url,'http://owned'),record={url:q.url,headers:q.rawHeaders,time:Date.now(),closed:false};requests.push(record);s.on('close',()=>record.closed=true);const key=u.searchParams.get('key')??u.pathname,count=(counters.get(key)??0)+1;counters.set(key,count);record.count=count;
 if(u.pathname==='/worker.js'){s.setHeader('content-type','text/javascript');s.end(`onmessage=async e=>{try{postMessage({result:await eval(e.data)})}catch(error){postMessage({error:String(error),stack:error.stack})}}`);return}
 if(u.pathname==='/doc'||u.pathname==='/frame'){s.setHeader('content-type','text/html');s.end('<!doctype html><body>Owned SSE');return}
 if(u.pathname==='/set'){s.setHeader('set-cookie','ownedSSE=real; Path=/');s.end('set');return}
 if(u.pathname==='/reject'){s.destroy();return}
 if(u.pathname==='/redirect'){s.writeHead(Number(u.searchParams.get('code')??301),{location:u.searchParams.get('to')});s.end();return}
 s.setHeader('content-type',u.searchParams.get('mime')??'text/event-stream');if(u.searchParams.has('cors')){s.setHeader('access-control-allow-origin',u.searchParams.get('cors')==='origin'?origin:'*');if(u.searchParams.has('credentials'))s.setHeader('access-control-allow-credentials','true')}
 s.statusCode=Number(u.searchParams.get('status')??200);if(s.statusCode!==200){s.end('data: wrong\n\n');return}
 s.flushHeaders();
 if(u.pathname==='/parser'){const data=Buffer.from('\ufeff: ignore\r\ndata:first\r\rdata:\r\nid: 42\r\nevent:custom\ndata: a\ndata:b\n\nid: lone\n\ndata:💩é\n\nid: bad\0id\nevent: other\ndata: tail\n\nevent:done\ndata:end\n\n');let i=0;const timer=setInterval(()=>{if(i===data.length){clearInterval(timer);s.end();return}s.write(data.subarray(i,i+1));i++},1);s.on('close',()=>clearInterval(timer));return}
 if(u.pathname==='/reconnect'){if(count===1)s.end('retry: 15\nid: 42\ndata:one\n\n');else{s.write('data:two\n\nevent:done\ndata:end\n\n')}return}
 if(u.pathname==='/id'){if(count===1)s.end('retry: 15\nid: '+u.searchParams.get('value')+'\ndata:one\n\n');else s.write('data:two\n\nevent:done\ndata:end\n\n');return}
 if(u.pathname==='/retry-hold'){if(count===1)s.end('retry: 80\ndata:first\n\n');else s.write('data:second\n\n');return}
 if(u.pathname==='/eof'){s.end('retry: 15\ndata:unterminated');return}
 if(u.pathname==='/hold'){s.write('retry: 15\ndata:held\n\n');return}
 s.end('retry: 60000\ndata:actual\n\nevent:done\ndata:end\n\n')
}
const server=http.createServer(handle),other=http.createServer(handle);for(const ownedServer of[server,other]){ownedServer.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{})});ownedServer.listen(0,'127.0.0.1');await once(ownedServer,'listening')}origin='http://127.0.0.1:'+server.address().port;cross='http://127.0.0.1:'+other.address().port;
return{origin,cross,requests,server,other,async close(){for(const socket of sockets)socket.destroy();for(const ownedServer of[server,other])await new Promise(r=>ownedServer.close(r))}};
}
