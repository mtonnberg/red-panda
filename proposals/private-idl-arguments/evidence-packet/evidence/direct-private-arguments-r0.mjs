// Prepared during the exclusive Root full; execute only under a Parent lease.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]),mode=process.argv[3],expectedProtection=mode!=='baseline',expectedVM=mode!=='physical-negative';
const {Browser}=await import(pathToFileURL(join(root,'src/browser.js'))),{getHeapBinding}=await import(pathToFileURL(join(root,'src/native-heap.js'))),{platformFactoryRecord}=await import(pathToFileURL(join(root,'src/platform-factories.js')));
const require=createRequire(join(root,'package.json')),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),Node=require('jsdom/lib/jsdom/living/generated/Node.js'),Doc=require('jsdom/lib/jsdom/living/generated/Document.js'),Element=require('jsdom/lib/jsdom/living/generated/Element.js');
const factories=[Node,Doc,Element],setups=factories.map(x=>x.setup),browser=new Browser({timeout:2500,loadResources:['iframe']}),page=browser.createPage(),rows=[],physical=[],binding=getHeapBinding();
function creation(value,w){const original=Object.getPrototypeOf(value),anchor=w.eval('[]'),result=[];try{for(let i=0;i<2;i++){result.push({nullPrototype:i===1,VM:binding.sameRealm(value,anchor),Host:binding.sameRealm(value,[])});Object.setPrototypeOf(value,null)}}finally{Object.setPrototypeOf(value,original)}return result}
try{
 await page.navigate('data:text/html,<body><div id=owned>actual</div>');
 const w=page.dom.window,doc=w.document,owned=doc.getElementById('owned'),backend=utils.implForWrapper(owned);
 const operations=[{name:'Node.getRootNode',method:w.Node.prototype.getRootNode,receiver:owned,args:[],read:value=>value===doc,expected:true},{name:'Element.getAttribute',method:w.Element.prototype.getAttribute,receiver:owned,args:['id'],read:value=>value,expected:'owned'},{name:'Document.querySelectorAll',method:w.Document.prototype.querySelectorAll,receiver:doc,args:['#owned'],read:value=>value.length,expected:1}];
 for(const operation of operations){
  const realm=creation(operation.method,w);physical.push({name:operation.name,realm,hasPrivateHostAllocation:Function.prototype.toString.call(operation.method).includes('const args = createPrivateIDLArguments();')});
  for(const record of realm){assert.equal(record.VM,expectedVM);assert.equal(record.Host,!expectedVM)}
  for(const poison of ['throwing setter','successful setter','readonly data']){
   let calls=0,seen,returned,error;const sentinel=w.eval('new Error("authored private argument setter")');
   try{
    if(poison==='readonly data')Object.defineProperty(w.Array.prototype,'0',{configurable:true,value:'authored',writable:false});
    else Object.defineProperty(w.Array.prototype,'0',{configurable:true,set(value){calls++;seen=value;if(poison==='throwing setter')throw sentinel}});
    try{returned=operation.read(Reflect.apply(operation.method,operation.receiver,operation.args))}catch(caught){error=caught}
   }finally{delete w.Array.prototype[0]}
   const protectedPrivateArguments=!error&&calls===0&&returned===operation.expected;
   rows.push({name:operation.name,poison,calls,observedType:typeof seen,returned:returned===undefined?null:returned,error:error?{name:error.name,message:error.message,sameAuthoredSentinel:error===sentinel}:null,protectedPrivateArguments});
   assert.equal(protectedPrivateArguments,expectedProtection,operation.name+' '+poison);
  }
 }
 // Diagnostic-only interception of the genuine Host push observes the actual
 // conversion-private array. It changes no production source or VM prototype.
 const privateKey='data-owned-private-argument-creation-control';owned.setAttribute(privateKey,'actual-private-value');
 const originalHostPush=Array.prototype.push;let privateArray,privateCaptures=0,privateValue;
 try{Array.prototype.push=function(...values){if(values.length===1&&values[0]===privateKey){privateCaptures++;privateArray=this}return Reflect.apply(originalHostPush,this,values)};privateValue=Reflect.apply(operations[1].method,owned,[privateKey])}finally{Array.prototype.push=originalHostPush}
 assert.equal(privateValue,'actual-private-value');
 let privateAllocation;
 if(mode==='baseline'){assert.equal(privateCaptures,0);privateAllocation={observedHostPushCaptures:0,expectedReason:'private argument array still belongs to VM; no Host push is reached'}}
 else{assert.equal(privateCaptures,1);assert.equal(privateArray.length,1);assert.equal(privateArray[0],privateKey);const realm=creation(privateArray,w);for(const row of realm){assert.equal(row.VM,false);assert.equal(row.Host,true)}privateAllocation={observedHostPushCaptures:privateCaptures,realm,actualArgumentValueMatches:true,diagnosticOnlyHostPushRestored:Array.prototype.push===originalHostPush}}
 for(let i=0;i<factories.length;i++)assert.equal(factories[i].setup,setups[i]);
 assert.equal(utils.wrapperForImpl(backend),owned);assert.equal(platformFactoryRecord(owned).implementation,backend);assert.equal(owned.ownerDocument,doc);assert.equal(owned.textContent,'actual');
 assert.equal(require('jsdom/lib/jsdom/living/generated/Node.js'),Node);assert.equal(require('jsdom/lib/jsdom/living/generated/Document.js'),Doc);assert.equal(require('jsdom/lib/jsdom/living/generated/Element.js'),Element);
 console.log(JSON.stringify({mode,root,node:process.version,v8:process.versions.v8,rows,physical,privateAllocation,canonicalExportsAndSetupStable:true,realBackendAndDocumentIdentityStable:true,source:{foundation:createHash('sha256').update(readFileSync(join(root,'src/foundational-interface-realms.js'))).digest('hex'),Document:createHash('sha256').update(readFileSync(join(root,'src/document-interface-realms.js'))).digest('hex')},passed:true}));
}catch(error){console.log(JSON.stringify({mode,root,node:process.version,rows,physical,passed:false,error:{name:error.name,message:error.message,stack:error.stack}}));process.exitCode=1}finally{await browser.close()}
