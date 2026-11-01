// Host-only adapter for the genuine per-window jsdom XPath backend.
// No dependency/compiler/public-prototype replacement or synthetic DOM values.
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {canonicalNodeImplementation,cdpWrapperForNode} from './cdp-node-registry.js';
import {platformFactoryRecord} from './platform-factories.js';
const require=createRequire(import.meta.url);
const {domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const apply=Reflect.apply,descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf;
const nodeName=descriptor(NodeImpl.prototype,'nodeName').get;
const parent=tree.parent.bind(tree),firstChild=tree.firstChild.bind(tree),nextSibling=tree.nextSibling.bind(tree);
const push=Array.prototype.push,isArray=Array.isArray;
const installations=new WeakMap();
const append=(array,value)=>apply(push,array,[value]);

function sourcePlan(fronts,globalObject){
 if(!isArray(fronts)||types.isProxy(fronts)||!fronts.length)return null;
 const sources=[],sourceSet=new Set(),rootCache=new WeakMap(),relevant=new WeakSet();
 let root;
 for(let index=0;index<fronts.length;index++){
  const front=fronts[index],record=platformFactoryRecord(front),impl=canonicalNodeImplementation(front);
  if(!impl||record?.globalRef?.deref()!==globalObject||cdpWrapperForNode(impl)!==front||impl.nodeType===2||sourceSet.has(impl))return null;
  sourceSet.add(impl);append(sources,impl);
  const path=[];let cursor=impl;
  while(cursor&&!rootCache.has(cursor)){append(path,cursor);cursor=parent(cursor);}
  const actualRoot=cursor?rootCache.get(cursor):path[path.length-1];
  if(root&&root!==actualRoot)return null;
  root=actualRoot;
  for(let i=0;i<path.length;i++){rootCache.set(path[i],actualRoot);relevant.add(path[i]);}
 }
 return{root,sources,sourceSet,relevant};
}

function frontFor(impl,globalObject){
 const front=cdpWrapperForNode(impl),record=platformFactoryRecord(front);
 return front&&record?.implementation===impl&&record.globalRef?.deref()===globalObject?front:null;
}

function matches(impl,type,name,lower){
 if(type!==0&&impl.nodeType!==type)return false;
 if(name===null||name===undefined)return true;
 const actual=apply(nodeName,impl,[]);
 return name===(lower?actual.toLowerCase():actual);
}

// Each frame uses genuine implementation links. Source encounter order is
// checked before returning anything; unordered/changed contexts decline whole.
function walk(plan,enter,exit){
 const stack=[{node:plan.root,parent:null,entered:false,covered:false,next:null}];
 let sourceIndex=0;
 while(stack.length){
  const frame=stack[stack.length-1];
  if(!frame.entered){
   frame.entered=true;
   const source=plan.sourceSet.has(frame.node);
   if(source&&plan.sources[sourceIndex++]!==frame.node)return false;
   if(enter(frame,source)===false)return false;
   frame.next=firstChild(frame.node);
  }
  let child=frame.next;
  while(child&&!frame.covered&&!plan.relevant.has(child))child=nextSibling(child);
  if(child){
   frame.next=nextSibling(child);
   append(stack,{node:child,parent:frame,entered:false,covered:false,next:null});
  }else{
   if(exit(frame)===false)return false;
   stack.pop();
  }
 }
 return sourceIndex===plan.sources.length;
}

export function installXPathAxisIteration(xpath,window){
 const previous=installations.get(xpath);if(previous)return previous;
 const owner=platformFactoryRecord(window.document),globalObject=owner?.globalRef?.deref();
 if(!canonicalNodeImplementation(window.document)||!globalObject){
  const unchanged=()=>null;installations.set(xpath,unchanged);return unchanged;
 }
 const originalDesc=xpath.axes.descendant,originalSelf=xpath.axes['descendant-or-self'],originalChild=xpath.axes.child;
 if(typeof originalDesc!=='function'||typeof originalSelf!=='function'||typeof originalChild!=='function')throw new TypeError('Pinned XPath axis factory is unavailable');
 // These are real backend empty allocations, captured before authored code.
 const probe=originalDesc([],0,null,true),setPrototype=prototype(probe);
 const finalizer=descriptor(setPrototype,'finalize')?.value;
 if(typeof finalizer!=='function')throw new TypeError('Pinned XPath NodeMultiSet contract is unavailable');
 const contract=()=>descriptor(setPrototype,'finalize')?.value===finalizer;
 function factory(original,type,name,lower){
  if(!contract())return null;
  const result=original([],type,name,lower);
  if(types.isProxy(result)||!isArray(result.nodes)||!isArray(result.pos)||!isArray(result.lasts))return null;
  return result;
 }
 function descendants(original,fronts,type,name,lower,andSelf){
  const plan=sourcePlan(fronts,globalObject);if(!plan)return null;
  const result=factory(original,type,name,lower);if(!result||prototype(result)!==setPrototype)return null;
  const active=[];
  function add(impl){
   const front=frontFor(impl,globalObject);if(!front)return false;
   const positions=[],lasts=[];
   for(let i=0;i<active.length;i++){append(positions,active[i].next++);append(lasts,undefined);}
   append(result.nodes,front);append(result.pos,positions);append(result.lasts,lasts);return true;
  }
  const completed=walk(plan,(frame,source)=>{
   if(!andSelf&&active.length&&matches(frame.node,type,name,lower)&&!add(frame.node))return false;
   if(source){
    append(active,{column:active.length,start:result.nodes.length,next:1});frame.series=true;
   }
   frame.covered=active.length>0;
   if(andSelf&&frame.covered&&matches(frame.node,type,name,lower)&&!add(frame.node))return false;
  },frame=>{
   if(frame.series){
    const series=active.pop(),last=series.next-1;
    for(let row=series.start;row<result.nodes.length;row++)result.lasts[row][series.column]=last;
   }
  });
  if(!completed)return null;
  // Genuine finalizer, real result shape/arrays; no builder/prototype repair.
  return apply(finalizer,result,[]);
 }
 xpath.axes.descendant=function descendant(fronts,type,name,lower){
  const result=descendants(originalDesc,fronts,type,name,lower,false);
  return result??apply(originalDesc,this,[fronts,type,name,lower]);
 };
 xpath.axes['descendant-or-self']=function descendantOrSelf(fronts,type,name,lower){
  const result=descendants(originalSelf,fronts,type,name,lower,true);
  return result??apply(originalSelf,this,[fronts,type,name,lower]);
 };
 function childUnion(fronts,type,name,lower){
  const plan=sourcePlan(fronts,globalObject);if(!plan)return null;
  const result=factory(originalChild,type,name,lower);if(!result)return null;
  const completed=walk(plan,(frame,source)=>{
   frame.childRows=[];frame.matchCount=0;
   frame.covered=source||Boolean(frame.parent?.covered);
   const p=frame.parent;
   if(p?.covered&&matches(frame.node,type,name,lower)){
    const front=frontFor(frame.node,globalObject);if(!front)return false;
    append(p.childRows,result.nodes.length);
    append(result.nodes,front);append(result.pos,[++p.matchCount]);append(result.lasts,[undefined]);
   }
  },frame=>{
   for(let i=0;i<frame.childRows.length;i++)result.lasts[frame.childRows[i]][0]=frame.matchCount;
  });
  return completed?result:null;
 }
 const isAxis=(ast,axis,type)=>isArray(ast)&&ast[0]==='Axis'&&ast[1]===axis&&(type===undefined||ast[2]===type);
 const fuse=function fuseBareChild(evaluator,ast,context){
  if(!isArray(ast)||ast[0]!=='/'||!isArray(ast[1])||ast[1][0]!=='/'||
    !isAxis(ast[1][2],'descendant-or-self','node')||ast[1][2][3]!=null||!isAxis(ast[2],'child'))return null;
  const base=evaluator.val(ast[1][1],context),step=ast[2];
  let name=step[3]?step[3].toLowerCase():step[3];if(name==='*')name=null;
  const result=base&&typeof base==='object'?childUnion(base.nodes,xpath.nodeTypes[step[2]],name,true):null;
  // BASE is never evaluated a second time, including every decline path.
  const value=result??evaluator.val(step,evaluator.val(ast[1][2],base));
  return Object.assign(Object.create(null),{value});
 };
 installations.set(xpath,fuse);return fuse;
}
