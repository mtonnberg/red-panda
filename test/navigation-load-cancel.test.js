import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Browser} from '../src/browser.js';

test('a real queued navigation stopped during module completion preserves the completed original document load',async t=>{
 const requests=[];
 const server=http.createServer((request,response)=>{requests.push(request.url);response.setHeader('content-type','text/html');response.end(`<!doctype html><script>globalThis.loaded=new Promise(r=>addEventListener('load',()=>setTimeout(r)))</script><script type=module>await loaded;location.href='/must-not-fetch';stop();globalThis.moduleCompleted=true;</script><p>actual original</p>`)});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve))});
 const origin='http://127.0.0.1:'+server.address().port,browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());const events=[];page.on('load',()=>events.push('load'));page.on('navigationError',error=>events.push(error.name));
 await page.navigate(origin+'/original');await page.moduleReady;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests,['/original']);assert.equal(page.url,origin+'/original');assert.equal(page.evaluate('document.readyState'),'complete');assert.equal(page.evaluate('moduleCompleted'),true);assert.equal(page.evaluate('document.querySelector("p").textContent'),'actual original');assert.deepEqual(events,['load']);assert.equal(page.activeRequests.size,0);assert.equal(page.pendingNavigation,null);
});
