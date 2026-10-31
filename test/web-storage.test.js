import{test,before,after}from'node:test';
import assert from'node:assert/strict';
import http from'node:http';import{once}from'node:events';import{createRequire}from'node:module';
import{JSDOM}from'jsdom';import{platformFactoryRecord}from'../src/platform-factories.js';import{getHeapBinding}from'../src/native-heap.js';import{Browser}from'../src/browser.js';
const require=createRequire(import.meta.url),StorageIDL=require('jsdom/lib/jsdom/living/generated/Storage.js'),{implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
let server,origin;
before(async()=>{server=http.createServer((q,s)=>{if(q.url==='/redirect-child'){s.writeHead(302,{location:origin.replace('127.0.0.1','localhost')+'/final-child'});s.end();return;}s.setHeader('content-type','text/html');s.end('<!doctype html><body>owned storage test')});server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
const fixture=async(t,options={})=>{const b=new Browser(options);t.after(()=>b.close());const p=b.createPage();await p.navigate(origin);return{b,p,w:p.dom.window};};
test('Storage uses genuine ordinary native objects and private allocation brands',async t=>{
 const{w}=await fixture(t);for(const kind of ['localStorage','sessionStorage']){const s=w[kind];assert.equal(platformFactoryRecord(s)?.kind,'Storage');assert.equal(Object.getPrototypeOf(platformFactoryRecord(s).implementation),null);assert.equal(getHeapBinding().sameRealm(s,w.Object.prototype),true);assert.strictEqual(s,w[kind]);assert.strictEqual(Object.getPrototypeOf(s),w.Storage.prototype);assert.equal(Object.prototype.toString.call(s),'[object Storage]');}
 assert.deepEqual(Reflect.ownKeys(w.Storage.prototype).map(String),['length','getItem','setItem','removeItem','clear','key','constructor','Symbol(Symbol.toStringTag)']);
 assert.throws(()=>new w.Storage(),e=>e instanceof w.TypeError);
});
test('both areas count UTF-8 value bytes, exclude key bytes, fail atomically and reclaim replacement space',async t=>{
 const{w}=await fixture(t);for(const kind of ['localStorage','sessionStorage'])for(const[unit,count]of[['v',5242880],['é',2621440],['🐼',1310720]]){
  const s=w[kind],key='k'.repeat(1024*1024);s.clear();s.setItem(key,unit.repeat(count));assert.equal(s.getItem(key),unit.repeat(count));
  const fails=fn=>assert.throws(fn,e=>e instanceof w.DOMException&&e.name==='QuotaExceededError'&&e.message==='The quota has been exceeded');
  fails(()=>s.setItem('extra','v'));assert.equal(s.length,1);assert.equal(s.getItem('extra'),null);s.removeItem(key);s.setItem('a','v'.repeat(1024*1024));s.setItem('b','v'.repeat(4*1024*1024));fails(()=>s.setItem('a','v'.repeat(1024*1024+1)));assert.equal(s.getItem('a').length,1024*1024);assert.equal(s.getItem('b').length,4*1024*1024);s.setItem('a','');s.setItem('b','v'.repeat(5*1024*1024));assert.equal(s.getItem('a'),'');s.clear();
 }
});
test('ordinary property writes and definitions use the same quota and actual map',async t=>{
 const{w}=await fixture(t),s=w.localStorage;s.direct='a';Object.defineProperty(s,'defined',{value:'b',configurable:true});assert.equal(s.getItem('direct'),'a');assert.equal(s.getItem('defined'),'b');delete s.direct;assert.equal(s.getItem('direct'),null);s.clear();s.full='v'.repeat(5*1024*1024);assert.throws(()=>{s.more='v'},e=>e.name==='QuotaExceededError');assert.equal(s.getItem('more'),null);
});
test('coercion, required arguments, errors and borrowed receivers use captured realm brands',async t=>{
 const{w}=await fixture(t),s=w.localStorage,p=w.Storage.prototype;
 for(const[name,args]of[['getItem',[]],['setItem',['a']],['removeItem',[]],['key',[]]])assert.throws(()=>Reflect.apply(p[name],s,args),e=>e instanceof w.TypeError&&e.message==='invalid argument');
 for(const name of ['getItem','setItem','removeItem','key','clear'])for(const receiver of [{},new Proxy(s,{}),Object.create(s)])assert.throws(()=>Reflect.apply(p[name],receiver,['a','b']),e=>e instanceof w.TypeError);
 s.setItem(Symbol('key'),Symbol('value'));assert.equal(s.getItem(Symbol('key')),'value');s.setItem('none',Symbol());assert.equal(s.getItem('none'),'undefined');s.setItem('surrogate','\ud800');assert.equal(s.getItem('surrogate'),'�');
 assert.throws(()=>s.setItem({toString(){throw 23}},'x'),e=>e===23);assert.throws(()=>s.setItem('object',{[Symbol.toPrimitive](){return Symbol('wrapped')}}),e=>e instanceof w.TypeError);
 s.clear();s.setItem('only','a');for(const value of [undefined,null,0,4294967296,NaN,Infinity])assert.equal(s.key(value),'only');assert.equal(s.key(-1),null);assert.equal(s.key(1n),null);assert.throws(()=>s.key(Symbol()),e=>e instanceof w.TypeError);
});
test('context/origin data persists through navigation and target replacement with fresh real wrappers',async t=>{
 const{b,p,w}=await fixture(t);w.localStorage.setItem('a','local');w.sessionStorage.setItem('a','session');w.localStorage[Symbol.for('marker')]=w.Storage;await p.navigate(origin+'/next');let next=p.dom.window;
 assert.notStrictEqual(next.localStorage,w.localStorage);assert.equal(next.localStorage[Symbol.for('marker')],undefined);assert.ok(next.localStorage instanceof next.Storage);assert.equal(next.localStorage.getItem('a'),'local');assert.equal(next.sessionStorage.getItem('a'),'session');
 await p.navigate(origin.replace('127.0.0.1','localhost')+'/other');assert.equal(p.dom.window.localStorage.getItem('a'),null);assert.equal(p.dom.window.sessionStorage.getItem('a'),null);await p.navigate(origin+'/return');assert.equal(p.dom.window.localStorage.getItem('a'),'local');assert.equal(p.dom.window.sessionStorage.getItem('a'),'session');p.close();
 const peer=b.createPage();await peer.navigate(origin);assert.equal(peer.dom.window.localStorage.getItem('a'),'local');assert.equal(peer.dom.window.sessionStorage.getItem('a'),'session');
 const isolated=b.createPage(b.createContext());await isolated.navigate(origin);assert.equal(isolated.dom.window.localStorage.getItem('a'),null);assert.equal(isolated.dom.window.sessionStorage.getItem('a'),null);
});
test('live same-origin frames share the actual first-access wrapper and creator realm without automatic events',async t=>{
 const{w}=await fixture(t,{loadResources:['iframe']}),parent=w.localStorage,session=w.sessionStorage;
 const f=w.document.createElement('iframe');f.src=origin+'/child';const loaded=new Promise(r=>f.onload=r);w.document.body.append(f);await loaded;const child=f.contentWindow;
 assert.strictEqual(child.localStorage,parent);assert.strictEqual(child.sessionStorage,session);assert.ok(child.localStorage instanceof w.Storage);assert.ok(!(child.localStorage instanceof child.Storage));
 const observations=child.eval('({same:localStorage===parent.localStorage,own:localStorage instanceof Storage,parent:localStorage instanceof parent.Storage})');assert.equal(observations.same,true);assert.equal(observations.own,false);assert.equal(observations.parent,true);
 let events=0;child.addEventListener('storage',()=>events++);parent.setItem('shared','local');session.setItem('shared','session');parent.setItem('shared','updated');session.removeItem('shared');parent.clear();await new Promise(r=>setTimeout(r,30));assert.equal(events,0);
});
test('child-first storage access preserves genuine child wrapper and prototype in parent',async t=>{
 const{w}=await fixture(t,{loadResources:['iframe']});const f=w.document.createElement('iframe');w.document.body.append(f);const child=f.contentWindow,first=child.eval('localStorage');assert.strictEqual(w.localStorage,first);assert.ok(first instanceof child.Storage);assert.ok(!(first instanceof w.Storage));assert.strictEqual(Object.getPrototypeOf(first),child.Storage.prototype);first.setItem('full','v'.repeat(5*1024*1024));for(const [realm,other]of [[w,child],[child,w]])assert.throws(()=>realm.Storage.prototype.setItem.call(first,'extra','v'),e=>e instanceof realm.DOMException&&!(e instanceof other.DOMException));
});
test('independent opaque navigations get accessible isolated areas',async t=>{
 const{p}=await fixture(t);await p.navigate('data:text/html,<body>first');const w=p.dom.window;w.localStorage.setItem('opaque','actual');w.sessionStorage.setItem('opaque','actual');await p.navigate('data:text/html,<body>second');assert.equal(p.dom.window.localStorage.getItem('opaque'),null);assert.equal(p.dom.window.sessionStorage.getItem('opaque'),null);
});
test('unowned jsdom windows retain their original quota and SecurityError behavior',async t=>{
 await fixture(t);const ordinary=new JSDOM('',{url:origin,runScripts:'outside-only'}),opaque=new JSDOM('');try{assert.throws(()=>ordinary.window.localStorage.setItem('x','v'.repeat(5000000)),e=>e.name==='QuotaExceededError'&&e.message.includes('5000000-code unit'));assert.throws(()=>opaque.window.localStorage,e=>e.name==='SecurityError');}finally{ordinary.window.close();opaque.window.close();}
});

test('redirected frame origin changes cannot retarget a previously published genuine area',async t=>{
 const{p,w}=await fixture(t,{loadResources:['iframe']});p.newDocumentScripts.set('storage-redirect',{source:"globalThis.provisionalStorage=localStorage;provisionalStorage.setItem('early','owned')"});
 const f=w.document.createElement('iframe');f.src=origin+'/redirect-child';const loaded=new Promise(r=>f.onload=r);w.document.body.append(f);await loaded;const child=f.contentWindow;
 assert.notStrictEqual(child.localStorage,child.provisionalStorage);assert.equal(child.localStorage.getItem('early'),null);assert.equal(child.provisionalStorage.getItem('early'),'owned');assert.strictEqual(w.localStorage,child.provisionalStorage);assert.equal(w.localStorage.getItem('early'),'owned');assert.equal(platformFactoryRecord(child.localStorage)?.kind,'Storage');
});
