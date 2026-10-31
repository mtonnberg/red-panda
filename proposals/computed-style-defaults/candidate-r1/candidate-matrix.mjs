import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
const [sourceRoot,output]=process.argv.slice(2),sha=value=>createHash('sha256').update(value).digest('hex');
const {Browser}=await import(pathToFileURL(resolve(sourceRoot,'src/browser.js')));
const inputs=[['namespace-original','../programmatic-namespace/interface-expression.js'],['state','state-expression.js'],['inactive-display','inactive-display-expression.js'],['ua-state','ua-state-expression.js'],['source','source-expression.js'],['interface','interface-expression.js']],rows=[],requests=[];
const server=createServer((request,response)=>{requests.push(request.url);response.setHeader('content-type','text/html');response.end('<!doctype html><html><head></head><body></body></html>');});
for(const key of ['NO_PROXY','no_proxy'])process.env[key]=[process.env[key],'127.0.0.1','localhost'].filter(Boolean).join(',');
let browser,failure;const started=Date.now();
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=new Browser();const page=browser.createPage();await page.navigate('http://127.0.0.1:'+server.address().port+'/');
 for(const[name,filename]of inputs){const expression=await readFile(new URL(filename,import.meta.url),'utf8'),begin=Date.now();try{rows.push({name,expressionSHA256:sha(expression),value:JSON.parse(page.evaluate(expression)),elapsedMS:Date.now()-begin});}catch(error){rows.push({name,expressionSHA256:sha(expression),error:{name:error.name,message:error.message,stack:error.stack}});}}
}catch(error){failure={name:error.name,message:error.message,stack:error.stack};}
finally{browser?.close();server.closeAllConnections();if(server.listening)await new Promise(resolve=>server.close(resolve));await writeFile(output,JSON.stringify({node:process.version,sourceRoot,stylesSHA256:sha(await readFile(resolve(sourceRoot,'src/styles.js'))),driverSHA256:sha(await readFile(new URL(import.meta.url))),elapsedMS:Date.now()-started,requests,rows,failure},null,2)+'\n',{flag:'wx'});}
if(failure||rows.some(row=>row.error))process.exitCode=1;
