import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';

const expression=await readFile(new URL('../proposals/text-encoder/expression.js',import.meta.url),'utf8');
const native=JSON.parse(await readFile(new URL('../proposals/text-encoder/native.json',import.meta.url))).observation;
const plain=value=>JSON.parse(JSON.stringify(value));

test('TextEncoder method, conversion order, actual bytes and detached output match the pinned native control',t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 assert.deepEqual(plain(page.evaluate(expression)),native);
});

test('encoder branding rejects fake and Proxy receivers without invoking their traps or source conversions',t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 const value=page.evaluate(`(()=>{const real=new TextEncoder(),fake=Object.create(TextEncoder.prototype);for(const key of Reflect.ownKeys(real))Object.defineProperty(fake,key,Object.getOwnPropertyDescriptor(real,key));let traps=0,conversions=0;const proxy=new Proxy(real,{get(){traps++;throw Error('get')},getPrototypeOf(){traps++;throw Error('prototype')}}),source={toString(){conversions++;return 'x'}};const errors=[fake,proxy].map(receiver=>{try{TextEncoder.prototype.encodeInto.call(receiver,source,new Uint8Array(2))}catch(error){return [error.name,error instanceof TypeError]}});return {errors,traps,conversions}})()`);
 assert.deepEqual(plain(value),{errors:[['TypeError',true],['TypeError',true]],traps:0,conversions:0});
});

test('string coercion preserves authored exceptions while result/error creation ignores replaced globals',t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 const value=page.evaluate(`(()=>{const encoder=new TextEncoder(),OriginalObject=Object,OriginalTypeError=TypeError,sentinel={};let preserved=false;try{encoder.encodeInto({[Symbol.toPrimitive](){throw sentinel}},new Uint8Array(1))}catch(error){preserved=error===sentinel}globalThis.Object=function(){throw Error('public Object')};globalThis.TypeError=function(){throw Error('public TypeError')};const result=encoder.encodeInto('a',new Uint8Array(1));let conversion=false;try{encoder.encodeInto({[Symbol.toPrimitive](){return Symbol('bad')}},new Uint8Array(1))}catch(error){conversion=error instanceof OriginalTypeError}return {preserved,conversion,realm:OriginalObject.getPrototypeOf(result)===OriginalObject.prototype,read:result.read,written:result.written}})()`);
 assert.deepEqual(plain(value),{preserved:true,conversion:true,realm:true,read:1,written:1});
});

test('borrowed encoding uses real foreign encoder state and returns the method realm record',t=>{
 const browser=new Browser(),parent=browser.createPage(),child=browser.createPage();t.after(()=>browser.close());
 const encoder=child.evaluate('new TextEncoder()'),destination=child.evaluate('new Uint8Array(3)');
 const result=Reflect.apply(parent.dom.window.TextEncoder.prototype.encodeInto,encoder,['€',destination]);
 assert.equal(result instanceof parent.dom.window.Object,true);assert.equal(result instanceof child.dom.window.Object,false);
 assert.deepEqual(plain(result),{read:1,written:3});assert.deepEqual(Array.from(destination),[226,130,172]);
});
