import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';
import {getHeapBinding} from '../src/native-heap.js';
import {getRuntimeBinding} from '../src/native-runtime.js';

const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t,options={}){
 const service=await serve({host:'127.0.0.1',port:0,loadResources:['iframe'],...options});
 const client=await connect('ws://127.0.0.1:'+service.port+'/');
 t.after(async()=>{await client.close();await service.close()});
 const {browserContextId}=await client.send('Target.createBrowserContext');
 const {targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});
 const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 const send=(method,params={})=>client.send(method,params,sessionId,{timeout:2500});
 const frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
 const evaluate=async source=>{const result=await send('Runtime.evaluate',{expression:source,returnByValue:true});assert.equal(result.exceptionDetails,undefined);return result.result.value};
 return {service,client,send,frameId,evaluate,page:service.browser.pages.get(targetId)};
}

test('ModelContext has real VM allocation, strong receiver ownership and exact measured dictionary conversion',t=>{
 const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage(),w=page.dom.window,c=w.navigator.modelContext;
 assert.strictEqual(c,w.navigator.modelContext);assert.notStrictEqual(c,w.navigator);
 assert.equal(Object.prototype.toString.call(c),'[object ModelContext]');assert.deepEqual(Reflect.ownKeys(c),[]);
 assert.deepEqual(Reflect.ownKeys(w.ModelContext.prototype),['registerTool','constructor',Symbol.toStringTag]);
 assert.equal(c.unregisterTool,undefined);assert.equal(c.listTools,undefined);assert.equal(c.invokeTool,undefined);
 assert.throws(()=>new w.ModelContext(),e=>e instanceof w.TypeError&&e.message==='Illegal Constructor');
 const getter=Object.getOwnPropertyDescriptor(w.Navigator.prototype,'modelContext').get;
 assert.equal(getter.name,'get modelContext');assert.equal(getter.length,0);assert.equal(w.ModelContext.prototype.registerTool.length,1);
 for(const fake of [{},Object.create(c),new Proxy(c,{})])assert.throws(()=>w.ModelContext.prototype.registerTool.call(fake,{name:'copied',description:'actual',execute(){}}),e=>e instanceof w.TypeError&&e.message==='Illegal invocation');
 const binding=getHeapBinding(),anchor=page.evaluate('({})');
 for(const object of [c,w.ModelContext,w.ModelContext.prototype,w.ModelContext.prototype.registerTool,getter]){
  const prototype=Object.getPrototypeOf(object);Object.setPrototypeOf(object,null);
  try{assert.equal(binding.sameRealm(object,anchor),true);assert.equal(binding.sameRealm(object,{}),false)}finally{Object.setPrototypeOf(object,prototype)}
 }
 const result=page.evaluate(`(()=>{const c=navigator.modelContext,reads=[],tool={};let executions=0;for(const[key,value]of Object.entries({annotations:{readOnlyHint:true},description:'actual getter description',execute(){executions++},inputSchema:{type:'object'},name:'actual_getters',title:'Read title'}))Object.defineProperty(tool,key,{get(){reads.push(key);return value}});const result=c.registerTool(tool);return{reads,executions,returnType:typeof result}})()`);
 assert.deepEqual(plain(result),{reads:['annotations','description','execute','inputSchema','name','title'],executions:0,returnType:'undefined'});
 assert.throws(()=>c.registerTool({name:'actual_getters',description:'duplicate',execute(){}}),e=>e instanceof w.DOMException&&e instanceof w.Error&&e.name==='InvalidStateError'&&e.code===11&&e.message==='The object is in an invalid state');
 for(const name of ['', 'bad name','bad@name','bad/name','bad!name','a'.repeat(129)])assert.throws(()=>c.registerTool({name,description:'actual',execute(){}}),e=>e.name==='InvalidStateError');
 assert.equal(c.registerTool({name:'a'.repeat(128),description:'actual',execute(){}}),undefined);
 assert.equal(c.registerTool({name:'actual_-.boundary',description:'actual',execute(){}}),undefined);
 assert.throws(()=>c.registerTool({name:'empty',description:'',execute(){}}),e=>e.name==='InvalidStateError');
 for(const tool of [undefined,{description:'actual',execute(){}},{name:'actual_nonfunction',description:'actual',execute:3},{name:'actual_schema_string',description:'actual',execute(){},inputSchema:'actual'}])assert.throws(()=>c.registerTool(tool),e=>e instanceof w.TypeError&&e.message==='invalid argument');
 assert.equal(page.evaluate(`typeof navigator.modelContext.registerTool({name:Symbol('actual_symbol'),description:Symbol('actual_symbol_description'),execute(){}})`),'undefined');
});

