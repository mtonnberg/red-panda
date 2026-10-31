import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Browser, until } from '../src/browser.js';

const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){const browser=new Browser({loadResources:['iframe','worker']});t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,<body></body>');return{browser,page,w:page.dom.window}}
const expected=JSON.parse(await readFile(new URL('../oracle/webcodecs-native-values.json',import.meta.url),'utf8')).result.result.value;
const expression=await readFile(new URL('../oracle/webcodecs-value-expression.js',import.meta.url),'utf8');

test('value types match actual native conversion, enum, byte, transfer and clone controls',async t=>{
 const {page}=await fixture(t);assert.deepEqual(plain(await page.evaluate(expression)),expected);
});

test('encoded chunks snapshot view bytes, preserve metadata and write only the selected destination slice',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const input=new Uint8Array([0,7,8,0]),chunk=new EncodedVideoChunk({data:new DataView(input.buffer,1,2),timestamp:-3,duration:4,type:'key'});input.fill(9);const target=new Uint8Array([1,1,1,1]);chunk.copyTo(target.subarray(1,3));return{bytes:[...target],length:chunk.byteLength,type:chunk.type,timestamp:chunk.timestamp,duration:chunk.duration,own:Object.keys(chunk),realm:EncodedVideoChunk instanceof Function}})()`);assert.deepEqual(plain(actual),{bytes:[1,7,8,1],length:2,type:'key',timestamp:-3,duration:4,own:[],realm:true});
});

test('buffer transfer validates every actual buffer before detaching any source',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const a=new ArrayBuffer(3),b=new ArrayBuffer(2),dead=new ArrayBuffer(1);dead.transfer(0);const rows=[];for(const list of[[a,a],[a,dead],[a,new Uint8Array(1)]]){try{new EncodedAudioChunk({data:a,timestamp:0,type:'key',transfer:list})}catch(e){rows.push([e.name,a.detached])}}const chunk=new EncodedAudioChunk({data:a,timestamp:0,type:'key',transfer:[b]});return{rows,a:a.detached,b:b.detached,length:chunk.byteLength}})()`);assert.deepEqual(plain(actual),{rows:[['DataCloneError',false],['DataCloneError',false],['TypeError',false]],a:false,b:true,length:3});
});

test('constructor observes real dictionary order and snapshots detached input after conversion',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const order=[],data=new Uint8Array([1,2]);const chunk=new EncodedVideoChunk({get data(){order.push('data');return data},get duration(){order.push('duration');return 1},get timestamp(){order.push('timestamp');data.buffer.transfer(0);return 2},get transfer(){order.push('transfer');return[]},get type(){order.push('type');return'key'}});return{order,bytes:chunk.byteLength}})()`);assert.deepEqual(plain(actual),{order:['data','duration','timestamp','transfer','type'],bytes:0});
});

test('separate chunk brands reject cross-interface methods and copied prototypes',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const audio=new EncodedAudioChunk({data:new Uint8Array(1),timestamp:0,type:'key'}),fake=Object.create(EncodedAudioChunk.prototype),rows=[];for(const call of[()=>EncodedVideoChunk.prototype.copyTo.call(audio,new Uint8Array(1)),()=>Object.getOwnPropertyDescriptor(EncodedVideoChunk.prototype,'type').get.call(audio),()=>EncodedAudioChunk.prototype.copyTo.call(fake,new Uint8Array(1))]){try{call()}catch(e){rows.push([e.name,e.message,e instanceof TypeError])}}const clone=structuredClone(fake);return{rows,plain:Object.getPrototypeOf(clone)===Object.prototype,keys:Object.keys(clone)}})()`);assert.deepEqual(plain(actual),{rows:Array.from({length:3},()=>['TypeError','Illegal invocation',true]),plain:true,keys:[]});
});

test('structuredClone preserves chunk cycles and aliases while ignoring authored metadata getters',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const chunk=new EncodedAudioChunk({data:new Uint8Array([6,7]),timestamp:8,duration:9,type:'delta'});for(const k of['type','timestamp','duration','byteLength'])Object.defineProperty(chunk,k,{get(){throw Error('authored')}});const payload={chunk,again:chunk,map:new Map([[chunk,chunk]])};payload.self=payload;const copy=structuredClone(payload),data=new Uint8Array(2);copy.chunk.copyTo(data);return{cycle:copy.self===copy,alias:copy.chunk===copy.again&&copy.map.get(copy.chunk)===copy.chunk,brand:copy.chunk instanceof EncodedAudioChunk,bytes:[...data],metadata:[copy.chunk.type,copy.chunk.timestamp,copy.chunk.duration]}})()`);assert.deepEqual(plain(actual),{cycle:true,alias:true,brand:true,bytes:[6,7],metadata:['delta',8,9]});
});

test('native rejects cloning VideoColorSpace and accepts Symbol enum descriptions',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const color=new VideoColorSpace({matrix:Symbol('rgb'),primaries:Symbol('bt709')});let error;try{structuredClone(color)}catch(e){error=[e.name,e instanceof DOMException]}return{json:color.toJSON(),error,type:new EncodedVideoChunk({data:new Uint8Array(),timestamp:0,type:Symbol('delta')}).type}})()`);assert.deepEqual(plain(actual),{json:{primaries:'bt709',transfer:null,matrix:'rgb',fullRange:null},error:['DataCloneError',true],type:'delta'});
});

