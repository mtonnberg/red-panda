import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
const engine=process.argv[2],output=process.argv[3],rows=[],wire=[];let service,client,sessionId,failure;
const command=async(label,method,params={},sid=sessionId)=>{const row={label,method,params,...(sid?{sessionId:sid}:{})};rows.push(row);try{row.result=await client.send(method,params,sid,{timeout:1500})}catch(error){row.error={message:error.message,code:error.code};if(!Number.isInteger(error.code))throw error}await writeFile(output,JSON.stringify({engine,rows,wire,partial:true},null,2)+'\n');return row.result};
try{
 service=engine==='native'?await startReference('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'):await(await import('../../src/cdp.js')).serve({port:0});
 client=await connect(engine==='native'?service.endpoint:`ws://127.0.0.1:${service.port}`,{timeout:1500});client.socket.on('message',bytes=>wire.push(JSON.parse(bytes)));
 const{targetId}=await command('setup-target','Target.createTarget',{url:'about:blank'},null);({sessionId}=await command('setup-attach','Target.attachToTarget',{targetId,flatten:true},null));await command('runtime-enable','Runtime.enable');
 const created=client.events.find(e=>e.method==='Runtime.executionContextCreated'&&e.sessionId===sessionId);if(!created)throw Error('Actual main context announcement absent');
 const{frameTree}=await command('frame-tree','Page.getFrameTree');const world=await command('utility-world','Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'actual-thrown-values'});
 for(const[realm,contextId]of[['main',created.params.context.id],['utility',world.executionContextId]])for(const returnByValue of[false,true])for(const[kind,source]of[['error','new TypeError("actual thrown marker")'],['object','({marker:"actual thrown marker"})'],['primitive','"actual thrown marker"']]){
  const label=`${realm}/${returnByValue}/${kind}`;
  const result=await command(label,'Runtime.evaluate',{contextId,expression:`throw (globalThis.actualThrown=${source})`,returnByValue});
  for(const[field,remote]of[['result',result?.result],['exception',result?.exceptionDetails?.exception]])if(remote?.objectId)await command(label+'/'+field+'-identity','Runtime.callFunctionOn',{objectId:remote.objectId,functionDeclaration:'function(){return this===globalThis.actualThrown}',returnByValue:true});
 }
 for(const returnByValue of[false,true])await command('callFunction/'+returnByValue,'Runtime.callFunctionOn',{executionContextId:created.params.context.id,functionDeclaration:'function(){throw (globalThis.actualThrown=new RangeError("actual call marker"))}',returnByValue});
 await command('cleanup-target','Target.closeTarget',{targetId},null);
}catch(error){failure={message:error.message,stack:error.stack};process.exitCode=1}
finally{await client?.close();await service?.close();await writeFile(output,JSON.stringify({engine,rows,wire,failure,partial:false,sourceSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),native:engine==='native'?{pid:service?.process.pid,exit:service?.process.exitCode,signal:service?.process.signalCode,stderr:service?.stderr}:undefined,scope:'Actual thrown values and actual retaining handle identities in genuine main/utility contexts. Raw errors/stacks/ids retained; no full stack/metadata equivalence assumed.'},null,2)+'\n');console.log(JSON.stringify({engine,rows:rows.length,failure:failure?.message}))}
