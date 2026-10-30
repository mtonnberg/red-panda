// Bounded independent CLI observations. Each case owns a fresh process; HTTP and
// filesystem fixtures contain only test-authored values. No engine is imported.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const binary=process.argv[2],output=process.argv[3];if(!binary||!output)throw new Error('binary and fresh report path required');
const digest=b=>createHash('sha256').update(b).digest('hex');const binarySHA256=digest(await readFile(binary));
if(binary.includes('lightpanda')&&binarySHA256!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw new Error('Reference binary digest mismatch');
const dir=await mkdtemp(join(tmpdir(),'red-panda-cli-workflows-'));await writeFile(join(dir,'wait.js'),'globalThis.__auditReady===42');await writeFile(join(dir,'false.js'),'false');
const requests=[],timers=new Set();const server=http.createServer((req,res)=>{
 const entry={path:req.url,headers:req.headers};requests.push(entry);if(process.argv[5]==='close')res.setHeader('Connection','close');res.setHeader('Content-Type','text/html');
 const delayed=(ms,body)=>{const timer=setTimeout(()=>{timers.delete(timer);if(!res.destroyed)res.end(body);},ms);timers.add(timer);};
 if(req.url==='/slow-main')return delayed(5700,'<h1>late main</h1>');
 if(req.url==='/slow-frame')return delayed(700,'<p>late frame</p>');
 if(req.url==='/parent')return res.end('<!doctype html><div id="ready">ready</div><p id="state">pending</p><script>globalThis.__auditReady=42</script><iframe src="/slow-frame" onload="document.getElementById(\'state\').textContent=\'loaded\'"></iframe>');
 if(req.url==='/delayed-marker')return res.end('<!doctype html><script>setTimeout(()=>{globalThis.__auditReady=42;document.body.innerHTML="<h1 id=ready>delayed</h1>"},60)</script>');
 if(req.url==='/redirect'){res.writeHead(302,{Location:'/ok'});return res.end();}
 if(req.url==='/header-redirect'){res.writeHead(302,{Location:'/headers'});return res.end();}
 if(req.url==='/headers')return res.end('<!doctype html><pre id="headers">'+JSON.stringify({'x-audit':req.headers['x-audit']??null,'user-agent':req.headers['user-agent']??null,'accept-language':req.headers['accept-language']??null})+'</pre>');
 if(req.url==='/page-fetch')return res.end('<!doctype html><script>fetch("/headers",{headers:{"X-Audit":"page"}}).then(r=>r.text()).then(s=>{document.body.innerHTML=s;document.body.id="done"})</script>');
 if(req.url==='/bad'){res.statusCode=404;return res.end('<h1>missing</h1>');}
 if(req.url==='/loop')return res.end('<!doctype html><script>while(true){}</script>');
 res.end('<!doctype html><h1 id="ready">CLI output</h1>');
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const cases=[
 ['implicit-script-none',['fetch','--json','--dump','html','--dump-selector','#state','--load-resources','iframe','--wait-script','globalThis.__auditReady===42',origin+'/parent']],
 ['explicit-script-load',['fetch','--json','--dump','html','--dump-selector','#state','--load-resources','iframe','--wait-script','globalThis.__auditReady===42','--wait-until','load',origin+'/parent']],
 ['implicit-selector-none',['fetch','--json','--dump','html','--dump-selector','#state','--load-resources','iframe','--wait-selector','#ready',origin+'/parent']],
];
const observations=[];
try{
 for(const[label,args]of cases.filter(([label])=>!process.argv[4]||JSON.parse(process.argv[4]).includes(label))){const started=performance.now(),offset=requests.length;const row=await new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',killedByProbe=false,firstStdoutMs=null,firstStderrMs=null;const timer=setTimeout(()=>{killedByProbe=true;child.kill('SIGKILL');},8000);child.stdout.on('data',b=>{firstStdoutMs??=Number((performance.now()-started).toFixed(2));stdout+=b});child.stderr.on('data',b=>{firstStderrMs??=Number((performance.now()-started).toFixed(2));stderr+=b});child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({label,args,code,signal,killedByProbe,firstStdoutMs,firstStderrMs,elapsedMs:Number((performance.now()-started).toFixed(2)),stdout,stderr,requests:requests.slice(offset)})});});
  try{row.json=JSON.parse(row.stdout)}catch{}observations.push(row);console.log(label,row.code,row.signal??'',row.elapsedMs);
 }
}finally{for(const timer of timers)clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
await writeFile(output,JSON.stringify({scope:'Bounded owned real CLI processes, stdout/stderr/exits/requests; runtime observations rather than help inference',binary:{path:binary,sha256:binarySHA256},driverSHA256:digest(await readFile(new URL(import.meta.url))),origin,responseConnection:process.argv[5]==='close'?'close':'default-keepalive',observations},null,2)+'\n',{flag:'wx'});