test('actual registration metadata, genuine signal removal and enable replay follow stored tools',async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.executions=0;globalThis.actualAbort=new AbortController();navigator.modelContext.registerTool({name:'actual_first',description:'stored first',execute(){executions++},inputSchema:{type:'unknown_actual_type'}},{signal:actualAbort.signal});navigator.modelContext.registerTool({name:'actual_second',title:'Read but not metadata',description:'stored second',execute(){executions++},annotations:{readOnlyHint:true}});'registered'`);
 let added=f.client.events.filter(e=>e.method==='WebMCP.toolsAdded').flatMap(e=>e.params.tools);
 assert.deepEqual(added,[{name:'actual_first',description:'stored first',inputSchema:{type:'unknown_actual_type'},annotations:{readOnly:false,untrustedContent:false,autosubmit:false},frameId:f.frameId},{name:'actual_second',description:'stored second',inputSchema:{},annotations:{readOnly:true,untrustedContent:false,autosubmit:false},frameId:f.frameId}]);
 assert.equal(await f.evaluate('executions'),0);
 await f.evaluate(`globalThis.schemaReads=0;globalThis.liveSchema={type:'object',actualValue:1,get actualGetter(){schemaReads++;return 23}};navigator.modelContext.registerTool({name:'actual_live_schema',description:'live author schema',inputSchema:liveSchema,execute(input){return input}});'stored'`);
 assert.equal(await f.evaluate('schemaReads'),1);
 await f.evaluate(`liveSchema.actualValue=2;liveSchema.actualAdded='after registration';'mutated'`);
 await f.evaluate(`actualAbort.abort();navigator.modelContext.registerTool({name:'actual_first',description:'real replacement',execute(){executions++}});const pre=new AbortController();pre.abort();navigator.modelContext.registerTool({name:'actual_pre',description:'not stored',execute(){}},{signal:pre.signal});navigator.modelContext.registerTool({name:'actual_pre',description:'actually stored',execute(){}});'changed'`);
 assert.deepEqual(f.client.events.filter(e=>e.method==='WebMCP.toolsRemoved').map(e=>e.params),[{tools:[{name:'actual_first',frameId:f.frameId}]}]);
 await f.send('WebMCP.disable');const offset=f.client.events.length;await f.send('WebMCP.enable');
 const replay=f.client.events.slice(offset).filter(e=>e.method==='WebMCP.toolsAdded');assert.equal(replay.length,1);
 assert.deepEqual(replay[0].params.tools.map(t=>[t.name,t.description]),[['actual_second','stored second'],['actual_live_schema','live author schema'],['actual_first','real replacement'],['actual_pre','actually stored']]);
 assert.deepEqual(replay[0].params.tools[1].inputSchema,{type:'object',actualValue:2,actualGetter:23,actualAdded:'after registration'});
 assert.equal(await f.evaluate('schemaReads'),2);
 const malformed=await f.send('Runtime.evaluate',{expression:`(()=>{const pre=new AbortController();pre.abort();try{navigator.modelContext.registerTool({name:'',description:'',execute:3},{signal:pre.signal})}catch(e){return[e.name,e.message]}})()`,returnByValue:true});
 assert.deepEqual(malformed.result.value,['TypeError','invalid argument']);
});

test('CDP invokes real callbacks and Promise results, leaves plain thenables uncalled and cancels only delivery',async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.actualTape=[];for(const[name,execute]of Object.entries({plain(input,client){actualTape.push({name:'plain',receiver:this===globalThis,inputRealm:input instanceof Object,clientOwn:Reflect.ownKeys(client).map(String),clientPrototype:Object.getPrototypeOf(client)===Object.prototype});return{actualPlain:input}},async promise(input){actualTape.push({name:'promise'});return{actualPromise:input}},throwing(){throw new TypeError('actual synchronous failure')},rejecting(){return Promise.reject(new RangeError('actual asynchronous failure'))},thenable(){return{then(resolve){actualTape.push({name:'thenable-called'});resolve('must not replace plain serialization')}}},interaction(input,client){return client.requestUserInteraction(()=>{actualTape.push({name:'interaction'});return Promise.resolve({actualInteraction:input})})},held(input){return new Promise(resolve=>{globalThis.actualRelease=()=>{actualTape.push({name:'released'});resolve({actualLate:input})}})}}))navigator.modelContext.registerTool({name,description:'actual '+name,inputSchema:{type:'object',required:['absent_actual']},execute});'registered'`);
 const invoke=async name=>{const offset=f.client.events.length,result=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:name,input:{actual:name}});await f.evaluate('JSON.stringify(actualTape)');return{result,events:f.client.events.slice(offset).filter(e=>e.method.startsWith('WebMCP.'))}};
 for(const [name,expected]of [['plain',{actualPlain:{actual:'plain'}}],['promise',{actualPromise:{actual:'promise'}}],['thenable',{}],['interaction',{actualInteraction:{actual:'interaction'}}]]){
  const {result,events}=await invoke(name);assert.equal(typeof result.invocationId,'string');
  assert.deepEqual(events.find(e=>e.method==='WebMCP.toolInvoked').params,{toolName:name,frameId:f.frameId,invocationId:result.invocationId,input:JSON.stringify({actual:name})});
  assert.deepEqual(events.find(e=>e.method==='WebMCP.toolResponded').params,{invocationId:result.invocationId,status:'Completed',output:expected});
 }
 for(const[name,errorText]of [['throwing','actual synchronous failure'],['rejecting','RangeError: actual asynchronous failure']]){
  const {result,events}=await invoke(name);assert.deepEqual(events.find(e=>e.method==='WebMCP.toolResponded').params,{invocationId:result.invocationId,status:'Error',errorText});
 }
 const tape=JSON.parse(await f.evaluate('JSON.stringify(actualTape)'));
 assert.deepEqual(tape[0],{name:'plain',receiver:true,inputRealm:true,clientOwn:[],clientPrototype:false});assert.equal(tape.some(e=>e.name==='thenable-called'),false);
 const held=await invoke('held');assert.equal(held.events.some(e=>e.method==='WebMCP.toolResponded'),false);
 const offset=f.client.events.length;await f.send('WebMCP.cancelInvocation',{invocationId:held.result.invocationId});
 assert.equal(await f.evaluate(`actualRelease();actualTape.at(-1).name`),'released');await f.evaluate('JSON.stringify(actualTape)');
 assert.deepEqual(f.client.events.slice(offset).filter(e=>e.method==='WebMCP.toolResponded').map(e=>e.params),[{invocationId:held.result.invocationId,status:'Canceled'}]);
 await assert.rejects(f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'missing_actual',input:null}),e=>e.code===-31998&&e.message==='NotFound');
 await assert.rejects(f.send('WebMCP.listTools'),e=>e.code===-32601&&e.message==="'WebMCP.listTools' wasn't found");
});

