import{test}from'node:test';
import assert from'node:assert/strict';
import{Browser}from'../src/browser.js';
import{parseStyleSheet,canonicalCSSProgramRuleList,flatSheetState}from'../src/cssom.js';
import{readCSSSheet,readCSSDeclaration}from'../src/cssom-private.js';
import{createCanonicalStyleResolver}from'../src/styles.js';
import{platformFactoryRecord}from'../src/platform-factories.js';

async function fixture(t,css,{external=false}={}){
 const browser=new Browser(external?{loadResources:['stylesheet']}:{ });t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body><p class=probe>Real text</p>');
 const w=page.dom.window,d=w.document;let sheet;
 if(external){
  const link=d.createElement('link');link.rel='stylesheet';link.href='data:text/css,'+encodeURIComponent(css);
  const loaded=new Promise((resolve,reject)=>{link.addEventListener('load',resolve,{once:true});link.addEventListener('error',()=>reject(Error('Actual stylesheet load failed')),{once:true})});
  d.head.append(link);await loaded;sheet=link.sheet;
 }else{const style=d.createElement('style');style.textContent=css;d.head.append(style);sheet=style.sheet}
 const list=readCSSSheet(sheet).list,document=platformFactoryRecord(d).implementation,node=platformFactoryRecord(d.querySelector('.probe')).implementation;
 return{w,d,sheet,list,node,resolve:()=>createCanonicalStyleResolver(document)(node)};
}

test('canonical scalar snapshots retain genuine normalization, shorthand and priority facts without public materialization',()=>{
 const body='display:none!important;display:block;visibility:hidden;margin:1px 2px;overflow:hidden auto;--Case:Kept;color:rgb(1, 2, 3);padding:bogus';
 const sheet=parseStyleSheet('.probe{'+body+'}.other{'+body+'}'),list=sheet.cssRules,state=flatSheetState(sheet,list),entries=canonicalCSSProgramRuleList(list);
 assert.equal(state.styled.size,0);assert.equal(state.published.size,0);
 const facts=entries[0].declarations,values=new Map(facts.map(v=>[v.name,v]));
 assert.deepEqual(values.get('display'),{name:'display',value:'none',priority:'important'});assert.equal(values.get('visibility').value,'hidden');
 assert.equal(values.get('margin-top').value,'1px');assert.equal(values.get('margin-right').value,'2px');assert.equal(values.get('--Case').value,'Kept');assert.equal(values.has('padding'),false);
 const one=list[0].style,two=list[1].style;assert.deepEqual(facts,readCSSDeclaration(one));assert.deepEqual(facts,readCSSDeclaration(two));
 assert.notEqual(one,two);assert.equal(list[0].style,one);one.setProperty('--Case','Changed');assert.equal(two.getPropertyValue('--Case'),'Kept');assert.equal(values.get('--Case').value,'Kept');
 assert.equal(state.styled.size,2);assert.ok(flatSheetState(sheet,list).version>1);
});

test('uncacheable scalar source still uses the genuine declaration parser and distinct later public state',()=>{
 const body='--long:'+('x'.repeat(4200))+';display:none!important;display:block;';
 const sheet=parseStyleSheet('.probe{'+body+'}'),list=sheet.cssRules,state=flatSheetState(sheet,list),entry=canonicalCSSProgramRuleList(list)[0];
 assert.equal(state.styled.size,0);assert.equal(entry.declarations.find(v=>v.name==='display').value,'none');assert.equal(entry.declarations.find(v=>v.name==='display').priority,'important');
 assert.deepEqual(entry.declarations,readCSSDeclaration(list[0].style));assert.equal(state.styled.size,1);
});

test('canonical compilation keeps unrelated public styles sparse while real matched revision checks stay live',async t=>{
 const f=await fixture(t,'.unused{color:#abcdef;--token:kept}'.repeat(64)+'.probe{display:none}',{external:true}),state=flatSheetState(f.sheet,f.list);
 assert.equal(state.styled.size,0);assert.equal(f.resolve().display,'none');assert.equal(state.styled.size,0);assert.equal(state.published.size,0);
 const computed=f.w.getComputedStyle(f.d.querySelector('.probe'));assert.equal(computed.display,'none');assert.equal(state.styled.size,1);
 const last=f.list[64];last.style.display='block';assert.equal(computed.display,'block');assert.equal(f.resolve().display,'none');
 const first=f.list[0],second=f.list[1];assert.notEqual(first.style,second.style);first.style.setProperty('--token','changed');assert.equal(second.style.getPropertyValue('--token'),'kept');
 assert.ok(flatSheetState(f.sheet,f.list).version>1);assert.equal(state.styled.size,3);
});

test('real materialized mutations enter the next canonical snapshot only at existing sheet invalidation boundaries',async t=>{
 const f=await fixture(t,'.probe{display:none}'),first=f.list[0];first.style.display='block';assert.equal(f.resolve().display,'block');
 first.style.display='none';assert.equal(f.resolve().display,'block');assert.equal(f.w.getComputedStyle(f.d.querySelector('.probe')).display,'none');
 f.sheet.insertRule('.probe{display:block}',1);assert.equal(f.resolve().display,'block');f.sheet.deleteRule(1);assert.equal(f.resolve().display,'none');assert.equal(f.list[0],first);
});

test('canonical private snapshots ignore authored CSS getters and reject lookalike lists without proxy traps',async t=>{
 const f=await fixture(t,'.probe{display:none;visibility:hidden}'),rule=f.list[0],style=rule.style,restores=[];let reads=0,traps=0;
 const poison=(object,name)=>{const old=Object.getOwnPropertyDescriptor(object,name);restores.push(()=>old?Object.defineProperty(object,name,old):Reflect.deleteProperty(object,name));Object.defineProperty(object,name,{configurable:true,get(){reads++;throw Error('authored '+name)}})};
 try{
  for(const[object,names]of[[f.sheet,['cssRules']],[rule,['selectorText','style']],[style,['cssText','length','getPropertyValue','getPropertyPriority']]])for(const name of names)poison(object,name);
  assert.deepEqual(f.resolve(),{display:'none',visibility:'hidden'});assert.equal(reads,0);
  for(const fake of[{},Object.create(Object.getPrototypeOf(f.list)),new Proxy(f.list,{get(){traps++;throw Error('trap')},getPrototypeOf(){traps++;throw Error('trap')}})])assert.throws(()=>canonicalCSSProgramRuleList(fake),/genuine CSS rule list producer/);
  assert.equal(traps,0);assert.equal(reads,0);
 }finally{for(const restore of restores.reverse())restore()}
});
