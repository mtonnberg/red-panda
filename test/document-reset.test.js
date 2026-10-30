import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Browser } from '../src/browser.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
async function until(check) { const deadline = Date.now() + 5000; while (!check()) { if (Date.now() > deadline) throw new Error('Reset test timed out'); await tick(); } }
async function fixture(t, html = '<!doctype html><p id="old">old</p>', routes = {}, options = {}) {
  const requests = [], errors = [], server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://fixture.test').pathname; requests.push(name);
    if (name === '/page.html') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); return; }
    const route = routes[name]; if (typeof route === 'function') return route(request, response);
    response.writeHead(route ? 200 : 404, { 'content-type': name.endsWith('.css') ? 'text/css' : 'text/javascript' }); response.end(route ?? 'missing');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = new Browser({ timeout: 5000, ...options }), page = browser.createPage(); page.on('pageError', error => errors.push(error.message));
  t.after(async () => { browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await page.navigate(`http://127.0.0.1:${server.address().port}/page.html`);
  return { browser, page, window: page.dom.window, document: page.dom.window.document, requests, errors };
}

test('post-load reset retains Window, Document and constructor realm while erasing authored listeners/handlers', async t => {
  const f = await fixture(t); const context = f.page.executionContextId, signal = f.page.documentAbort.signal;
  const result = f.page.evaluate(`(()=>{
    window.saved={window,document,Array,Object,prototype:Object.prototype};window.events=[];window.records=[];
    new MutationObserver(batch=>records.push(...batch)).observe(document,{subtree:true,childList:true});
    document.addEventListener('probe',()=>events.push('document'));addEventListener('probe',()=>events.push('window'));
    window.oldBody=document.body;oldBody.onclick=()=>events.push('body');window.onmessage=()=>events.push('handler');
    document.open();const state=document.readyState;
    document.dispatchEvent(new Event('probe'));dispatchEvent(new Event('probe'));
    document.write('<section id="new">');document.write('<b id="one">one</b><b id="two">two</b>');document.write('</section>');
    return {state,sameWindow:window===saved.window,sameDocument:document===saved.document,sameArray:Array===saved.Array,
      sameObject:Object===saved.Object,samePrototype:Object.prototype===saved.prototype,handlers:[oldBody.onclick,window.onmessage],
      children:[...document.getElementById('new').children].map(x=>x.id),events};
  })()`);
  assert.deepEqual(plain(result), { state: 'loading', sameWindow: true, sameDocument: true, sameArray: true, sameObject: true, samePrototype: true, handlers: [null,null], children: ['one','two'], events: [] });
  f.page.evaluate('document.close()'); await until(() => f.document.readyState === 'complete'); await f.page.moduleReady;
  assert.equal(f.page.executionContextId, context); assert.equal(f.page.documentAbort.signal, signal); assert.equal(signal.aborted, false);
  assert.ok(f.window.records.some(record => record.removedNodes.length)); assert.ok(f.window.records.some(record => record.addedNodes.length));
  assert.deepEqual(f.errors, []);
});

test('write-created parsing joins split tokens and emits genuine DCL/window load exactly once after close', async t => {
  const f = await fixture(t);
  let hostDCL = 0, hostLoads = 0; f.page.on('domContentLoaded', () => hostDCL++); f.page.on('load', () => hostLoads++);
  f.page.evaluate(`document.open();window.lifecycle=[];
    document.addEventListener('DOMContentLoaded',e=>lifecycle.push({type:e.type,trusted:e.isTrusted,state:document.readyState}));
    addEventListener('load',e=>lifecycle.push({type:e.type,trusted:e.isTrusted,state:document.readyState,targetDocument:e.target===document}));
    document.write('<p id="spl');document.write('it">hello &am');document.write('p; world</p>');`);
  assert.equal(f.document.getElementById('split').textContent, 'hello & world'); assert.equal(f.document.readyState, 'loading');
  f.page.evaluate('document.close();document.close()'); await until(() => f.document.readyState === 'complete'); await tick();
  assert.deepEqual(plain(f.window.lifecycle), [{ type: 'DOMContentLoaded', trusted: true, state: 'interactive' }, { type: 'load', trusted: true, state: 'complete', targetDocument: true }]);
  f.page.evaluate('document.close()'); await tick(); assert.equal(f.window.lifecycle.length, 2); assert.deepEqual(f.errors, []);
  assert.equal(hostDCL, 1); assert.equal(hostLoads, 1);
});

test('reentrant written inline script queues real writes and closes only after its parser unwinds', async t => {
  const f = await fixture(t);
  f.page.evaluate(`document.open();window.ran=false;window.innerVisible=null;
    document.write('<script id="writer">window.ran=this===window;document.write("<p id=nested>nested</p>");window.innerVisible=!!document.getElementById("nested");document.close();<\/script>');`);
  await until(() => f.document.readyState === 'complete');
  assert.equal(f.window.ran, true); assert.equal(f.window.innerVisible, false);
  assert.equal(f.document.getElementById('nested').textContent, 'nested'); assert.deepEqual(f.errors, []);
});

test('fresh coherent resource queues hold real external script and EOF until its HTTP body arrives', async t => {
  let release;
  const f = await fixture(t, undefined, { '/held.js': (request,response) => { release = () => { response.writeHead(200, {'content-type':'text/javascript'}); response.end('window.externalRan=true;window.tailDuringScript=!!document.getElementById("tail");'); }; } });
  f.page.evaluate(`document.open();document.write('<script src="/held.js"><\/script><p id="tail">tail</p>');document.close();`);
  await until(() => release); assert.equal(f.document.readyState, 'loading'); assert.equal(f.document.getElementById('tail'), null);
  release(); await until(() => f.document.readyState === 'complete');
  assert.equal(f.window.externalRan, true); assert.equal(f.window.tailDuringScript, false); assert.ok(f.document.getElementById('tail')); assert.deepEqual(f.errors, []);
});

test('new parser-inserted modules wait for close while module map and same realm survive a reset', async t => {
  const f = await fixture(t, '<!doctype html><script type="module" src="/state.mjs"></script>', { '/state.mjs': 'window.evaluations=(window.evaluations??0)+1;' });
  assert.equal(f.window.evaluations, 1);
  f.page.evaluate(`document.open();document.write('<script type="module" src="/state.mjs"><\/script><script type="module">window.freshModule=true;<\/script>');`);
  await tick(); await tick(); assert.equal(f.window.freshModule, undefined); assert.equal(f.document.readyState, 'loading');
  f.page.evaluate('document.close()'); await f.page.moduleReady; await until(() => f.document.readyState === 'complete');
  assert.equal(f.window.freshModule, true); assert.equal(f.window.evaluations, 1); assert.deepEqual(f.errors, []);
});

test('ordinary pending fetch survives reset and write-created parser can be superseded without stale work', async t => {
  let release;
  const f = await fixture(t, undefined, { '/kept': (request,response) => { release = () => { response.writeHead(200, {'content-type':'text/plain'}); response.end('kept'); }; } });
  f.page.evaluate(`window.kept=fetch('/kept').then(r=>r.text());`); await until(() => release);
  f.page.evaluate(`document.open();document.write('<p id="discarded">discarded');document.open();document.write('<p id="fresh">fresh</p>');document.close();`);
  await until(() => f.document.readyState === 'complete'); release(); assert.equal(await f.window.kept, 'kept');
  assert.equal(f.document.getElementById('discarded'), null); assert.equal(f.document.getElementById('fresh').textContent, 'fresh'); assert.equal(f.page.documentAbort.signal.aborted, false);
  assert.deepEqual(f.errors, []);
});

test('written stylesheet blockers use the replacement queues before inline script and EOF resume', async t => {
  let release;
  const f = await fixture(t, undefined, { '/slow.css': (request,response) => { release = () => { response.writeHead(200, {'content-type':'text/css'}); response.end('b {color:red}'); }; } });
  f.page.evaluate(`document.open();document.write('<link rel="stylesheet" href="/slow.css"><script>window.sheets=document.styleSheets.length;document.write("<b id=written>written</b>");<\/script><p id="tail">tail</p>');document.close();`);
  await until(() => release); assert.equal(f.window.sheets, undefined); assert.equal(f.document.getElementById('tail'), null);
  release(); await until(() => f.document.readyState === 'complete');
  assert.equal(f.window.sheets, 1); assert.equal(f.document.getElementById('written').textContent, 'written'); assert.ok(f.document.getElementById('tail')); assert.deepEqual(f.errors, []);
});

test('an already-running dynamic module continues while the new cycle has independent readiness', async t => {
  let release;
  const f = await fixture(t, undefined, { '/module-held': (request,response) => { release = () => { response.writeHead(200, {'content-type':'text/plain'}); response.end('continued'); }; } });
  f.page.evaluate(`{const script=document.createElement('script');script.type='module';script.textContent='window.oldModuleStarted=true;await fetch("/module-held");window.oldModuleFinished=true;';document.body.append(script);}`);
  await until(() => release); assert.equal(f.window.oldModuleStarted, true);
  f.page.evaluate(`document.open();document.write('<script type="module">await new Promise(resolve=>document.addEventListener("DOMContentLoaded",resolve,{once:true}));window.newModuleFinished=true;<\/script>');document.close();`);
  await f.page.moduleReady; await until(() => f.document.readyState === 'complete');
  assert.equal(f.window.newModuleFinished, true); assert.equal(f.window.oldModuleFinished, undefined);
  release(); await until(() => f.window.oldModuleFinished === true); assert.equal(f.page.documentAbort.signal.aborted, false); assert.deepEqual(f.errors, []);
});

test('raw Window.close aborts a real pending written external without stale parser continuation', async t => {
  let received = false, disconnected = false;
  const f = await fixture(t, undefined, { '/never.js': (request,response) => { received = true; response.on('close', () => { disconnected = true; }); } });
  f.page.evaluate(`document.open();document.write('<script src="/never.js"><\/script><p id="tail">tail</p>');document.close();`);
  await until(() => received); f.window.close(); const afterClose = f.document.querySelectorAll('*').length;
  await until(() => disconnected); await tick(); await tick();
  assert.equal(f.document.querySelectorAll('*').length, afterClose); assert.equal(f.document.getElementById('tail'), null);
  assert.equal(f.page.closed, false); assert.equal(f.page.documentAbort.signal.aborted, false);
});

test('post-load iframe writes retain the actual child Window, Document and VM context', async t => {
  const f = await fixture(t, '<!doctype html><p id="parent">parent</p><iframe src="/child.html"></iframe>', {
    '/child.html': (request,response) => { response.writeHead(200, {'content-type':'text/html'}); response.end('<!doctype html><p>old child</p>'); },
  });
  const frame = f.document.querySelector('iframe'), childWindow = frame.contentWindow, childDocument = frame.contentDocument;
  await until(() => childDocument.readyState === 'complete'); await tick();
  const context = f.page.frames.findElement(frame).executionContextId;
  let childLoads = 0; f.page.on('frameLoad', () => childLoads++);
  f.page.evaluate(`window.frame=document.querySelector('iframe');window.childDoc=frame.contentDocument;childDoc.open();childDoc.write('<section id="child">');childDoc.write('<script>window.childRealm=parent!==window&&document===window.document;<\/script>');childDoc.write('<b id="nested">nested</b></section>');childDoc.close();`);
  await until(() => childDocument.readyState === 'complete');
  assert.equal(frame.contentWindow, childWindow); assert.equal(frame.contentDocument, childDocument);
  assert.equal(f.page.frames.findElement(frame).executionContextId, context); assert.equal(childWindow.childRealm, true);
  assert.equal(childDocument.getElementById('nested').parentNode.id, 'child'); assert.equal(f.document.getElementById('parent').textContent, 'parent'); assert.deepEqual(f.errors, []);
  assert.equal(childLoads, 1);
});

test('host hashchange reconciliation survives public listener erasure across repeated parse cycles', async t => {
  const f = await fixture(t); let loads = 0;
  for (let index = 0; index < 3; index++) {
    f.page.evaluate(`window.publicHash=0;addEventListener('hashchange',()=>publicHash++);document.open();window.cycleLoads=0;addEventListener('load',()=>cycleLoads++);document.write('<p>cycle</p>');document.close();`);
    await until(() => f.document.readyState === 'complete'); await tick(); loads += f.window.cycleLoads;
  }
  assert.equal(loads, 3); f.page.evaluate('location.hash="kept"'); await until(() => f.page.url.endsWith('#kept'));
  assert.equal(f.window.publicHash, 0); assert.deepEqual(f.errors, []);
});

test('written parser custom-element constructors retain actual dynamic-markup restrictions and realm errors', async t => {
  const f = await fixture(t);
  f.page.evaluate(`window.blocked=[];customElements.define('reset-guard',class extends HTMLElement{constructor(){super();for(const method of ['open','write','close'])try{document[method]('<p>bad</p>');}catch(error){blocked.push({method,name:error.name,realm:error instanceof DOMException});}}});
    document.open();document.write('<reset-guard></reset-guard><p id="fresh">fresh</p>');document.close();`);
  await until(() => f.document.readyState === 'complete');
  assert.deepEqual(plain(f.window.blocked), ['open','write','close'].map(method => ({ method, name:'InvalidStateError', realm:true })));
  assert.equal(f.document.getElementById('fresh').textContent, 'fresh'); assert.deepEqual(f.errors, []);
});

test('disabled scripting still parses real post-load written markup without source fetch or execution', async t => {
  const f = await fixture(t, undefined, { '/never.js':'window.executed=true;' }, {javascript:false});
  f.page.evaluate(`document.open();document.write('<script src="/never.js"><\/script><script>window.executed=true;<\/script><section id="fresh">');document.write('<b>text</b></section>');document.close();`);
  await until(() => f.document.readyState === 'complete');
  assert.equal(f.window.executed, undefined); assert.equal(f.document.querySelector('#fresh b').textContent, 'text');
  assert.deepEqual(f.requests, ['/page.html']); assert.deepEqual(f.errors, []);
});


test('fresh write-created parser initializes range controls after their complete attribute set',async t=>{
 const f=await fixture(t);
 f.page.evaluate(`document.open();document.write('<form><input type="range" min="10" max="30" step="4"><input max="30" step="4" min="10" type="range"></form>');document.close();`);
 await until(()=>f.document.readyState==='complete');
 assert.deepEqual([...f.document.querySelectorAll('input')].map(input=>input.value),['22','22']);
});
