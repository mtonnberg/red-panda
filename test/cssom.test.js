import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';
import { installStyles, getStyleRevision } from '../src/styles.js';
import { parseDeclarations, parseStyleSheet, createDeclaration } from '../src/cssom.js';

function fixture(t, html='') {
  const page=Object.assign(new EventEmitter(),{closed:false,documentAbort:new AbortController()});
  let controller;
  const dom=new JSDOM(html,{url:'https://example.test/',beforeParse(w){controller=installStyles(page,w);}});
  t.after(()=>{page.documentAbort.abort();dom.window.close();});
  return {w:dom.window,d:dom.window.document,controller};
}

test('declaration scanner distinguishes comments and component values from delimiters',()=>{
  assert.deepEqual(parseDeclarations('color:red;;; /* comment; : */ background:url(http://example.test/a:b); content:"a; b: !important"; --é:{x:y; z:1}; opacity:0 ! /* x */ important'),[
    {property:'color',value:'red',priority:''},
    {property:'background',value:'url(http://example.test/a:b)',priority:''},
    {property:'content',value:'"a; b: !important"',priority:''},
    {property:'--é',value:'{x:y; z:1}',priority:''},
    {property:'opacity',value:'0',priority:'important'},
  ]);
  assert.equal(createDeclaration('color:red!important;color:blue;opacity:0').cssText,'color: red !important; opacity: 0;');
  assert.equal(createDeclaration('color:red;broken; width:nope; opacity:.5').cssText,'color: red; opacity: 0.5;');
});

test('declaration cssText and style attributes recover after invalid nested declarations',t=>{
  const {w,d}=fixture(t,'<div style="color:red; &.x { color:blue; } display:none; opacity:0"></div>');
  const div=d.querySelector('div');assert.equal(div.style.cssText,'color: red; opacity: 0;');
  div.style.cssText='color:blue; &.bad { width:2px; } visibility:hidden; height:4px';
  assert.equal(div.style.cssText,'color: blue; height: 4px;');assert.equal(div.getAttribute('style'),div.style.cssText);
  div.setAttribute('style','padding:0;;;background:url(http://example.test/a:b);color:red !  important');
  assert.equal(div.style.padding,'0px');assert.equal(div.style.background,'url(http://example.test/a:b)');assert.equal(div.style.getPropertyPriority('color'),'important');
  div.style.opacity='0';assert.match(div.outerHTML,/background: url\(http:\/\/example.test\/a:b\)/);
  assert.match(div.getAttribute('style'),/color: red !important;/);
  const sheet=new w.CSSStyleSheet();sheet.replaceSync('.x {}');sheet.cssRules[0].style.cssText='color:red; .bad{} display:none; opacity:0';
  assert.equal(sheet.cssRules[0].style.cssText,'color: red; opacity: 0;');
});

test('property setters and setProperty share scalar, paired and anchor function normalization',t=>{
  const {d}=fixture(t);const style=d.createElement('div').style;
  for(const property of ['width','margin','padding','top','scrollMarginTop','scrollPaddingBottom','columnWidth','columnRuleWidth','outline','shapeMargin']){style[property]='0';assert.equal(style[property],'0px',property);}
  for(const property of ['alignItems','alignContent','alignSelf','justifySelf']){style[property]='first baseline';assert.equal(style[property],'baseline');style[property]='last baseline';assert.equal(style[property],'last baseline');}
  for(const [property,value] of [['gap','10px'],['placeContent','center'],['overflow','hidden'],['scrollSnapAlign','start'],['overscrollBehavior','auto']]){style[property]=`${value} ${value}`;assert.equal(style[property],value);}
  style.gap='10px 20px';assert.equal(style.gap,'10px 20px');style.opacity='0';style.zIndex='0';assert.equal(style.opacity,'0');assert.equal(style.zIndex,'0');
  style.width='anchor-size(width --foo, anchor-size(height --bar))';
  assert.equal(style.width,'anchor-size(--foo width, anchor-size(--bar height))');
  style.setProperty('width','anchor-size(self-inline --target, 12px)','important');
  assert.equal(style.width,'anchor-size(--target self-inline, 12px)');assert.equal(style.getPropertyPriority('width'),'important');
  style.width='not-a-length';assert.equal(style.width,'anchor-size(--target self-inline, 12px)');
  style.setProperty('color','red','bad');assert.equal(style.color,'');
});

