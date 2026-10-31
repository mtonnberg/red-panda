import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
import {createFixture} from './fixture.js';
import {getRuntimeBinding} from '../src/native-runtime.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser({timeout:10000,loadResources:['iframe','worker']});t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body>animations</body>');return{page,browser,w:page.dom.window};}
for(const [group,label]of[['surface','surface-final'],['values','values'],['state','state-final'],['detail','detail-stable'],['promises','promises'],['realm','realm'],['retirement','retirement'],['edge','edge'],['style','style-stable']])test('actual Native animation '+group+' observations match',async t=>{
 const {page}=await fixture(t);if(group==='realm'||group==='promises'||group==='detail'||group==='retirement'){const server=await createFixture();t.after(()=>server.close());await page.navigate(server.url);}
 const expression=await readFile(new URL('../oracle/animations-'+group+'-expression.js',import.meta.url),'utf8'),native=JSON.parse(await readFile(new URL('../oracle/animations-native-'+label+'.json',import.meta.url),'utf8'));
 assert.ok(Array.isArray(native.result),'actual Native control must produce observations');let result;
 if(group==='promises'){
  // The node:test host flags even Window-prevented unhandled rejections.
  // Keep the positive rejection control intact in its own actual process.
  const {stdout}=await promisify(execFile)(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./animation-promise-case.js',import.meta.url))],{timeout:10000});result=JSON.parse(stdout);
 }else result=plain(await page.evaluate(expression));
 assert.deepEqual(result,native.result);
});
test('keyframes never invent style output and actual public objects keep correct realms/brands',async t=>{
 const {page}=await fixture(t);const result=plain(await page.evaluate(`(async()=>{const element=document.createElement('div');element.style.cssText='opacity:0.4;width:12px;transform:translateX(3px)';document.body.append(element);const read=()=>({opacity:getComputedStyle(element).opacity,width:getComputedStyle(element).width,transform:getComputedStyle(element).transform});const before=read(),animation=element.animate([{opacity:0,width:'10px',transform:'translateX(0px)'},{opacity:1,width:'200px',transform:'translateX(100px)'}],{duration:1e9,iterations:Infinity,fill:'forwards'}),started=read();await animation.finished;const finished=read();animation.cancel();return{before,started,finished,canceled:read(),state:animation.playState,array:element.getAnimations()instanceof Array,empty:element.getAnimations().length}})()`));
 assert.deepEqual(result.started,result.before);assert.deepEqual(result.finished,result.before);assert.deepEqual(result.canceled,result.before);assert.equal(result.before.opacity,'0.4');assert.equal(result.before.width,'12px');assert.equal(result.state,'idle');assert.equal(result.array,true);assert.equal(result.empty,0);
});
test('author changes to public constructors and functions do not create brands or hijack internal events',async t=>{
 const {page}=await fixture(t);const value=plain(await page.evaluate(`(async()=>{const OriginalAnimation=Animation,OriginalEvent=AnimationPlaybackEvent,element=document.createElement('div');globalThis.Animation=function(){throw Error('public Animation used')};globalThis.AnimationPlaybackEvent=function(){throw Error('public event used')};const animation=element.animate();const event=await new Promise(resolve=>{animation.onfinish=resolve;animation.finish()});const fake=Object.create(OriginalAnimation.prototype);fake.note='authored';let rejected;try{OriginalAnimation.prototype.finish.call(fake)}catch(e){rejected=e instanceof TypeError}const clone=structuredClone(fake);return{animation:animation instanceof OriginalAnimation,event:event instanceof OriginalEvent,trusted:event.isTrusted,rejected,clone:clone.note,pending:fake.pending}})()`));assert.deepEqual(value,{animation:true,event:true,trusted:true,rejected:true,clone:'authored',pending:false});
});
test('the privileged handled-Promise bridge accepts genuine Promises only without reading proxy traps',()=>{
 const binding=getRuntimeBinding();assert.equal(typeof binding.markPromiseHandled,'function');assert.equal(binding.markPromiseHandled(new Promise(()=>{})),undefined);assert.throws(()=>binding.markPromiseHandled({}),/actual Promise/);let reads=0;assert.throws(()=>binding.markPromiseHandled(new Proxy(new Promise(()=>{}),{get(){reads++;throw Error('trap')}})),/actual Promise/);assert.equal(reads,0);
});
