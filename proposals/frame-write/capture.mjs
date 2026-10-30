import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { startFixtureServer } from '../../scripts/upstream-fixture-server.mjs';
const [snapshot, output, list] = process.argv.slice(2);
if (!snapshot || !output) throw new Error('Supply isolated snapshot and output');
const root='/tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests';
const fixtures=list?.split(',')??['frames/data_url_iframe.html','frames/cross_realm_identity.html'];
const { Browser }=await import(pathToFileURL(path.join(snapshot,'src/browser.js')).href);
const loadResources=process.env.FRAME_RESOURCES==='none'?[]:['iframe','worker','stylesheet'];
const server=await startFixtureServer(root,{port:0,profile:'static'}), browser=new Browser({timeout:3000,userAgent:'Lightpanda/1.0',loadResources});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={kind:'bounded-isolated-frame-write-investigation',snapshot,node:process.version,loadResources,origin:server.origin,cases:[]};
try {
 for(const fixture of fixtures){
  const page=browser.createPage(),errors=[],consoleErrors=[];
  page.on('pageError',error=>errors.push({message:error.message,stack:error.stack,detail:error.detail?.stack??String(error.detail??'')}));
  page.on('console',event=>{if(event.type==='error')consoleErrors.push(event.args.map(String).join(' '));});
  page.newDocumentScripts.set('external',{source:'globalThis.__lp_external_runner=true;'});
  const entry={fixture,sourceSHA256:hash(await readFile(path.join(root,fixture)))};
  try{await page.navigate(`${server.origin}/src/browser/tests/${fixture}`);}catch(error){entry.navigationError=error.message;}
  await new Promise(resolve=>setTimeout(resolve,100));
  try{entry.assertOk=page.evaluate('testing.assertOk()');}catch(error){entry.assertError=error.stack;}
  try{entry.document=page.evaluate(`JSON.parse(JSON.stringify({state:document.readyState,frames:[...document.querySelectorAll('iframe')].map(frame=>({src:frame.src,url:frame.contentWindow?.location.href,state:frame.contentDocument?.readyState,html:frame.contentDocument?.documentElement?.outerHTML?.slice(0,2000)}))}))`);}catch(error){entry.inspectError=error.stack;}
  entry.errors=errors;entry.consoleErrors=consoleErrors;report.cases.push(entry);page.close();process.stdout.write(JSON.stringify(entry)+'\n');
 }
}finally{browser.close();await server.close();}
report.cleanup='all owned pages/browser and port0 fixture server closed';await writeFile(output,JSON.stringify(report,null,2)+'\n');
