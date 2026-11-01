// Owned-process control: actual ResourceQueue delivery enters a real authored
// infinite handler under the200ms Window policy; no timeout is synthesized.
import http from'node:http';import{once}from'node:events';
import{Browser}from'../../src/browser.js';import{platformFactoryRecord}from'../../src/platform-factories.js';import{inspectInitialNetworkLoad}from'../../src/initial-network-load.js';import{initialReportErrorProbe}from'./initial-report-error-probe.mjs';
const mode=process.argv[2];if(!['window','frame-error'].includes(mode))throw Error('Explicit owned mode required');
const browser=new Browser({timeout:1000,loadResources:['iframe']}),page=browser.createPage(),report={mode,policyMilliseconds:200,ownedChildMilliseconds:7000,actualErrors:[]};let server,held,arrive,frame,framePage;
const arrived=new Promise(resolve=>arrive=resolve);
function eventState(front,window){const value=platformFactoryRecord(front)?.implementation;if(!value)throw Error('Actual canonical saved Event required');return{phase:value.eventPhase,currentTargetNull:value.currentTarget===null,pathLength:value._path.length,dispatching:value._dispatchFlag,passive:value._inPassiveListenerFlag,stop:value._stopPropagationFlag,immediateStop:value._stopImmediatePropagationFlag,windowEventUndefined:window.event===undefined}}
try{
 server=http.createServer((request,response)=>{if(request.url==='/held.js'){held=response;arrive();return}response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(request.url==='/child'?'<script defer src="/held.js"></script><p id=actual>real guarded initial bytes</p>':'<!doctype html><p>actual owned parent</p>')});server.listen(0,'127.0.0.1');await once(server,'listening');report.fixture={pid:process.pid,port:server.address().port};console.log(JSON.stringify({fixtureListening:report.fixture}));const origin='http://127.0.0.1:'+server.address().port;
 await page.navigate(origin+'/parent');page.timeout=200;
 page.newDocumentScripts.set('actual-infinite-initial',{source:`if(self!==top)addEventListener('load',event=>{globalThis.actualSavedInitial=event;while(true){}},{once:true})`});
 page.evaluate(`globalThis.actualFrame=document.createElement('iframe');actualFrame.src=${JSON.stringify(origin+'/child')};${mode==='frame-error'?"actualFrame.addEventListener('error',event=>{globalThis.actualSavedFrameError=event;while(true){}},{once:true});":''}document.body.append(actualFrame);`);
 frame=page.dom.window.actualFrame;framePage=page.frames.findElement(frame);if(!framePage)throw Error('Actual owning FramePage required');framePage.on('pageError',error=>report.actualErrors.push({name:error.name,code:error.code,message:error.message}));
 const arrivedTimer=setTimeout(()=>arrive(Error('Original1000ms held request arrival limit')),1000);const arrival=await arrived;clearTimeout(arrivedTimer);if(arrival instanceof Error)throw arrival;
 held.writeHead(200,{'content-type':'text/javascript'});held.end('globalThis.actualDeferredBytes=42');held=null;
 const started=Date.now();for(;;){if(report.actualErrors.length>=(mode==='window'?1:2)&&frame.contentWindow.actualSavedInitial&&(mode==='window'||page.dom.window.actualSavedFrameError))break;if(Date.now()-started>=1000)throw Error('Original1000ms actual handler observation ceiling');await new Promise(resolve=>setTimeout(resolve,5))}
 await new Promise(resolve=>setImmediate(resolve));
 const child=frame.contentWindow,parent=page.dom.window;report.events=[eventState(child.actualSavedInitial,child)];if(mode==='frame-error')report.events.push(eventState(parent.actualSavedFrameError,parent));
 report.owner=inspectInitialNetworkLoad(platformFactoryRecord(child.document).implementation);report.actualBytes=child.document.getElementById('actual').textContent;report.deferredBytes=child.actualDeferredBytes;
 let calls=0;const target=child.document.createElement('div');target.addEventListener('load',()=>calls++);target.dispatchEvent(child.actualSavedInitial);report.redispatch=calls;
 report.futureQuery=framePage.evaluate('6*7');report.parentQuery=page.evaluate('6*7');
 const beforeLaterReport=report.actualErrors.length;report.laterReportObservation=JSON.parse(JSON.stringify(framePage.evaluate('('+initialReportErrorProbe.toString()+')()')));report.laterForwardedPageErrors=report.actualErrors.slice(beforeLaterReport);const observed=report.laterReportObservation;report.laterReport=observed.called===1&&observed.returnedUndefined&&observed.during?.message===observed.during?.expectedMessage&&observed.during?.message==='Error: actual later report'&&observed.during?.errorSame===true&&observed.during?.trusted===true&&observed.during?.cancelable===true&&observed.during?.defaultPreventedAfter===true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1}finally{
 if(held)held.destroy();await browser.close();report.closed=page.closed;
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 console.log(JSON.stringify(report));
}
