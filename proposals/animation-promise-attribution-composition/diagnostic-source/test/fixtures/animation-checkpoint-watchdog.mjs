import assert from 'node:assert/strict';
import {Browser} from '../../src/browser.js';
import {getRuntimeBinding} from '../../src/native-runtime.js';
import {getHeapBinding} from '../../src/native-heap.js';
import {types} from 'node:util';
const native=getRuntimeBinding(),checkpointCalls=[];
const runtimeBinding={...native,checkpoint(){const row={entered:true};checkpointCalls.push(row);process.stdout.write(JSON.stringify({marker:'actual-checkpoint-enter',index:checkpointCalls.length})+'\n');const result=native.checkpoint();row.result=result;process.stdout.write(JSON.stringify({marker:'actual-checkpoint-return',index:checkpointCalls.length,result})+'\n');return result}};
const phase=process.argv[2]??'event',browser=new Browser({timeout:200,runtimeBinding}),page=browser.createPage(),report={phase,effectiveTimeout:200};let timeoutError;
try{
 await page.navigate('data:text/html,<body>actual animation watchdog</body>');
 page.on('pageError',error=>{timeoutError=error});
 const source=phase==='promise'?'globalThis.entered=false;globalThis.animation=document.createElement("div").animate();animation.finished.then(()=>{entered=true;while(true){}});true':'globalThis.entered=false;globalThis.animation=document.createElement("div").animate();animation.onfinish=()=>{entered=true;while(true){}};true';
 page.evaluate(source);
 if(phase==='promise'){const value=page.dom.window.animation.finished,h=getHeapBinding(),anchor=page.dom.window.Object.prototype,prototype=Object.getPrototypeOf(value);const before={genuine:types.isPromise(value),VM:h.sameRealm(value,anchor),Host:h.sameRealm(value,{})};Object.setPrototypeOf(value,null);let after;try{after={VM:h.sameRealm(value,anchor),Host:h.sameRealm(value,{})}}finally{Object.setPrototypeOf(value,prototype)}report.promiseOwnership={before,after};assert.deepEqual(report.promiseOwnership,{before:{genuine:true,VM:true,Host:false},after:{VM:true,Host:false}});process.stdout.write(JSON.stringify({marker:'actual-owning-VM-Promise',proof:report.promiseOwnership})+'\n');}
 process.stdout.write(JSON.stringify({marker:'armed',phase,effectiveTimeout:200})+'\n');
 const end=Date.now()+2000;while(!timeoutError){if(Date.now()>=end)throw Error('Original2s diagnostic callback-error deadline');await new Promise(resolve=>setTimeout(resolve,5))}
 assert.match(timeoutError.message,/timed out/);
 const result=page.evaluate('({entered,state:animation.playState,text:document.body.textContent})');report.entered=result.entered;report.state=result.state;report.recovered=result.text==='actual animation watchdog';
 assert.equal(report.entered,true);assert.equal(report.recovered,true);assert.equal(report.state,'finished');
 // A later real automatic producer must still perform its actual checkpoint;
 // a latched native busy/reentrant flag cannot masquerade as recovery.
 page.evaluate('globalThis.recoveryOrder=[];globalThis.nextAnimation=document.createElement("div").animate();nextAnimation.finished.then(()=>recoveryOrder.push("promise"));nextAnimation.onfinish=()=>recoveryOrder.push("event");true');
 const recoveryEnd=Date.now()+2000;while(page.evaluate('recoveryOrder.length')!==2){if(Date.now()>=recoveryEnd)throw Error('Original2s futurecheckpoint deadline');await new Promise(resolve=>setTimeout(resolve,5))}
 report.futureOrder=Array.from(page.evaluate('recoveryOrder'));assert.deepEqual(report.futureOrder,['promise','event']);
 page.close();report.disposed=page.closed;
}finally{browser.close()}
report.actualCheckpointCalls=checkpointCalls;console.log(JSON.stringify(report));
