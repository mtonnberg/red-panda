// STATIC/UNRUN isolated producer heldouts. Original R2 assertions are unchanged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {Browser} from '../src/browser.js';
import {platformFactoryRecord,subscribePlatformFactories} from '../src/platform-factories.js';
import {isInitialXMLAttributeSource} from '../src/initial-document-parser.js';
const require=createRequire(import.meta.url),attributes=require('jsdom/lib/jsdom/living/attributes.js');
const HTML='http://www.w3.org/1999/xhtml';
const exact='<html xmlns="'+HTML+'"><head/><body><input id="lower" required=""/><INPUT id="upper" required=""/><input id="upper-attribute" REQUIRED=""/><input id="mixed-type" type="HiDdEn" required=""/></body></html>';
async function fixture(t){const browser=new Browser({loadResources:['iframe']});t.after(()=>browser.close());const page=browser.createPage();return{page,async navigate(source,mime='application/xhtml+xml'){await page.navigate('data:'+mime+','+encodeURIComponent(source));return page.dom.window;}};}
const impl=value=>platformFactoryRecord(value).implementation;
const names=node=>impl(node)._attributeList.map(attribute=>attribute._localName);

test('initial XHTML preserves actual source Attr casing at birth before required/optional matching',{timeout:15000},async t=>{
 const born=[],unsubscribe=subscribePlatformFactories((value,record)=>{if(record.kind==='Attr')born.push({value,implementation:record.implementation,localName:record.implementation._localName});});t.after(unsubscribe);
 const f=await fixture(t),w=await f.navigate(exact),d=w.document,n=d.getElementById('upper-attribute'),node=impl(n),attribute=node._attributeList.find(a=>a._localName==='REQUIRED'),front=[...n.attributes].find(a=>a.localName==='REQUIRED');
 assert.ok(attribute);assert.ok(front);assert.equal(impl(front),attribute);assert.equal(attribute._ownerDocument,impl(d));assert.equal(attribute._element,node);
 assert.equal(born.find(entry=>entry.value===front)?.localName,'REQUIRED');
 assert.deepEqual(names(n),['id','REQUIRED']);assert.deepEqual([...n.getAttributeNames()],['id','REQUIRED']);
 assert.equal(attributes.getAttributeByNameNS(node,null,'REQUIRED'),attribute);assert.equal(attributes.getAttributeByNameNS(node,null,'required'),null);
 assert.equal(n.required,false);assert.equal(n.matches(':required'),false);assert.equal(n.matches(':optional'),true);
 assert.equal(n.getAttributeNS(null,'required'),null);assert.equal(n.getAttributeNS(null,'REQUIRED'),null);
 assert.equal(d.getElementById('lower').matches(':required'),true);assert.equal(d.getElementById('upper').constructor,w.HTMLUnknownElement);assert.equal(d.getElementById('upper').matches(':optional'),false);assert.equal(d.getElementById('mixed-type').matches(':optional'),true);
 assert.equal(d.documentElement.attributes.length,0);assert.equal(isInitialXMLAttributeSource(impl(d)),false);
});

test('initial source scope leaves genuine dynamic setters/fragments and other parser documents on their existing policy',{timeout:15000},async t=>{
 const script=`const L=String.fromCharCode(60);
 globalThis.actualSetter=document.createElementNS("${HTML}","input");actualSetter.setAttribute("REQUIRED","setter");document.body.append(actualSetter);
 document.getElementById("fragment").innerHTML=L+'input id="fragment-input" REQUIRED="fragment"/>';
 globalThis.actualInactive=new DOMParser().parseFromString(L+'html xmlns="${HTML}">'+L+'head/>'+L+'body>'+L+'input id="inactive" REQUIRED="inert"/>'+L+'/body>'+L+'/html>',"application/xhtml+xml");`;
 const source='<html xmlns="'+HTML+'"><head/><body><input id="source" REQUIRED="source"/><section id="fragment"/><script>'+script+'</script></body></html>';
 const f=await fixture(t),w=await f.navigate(source),d=w.document,original=d.getElementById('source'),held=[...original.attributes].find(a=>a.localName==='REQUIRED');
 assert.deepEqual(names(original),['id','REQUIRED']);assert.equal(original.required,false);
 assert.deepEqual(names(w.actualSetter),['required']);assert.equal(w.actualSetter.required,true);
 assert.deepEqual(names(d.getElementById('fragment-input')),['id','required']);assert.equal(d.getElementById('fragment-input').required,true);
 // Non-expansion heldout: inactive DOMParser casing is not changed by this patch.
 assert.deepEqual(names(w.actualInactive.getElementById('inactive')),['id','required']);assert.equal(isInitialXMLAttributeSource(impl(w.actualInactive)),false);
 held.value='real edit';assert.equal(original.required,false);original.setAttribute('REQUIRED','actual setter');assert.equal(original.required,true);assert.equal(held.value,'real edit');assert.equal(held.ownerDocument,d);
 original.removeAttribute('required');assert.equal(original.required,false);assert.equal([...original.attributes].includes(held),true);assert.equal(isInitialXMLAttributeSource(impl(d)),false);
});

