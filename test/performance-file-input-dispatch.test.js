import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser.js';
import {runFileInput} from '../src/cdp-file-input.js';

test('EventCounts observes the actual private file input dispatch producer before trusted listeners',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'actual-event-count-input-')),browser=new Browser(),page=browser.createPage();
 t.after(async()=>{browser.close();await rm(directory,{recursive:true,force:true});});
 const file=join(directory,'actual.bin');await writeFile(file,Buffer.from([0,255,65]));
 await page.navigate('data:text/html,<input id=actual type=file>');const w=page.dom.window,input=w.document.getElementById('actual'),events=[];
 for(const type of ['input','change'])input.addEventListener(type,e=>events.push({type:e.type,trusted:e.isTrusted,input:w.performance.eventCounts.get('input'),change:w.performance.eventCounts.get('change')}));
 const session={page,nodes:new Map([[1,input]])};class WireError extends Error{constructor(message,code){super(message);this.code=code;}}
 assert.deepEqual(runFileInput({browser},session,{nodeId:1,files:[file]},WireError),{});
 assert.deepEqual(events,[{type:'input',trusted:true,input:1,change:0},{type:'change',trusted:true,input:1,change:0}]);
 assert.equal(input.files.length,1);assert.deepEqual(Array.from(new w.Uint8Array(await input.files[0].arrayBuffer())),[0,255,65]);
});
