import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const overlay=new URL('./cli-integration.mjs',import.meta.url).href;
const executable=new URL('../../bin/red-panda.js',import.meta.url);
async function cli(args){return await new Promise((resolve,reject)=>{
 const processChild=spawn(process.execPath,['--experimental-vm-modules','--import',overlay,executable.pathname,...args],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 const timer=setTimeout(()=>processChild.kill('SIGKILL'),12000);processChild.on('error',e=>{clearTimeout(timer);reject(e)});processChild.stdout.on('data',b=>stdout+=b);processChild.stderr.on('data',b=>stderr+=b);processChild.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderr,json:(()=>{try{return JSON.parse(stdout)}catch{return undefined}})()})});
});}
async function fixture(t){const requests=[],timers=new Set(),dir=await mkdtemp(join(tmpdir(),'red-panda-cli-proposal-test-'));const server=http.createServer((req,res)=>{
 requests.push({path:req.url,headers:req.headers});res.setHeader('Content-Type','text/html');res.setHeader('Connection','close');
 if(req.url==='/redirect'){res.writeHead(302,{Location:'/headers'});return res.end();}
 if(req.url==='/headers')return res.end('<pre id="result">'+JSON.stringify({audit:req.headers['x-audit']??null,cookie:req.headers.cookie??null,language:req.headers['accept-language']??null})+'</pre>');
 if(req.url==='/fetch')return res.end('<script>fetch("/headers",{headers:{"X-Audit":"page"}}).then(r=>r.text()).then(html=>{document.body.innerHTML=html;document.body.id="done"})</script>');
 if(req.url==='/parent')return res.end('<p id="state">pending</p><script>globalThis.__ready=42</script><iframe src="/held" onload="document.getElementById(\'state\').textContent=\'loaded\'"></iframe>');
 if(req.url==='/held'){const timer=setTimeout(()=>{timers.delete(timer);if(!res.destroyed)res.end('<p>child</p>')},350);timers.add(timer);return;}
 if(req.url==='/delayed')return res.end('<script>setTimeout(()=>{globalThis.__ready=42;document.body.innerHTML="<p id=result>actual change</p>"},50)</script>');
 res.end('<!doctype html><article><h1>Writer output</h1><pre>line\n\n</pre></article>');
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();for(const timer of timers)clearTimeout(timer);await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});return{origin:`http://127.0.0.1:${server.address().port}`,requests,dir};}

test('existing no-dump default remains empty and bare dump selects actual HTML rather than consuming its URL',async t=>{
 const{origin}=await fixture(t);const plain=await cli(['fetch',origin+'/ok']);assert.equal(plain.code,0,plain.stderr);assert.equal(plain.stdout,'');
 const bare=await cli(['fetch','--json','--dump',origin+'/ok']);assert.equal(bare.code,0,bare.stderr);assert.equal(bare.json.dump,'html');assert.match(bare.json.content,/<h1>Writer output<\/h1>/);
});

test('unrecognized separated dump value remains an owned URL positional and enables HTML for both results',async t=>{
 const{origin,requests}=await fixture(t);const result=await cli(['fetch','--json','--dump',origin+'/first',origin+'/second']);assert.equal(result.code,0,result.stderr);assert.equal(result.json.results.length,2);assert.deepEqual(result.json.results.map(r=>r.url),[origin+'/first',origin+'/second']);assert.deepEqual(result.json.results.map(r=>r.dump),['html','html']);assert.deepEqual(requests.map(r=>r.path),['/first','/second']);
});

test('wait script files evaluate actual page state and obey CLI-order last assignment',async t=>{
 const{origin,dir}=await fixture(t);const file=join(dir,'wait.js');await writeFile(file,'globalThis.__ready===42');const waited=await cli(['fetch','--json','--dump','html','--dump-selector','#result','--wait-script-file',file,origin+'/delayed']);assert.equal(waited.code,0,waited.stderr);assert.equal(waited.json.content,'<p id="result">actual change</p>');
 const falseFile=join(dir,'false.js');await writeFile(falseFile,'false');const failed=await cli(['fetch','--json','--wait-ms','400','--wait-script','true','--wait-script-file',falseFile,origin+'/ok']);assert.equal(failed.code,1);assert.equal(failed.json.error,'Timeout');
 const overwritten=await cli(['fetch','--json','--wait-ms','400','--wait-script-file',falseFile,'--wait-script','true',origin+'/ok']);assert.equal(overwritten.code,0,overwritten.stderr);assert.equal(overwritten.json.error,null);
});

