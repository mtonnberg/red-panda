import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {Browser} from '../src/browser.js';
import {installNavigator} from '../src/navigator.js';
import {getHeapBinding} from '../src/native-heap.js';
const binding=getHeapBinding(),proofs=[],names=['userAgent','appName','appCodeName','appVersion','platform','language','languages','onLine','cookieEnabled','hardwareConcurrency','deviceMemory','maxTouchPoints','vendor','product','webdriver','plugins','doNotTrack','globalPrivacyControl'];
function physical(value,w,label){const anchor=w.eval('Object.prototype'),prototype=Object.getPrototypeOf(value),before={selected:binding.sameRealm(value,anchor),Host:binding.sameRealm(value,{}),global:binding.creationGlobal(value)===binding.creationGlobal(anchor)};let after;try{Object.setPrototypeOf(value,null);after={selected:binding.sameRealm(value,anchor),Host:binding.sameRealm(value,{}),global:binding.creationGlobal(value)===binding.creationGlobal(anchor)}}finally{Object.setPrototypeOf(value,prototype)}proofs.push({label,before,after});assert.deepEqual(before,{selected:true,Host:false,global:true});assert.deepEqual(after,before)}
async function fixture(t,markup='<body>owned navigator'){const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,'+encodeURIComponent(markup));return{browser,page,w:page.dom.window}}

test('all eighteen public owned Navigator getters are genuine VM native entries with exact measured descriptors',async t=>{
 const{w}=await fixture(t),originalString=w.Function.prototype.toString;
 for(const name of names){const d=Object.getOwnPropertyDescriptor(w.Navigator.prototype,name),get=d.get;assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(d.set,undefined);assert.equal(d.value,undefined);assert.equal(Object.getOwnPropertyDescriptor(w.navigator,name),undefined);assert.equal(get.name,'get '+name);assert.equal(get.length,0);assert.equal(Object.prototype.hasOwnProperty.call(get,'prototype'),false);assert.equal(Reflect.apply(originalString,get,[]),'function get '+name+'() { [native code] }');physical(get,w,'main:'+name);if(name==='languages')assert.deepEqual(Array.from(get.call(w.navigator)),Array.from(w.navigator.languages));else assert.equal(get.call(w.navigator),w.navigator[name]);assert.throws(()=>w.Reflect.construct(get,[]),error=>error instanceof w.TypeError)}
 assert.equal(w.Function.prototype.toString,originalString);assert.match(w.navigator.userAgent,/RedPanda/);assert.equal(w.navigator.userAgentData.brands[0].brand,'RedPanda');
});

test('native getter entries retain real live metadata and reject copied or Proxy custom Navigator brands without authored reads',async t=>{
 const{w,page}=await fixture(t),initialUA=w.navigator.userAgent,plugins=w.navigator.plugins,languages=w.navigator.languages;
 page.setUserAgentOverride({userAgent:'OwnedConfigured/7',platform:'Win32',acceptLanguage:'fr-CA,fr;q=0.8',userAgentMetadata:{brands:[{brand:'OwnedConfigured',version:'7'}],platform:'Owned OS',mobile:false}});
 assert.equal(w.navigator.userAgent,'OwnedConfigured/7');assert.equal(w.navigator.platform,'Win32');assert.equal(w.navigator.language,'fr-CA');assert.deepEqual(Array.from(w.navigator.languages),['fr-CA','fr']);assert.notEqual(w.navigator.languages,languages);assert.equal(w.navigator.plugins,plugins);assert.equal(w.navigator.userAgentData.brands[0].brand,'OwnedConfigured');
 let reads=0;const copy=Object.create(Object.getPrototypeOf(w.navigator),Object.getOwnPropertyDescriptors(w.navigator)),proxy=new Proxy(w.navigator,{get(){reads++;throw Error('authored get')},getOwnPropertyDescriptor(){reads++;throw Error('authored descriptor')},getPrototypeOf(){reads++;throw Error('authored prototype')}});
 for(const name of names.filter(name=>name!=='plugins')){const get=Object.getOwnPropertyDescriptor(w.Navigator.prototype,name).get;for(const bad of[{},copy,proxy])assert.throws(()=>Reflect.apply(get,bad,[]),error=>{assert.equal(error instanceof w.TypeError,true);physical(error,w,'brand-error:'+name);return error.message==='Illegal invocation'})}
 assert.equal(reads,0);assert.equal(Object.getOwnPropertyDescriptor(w.Navigator.prototype,'plugins').get.call(w.navigator),plugins);
 // This is an explicit configured UA capability control, never a fixture override.
 page.setUserAgentOverride({userAgent:initialUA});assert.equal(w.navigator.userAgent,initialUA);
});

test('frame and retained-old-document getter definitions keep genuine immutable creation contexts through navigation',async t=>{
 const{page,w}=await fixture(t,'<iframe></iframe>'),child=w.document.querySelector('iframe').contentWindow;
 for(const name of names){const get=Object.getOwnPropertyDescriptor(child.Navigator.prototype,name).get;physical(get,child,'frame:'+name);assert.equal(binding.sameRealm(get,w.eval('Object.prototype')),false);if(name==='languages')assert.deepEqual(Array.from(get.call(child.navigator)),Array.from(child.navigator.languages));else assert.equal(get.call(child.navigator),child.navigator[name])}
 const oldNavigator=w.navigator,oldGetter=Object.getOwnPropertyDescriptor(w.Navigator.prototype,'userAgent').get,oldGlobal=binding.creationGlobal(oldGetter),oldUA=oldGetter.call(oldNavigator);await page.navigate('data:text/html,<body>new actual document');const fresh=page.dom.window,newGetter=Object.getOwnPropertyDescriptor(fresh.Navigator.prototype,'userAgent').get;
 assert.notEqual(fresh,w);assert.notEqual(binding.creationGlobal(newGetter),oldGlobal);assert.equal(binding.creationGlobal(oldGetter),oldGlobal);physical(oldGetter,w,'retained:userAgent');assert.equal(oldGetter.call(oldNavigator),oldUA);assert.equal(newGetter.call(fresh.navigator),oldUA);
});

test('unowned standalone Window navigator installation retains its original bounded JavaScript getter profile',t=>{
 const dom=new JSDOM('<body>legacy',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,originalPlugins=Object.getOwnPropertyDescriptor(w.Navigator.prototype,'plugins').get,adapter=installNavigator({userAgent:'Legacy/1'},w);t.after(()=>adapter.dispose());const get=Object.getOwnPropertyDescriptor(w.Navigator.prototype,'userAgent').get;
 assert.equal(w.navigator.userAgent,'Legacy/1');assert.equal(get.name,'');assert.equal(binding.sameRealm(get,{}),true);assert.equal(Object.getOwnPropertyDescriptor(w.Navigator.prototype,'plugins').get,originalPlugins);assert.equal(Function.prototype.toString.call(get).includes('[native code]'),false);
});
test.after(async()=>{if(process.env.NAVIGATOR_ACCESSOR_REALM_PROOF)await writeFile(process.env.NAVIGATOR_ACCESSOR_REALM_PROOF,JSON.stringify({proofs},null,2)+'\n',{flag:'wx'})});
