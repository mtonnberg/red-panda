import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {Browser} from '../src/browser.js';
import {encodeRGBAPNG} from '../src/png.js';
import {platformFactoryRecord,subscribePlatformFactories} from '../src/platform-factories.js';
import {subtreeDefinitelyAbsent,IMAGE_SUBTREE,TRACK_SUBTREE,FORM_CANDIDATE_SUBTREE} from '../src/subtree-feature-index.js';
const require=createRequire(import.meta.url),{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const HTML='http://www.w3.org/1999/xhtml',ALL=IMAGE_SUBTREE|TRACK_SUBTREE|FORM_CANDIDATE_SUBTREE;
const implementation=value=>{const record=platformFactoryRecord(value);assert.ok(record?.implementation,'actual canonical factory record');return record.implementation;};
const absent=(value,bit)=>subtreeDefinitelyAbsent(implementation(value),bit);
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(t){
 const requests=[],png=encodeRGBAPNG(13,7,new Uint8Array(13*7*4));
 const server=http.createServer((q,s)=>{requests.push(q.url);if(q.url.endsWith('.png')){s.setHeader('content-type','image/png');s.end(png);}else if(q.url.endsWith('.vtt')){s.setHeader('content-type','text/vtt');s.end('WEBVTT\n\n00:00.000 --> 00:01.000\nactual cue\n');}else{s.setHeader('content-type','text/html');s.end('<!doctype html><body>real subtree membership controls');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const browser=new Browser({timeout:2000,loadResources:['iframe','image']}),page=browser.createPage();
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 await page.navigate(origin+'/');return{browser,page,w:page.dom.window,origin,requests};
}
function resourceEvent(target){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('real resource did not settle')),2000);for(const type of ['load','error'])target.addEventListener(type,event=>{clearTimeout(timer);resolve(event);},{once:true});});}
function defineControl(w,name='absence-control'){
 w.eval(`globalThis.Control=class extends HTMLElement{static formAssociated=true;constructor(){super();this.i=this.attachInternals();this.events=[];}formAssociatedCallback(form){this.events.push(form?.id??null);}};customElements.define(${JSON.stringify(name)},Control);`);
 return w.Control;
}

test('canonical empty typed nodes preserve absence through bottom-up ordinary construction',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document;let root=d.createElement('div');assert.equal(absent(root,ALL),true);
 for(let n=0;n<128;n++){const next=d.createElement('div');next.append(root);root=next;assert.equal(absent(root,ALL),true);}
 assert.equal(root.querySelectorAll('div').length,128);
 for(const node of [d.createTextNode('real'),d.createComment('real'),d.createDocumentFragment(),d.createElementNS(HTML,'div'),d.createElementNS('http://www.w3.org/2000/svg','div')])assert.equal(absent(node,ALL),true);
 const custom=d.createElement('absence-not-defined');assert.equal(absent(custom,FORM_CANDIDATE_SUBTREE),false);assert.equal(absent(custom,IMAGE_SUBTREE|TRACK_SUBTREE),true);
 assert.equal(absent(d.createElement('img'),IMAGE_SUBTREE),false);assert.equal(absent(d.createElement('track'),TRACK_SUBTREE),false);
 const factory=require('jsdom/lib/jsdom/living/generated/HTMLDivElement.js'),shell=factory.new(w);
 assert.equal(subtreeDefinitelyAbsent(shell,ALL),false,'uninitialized generated .new never grants absence');
});

test('all four raw canonical insertion entries invalidate the actual ancestor path before returning',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document;
 for(const method of ['appendChild','prependChild','insertBefore','insertAfter']){
  const outer=d.createElement('div'),parent=d.createElement('div'),reference=d.createElement('span'),image=d.createElement('img');outer.append(parent);parent.append(reference);
  assert.equal(absent(outer,ALL),true);const p=implementation(parent),r=implementation(reference),i=implementation(image);
  domSymbolTree[method](method==='insertBefore'||method==='insertAfter'?r:p,i);
  assert.equal(absent(parent,IMAGE_SUBTREE),false,method);assert.equal(absent(outer,IMAGE_SUBTREE),false,method);assert.equal(absent(outer,TRACK_SUBTREE|FORM_CANDIDATE_SUBTREE),true,method);
  domSymbolTree.remove(i);assert.equal(absent(outer,IMAGE_SUBTREE),false,'removal retains conservative facts');assert.equal(image.parentNode,null);
 }
});

test('late successful factory setup with genuine children remains unknown and takes original feature paths',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document;defineControl(w);const image=d.createElement('img'),track=d.createElement('track'),control=new w.Control(),video=d.createElement('video');video.append(track);
 let entered=0;const unsubscribe=subscribePlatformFactories((value,record)=>{if(record.kind!=='HTMLDivElement'||entered)return;entered++;value.append(image,video,control);});
 let container;try{container=d.createElement('div');}finally{unsubscribe();}
 assert.equal(entered,1);assert.equal(container.childNodes.length,3);assert.equal(absent(container,ALL),false,'class does not prove an already nonempty subtree absent');
 const form=d.createElement('form');form.id='late';d.body.append(form);form.append(container);
 assert.equal(control.i.form,form);assert.equal(video.textTracks[0],track.track);assert.equal(image.ownerDocument,d);assert.deepEqual(plain(control.events),['late']);
 const event=resourceEvent(image);image.src='/late.png';assert.equal((await event).type,'load');assert.equal(image.naturalWidth,13);
});