test('real shared backing stores are rejected without invoking authored BufferSource properties',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const rows=[];for(const data of[new SharedArrayBuffer(2),new Uint8Array(new SharedArrayBuffer(2)),new DataView(new SharedArrayBuffer(2))]){try{new EncodedVideoChunk({data,timestamp:0,type:'key'})}catch(e){rows.push([e.name,e.message])}}const input=new Uint8Array([4,5]);for(const key of['buffer','byteOffset','byteLength'])Object.defineProperty(input,key,{get(){throw Error('authored')}});const chunk=new EncodedVideoChunk({data:input,timestamp:0,type:'key'}),dest=new Uint8Array(2);for(const key of['buffer','byteOffset','byteLength'])Object.defineProperty(dest,key,{get(){throw Error('authored')}});chunk.copyTo(dest);return{rows,bytes:[...dest]}})()`);assert.deepEqual(plain(actual),{rows:Array.from({length:3},()=>['TypeError','invalid argument']),bytes:[4,5]});
});

test('genuine child-frame values retain shared brands and borrowed method realm',async t=>{
 const {page,w}=await fixture(t),frame=w.document.createElement('iframe');frame.srcdoc='<body>child</body>';w.document.body.append(frame);await until(()=>frame.contentDocument?.readyState==='complete',{timeout:2000});const child=frame.contentWindow,chunk=new child.EncodedAudioChunk({data:new child.Uint8Array([2,3]),timestamp:4,type:'key'}),dest=new w.Uint8Array(2);w.EncodedAudioChunk.prototype.copyTo.call(chunk,dest);assert.deepEqual([...dest],[2,3]);const color=new child.VideoColorSpace({matrix:'rgb'}),json=w.VideoColorSpace.prototype.toJSON.call(color);assert.equal(Object.getPrototypeOf(json),w.Object.prototype);assert.equal(json.matrix,'rgb');assert.throws(()=>w.EncodedVideoChunk.prototype.copyTo.call(chunk,dest),{name:'TypeError',message:'Illegal invocation'});
});

test('real MessagePorts carry immutable encoded bytes with genuine receiving brands',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`new Promise(resolve=>{const channel=new MessageChannel(),bytes=new Uint8Array([7,8]),chunk=new EncodedVideoChunk({data:bytes,timestamp:1,type:'delta'});channel.port2.onmessage=event=>{const data=new Uint8Array(2);event.data.chunk.copyTo(data);resolve({brand:event.data.chunk instanceof EncodedVideoChunk,alias:event.data.chunk===event.data.again,bytes:[...data]});channel.port1.close();channel.port2.close()};channel.port1.postMessage({chunk,again:chunk});bytes.fill(0)})`);assert.deepEqual(plain(actual),{brand:true,alias:true,bytes:[7,8]});
});

test('actual worker threads construct and round-trip encoded bytes through the platform codec',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`new Promise((resolve,reject)=>{const source='onmessage=event=>{const received=event.data;const bytes=new Uint8Array(received.byteLength);received.copyTo(bytes);const reply=new EncodedAudioChunk({data:bytes,timestamp:received.timestamp+1,type:received.type});postMessage({reply,brand:received instanceof EncodedVideoChunk,color:new VideoColorSpace({matrix:"rgb"}).matrix})}',url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(url),timer=setTimeout(()=>{worker.terminate();reject(Error('worker deadline'))},5000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message))};worker.onmessage=e=>{clearTimeout(timer);const bytes=new Uint8Array(e.data.reply.byteLength);e.data.reply.copyTo(bytes);resolve({inputBrand:e.data.brand,outputBrand:e.data.reply instanceof EncodedAudioChunk,bytes:[...bytes],timestamp:e.data.reply.timestamp,color:e.data.color});worker.terminate();URL.revokeObjectURL(url)};worker.postMessage(new EncodedVideoChunk({data:new Uint8Array([9,8,7]),timestamp:10,type:'key'}))})`);assert.deepEqual(plain(actual),{inputBrand:true,outputBrand:true,bytes:[9,8,7],timestamp:11,color:'rgb'});
});

test('private transfer snapshots and platform brands ignore later authored intrinsic replacements',async t=>{
 const {page}=await fixture(t);const actual=await page.evaluate(`(()=>{const symbol=Symbol.iterator,originalIterator=Array.prototype[symbol],get=WeakMap.prototype.get,set=WeakMap.prototype.set,originalArray=Array,originalSymbol=Symbol,originalApply=Reflect.apply,buffer=new ArrayBuffer(2),bytes=new Uint8Array(buffer);bytes[0]=7;const transfer={*[symbol](){yield buffer}};let result;try{Array.prototype[symbol]=function(){throw Error('private iterator exposed')};WeakMap.prototype.get=WeakMap.prototype.set=()=>{throw Error('private brand exposed')};globalThis.Array=function(){throw Error('Array replacement')};globalThis.Symbol={};Reflect.apply=()=>{throw Error('apply replacement')};const chunk=new EncodedVideoChunk({data:bytes,timestamp:1,type:'key',transfer}),dest=new Uint8Array(2);chunk.copyTo(dest);result={byte:dest[0],length:chunk.byteLength,detached:buffer.detached,color:new VideoColorSpace({matrix:'rgb'}).matrix}}finally{Array=originalArray;Symbol=originalSymbol;Reflect.apply=originalApply;Array.prototype[symbol]=originalIterator;WeakMap.prototype.get=get;WeakMap.prototype.set=set}return result})()`);assert.deepEqual(plain(actual),{byte:7,length:2,detached:true,color:'rgb'});
});
