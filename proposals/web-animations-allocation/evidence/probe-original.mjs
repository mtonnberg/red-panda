import{Browser}from'/workspace/shared/web-animations-current-20261031/src/browser.js';
import{getHeapBinding}from'/workspace/shared/web-animations-current-20261031/src/native-heap.js';
import{writeFile}from'node:fs/promises';
const browser=new Browser({timeout:10000}),page=browser.createPage();
try{await page.navigate('data:text/html,<body>allocation proof</body>');const w=page.dom.window,binding=getHeapBinding(),vm=w.Object.prototype,host={};const animation=w.document.createElement('div').animate();animation.pause();const event=new w.AnimationPlaybackEvent('proof'),ready=animation.ready,finished=animation.finished;
 const targets=[['animation',animation],['playback-event',event],['Animation-constructor',w.Animation],['PlaybackEvent-constructor',w.AnimationPlaybackEvent],['Element.animate',w.Element.prototype.animate],['Element.getAnimations',w.Element.prototype.getAnimations],['Animation.ready-getter',Object.getOwnPropertyDescriptor(w.Animation.prototype,'ready').get],['Animation.finished-getter',Object.getOwnPropertyDescriptor(w.Animation.prototype,'finished').get],['PlaybackEvent.currentTime-getter',Object.getOwnPropertyDescriptor(w.AnimationPlaybackEvent.prototype,'currentTime').get],['ready-Promise',ready],['finished-Promise',finished]];
 const proof=value=>({vm:binding.sameRealm(value,vm),host:binding.sameRealm(value,host),globalVM:binding.creationGlobal(value)===binding.creationGlobal(vm)});
 const rows=[];for(const[name,value]of targets){const before=proof(value),old=Object.getPrototypeOf(value);Object.setPrototypeOf(value,null);const after=proof(value);Object.setPrototypeOf(value,old);rows.push({name,before,after});}
 await writeFile('/workspace/red-panda/proposals/web-animations-allocation/evidence/original-context-proof.json',JSON.stringify({scope:'Direct publicV8 creation-context proof; no queryObjects provenance hints',rows},null,2)+'\n',{flag:'wx'});console.log(rows);
}finally{browser.close();}
