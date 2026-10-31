import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld,canonicalUtilityValue} from '../src/isolated-world.js';
import {platformFactoryRecord} from '../src/platform-factories.js';
import {directEventTargetImplementation,eventTargetImplementation} from '../src/dom-event-target-state.js';

const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
async function fixture(t){const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body><button id="owned">actual</button>');const world=createIsolatedWorld(page.dom.window,{name:'node-target-binding',signal:page.documentAbort.signal});t.after(()=>world.dispose());return{page,world,w:page.dom.window};}

test('genuine utility Node factories keep one backend across generated converters, provenance and canonical main wrappers',async t=>{
 const{world,w}=await fixture(t);
 const nodes=world.evaluate(`(()=>{const d=document.implementation.createDocument(null,'root');const e=d.createElement('child');d.documentElement.append(e);const text=d.createTextNode('real');e.append(text);return[d,d.documentElement,e,text]})()`);
 for(const value of nodes){const implementation=world.implementationFor(value),canonical=canonicalUtilityValue(value);assert.ok(implementation);assert.equal(utils.implForWrapper(value),implementation);assert.equal(utils.implForWrapper(canonical),implementation);assert.equal(platformFactoryRecord(value).implementation,implementation);assert.equal(platformFactoryRecord(canonical).implementation,implementation);assert.equal(value[utils.implSymbol],implementation);assert.equal(canonical[utils.implSymbol],implementation);assert.equal(eventTargetImplementation(value),implementation);assert.equal(directEventTargetImplementation(value),undefined);assert.equal(directEventTargetImplementation(canonical),undefined);assert.equal(world.wrap(canonical),value);assert.notEqual(value,canonical);}
 const canonical=canonicalUtilityValue(nodes[0]);assert.equal(canonical instanceof w.XMLDocument,true);assert.equal(canonical.documentElement.firstChild.textContent,'real');canonical.documentElement.firstChild.textContent='changed';assert.equal(nodes[2].textContent,'changed');
});

test('main-to-utility Node wrapping keeps generated storage while genuine direct EventTargets stay private',async t=>{
 const{world,w}=await fixture(t),node=w.document.getElementById('owned'),backend=utils.implForWrapper(node),wrapped=world.wrap(node);
 assert.equal(utils.implForWrapper(wrapped),backend);assert.equal(wrapped[utils.implSymbol],backend);assert.equal(platformFactoryRecord(wrapped).implementation,backend);assert.equal(directEventTargetImplementation(wrapped),undefined);assert.equal(eventTargetImplementation(wrapped),backend);assert.equal(canonicalUtilityValue(wrapped),node);assert.equal(utils.wrapperForImpl(backend),node);
 let seen;wrapped.addEventListener('owned',event=>{seen=event.target});node.dispatchEvent(new w.Event('owned'));assert.equal(seen,wrapped);
 const direct=world.evaluate('new EventTarget()'),directBackend=utils.implForWrapper(direct);assert.ok(directBackend);assert.equal(directEventTargetImplementation(direct),directBackend);assert.equal(direct[utils.implSymbol],undefined);assert.deepEqual(Reflect.ownKeys(direct),[]);assert.equal(directEventTargetImplementation(canonicalUtilityValue(direct)),directBackend);
 const fake=world.evaluate('Object.create(EventTarget.prototype)');Object.defineProperty(fake,utils.implSymbol,{value:directBackend});const add=world.global.EventTarget.prototype.addEventListener;assert.throws(()=>add.call(fake,'owned',()=>{}),error=>error instanceof world.global.TypeError);assert.equal(utils.implForWrapper(fake),null);
});