test('real image resources and source-only picture mutations preserve loading and reconciliation',{timeout:8000},async t=>{
 const{w,origin,requests}=await fixture(t),d=w.document,container=d.createElement('div'),picture=d.createElement('picture'),image=d.createElement('img');container.append(picture);assert.equal(absent(container,ALL),true);
 picture.append(image);assert.equal(absent(container,IMAGE_SUBTREE),false);d.body.append(container);
 let loaded=resourceEvent(image);image.src='/first.png';let event=await loaded;assert.equal(event.type,'load');assert.equal(event.isTrusted,true);assert.equal(event.target,image);assert.equal(image.naturalWidth,13);assert.equal(image.naturalHeight,7);
 const source=d.createElement('source');source.srcset='/selected.png 1x';assert.equal(absent(source,IMAGE_SUBTREE),true);
 loaded=resourceEvent(image);picture.insertBefore(source,image);assert.equal((await loaded).type,'load');assert.equal(image.currentSrc,origin+'/selected.png');
 loaded=resourceEvent(image);source.remove();assert.equal((await loaded).type,'load');assert.equal(image.currentSrc,origin+'/first.png');assert.ok(requests.includes('/selected.png'));
});

test('real track resources and live media membership survive cached-negative parents and moves',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document,container=d.createElement('div'),video=d.createElement('video'),audio=d.createElement('audio'),track=d.createElement('track');container.append(video);assert.equal(absent(container,ALL),true);
 video.append(track);assert.equal(absent(container,TRACK_SUBTREE),false);d.body.append(container,audio);track.track.mode='hidden';const loaded=resourceEvent(track);track.src='/actual.vtt';const event=await loaded;
 assert.equal(event.type,'load');assert.equal(event.isTrusted,true);assert.equal(track.readyState,2);assert.equal(track.track.cues[0].text,'actual cue');const held=track.track;
 audio.append(track);assert.equal(video.textTracks.length,0);assert.equal(audio.textTracks[0],held);assert.equal(absent(audio,TRACK_SUBTREE),false);track.remove();assert.equal(audio.textTracks.length,0);assert.equal(absent(audio,TRACK_SUBTREE),false);
});

test('undefined autonomous candidates remain potential through definition, disconnected upgrade and synchronous callbacks',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document,form=d.createElement('form'),holder=d.createElement('div'),pending=d.createElement('absence-upgrade');form.id='first';form.append(holder);d.body.append(form);
 assert.equal(absent(holder,ALL),true);holder.append(pending);assert.equal(absent(holder,FORM_CANDIDATE_SUBTREE),false);
 w.eval(`customElements.define('absence-upgrade',class extends HTMLElement{static formAssociated=true;constructor(){super();this.i=this.attachInternals();this.events=[];}formAssociatedCallback(form){this.events.push(form?.id??null);}});`);
 assert.equal(pending.i.form,form);assert.deepEqual(plain(pending.events),['first']);form.id='renamed';assert.equal(pending.i.form,form);
 const disconnected=d.createElement('absence-later'),subtree=d.createElement('div');subtree.append(disconnected);
 w.eval(`customElements.define('absence-later',class extends HTMLElement{static formAssociated=true;constructor(){super();this.i=this.attachInternals();}formAssociatedCallback(form){globalThis.callbackSawParent=this.parentNode;}});`);
 w.customElements.upgrade(subtree);assert.ok(disconnected.i);holder.append(subtree);assert.equal(disconnected.i.form,form);assert.equal(w.callbackSawParent,subtree);assert.equal(absent(holder,FORM_CANDIDATE_SUBTREE),false);
 pending.setAttribute('form','external-target');assert.equal(pending.i.form,null);const external=d.createElement('form');external.id='external-target';assert.equal(absent(external,ALL),true);d.body.append(external);assert.equal(pending.i.form,external);assert.equal(plain(pending.events).at(-1),'external-target','global form sync still runs for an inserted negative subtree');
});

test('author construction may insert itself and real children before constructor return without a stale zero',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document,form=d.createElement('form');form.id='constructor';d.body.append(form);w.constructorForm=form;
 w.eval(`globalThis.SelfControl=class extends HTMLElement{static formAssociated=true;constructor(){super();this.i=this.attachInternals();this.events=[];constructorForm.append(this);this.append(document.createElement('img'));}formAssociatedCallback(form){this.events.push(form?.id??null);}};customElements.define('absence-self',SelfControl);globalThis.selfControl=new SelfControl();`);
 const control=w.selfControl;assert.equal(control.i.form,form);assert.equal(control.firstChild.localName,'img');assert.equal(absent(control,IMAGE_SUBTREE),false);assert.equal(absent(form,FORM_CANDIDATE_SUBTREE|IMAGE_SUBTREE),false);assert.deepEqual(plain(control.events),['constructor']);
 w.eval(`customElements.define('absence-bad',class extends HTMLElement{static formAssociated=true;constructor(){super();throw Error('actual constructor failure');}});`);
 const failed=d.createElement('absence-bad');assert.equal(absent(failed,FORM_CANDIDATE_SUBTREE),true,'failed fallback is the genuine specialized HTMLUnknownElement backend');const holder=d.createElement('div');holder.append(failed);assert.equal(failed.parentNode,holder);
});