test('Client actual stateless receiver behavior returns real realm Promises and converts synchronous callback errors',async t=>{
 const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage(),w=page.dom.window;
 const result=JSON.parse(await page.evaluate(`(async()=>{
  const invoke=ModelContextClient.prototype.requestUserInteraction,results=[],tape=[];
  for(const callback of [function(){tape.push({receiver:this===globalThis,count:arguments.length});return 19},undefined,7,function(){throw new TypeError('authored client callback failure')},function(){return{then(resolve){tape.push({thenable:true});resolve('actual client adoption')}}}]){
   try{const promise=invoke.call({},callback);const isPromise=promise instanceof Promise;try{results.push({isPromise,ok:true,value:await promise})}catch(error){results.push({isPromise,ok:false,name:error.name,message:error.message,constructor:error.constructor.name,realm:error instanceof Error})}}
   catch(error){results.push({synchronous:true,name:error.name,message:error.message})}
  }
  return JSON.stringify({results,tape});
 })()`));
 assert.deepEqual(result,{results:[{isPromise:true,ok:true,value:19},{isPromise:true,ok:false,name:'TypeError',message:'invalid argument',constructor:'TypeError',realm:true},{isPromise:true,ok:false,name:'TypeError',message:'invalid argument',constructor:'TypeError',realm:true},{isPromise:true,ok:false,name:'Error',message:'authored client callback failure',constructor:'Error',realm:true},{isPromise:true,ok:true,value:'actual client adoption'}],tape:[{receiver:true,count:0},{thenable:true}]});
 assert.throws(()=>new w.ModelContextClient(),e=>e instanceof w.TypeError&&e.message==='Illegal Constructor');
 for(const C of [w.ModelContext,w.ModelContextClient]){
  const d=Object.getOwnPropertyDescriptor(C,'prototype');assert.equal(d.writable,false);assert.equal(d.configurable,false);assert.equal(d.enumerable,false);
  const p=C.prototype,method=Object.getOwnPropertyDescriptor(p,C===w.ModelContext?'registerTool':'requestUserInteraction');
  assert.equal(method.writable,true);assert.equal(method.enumerable,true);assert.equal(method.configurable,true);
  assert.deepEqual(plain(Object.getOwnPropertyDescriptor(p,Symbol.toStringTag)),{value:C.name,writable:false,enumerable:false,configurable:true});
 }
 const fake=Object.create(Object.getPrototypeOf(new w.AbortController().signal));
 assert.throws(()=>w.navigator.modelContext.registerTool({name:'fake_signal',description:'actual',execute(){}},{signal:fake}),e=>e instanceof w.TypeError&&e.message==='invalid argument');
});

