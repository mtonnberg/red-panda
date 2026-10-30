// Independent bounded non-heap public CDP controls; never invokes queryObjects.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../../scripts/reference-server.mjs';
import {connect} from '../../test/cdp-client.js';
const binary=process.argv[2];if(!binary||!process.argv[3])throw new Error('binary and fresh output path required');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const binarySHA256=digest(await readFile(binary));
if(binary.includes('lightpanda')&&binarySHA256!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw new Error('Reference binary digest mismatch');
let reference,client;const results=[];
try{
 reference=await startReference(binary);client=await connect(reference.endpoint,{timeout:5000});
 const {browserContextId}=await client.send('Target.createBrowserContext');
 const {targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});
 const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=async(label,method,params={})=>{try{const result=await client.send(method,params,sessionId);results.push({label,method,params,result});return result;}catch(error){results.push({label,method,params,error:{code:error.code,message:error.message}});return null;}};
 await send('enable','Runtime.enable');const tree=await send('tree','Page.getFrameTree');const frameId=tree.frameTree.frame.id;
 const owner=await send('owner','Runtime.evaluate',{expression:'globalThis.receiver={};receiver',objectGroup:'receiver-owner'});
 const inherited=await send('inherited-result','Runtime.callFunctionOn',{objectId:owner.result.objectId,functionDeclaration:'function(){return {n:17}}'});
 const explicit=await send('explicit-result','Runtime.callFunctionOn',{objectId:owner.result.objectId,functionDeclaration:'function(){return {n:18}}',objectGroup:'explicit-result'});
 await send('release-owner','Runtime.releaseObjectGroup',{objectGroup:'receiver-owner'});
 await send('inherited-after-release','Runtime.getProperties',{objectId:inherited.result.objectId,ownProperties:true});
 await send('explicit-after-release','Runtime.getProperties',{objectId:explicit.result.objectId,ownProperties:true});
 const world=await send('isolated-world','Page.createIsolatedWorld',{frameId,worldName:'caller-contract'});
 const isolated=await send('isolated-object','Runtime.evaluate',{contextId:world.executionContextId,expression:'globalThis.__callerAudit=42;({realm:"isolated"})',objectGroup:'isolated'});
 await send('root-global-leak','Runtime.evaluate',{expression:'typeof globalThis.__callerAudit',returnByValue:true});
 const root=await send('root-object','Runtime.evaluate',{expression:'({realm:"root"})'});
 await send('cross-world-argument','Runtime.callFunctionOn',{objectId:root.result.objectId,functionDeclaration:'function(x){return x.realm}',arguments:[{objectId:isolated.result.objectId}],returnByValue:true});
 await send('conflicting-context-and-object','Runtime.callFunctionOn',{objectId:root.result.objectId,executionContextId:world.executionContextId,functionDeclaration:'function(){return this.realm}',returnByValue:true});
 await send('invalid-object','Runtime.getProperties',{objectId:'invalid',ownProperties:true});
 await send('heartbeat','Runtime.evaluate',{expression:'6*7',returnByValue:true});
 await client.send('Target.disposeBrowserContext',{browserContextId});
}finally{if(client)await client.close();if(reference)await reference.close();}
await writeFile(process.argv[3],JSON.stringify({scope:'Non-heap caller/group/world public CDP control; no queryObjects enumeration',binary:{path:binary,sha256:binarySHA256},driverSHA256:digest(await readFile(new URL(import.meta.url))),results},null,2)+'\n',{flag:'wx'});
