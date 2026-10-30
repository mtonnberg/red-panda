import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { Browser } from '../../src/browser.js';

const binary = '/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const expression = `(() => {
  const out = {}, form = document.createElement('form');
  form.innerHTML = '<input id="identifier" name="user" value="one"><input name="choice" type="radio" value="a"><input name="choice" type="radio" value="b" checked><input name="action" value="shadow"><input name="submit" value="method">';
  document.body.append(form);
  const describe = value => {
    if (value === undefined) return {type:'undefined'};
    if (value === null) return {type:'null'};
    if (value instanceof Element) return {type:'element',tag:value.tagName,name:value.getAttribute('name'),id:value.id};
    if (value instanceof RadioNodeList) return {type:'radios',length:value.length,value:value.value};
    return {type:typeof value,value:typeof value==='function'?value.name:value};
  };
  const descriptor = (target, key) => {
    const d = Object.getOwnPropertyDescriptor(target,key);
    return d ? {value:describe(d.value),enumerable:d.enumerable,configurable:d.configurable,writable:d.writable} : null;
  };
  out.initial = {user:describe(form.user),identifier:describe(form.identifier),choice:describe(form.choice),
    action:describe(form.action),submit:describe(form.submit),own:Object.hasOwn(form,'user'),present:'user' in form,
    descriptor:descriptor(form,'user'),keys:Object.keys(form),
    ownNames:Reflect.ownKeys(form).filter(k=>typeof k==='string')};
  const controls = form.elements;
  out.collection = {user:describe(controls.user),choice:describe(controls.choice),own:Object.hasOwn(controls,'user'),
    descriptor:descriptor(controls,'user'),keys:Object.keys(controls)};
  out.indexed = [];
  for (const target of [form, controls]) {
    const before=descriptor(target,'0'); target[0]='assigned-index';
    const assigned={value:describe(target[0]),descriptor:descriptor(target,'0'),keys:Object.keys(target),names:Object.getOwnPropertyNames(target)};
    const deleted=delete target[0];
    let strictAssignment;try{(function(){'use strict';target[0]='strict-index';})();strictAssignment='accepted';}catch(error){strictAssignment=error.name;}
    let defined;try{defined=Reflect.defineProperty(target,'0',{value:'defined-index',configurable:true});}catch(error){defined=error.name;}
    const afterDefinition=describe(target[0]);delete target[0];
    out.indexed.push({before,assigned,deleted,strictAssignment,defined,afterDefinition,restored:describe(target[0])});
  }
  controls.user='assigned-control';
  out.collectionAssignment={value:describe(controls.user),descriptor:descriptor(controls,'user'),keys:Object.keys(controls),names:Object.getOwnPropertyNames(controls)};
  delete controls.user; out.collectionRestored=describe(controls.user);
  form.user = 'assigned'; out.assignment = {value:describe(form.user),descriptor:descriptor(form,'user')};
  out.deletion = delete form.user; out.afterDelete = describe(form.user);
  Object.defineProperty(form,'user',{value:'defined',enumerable:true,configurable:true,writable:true});
  out.defined = {value:describe(form.user),descriptor:descriptor(form,'user')}; delete form.user;
  const user = form.querySelector('[name=user]'); user.name='renamed';
  out.renamed = {old:describe(form.user),current:describe(form.renamed),oldPresent:'user' in form};
  user.remove(); out.removed = {old:describe(form.user),current:describe(form.renamed),oldPresent:'user' in form};
  const detached = document.createElement('form');
  detached.innerHTML='<fieldset name="fs"><input name="q" form="missing" value="x"></fieldset><output name="out">text</output><object name="obj"></object><input type="image" name="img">';
  const input=detached.querySelector('input');
  const state=()=>({owner:input.form===detached,tags:[...detached.elements].map(e=>e.tagName),
    q:describe(detached.q),fieldset:describe(detached.fs),image:describe(detached.img),
    data:[...new FormData(detached)]});
  out.detached=state(); document.body.append(detached); out.connected=state(); detached.remove(); out.detachedAgain=state();
  return out;
})()`;
const reference = await startReference(binary);
let client, browser;
try {
  client = await connect(reference.endpoint);
  const {targetId} = await client.send('Target.createTarget',{url:'about:blank'});
  const {sessionId} = await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Page.navigate',{url:'data:text/html,<body></body>'},sessionId);
  const native = await client.send('Runtime.evaluate',{expression,returnByValue:true},sessionId);
  if (native.exceptionDetails) throw new Error(JSON.stringify(native.exceptionDetails));
  browser = new Browser(); const page=browser.createPage(); await page.navigate('data:text/html,<body></body>');
  const candidate=JSON.parse(JSON.stringify(page.evaluate(expression)));
  const result={schemaVersion:1,scope:'Bounded form named properties and disconnected association; not full form conformance.',
    binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),node:process.version,
    expression,native:native.result.value,candidate};
  const json=JSON.stringify(result,null,2)+'\n';
  if(process.argv[2])await writeFile(process.argv[2],json,{flag:'wx'}); console.log(json);
} finally { await client?.close(); await reference.close(); await browser?.close(); }