test('private V8 Promise snapshot preserves actual identity without then/constructor/species hooks',t=>{
 const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage(),binding=getRuntimeBinding();
 const values=page.evaluate(`(()=>{globalThis.actualPromiseReads=[];const value={actualIdentity:true},error=new RangeError('actual rejection identity'),pending=new Promise(resolve=>globalThis.actualPrimitiveResolve=resolve),fulfilled=Promise.resolve(value),rejected=Promise.reject(error);for(const p of[fulfilled,rejected,pending]){Object.defineProperty(p,'then',{get(){actualPromiseReads.push('then');throw new Error('authored then')}});Object.defineProperty(p,'constructor',{get(){actualPromiseReads.push('constructor');throw new Error('authored constructor')}})}return{value,error,pending,fulfilled,rejected}})()`);
 binding.consumeObservedPromise(values.rejected,page.dom.window.Object.prototype);
 const fulfilled=binding.promiseSnapshot(values.fulfilled),pending=binding.promiseSnapshot(values.pending),rejected=binding.promiseSnapshot(values.rejected);
 for(const snapshot of [fulfilled,pending,rejected]){assert.strictEqual(Object.getPrototypeOf(snapshot),null);assert.equal(getHeapBinding().sameRealm(snapshot,values.value),false)}
 assert.equal(fulfilled.state,1);assert.strictEqual(fulfilled.value,values.value);
 assert.equal(pending.state,0);assert.equal(Object.hasOwn(pending,'value'),false);
 assert.equal(rejected.state,2);assert.strictEqual(rejected.value,values.error);
 page.callFunction('function(value){actualPrimitiveResolve(value)}',undefined,[values.value]);
 assert.strictEqual(binding.promiseSnapshot(values.pending).value,values.value);
 assert.deepEqual(plain(page.evaluate('actualPromiseReads')),[]);
 let traps=0;const proxy=new Proxy(values.fulfilled,{get(){traps++;throw new Error('not genuine')}});
 for(const fake of [{},proxy,Object.create(page.dom.window.Promise.prototype)])assert.throws(()=>binding.promiseSnapshot(fake),e=>e instanceof TypeError&&e.message==='An actual Promise is required');
 assert.equal(traps,0);
 const species=page.evaluate(`(()=>{const value={actualSpeciesIdentity:true},promise=Promise.resolve(value);Object.defineProperty(promise,'constructor',{value:{get [Symbol.species](){actualPromiseReads.push('species');throw new Error('authored species')}}});return{value,promise}})()`);
 assert.strictEqual(binding.promiseSnapshot(species.promise).value,species.value);assert.deepEqual(plain(page.evaluate('actualPromiseReads')),[]);
});

