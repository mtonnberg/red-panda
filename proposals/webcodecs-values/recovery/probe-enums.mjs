import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '/workspace/shared/coverage-recovery-20261031/scripts/reference-server.mjs';
import {connect} from '/workspace/red-panda/test/cdp-client.js';
const binary=process.argv[2],output=process.argv[3],expressionPath=new URL('./enums-expression.js',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
if(binary.includes('lightpanda')){if(hash(await readFile(binary))!=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f')throw Error('Native reference checksum mismatch')}
let browser,client;
try{browser=await startReference(binary,{args:['--load-resources','iframe','--load-resources','worker']});client=await connect(browser.endpoint);const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Page.navigate',{url:'data:text/html,<!doctype html><body>value types</body>'},sessionId);const expression=await readFile(expressionPath,'utf8'),result=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId,{timeout:15000});await writeFile(output,JSON.stringify({binary,binarySHA256:hash(await readFile(binary)),probeSHA256:hash(await readFile(new URL(import.meta.url))),expressionSHA256:hash(expression),result},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:result.result?.value?.length,exception:result.exceptionDetails??null}));}
finally{await client?.close();await browser?.close()}
