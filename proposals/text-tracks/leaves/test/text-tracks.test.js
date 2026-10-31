import{test}from'node:test';
import assert from'node:assert/strict';
import http from'node:http';
import{once}from'node:events';
import{types}from'node:util';
import{Browser}from'../src/browser.js';
import{parseWebVTT}from'../src/vtt-parser.js';
async function fixture(t){const browser=new Browser({timeout:2000,loadResources:['iframe']}),page=browser.createPage();t.after(()=>browser.close());await page.navigate('data:text/html,<body>');return{browser,page,w:page.dom.window}}
function nextEvent(element){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Track resource did not settle')),2000);for(const name of['load','error'])element.addEventListener(name,event=>{clearTimeout(timer);resolve(event)},{once:true})})}

test('MediaError is an illegal interface with genuine realm constants and receiver checks',async t=>{
 const{w}=await fixture(t);assert.deepEqual(['MEDIA_ERR_ABORTED','MEDIA_ERR_NETWORK','MEDIA_ERR_DECODE','MEDIA_ERR_SRC_NOT_SUPPORTED'].map(key=>w.MediaError[key]),[1,2,3,4]);
 assert.throws(()=>new w.MediaError(),e=>e instanceof w.TypeError&&e.message==='Illegal Constructor');
 assert.throws(()=>Object.getOwnPropertyDescriptor(w.MediaError.prototype,'code').get.call(Object.create(w.MediaError.prototype)),e=>e instanceof w.TypeError&&e.message==='Illegal invocation');
});
test('cue and region values use actual state, native conversions and genuine realm errors',async t=>{
 const{w}=await fixture(t),c=new w.VTTCue(0,Infinity,'text'),r=new w.VTTRegion();assert.equal(c instanceof w.TextTrackCue,true);assert.equal(c instanceof w.EventTarget,true);assert.equal(c.endTime,Infinity);c.endTime=NaN;assert.equal(Number.isNaN(c.endTime),true);
 c.line='auto';assert.throws(()=>{c.line='17'},w.TypeError);c.line=-5;c.align=Symbol('left');assert.equal(c.align,'left');c.text=Symbol('actual');assert.equal(c.text,'actual');c.region=r;assert.equal(c.region,r);
 assert.throws(()=>{r.width=101},e=>e instanceof w.DOMException&&e.name==='IndexSizeError');r.lines=-1;assert.equal(r.lines,4294967295);r.lines=1n;assert.equal(r.lines,1);assert.throws(()=>{c.startTime=1n},w.TypeError);
 assert.throws(()=>Object.getOwnPropertyDescriptor(w.VTTCue.prototype,'text').get.call(Object.create(w.VTTCue.prototype)),w.TypeError);
});
test('live indexed lists are real ordinary V8 objects with readonly virtual membership',async t=>{
 const{w}=await fixture(t),v=w.document.createElement('video'),l=v.textTracks,a=v.addTextTrack('captions'),b=v.addTextTrack('subtitles');
 assert.equal(l,v.textTracks);assert.equal(types.isProxy(l),false);assert.equal(typeof l,'object');assert.equal(Boolean(l),true);assert.equal(l==null,false);assert.equal(l instanceof w.EventTarget,true);assert.equal(l instanceof w.TextTrackList,true);assert.equal(l[Symbol.iterator],undefined);assert.deepEqual(Object.keys(l),['0','1']);assert.equal(l[0],a);assert.equal(l[1],b);
 assert.equal(Reflect.deleteProperty(l,'0'),true);assert.equal(l[0],a);Object.defineProperty(l,'0',{value:'authored'});assert.equal(l[0],a);assert.deepEqual(Object.getOwnPropertyDescriptor(l,'0'),{value:a,writable:false,enumerable:true,configurable:true});assert.equal(l.getTrackById(''),a);
});
test('cue lists keep genuine stable identities, sorting, movement, disabled state and exact removal errors',async t=>{
 const{w}=await fixture(t),v=w.document.createElement('video'),a=v.addTextTrack('subtitles'),b=v.addTextTrack('metadata'),late=new w.VTTCue(5,6,'late'),early=new w.VTTCue(1,2,'early'),long=new w.VTTCue(1,4,'long');early.id='id';
 a.addCue(late);a.addCue(early);a.addCue(long);const list=a.cues;assert.equal(types.isProxy(list),false);assert.deepEqual(Array.from(list),[long,early,late]);assert.equal(list.getCueById('id'),early);assert.equal(list.getCueById(''),null);
 late.startTime=0;assert.equal(list[0],late);a.addCue(late);assert.equal(list.length,3);a.mode='disabled';assert.equal(a.cues,null);assert.equal(a.activeCues,null);a.mode='showing';assert.equal(a.cues,list);assert.equal(a.activeCues.length,0);
 b.addCue(early);assert.equal(early.track,b);assert.equal(list.length,2);b.removeCue(early);assert.equal(early.track,null);assert.throws(()=>b.removeCue(early),e=>e instanceof w.Error&&e.name==='Error'&&e.message==='NotFoundError');
});
test('real track children precede script-added tracks and follow actual attributes and parent moves',async t=>{
 const{w}=await fixture(t),a=w.document.createElement('video'),b=w.document.createElement('audio'),script=a.addTextTrack('metadata'),e=w.document.createElement('track'),track=e.track;e.id='actual';e.kind='BOGUS';e.label='Label';e.srclang='fr';
 assert.equal(e.kind,'metadata');assert.equal(track.kind,'metadata');assert.equal(track.label,'Label');assert.equal(track.language,'fr');a.append(e);assert.deepEqual(Array.from(a.textTracks),[track,script]);assert.equal(a.textTracks.getTrackById('actual'),track);
 b.append(e);assert.deepEqual(Array.from(a.textTracks),[script]);assert.equal(b.textTracks[0],track);e.remove();assert.equal(b.textTracks.length,0);assert.equal(e.readyState,0);
});
test('cue HTML creates fresh real fragments, supported annotations and inert text for unknown markup',async t=>{
 const{w}=await fixture(t),cue=new w.VTTCue(0,1,'<v  A \t B>x</v><ruby>r<rt>t</rt></ruby><00:01.200><script>must stay text</script>');
 const fragment=cue.getCueAsHTML();assert.equal(fragment instanceof w.DocumentFragment,true);assert.equal(fragment.ownerDocument,w.document);assert.notEqual(fragment,cue.getCueAsHTML());assert.equal(fragment.firstChild.title,'A B');assert.equal(fragment.childNodes[2].nodeType,7);assert.equal(fragment.childNodes[2].data,'00:00:01.200');assert.equal(fragment.querySelector('script'),null);assert.equal(fragment.textContent,'xrtmust stay text');
});
test('authored callbacks use genuine EventTarget dispatch and preserve event-handler slot ordering',async t=>{
 const{w}=await fixture(t),cue=new w.VTTCue(0,1,'x'),calls=[];cue.onenter=function(e){calls.push(['old',this,e])};cue.addEventListener('enter',()=>calls.push(['listener']));cue.onenter=function(e){calls.push(['new',this,e])};const event=new w.Event('enter');cue.dispatchEvent(event);
 assert.deepEqual(calls.map(x=>x[0]),['new','listener']);assert.equal(calls[0][1],cue);assert.equal(calls[0][2],event);assert.equal(event.target,cue);assert.equal(event.isTrusted,false);cue.onenter={handleEvent(){}};assert.equal(cue.onenter,null);
});
test('captured cue/region conversions and DOM producers survive public intrinsic replacement',async t=>{
 const{w}=await fixture(t),TypeError=w.TypeError,Exception=w.DOMException,ArrayIncludes=w.Array.prototype.includes,IsNaN=w.Number.isNaN;
 try{w.Array.prototype.includes=()=>false;w.Number.isNaN=()=>false;w.TypeError=class Fake{};w.DOMException=class Fake{};w.document.createElement=()=>{throw Error('authored')};const c=new w.VTTCue(0,1,'<b>real</b>');c.align='left';assert.equal(c.align,'left');c.text={[w.Symbol.toPrimitive](){return w.Symbol('object')}};assert.equal(c.text,'object');c.text='<b>real</b>';assert.throws(()=>new w.VTTCue(0,NaN,'x'),TypeError);const r=new w.VTTRegion();assert.throws(()=>{r.width=101},Exception);assert.equal(c.getCueAsHTML().firstChild.localName,'b');}finally{w.TypeError=TypeError;w.DOMException=Exception;w.Array.prototype.includes=ArrayIncludes;w.Number.isNaN=IsNaN;}
});
test('actual WebVTT bytes retain CRLF normalization, regions, backwards times and sorted cue data',()=>{
 const parsed=parseWebVTT('\uFEFFWEBVTT\r\n\r\nREGION\r\nid:r\r\nlines:4\r\n\r\nintro\r\n00:01.000 --> 00:00.500 region:r position:20%,line-left size:50%\r\nSecond\r\nline');assert.equal(parsed.cues[0].startTime,1);assert.equal(parsed.cues[0].endTime,.5);assert.equal(parsed.cues[0].text,'Second\nline');assert.equal(parsed.cues[0].region.lines,4);assert.equal(parsed.cues[0].positionAlign,'line-left');assert.throws(()=>parseWebVTT('WEBVTTX\n\n'),SyntaxError);
});
test('Blob resources load asynchronously, produce real cues, and expose trusted resource events',async t=>{
 const{w}=await fixture(t),v=w.document.createElement('video'),e=w.document.createElement('track');e.src=w.URL.createObjectURL(new w.Blob(['WEBVTT\n\n00:00.000 --> 00:01.000\nactual']));e.default=true;const done=nextEvent(e);v.append(e);assert.equal(e.readyState,0);assert.equal(e.track.mode,'disabled');const event=await done;
 assert.equal(event.type,'load');assert.equal(event.isTrusted,true);assert.equal(event.bubbles,false);assert.equal(e.readyState,2);assert.equal(e.track.mode,'showing');assert.equal(e.track.cues[0].text,'actual');assert.equal(e.track.cues[0].track,e.track);
});
test('disabled/no-parent tracks do not load and removal before queued loading produces the measured real error',async t=>{
 const{w}=await fixture(t),e=w.document.createElement('track'),v=w.document.createElement('video');e.src=w.URL.createObjectURL(new w.Blob(['WEBVTT\n\n00:00.000 --> 00:01.000\nx']));e.track.mode='hidden';let count=0;e.addEventListener('load',()=>count++);await new Promise(r=>setTimeout(r,15));assert.equal(count,0);assert.equal(e.readyState,0);const done=nextEvent(e);v.append(e);e.remove();assert.equal((await done).type,'error');assert.equal(e.readyState,3);
});
test('document teardown cancels the actual pending HTTP track request without late load/error delivery',async t=>{
 let response;const received=new Promise(resolve=>{const server=http.createServer((req,res)=>{if(req.url==='/held'){response=res;resolve();return}res.setHeader('Content-Type','text/html');res.end('<body>')});server.listen(0,'127.0.0.1');t.server=server});await once(t.server,'listening');
 t.after(async()=>{response?.destroy();t.server.closeAllConnections();await new Promise(resolve=>t.server.close(resolve))});const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());await page.navigate(`http://127.0.0.1:${t.server.address().port}/`);const w=page.dom.window,v=w.document.createElement('video'),e=w.document.createElement('track');e.src='/held';e.track.mode='hidden';const events=[];e.onload=e.onerror=x=>events.push(x.type);v.append(e);await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('No HTTP request')),2000))]);const closed=once(response,'close');page.close();await closed;assert.equal(response.writableEnded,false);await new Promise(r=>setTimeout(r,15));assert.deepEqual(events,[]);
});
test('real frame-local constructors, lists, errors and fragments belong to the allocating frame',async t=>{
 const{w}=await fixture(t),frame=w.document.createElement('iframe');w.document.body.append(frame);const child=frame.contentWindow,cue=new child.VTTCue(0,1,'<b>child</b>'),region=new child.VTTRegion(),track=child.document.createElement('video').addTextTrack('metadata');cue.region=region;track.addCue(cue);
 assert.notEqual(child.VTTCue,w.VTTCue);assert.equal(cue instanceof child.VTTCue,true);assert.equal(cue instanceof w.VTTCue,false);assert.equal(track.cues instanceof child.TextTrackCueList,true);assert.equal(track.cues[0],cue);assert.equal(cue.region,region);const fragment=cue.getCueAsHTML();assert.equal(fragment instanceof child.DocumentFragment,true);assert.equal(fragment.ownerDocument,child.document);assert.throws(()=>{region.width=-1},e=>e instanceof child.DOMException&&!(e instanceof w.DOMException));
});
