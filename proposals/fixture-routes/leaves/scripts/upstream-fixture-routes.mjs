// Independently written TEST transport for pinned upstream fixture contracts.
// No browser engine source is imported. See the proposal's source hash ledger.
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
export const extraRoutes = [
 '/resource-timing/tao','/resource-timing/plain','/resource-timing/redirect','/redirect-no-fragment','/redirect-with-fragment',
 '/redirect-cross-origin-x-hop','/redirect-cross-origin/*','/echo-x-hop','/redirect-target','/303-no-location','/300-with-location',
 '/defer-marker.js','/serve-count/:name.js','/challenge/vercel','/stop_loading/streaming.html',
 '/sse/simple','/sse/streaming','/sse/flag','/sse/reconnect','/sse/long_retry','/sse/404','/sse/badmime',
 '/styles/important-cascade.css','/styles/visibility.css','/styles/visibility2.css','/styles/latin1-header.css',
 '/styles/latin1-at-charset.css','/styles/truncated-utf8.css','/styles/404.css','/styles/large.css','/styles/oversize.css',
 '/latin1_response','/scripts/bom-over-header.js','/scripts/latin1/*','/scripts/latin1-header/*',
 '/images/ok.png*','/images/small.png*','/images/photo.jpg','/images/chunked.png','/images/404.png*','/images/500.png','/images/redirect.png',
 '/echo_referer','/referer_link.html','/echo_method','/beacon/store/*','/beacon/read/*','/echo_body',
 '/redirect_same_echo_referer','/redirect_cross_echo_referer','/redirect_to_echo','/download/report.csv','/download/missing.csv',
 '/download_tool/no_content','/raw/:gzip|cacheable|revalidated|large','/favicon.ico',
];
export const rawResponses = Object.freeze({
 gzip:{head:'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Encoding: gzip\r\nContent-Length: 29\r\n\r\n',body:Buffer.from('1f8b08000000000002ff4b4c1c05a360140c77000003da389ae8030000','hex')},
 cacheable:{head:'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nCache-Control: max-age=600\r\nContent-Length: 11\r\n\r\n',body:Buffer.from('hello world')},
 revalidated:{head:'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nCache-Control: no-cache\r\nETag: "v1"\r\nContent-Length: 11\r\n\r\n',body:Buffer.from('hello world')},
 not_modified:{head:'HTTP/1.1 304 Not Modified\r\nCache-Control: no-cache\r\nETag: "v1"\r\n\r\n',body:Buffer.alloc(0)},
 large:{head:'HTTP/1.1 200 OK\r\nContent-Length: 262144\r\n\r\n',body:Buffer.alloc(256*1024,97)},
});
export function createRouteState(){return {flag:false,reconnectHits:0,counts:new Map(['defer','async','dynamic','prescan_blocking','prescan_defer','prescan_module'].map(x=>[x,0])),beacons:[]};}
export function resetRouteState(state){state.flag=false;state.reconnectHits=0;state.beacons.length=0;for(const key of state.counts.keys())state.counts.set(key,0);}
const html={'Content-Type':'text/html; charset=utf-8'},text={'Content-Type':'text/plain; charset=utf-8'},css={'Content-Type':'text/css'},sse={'Content-Type':'text/event-stream'};
const latin=value=>Buffer.from(value,'latin1');
async function readBody(request,limit){const chunks=[];let size=0;for await(const part of request){size+=part.length;if(size>limit){const error=new Error('Fixture body bound');error.status=413;throw error;}chunks.push(part);}return Buffer.concat(chunks);}
function raw(request,response,entry,head,body){entry.status=Number(head.split(' ')[1]);entry.rawResponse=true;response.detachSocket(request.socket);request.socket.end(Buffer.concat([latin(head),body]));}
export async function serveExtra({request,response,entry,send,wait,root,state,port}){
 const path=request.url, redirect=location=>send(302,'',{Location:location}),sendText=body=>send(200,body,text);
 // The pinned contracts intentionally keep canonical redirects on :9582. A
 // port-0 server is useful for transport tests but is not a fixture URL rewrite.
 const cross=suffix=>`http://localhost:9582/${suffix}`;
 if(path==='/reset'){resetRouteState(state);send(200);return true;}
 if(path==='/resource-timing/tao')send(200,'window.__rt_tao = true;',{'Content-Type':'text/javascript','Timing-Allow-Origin':'https://example.com, *'});
 else if(path==='/resource-timing/plain')send(200,'window.__rt_plain = true;',{'Content-Type':'text/javascript'});
 else if(path==='/resource-timing/redirect')redirect('/resource-timing/plain');
 else if(path==='/redirect-no-fragment')redirect('/redirect-target');
 else if(path==='/redirect-with-fragment')redirect('/redirect-target#target_fragment');
 else if(path==='/redirect-cross-origin-x-hop')redirect(cross('echo-x-hop'));
 else if(path.startsWith('/redirect-cross-origin/'))redirect(cross(path.slice('/redirect-cross-origin/'.length)));
 else if(path==='/echo-x-hop')sendText(request.headers['x-hop']??'NONE');
 else if(path==='/redirect-target')send(200,'<!DOCTYPE html><title>landed</title>',html);
 else if(path==='/303-no-location')send(303,'<!DOCTYPE html><title>landed</title><p>see other body</p>',html);
 else if(path==='/300-with-location')send(300,'<!DOCTYPE html><title>choices</title><p>multiple choices body</p>',{...html,Location:'http://127.0.0.1:9582/hi.html'});
 else if(path==='/defer-marker.js')send(200,'window.__deferRan = true;',{'Content-Type':'application/javascript'});
 else if(path.startsWith('/serve-count/')&&path.endsWith('.js')){
  const name=path.slice('/serve-count/'.length,-3);if(!state.counts.has(name))send(404,'unknown counter');else {const n=state.counts.get(name)+1;state.counts.set(name,n);send(200,`window.__serve_count_${name} = ${n};`,{'Content-Type':'application/javascript','Cache-Control':'no-store'});}
 }
 else if(path==='/challenge/vercel')send(429,'<title>Vercel Security Checkpoint</title>',{...html,'x-vercel-mitigated':'challenge'});
 else if(path==='/stop_loading/streaming.html'){
  entry.status=200;response.writeHead(200,html);response.write('<html><body><p id=first>first</p>');if(await wait(1500,response))response.end('<p id=second>second</p></body></html>');
 }
 else if(path==='/sse/simple')send(200,'retry: 1000\ndata: first\n\n: comment\nid: 42\nevent: custom\ndata: a\ndata: b\n\n',sse);
 else if(path==='/sse/streaming'){
  state.flag=false;entry.status=200;response.writeHead(200,sse);response.write('data: first\n\n');
  for(let elapsed=0;!state.flag&&elapsed<5000;elapsed+=10)if(!await wait(10,response))return true;
  if(state.flag){response.write('data: sec');if(!await wait(20,response))return true;response.write('ond\n\n');}response.end();
 }
 else if(path==='/sse/flag'){state.flag=true;send(200);}
 else if(path==='/sse/reconnect')send(200,state.reconnectHits++===0?'retry: 10\ndata: one\n\n':'data: two\n\n',sse);
 else if(path==='/sse/long_retry')send(200,'retry: 60000\ndata: x\n\n',sse);
 else if(path==='/sse/404')send(404,'data: x\n\n',sse);
 else if(path==='/sse/badmime')send(200,'data: x\n\n',{'Content-Type':'text/plain'});
 else if(path==='/styles/important-cascade.css')send(200,'.no-js-flex { display: none !important; }',css);
 else if(path==='/styles/visibility.css')send(200,'.ext-hide { display: none; }',css);
 else if(path==='/styles/visibility2.css')send(200,'.ext-hide-2 { display: none; }',css);
 else if(path==='/styles/latin1-header.css')send(200,latin('/* caf\xe9 */ .by-header { display: none; --name: "caf\xe9"; }'),{'Content-Type':'text/css; charset=iso-8859-1'});
 else if(path==='/styles/latin1-at-charset.css')send(200,latin('@charset "windows-1252"; /* caf\xe9 */ .by-at-charset { display: none; }'),css);
 else if(path==='/styles/truncated-utf8.css')send(200,latin('.before-truncated { display: none; } \xe2'),css);
 else if(path==='/latin1_response')raw(request,response,entry,'HTTP/1.1 200 Caf\xe9\r\nContent-Type: text/plain\r\nX-Latin1: La\xa0Paz\r\nX-Caf\xe9: 1\r\nContent-Length: 6\r\n\r\n',latin('latin1'));
 else if(path==='/scripts/bom-over-header.js')send(200,Buffer.from("\ufeffwindow.byBom = 'café';"),{'Content-Type':'text/javascript; charset=iso-8859-1'});
 else if(path.startsWith('/scripts/latin1/')||path.startsWith('/scripts/latin1-header/'))send(200,latin(`window['${basename(path,extname(path))}'] = 'caf\xe9';`),{'Content-Type':path.startsWith('/scripts/latin1-header/')?'text/javascript; charset=iso-8859-1':'text/javascript'});
 else if(path==='/styles/404.css')send(404,'/* unused */',css);
 else if(path==='/styles/large.css'||path==='/styles/oversize.css'){
  const chunk='.pad { color: #abcdef; } ',large=path==='/styles/large.css',n=large?Math.floor(5*1024*1024/2/chunk.length):Math.floor(4*1024*1024/chunk.length)+1024;
  send(200,chunk.repeat(n)+(large?'.large-hide { display: none; }':''),css);
 }
 else if(path.startsWith('/images/ok.png')){const image=await readFile(join(root,'fixtures/images/1000x750.png')),body=Buffer.alloc(16*1024+1,120);image.copy(body);send(200,body,{'Content-Type':'image/png'});}
 else if(path.startsWith('/images/small.png'))send(200,await readFile(join(root,'fixtures/images/320x240.png')),{'Content-Type':'image/png'});
 else if(path==='/images/photo.jpg')send(200,await readFile(join(root,'fixtures/images/1000x750.jpg')),{'Content-Type':'image/jpeg'});
 else if(path==='/images/chunked.png'){entry.status=200;response.writeHead(200,{'Content-Type':'image/svg+xml'});response.write('<svg xmlns="http://www.w3.org/2000/svg"/>');response.end();}
 else if(path.startsWith('/images/404.png'))send(404,'not here',{'Content-Type':'text/plain'});
 else if(path==='/images/500.png')send(500,'boom',{'Content-Type':'text/plain'});
 else if(path==='/images/redirect.png')redirect('/images/ok.png');
 else if(path==='/echo_referer')send(200,`<html><body>referer=${request.headers.referer??'NONE'}</body></html>`,{...html,'Access-Control-Allow-Origin':request.headers.origin??'*'});
 else if(path==='/referer_link.html')send(200,'<html><body><a id="link" href="/echo_referer">go</a></body></html>',html);
 else if(path==='/echo_method')send(200,`<html><body>method=${request.method}</body></html>`,html);
 else if(path.startsWith('/beacon/store/')){
  const id=path.slice('/beacon/store/'.length),type=request.headers['content-type']??'(missing)',body=await readBody(request,128*1024);
  if(Buffer.byteLength(id)<=32&&state.beacons.length<32){const line=Buffer.concat([Buffer.from(`${request.method}|${type}|${body.length}|`),body.subarray(0,64)]);state.beacons.push({id,record:line.length<=256?line:Buffer.alloc(0)});}send(200);
 }
 else if(path.startsWith('/beacon/read/'))send(200,state.beacons.find(x=>x.id===path.slice('/beacon/read/'.length))?.record??'(missing)',text);
 else if(path==='/echo_body')send(200,await readBody(request,4096),text);
 else if(path==='/redirect_same_echo_referer')redirect('/echo_referer');
 else if(path==='/redirect_cross_echo_referer')redirect(cross('echo_referer'));
 else if(path==='/redirect_to_echo')redirect('/echo_method');
 else if(path==='/download/report.csv')send(200,'col1,col2\nhello,world\n42,1337\n',{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="report.csv"'});
 else if(path==='/download/missing.csv')send(404,'not found',{'Content-Type':'text/plain','Content-Disposition':'attachment; filename="missing.csv"'});
 else if(path==='/download_tool/no_content')send(204);
 else if(path.startsWith('/raw/')){
  // Upstream's conditional detection is deliberately case-sensitive on rawhead.
  const rawHead=`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`+request.rawHeaders.reduce((head,value,index)=>head+(index%2?value+'\r\n':value+': '),'');
  const conditional=rawHead.includes('If-None-Match:');
  const value=conditional?rawResponses.not_modified:rawResponses[path.slice('/raw/'.length)];
  if(!value||path==='/raw/not_modified'&&!conditional)send(404,'unknown raw response');else raw(request,response,entry,value.head,value.body);
 }
 else if(path==='/favicon.ico')send(404);
 else return false;
 entry.routeKnown=true;return true;
}
