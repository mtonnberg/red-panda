import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Browser} from '../src/browser.js';
import {installDevicePermissions} from '../src/device-permissions.js';
import {serve} from '../src/cdp.js';
import {connect} from './cdp-client.js';
async function fixture(t){const browser=new Browser({loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body>owned<iframe id=f srcdoc="<p>child</p>"></iframe>');return{browser,page,w:page.dom.window}}
const plain=value=>JSON.parse(JSON.stringify(value));
test('native denied Geolocation callbacks are actual asynchronous realm objects with no fabricated position',async t=>{
 const{page,w}=await fixture(t);const result=await page.evaluate(`new Promise(resolve=>{const order=[];let synchronous=true;navigator.geolocation.getCurrentPosition(()=>resolve({invented:true}),function(error){order.push('error');resolve({synchronous,order,receiver:this===window,arity:arguments.length,code:error.code,message:error.message,instance:error instanceof GeolocationPositionError,notError:!(error instanceof Error)&&!(error instanceof DOMException),tag:Object.prototype.toString.call(error),own:Object.keys(error),constants:[error.PERMISSION_DENIED,error.POSITION_UNAVAILABLE,error.TIMEOUT]})});order.push('sync');Promise.resolve().then(()=>order.push('microtask'));synchronous=false})`);
 assert.deepEqual(plain(result),{synchronous:false,order:['sync','microtask','error'],receiver:true,arity:1,code:1,message:'User denied Geolocation',instance:true,notError:true,tag:'[object GeolocationPositionError]',own:[],constants:[1,2,3]});
 assert.equal(w.navigator.geolocation,w.navigator.geolocation);assert.equal(Object.hasOwn(w.navigator,'geolocation'),false);
 assert.equal(installDevicePermissions(page,w).pending,0);
});
test('genuine watch IDs cancel actual queued work and each denied watch delivers only once',async t=>{
 const{page,w}=await fixture(t),geo=w.navigator.geolocation;let canceled=0,delivered=0;
 const first=geo.watchPosition(()=>canceled++,()=>canceled++);assert.ok(first>0);geo.clearWatch(first);geo.clearWatch(first);
 const second=await new Promise(resolve=>{const id=geo.watchPosition(()=>assert.fail('No granted position'),error=>{delivered++;geo.clearWatch(id);resolve({id,error})})});
 assert.equal(second.id,first+1);assert.equal(second.error.code,1);await delay(20);assert.equal(canceled,0);assert.equal(delivered,1);assert.equal(installDevicePermissions(page,w).pending,0);
});
test('Geolocation conversion, public method shapes and invalid receivers use actual callee realm errors',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`new Promise(resolve=>{const reads=[],options={};for(const key of ['enableHighAccuracy','maximumAge','timeout'])Object.defineProperty(options,key,{get(){reads.push(key);return 0}});const failures=[];for(const fn of [()=>navigator.geolocation.getCurrentPosition(),()=>navigator.geolocation.getCurrentPosition(null),()=>navigator.geolocation.getCurrentPosition(()=>{},42),()=>navigator.geolocation.getCurrentPosition(()=>{},null,42),()=>navigator.geolocation.clearWatch()]){try{fn()}catch(e){failures.push({name:e.name,message:e.message,realm:e instanceof TypeError})}}let receiver;try{Geolocation.prototype.getCurrentPosition.call({},()=>{})}catch(e){receiver={name:e.name,message:e.message,realm:e instanceof TypeError}}navigator.geolocation.getCurrentPosition(()=>resolve({invented:true}),e=>resolve({reads,failures,receiver,code:e.code,shape:['getCurrentPosition','watchPosition','clearWatch'].map(name=>({name,length:navigator.geolocation[name].length,realm:Object.getPrototypeOf(navigator.geolocation[name])===Function.prototype,constructable:Object.hasOwn(navigator.geolocation[name],'prototype')}))}),options)})`);
 assert.deepEqual(plain(result),{reads:['enableHighAccuracy','maximumAge','timeout'],failures:Array(5).fill({name:'TypeError',message:'invalid argument',realm:true}),receiver:{name:'TypeError',message:'Illegal invocation',realm:true},code:1,shape:['getCurrentPosition','watchPosition','clearWatch'].map(name=>({name,length:1,realm:true,constructable:false}))});
});
test('retirement cancels old frame requests and retains new requests with the actual child callback receiver and error realm',async t=>{
 const{page,w}=await fixture(t),frame=w.document.getElementById('f'),child=frame.contentWindow;let old=0;
 child.navigator.geolocation.getCurrentPosition(()=>old++,()=>old++);frame.remove();assert.equal(child.closed,true);
 const delivered=await new Promise(resolve=>child.navigator.geolocation.getCurrentPosition(()=>assert.fail('No position'),function(error){resolve({self:this,error})}));
 assert.equal(old,0);assert.equal(delivered.self,child);assert.ok(delivered.error instanceof child.GeolocationPositionError);assert.equal(delivered.error instanceof w.GeolocationPositionError,false);assert.equal(delivered.error.message,'User denied Geolocation');
 const own=installDevicePermissions([...page.frames.executionPages()].find(p=>p.dom.window===child),child);assert.equal(own.pending,0);
});
test('document navigation and final close cancel only their pending jobs without changing retained error values',async t=>{
 const{browser,page,w}=await fixture(t),peer=browser.createPage();await peer.navigate('data:text/html,peer');let old=0,other=0;
 const held=await new Promise(resolve=>w.navigator.geolocation.getCurrentPosition(()=>assert.fail('No position'),resolve));
 const controller=installDevicePermissions(page,w);w.navigator.geolocation.watchPosition(()=>old++,()=>old++);
 const peerResult=new Promise(resolve=>peer.dom.window.navigator.geolocation.getCurrentPosition(()=>assert.fail('No position'),e=>{other++;resolve(e)}));
 await page.navigate('data:text/html,replaced');await peerResult;assert.equal(old,0);assert.equal(other,1);assert.equal(controller.pending,0);assert.equal(held.code,1);assert.equal(held.message,'User denied Geolocation');
 let closed=0;const current=page.dom.window;current.navigator.geolocation.getCurrentPosition(()=>closed++,()=>closed++);page.close();await delay(15);assert.equal(closed,0);assert.equal(installDevicePermissions(page,current).pending,0);
});
test('Notification stores native snapshot data on a genuine EventTarget and does not invent display or close events',async t=>{
 const{page,w}=await fixture(t);const result=page.evaluate(`(()=>{const options={body:'body',icon:'i.png',image:'image',badge:'badge',tag:'tag',lang:'en',dir:'unexpected',silent:true,requireInteraction:true,renotify:true,data:{hidden:1}};const n=new Notification(Symbol('title'),options);options.body='changed';const rows=[];n.addEventListener('click',function(e){rows.push({receiver:this===n,target:e.target===n,trusted:e.isTrusted})});let closed=0;n.addEventListener('close',()=>closed++);n.dispatchEvent(new Event('click'));n.close();n.close();return{title:n.title,body:n.body,icon:n.icon,image:n.image,badge:n.badge,tag:n.tag,lang:n.lang,dir:n.dir,silent:n.silent,requireInteraction:n.requireInteraction,renotify:n.renotify,data:n.data??null,instance:n instanceof Notification,target:n instanceof EventTarget,tagName:Object.prototype.toString.call(n),own:Object.keys(n),rows,closed}})()`);
 assert.deepEqual(plain(result),{title:'title',body:'body',icon:'i.png',image:'image',badge:'badge',tag:'tag',lang:'en',dir:'unexpected',silent:true,requireInteraction:true,renotify:true,data:null,instance:true,target:true,tagName:'[object Notification]',own:[],rows:[{receiver:true,target:true,trusted:false}],closed:0});
 assert.equal(w.Notification.permission,'default');assert.equal(w.Notification.maxActions,2);
});
test('Notification permission is a genuine immediately fulfilled realm promise and ignores native optional callbacks',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`(async()=>{const order=[];let called=false;const p=Notification.requestPermission(()=>{called=true});p.then(value=>order.push(value));Promise.resolve().then(()=>order.push('microtask'));const value=await p;return{value,called,order,realm:p instanceof Promise,constructor:p.constructor===Promise,permission:Notification.permission,numeric:await Notification.requestPermission(42)}})()`);
 assert.deepEqual(plain(result),{value:'default',called:false,order:['default','microtask'],realm:true,constructor:true,permission:'default',numeric:'default'});
});
test('real Notification methods and validation retain captured intrinsics after authored global changes',async t=>{
 const{page}=await fixture(t);const result=await page.evaluate(`(async()=>{const saved={Reflect,EventTarget,Promise,TypeError},NotificationConstructor=Notification;Reflect.construct=()=>{throw 'construct'};globalThis.EventTarget=function(){throw 'event target'};globalThis.TypeError=function(){throw 'wrong error'};Promise.resolve=()=>{throw 'resolve'};const n=new NotificationConstructor('owned');let error;try{new NotificationConstructor()}catch(e){error=e instanceof saved.TypeError}return{target:n instanceof saved.EventTarget,error,value:await NotificationConstructor.requestPermission(),shape:Object.getOwnPropertyNames(NotificationConstructor)}})()`);
 assert.deepEqual(plain(result),{target:true,error:true,value:'default',shape:['length','name','prototype','permission','maxActions','requestPermission']});
});
test('Permissions reads descriptors on the call stack, preserves real rejection values and keeps prompt statuses as EventTargets',async t=>{
 const{page,w}=await fixture(t);const result=await page.evaluate(`(async()=>{const events=[],p=navigator.permissions.query({get name(){events.push('get');return Symbol('geolocation')}});events.push('sync');const s=await p;let rejection;try{await navigator.permissions.query({})}catch(e){rejection={name:e.name,message:e.message,realm:e instanceof TypeError}}let changed=0;s.addEventListener=()=>{throw 'authored add'};s.removeEventListener=()=>{throw 'authored remove'};s.onchange=()=>changed++;s.dispatchEvent(new Event('change'));return{events,name:s.name,state:s.state,target:s instanceof EventTarget,rejection,changed}})()`);
 assert.deepEqual(plain(result),{events:['get','sync'],name:'geolocation',state:'prompt',target:true,rejection:{name:'TypeError',message:'invalid argument',realm:true},changed:1});
 const sentinel={original:true};const promise=w.navigator.permissions.query({get name(){throw sentinel}});await assert.rejects(promise,error=>error===sentinel);
});
test('permission grants and location overrides change actual query state and real callback values',async t=>{
 const service=await serve({port:0}),client=await connect(`ws://127.0.0.1:${service.port}/`);t.after(async()=>{await client.close();await service.close()});
 const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 await client.send('Browser.grantPermissions',{permissions:['geolocation']});
 await client.send('Emulation.setGeolocationOverride',{latitude:1,longitude:2,accuracy:3},sessionId);
 const value=await client.send('Runtime.evaluate',{expression:'new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve([p.coords.latitude,p.coords.longitude,p.coords.accuracy,p instanceof GeolocationPosition]),e=>resolve([e.code])))',returnByValue:true,awaitPromise:true},sessionId);assert.deepEqual(value.result.value,[1,2,3,true]);
 const state=await client.send('Runtime.evaluate',{expression:'navigator.permissions.query({name:"geolocation"}).then(s=>s.state)',returnByValue:true,awaitPromise:true},sessionId);assert.equal(state.result.value,'granted');
});
