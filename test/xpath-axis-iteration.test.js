// Planned focused semantic controls. No Source fixture/deadline is changed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {installPlatformFactoryHooks} from '../src/platform-factory-hooks.js';
import {installXPathAxisIteration} from '../src/xpath-axis-iteration.js';
import {installDocumentXML} from '../src/document-xml.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
const require=createRequire(import.meta.url),makeXPath=require('jsdom/lib/jsdom/level3/xpath.js');
const utils=require('jsdom/lib/jsdom/living/generated/utils.js');
installPlatformFactoryHooks();

function fixture(t,html='<main><div id="a"><i id="a1"></i><section id="inner"><i id="b1"></i><i id="b2"></i></section><i id="a2"></i></div><div id="z"><i id="z1"></i></div></main>'){
 const dom=new JSDOM(html,{url:'http://xpath.test/',runScripts:'dangerously'}),w=dom.window,d=w.document;
 const xp=makeXPath(w),originalVal=xp.Evaluator.prototype.val;
 const originals={descendant:xp.axes.descendant,'descendant-or-self':xp.axes['descendant-or-self'],child:xp.axes.child};
 const fuse=installXPathAxisIteration(xp,w);
 const optimized={descendant:xp.axes.descendant,'descendant-or-self':xp.axes['descendant-or-self']};
 xp.Evaluator.prototype.val=function(ast,ctx){const match=fuse(this,ast,ctx);return match===null?originalVal.call(this,ast,ctx):match.value;};
 const beforeClose=[];t.after(()=>{try{for(const close of beforeClose)close();}finally{w.close();}});
 const ast=expression=>new xp.XPathExpression(expression,null)._ast;
 function evaluate(expression,context,reference=false,observe){
  const evaluator=new xp.Evaluator(context.ownerDocument??context),program=ast(expression);
  if(reference){
   xp.axes.descendant=originals.descendant;xp.axes['descendant-or-self']=originals['descendant-or-self'];
   evaluator.val=function(a,c){observe?.(a);return originalVal.call(this,a,c);};
  }else if(observe){
   const val=evaluator.val;evaluator.val=function(a,c){observe(a);return val.call(this,a,c);};
  }
  try{return evaluator.val(program,{nodes:[context]});}
  finally{xp.axes.descendant=optimized.descendant;xp.axes['descendant-or-self']=optimized['descendant-or-self'];}
 }
 return{w,d,xp,fuse,originals,optimized,ast,evaluate,beforeClose};
}
function matrix(value){return{nodes:value.nodes,pos:value.pos,lasts:value.lasts,finalize:typeof value.finalize};}
function sameAxis(f,axis,contexts,type=1,name='i'){
 const expected=f.originals[axis](contexts.slice(),type,name,true),actual=f.xp.axes[axis](contexts.slice(),type,name,true);
 assert.equal(actual.nodes.length,expected.nodes.length);for(let i=0;i<actual.nodes.length;i++)assert.equal(actual.nodes[i],expected.nodes[i]);
 assert.deepEqual(matrix(actual),matrix(expected));assert.equal(Object.getPrototypeOf(actual),Object.getPrototypeOf(expected));return actual;
}
function sameExpression(f,expression,context=f.d){
 const expected=f.evaluate(expression,context,true),actual=f.evaluate(expression,context);
 if(actual&&typeof actual==='object'){
  assert.equal(actual.nodes.length,expected.nodes.length);for(let i=0;i<actual.nodes.length;i++)assert.equal(actual.nodes[i],expected.nodes[i]);
  assert.deepEqual(matrix(actual),matrix(expected));
 }else assert.equal(actual,expected);
 return actual;
}