test('genuine poisoned Promises settle through actual private state without author adoption hooks',async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.actualPoisonReads=[];for(const name of['own_then','constructor','species','pending'])navigator.modelContext.registerTool({name,description:'actual '+name,execute(input){const p=name==='pending'?new Promise(resolve=>{globalThis.releaseActualPending=()=>resolve({actualPromise:name,input})}):Promise.resolve({actualPromise:name,input});if(name==='own_then')Object.defineProperty(p,'then',{get(){actualPoisonReads.push(name);throw new Error('actual own then getter')}});else if(name==='constructor'||name==='pending')Object.defineProperty(p,'constructor',{get(){actualPoisonReads.push(name);throw new Error('actual constructor getter')}});else Object.defineProperty(p,'constructor',{value:{get [Symbol.species](){actualPoisonReads.push(name);throw new Error('actual species getter')}}});return p}});'registered'`);
 for(const name of ['own_then','constructor','species']){
  const offset=f.client.events.length,{invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:name,input:{actual:name}});await f.evaluate('actualPoisonReads.length');
  assert.deepEqual(f.client.events.slice(offset).filter(e=>e.method==='WebMCP.toolResponded').map(e=>e.params),[{invocationId,status:'Completed',output:{actualPromise:name,input:{actual:name}}}]);
 }
 const offset=f.client.events.length,{invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'pending',input:{actual:'pending'}});
 assert.equal(f.client.events.slice(offset).some(e=>e.method==='WebMCP.toolResponded'),false);
 await f.evaluate(`releaseActualPending();'released'`);
 const deadline=Date.now()+1000;
 while(!f.client.events.slice(offset).some(e=>e.method==='WebMCP.toolResponded')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 assert.deepEqual(f.client.events.slice(offset).filter(e=>e.method==='WebMCP.toolResponded').map(e=>e.params),[{invocationId,status:'Completed',output:{actualPromise:'pending',input:{actual:'pending'}}}]);
 assert.deepEqual(JSON.parse(await f.evaluate('JSON.stringify(actualPoisonReads)')),[]);
});

test('actual callback watchdog releases its invocation and a later real tool still completes',async t=>{
 // This validates our embedding's established watchdog/ownership boundary;
 // Native WebMCP's precise timeout error string is a separate held-out claim.
 const f=await fixture(t,{timeout:20});await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.actualHealthyCount=0;navigator.modelContext.registerTool({name:'actual_deadline',description:'actual nonreturning callback',execute(){for(;;){}}});navigator.modelContext.registerTool({name:'actual_healthy',description:'actual later callback',execute(){actualHealthyCount++;return{actualCount:actualHealthyCount}}});'registered'`);
 const offset=f.client.events.length,{invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'actual_deadline',input:{actual:true}});
 const response=f.client.events.slice(offset).find(e=>e.method==='WebMCP.toolResponded');assert.equal(response.params.invocationId,invocationId);assert.equal(response.params.status,'Error');assert.match(response.params.errorText,/Script execution timed out after 20ms/);
 const next=f.client.events.length,healthy=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'actual_healthy',input:{actual:true}});
 assert.deepEqual(f.client.events.slice(next).find(e=>e.method==='WebMCP.toolResponded').params,{invocationId:healthy.invocationId,status:'Completed',output:{actualCount:1}});assert.equal(await f.evaluate('actualHealthyCount'),1);
});

