import{test}from'node:test';import assert from'node:assert/strict';
import{Browser}from'../src/browser.js';import{getHeapBinding}from'../src/native-heap.js';
const binding=getHeapBinding(),apply=Reflect.apply,descriptor=Object.getOwnPropertyDescriptor;
function actualRealm(value,anchor){const prototype=Object.getPrototypeOf(value);try{for(let i=0;i<2;i++){assert.equal(binding.sameRealm(value,anchor),true);assert.equal(binding.sameRealm(value,{}),false);assert.equal(binding.creationGlobal(value),binding.creationGlobal(anchor));Object.setPrototypeOf(value,null)}}finally{Object.setPrototypeOf(value,prototype)}}
async function fixture(t){const browser=new Browser();t.after(()=>browser.close());const page=browser.createPage();await page.navigate('data:text/html,'+encodeURIComponent('<style>.chosen{display:none}@media(max-width:1000px){p{display:block}}</style><p class=chosen>Real text</p>'));const w=page.dom.window,sheet=w.document.querySelector('style').sheet,style=sheet.cssRules[0],media=sheet.cssRules[1];return{browser,page,w,sheet,style,media,anchor:w.Object.prototype}}

test('private CSS scalar getters setters and methods have actual selected-VM creation contexts before and after null prototypes',async t=>{
 const{sheet,style,media,anchor}=await fixture(t);const members=[];
 for(const[object,name]of[[sheet,'cssRules'],[sheet,'disabled'],[style,'selectorText'],[media,'conditionText'],[media.media,'mediaText']]){const own=descriptor(object,name);assert.ok(own?.get,name);members.push(own.get);if(own.set)members.push(own.set)}
 members.push(media.media.appendMedium,media.media.deleteMedium);for(const value of members)actualRealm(value,anchor);
});

test('CSS field bridges reject forged and proxied receivers before conversion with actual source-VM TypeErrors',async t=>{
 const{w,sheet,style,media,anchor}=await fixture(t);let reads=0;const conversion={toString(){reads++;throw Error('authored conversion')}},proxy=value=>new Proxy(value,{get(){reads++;throw Error('authored get')},getOwnPropertyDescriptor(){reads++;throw Error('authored descriptor')},ownKeys(){reads++;throw Error('authored keys')}});
 const entries=[[descriptor(sheet,'cssRules').get,sheet,[]],[descriptor(sheet,'disabled').get,sheet,[]],[descriptor(style,'selectorText').get,style,[]],[descriptor(style,'selectorText').set,style,[conversion]],[descriptor(media,'conditionText').get,media,[]],[descriptor(media.media,'mediaText').set,media.media,[conversion]],[media.media.appendMedium,media.media,[conversion]]];
 for(const[fn,real,args]of entries)for(const fake of[{},Object.create(Object.getPrototypeOf(real)),Object.create(real),proxy(real)]){let error;try{apply(fn,fake,args)}catch(value){error=value}assert.ok(error instanceof w.TypeError);assert.equal(error.message,'Illegal invocation');actualRealm(error,anchor)}
 assert.equal(reads,0);
});

test('real CSS field changes retain their actual objects and declaration state across private reader publication',async t=>{
 const{w,sheet,style,media}=await fixture(t),rules=sheet.cssRules,list=media.media;
 style.selectorText='.changed';assert.equal(sheet.cssRules,rules);assert.equal(rules[0],style);assert.equal(style.selectorText,'.changed');
 sheet.disabled=true;assert.equal(sheet.disabled,true);sheet.disabled=false;assert.equal(sheet.disabled,false);
 list.mediaText='screen, print';list.appendMedium('speech');assert.equal(media.conditionText,'screen, print, speech');list.deleteMedium('print');assert.equal(media.media,list);assert.equal(list.mediaText,'screen, speech');media.conditionText='all';assert.equal(list.mediaText,'all');
 const setter=descriptor(style,'selectorText').set;let calls=0;apply(setter,style,[{toString(){calls++;return'p'}}]);assert.equal(calls,1);assert.equal(style.selectorText,'p');
 const target=w.document.querySelector('p');assert.equal(w.getComputedStyle(target).display,'none');style.style.display='block';assert.equal(style.style.display,'block');assert.equal(w.getComputedStyle(target).display,'block');
});
