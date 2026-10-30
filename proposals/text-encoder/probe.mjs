import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
const [mode,output]=process.argv.slice(2);
if(!['native','candidate'].includes(mode)||!output)throw Error('Supply native|candidate output');
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',source=await readFile(new URL('./expression.js',import.meta.url),'utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
let service,client,reference;
try{
 if(mode==='native')reference=await startReference(binary);
 else{const{serve}=await import('../../src/cdp.js');service=await serve({port:0});}
 client=await connect(reference?.endpoint??`ws://127.0.0.1:${service.port}/`);
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const result=await client.send('Runtime.evaluate',{expression:`JSON.stringify(${source})`,returnByValue:true},sessionId);
 if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
 const report={kind:'public-text-encoder-conversion-control',mode,expressionSHA256:hash(source),...(mode==='native'?{binarySHA256:hash(await readFile(binary))}:{}),observation:JSON.parse(result.result.value)};
 await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.observation));
}finally{await client?.close();await service?.close();await reference?.close();}