test('descendant axes preserve full overlapping nodes/pos/lasts and real backend result prototype',t=>{
 const f=fixture(t),a=f.d.getElementById('a'),inner=f.d.getElementById('inner');
 const result=sameAxis(f,'descendant',[a,inner]);
 assert.deepEqual(result.nodes.map(n=>n.id),['a1','b1','b2','a2']);
 assert.deepEqual(result.pos,[[1],[2,1],[3,2],[4]]);
 assert.deepEqual(result.lasts,[[4],[4,2],[4,2],[4]]);
 sameAxis(f,'descendant-or-self',[a,inner],0,null);
});
test('matching source nodes join outer descendant series before their own series, self after opening',t=>{
 const f=fixture(t,'<main><i id="a"><i id="b"><i id="c"></i></i></i></main>'),a=f.d.getElementById('a'),b=f.d.getElementById('b');
 const desc=sameAxis(f,'descendant',[a,b]),self=sameAxis(f,'descendant-or-self',[a,b]);
 assert.deepEqual(desc.nodes.map(n=>n.id),['b','c']);assert.deepEqual(desc.pos,[[1],[2,1]]);assert.deepEqual(desc.lasts,[[2],[2,1]]);
 assert.deepEqual(self.nodes.map(n=>n.id),['a','b','c']);assert.deepEqual(self.pos,[[1],[2,1],[3,2]]);assert.deepEqual(self.lasts,[[3],[3,2],[3,2]]);
});
test('independent connected sources and empty matches keep exact source-series matrices',t=>{
 const f=fixture(t);sameAxis(f,'descendant',[f.d.getElementById('a'),f.d.getElementById('z')]);
 sameAxis(f,'descendant-or-self',[f.d.getElementById('a'),f.d.getElementById('z')],1,'missing');
});
test('genuine document and detached fragment preserve node-type and owner identities',t=>{
 const f=fixture(t);sameAxis(f,'descendant',[f.d],0,null);
 const fragment=f.d.createDocumentFragment(),p=fragment.appendChild(f.d.createElement('p'));
 p.appendChild(f.d.createTextNode('text'));p.appendChild(f.d.createComment('comment'));
 sameAxis(f,'descendant-or-self',[fragment],0,null);sameAxis(f,'descendant',[fragment],3,null);
 assert.equal(sameAxis(f,'descendant',[fragment],1,'p').nodes[0],p);assert.equal(p.ownerDocument,f.d);
});
test('real XML QName and processing instruction tests retain original matcher behavior',t=>{
 const f=fixture(t),xml=new f.w.DOMParser().parseFromString('<r xmlns:p="u"><?actual x?><p:Hit/><p:Hit/></r>','text/xml');
 sameAxis(f,'descendant',[xml],1,'p:hit');sameAxis(f,'descendant',[xml],7,'actual');sameAxis(f,'descendant-or-self',[xml.documentElement],0,null);
});
test('explicit genuine shadow fragments stay separate from host light-tree descendants',t=>{
 const f=fixture(t),host=f.d.body.appendChild(f.d.createElement('section')),shadow=host.attachShadow({mode:'open'});
 const light=host.appendChild(f.d.createElement('i')),inside=shadow.appendChild(f.d.createElement('i'));
 assert.deepEqual(sameAxis(f,'descendant',[host]).nodes,[light]);
 assert.deepEqual(sameAxis(f,'descendant',[shadow]).nodes,[inside]);assert.equal(inside.ownerDocument,f.d);
});
test('bare descendant/self-child fusion preserves full CHILD sibling positions and lasts',t=>{
 const f=fixture(t),root=f.d.querySelector('main'),result=sameExpression(f,'.//i',root);
 assert.deepEqual(result.nodes.map(n=>n.id),['a1','b1','b2','a2','z1']);
 assert.deepEqual(result.pos,[[1],[1],[2],[2],[1]]);assert.deepEqual(result.lasts,[[2],[2],[2],[2],[1]]);
 assert.equal(typeof result.finalize,'undefined');
});
test('overlapping bare-fusion bases deduplicate parents without changing sibling metadata',t=>{
 const f=fixture(t);sameExpression(f,'(./div|./div/section)//i',f.d.querySelector('main'));
 sameExpression(f,'(./div|./div/section)//i/following-sibling::*[1]',f.d.querySelector('main'));
});
test('actual installed global filters reset path positions while axis-step predicates retain parent series',t=>{
 const f=fixture(t),root=f.d.querySelector('main');installDocumentXML(new EventEmitter(),f.w);
 const nodes=query=>{const result=f.d.evaluate(query,root,null,f.w.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);return Array.from({length:result.snapshotLength},(_,i)=>result.snapshotItem(i));};
 const actual=ids=>ids.map(id=>f.d.getElementById(id));
 // Actual Native20 calibration: step predicates are per actual parent;
 // parentheses complete the path before their global filter is applied.
 assert.deepEqual(nodes('.//i[1]'),actual(['a1','b1','z1']));
 assert.deepEqual(nodes('.//i[last()]'),actual(['b2','a2','z1']));
 assert.deepEqual(nodes('(.//i)[1]'),actual(['a1']));
 assert.deepEqual(nodes('(.//i)[last()]'),actual(['z1']));
 // Retain original raw-axis/kernel metadata comparisons independently.
 for(const query of['.//i[1]','.//i[last()]'])sameExpression(f,query,root);
 for(const query of['(./div|./div/section)/descendant::i[1]','(./div|./div/section)/descendant::i[last()]'])sameExpression(f,query,f.d.querySelector('main'));
});
test('preceding/following predicates and downstream reverse axes remain original',t=>{
 const f=fixture(t),last=f.d.getElementById('z1');
 for(const query of['preceding::i[1]','preceding::i[last()]','preceding::i/ancestor::*[1]'])sameExpression(f,query,last);
 sameExpression(f,'following::i[last()]',f.d.getElementById('a1'));
});
test('attribute and mixed attribute contexts keep untouched original behavior',t=>{
 const f=fixture(t),a=f.d.getElementById('a'),attribute=a.getAttributeNode('id');
 for(const axis of['descendant','descendant-or-self']){
  sameAxis(f,axis,[attribute],0,null);sameAxis(f,axis,[a,attribute],0,null);
 }
});
test('disconnected or out-of-order sources decline without destructively consuming the original inputs',t=>{
 const f=fixture(t),left=f.d.createElement('div'),right=f.d.createElement('div');
 left.appendChild(f.d.createElement('i'));right.appendChild(f.d.createElement('i'));
 const input=[left,right],expected=f.originals.descendant(input.slice(),1,'i',true),actual=f.xp.axes.descendant(input,1,'i',true);
 assert.deepEqual(matrix(actual),matrix(expected));assert.deepEqual(input,[]); // original destructive path
 const a=f.d.getElementById('a'),inner=f.d.getElementById('inner'),reverse=[inner,a];
 const wanted=f.originals.descendant(reverse.slice(),1,'i',true),got=f.xp.axes.descendant(reverse,1,'i',true);
 assert.deepEqual(matrix(got),matrix(wanted));assert.deepEqual(reverse,[]);
});
test('canonical descendant traversal does not invoke poisoned public-front identity or tree getters',t=>{
 const f=fixture(t),root=f.d.querySelector('main'),targets=[...root.querySelectorAll('i')],marked=f.d.getElementById('inner');let reads=0;
 const previous=new Map(['constructor','nodeName','childNodes'].map(name=>[name,Object.getOwnPropertyDescriptor(marked,name)]));
 for(const name of['constructor','nodeName','childNodes'])Object.defineProperty(marked,name,{configurable:true,get(){reads++;throw Error('Public front '+name);}});
 try{const result=f.xp.axes.descendant([root],1,'i',true);assert.deepEqual(result.nodes,targets);assert.equal(reads,0);}
 finally{for(const[name,descriptor]of previous)if(descriptor)Object.defineProperty(marked,name,descriptor);else delete marked[name];}
});
test('copied implementation symbols and Proxy forwarding do not grant optimization authority',t=>{
 const f=fixture(t),a=f.d.getElementById('a'),fake=Object.create(Object.getPrototypeOf(a));
 Object.defineProperty(fake,utils.implSymbol,{value:utils.implForWrapper(a)});
 const marker=new Error('Original front read on declined copied-symbol context');
 Object.defineProperty(fake,'childNodes',{get(){throw marker;}});
 assert.throws(()=>f.xp.axes.descendant([fake],1,'i',true),error=>error===marker);
 const proxy=new Proxy(a,{get(target,key,receiver){if(key==='childNodes')throw marker;return Reflect.get(target,key,receiver);}});
 assert.throws(()=>f.xp.axes.descendant([proxy],1,'i',true),error=>error===marker);
});
test('genuine first-front authority survives authored null prototypes without repairing them',t=>{
 const f=fixture(t),root=f.d.getElementById('a'),marked=f.d.getElementById('b1');
 const expected=f.originals.descendant([root],1,'i',true),fronts=[root,marked],prototypes=fronts.map(Object.getPrototypeOf);
 for(const front of fronts)Object.setPrototypeOf(front,null);
 try{
  const actual=f.xp.axes.descendant([root],1,'i',true);
  assert.equal(actual.nodes.length,expected.nodes.length);for(let i=0;i<actual.nodes.length;i++)assert.equal(actual.nodes[i],expected.nodes[i]);
  assert.deepEqual(actual.pos,expected.pos);assert.deepEqual(actual.lasts,expected.lasts);
  for(const front of fronts)assert.equal(Object.getPrototypeOf(front),null);
 }finally{for(let i=0;i<fronts.length;i++)Object.setPrototypeOf(fronts[i],prototypes[i]);}
});
test('genuine utility aliases preserve their original output-front path',t=>{
 const f=fixture(t),world=createIsolatedWorld(f.w);f.beforeClose.push(()=>world.dispose());
 const alias=world.evaluate('document.getElementById("a")');
 assert.notEqual(alias,f.d.getElementById('a'));
 sameAxis(f,'descendant',[alias],1,'i');
});
test('noneligible fusion evaluates the actual BASE only once and reuses its original suffix',t=>{
 const f=fixture(t),world=createIsolatedWorld(f.w);f.beforeClose.push(()=>world.dispose());
 const alias=world.evaluate('document.getElementById("a")'),program=f.ast('.//i'),path=program[1],baseAst=path[1][1];
 const evaluator=new f.xp.Evaluator(f.d);let baseCalls=0;
 evaluator.val=function(ast,ctx){if(ast===baseAst)baseCalls++;const folded=f.fuse(this,ast,ctx);return folded===null?f.xp.Evaluator.prototype.val.call(this,ast,ctx):folded.value;};
 // Call the fusion directly: its original suffix must not reread BASE.
 const result=f.fuse(evaluator,path,{nodes:[alias]}).value;
 assert.ok(result.nodes.length>0);assert.equal(baseCalls,1);
});
test('late required-front decline preserves whole input and evaluates fusion BASE once',t=>{
 const f=fixture(t),frame=f.d.createElement('iframe');f.d.body.appendChild(frame);
 const child=frame.contentWindow,a=f.d.getElementById('a');
 const borrowed=child.Document.prototype.createElement.call(f.d,'i');a.appendChild(borrowed);
 assert.notEqual(platformFactoryRecord(borrowed)?.globalRef?.deref(),platformFactoryRecord(f.d)?.globalRef?.deref());
 const expected=f.originals.descendant([a],1,'i',true),input=[a],actual=f.xp.axes.descendant(input,1,'i',true);
 assert.equal(actual.nodes.length,expected.nodes.length);for(let i=0;i<actual.nodes.length;i++)assert.equal(actual.nodes[i],expected.nodes[i]);
 assert.deepEqual(actual.pos,expected.pos);assert.deepEqual(actual.lasts,expected.lasts);assert.deepEqual(input,[]);
 const program=f.ast('.//i'),path=program[1],baseAst=path[1][1],evaluator=new f.xp.Evaluator(f.d);let calls=0;
 evaluator.val=function(ast,ctx){if(ast===baseAst)calls++;return f.xp.Evaluator.prototype.val.call(this,ast,ctx);};
 const result=f.fuse(evaluator,path,{nodes:[a]}).value;
 assert.equal(result.nodes.length,expected.nodes.length);for(let i=0;i<result.nodes.length;i++)assert.equal(result.nodes[i],expected.nodes[i]);assert.equal(calls,1);
});
test('standalone unobserved genuine embedding leaves the backend table unchanged',()=>{
 // A fresh process avoids the main test's statically imported installers.
 // Its genuine document must predate dynamic import of the actual adapter.
 const source=`import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const dom=new JSDOM('<main><b></b></main>',{runScripts:'dangerously'});
try{
 const {platformFactoryRecord}=await import('./src/platform-factories.js');
 const before=platformFactoryRecord(dom.window.document);assert.equal(before,undefined);
 const {installXPathAxisIteration}=await import('./src/xpath-axis-iteration.js');
 const after=platformFactoryRecord(dom.window.document);assert.equal(after,undefined);
 const makeXPath=createRequire(import.meta.url)('jsdom/lib/jsdom/level3/xpath.js'),xp=makeXPath(dom.window);
 const original=['descendant','descendant-or-self','child'].map(name=>xp.axes[name]);
 const fuse=installXPathAxisIteration(xp,dom.window);
 const same=['descendant','descendant-or-self','child'].map((name,i)=>xp.axes[name]===original[i]);
 assert.deepEqual(same,[true,true,true]);assert.equal(fuse(null,null,null),null);
 const count=xp.evaluate('count(.//b)',dom.window.document,dom.window.document);assert.equal(count,1);
 console.log(JSON.stringify({beforeRegistered:!!before,afterRegistered:!!after,same,count}));
}finally{dom.window.close();}`;
 const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:3000});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),{beforeRegistered:false,afterRegistered:false,same:[true,true,true],count:1});
});
test('real deep first-front trees are traversed without dependency recursion or ancestor-vector sort',t=>{
 const f=fixture(t,'<main/>'),root=f.d.createElement('section');let top=f.d.createElement('i');
 const depth=12000;
 for(let i=1;i<depth;i++){const parent=f.d.createElement('i');parent.appendChild(top);top=parent;}
 root.appendChild(top);
 assert.equal(f.xp.axes.descendant([root],1,'i',true).nodes.length,depth);
 const result=f.evaluate('count(.//i)',root);assert.equal(result,depth);
});
test('production document installer composes existing name functions with the real iterative backend',t=>{
 const page=new EventEmitter();let controller;
 const dom=new JSDOM('<main><i id="actual"></i></main>',{runScripts:'dangerously',beforeParse(w){controller=installDocumentXML(page,w);}});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document,n=d.getElementById('actual');
 assert.equal(d.evaluate('.//i',d.querySelector('main'),null,w.XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue,n);
 assert.equal(d.evaluate('name(.//i)',d.querySelector('main'),null,w.XPathResult.STRING_TYPE,null).stringValue,'i');
 assert.equal(typeof controller.xpath.axes.descendant,'function');
});
test('actual parsed PathExpr child is evaluated once and normalization keeps exact real nodes',t=>{
 const f=fixture(t),root=f.d.querySelector('main'),{xpath}=installDocumentXML(new EventEmitter(),f.w);
 const program=new xpath.XPathExpression('(.//i)[1]',null)._ast;
 assert.equal(program[0],'Predicate');const path=program[1];assert.equal(path[0],'PathExpr');const child=path[1];
 const evaluator=new xpath.Evaluator(f.d),original=evaluator.val;let calls=0;
 evaluator.val=function(ast,context){if(ast===child)calls++;return original.call(this,ast,context);};
 const value=evaluator.val(program,{nodes:[root]});assert.deepEqual(value.nodes,[f.d.getElementById('a1')]);assert.equal(calls,1);
 const completed=new xpath.Evaluator(f.d).val(path,{nodes:[root]});
 assert.deepEqual(completed.nodes,['a1','b1','b2','a2','z1'].map(id=>f.d.getElementById(id)));
 assert.equal(Object.hasOwn(completed,'pos'),false);assert.equal(Object.hasOwn(completed,'lasts'),false);
 const failed=new xpath.XPathExpression('unknown()/child::i',null)._ast;assert.equal(failed[0],'PathExpr');
 const failureChild=failed[1],throwing=new xpath.Evaluator(f.d),invoke=throwing.val;let failedCalls=0;
 throwing.val=function(ast,context){if(ast===failureChild)failedCalls++;return invoke.call(this,ast,context);};
 assert.throws(()=>throwing.val(failed,{nodes:[root]}),error=>error.name==='XPathException'&&error.code===51);
 assert.equal(failedCalls,1);
});
