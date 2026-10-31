import assert from 'node:assert/strict';
import {Browser} from '../../src/browser.js';
const browser=new Browser({timeout:200}),page=browser.createPage(),report={effectiveTimeout:200};let timeoutError;
try{
 await page.navigate('data:text/html,<body>actual animation watchdog</body>');
 page.on('pageError',error=>{timeoutError=error});
 page.evaluate('globalThis.entered=false;globalThis.animation=document.createElement("div").animate();animation.onfinish=()=>{entered=true;while(true){}};true');
 process.stdout.write(JSON.stringify({marker:'armed',effectiveTimeout:200})+'\n');
 const end=Date.now()+2000;while(!timeoutError){if(Date.now()>=end)throw Error('Original2s diagnostic callback-error deadline');await new Promise(resolve=>setTimeout(resolve,5))}
 assert.match(timeoutError.message,/timed out/);
 const result=page.evaluate('({entered,state:animation.playState,text:document.body.textContent})');report.entered=result.entered;report.state=result.state;report.recovered=result.text==='actual animation watchdog';
 assert.equal(report.entered,true);assert.equal(report.recovered,true);assert.equal(report.state,'finished');
 page.evaluate('globalThis.recoveryOrder=[];const next=document.createElement("div").animate();next.finished.then(()=>recoveryOrder.push("promise"));next.onfinish=()=>recoveryOrder.push("event");true');
 const recoveryEnd=Date.now()+2000;while(page.evaluate('recoveryOrder.length')!==2){if(Date.now()>=recoveryEnd)throw Error('Original2s positive producer deadline');await new Promise(resolve=>setTimeout(resolve,5))}
 report.futureOrder=Array.from(page.evaluate('recoveryOrder'));assert.deepEqual(report.futureOrder,['promise','event']);
 page.close();report.disposed=page.closed;
}finally{browser.close()}
console.log(JSON.stringify(report));
