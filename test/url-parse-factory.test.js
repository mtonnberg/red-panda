import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Browser} from '../src/browser.js';
import {getHeapBinding} from '../src/native-heap.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
const require=createRequire(import.meta.url),utils=require('whatwg-url/lib/utils.js');
const URLFactory=require('whatwg-url/lib/URL.js'),ParamsFactory=require('whatwg-url/lib/URLSearchParams.js');
function fixture(t){const browser=new Browser();t.after(()=>browser.close());return browser.createPage()}
function physical(value,w){const binding=getHeapBinding(),anchor=w.eval('[]'),prototype=Object.getPrototypeOf(value);try{for(let i=0;i<2;i++){assert.equal(binding.sameRealm(value,anchor),true);assert.equal(binding.sameRealm(value,[]),false);assert.equal(binding.creationGlobal(value),binding.creationGlobal(anchor));Object.setPrototypeOf(value,null)}}finally{Object.setPrototypeOf(value,prototype)}}
test('URL.parse publishes one genuine canonical URL with live components and owning-VM first shells',t=>{
 const page=fixture(t),w=page.dom.window,url=w.URL.parse('https://user:pass@example.com:8080/p/q?x=1#frag');
 assert.ok(url instanceof w.URL);assert.equal(URLFactory.is(url),true);assert.equal(url.href,'https://user:pass@example.com:8080/p/q?x=1#frag');
 const backend=utils.implForWrapper(url);assert.equal(utils.wrapperForImpl(backend),url);assert.equal(platformFactoryRecord(url).implementation,backend);physical(url,w);
 const params=url.searchParams;assert.ok(params instanceof w.URLSearchParams);assert.equal(ParamsFactory.is(params),true);assert.equal(url.searchParams,params);assert.equal(utils.wrapperForImpl(backend._query),params);physical(params,w);
 params.set('x','actual value');assert.equal(url.search,'?x=actual+value');url.search='?new=real';assert.equal(params.get('x'),null);assert.equal(params.get('new'),'real');url.pathname='/changed';assert.equal(url.href,'https://user:pass@example.com:8080/changed?new=real#frag');
});
test('ordinary constructed URL and URLSearchParams use the same canonical first-allocation seam',t=>{
 const w=fixture(t).dom.window;for(const value of[new w.URL('https://real.example/?x=1'),new w.URLSearchParams('x=1')]){physical(value,w);assert.equal(utils.wrapperForImpl(utils.implForWrapper(value)),value);assert.equal(platformFactoryRecord(value).implementation,utils.implForWrapper(value))}
 // Public legacy installer definitions retain their existing Host origin.
 assert.equal(getHeapBinding().sameRealm(w.URL,[]),true);
});
test('parse rejects malformed bases and URLs while accepting real absolute and relative schemes',t=>{
 const w=fixture(t).dom.window;
 for(const text of['about:blank','mailto:foo@bar.com','data:text/plain,hello','file:///etc/hosts'])assert.ok(w.URL.parse(text) instanceof w.URL);
 for(const text of['','foo.js','/path','?query','#hash','//host','http://'])assert.equal(w.URL.parse(text),null);
 for(const base of['invalid base','relative/path',''])assert.equal(w.URL.parse('http://example.com/absolute',base),null);
 assert.equal(w.URL.parse('../foo','http://example.com/a/b/c').href,'http://example.com/a/foo');assert.equal(w.URL.parse('//other.com/p','http://example.com/').href,'http://other.com/p');assert.ok(w.URL.parse('https://example.com',undefined) instanceof w.URL);assert.equal(w.URL.parse('subpath',undefined),null);
});
test('parse preserves original WebIDL conversion order, thrown identities and captured constructor authority',t=>{
 const w=fixture(t).dom.window,URL=w.URL,parse=URL.parse,order=[];
 const url=parse({toString(){order.push('input');return'child'}},{toString(){order.push('base');return'https://actual.example/'}});assert.deepEqual(order,['input','base']);assert.equal(url.href,'https://actual.example/child');
 const reason=new w.RangeError('actual conversion');assert.throws(()=>parse({toString(){throw reason}}),error=>error===reason);assert.throws(()=>parse(),error=>error instanceof w.TypeError);assert.throws(()=>parse(Symbol('actual')),error=>error instanceof w.TypeError);
 w.URL=function(){throw Error('authored replacement')};const value=Reflect.apply(parse,{untrusted:true},['https://actual.example/']);assert.ok(value instanceof URL);physical(value,w);
});
test('borrowed parse keeps its actual callee Window and old parsed URLs retain their backend after navigation',async t=>{
 const page=fixture(t);await page.navigate('data:text/html,<iframe>');const w=page.dom.window,child=w.document.querySelector('iframe').contentWindow;
 const mainParse=w.URL.parse,childParse=child.URL.parse,main=Reflect.apply(mainParse,child.URL,['https://actual.example/main']),other=Reflect.apply(childParse,w.URL,['https://actual.example/child']);physical(main,w);physical(other,child);assert.ok(main instanceof w.URL);assert.ok(other instanceof child.URL);
 const backend=utils.implForWrapper(main),params=main.searchParams;await page.navigate('data:text/html,<p>successor</p>');main.pathname='/retained';params.set('actual','retained');assert.equal(main.href,'https://actual.example/retained?actual=retained');assert.equal(utils.implForWrapper(main),backend);assert.equal(utils.wrapperForImpl(backend),main);assert.equal(main.searchParams,params);
});
