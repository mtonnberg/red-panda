import assert from 'node:assert/strict';
import {Browser} from '../../src/browser.js';
const phase=process.argv[2]??'event',browser=new Browser({timeout:200}),page=browser.createPage(),report={phase,effectiveTimeout:200};let timeoutError;
try{
 await page.navigate('data:text/html,<body>actual animation watchdog</body>');
 page.on('pageError',error=>{timeoutError=error});
 const source=phase==='promise'?'globalThis.entered=false;globalThis.animation=document.createElement("div").animate();animation.finished.then(()=>{entered=true;while(true){}});true':'globalThis.entered=false;globalThis.animation=document.createElement("div").animate();animation.onfinish=()=>{entered=true;while(true){}};true';
 page.evaluate(source);
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
console.log(JSON.stringify(report));
