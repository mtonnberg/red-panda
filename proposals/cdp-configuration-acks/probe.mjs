import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
const output=process.argv[2],binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const methods=['CSS.enable','Inspector.enable','Inspector.disable','Security.enable','Security.disable'];
const rows=[],wire=[];let service,client,failure;
const command=async(stage,method,params,sessionId)=>{const row={stage,method,params,...(sessionId?{sessionId}:{})};rows.push(row);try{row.result=await client.send(method,params,sessionId,{timeout:1000})}catch(error){row.error={message:error.message,code:error.code};if(!Number.isInteger(error.code))throw error}await writeFile(output,JSON.stringify({rows,wire,partial:true},null,2)+'\n');return row.result};
async function stage(name,sessionId){for(const method of methods)for(const params of [{},null,{ignored:true}])await command(name,method,params,sessionId);for(const method of ['CSS.disable','CSS.nested.enable','Inspector.nested.enable','Security.nested.disable'])await command(name,method,{},sessionId)}
try{
 service=await startReference(binary);client=await connect(service.endpoint,{timeout:1000});client.socket.on('message',data=>wire.push(JSON.parse(data)));
 await stage('before-context');
 const{targetId}=await command('setup','Target.createTarget',{url:'about:blank'});const{sessionId}=await command('setup','Target.attachToTarget',{targetId,flatten:true});
 await stage('loaded-root');await stage('attached',sessionId);await command('cleanup','Target.closeTarget',{targetId});await stage('after-target-close');
}catch(error){failure={message:error.message,stack:error.stack};process.exitCode=1}
finally{await client?.close();await service?.close();await writeFile(output,JSON.stringify({rows,wire,failure,partial:false,native:{pid:service?.process.pid,exit:service?.process.exitCode,signal:service?.process.signalCode,stderr:service?.stderr},sourceSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),scope:'Five exact acknowledgement-only configuration commands. Security TLS policy and CSS/Inspector engine functionality are outside this probe. Null envelopes are measured only for these commands.'},null,2)+'\n');console.log(JSON.stringify({rows:rows.length,failure:failure?.message,nativeExit:service?.process.exitCode,nativeSignal:service?.process.signalCode}))}