test('absent, invalid and normalized identical declarations preserve raw attributes without mutation records',t=>{
  const {w,d}=fixture(t);
  for(const initial of [null,'','color:red']) {
    const element=d.createElement('div');if(initial!==null)element.setAttribute('style',initial);
    const observer=new w.MutationObserver(()=>{});observer.observe(element,{attributes:true,attributeOldValue:true});
    assert.equal(element.style.removeProperty('display'),'');element.style.display='';element.style.setProperty('display','');
    element.style.cssFloat='';element.style.removeProperty('--absent');
    assert.equal(observer.takeRecords().length,0);assert.equal(element.getAttribute('style'),initial);observer.disconnect();
  }
  const element=d.createElement('div'),raw='color:red; margin-top:0px; float:left; --token:x';element.setAttribute('style',raw);
  const observer=new w.MutationObserver(()=>{});observer.observe(element,{attributes:true});
  element.style.color='red';element.style.setProperty('COLOR','red');element.style.marginTop='0';element.style.cssFloat='left';
  element.style.setProperty('--token','x');element.style.color='not-a-color';element.style.setProperty('color','blue','invalid');
  assert.equal(observer.takeRecords().length,0);assert.equal(element.getAttribute('style'),raw);observer.disconnect();
});

test('priority changes and removals commit exactly one final style attribute mutation with its original value',t=>{
  const {w,d}=fixture(t),element=d.createElement('div');element.style.setProperty('color','red','important');
  const observer=new w.MutationObserver(()=>{});observer.observe(element,{attributes:true,attributeOldValue:true});
  element.style.setProperty('color','red','IMPORTANT');assert.equal(observer.takeRecords().length,0);
  element.style.setProperty('color','blue','invalid');assert.equal(observer.takeRecords().length,0);
  element.style.setProperty('color','red');let records=observer.takeRecords();
  assert.equal(records.length,1);assert.equal(records[0].oldValue,'color: red !important;');assert.equal(element.style.getPropertyPriority('color'),'');
  element.style.setProperty('color','','important');records=observer.takeRecords();
  assert.equal(records.length,1);assert.equal(records[0].oldValue,'color: red;');assert.equal(element.getAttribute('style'),'');
  element.style.setProperty('color','','important');assert.equal(observer.takeRecords().length,0);
  element.style.setProperty('float','left','important');observer.takeRecords();
  element.style.cssFloat='left';records=observer.takeRecords();assert.equal(records.length,1);assert.equal(records[0].oldValue,'float: left !important;');
  element.style.cssFloat='left';assert.equal(observer.takeRecords().length,0);observer.disconnect();
});

test('explicit cssText and setAttribute assignments notify even for identical or empty declarations',t=>{
  const {w,d}=fixture(t),element=d.createElement('div');element.style.color='red';
  const observer=new w.MutationObserver(()=>{});observer.observe(element,{attributes:true,attributeOldValue:true});
  element.style.color='blue';let records=observer.takeRecords();assert.equal(records.length,1);assert.equal(records[0].oldValue,'color: red;');
  element.style.cssText=element.style.cssText;records=observer.takeRecords();assert.equal(records.length,1);assert.equal(records[0].oldValue,'color: blue;');
  element.setAttribute('style',element.getAttribute('style'));records=observer.takeRecords();assert.equal(records.length,1);assert.equal(records[0].oldValue,'color: blue;');
  assert.equal(element.style.removeProperty('COLOR'),'blue');records=observer.takeRecords();assert.equal(records.length,1);assert.equal(records[0].oldValue,'color: blue;');
  assert.equal(element.style.removeProperty('color'),'');assert.equal(observer.takeRecords().length,0);
  element.style.cssText='';records=observer.takeRecords();assert.equal(records.length,1);assert.equal(records[0].oldValue,'');
  element.style.cssText='';assert.equal(observer.takeRecords().length,1);observer.disconnect();
});

test('shorthand replacement and clearing publish one complete declaration instead of intermediate removals',t=>{
  const {w,d}=fixture(t),element=d.createElement('div');element.style.cssText='margin:1px 2px; color:red';
  const observer=new w.MutationObserver(()=>{});observer.observe(element,{attributes:true,attributeOldValue:true});
  const before=element.getAttribute('style');element.style.margin='3px';let records=observer.takeRecords();
  assert.equal(records.length,1);assert.equal(records[0].oldValue,before);assert.equal(element.style.margin,'3px');
  const changed=element.getAttribute('style');element.style.margin='';records=observer.takeRecords();
  assert.equal(records.length,1);assert.equal(records[0].oldValue,changed);assert.equal(element.style.margin,'');assert.equal(element.style.color,'red');
  element.style.margin='';assert.equal(observer.takeRecords().length,0);observer.disconnect();
});

