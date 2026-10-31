import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Browser} from '../src/browser.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFixture} from './fixture.js';
import {getRuntimeBinding} from '../src/native-runtime.js';

test('actual internal animation task authority survives authored Window timer replacement',{timeout:5000},async t=>{
 const actual=getRuntimeBinding();let checkpoints=0;const runtimeBinding={...actual,checkpoint(){checkpoints++;return actual.checkpoint()}};
 const browser=new Browser({timeout:2000,runtimeBinding}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body>actual task owner</body>');
 const window=page.dom.window;let intercepted=0;
 const before=checkpoints,noResolver=window.document.createElement('div').animate();await new Promise(resolve=>noResolver.onfinish=resolve);
 assert.equal(checkpoints,before,'an automatic animation without a finished resolver does not create a checkpoint');
 for(const name of['setTimeout','clearTimeout','setInterval','clearInterval'])window[name]=()=>{intercepted++;throw new Error('authored timer replacement')};
 const animation=window.document.createElement('div').animate();
 const finished=new Promise(resolve=>animation.onfinish=resolve);await animation.finished;const event=await finished;
 assert.equal(checkpoints,before+1,'the actual invoked finished resolver owns the automatic checkpoint');
 assert.equal(animation.playState,'finished');assert.equal(event.isTrusted,true);assert.equal(event instanceof window.AnimationPlaybackEvent,true);assert.equal(event.target,animation);
 const canceled=new Promise(resolve=>animation.oncancel=resolve);animation.cancel();assert.equal((await canceled).type,'cancel');assert.equal(intercepted,0);
 page.close();assert.equal(page.closed,true);
});

for(const phase of['event','promise'])test('actual private animation '+phase+' callback uses the captured Window watchdog and leaves future checkpoints usable',{timeout:8000},async()=>{
 const child=spawn(process.execPath,['--experimental-vm-modules',new URL('./fixtures/animation-task-watchdog.mjs',import.meta.url).pathname,phase],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
 let expired=false;const guard=setTimeout(()=>{expired=true;child.kill('SIGKILL')},7000);
 const{code,signal}=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));clearTimeout(guard);
 if(process.env.ANIMATION_WATCHDOG_EVIDENCE)await writeFile(process.env.ANIMATION_WATCHDOG_EVIDENCE+'-'+phase+'.json',JSON.stringify({phase,pid:child.pid,code,signal,expired,stdout,stderr},null,2)+'\n',{flag:'wx'});
 assert.equal(expired,false,stdout+stderr);assert.equal(signal,null,stdout+stderr);assert.equal(code,0,stdout+stderr);
 const report=JSON.parse(stdout.trim().split('\n').at(-1));assert.equal(report.entered,true);assert.equal(report.state,'finished');assert.equal(report.recovered,true);assert.equal(report.disposed,true);assert.equal(report.effectiveTimeout,200);assert.deepEqual(report.futureOrder,['promise','event']);
});

test('actual Native animation producer checkpoints, deeper chains, state mutations and real frame retirement match',{timeout:10000},async t=>{
 const sha=value=>createHash('sha256').update(value).digest('hex');
 for(const name of['producer','reaction-boundary']){
  const expression=await readFile(new URL('../oracle/animations-'+name+'-expression.js',import.meta.url),'utf8'),native=JSON.parse(await readFile(new URL('../oracle/animations-native-'+name+'.json',import.meta.url),'utf8'));assert.equal(sha(expression),native.sourceSHA256);
  const server=await createFixture(),browser=new Browser({timeout:10000,loadResources:['iframe','worker']});t.after(async()=>{browser.close();await server.close()});const page=browser.createPage();await page.navigate('data:text/html,<body>animations</body>');await page.navigate(server.url);
  assert.deepEqual(JSON.parse(JSON.stringify(await page.evaluate(expression))),native.result);
 }
});
