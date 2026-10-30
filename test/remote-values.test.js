import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { implSymbol } = createRequire(import.meta.url)('jsdom/lib/jsdom/living/generated/utils.js');
import { JSDOM } from 'jsdom';
import { installCollections, loadCollectionsBinding } from '../src/collections.js';
import { primitiveRemoteValue, describeRemoteValue, needsRemoteHandle, nodeIdentity, ownerDocumentOf,
  ownDataValue, safeErrorMessage, protocolErrorFields, exceptionDetailsFor } from '../src/remote-values.js';

function hostileObject(onRead) {
  const object={};
  for(const name of ['nodeType','ownerDocument','nodeName','constructor','name','message','stack','code',Symbol.toStringTag,Symbol.toPrimitive]) {
    Object.defineProperty(object,name,{configurable:true,get(){onRead();throw null;}});
  }
  object.toString=()=>{onRead();throw null;};return object;
}

test('primitive fields preserve actual thrown/evaluated values and IEEE special numbers',()=>{
  const cases=[
    [undefined,{type:'undefined'}],[null,{type:'object',subtype:'null',value:null}],
    [true,{type:'boolean',value:true}],['value',{type:'string',value:'value'}],
    [17,{type:'number',value:17,description:'17'}],[-0,{type:'number',unserializableValue:'-0',description:'-0'}],
    [NaN,{type:'number',unserializableValue:'NaN',description:'NaN'}],
    [Infinity,{type:'number',unserializableValue:'Infinity',description:'Infinity'}],
    [-Infinity,{type:'number',unserializableValue:'-Infinity',description:'-Infinity'}],
    [123n,{type:'bigint',unserializableValue:'123n',description:'123n'}],
  ];
  for(const [value,expected] of cases){assert.deepEqual(primitiveRemoteValue(value),expected);assert.deepEqual(describeRemoteValue(value),expected);assert.equal(needsRemoteHandle(value),false);}
  const symbol=Symbol('retained');assert.equal(primitiveRemoteValue(symbol),undefined);assert.equal(needsRemoteHandle(symbol),true);
  assert.deepEqual(describeRemoteValue(symbol),{type:'symbol',description:'Symbol(retained)'});
  assert.equal('objectId' in describeRemoteValue({}),false);
});

test('hostile ordinary objects are described without getters, tags or coercion',()=>{
  let reads=0;const value=hostileObject(()=>reads++);
  assert.deepEqual(describeRemoteValue(value),{type:'object',className:'Object',description:'Object'});
  assert.equal(ownerDocumentOf(value),undefined);assert.equal(nodeIdentity(value),undefined);assert.equal(ownDataValue(value,'code'),undefined);
  assert.equal(safeErrorMessage(value),'Object');assert.deepEqual(protocolErrorFields(value),{code:-32602,message:'Object'});
  assert.equal(reads,0);
  const actual={constructor:{name:'Forged'},nodeType:1,ownerDocument:{}};
  assert.deepEqual(describeRemoteValue(actual),{type:'object',className:'Object',description:'Object'});
  assert.equal(ownerDocumentOf(actual),undefined);
});

test('active, callable, revoked and prototype Proxies remain opaque and invoke no traps',()=>{
  let traps=0;const handlers={get(){traps++;throw null;},getPrototypeOf(){traps++;throw null;},ownKeys(){traps++;throw null;},getOwnPropertyDescriptor(){traps++;throw null;}};
  const proxy=new Proxy({},handlers),callable=new Proxy(function target(){},handlers);
  const revoked=Proxy.revocable({},handlers);revoked.revoke();
  for(const value of [proxy,revoked.proxy]) {
    assert.deepEqual(describeRemoteValue(value),{type:'object',subtype:'proxy',className:'Object',description:'Proxy'});
    assert.equal(needsRemoteHandle(value),true);assert.equal(ownerDocumentOf(value),undefined);
    assert.deepEqual(protocolErrorFields(value),{code:-32602,message:'Proxy'});
  }
  assert.deepEqual(describeRemoteValue(callable),{type:'object',subtype:'proxy',className:'Function',description:'Proxy'});
  assert.deepEqual(describeRemoteValue(Object.create(proxy)),{type:'object',className:'Object',description:'Object'});
  assert.equal(traps,0);
});

