// Oracle process lifecycle only: importing this module does not load either engine.
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
export async function startReference(binary,{args=[]}={}){
 const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(binary,['serve','--host','127.0.0.1','--port',String(port),...args],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});let failure;child.once('error',e=>{failure=e});
 async function close(){if(child.exitCode!==null||child.signalCode!==null||!child.pid)return;const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),1000);timer.unref();try{await exited}finally{clearTimeout(timer)}}
 try{const deadline=Date.now()+10000;while(Date.now()<deadline){if(failure)throw failure;if(child.exitCode!==null||child.signalCode!==null)throw Error('Reference exited');try{const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)});if(response.ok)return {endpoint:`ws://127.0.0.1:${port}/`,close}}catch{}await new Promise(resolve=>setTimeout(resolve,25))}throw Error('Reference startup deadline')}catch(error){await close();throw error}
}
