import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const plain = value => JSON.parse(JSON.stringify(value));
async function fixture(t) {
  const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();
  t.after(()=>browser.close());await page.navigate('data:text/html,<body>Owned browser tasks');
  return {browser,page,w:page.dom.window};
}

test('a real posted message cancels an overdue positive timer before authored execution',{timeout:4000},async t=>{
  const {page}=await fixture(t);
  const result=await page.evaluate(`(async()=>{const a=new BroadcastChannel('owned-cancel-positive'),b=new BroadcastChannel('owned-cancel-positive'),events=[];
    const id=setTimeout(()=>events.push('timer'),100);b.onmessage=e=>{events.push(e.data);clearTimeout(id)};a.postMessage('actual message');
    const end=performance.now()+120;while(performance.now()<end){}await new Promise(resolve=>setTimeout(resolve,40));a.close();b.close();return events})()`);
  assert.deepEqual(plain(result),['actual message']);
});

test('due positive timer IDs stay cancellable before their queued Immediate and before a zero timer',{timeout:4000},async t=>{
  const {w}=await fixture(t);let calls=0,conversions=0;
  const id=w.setTimeout(()=>calls++,{valueOf(){conversions++;return 1}});
  await new Promise(resolve=>setTimeout(()=>{w.clearTimeout(id);resolve()},1));
  await delay(20);assert.equal(calls,0);assert.equal(conversions,1);
  const later=w.setTimeout(()=>calls++,20);w.setTimeout(()=>w.clearTimeout(later),0);
  await delay(35);assert.equal(calls,0);assert.equal(conversions,1);
});

test('positive intervals coalesce pending jobs and keep callback microtasks and cancellation',{timeout:4000},async t=>{
  const {page}=await fixture(t);
  const result=await page.evaluate(`(async()=>{const log=[];let count=0,resolve;const done=new Promise(r=>resolve=r);const id=setInterval(()=>{const n=++count;log.push(n);Promise.resolve().then(()=>log.push('micro'+n));if(n===3){clearInterval(id);resolve()}},1);await done;await new Promise(r=>setTimeout(r,15));return{count,log}})()`);
  assert.deepEqual(plain(result),{count:3,log:[1,'micro1',2,'micro2',3,'micro3']});
});

test('owned Page close cancels queued positive tasks and frame retirement cancels its timers',{timeout:4000},async t=>{
  const {page,w}=await fixture(t);let calls=0;
  w.setTimeout(()=>calls++,1);await new Promise(resolve=>setTimeout(()=>{page.close();resolve()},1));
  await delay(20);assert.equal(calls,0);
  const next=await fixture(t),frame=next.w.document.createElement('iframe');next.w.document.body.append(frame);
  const child=frame.contentWindow;child.__calls=0;child.setTimeout(()=>child.__calls++,1);
  await new Promise(resolve=>setTimeout(()=>{frame.remove();resolve()},1));
  await delay(20);assert.equal(child.__calls,0);
});

test('ordinary main Window close preserves live positive timer and interval behavior',{timeout:4000},async t=>{
  const {page}=await fixture(t);
  const result=await page.evaluate(`(async()=>{let count=0,resolveTick;const tick=new Promise(resolve=>resolveTick=resolve);const value=new Promise(resolve=>setTimeout(()=>resolve('actual timer'),2));const id=setInterval(()=>{count++;resolveTick()},2);close();const result=await value;await tick;clearInterval(id);return[result,closed,count]})()`);
  assert.deepEqual(plain(result),['actual timer',false,1]);
});