test('HTML and malformed-XHTML fallback retain original normalized producers and later initial admission stays isolated',{timeout:15000},async t=>{
 const f=await fixture(t);let w=await f.navigate(exact,'text/html');assert.deepEqual(names(w.document.getElementById('upper-attribute')),['id','required']);assert.equal(w.document.getElementById('upper-attribute').required,true);assert.equal(isInitialXMLAttributeSource(impl(w.document)),false);
 w=await f.navigate('<html xmlns="'+HTML+'"><head/><body><input id="fallback" REQUIRED="fallback"/><div><p></div></body></html>');const fallback=w.document.getElementById('fallback');assert.deepEqual(names(fallback),['id','required']);assert.equal(fallback.required,true);assert.equal(isInitialXMLAttributeSource(impl(w.document)),false);
 w=await f.navigate(exact);assert.deepEqual(names(w.document.getElementById('upper-attribute')),['id','REQUIRED']);assert.equal(w.document.getElementById('upper-attribute').required,false);assert.equal(isInitialXMLAttributeSource(impl(w.document)),false);
});

test('genuine unowned XML documents preserve original case-sensitive storage and namespace declarations',{timeout:15000},t=>{
 const dom=new JSDOM(exact,{contentType:'application/xhtml+xml'});t.after(()=>dom.window.close());const d=dom.window.document,n=d.getElementById('upper-attribute');
 assert.equal(n.attributes[1].localName,'REQUIRED');assert.equal(n.getAttributeNS(null,'REQUIRED'),'');assert.equal(n.getAttributeNS(null,'required'),null);assert.equal(n.required,false);assert.equal(d.documentElement.getAttribute('xmlns'),HTML);
 const document=platformFactoryRecord(d)?.implementation;assert.equal(document?isInitialXMLAttributeSource(document):false,false);
});

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('actual initial XML VM abandonment recovers private scope and ordinary reentry preserves it',{timeout:15000},async()=>{
 for(const mode of ['interrupt','reentry']){
  const {stdout,stderr}=await promisify(execFile)(process.execPath,['--experimental-vm-modules',new URL('./fixtures/initial-xhtml-attribute-recovery.mjs',import.meta.url).pathname,mode],{timeout:7000,maxBuffer:1024*1024});
  console.log('owned-initial-XML-recovery '+stdout.trim());if(stderr)console.error(stderr);
  const value=JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(value.failure,undefined);assert.equal(value.actualWarmMime,'application/xhtml+xml');assert.equal(value.vmPolicyMilliseconds,200);assert.equal(value.ownedChildDeadlineMilliseconds,7000);
  assert.deepEqual(value.actualScriptAttributeBirth,{sameDocument:true,scopeActive:true});
  if(mode==='interrupt'){
   assert.equal(value.timeoutObserved,true);assert.equal(value.actualLoopEntered,true);assert.equal(value.actualAuthorFinally,false);
   // If this is false, this control did not prove abandoned-Host scope recovery.
   assert.equal(value.scopeBeforeCheckpoint,true);assert.equal(value.partialClosedBeforeExplicitCleanup,true);
  }else{
   assert.equal(value.actualError,null);assert.equal(value.actualAuthorRan,true);assert.equal(value.beforeOrdinaryReentry,true);assert.equal(value.actualNestedValue,42);assert.equal(value.afterOrdinaryReentry,true);assert.equal(value.scopeBeforeCheckpoint,false);
  }
  assert.equal(value.scopeAfterCheckpoint,false);assert.deepEqual(value.captureAfterCheckpoint,{capturing:0,pending:0,executing:0,descriptorRestored:true});
  assert.deepEqual(value.later,{sourceNames:['id','REQUIRED'],required:false,currentScope:false,query:42,setter:{names:['required'],required:true}});
  // Inactive-parser policy is deliberately unchanged, not newly Native-calibrated.
  assert.deepEqual(value.otherDocument,{different:true,scope:false,names:['id','required']});assert.equal(value.closed,true);
 }
});
