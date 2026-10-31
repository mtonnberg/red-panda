import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const expression=await readFile(new URL(process.argv[2]??'./expression.js',import.meta.url),'utf8');
let server,client;
try{server=await startReference('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');client=await connect(server.endpoint);const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});const result=await client.send('Runtime.evaluate',{expression,returnByValue:true},sessionId);await writeFile(new URL(process.argv[3]??'./native.json',import.meta.url),JSON.stringify({expressionSHA256:createHash('sha256').update(expression).digest('hex'),result},null,2)+'\n',{flag:'wx'});console.log(result)}finally{await client?.close();await server?.close()}