test('custom property removal remains case-sensitive and live computed styles invalidate after single commits',t=>{
  const {w,d}=fixture(t,'<div></div>'),element=d.querySelector('div'),computed=w.getComputedStyle(element);
  element.style.cssText='width:2px; --Token:x; --token:y';assert.equal(computed.width,'2px');
  const observer=new w.MutationObserver(()=>{});observer.observe(element,{attributes:true,attributeOldValue:true});
  assert.equal(element.style.removeProperty('--TOKEN'),'');assert.equal(observer.takeRecords().length,0);
  assert.equal(element.style.removeProperty('--Token'),'x');assert.equal(observer.takeRecords().length,1);
  assert.equal(element.style.getPropertyValue('--token'),'y');
  element.style.width='7px';assert.equal(observer.takeRecords().length,1);assert.equal(computed.width,'7px');
  const revision=getStyleRevision(w);element.style.width='7px';assert.equal(observer.takeRecords().length,0);assert.equal(getStyleRevision(w),revision);
  element.style.width='';assert.equal(observer.takeRecords().length,1);assert.equal(computed.width,'auto');observer.disconnect();
});

test('URL serialization preserves quoted versus safe unquoted tokens without splitting colons',t=>{
  const {d}=fixture(t);const style=d.createElement('div').style;
  style.cssText='background:url(http://example.test/a:b);cursor:url("abc: x.png"), pointer';
  assert.equal(style.background,'url(http://example.test/a:b)');assert.equal(style.cursor,'url("abc: x.png"), pointer');
  style.content='"anchor-size(width --foo) url(abc)"';assert.equal(style.content,'"anchor-size(width --foo) url(abc)"');
  style.background='url("foo bar.png")';assert.equal(style.background,'url("foo bar.png")');
  style.background='url("https://example.test/q.png")';assert.equal(style.background,'url("https://example.test/q.png")');
  style.background='url(https://example.test/q.png) not-valid';assert.equal(style.background,'url("https://example.test/q.png")');
  style.cursor='url(https://example.test/q.png), pointer';assert.equal(style.background,'url("https://example.test/q.png")');
  style.setProperty('background','url(https://example.test/q.png)');assert.equal(style.getPropertyValue('background'),'url(https://example.test/q.png)');
});

test('stylesheet parsing resumes after nested blocks and exposes useful parent and serialization state',t=>{
  const {w,d}=fixture(t,'<style>.target { color:red; &.nested { color:blue } display:none; span:hover { opacity:.4 } opacity:0 }</style><div class="target"></div>');
  const sheet=d.querySelector('style').sheet,rule=sheet.cssRules[0];
  assert.equal(rule.style.color,'red');assert.equal(rule.style.display,'none');assert.equal(rule.style.opacity,'0');
  assert.equal(rule.style.parentRule,rule);assert.equal(rule.parentStyleSheet,sheet);assert.equal(w.getComputedStyle(d.querySelector('div')).display,'none');
  assert.equal(rule.cssText,'.target { color: red; display: none; opacity: 0; }');
  rule.cssText='.renamed { width: 0; color: green; }';
  assert.equal(rule.selectorText,'.renamed');assert.equal(rule.style.width,'0px');assert.equal(rule.style.parentRule,rule);
  rule.selectorText='.target';assert.equal(w.getComputedStyle(d.querySelector('div')).width,'0px');
  sheet.insertRule('.tail {color:blue}',99);assert.equal(sheet.cssRules.length,2);assert.equal(sheet.cssRules[1].selectorText,'.tail');
  assert.throws(()=>sheet.deleteRule(99),{name:'IndexSizeError'});
});

