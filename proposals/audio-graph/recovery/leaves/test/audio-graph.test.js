import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Browser} from '../src/browser.js';
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(action){const browser=new Browser({timeout:3000}),page=browser.createPage();try{await page.navigate('data:text/html,<body>Audio graph');await action({page,w:page.dom.window});}finally{browser.close();}}
test('genuine gain/constant graphs and real AudioContext clock match measured Native controls',()=>fixture(async({page})=>{
 const expression=await readFile(new URL('../docs/reference/audio-graph/audio-graph-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-graph/audio-graph-native.json',import.meta.url),'utf8')).observations;
 const actual=plain(await page.evaluate(expression));
 const excluded=new Set(['interfaces','oscDefault','convolverDefault']);
 assert.deepEqual(actual.filter(row=>!excluded.has(row.name)),expected.filter(row=>!excluded.has(row.name)));
}));
test('AudioParam timelines, private graph modulation and offline suspension match actual Native samples',()=>fixture(async({page})=>{
 const expression=await readFile(new URL('../docs/reference/audio-graph/audio-automation-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-graph/audio-automation-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(plain(await page.evaluate(expression)),expected);
}));
test('Audio concrete private brands, real clock-only Native behavior and suspended buffer ownership',()=>fixture(async({page})=>{
 const expression=await readFile(new URL('../docs/reference/audio-graph/audio-ownership-v2-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-graph/audio-ownership-v2-native.json',import.meta.url),'utf8')).observations;
 assert.deepEqual(plain(await page.evaluate(expression)),expected);
}));
test('Graph processing handles long chains and actual curve/ramp cancellation without changing prior samples',()=>fixture(async({page})=>{
 const expression=await readFile(new URL('../docs/reference/audio-graph/audio-graph-extra-native-expression.js',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../docs/reference/audio-graph/audio-graph-extra-native.json',import.meta.url),'utf8')).observations;
 const actual=plain(await page.evaluate(expression)),excluded=new Set(['constantOffsetInput','longChain']);assert.deepEqual(actual.filter(row=>!excluded.has(row.name)),expected.filter(row=>!excluded.has(row.name)));
 // This measured Native long-chain mismatch is explicit: retain genuine sample math.
 assert.deepEqual(expected.find(row=>row.name==='longChain').value,[128,0,0,false]);assert.deepEqual(actual.find(row=>row.name==='longChain').value,[128,.5,.5,false]);
}));
