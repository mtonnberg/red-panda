import {readFile}from'node:fs/promises';
import {Browser}from'../src/browser.js';
import {createFixture}from'./fixture.js';
const server=await createFixture(),browser=new Browser({timeout:10000,loadResources:['iframe','worker']});
try{const page=browser.createPage();await page.navigate(server.url);const expression=await readFile(new URL('../oracle/animations-promises-expression.js',import.meta.url),'utf8');console.log(JSON.stringify(await page.evaluate(expression)));}finally{browser.close();await server.close();}
