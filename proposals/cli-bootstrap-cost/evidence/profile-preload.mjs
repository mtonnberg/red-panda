// Diagnostic-only public Node loader/CPU observations; never a production import.
import {registerHooks} from 'node:module';
import {appendFileSync} from 'node:fs';
const output=process.env.RED_PANDA_CLI_PROFILE_OUTPUT;
if(!output)throw Error('Explicit owned CLI profiling output required');
const begin=process.hrtime.bigint(),cpu=process.cpuUsage(),loads=[];
const phase=Number(process.env.RED_PANDA_CLI_PROFILE_PHASE??0)+1;process.env.RED_PANDA_CLI_PROFILE_PHASE=String(phase);
function snapshot(event,details={}){appendFileSync(output,JSON.stringify({event,pid:process.pid,phase,hrtime:String(process.hrtime.bigint()),millisecondsSincePreload:Number(process.hrtime.bigint()-begin)/1e6,cpuSincePreload:process.cpuUsage(cpu),cpuAtPreload:cpu,loads:[...loads],...details})+'\n')}
snapshot('preload');
registerHooks({load(url,context,nextLoad){const start=process.hrtime.bigint();try{const result=nextLoad(url,context);loads.push({url,format:result.format,loadMilliseconds:Number(process.hrtime.bigint()-start)/1e6});return result}catch(error){loads.push({url,loadMilliseconds:Number(process.hrtime.bigint()-start)/1e6,error:{name:error.name,message:error.message}});throw error}}});
const execve=process.execve;
if(typeof execve==='function')process.execve=function(...args){snapshot('execve-request',{file:args[0],argv:args[1]});return Reflect.apply(execve,this,args)};
process.once('exit',code=>snapshot('exit',{code}));
