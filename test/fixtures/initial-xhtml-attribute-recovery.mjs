// STATIC/UNRUN owned recovery control. Actual APIs/bounds from existing
// window-task-capture-timeout + namespace-serialization interruption tests.
import vm from 'node:vm';
import {Browser} from '../../src/browser.js';
import {platformFactoryRecord,subscribePlatformFactories} from '../../src/platform-factories.js';
import {isInitialXMLAttributeSource} from '../../src/initial-document-parser.js';
import {windowTaskCaptureState} from '../../src/window-task-capture.js';
const mode=process.argv[2];if(!['interrupt','reentry'].includes(mode))throw Error('Explicit single recovery mode required');
const HTML='http://www.w3.org/1999/xhtml',encode=source=>'data:application/xhtml+xml,'+encodeURIComponent(source);
const browser=new Browser({timeout:1000,loadResources:['iframe']}),page=browser.createPage();
const report={mode,pid:process.pid,vmPolicyMilliseconds:200,ownedChildDeadlineMilliseconds:7000};
let partial,partialDocument,created,stopFactory,stopWindow,actualError;
try{
 await page.navigate(encode('<html xmlns="'+HTML+'"><head/><body><p>actual warm initial XHTML</p></body></html>'));
 // MIME comes from that actual successful navigation, never a fabricated field.
 report.actualWarmMime=page.mimeType;
 stopWindow=({window})=>{partial=window;partialDocument=platformFactoryRecord(window.document).implementation;};page.once('utilityWindowPrepared',stopWindow);
 const targetId='actual-initial-'+mode;
 stopFactory=subscribePlatformFactories((value,record)=>{
  const attribute=record.implementation;
  if(record.kind!=='Attr'||attribute._localName!=='id'||attribute._value!==targetId)return;
  report.actualScriptAttributeBirth={sameDocument:attribute._ownerDocument===partialDocument,scopeActive:isInitialXMLAttributeSource(attribute._ownerDocument)};
  if(mode==='reentry'){
   report.beforeOrdinaryReentry=isInitialXMLAttributeSource(partialDocument);
   report.actualNestedValue=partial.eval('6*7');
   report.afterOrdinaryReentry=isInitialXMLAttributeSource(partialDocument);
  }
 });
 const author=mode==='interrupt'?'globalThis.actualInitialLoopEntered=true;try{while(true){}}finally{globalThis.actualInitialAuthorFinally=true}':'globalThis.actualInitialAuthorRan=true';
 const source='<html xmlns="'+HTML+'"><head/><body><script id="'+targetId+'">'+author+'</script><input id="after" REQUIRED="source"/></body></html>';
 const context=vm.createContext({});context.runInitial=()=>{created=page.createDOM(source);return true;};const vmStarted=performance.now();
 try{vm.runInContext('runInitial()',context,{timeout:200,displayErrors:false});}
 catch(error){actualError={name:error.name,code:error.code,message:error.message};}
 finally{delete context.runInitial;report.actualVmElapsedMilliseconds=performance.now()-vmStarted;}
 report.actualError=actualError??null;report.timeoutObserved=actualError?.code==='ERR_SCRIPT_EXECUTION_TIMEOUT';
 report.actualLoopEntered=partial?.actualInitialLoopEntered===true;
 report.actualAuthorFinally=partial?.actualInitialAuthorFinally===true;
 report.actualAuthorRan=partial?.actualInitialAuthorRan===true;
 report.scopeBeforeCheckpoint=partialDocument?isInitialXMLAttributeSource(partialDocument):null;
 await new Promise(resolve=>setImmediate(resolve));
 report.scopeAfterCheckpoint=partialDocument?isInitialXMLAttributeSource(partialDocument):null;
 report.captureAfterCheckpoint=windowTaskCaptureState();
 report.partialClosedBeforeExplicitCleanup=partial?.document===undefined;
 // Retire any successful unpublished control Window before normal navigation.
 if(created)created.window.close();
 await page.navigate(encode('<html xmlns="'+HTML+'"><head/><body><input id="later" REQUIRED="later"/></body></html>'));
 const window=page.dom.window,document=window.document,later=document.getElementById('later'),backend=platformFactoryRecord(later).implementation;
 report.later={sourceNames:backend._attributeList.map(a=>a._localName),required:later.required,currentScope:isInitialXMLAttributeSource(platformFactoryRecord(document).implementation),query:page.evaluate('6*7')};
 const setter=document.createElement('input');setter.setAttribute('REQUIRED','setter');document.body.append(setter);
 report.later.setter={names:platformFactoryRecord(setter).implementation._attributeList.map(a=>a._localName),required:setter.required};
 const inactive=new window.DOMParser().parseFromString('<html xmlns="'+HTML+'"><head/><body><input id="other" REQUIRED="other"/></body></html>','application/xhtml+xml'),other=inactive.getElementById('other');
 report.otherDocument={different:inactive!==document,scope:isInitialXMLAttributeSource(platformFactoryRecord(inactive).implementation),names:platformFactoryRecord(other).implementation._attributeList.map(a=>a._localName)};
}catch(error){report.failure={name:error.name,code:error.code,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 stopFactory?.();if(stopWindow)page.off('utilityWindowPrepared',stopWindow);
 if(partial?.document)partial.close();await browser.close();report.closed=page.closed;console.log(JSON.stringify(report));
}