test('CSSRuleList and StyleSheetList retain identity and iterate live indexed entries',t=>{
  const {w,d}=fixture(t);const sheets=d.styleSheets;assert.equal(sheets,d.styleSheets);assert.equal(sheets.constructor.name,'StyleSheetList');
  assert.equal(sheets.values,undefined);assert.equal(sheets.keys,undefined);assert.deepEqual([...sheets],[]);
  const element=d.createElement('style');d.head.append(element);const sheet=element.sheet;
  sheet.insertRule('.a{color:red}',0);sheet.insertRule('.b{color:blue}',1);const rules=sheet.cssRules;
  assert.equal(Array.isArray(rules),false);assert.equal(rules.constructor.name,'CSSRuleList');assert.equal(rules.values,undefined);assert.equal(rules.item,undefined);
  assert.deepEqual(Object.keys(rules),['0','1']);assert.equal(rules[99],undefined);assert.equal([...sheets][0],sheet);
  const seen=[];for(const rule of rules){seen.push(rule.selectorText);sheet.deleteRule(1);}assert.deepEqual(seen,['.a']);
  sheet.deleteRule(0);sheet.insertRule('.c{}');assert.equal(sheet.cssRules,rules);assert.equal([...rules][0].selectorText,'.c');
  const constructed=new w.CSSStyleSheet();const retained=constructed.cssRules;constructed.replaceSync('.replacement{}');assert.equal(constructed.cssRules,retained);assert.equal(retained[0].selectorText,'.replacement');
  element.remove();assert.equal(sheets.length,0);assert.equal(d.styleSheets,sheets);assert.throws(()=>{rules[0]={};},TypeError);
  const other=new JSDOM('<style>a{color:red}</style>');try{assert.equal(other.window.document.querySelector('style').sheet.cssRules.values,Array.prototype.values);}finally{other.window.close();}
});

test('group rule mutations change actual cascade and invalidate retained computed style revisions',t=>{
  const {w,d}=fixture(t,'<div></div>');const sheet=new w.CSSStyleSheet();sheet.replaceSync('@media screen {div{width:3px;color:red}}');d.adoptedStyleSheets=[sheet];
  const computed=w.getComputedStyle(d.querySelector('div')),group=sheet.cssRules[0],list=group.cssRules;const revision=getStyleRevision(w);
  assert.equal(computed.width,'3px');group.insertRule('div{width:7px}',1);assert.equal(group.cssRules,list);assert.equal(computed.width,'7px');assert.ok(getStyleRevision(w)>revision);
  assert.equal(list[1].parentRule,group);assert.equal(list[1].parentStyleSheet,sheet);const removed=list[1];group.deleteRule(1);assert.equal(computed.width,'3px');assert.equal(removed.parentRule,null);assert.equal(removed.parentStyleSheet,null);
  assert.throws(()=>group.insertRule('a{}b{}'),{name:'SyntaxError'});assert.throws(()=>group.deleteRule(9),{name:'IndexSizeError'});
});

test('known at-rules keep their data and unknown at-rules remain typed zero without cascade claims',()=>{
  const sheet=parseStyleSheet('@font-face {font-family:Foo; src:url(font.woff2)} @keyframes spin {from{opacity:0}to{opacity:1}} @layer utility {.x{color:red}} @unknown x;');
  assert.deepEqual(Array.from(sheet.cssRules,r=>r.type),[5,7,0,0]);
  assert.equal(sheet.cssRules[0].style.getPropertyValue('src'),'url(font.woff2)');assert.equal(sheet.cssRules[1].cssRules[1].style.opacity,'1');
  assert.equal(sheet.cssRules[2].cssText,'@layer utility {.x{color:red}}');assert.equal(sheet.cssRules[3].cssText,'@unknown x;');
});

test('shared computed ancestors and style revisions invalidate for dynamic checked, selected, focus and reset state',t=>{
  const {w,d}=fixture(t,'<style>section:has(input:checked) {color:red} section:has(option:checked[value="b"]) {font-style:italic} section:focus-within {width:17px}</style><form><section><input type="checkbox"><select><option value="a">A</option><option value="b">B</option></select><span></span></section></form>');
  const section=d.querySelector('section'),child=d.querySelector('span'),checkbox=d.querySelector('input'),select=d.querySelector('select');
  const computed=w.getComputedStyle(child);assert.equal(computed.color,'rgb(0, 0, 0)');let revision=getStyleRevision(w);
  checkbox.checked=true;assert.equal(computed.color,'rgb(255, 0, 0)');assert.ok(getStyleRevision(w)>revision);revision=getStyleRevision(w);
  select.value='b';assert.equal(computed.fontStyle,'italic');assert.ok(getStyleRevision(w)>revision);revision=getStyleRevision(w);
  checkbox.focus();assert.ok(getStyleRevision(w)>revision);assert.equal(w.getComputedStyle(section).width,'17px');
  d.querySelector('form').reset();assert.equal(computed.color,'rgb(0, 0, 0)');assert.equal(computed.fontStyle,'normal');
});