test('constructor metadata ignores own constructor and function-name accessors',()=>{
  let reads=0;class Actual {}
  const value=new Actual();Object.defineProperty(value,'constructor',{get(){reads++;throw undefined;}});
  assert.equal(describeRemoteValue(value).className,'Actual');
  Object.defineProperty(Actual,'name',{get(){reads++;throw undefined;}});
  assert.equal(describeRemoteValue(value).className,'Object');
  const accessorPrototype=Object.create(null,{constructor:{get(){reads++;throw undefined;}}});
  assert.equal(describeRemoteValue(Object.create(accessorPrototype)).className,'Object');assert.equal(reads,0);
});

test('builtin metadata uses internal slots across realms rather than overridden properties',()=>{
  const foreign=vm.runInNewContext('({array:[1,2],map:new Map([[1,2]]),set:new Set([1]),promise:Promise.resolve(1),date:new Date(0),regexp:/sample/gi,typed:new Uint16Array([1,2,3]),buffer:new ArrayBuffer(4),view:new DataView(new ArrayBuffer(5))})');
  let reads=0;
  for(const value of Object.values(foreign))for(const name of ['constructor','nodeType','size','length','byteLength','source','flags',Symbol.toStringTag]){
    // Array's own length is nonconfigurable; its actual indexed length remains
    // an internal data descriptor. The other shadow getters must never run.
    if(Object.getOwnPropertyDescriptor(value,name)?.configurable===false)continue;
    Object.defineProperty(value,name,{get(){reads++;throw null;},configurable:true});
  }
  assert.deepEqual(describeRemoteValue(foreign.array),{type:'object',subtype:'array',className:'Array',description:'Array(2)'});
  assert.deepEqual(describeRemoteValue(foreign.map),{type:'object',subtype:'map',className:'Map',description:'Map(1)'});
  assert.equal(describeRemoteValue(foreign.set).description,'Set(1)');assert.equal(describeRemoteValue(foreign.promise).subtype,'promise');
  assert.equal(describeRemoteValue(foreign.regexp).description,'/sample/gi');assert.equal(describeRemoteValue(foreign.date).description,Date.prototype.toString.call(new Date(0)));
  assert.equal(describeRemoteValue(foreign.typed).description,'Uint16Array(3)');assert.equal(describeRemoteValue(foreign.buffer).description,'ArrayBuffer(4)');assert.equal(describeRemoteValue(foreign.view).description,'DataView(5)');assert.equal(reads,0);
});

test('native errors use safe string data and never evaluate lazy/user stacks or prepareStackTrace',()=>{
  let reads=0;const realm=vm.createContext({});const error=vm.runInContext('globalThis.hits=0; Error.prepareStackTrace=()=>{hits++;throw null};new TypeError("visible")',realm);
  assert.deepEqual(describeRemoteValue(error),{type:'object',subtype:'error',className:'TypeError',description:'TypeError: visible'});
  assert.equal(realm.hits,0);
  const hostile=new Error('hidden');for(const name of ['name','message','stack','constructor'])Object.defineProperty(hostile,name,{get(){reads++;throw null;},configurable:true});
  assert.deepEqual(describeRemoteValue(hostile),{type:'object',subtype:'error',className:'Error',description:'Error'});
  const hostDOM=new DOMException('operation aborted','AbortError');Object.defineProperty(hostDOM,'message',{get(){reads++;throw null;}});
  assert.equal(describeRemoteValue(hostDOM).description,'AbortError: operation aborted');assert.equal(safeErrorMessage(hostDOM),'operation aborted');
  const materialized=new Error('safe');Object.defineProperty(materialized,'stack',{value:'Error: safe\n    at known-source.js:2:3',configurable:true});
  assert.equal(describeRemoteValue(materialized).description,'Error: safe\n    at known-source.js:2:3');
  const unsafeMessage=new Error();Object.defineProperty(unsafeMessage,'message',{value:{toString(){reads++;throw null;}}});
  assert.equal(describeRemoteValue(unsafeMessage).description,'Error');assert.equal(reads,0);
});

