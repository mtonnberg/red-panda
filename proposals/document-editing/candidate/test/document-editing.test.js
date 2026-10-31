import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as checkpoint} from 'node:timers/promises';
import {Browser} from '../src/browser.js';
import {createIsolatedWorld} from '../src/isolated-world.js';
import {installUtilitySelection} from '../src/selection.js';
import {installUtilityDocumentEditing} from '../src/document-editing.js';
async function fixture(t){const browser=new Browser({timeout:2000,loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body><div id=h contenteditable>abc</div><input id=i value=hello><textarea id=a>abc</textarea>');const w=page.dom.window,d=w.document;return{browser,page,w,d,h:d.getElementById('h'),i:d.getElementById('i'),a:d.getElementById('a')};}
const plain=x=>JSON.parse(JSON.stringify(x));
test('Document commands use actual named native realm entries and reject forged receivers before authored conversion',async t=>{
 const{w,d,page}=await fixture(t);
 const names=['execCommand','queryCommandSupported','queryCommandEnabled','queryCommandState','queryCommandIndeterm','queryCommandValue'];
 for(const name of names){const f=w.Document.prototype[name];assert.equal(f.length,1);assert.equal(f.name,name);assert.equal(Object.getPrototypeOf(f),w.Function.prototype);assert.equal(Function.prototype.toString.call(f),`function ${name}() { [native code] }`);assert.equal(Object.hasOwn(f,'prototype'),false);assert.throws(()=>new f(),e=>e.name==='TypeError');}
 const result=page.evaluate(`(()=>{let traps=0,conversions=0;const forged=Object.create(Object.getPrototypeOf(document),Object.getOwnPropertyDescriptors(document)),proxy=new Proxy(document,{get(){traps++;throw Error('trap')}}),errors=[];for(const value of[{},forged,proxy,null])try{Document.prototype.execCommand.call(value,{toString(){conversions++;return 'insertText'}})}catch(e){errors.push([e instanceof TypeError,e.message])}const f=document.body.appendChild(document.createElement('iframe')),child=f.contentWindow;let error;try{child.Document.prototype.execCommand.call(document)}catch(e){error=[e instanceof TypeError,e instanceof child.TypeError,e.message]}return{traps,conversions,errors,error}})()`);
 assert.deepEqual(plain(result),{traps:0,conversions:0,errors:Array.from({length:4},()=>[true,'Illegal invocation']),error:[true,false,'invalid argument']});
 assert.equal(d.queryCommandSupported('INSERTTEXT'),true);assert.equal(d.queryCommandSupported('bold'),false);assert.equal(d.execCommand('copy'),false);
 const detached=d.implementation.createHTMLDocument();assert.equal(detached.queryCommandSupported('insertText'),false);
});
test('control commands mutate actual sanitized values, selections and trusted noncancelable input, committing one real change before blur',async t=>{
 const{i,w,d}=await fixture(t),events=[];i.focus();i.setSelectionRange(1,3);
 for(const type of['beforeinput','textInput','input','change','blur','focusout'])i.addEventListener(type,e=>{events.push([type,e.isTrusted,e.cancelable,e.composed,e.data,e.inputType,i.value]);e.preventDefault();});
 assert.equal(d.execCommand('insertText',false,'XY'),true);assert.equal(i.value,'hXYlo');assert.deepEqual([i.selectionStart,i.selectionEnd],[3,3]);assert.equal(events.length,1);assert.deepEqual(events[0],['input',true,false,true,'XY','insertText','hXYlo']);i.blur();assert.deepEqual(events.map(e=>e[0]),['input','change','blur','focusout']);assert.equal(events[1][3],false);
 i.value='abc';i.focus();i.setSelectionRange(0,3);d.execCommand('insertText',false,'XYZ');i.value='abc';const before=events.filter(e=>e[0]==='change').length;i.blur();assert.equal(events.filter(e=>e[0]==='change').length,before);
 i.focus();i.disabled=true;assert.equal(d.queryCommandEnabled('insertText'),false);assert.equal(d.execCommand('insertText',false,'Z'),false);i.disabled=false;i.readOnly=true;assert.equal(d.execCommand('delete'),false);
 const file=d.createElement('input');file.type='file';d.body.append(file);file.focus();assert.equal(d.queryCommandEnabled('insertText'),true);assert.throws(()=>d.execCommand('insertText',false,'X'),e=>e instanceof w.DOMException&&e.name==='InvalidStateError'&&e.message==='The object is in an invalid state');
});
test('textarea streams genuine LF operations while preserving CR normalization and captured target across handler mutations',async t=>{
 const{a,d,i}=await fixture(t);a.value='ab';a.focus();a.setSelectionRange(1,1);const events=[];a.oninput=e=>events.push([e.data,a.value,a.selectionStart]);d.execCommand('insertText',false,'x\r\ny\rz\n');assert.equal(a.value,'ax\n\ny\nz\nb');assert.deepEqual(events,[['x\r','ax\nb',3],[null,'ax\n\nb',4],['y\rz','ax\n\ny\nzb',7],[null,'ax\n\ny\nz\nb',8]]);
 a.value='';a.focus();const data=[];a.oninput=e=>{data.push(e.data);if(data.length===1){a.readOnly=true;a.remove();i.focus();}};assert.equal(d.execCommand('insertText',false,'A\nB'),true);assert.equal(a.value,'A\nB');assert.deepEqual(data,['A',null,'B']);
});
test('UTF16 selection flooring and codepoint deletion preserve actual controls and reject nested command execution',async t=>{
 const{d,i}=await fixture(t);i.focus();i.value='a😀b';i.setSelectionRange(2,2);d.execCommand('delete');assert.equal(i.value,'😀b');assert.equal(i.selectionStart,0);i.value='a😀b';i.setSelectionRange(1,2);d.execCommand('insertText',false,'X');assert.equal(i.value,'aX😀b');assert.equal(i.selectionStart,2);
 i.value='';let nested,enabled;i.oninput=()=>{nested=d.execCommand('insertText',false,'N');enabled=d.queryCommandEnabled('insertText');};assert.equal(d.execCommand('insertText',false,'A'),true);assert.equal(nested,false);assert.equal(enabled,true);assert.equal(i.value,'A');i.oninput=null;
 let inner;assert.equal(d.execCommand('insertText',false,{toString(){inner=d.execCommand('insertText',false,'B');return'C'}}),true);assert.equal(inner,true);assert.equal(i.value,'ABC');
});
test('contenteditable commands preserve real Text/Range identities, inline traversal and measured selection association events',async t=>{
 const{d,h,w}=await fixture(t),s=w.getSelection();const original=h.firstChild;s.collapse(original,1);const old=s.getRangeAt(0),events=[];d.addEventListener('selectionchange',()=>events.push('selection'));h.oninput=e=>events.push(e.inputType);d.execCommand('insertText',false,'X');assert.equal(h.firstChild,original);assert.equal(original.data,'aXbc');assert.notEqual(s.getRangeAt(0),old);assert.deepEqual(events,['selection','insertText']);
 events.length=0;const same=s.getRangeAt(0);d.execCommand('forwardDelete');assert.equal(original.data,'aXc');assert.equal(s.getRangeAt(0),same);assert.deepEqual(events,['deleteContentForward']);
 h.innerHTML='ab<b>cd</b>ef';const a=h.firstChild,b=h.children[0].firstChild,last=h.lastChild;s.setBaseAndExtent(a,1,b,1);d.execCommand('delete');assert.equal(h.innerHTML,'a<b>d</b>ef');assert.equal(h.firstChild,a);assert.equal(h.lastChild,last);assert.equal(s.anchorNode,a);assert.equal(s.anchorOffset,1);
 h.textContent='abc';const retained=h.firstChild;s.selectAllChildren(h);d.execCommand('insertText',false,'');assert.equal(h.innerHTML,'');assert.equal(h.firstChild,retained);assert.equal(s.anchorNode,retained);
});
test('deletion removes exhausted inline nodes, creates real block placeholders and refuses atoms or block merging atomically',async t=>{
 const{d,h,w}=await fixture(t),s=w.getSelection();h.innerHTML='ab<b>c</b>ef';const a=h.firstChild,last=h.lastChild;s.collapse(h.children[0].firstChild,1);d.execCommand('delete');assert.equal(h.innerHTML,'abef');assert.equal(h.firstChild,a);assert.equal(h.lastChild,last);assert.equal(h.childNodes.length,2);assert.equal(s.anchorNode,a);assert.equal(s.anchorOffset,2);
 h.textContent='x';s.collapse(h.firstChild,1);d.execCommand('delete');assert.equal(h.innerHTML,'<br>');assert.equal(s.anchorNode,h);assert.equal(s.anchorOffset,0);
 for(const [html,node,offset,command]of[['a<br>b','last',0,'delete'],['a<img>b','first',1,'forwardDelete'],['<p>ab</p><p>cd</p>','lastp',0,'delete']]){h.innerHTML=html;const n=node==='last'?h.lastChild:node==='first'?h.firstChild:h.lastChild.firstChild;s.collapse(n,offset);let count=0;h.oninput=()=>count++;assert.equal(d.execCommand(command),false);assert.equal(h.innerHTML,html);assert.equal(count,0);}
 h.textContent='abc';s.collapse(h.firstChild,1);assert.equal(d.execCommand('insertText',false,'a\nb'),false);assert.equal(h.textContent,'abc');
});
test('utility and frame document entries retain actual owner documents, shared selection/control backends and caller error realms',async t=>{
 const{page,w,d,i}=await fixture(t),world=createIsolatedWorld(w,{signal:page.documentAbort.signal});t.after(()=>world.dispose());installUtilitySelection(world,w);installUtilityDocumentEditing(world,w);i.focus();i.setSelectionRange(1,3);
 const value=world.evaluate(`JSON.stringify((()=>{const input=document.getElementById('i'),events=[];input.addEventListener('input',e=>events.push([e.target===input,e instanceof InputEvent,e.isTrusted]));return{realm:Object.getPrototypeOf(document.execCommand)===Function.prototype,result:document.execCommand('insertText',false,'U'),value:input.value,events}})())`);assert.deepEqual(JSON.parse(value),{realm:true,result:true,value:'hUlo',events:[[true,true,true]]});assert.equal(i.value,'hUlo');
 const frame=d.body.appendChild(d.createElement('iframe')),child=frame.contentWindow,c=child.document.body.appendChild(child.document.createElement('input'));c.value='frame';c.focus();c.setSelectionRange(0,5);let event;c.oninput=e=>event=e;assert.equal(d.execCommand.call(child.document,'insertText',false,'F'),true);assert.equal(c.value,'F');assert.equal(c.ownerDocument,child.document);assert.equal(event instanceof child.InputEvent,true);assert.equal(event instanceof w.InputEvent,false);
});
test('abandoned listener execution recovers its actual busy guard after the owned deadline and old documents become inactive',async t=>{
 const{page,i,d}=await fixture(t);i.focus();i.value='';page.timeout=35;assert.throws(()=>page.evaluate(`document.getElementById('i').addEventListener('input',()=>{while(true){}},{once:true});document.execCommand('insertText',false,'A')`),e=>/timed out/.test(e.message));await checkpoint();assert.equal(d.execCommand('insertText',false,'B'),true);assert.equal(i.value,'AB');page.timeout=2000;await page.navigate('data:text/html,<body>new');assert.equal(d.queryCommandSupported('insertText'),false);assert.equal(d.execCommand('insertText',false,'late'),false);assert.equal(i.value,'AB');
});
