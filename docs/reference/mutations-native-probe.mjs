// Public API observations only; no target production source is read.
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { writeFile } from 'node:fs/promises';
const browser=await startReference('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');let client;
try{
 client=await connect(browser.endpoint);const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});
 const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
 await client.send('Page.navigate',{url:'data:text/html,<body></body>'},sessionId);
 const r=await client.send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async()=>{
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0)),out={};
  {const log=[],parent=document.createElement('div');document.body.append(parent);const mo=new MutationObserver(()=>log.push('mutation'));mo.observe(parent,{childList:true});Promise.resolve().then(()=>log.push('promise'));parent.append(document.createElement('i'));await tick();mo.disconnect();out.emptyCheckpoint=log;}
  {const log=[],a=document.createElement('div'),b=document.createElement('div');const first=new MutationObserver(()=>log.push('first')),second=new MutationObserver(()=>log.push('second'));first.observe(a,{attributes:true});second.observe(b,{attributes:true});b.id='b';a.id='a';await tick();first.disconnect();second.disconnect();out.reverseFirstMutation=log;}
  {const root=document.createElement('div'),child=document.createElement('i'),text=document.createTextNode('old');child.append(text);root.append(child);document.body.append(root);const batches=[];const mo=new MutationObserver(records=>batches.push(records.map(r=>[r.type,r.target===child?'child':r.target===text?'text':'root',r.oldValue])));mo.observe(root,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true,characterDataOldValue:true});child.remove();child.id='removed';text.data='new';await tick();child.id='after';await tick();mo.disconnect();out.transients=batches;}
  {const root=document.createElement('div'),child=document.createElement('i');root.append(child);const batches=[];const mo=new MutationObserver(records=>batches.push(records.map(r=>[r.type,r.attributeName])));mo.observe(root,{subtree:true,attributes:true});child.remove();await tick();child.id='after';await tick();mo.disconnect();out.attributesOnlyRemoval=batches;}
  {const log=[],t=document.createElement('div');const mo=new MutationObserver(()=>log.push('mutation'));mo.observe(t,{attributes:true});t.id='a';mo.takeRecords();Promise.resolve().then(()=>log.push('promise'));t.id='b';await tick();mo.disconnect();out.takeRecordsToken=log;}
  return out;
 })()`},sessionId);
 if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));const json=JSON.stringify(r.result.value,null,2)+'\n';console.log(json);if(process.argv[2])await writeFile(process.argv[2],json,{flag:'wx'});
}finally{await client?.close();await browser.close();}