test('real DOM affinity survives public getter overrides while impostors do not become nodes',t=>{
  const dom=new JSDOM('<div></div><iframe></iframe>',{runScripts:'dangerously'});t.after(()=>dom.window.close());
  const outer=dom.window.document,inner=outer.querySelector('iframe').contentDocument,node=inner.createElement('span');
  let reads=0;for(const name of ['nodeType','ownerDocument','constructor','nodeName'])Object.defineProperty(node,name,{get(){reads++;throw null;},configurable:true});
  assert.equal(ownerDocumentOf(node),inner);assert.equal(ownerDocumentOf(inner),inner);assert.equal(nodeIdentity(node).nodeType,1);
  assert.deepEqual(describeRemoteValue(node),{type:'object',subtype:'node',className:'HTMLSpanElement',description:''});
  const forged=Object.create(null);Object.defineProperty(forged,implSymbol,{value:Object.getOwnPropertyDescriptor(node,implSymbol).value});
  assert.equal(nodeIdentity(forged),undefined);assert.equal(ownerDocumentOf(forged),undefined);assert.deepEqual(describeRemoteValue(forged),{type:'object',className:'Object',description:'Object'});
  assert.equal(nodeIdentity(outer).nodeType,9);assert.equal(ownerDocumentOf({nodeType:1,ownerDocument:inner}),undefined);
  assert.equal(ownerDocumentOf(new Proxy(node,{get(){reads++;throw null;}})),undefined);assert.equal(reads,0);
  const failure=new dom.window.DOMException('invalid input','SyntaxError');
  assert.deepEqual(describeRemoteValue(failure),{type:'object',subtype:'error',className:'DOMException',description:'SyntaxError: invalid input'});
  const forgedFailure=Object.create(null);Object.defineProperty(forgedFailure,implSymbol,{value:Object.getOwnPropertyDescriptor(failure,implSymbol).value});
  assert.equal(describeRemoteValue(forgedFailure).subtype,undefined);
});

test('actual HTMLDDA collection values remain callable remote references rather than undefined',t=>{
  const binding=loadCollectionsBinding();const dom=new JSDOM('<p></p>',{runScripts:'dangerously',beforeParse(w){installCollections(w,{binding});}});t.after(()=>dom.window.close());
  const value=dom.window.document.all;assert.equal(typeof value,'undefined');assert.notEqual(value,undefined);
  assert.equal(primitiveRemoteValue(value),undefined);assert.equal(needsRemoteHandle(value),true);
  assert.deepEqual(describeRemoteValue(value),{type:'function',className:'HTMLAllCollection',description:'function () { [native code] }'});assert.equal(ownerDocumentOf(value),undefined);
});

test('exception details retain the exact thrown value and caller-owned object/realm IDs',()=>{
  const objects=new Map();let next=0,reads=0;const contextId=42;
  const remote=value=>{
    const metadata=describeRemoteValue(value);
    if(!needsRemoteHandle(value))return metadata;
    const objectId=`owned-${++next}`;objects.set(objectId,{value,contextId,group:'errors'});return {...metadata,objectId};
  };
  for(const value of [null,undefined,17,Symbol('thrown'),hostileObject(()=>reads++),new Error('ordinary')]) {
    const details=exceptionDetailsFor(value,{remote,executionContextId:contextId,exceptionId:7,lineNumber:3,columnNumber:9});
    assert.equal(details.text,'Uncaught');assert.equal(details.executionContextId,42);assert.equal(details.exceptionId,7);assert.equal(details.lineNumber,3);assert.equal(details.columnNumber,9);
    if(needsRemoteHandle(value)){const retained=objects.get(details.exception.objectId);assert.equal(retained.value,value);assert.equal(retained.contextId,42);assert.equal(retained.group,'errors');}
    else assert.deepEqual(details.exception,primitiveRemoteValue(value));
  }
  assert.equal(reads,0);assert.throws(()=>exceptionDetailsFor({}),/retaining Session serializer/);
});

test('protocol failure fields survive arbitrary thrown primitives, hostile getters and codes',()=>{
  for(const [value,message]of[[null,'null'],[undefined,'undefined'],[17,'17'],[Symbol('bad'),'Symbol(bad)']])assert.deepEqual(protocolErrorFields(value),{code:-32602,message});
  assert.deepEqual(protocolErrorFields(Object.assign(new Error('invalid parameters'),{code:-32600})),{code:-32600,message:'invalid parameters'});
  assert.deepEqual(protocolErrorFields({code:17n,message:'bad code'}),{code:-32602,message:'bad code'});
  let reads=0;const value=hostileObject(()=>reads++);assert.doesNotThrow(()=>JSON.stringify(protocolErrorFields(value)));assert.equal(reads,0);
});
