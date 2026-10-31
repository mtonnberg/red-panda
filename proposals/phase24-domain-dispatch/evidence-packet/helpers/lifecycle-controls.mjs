import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../scripts/reference-server.mjs';
import {connect} from '../test/cdp-client.js';

const mode=process.argv[2],output=process.argv[3];
if(!['native','candidate'].includes(mode)||!output)throw Error('Explicit engine and fresh output required');
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorRecord=error=>Object.fromEntries(Object.getOwnPropertyNames(error).map(key=>[key,error[key]]));
const rows=[],wire=[],requests=[],states=[];
let service,client,fixture,targetId,sessionId,failure,closedProcess;
async function request(label,method,params={},attached=true){
 const row={label,method,params,...(attached?{sessionId}:{})};
 try{row.result=await client.send(method,params,attached?sessionId:undefined,{timeout:2500});}catch(error){row.error=errorRecord(error);}
 rows.push(row);return row;
}
async function load(label,path){
 const url=origin+path,start=performance.now();
 const navigation=await request(label+':navigate','Page.navigate',{url});
 if(navigation.error||navigation.result?.errorText)throw Error('Real navigation failed: '+JSON.stringify(navigation));
 const deadline=performance.now()+2000;let complete=false,last;
 while(performance.now()<deadline){
  last=await request(label+':ready','Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
  if(last.result?.result?.value==='complete'){complete=true;break;}
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 const events=client.events.filter(event=>event.sessionId===sessionId&&(
  event.params?.request?.url===url||event.params?.response?.url===url));
 const state={label,path,url,complete,elapsedMs:performance.now()-start,requests:requests.filter(item=>item.url===path),events};
 states.push(state);
 if(!complete)throw Error('Real document complete not observed within2000ms: '+JSON.stringify(last));
}
let origin;
try{
 fixture=http.createServer((req,res)=>{requests.push({url:req.url,method:req.method,headers:req.headers});const bytes=Buffer.from('<!doctype html><title>actual lifecycle control</title>');res.writeHead(200,{'content-type':'text/html','content-length':bytes.length,'cache-control':'no-store'});res.end(bytes);});
 fixture.listen(0,'127.0.0.1');await once(fixture,'listening');origin='http://127.0.0.1:'+fixture.address().port;
 if(mode==='native')service=await startReference(binary);else{const{serve}=await import('../src/cdp.js');service=await serve({port:0});service.endpoint='ws://127.0.0.1:'+service.port+'/';}
 client=await connect(service.endpoint);
 const send=client.socket.send;client.socket.send=function(data,...args){wire.push({direction:'sent',text:String(data)});return Reflect.apply(send,this,[data,...args]);};client.socket.on('message',raw=>wire.push({direction:'received',text:raw.toString()}));
 const created=await request('setup:create','Target.createTarget',{url:'about:blank'},false);targetId=created.result?.targetId;if(!targetId)throw Error('Actual target not created');
 const attached=await request('setup:attach','Target.attachToTarget',{targetId,flatten:true},false);sessionId=attached.result?.sessionId;if(!sessionId)throw Error('Actual attached session not created');
 await request('setup:Page.enable','Page.enable');await request('setup:Runtime.enable','Runtime.enable');
 await request('unknown-domain:enable','NotAnActualDomain.enable');
 await request('unknown-domain:disable','NotAnActualDomain.disable');
 await request('N1:disable-before-enable','Network.disable');
 await request('N2:nested-enable','Network.nested.enable');await load('N2:disabled','/disabled');
 await request('N3:real-enable','Network.enable');await request('N3:nested-disable','Network.nested.disable');await load('N3:enabled','/enabled');
 await request('N4:real-disable','Network.disable');await load('N4:disabled-again','/disabled-again');
}catch(error){failure=errorRecord(error);}
finally{
 if(client&&targetId)await request('cleanup:target','Target.closeTarget',{targetId},false);
 await client?.close();await service?.close();
 if(service?.process)closedProcess={pid:service.process.pid,exitCode:service.process.exitCode,signal:service.process.signalCode,stderr:service.stderr,stderrTruncated:service.stderrTruncated};
 if(fixture){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}
 const report={mode,rows,states,requests,wire,failure,closedProcess,helperSHA256:sha(await readFile(new URL(import.meta.url))),...(mode==='native'?{binary,binarySHA256:sha(await readFile(binary))}:{cdpSHA256:sha(await readFile(new URL('../src/cdp.js',import.meta.url)))}),budgets:{rpcMs:2500,loadMs:2000,fixedSettlingDelayMs:0},boundary:'Fresh actual attached target, real ephemeral HTTP bytes and observed document.complete; all original wire responses/events retained. Errors are observations, never converted into success.'};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,rows:rows.length,failure,controls:rows.filter(row=>!row.label.includes(':ready')).map(row=>({label:row.label,result:row.result,error:row.error&&{code:row.error.code,message:row.error.message}})),states:states.map(state=>({label:state.label,complete:state.complete,requests:state.requests.length,events:state.events.map(event=>event.method)})),closedProcess}));
 if(failure)process.exitCode=1;
}
