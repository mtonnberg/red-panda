import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Browser} from '../src/browser.js';

test('actual internal animation task authority survives authored Window timer replacement',{timeout:5000},async t=>{
 const browser=new Browser({timeout:2000}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body>actual task owner</body>');
 const window=page.dom.window;let intercepted=0;
 for(const name of['setTimeout','clearTimeout','setInterval','clearInterval'])window[name]=()=>{intercepted++;throw new Error('authored timer replacement')};
 const animation=window.document.createElement('div').animate();
 const finished=new Promise(resolve=>animation.onfinish=resolve);await animation.finished;const event=await finished;
 assert.equal(animation.playState,'finished');assert.equal(event.isTrusted,true);assert.equal(event instanceof window.AnimationPlaybackEvent,true);assert.equal(event.target,animation);
 const canceled=new Promise(resolve=>animation.oncancel=resolve);animation.cancel();assert.equal((await canceled).type,'cancel');assert.equal(intercepted,0);
 page.close();assert.equal(page.closed,true);
});

test('actual private animation callback uses the captured Window watchdog and leaves later queries and close usable',{timeout:8000},async()=>{
 const child=spawn(process.execPath,['--experimental-vm-modules',new URL('./fixtures/animation-task-watchdog.mjs',import.meta.url).pathname],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
 let expired=false;const guard=setTimeout(()=>{expired=true;child.kill('SIGKILL')},7000);
 const{code,signal}=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));clearTimeout(guard);
 assert.equal(expired,false,stdout+stderr);assert.equal(signal,null,stdout+stderr);assert.equal(code,0,stdout+stderr);
 const report=JSON.parse(stdout.trim().split('\n').at(-1));assert.equal(report.entered,true);assert.equal(report.state,'finished');assert.equal(report.recovered,true);assert.equal(report.disposed,true);assert.equal(report.effectiveTimeout,200);
});
