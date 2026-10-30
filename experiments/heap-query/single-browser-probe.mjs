import{createRequire}from'node:module';import{Browser}from'../../src/browser.js';import{runRuntime,resetRuntime}from'../../src/runtime.js';
const require=createRequire(import.meta.url),q=require(process.argv[2]);
const log=x=>console.error(JSON.stringify({stage:x,elapsed:performance.now()}));
log('beforeBrowser');const browser=new Browser();log('beforePage');const page=browser.createPage();log('beforeNavigate');
const s={page,objects:new Map(),worlds:new Map(),remote(value){return{value}},exception(error){return{text:String(error)}}};
try{await page.navigate('data:text/html,<title>stage</title>');log('afterNavigate');const p=page.dom.window.eval('globalThis.p={};globalThis.x=Object.create(p);p');log('beforeInspector');if(process.argv[3]!=='noinspector')await runRuntime(s,'Runtime.globalLexicalScopeNames');log('beforeHeap');const a=q.queryObjects(p);log('afterHeap');console.log(a.length)}finally{log('beforeReset');resetRuntime(s);log('beforeClose');browser.close();log('afterClose')}
