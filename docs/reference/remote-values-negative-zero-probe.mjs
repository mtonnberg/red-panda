// Follow-up for one initial 2s RPC deadline under concurrent work. This probe
// gives the same selected value a 5s RPC budget in one fresh owned process.
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const reference=await startReference(binary);const client=await connect(reference.endpoint,{timeout:5000});const observations=[];
try {
 const {browserContextId}=await client.send('Target.createBrowserContext');const {targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 await client.send('Runtime.enable',{},sessionId);
 for(const expression of ['globalThis.__remoteHits=0; (-0)','-0'])observations.push({expression,response:await client.send('Runtime.evaluate',{expression},sessionId)});
 const receiver=await client.send('Runtime.evaluate',{expression:'({})'},sessionId);
 observations.push({method:'Runtime.callFunctionOn',response:await client.send('Runtime.callFunctionOn',{objectId:receiver.result.objectId,functionDeclaration:'function(){return -0}'},sessionId)});
 observations.push({heartbeat:await client.send('Runtime.evaluate',{expression:'6*7',returnByValue:true},sessionId)});
 await client.send('Target.disposeBrowserContext',{browserContextId});
}finally{await client.close();await reference.close();}
console.log(JSON.stringify({scope:'One initial native negative-zero evaluate RPC exceeded its 2s budget; this fresh-process 5s follow-up is retained separately rather than replacing that timeout.',binary:{path:binary,sha256:createHash('sha256').update(await readFile(binary)).digest('hex')},observations,ownedProcess:{exitCode:reference.process.exitCode,signal:reference.process.signalCode}},null,2));
