// The monitor records uncaught stacks without consuming/suppressing them.
import assert from 'node:assert/strict';
import {Browser} from '../../../shared/animation-private-owner-r3-20261031/src/browser.js';
const restore=process.argv[2]==='restore',browser=new Browser({timeout:2000}),page=browser.createPage(),calls=[];
process.on('uncaughtExceptionMonitor',error=>process.stderr.write(JSON.stringify({monitor:true,message:error.message,stack:error.stack,calls})+'\n'));
try{
 await page.navigate('data:text/html,<body>actual poison diagnostic</body>');const window=page.dom.window,originals=new Map();
 for(const name of['setTimeout','clearTimeout','setInterval','clearInterval']){originals.set(name,Object.getOwnPropertyDescriptor(window,name));window[name]=()=>{calls.push(name);throw Error('authored replacement: '+name)}}
 const animation=window.document.createElement('div').animate();await new Promise(resolve=>animation.onfinish=resolve);const canceled=new Promise(resolve=>animation.oncancel=resolve);animation.cancel();await canceled;
 assert.deepEqual(calls,[]);console.log(JSON.stringify({marker:'animation-assertions-complete',restore,calls}));
 if(restore)for(const[name,descriptor]of originals)Object.defineProperty(window,name,descriptor);
 page.close();console.log(JSON.stringify({marker:'page-close-returned',restore,calls}));
 await new Promise(resolve=>setImmediate(resolve));console.log(JSON.stringify({marker:'next-host-tick',restore,calls}));
}finally{browser.close()}
