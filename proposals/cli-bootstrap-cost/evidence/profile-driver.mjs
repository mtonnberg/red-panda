import {spawn}from'node:child_process';
import{writeFile}from'node:fs/promises';
import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),rows=[];
for(const label of ['baseline','candidate']){
 const begun=performance.now(),args=['--import',fileURLToPath(new URL('profile-preload.mjs',import.meta.url)),'bin/red-panda.js','run',fileURLToPath(new URL('saved-script.js',import.meta.url))];
 const result=await new Promise(resolve=>{
  const record={label,command:[process.execPath,...args],phases:[]},mark=(phase,extra={})=>record.phases.push({phase,milliseconds:performance.now()-begun,...extra});
  const child=spawn(process.execPath,args,{cwd:root+'/'+label,env:{...process.env,RED_PANDA_CLI_PROFILE_OUTPUT:root+'/evidence/profile-'+label+'.jsonl',RED_PANDA_CLI_PROFILE_PHASE:'0'},stdio:['pipe','pipe','pipe']});record.pid=child.pid;let stdout='',stderr='';
  const timer=setTimeout(()=>{record.deadline=true;record.killSent=child.kill('SIGKILL');mark('deadline')},15000);
  child.once('spawn',()=>mark('spawn'));child.stdout.on('data',data=>{if(!stdout)mark('first-stdout');stdout+=data});child.stderr.on('data',data=>{if(!stderr)mark('first-stderr');stderr+=data});child.once('error',error=>{record.error={name:error.name,message:error.message};mark('error')});child.once('exit',(code,signal)=>mark('exit',{code,signal}));child.once('close',(code,signal)=>{clearTimeout(timer);mark('close',{code,signal});resolve({...record,code,signal,stdout,stderr,seconds:(performance.now()-begun)/1000})});child.stdin.on('error',()=>{});child.stdin.end('');
 });rows.push(result);await writeFile(new URL('profile-driver-progress.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');if(result.deadline||result.error)break;
}
await writeFile(new URL('profile-driver-result.json',import.meta.url),JSON.stringify({rows,boundary:'Independent diagnostic --import loader and execve wrapper. Public Node nextLoad returns original source untouched; module load durations exclude evaluation, and preloader imports are outside hook. CPU delta includes actual process threads since preload. SamePID phases observe first startup/reexec and actual exit. Instrumentation overhead/order/cold-cache bias prevent treating timing as an unbiased benchmark or olddeadline proof. Original15s hardchild deadline retained.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows.map(({label,code,deadline,seconds})=>({label,code,deadline,seconds}))));