test('fragment, template, clone and shadow moves preserve actual light-tree feature discovery',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document,holder=d.createElement('div'),template=d.createElement('template');assert.equal(absent(holder,ALL),true);
 template.innerHTML='<div><img><video><track></video><absence-later-shadow></absence-later-shadow></div>';const clone=template.content.cloneNode(true);holder.append(clone);assert.equal(clone.childNodes.length,0);assert.equal(absent(holder,IMAGE_SUBTREE),false);assert.equal(absent(holder,TRACK_SUBTREE),false);assert.equal(absent(holder,FORM_CANDIDATE_SUBTREE),false);
 const host=d.createElement('div'),root=host.attachShadow({mode:'open'}),video=d.createElement('video'),track=d.createElement('track');video.append(track);root.append(video);
 assert.equal(root.querySelector('track'),track);assert.equal(video.textTracks[0],track.track);assert.equal(absent(root,TRACK_SUBTREE),false);assert.equal(absent(host,TRACK_SUBTREE),true,'the unchanged collectors follow light DOM, not shadow descendants');
 root.append(holder);assert.equal(absent(root,IMAGE_SUBTREE),false);assert.equal(holder.getRootNode(),root);d.body.append(host);
});

test('real cross-document adoption, import and retained frame documents keep backend membership',{timeout:8000},async t=>{
 const{w,origin}=await fixture(t),d=w.document,frame=d.createElement('iframe');let loaded=resourceEvent(frame);frame.src=origin+'/child/';d.body.append(frame);assert.equal((await loaded).type,'load');
 const child=frame.contentWindow,oldDocument=child.document,container=d.createElement('div'),video=d.createElement('video'),track=d.createElement('track'),image=d.createElement('img');video.append(track);container.append(video,image);const original=implementation(container),heldTrack=track.track;
 defineControl(w,'absence-adopted');const control=new w.Control();container.append(control);const childForm=oldDocument.createElement('form');childForm.id='child-form';oldDocument.body.append(childForm);
 oldDocument.adoptNode(container);childForm.append(container);assert.equal(control.i.form,childForm);assert.deepEqual(plain(control.events),['child-form']);assert.equal(absent(container,FORM_CANDIDATE_SUBTREE),false);assert.equal(container.ownerDocument,oldDocument);assert.equal(implementation(container),original);assert.equal(video.textTracks[0],heldTrack);assert.equal(absent(container,IMAGE_SUBTREE|TRACK_SUBTREE),false);
 const imported=d.importNode(container,true);assert.equal(imported.ownerDocument,d);assert.equal(absent(imported,IMAGE_SUBTREE),false);assert.equal(absent(imported,TRACK_SUBTREE),false);
 loaded=resourceEvent(frame);frame.src=origin+'/next/';assert.equal((await loaded).type,'load');assert.notEqual(frame.contentDocument,oldDocument);
 const retainedParent=oldDocument.createElement('div'),retainedImage=oldDocument.createElement('img');assert.equal(absent(retainedParent,ALL),true);retainedParent.append(retainedImage);assert.equal(retainedImage.ownerDocument,oldDocument);assert.equal(absent(retainedParent,IMAGE_SUBTREE),false);frame.remove();assert.equal(retainedParent.firstChild,retainedImage);
});

test('namespace and customized built-in definitions cannot turn a specialized negative into an autonomous control',{timeout:8000},async t=>{
 const{w}=await fixture(t),d=w.document;w.eval(`customElements.define('absence-input',class extends HTMLInputElement{static formAssociated=true;constructor(){super();this.events=[];}formAssociatedCallback(form){this.events.push(form);}},{extends:'input'});`);
 const input=d.createElement('input',{is:'absence-input'}),form=d.createElement('form');input.name='actual';input.value='builtin';form.append(input);d.body.append(form);
 assert.equal(absent(input,FORM_CANDIDATE_SUBTREE),true);assert.equal(input.form,form);assert.deepEqual(plain(input.events),[]);assert.deepEqual([...new w.FormData(form)],[['actual','builtin']]);
 const foreign=d.createElementNS('urn:actual','absence-not-defined');assert.equal(absent(foreign,FORM_CANDIDATE_SUBTREE),true);const holder=d.createElement('div');holder.append(foreign);defineControl(w,'absence-not-defined');assert.equal(foreign.namespaceURI,'urn:actual');assert.equal(foreign instanceof w.Control,false);assert.equal(absent(holder,FORM_CANDIDATE_SUBTREE),true);
});