test('owner close drops delivery observation while a retained author resolver keeps its actual effects',async t=>{
 // Local ownership regression only. Exact Native navigation/retirement event
 // and late rejection policy remains pending the separate lifecycle profile.
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.actualAfterClose=[];navigator.modelContext.registerTool({name:'actual_close_pending',description:'actual close pending',execute(){return new Promise(resolve=>{globalThis.actualCloseRelease=()=>{actualAfterClose.push('authored resolver ran');resolve({actualAfterClose:true})}})}});'registered'`);
 const {invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'actual_close_pending',input:{actual:true}});
 const release=f.page.evaluate('actualCloseRelease'),tape=f.page.evaluate('actualAfterClose'),offset=f.client.events.length;
 f.page.close();release();await new Promise(resolve=>setTimeout(resolve,25));
 assert.deepEqual(plain(tape),['authored resolver ran']);assert.equal(f.client.events.slice(offset).some(e=>e.method==='WebMCP.toolResponded'&&e.params.invocationId===invocationId),false);
});

test('borrowed Navigator modelContext getter returns its defining realm canonical backend',async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.actualFrame=document.createElement('iframe');document.body.appendChild(actualFrame);globalThis.actualChild=actualFrame.contentWindow;'created'`);
 const {frameTree}=await f.send('Page.getFrameTree');assert.equal(frameTree.childFrames.length,1);const childId=frameTree.childFrames[0].frame.id;
 const shape=JSON.parse(await f.evaluate(`(()=>{const parentFront=navigator.modelContext,childFront=actualChild.navigator.modelContext,parentGet=Object.getOwnPropertyDescriptor(Navigator.prototype,'modelContext').get,childGet=Object.getOwnPropertyDescriptor(actualChild.Navigator.prototype,'modelContext').get;globalThis.parentOnChild=parentGet.call(actualChild.navigator);globalThis.childOnParent=childGet.call(navigator);const shape=value=>({sameParent:value===parentFront,sameChild:value===childFront,parentPrototype:Object.getPrototypeOf(value)===ModelContext.prototype,childPrototype:Object.getPrototypeOf(value)===actualChild.ModelContext.prototype,parentRealm:value instanceof Object,childRealm:value instanceof actualChild.Object,own:Reflect.ownKeys(value).map(String),tag:Object.prototype.toString.call(value)});return JSON.stringify({parentOnChild:shape(parentOnChild),childOnParent:shape(childOnParent),parentRepeat:parentGet.call(actualChild.navigator)===parentOnChild,childRepeat:childGet.call(navigator)===childOnParent})})()`));
 assert.deepEqual(shape,{parentOnChild:{sameParent:true,sameChild:false,parentPrototype:true,childPrototype:false,parentRealm:true,childRealm:false,own:[],tag:'[object ModelContext]'},childOnParent:{sameParent:false,sameChild:true,parentPrototype:false,childPrototype:true,parentRealm:false,childRealm:true,own:[],tag:'[object ModelContext]'},parentRepeat:true,childRepeat:true});
 const offset=f.client.events.length;
 await f.evaluate(`globalThis.actualBackendCalls=0;parentOnChild.registerTool({name:'real_borrowed_front_registry',description:'real canonical backend',execute(input){actualBackendCalls++;return{actualBackendCalls,thisParent:this===globalThis,thisChild:this===actualChild,inputParent:input instanceof Object,inputChild:input instanceof actualChild.Object,input}}});'registered'`);
 const added=f.client.events.slice(offset).filter(e=>e.method==='WebMCP.toolsAdded');assert.equal(added.length,1);assert.equal(added[0].params.tools[0].frameId,f.frameId);
 const begin=f.client.events.length,{invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'real_borrowed_front_registry',input:{actualInput:37}});
 assert.deepEqual(f.client.events.slice(begin).find(e=>e.method==='WebMCP.toolResponded').params,{invocationId,status:'Completed',output:{actualBackendCalls:1,thisParent:true,thisChild:false,inputParent:true,inputChild:false,input:{actualInput:37}}});
 await assert.rejects(f.send('WebMCP.invokeTool',{frameId:childId,toolName:'real_borrowed_front_registry',input:{actualInput:41}}),e=>e.code===-31998&&e.message==='NotFound');assert.equal(await f.evaluate('actualBackendCalls'),1);
 await f.send('WebMCP.disable');const replay=f.client.events.length;await f.send('WebMCP.enable');
 assert.deepEqual(f.client.events.slice(replay).filter(e=>e.method==='WebMCP.toolsAdded').flatMap(e=>e.params.tools).map(tool=>[tool.name,tool.frameId]),[['real_borrowed_front_registry',f.frameId]]);
});


test('actual CDP plain results precede their ID while genuine Promise results follow it without another VM command',async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`for(const[name,execute]of Object.entries({actual_order_plain(){return{actual:'plain'}},actual_order_promise(){return Promise.resolve({actual:'promise'})}}))navigator.modelContext.registerTool({name,description:'actual wire producer',execute});'registered'`);
 const wire=[];f.client.socket.on('message',raw=>wire.push(JSON.parse(raw)));
 for(const[kind,expectedBefore]of[['plain',true],['promise',false]]){
  const start=wire.length,{invocationId}=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'actual_order_'+kind,input:{}});
  const response=()=>wire.findIndex((row,index)=>index>=start&&row.method==='WebMCP.toolResponded'&&row.params.invocationId===invocationId);
  // Socket-only waiting cannot drive the authored VM or resolve a fake result.
  const deadline=Date.now()+1000;while(response()<0&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
  const reply=wire.findIndex((row,index)=>index>=start&&row.id&&row.result?.invocationId===invocationId);
  assert.ok(response()>=start);assert.ok(reply>=start);assert.equal(response()<reply,expectedBefore);
  assert.deepEqual(wire[response()].params,{invocationId,status:'Completed',output:{actual:kind}});
 }
});

