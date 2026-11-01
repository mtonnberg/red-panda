// Independent TEST transport implementing selected observable endpoint contracts
// from lightpanda-io/browser src/test_routes.zig at
// 948d773786380bae36f046639fc61e2ddddd212a. No engine implementation is imported.
// The original external source tree retains its AGPL-3.0-only license.
import http from 'node:http';
import { createRouteState, serveExtra, extraRoutes } from './upstream-fixture-routes.mjs';
import { startFixtureWebSocket } from './upstream-fixture-websocket.mjs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';

const prefix = '/src/browser/tests/';
const inside = (root,path) => { const rel=relative(root,path); return rel==='' || (rel!=='..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)); };
const types = { '.html':'text/html', '.xhtml':'application/xhtml+xml', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.xml':'application/xml', '.txt':'text/plain', '.svg':'image/svg+xml', '.png':'image/png', '.gif':'image/gif', '.jpg':'image/jpeg', '.webp':'image/webp', '.wasm':'application/wasm' };
const xml = '<?xml version="1.0"?><catalog><item id="a"/><item id="b"/><pubDate>2026</pubDate></catalog>';
export const implementedRoutes = [
  '/', '/reset', '/xhr', '/xhr_empty', '/xhr/slow', '/xhr/hang', '/xhr/xml', '/xhr/xml_as_text', '/xhr/json', '/xhr/redirect',
  '/xhr/404', '/xhr/reason', '/xhr/duplicate_headers', '/xhr/401', '/xhr/500', '/xhr/bad_gzip', '/xhr/no_content_type', '/xhr/binary',
  '/src/browser/tests/401', '/404.js', '/status/:200-599', '/set_cookie', '/echo_headers', '/download_tool/echo_headers',
  '/redirect_same_echo_headers', '/redirect_cross_echo_headers', '/download_tool/redirect', '/echo_brotli',
];

export async function startFixtureServer(rootPath,{port=9582,profile='xhr-subset',webSocketPort=null}={}) {
  if (!['static','xhr-subset','upstream'].includes(profile)) throw new Error('Unknown fixture profile');
  const root=await realpath(resolve(rootPath)), requests=[], activeTimers=new Set();
  let origin;
  const state=createRouteState();
  let webSocket;
  const wait=(ms,response)=>new Promise(resolve=>{
    const finish=ok=>{clearTimeout(timer);activeTimers.delete(timer);response.off('close',closed);resolve(ok);};
    const closed=()=>finish(false);
    const timer=setTimeout(()=>finish(true),ms);activeTimers.add(timer);response.once('close',closed);
  });
  const metadata={profile,sourceCommit:'948d773786380bae36f046639fc61e2ddddd212a',sourceFile:'src/test_routes.zig',
    implementedDynamicRoutes:profile==='upstream'?[...implementedRoutes,...extraRoutes]:profile==='xhr-subset'?implementedRoutes:[],
    unsupportedRouteGroups:['CORS-specific endpoints','SSE','WebSocket :9584','raw HTTP responses','compression beyond /echo_brotli and deliberate bad-gzip','resource timing','serve-count counters','downloads beyond listed redirect'],
    completeUpstreamServer:false,
    routeContractCoverage:profile==='upstream'?'all branches in pinned test_routes.zig; separately validated wire transport':'partial',
    staticHeaderSidecars:profile==='upstream', canonicalPort:9582, webSocketPort:null,
    transportLimits:profile==='upstream'?['safe canonical static-root confinement','delay_ms capped at 120000ms','WebSocket send-large capped at 64MiB','ordinary Node HTTP framing differs from Zig except /raw/* and /latin1_response']:[]};
  if(profile==='upstream')metadata.unsupportedRouteGroups=['WebSocket transport not enabled; pass webSocketPort explicitly'];
  const server=http.createServer(async(request,response)=>{
    // Match the upstream fixture's explicit response header contract. Public
    // seams suppress Node's implicit additions; authored writeHead headers stay.
    if(profile==='upstream'){
      response.sendDate=false;
      response.removeHeader('Connection');
      response.removeHeader('Keep-Alive');
    }
    const entry={method:request.method,path:request.url,status:0,routeKnown:false};
    if(requests.length<10000)requests.push(entry);
    const send=(status,body='',headers={},reason)=>{
      if(response.destroyed)return;
      const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
      entry.status=status;
      response.writeHead(status,reason,{...headers,'Content-Length':bytes.length});
      response.end(request.method==='HEAD'?undefined:bytes);
    };
    try {
      const path=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
      if(path==='/__fixture_metadata'){entry.routeKnown=true;return send(200,JSON.stringify(metadata),{'Content-Type':'application/json'});}
      if(profile==='upstream'&&await serveExtra({request,response,entry,send,wait,root,state,port}))return;
      if(profile==='xhr-subset'||profile==='upstream'){
        const exact=request.url;
        if(implementedRoutes.includes(exact))entry.routeKnown=true;
        if(exact==='/')return send(200,'<html><head></head><body></body></html>',{'Content-Type':'text/html; charset=utf-8'});
        if(exact==='/reset')return send(200);
        if(exact==='/xhr')return send(200,'1234567890'.repeat(10),{'Content-Type':'text/html; charset=utf-8'});
        if(exact==='/xhr_empty')return send(200,'',{'Content-Type':'text/html; charset=utf-8'});
        if(exact==='/xhr/slow'||exact==='/xhr/hang'){
          const slow=exact.endsWith('/slow');if(!await wait(slow?100:2000,response))return;
          return send(200,slow?'slow':'hang',{'Content-Type':'text/plain'});
        }
        if(exact==='/xhr/xml'||exact==='/xhr/xml_as_text')return send(200,xml,{'Content-Type':exact.endsWith('_as_text')?'text/plain':'application/xml'});
        if(exact==='/xhr/json')return send(200,'{"over":"9000!!!","updated_at":1765867200000}',{'Content-Type':'application/json'});
        if(exact==='/xhr/redirect')return send(302,'',{Location:profile==='upstream'?'http://127.0.0.1:9582/xhr':`${origin}/xhr`});
        if(exact==='/xhr/404')return send(404,'Not Found',{'Content-Type':'text/plain'});
        if(exact==='/src/browser/tests/401')return send(401,'No',{'Content-Type':'text/plain'});
        if(exact==='/404.js')return send(404,'window.__404_body_executed = true;',{'Content-Type':'application/javascript'});
        if(exact==='/xhr/reason')return send(503,'',{},'HOUSTON WE HAVE A');
        if(exact==='/xhr/duplicate_headers')return send(200,'',{'X-B':['1','2, 3'],'X-A':'a','X_C':'c'});
        if(exact==='/xhr/401')return send(401,'No',{'WWW-Authenticate':'Basic realm="test"'});
        if(exact==='/xhr/500')return send(500,'Internal Server Error',{'Content-Type':'text/plain'});
        if(exact==='/xhr/bad_gzip')return send(200,'not actually gzip',{'Content-Encoding':'gzip'});
        if(exact==='/echo_brotli'){
          const chunks=[];let size=0;
          for await (const chunk of request){size+=chunk.length;if(size>4*1024*1024)return send(413,'Fixture request body exceeds 4 MiB');chunks.push(chunk);}
          return send(200,Buffer.concat(chunks),{'Content-Type':'application/octet-stream','Content-Encoding':'br'});
        }
        if(exact==='/xhr/no_content_type')return send(200,'untyped');
        if(exact==='/xhr/binary')return send(200,Buffer.from([0,0,1,2,0,0,9]),{'Content-Type':'application/octet-stream'});
        if(/^\/status\/\d{3}$/.test(exact)){
          const status=Number(exact.slice('/status/'.length));
          if(status>=200&&status<=599){entry.routeKnown=true;return send(status);}
        }
        if(exact==='/set_cookie')return send(200,'',{'Set-Cookie':'lp_hidden=1; Path=/set_cookie_scope','X-Visible':'yes'});
        if(exact==='/download_tool/redirect')return send(302,'',{'Set-Cookie':'lp_redirect=1; Path=/download_tool',Location:'/download_tool/echo_headers'});
        if(exact==='/redirect_same_echo_headers')return send(302,'',{Location:'/echo_headers'});
        if(exact==='/redirect_cross_echo_headers')return send(302,'',{Location:profile==='upstream'?'http://localhost:9582/echo_headers':`http://localhost:${server.address().port}/echo_headers`});
        if(exact==='/echo_headers'||exact==='/download_tool/echo_headers'){
          const cors={'Access-Control-Allow-Origin':request.headers.origin??'*'};
          if(request.method==='OPTIONS')return send(200,'',{...cors,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'x-hop'});
          const lines=[];for(let i=0;i<request.rawHeaders.length;i+=2)lines.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i+1]}\n`);
          return send(200,lines.join(''),{...cors,'Content-Type':'text/plain; charset=utf-8'});
        }
      }
      if(profile!=='upstream'&&!['GET','HEAD'].includes(request.method))return send(405,'Unsupported fixture request method',{'Content-Type':'text/plain'});
      if(!path.startsWith(prefix)||path.includes('\\'))return send(404,'Unsupported fixture route',{'Content-Type':'text/plain'});
      const candidate=resolve(root,path.slice(prefix.length).replace(/^\/+/,''));
      if(!inside(root,candidate))return send(403,'Outside fixture root',{'Content-Type':'text/plain'});
      const canonical=await realpath(candidate);
      if(!inside(root,canonical))return send(403,'Symlink escapes fixture root',{'Content-Type':'text/plain'});
      if(!(await stat(canonical)).isFile())return send(404,'Not a fixture file',{'Content-Type':'text/plain'});
      const delay=new URL(request.url,'http://127.0.0.1').searchParams.get('delay_ms');
      if(delay!==null){const ms=Number(delay);if(!Number.isInteger(ms)||ms<0||ms>120000)return send(400,'Unsupported fixture delay');if(!await wait(ms,response))return;}
      entry.routeKnown=true;
      const headers=profile==='upstream'?{'Content-Type':canonical.endsWith('.GB2312.html')?'text/html; charset=GB2312':({'.js':'text/javascript','.html':'text/html','.htm':'text/html','.txt':'text/plain','.xhtml':'application/xhtml+xml','.md':'text/markdown','.xml':'text/xml','.wasm':'application/wasm','.mjs':'text/javascript'}[extname(canonical)]??'text/html')}:{'Content-Type':types[extname(canonical)]??'application/octet-stream','Cache-Control':'no-store'};
      if(profile==='upstream'){
        try {const sidecarPath=await realpath(canonical+'.headers');if(!inside(root,sidecarPath))return send(403,'Header sidecar escapes fixture root');const sidecar=await readFile(sidecarPath);if(sidecar.length>1024)throw new Error('Header sidecar exceeds source bound');let count=0;for(const line of sidecar.toString().split(/[\r\n]+/).filter(Boolean)){const colon=line.indexOf(':');if(colon<0||++count>7)throw new Error('Invalid fixture header sidecar');const name=line.slice(0,colon).trim(),value=line.slice(colon+1).trim();const old=Object.keys(headers).find(x=>x.toLowerCase()===name.toLowerCase());if(old)delete headers[old];headers[name]=value;}}
        catch(error){if(error.code!=='ENOENT')throw error;}
      }
      return send(200,await readFile(canonical),headers);
    }catch(error){send(error.status??(error instanceof URIError?400:404),'Fixture unavailable',{'Content-Type':'text/plain'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  if(webSocketPort!==null){try{webSocket=await startFixtureWebSocket({port:webSocketPort});metadata.webSocketPort=webSocket.port;if(profile==='upstream')metadata.unsupportedRouteGroups=[];}catch(error){await new Promise(resolve=>server.close(resolve));throw error;}}
  return {origin,requests,metadata,webSocket,owned:true,close:async()=>{await webSocket?.close();await new Promise(resolve=>{
    server.closeAllConnections();for(const timer of activeTimers)clearTimeout(timer);activeTimers.clear();server.close(resolve);
  });}};
}