test('unreadable wait files fail before any HTTP request even when a later expression replaces their value',async t=>{
 const{origin,dir,requests}=await fixture(t);const result=await cli(['fetch','--json','--wait-script-file',join(dir,'absent.js'),'--wait-script','true',origin+'/ok']);assert.equal(result.code,1);assert.equal(result.stdout,'');assert.match(result.stderr,/absent\.js/);assert.equal(requests.length,0);
});

test('implicit readiness for wait predicates observes genuine state before a pending frame load; explicit load remains respected',async t=>{
 const{origin}=await fixture(t);const flags=['fetch','--json','--dump','html','--dump-selector','#state','--load-resources','iframe','--wait-script','globalThis.__ready===42'];
 const early=await cli([...flags,origin+'/parent']);assert.equal(early.code,0,early.stderr);assert.equal(early.json.content,'<p id="state">pending</p>');
 const loaded=await cli([...flags,'--wait-until','load',origin+'/parent']);assert.equal(loaded.code,0,loaded.stderr);assert.equal(loaded.json.content,'<p id="state">loaded</p>');
});

test('CLI HTTP headers use actual case-insensitive last values on redirects and override authored fetch headers',async t=>{
 const{origin,requests}=await fixture(t);const flags=['fetch','--json','--dump','html','--dump-selector','#result'];
 const redirect=await cli([...flags,'--http-header','X-Audit: first','--http-header',' x-audit : last ',origin+'/redirect']);assert.equal(redirect.code,0,redirect.stderr);assert.equal(JSON.parse(redirect.json.content.replace(/^<pre id="result">|<\/pre>$/g,'')).audit,'last');assert.deepEqual(requests.slice(0,2).map(r=>r.headers['x-audit']),['last','last']);
 const fetched=await cli([...flags,'--http-header','X-Audit: cli','--wait-selector','#done',origin+'/fetch']);assert.equal(fetched.code,0,fetched.stderr);assert.equal(requests.at(-1).headers['x-audit'],'cli');
});

test('explicit empty, Cookie and Accept-Language CLI headers survive actual transport defaults',async t=>{
 const{origin,requests}=await fixture(t);const result=await cli(['fetch','--json','--http-header','X-Audit:','--http-header','Cookie: audit=42','--http-header','Accept-Language: fi-FI',origin+'/headers']);assert.equal(result.code,0,result.stderr);assert.equal(requests[0].headers['x-audit'],'');assert.equal(requests[0].headers.cookie,'audit=42');assert.equal(requests[0].headers['accept-language'],'fi-FI');
});

test('invalid and User-Agent HTTP headers fail before navigation with useful diagnostics',async t=>{
 const{origin,requests}=await fixture(t);for(const header of ['invalid','User-Agent: AuditHeader']){const result=await cli(['fetch','--json','--http-header',header,origin+'/headers']);assert.equal(result.code,1);assert.equal(result.stdout,'');assert.match(result.stderr,header==='invalid'?/Name: Value/:/Use --user-agent/);}assert.equal(requests.length,0);
});

test('text dump writers use native framing and preserve actual payload newlines',async t=>{
 const{origin}=await fixture(t);const native=JSON.parse(await readFile(new URL('./cli-dump-writer-native.json',import.meta.url),'utf8'));const rows=new Map(native.observations.map(r=>[r.label,r]));
 for(const format of ['html','markdown','semantic_tree','semantic_tree_text','structured_data']){
  const expected=rows.get(format+'-plain').stdout;assert.equal(expected,rows.get(format+'-json').json.content);
  const plain=await cli(['fetch','--dump',format,origin+'/literal']);assert.equal(plain.code,0,plain.stderr);if(format!=='semantic_tree_text')assert.equal(plain.stdout,expected,format);
  const json=await cli(['fetch','--json','--dump',format,origin+'/literal']);assert.equal(json.code,0,json.stderr);assert.equal(json.stdout,JSON.stringify(json.json)+'\n');assert.equal(plain.stdout,json.json.content,format);if(format!=='semantic_tree_text')assert.equal(json.json.content,expected,format);else{assert.equal(expected.endsWith('\n'),true);assert.equal(plain.stdout.endsWith('\n'),true);assert.equal(plain.stdout.endsWith('\n\n'),false);}
 }
});


test('candidate-only text format also adds no writer newline',async t=>{
 const{origin}=await fixture(t);const result=await cli(['fetch','--dump','text',origin+'/literal']);assert.equal(result.code,0,result.stderr);assert.equal(result.stdout,'Writer outputline');
});
