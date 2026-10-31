import {readFileSync} from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import { installWorkers } from '../src/workers.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deadline = (promise, milliseconds = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Worker fixture timed out')), milliseconds);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
function fixture(t, sources = {}) {
  const page = new EventEmitter(); page.documentAbort = new AbortController();
  const errors = [], requests = [];
  page.on('pageError', error => errors.push(error));
  page.referrerFor = (url, source) => source;
  page.fetch = async (url, init, type) => {
    requests.push({ url, init, type });
    let entry = sources[url]; if (typeof entry === 'function') entry = await entry(init);
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (typeof entry === 'string') entry = { source: entry };
    const response = new Response(entry?.source ?? '', { status: entry?.status ?? (entry ? 200 : 404),
      headers: { 'content-type': entry?.mime ?? 'text/javascript', ...(entry?.headers ?? {}) } });
    Object.defineProperty(response, 'url', { value: entry?.url ?? url }); return response;
  };
  const dom = new JSDOM('<body></body>', { url: 'https://example.test/app/page.html', runScripts: 'outside-only' });
  const workers = installWorkers(page, dom.window);
  t.after(() => { page.closed = true; page.documentAbort.abort(); workers.dispose(); dom.window.close(); });
  return { page, window: dom.window, workers, errors, requests };
}
function message(worker) { return deadline(new Promise((resolve, reject) => {
  worker.addEventListener('message', event => resolve(event.data), { once: true });
  worker.addEventListener('error', event => reject(event.error ?? new Error(event.message)), { once: true });
})); }
function portMessage(port) { return deadline(new Promise(resolve => {
  port.addEventListener('message', resolve, { once: true }); port.start();
})); }

test('Worker Scheduler executes actual callbacks and cancellation with genuine Worker values',async t=>{
 const code=readFileSync(new URL('../docs/reference/worker-scheduler/worker-scheduler-code.js',import.meta.url),'utf8');
 const f=fixture(t,{'https://example.test/app/scheduler.js':code}),worker=new f.window.Worker('./scheduler.js');
 const result=JSON.parse(JSON.stringify(await message(worker)));
 const expected=JSON.parse(readFileSync(new URL('../docs/reference/worker-scheduler/worker-scheduler-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(result,expected);assert.deepEqual(f.errors,[]);worker.terminate();
});
test('Worker Scheduler Native clones/handlers and copied marker controls',async t=>{
 const code=readFileSync(new URL('../docs/reference/worker-scheduler/worker-scheduler-extra-code.js',import.meta.url),'utf8');
 const f=fixture(t,{'https://example.test/app/scheduler.js':code}),worker=new f.window.Worker('./scheduler.js');
 const result=JSON.parse(JSON.stringify(await message(worker)));
 const expected=JSON.parse(readFileSync(new URL('../docs/reference/worker-scheduler/worker-scheduler-extra-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(result,expected);assert.deepEqual(f.errors,[]);worker.terminate();
});
test('Worker Scheduler public values/methods are actually created in selected VM',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,[new URL('./worker-scheduler-realm.mjs',import.meta.url).pathname]);
 const proof=JSON.parse(stdout);assert.equal(proof.thread,true);assert.equal(proof.backend,'public-v8-query-objects');
 assert.equal(proof.rows.length,11);for(const row of proof.rows){assert.equal(row.VM,true,row.name);assert.equal(row.Host,false,row.name);assert.equal(row.creationGlobal,true,row.name);assert.equal(row.VMNullPrototype,true,row.name);assert.equal(row.HostNullPrototype,false,row.name)}
});
test('Worker close tears down pending actual Scheduler jobs',async t=>{
 const f=fixture(t,{'https://example.test/app/scheduler.js':`scheduler.postTask(()=>postMessage('late'),{delay:20}).then(()=>postMessage('settled'));postMessage('before');close();`});
 const worker=new f.window.Worker('./scheduler.js'),messages=[];worker.onmessage=e=>messages.push(e.data);
 await deadline((async()=>{while(!messages.length||f.workers.size)await tick()})());
 assert.deepEqual(messages,['before']);assert.deepEqual(f.errors,[]);
});
