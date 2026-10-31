// Independently written fixture-only WebSocket wire server. No engine code.
import http from 'node:http';
import { createHash } from 'node:crypto';
const LIMIT=128*1024; // The pinned receiver's message buffer is 128 KiB.
function frame(opcode,bytes){let head;if(bytes.length<126)head=Buffer.from([0x80|opcode,bytes.length]);else if(bytes.length<=65535){head=Buffer.alloc(4);head[0]=0x80|opcode;head[1]=126;head.writeUInt16BE(bytes.length,2);}else{head=Buffer.alloc(10);head[0]=0x80|opcode;head[1]=127;head.writeBigUInt64BE(BigInt(bytes.length),2);}return Buffer.concat([head,bytes]);}
export async function startFixtureWebSocket({port=9584}={}){
 const sockets=new Set(),requests=[],server=http.createServer((request,response)=>{response.writeHead(400);response.end();});
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
 server.on('upgrade',(request,socket,initial)=>{
  const entry={path:request.url,headers:request.rawHeaders.slice(),commands:[]};requests.push(entry);
  const exact=name=>{const i=request.rawHeaders.indexOf(name);return i<0?'':request.rawHeaders[i+1];};
  const key=exact('Sec-WebSocket-Key');if(!key){socket.destroy();return;}
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let pending=Buffer.alloc(0);
  const receive=part=>{
   pending=Buffer.concat([pending,part]);
   while(pending.length>=2){
    const opcode=pending[0]&15,masked=!!(pending[1]&128);let size=pending[1]&127,offset=2;
    if(size===126){if(pending.length<4)return;size=pending.readUInt16BE(2);offset=4;}
    else if(size===127){if(pending.length<10)return;const big=pending.readBigUInt64BE(2);if(big>BigInt(LIMIT)){socket.destroy();return;}size=Number(big);offset=10;}
    const full=offset+(masked?4:0)+size;if(full>LIMIT){socket.destroy();return;}if(pending.length<full)return;
    const mask=masked?pending.subarray(offset,offset+4):null;offset+=masked?4:0;const bytes=Buffer.from(pending.subarray(offset,full));pending=pending.subarray(full);
    if(mask)for(let i=0;i<bytes.length;i++)bytes[i]^=mask[i%4];
    if(opcode===8){socket.end(frame(8,bytes));return;}
    if(opcode===2){socket.write(frame(2,Buffer.concat([Buffer.from([238]),bytes])));continue;}
    if(opcode!==1)continue;
    const value=bytes.toString();if(entry.commands.length<1000)entry.commands.push({text:value.length<=160?value:null,length:bytes.length});
    if(value==='force-close'){socket.destroy();return;}
    if(value==='get-cookie')socket.write(frame(1,Buffer.from('cookie:'+exact('Cookie'))));
    else if(value==='get-origin')socket.write(frame(1,Buffer.from('origin:'+exact('Origin'))));
    else if(value.startsWith('send-large:')){
     const digits=value.slice(11),n=Number(digits);if(!/^\d+$/.test(digits)||!Number.isSafeInteger(n)||n>64*1024*1024){socket.destroy();return;}
     const bytes=Buffer.alloc(n);for(let i=0;i<n;i++)bytes[i]=65+i%26;socket.write(frame(1,bytes));
    }
    else if(value.startsWith('close:')){
     const rest=value.slice(6),colon=rest.indexOf(':');if(colon<0)continue;let code=Number(rest.slice(0,colon));if(!/^\d+$/.test(rest.slice(0,colon))||code>65535)code=1000;
     const reason=Buffer.from(rest.slice(colon+1)).subarray(0,123),bytes=Buffer.alloc(2+reason.length);bytes.writeUInt16BE(code);reason.copy(bytes,2);socket.write(frame(8,bytes));
    }else socket.write(frame(1,Buffer.concat([Buffer.from('echo-'),bytes])));
   }
  };
  socket.on('data',receive);if(initial.length)receive(initial);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {port:server.address().port,origin:`ws://127.0.0.1:${server.address().port}`,requests,owned:true,close:()=>new Promise(resolve=>{for(const socket of sockets)socket.destroy();server.close(resolve);})};
}