test('fresh top-level blank trust is private creation state, and data or History URLs cannot grant it',async t=>{
 const {createServer}=await import('node:http');
 const server=createServer((_request,response)=>response.end('<!doctype html><body>actual insecure owner'));
 await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
 const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();
 assert.equal(page.evaluate('isSecureContext'),true);assert.equal(page.evaluate('typeof PaymentRequest'),'function');
 await page.navigate('data:text/html,<!doctype html><body>actual opaque data');assert.equal(page.evaluate('isSecureContext'),false);assert.equal(page.evaluate('typeof PaymentRequest'),'undefined');
 await page.navigate('http://0.0.0.0:'+server.address().port+'/actual-owner');
 const principal=page.securityOrigin,document=page.dom.window.document;
 assert.equal(page.evaluate('isSecureContext'),false);
 page.evaluate(`history.pushState({actual:true},'','about:blank')`);
 assert.strictEqual(page.dom.window.document,document);assert.equal(page.securityOrigin,principal);assert.equal(page.evaluate('isSecureContext'),false);assert.equal(page.evaluate('typeof PaymentRequest'),'undefined');
 await page.navigate('about:blank');assert.notStrictEqual(page.dom.window.document,document);assert.equal(page.securityOrigin,'null');assert.equal(page.evaluate('isSecureContext'),true);assert.equal(page.evaluate('typeof PaymentRequest'),'function');
});


test('concurrent parent and child pending jobs preserve real cancellation, resolution and task ownership',async t=>{
 const f=await fixture(t);await f.send('WebMCP.enable');
 await f.evaluate(`globalThis.pendingChildFrame=document.createElement('iframe');document.body.append(pendingChildFrame);globalThis.pendingChild=pendingChildFrame.contentWindow;globalThis.parentEffects=0;pendingChild.childEffects=0;navigator.modelContext.registerTool({name:'actual_parent_wait',description:'real parent pending',execute(){return new Promise(resolve=>{globalThis.releaseParent=()=>{parentEffects++;resolve({actualOwner:'parent'})}})}});pendingChild.eval("navigator.modelContext.registerTool({name:'actual_child_wait',description:'real child pending',execute(){return new Promise(resolve=>{globalThis.releaseChild=()=>{childEffects++;resolve({actualOwner:'child'})}})}})");'registered'`);
 const childId=(await f.send('Page.getFrameTree')).frameTree.childFrames[0].frame.id;
 const parent=await f.send('WebMCP.invokeTool',{frameId:f.frameId,toolName:'actual_parent_wait',input:{}}),child=await f.send('WebMCP.invokeTool',{frameId:childId,toolName:'actual_child_wait',input:{}});
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(f.client.events.some(e=>e.method==='WebMCP.toolResponded'&&[parent.invocationId,child.invocationId].includes(e.params.invocationId)),false);
 await f.send('WebMCP.cancelInvocation',{invocationId:parent.invocationId});
 await f.evaluate(`releaseParent();pendingChild.releaseChild();'actual resolvers executed'`);
 const deadline=Date.now()+1000;while(!f.client.events.some(e=>e.method==='WebMCP.toolResponded'&&e.params.invocationId===child.invocationId)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
 assert.deepEqual(f.client.events.filter(e=>e.method==='WebMCP.toolResponded'&&e.params.invocationId===parent.invocationId).map(e=>e.params),[{invocationId:parent.invocationId,status:'Canceled'}]);
 assert.deepEqual(f.client.events.filter(e=>e.method==='WebMCP.toolResponded'&&e.params.invocationId===child.invocationId).map(e=>e.params),[{invocationId:child.invocationId,status:'Completed',output:{actualOwner:'child'}}]);
 assert.deepEqual(JSON.parse(await f.evaluate(`JSON.stringify({parent:parentEffects,child:pendingChild.childEffects})`)),{parent:1,child:1});
});
