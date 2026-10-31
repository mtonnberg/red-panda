import http from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startReference} from '../scripts/reference-server.mjs';
import {connect} from '../test/cdp-client.js';

const engine=process.argv[2],profile=process.argv[3],output=process.argv[4];
if(!['native','candidate'].includes(engine))throw Error('Explicit engine required');
if(!['core','lifetime','authority'].includes(profile)||!output)throw Error('Choose an explicit fresh core/lifetime/authority output');
const binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
// The pinned Config.zig explicitly disables subframes by default. The lifetime
// profile must enable the real producer it measures; core keeps its old args.
const nativeArgs=profile==='core'?[]:['--load-resources','iframe'];
const rows=[],stages=[],wire=[],requests=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorRecord=error=>Object.fromEntries(Object.getOwnPropertyNames(error).map(key=>[key,error[key]]));
let client,service,server,origin,targetId,sessionId,secondarySessionId,browserContextId,failure;
const pages={
 '/inline-defaults':`<!doctype html><title>dialogs before</title><script>
 globalThis.dialogTrace=[];function record(label,value){dialogTrace.push({label,type:typeof value,value})}
 record('confirm-default',confirm('inline-confirm'));
 record('prompt-default',prompt('inline-prompt','page-default'));
 record('alert-default',alert('inline-alert'));
 document.documentElement.setAttribute('dialogs-after','yes');document.title='dialogs after';
 setTimeout(()=>{record('task-confirm',confirm('task-confirm'));globalThis.dialogTaskDone=true},0);
 </script><p>actual inline document</p>`,
 '/armed':`<!doctype html><title>armed navigation</title><script>
 globalThis.armedConfirm=confirm('navigate-armed');
 globalThis.afterArmedPrompt=prompt('navigate-second','page-default');
 document.documentElement.setAttribute('after-dialog','yes');
 </script><p>actual navigation completion</p>`,
 '/frame-parent':'<!doctype html><title>frame parent</title><iframe src="/frame-child"></iframe>',
 '/frame-child':`<!doctype html><title>frame child</title><script>
 globalThis.frameDialogResult=confirm('child-dialog');
 document.documentElement.setAttribute('after-dialog','yes');
 </script><p>actual child continuation</p>`,
 '/frame-child-next':'<!doctype html><title>next actual child</title><p>new document</p>',
};
async function checkpoint(){await writeFile(output+'.partial.json',JSON.stringify({profile,rows,stages,wire,requests,events:client?.events??[],failure,ownedProcess:service?.process?{pid:service.process.pid,exitCode:service.process.exitCode,signal:service.process.signalCode,stderr:service.stderr}:undefined},null,2)+'\n');}
async function request(label,method,params={},selectedSession=sessionId){
 const row={label,method,params,...(selectedSession?{sessionId:selectedSession}:{})};
 try{row.result=await client.send(method,params,selectedSession??undefined,{timeout:2500});}catch(error){row.error=errorRecord(error);if(!Number.isInteger(error.code)){rows.push(row);await checkpoint();throw error;}}
 rows.push(row);return row;
}
const evaluate=(label,expression,extra={},selectedSession=sessionId)=>request(label,'Runtime.evaluate',{expression,returnByValue:true,...extra},selectedSession);
const arm=(label,params,selectedSession=sessionId)=>request(label,'LP.handleJavaScriptDialog',params,selectedSession);
async function stage(label,operation){
 const row={label,rowStart:rows.length,eventStart:client?.events.length??0};stages.push(row);
 try{await operation();row.completed=true;}finally{row.rowEnd=rows.length;row.eventEnd=client?.events.length??0;await checkpoint();}
}
async function wait(label,expression,budget=2000){
 const start=performance.now(),deadline=start+budget;let last;
 while(performance.now()<deadline){last=await evaluate(label,expression);if(last.result?.result?.value===true){last.observedWithinMs=performance.now()-start;return last;}await new Promise(resolve=>setTimeout(resolve,5));}
 throw Error(label+': actual condition unobserved within '+budget+'ms; last='+JSON.stringify(last));
}
async function navigate(label,path){
 const row=await request(label+':navigate','Page.navigate',{url:origin+path});
 if(row.error||row.result?.errorText)throw Error('Actual navigation failed: '+JSON.stringify(row));
 await wait(label+':complete','document.readyState==="complete"');
}
async function createTarget(){
 const created=await request('setup:create','Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}:{})},null);targetId=created.result?.targetId;if(!targetId)throw Error('Actual target not created');
 const attached=await request('setup:attach','Target.attachToTarget',{targetId,flatten:true},null);sessionId=attached.result?.sessionId;if(!sessionId)throw Error('Actual session not attached');
 await request('setup:Runtime.enable','Runtime.enable');
}
async function core(){
 await stage('C01-precontext',async()=>{await arm('no-context:LP',{accept:true},null);await request('no-context:Page','Page.handleJavaScriptDialog',{accept:true},null);});
 await createTarget();
 await stage('C02-inline-defaults-without-Page.enable',async()=>{await navigate('inline','/inline-defaults');await wait('inline:actual-task','globalThis.dialogTaskDone===true');await evaluate('inline:trace','({trace:dialogTrace,after:document.documentElement.getAttribute("dialogs-after"),title:document.title})');});
 await request('setup:Page.enable','Page.enable');
 await stage('C03-confirm-accept-and-one-shot',async()=>{await arm('confirm:arm-accept',{accept:true});await evaluate('confirm:accepted','confirm("accepted-confirm")');await evaluate('confirm:unarmed-after','confirm("one-shot-after")');});
 await stage('C04-confirm-dismiss',async()=>{await arm('confirm:arm-dismiss',{accept:false});await evaluate('confirm:dismissed','confirm("dismissed-confirm")');});
 const prompts=[
  ['C05-prompt-default',{accept:true},'prompt("prompt-default","page-default")'],
  ['C06-prompt-override',{accept:true,promptText:'client Δ🐼'},'prompt("prompt-override","page-default")'],
  ['C07-prompt-empty-override',{accept:true,promptText:''},'prompt("prompt-empty","page-default")'],
  ['C08-prompt-without-default',{accept:true},'prompt("prompt-no-default")'],
  ['C09-prompt-dismiss',{accept:false,promptText:'ignored'},'prompt("prompt-dismiss","page-default")'],
 ];
 for(const[label,params,expression]of prompts)await stage(label,async()=>{await arm(label+':arm',params);await evaluate(label+':actual',expression);});
 await stage('C10-alert-consumes-response',async()=>{await arm('alert:arm',{accept:true});await evaluate('alert:actual','alert("consuming-alert")');await evaluate('alert:next-confirm','confirm("after-alert")');});
 await stage('C11-replacement-is-one-slot',async()=>{for(const[last,value]of[['dismiss',false],['accept',true]]){await arm('replace:first:'+last,{accept:!value});await arm('replace:last:'+last,{accept:value});await evaluate('replace:actual:'+last,'confirm("replacement-'+last+'")');}});
 await stage('C12-Page-command-cannot-arm-or-change-response',async()=>{await arm('Page:prior-arm',{accept:true});await request('Page:reactive-dismiss','Page.handleJavaScriptDialog',{accept:false});await evaluate('Page:actual-after','confirm("after-reactive-command")');});
 await stage('C13-invalid-LP-parameters',async()=>{for(const[label,params]of[['missing-accept',{}],['wrong-accept',{accept:'yes'}],['wrong-promptText',{accept:true,promptText:42}]]){await arm('invalid:'+label+':prior-arm',{accept:true});await arm('invalid:'+label,params);await evaluate('invalid:'+label+':remaining-response','confirm("after-invalid-'+label+'")');}});
 await stage('C14-invalid-Page-parameters',async()=>{for(const[label,params]of[['missing-accept',{}],['wrong-accept',{accept:'yes'}],['wrong-promptText',{accept:true,promptText:42}]])await request('Page:invalid:'+label,'Page.handleJavaScriptDialog',params);});
 await stage('C15-real-message-conversion',async()=>{await evaluate('message:object','globalThis.messageCoercions=0;confirm({toString(){messageCoercions++;return "converted-message"}})');await evaluate('message:coercion-count','messageCoercions');await arm('message:arm-before-symbol',{accept:true});await evaluate('message:symbol','confirm(Symbol("cannot-stringify"))');await evaluate('message:remaining-after-symbol','confirm("after-symbol")');});
 await stage('C16-real-later-task',async()=>{await arm('task:arm',{accept:true});await evaluate('task:schedule','globalThis.delayedDialogDone=false;setTimeout(()=>{globalThis.delayedDialogResult=confirm("armed-task");globalThis.delayedDialogDone=true},0);"scheduled"');await wait('task:actual-completion','globalThis.delayedDialogDone===true');await evaluate('task:actual-result','delayedDialogResult');});
 await stage('C17-borrowed-method-receiver',async()=>{await arm('borrowed:arm',{accept:true});await evaluate('borrowed:fake-receiver','confirm.call({},"borrowed-receiver")');await evaluate('borrowed:next-real-call','confirm("after-borrowed")');});
 await stage('C18-no-dialog-after-actual-return',async()=>{await evaluate('no-dialog:actual-alert','alert("completed-alert")');await request('no-dialog:Page','Page.handleJavaScriptDialog',{accept:true,promptText:'too late'});await evaluate('no-dialog:continuation','({title:document.title,completed:document.readyState})');});
}
async function lifetime(){
 const context=await request('setup:context','Target.createBrowserContext',{},null);browserContextId=context.result?.browserContextId;if(!browserContextId)throw Error('Actual explicit context not created');
 await stage('L01-context-before-target',async()=>{await arm('context:arm-before-target',{accept:true},null);await createTarget();await evaluate('context:first-actual-dialog','confirm("first-after-context")');});
 await stage('L02-stash-across-navigation',async()=>{await arm('navigation:arm',{accept:true});await navigate('navigation','/armed');await evaluate('navigation:actual-results','({first:armedConfirm,second:afterArmedPrompt,after:document.documentElement.getAttribute("after-dialog")})');});
 await stage('L03-root-wire-after-target',async()=>{await arm('root:arm',{accept:true},null);await evaluate('root:actual-confirm','confirm("root-arm")');});
 await stage('L04-secondary-session-and-event-owner',async()=>{const attached=await request('secondary:attach','Target.attachToTarget',{targetId,flatten:true},null);secondarySessionId=attached.result?.sessionId;if(!secondarySessionId)throw Error('Actual secondary session not attached');await request('secondary:Runtime.enable','Runtime.enable',{},secondarySessionId);await arm('secondary:arm',{accept:true},secondarySessionId);await evaluate('secondary:actual','confirm("secondary-session")',{},secondarySessionId);});
 await stage('L05-next-child-dialog-consumes-response',async()=>{await arm('frame:arm',{accept:true});await navigate('frame','/frame-parent');await evaluate('frame:actual-result','({value:document.querySelector("iframe").contentWindow.frameDialogResult,after:document.querySelector("iframe").contentDocument.documentElement.getAttribute("after-dialog")})');await evaluate('frame:next-main-dialog','confirm("after-child")');});
 await stage('L06-invalid-session-cannot-change-response',async()=>{await arm('session:prior-arm',{accept:true});await arm('session:invalid',{accept:false},'not-an-owned-session');await evaluate('session:actual-after','confirm("after-invalid-session")');});
 await stage('L07-utility-world-dialog',async()=>{const tree=await request('utility:tree','Page.getFrameTree');const frameId=tree.result?.frameTree?.frame?.id;if(!frameId)throw Error('Actual main frame not observed');const world=await request('utility:create','Page.createIsolatedWorld',{frameId,worldName:'actual-dialog-world'});const contextId=world.result?.executionContextId;if(!contextId)throw Error('Actual utility context not created');await arm('utility:arm',{accept:true});await evaluate('utility:actual','confirm("utility-dialog")',{contextId});await evaluate('utility:next-main','confirm("after-utility")');});
 await stage('L08-target-close-recreate-lifetime',async()=>{await arm('close:arm',{accept:true});await request('close:target','Target.closeTarget',{targetId},null);targetId=undefined;sessionId=undefined;await createTarget();await evaluate('close:actual-new-target-dialog','confirm("after-target-recreation")');});
 await stage('L09-disposed-context-lifetime',async()=>{await arm('dispose:arm',{accept:true});await request('dispose:target','Target.closeTarget',{targetId},null);targetId=undefined;sessionId=undefined;await request('dispose:context','Target.disposeBrowserContext',{browserContextId},null);browserContextId=undefined;await arm('dispose:LP-after-context',{accept:true},null);await createTarget();await evaluate('dispose:actual-fresh-default-dialog','confirm("after-context-disposal")');});
}
const reflection=`(()=>{const result={};for(const name of ['alert','confirm','prompt']){const fn=globalThis[name];let owner=globalThis,depth=0;while(owner&&!Object.hasOwn(owner,name)&&depth<16){owner=Object.getPrototypeOf(owner);depth++}const d=owner&&Object.getOwnPropertyDescriptor(owner,name);result[name]={type:typeof fn,name:fn.name,length:fn.length,ownPrototype:Object.hasOwn(fn,'prototype'),functionPrototype:Object.getPrototypeOf(fn)===Function.prototype,ownerDepth:depth,enumerable:d?.enumerable,configurable:d?.configurable,writable:d?.writable,source:Function.prototype.toString.call(fn)}}return result})()`;
async function authority(){
 await createTarget();
 await stage('A01-main-public-definition',async()=>{await evaluate('definition:main',reflection);});
 await stage('A02-null-undefined-symbol-conversion',async()=>{await evaluate('conversion:messages','[confirm(),confirm(undefined),confirm(null),confirm(Symbol()),confirm(Symbol("symbol-description"))]');await arm('conversion:prompt-default-arm',{accept:true});await evaluate('conversion:prompt-default-symbol','prompt("symbol-default",Symbol("actual-default"))');});
 await stage('A03-throwing-conversion-preserves-error-and-stash',async()=>{await evaluate('conversion:sentinel','globalThis.dialogSentinel=new RangeError("actual conversion sentinel");true');await arm('conversion:prior-arm',{accept:true});await evaluate('conversion:throw','(()=>{try{confirm({toString(){throw dialogSentinel}})}catch(error){return {same:error===dialogSentinel,name:error.name,message:error.message,realm:error instanceof RangeError}}})()');await evaluate('conversion:after-throw','confirm("after-throwing-conversion")');});
 let childContext;
 await stage('A04-foreign-real-Window-methods',async()=>{await navigate('foreign','/frame-parent');const tree=await request('foreign:tree','Page.getFrameTree');const childFrameId=tree.result?.frameTree?.childFrames?.[0]?.frame?.id;if(!childFrameId)throw Error('Actual loaded child frame not observed');childContext=client.events.find(event=>event.method==='Runtime.executionContextCreated'&&event.params.context.auxData?.frameId===childFrameId&&event.params.context.auxData?.isDefault===true)?.params.context.id;if(!childContext)throw Error('Actual default child context not observed');await arm('foreign:main-arm',{accept:true});await evaluate('foreign:main-calls-child','document.querySelector("iframe").contentWindow.confirm("main-calls-child-method")');await arm('foreign:child-arm',{accept:true});await evaluate('foreign:child-calls-parent','parent.confirm("child-calls-parent-method")',{contextId:childContext});});
 await stage('A05-retained-before-child-navigation',async()=>{await evaluate('retained:save','(()=>{const w=document.querySelector("iframe").contentWindow;globalThis.retainedDialog={window:w,document:w.document,method:w.confirm};return {documentURL:retainedDialog.document.URL,methodSame:retainedDialog.method===w.confirm}})()');await arm('retained:before-arm',{accept:true});await evaluate('retained:before-navigation','retainedDialog.method.call(retainedDialog.window,"retained-before-navigation")');});
 await stage('A06-retained-after-child-navigation',async()=>{await evaluate('retained:navigate-child','document.querySelector("iframe").src="/frame-child-next";true');await wait('retained:actual-new-child','document.querySelector("iframe").contentDocument.URL.endsWith("/frame-child-next")&&document.querySelector("iframe").contentDocument.readyState==="complete"');await evaluate('retained:document-identities','({oldURL:retainedDialog.document.URL,currentURL:document.querySelector("iframe").contentDocument.URL,sameWindow:retainedDialog.window===document.querySelector("iframe").contentWindow,sameDocument:retainedDialog.document===document.querySelector("iframe").contentDocument,oldDefaultViewNull:retainedDialog.document.defaultView===null})');await arm('retained:after-navigation-arm',{accept:true});await evaluate('retained:old-method-after-navigation','retainedDialog.method.call(retainedDialog.window,"retained-after-navigation")');await evaluate('retained:next-main-after-navigation','confirm("main-after-retained-navigation")');});
 await stage('A07-retained-after-frame-removal',async()=>{await evaluate('retained:remove-child','document.querySelector("iframe").remove();({oldURL:retainedDialog.document.URL,oldDefaultViewNull:retainedDialog.document.defaultView===null})');await arm('retained:after-removal-arm',{accept:true});await evaluate('retained:old-method-after-removal','retainedDialog.method.call(retainedDialog.window,"retained-after-removal")');await evaluate('retained:next-main-after-removal','confirm("main-after-retained-removal")');});
 await stage('A08-utility-public-definition',async()=>{const tree=await request('definition:main-tree','Page.getFrameTree');const world=await request('definition:utility-create','Page.createIsolatedWorld',{frameId:tree.result?.frameTree?.frame?.id,worldName:'actual-dialog-definition'});const contextId=world.result?.executionContextId;if(!contextId)throw Error('Actual definition utility context not created');await evaluate('definition:utility',reflection,{contextId});});
}
try{
 server=http.createServer((req,res)=>{requests.push({url:req.url,method:req.method});const body=pages[req.url];if(body===undefined){res.writeHead(404);res.end();return;}const bytes=Buffer.from(body);res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':bytes.length,'cache-control':'no-store'});res.end(bytes);});server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 if(engine==='native')service=await startReference(binary,{args:nativeArgs});else{const {serve}=await import('../src/cdp.js');service=await serve({port:0,loadResources:profile==='core'?[]:['iframe']});service.endpoint='ws://127.0.0.1:'+service.port+'/';}client=await connect(service.endpoint);const send=client.socket.send;client.socket.send=function(data,...args){wire.push({direction:'sent',text:String(data)});return Reflect.apply(send,this,[data,...args]);};client.socket.on('message',raw=>wire.push({direction:'received',text:raw.toString()}));
 if(profile==='core')await core();else if(profile==='lifetime')await lifetime();else await authority();
}catch(error){failure=errorRecord(error);}
finally{
 if(client&&targetId)try{await request('cleanup:target','Target.closeTarget',{targetId},null);}catch(error){failure??=errorRecord(error);}
 if(client&&browserContextId)try{await request('cleanup:context','Target.disposeBrowserContext',{browserContextId},null);}catch(error){failure??=errorRecord(error);}
 await client?.close();await service?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const report={profile,engine,nativeArgs,rows,stages,wire,requests,events:client?.events??[],failure,ownedProcess:service?.process?{pid:service.process.pid,exitCode:service.process.exitCode,signal:service.process.signalCode,stderr:service.stderr,stderrTruncated:service.stderrTruncated}:undefined,...(engine==='native'?{binarySHA256:sha(await readFile(binary))}:{candidateCdpSHA256:sha(await readFile(new URL('../src/cdp.js',import.meta.url))),candidateDialogsSHA256:sha(await readFile(new URL('../src/javascript-dialogs.js',import.meta.url)))}),driverSHA256:sha(await readFile(new URL(import.meta.url))),fixtureSHA256:sha(Buffer.from(JSON.stringify(pages))),budgets:{rpcMs:2500,loadMs:2000,realTaskMs:2000,settlingDelayMs:0},scope:'Actual dialog calls/results/events and real inline/navigation/tasks; source expectations are not assertions or replacements. No engine code imported.'};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({profile,stages:stages.length,completed:stages.filter(stage=>stage.completed).length,rows:rows.length,requests:requests.length,dialogs:report.events.filter(event=>event.method.startsWith('Page.javascriptDialog')).length,failure,ownedProcess:report.ownedProcess}));if(failure)process.exitCode=1;
}
