// Owned TEST transport for the single audited /echo_method contract at pinned
// upstream src/test_routes.zig:826. No engine implementation is imported.
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {startFixtureServer} from './helpers/upstream-fixture-server.mjs';
const root='/tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests';
const here=new URL('./',import.meta.url),manifest=JSON.parse(await readFile(new URL('./manifest.json',here)));
const staticServer=await startFixtureServer(root,{port:0,profile:'static'}),requests=[];
const server=http.createServer(async(request,response)=>{
 const entry={method:request.method,path:request.url,routeKnown:false,status:0};requests.push(entry);
 if(new URL(request.url,'http://fixture.test').pathname==='/echo_method'){
  for await(const _ of request){};
  const bytes=Buffer.from(`<html><body>method=${request.method}</body></html>`);
  entry.routeKnown=true;entry.status=200;response.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':bytes.length});response.end(bytes);return;
 }
 const forwarded=http.request(new URL(request.url,staticServer.origin),{method:request.method,headers:request.headers},upstream=>{
  entry.status=upstream.statusCode;entry.routeKnown=upstream.statusCode===200;
  response.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(response);
 });
 forwarded.on('error',error=>{entry.error=error.message;response.destroy(error);});request.pipe(forwarded);
});
const report={scope:'Exact source-only method echo transport recheck after static-only48 disclosed missing route; unchanged assertions; separate outcomes',port:9582,routeSource:'upstream src/test_routes.zig:826',candidateSnapshot:manifest.snapshot,cases:[]};
try{
 server.listen(9582,'127.0.0.1');await once(server,'listening');
 for(const[actor,binary]of [['native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'],['candidate',`${manifest.snapshot}/bin/red-panda.js`]]){
  const reportName=`${actor}-fragment-route.json`,offset=requests.length;
  const args=['--experimental-vm-modules',new URL('./helpers/conformance.mjs',here).pathname,'--root',root,'--binary',binary,'--test','frames/fragment_navigation.html','--isolate','--browser-arg=--load-resources','--browser-arg=iframe','--browser-arg=--load-resources','--browser-arg=worker','--timeout','15000','--settle-ms','100','--fixture-origin','http://127.0.0.1:9582','--report',new URL(reportName,here).pathname];
  const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];
  child.stdout.on('data',data=>stdout.push(data));child.stderr.on('data',data=>stderr.push(data));
  const[exitCode,signal]=await once(child,'exit');
  await writeFile(new URL(`${actor}-fragment-route.stdout.json`,here),Buffer.concat(stdout));await writeFile(new URL(`${actor}-fragment-route-progress.txt`,here),Buffer.concat(stderr));
  const observation=JSON.parse(await readFile(new URL(reportName,here)));
  report.cases.push({actor,runnerArguments:args,exitCode,signal,counts:observation.counts,requests:requests.slice(offset),unavailableRoutes:requests.slice(offset).filter(value=>!value.routeKnown)});
  process.stdout.write(JSON.stringify({actor,counts:observation.counts})+'\n');
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await staticServer.close();}
report.cleanup='owned canonical9582 and backing port0 servers/HTTP connections and both runner-owned browser processes closed';await writeFile(new URL('./echo-method-transport.json',here),JSON.stringify(report,null,2)+'\n');
