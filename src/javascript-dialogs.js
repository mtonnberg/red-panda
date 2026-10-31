// Native-calibrated headless dialog operations over actual owned contexts.
// No Window facade, VM factory table, public owner property or protocol mask.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {getRuntimeBinding} from './native-runtime.js';

const require=createRequire(import.meta.url);
const utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const browsers=new WeakMap(),contexts=new WeakMap(),windows=new WeakMap(),callers=new WeakMap();
const apply=Reflect.apply,define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor;
const slot=properties=>Object.assign(Object.create(null),properties);

export function initializeJavaScriptDialogs(browser){
 if(!browsers.has(browser))browsers.set(browser,slot({contexts:new Set(),closed:false}));
}
export function registerJavaScriptDialogContext(browser,context){
 initializeJavaScriptDialogs(browser);
 if(!context||browser.contexts.get(context.id)!==context)throw new TypeError('An actual owned browser context is required');
 let state=contexts.get(context);
 if(!state){state=slot({browser,context,pending:undefined,disposed:false,observers:new Map()});contexts.set(context,state);browsers.get(browser).contexts.add(state);}
 return context;
}
export function disposeJavaScriptDialogContext(browser,context){
 const state=contexts.get(context);if(!state||state.browser!==browser)return;
 state.pending=undefined;state.disposed=true;state.observers.clear();browsers.get(browser)?.contexts.delete(state);
}
export function disposeJavaScriptDialogs(browser){
 const state=browsers.get(browser);if(!state)return;state.closed=true;
 for(const context of [...state.contexts])disposeJavaScriptDialogContext(browser,context.context);
}
function activeContext(state){return !!state&&!state.disposed&&!browsers.get(state.browser)?.closed&&state.browser.contexts.get(state.context.id)===state.context;}
export function selectJavaScriptDialogContext(browser){
 // Native has one actual context per connection. For Root's additional
 // multiple-context API, an attached Session supplies exact authority;
 // an ambiguous root request cannot guess another page's context.
 const states=[...(browsers.get(browser)?.contexts??[])].filter(activeContext);
 return states.length===1?states[0].context:undefined;
}
export function armJavaScriptDialog(browser,context,accept,promptText){
 const state=contexts.get(context);if(!activeContext(state)||state.browser!==browser)return false;
 state.pending=slot({accept,promptText});return true;
}
function rootFor(page){const seen=new Set();while(page.registry?.page&&page.registry.page!==page&&!seen.has(page)){seen.add(page);page=page.registry.page;}return page;}
export function subscribeJavaScriptDialogs(page,connection,notify){
 const root=rootFor(page),state=contexts.get(root.context);
 if(!activeContext(state))throw new Error('Actual dialog context is not registered');
 let observers=state.observers.get(root);if(!observers){observers=new Map();state.observers.set(root,observers);}
 let members=observers.get(connection);if(!members){members=new Set();observers.set(connection,members);}
 members.add(notify);
 return()=>{members.delete(notify);if(!members.size)observers.delete(connection);if(!observers.size)state.observers.delete(root);};
}
function live(record){return !!record&&!record.signal?.aborted&&!record.page.closed&&record.document._defaultView!==null&&activeContext(record.state);}
function text(record,value){
 if(value===null||value===undefined)return '';
 // The target bridge converts Symbol to its description (including the
 // literal "undefined" for Symbol()), rather than ECMAScript ToString.
 const converted=apply(record.String,undefined,[typeof value==='symbol'?apply(record.symbolDescription,value,[]):value]);
 return apply(record.wellFormed,converted,[]);
}
function operation(record,kind,caller,receiver,args){
 const owner=windows.get(receiver);
 if(!owner||!activeContext(owner.state))throw new record.TypeError('Illegal invocation');
 // A live foreign Window method keeps its captured actual Document. Once
 // that Document retires, the measured operation runs in the real active
 // incumbent context; old nodes/Documents are never retargeted to fake it.
 let source=record;
 if(!live(source)){
  const incumbent=callers.get(caller);
  if(!live(incumbent)||incumbent.state!==record.state)throw new record.TypeError('Illegal invocation');
  source=incumbent;
 }
 const message=text(record,args[0]);
 const defaultText=kind==='prompt'?text(record,args[1]):'';
 const response=source.state.pending;source.state.pending=undefined;
 const params=slot({url:source.document.URL,message,type:kind,hasBrowserHandler:false,defaultPrompt:''});
 for(const members of source.state.observers.get(source.root)?.values()??[]){
  // First actual attached Session for this real page/connection is primary.
  const notify=members.values().next().value;if(notify)notify(params);
 }
 if(kind==='confirm')return response?.accept??false;
 if(kind==='prompt')return response?.accept?(response.promptText??defaultText):null;
}

export function installJavaScriptDialogs(page,global,{context,mainWindow=global}={}){
 if(windows.has(global))return;
 const root=rootFor(page),browser=root.browser;
 registerJavaScriptDialogContext(browser,root.context);
 const document=utils.implForWrapper(mainWindow.document);
 context??=document._globalObject;
 if(!vm.isContext(context))throw new TypeError('JavaScript dialogs require their actual VM context');
 const actualGlobal=vm.runInContext('globalThis',context);
 const record=slot({page,root,state:contexts.get(root.context),document,signal:page.documentAbort?.signal,
  TypeError:global.TypeError,String:global.String,wellFormed:global.String.prototype.toWellFormed,
  symbolDescription:descriptor(global.Symbol.prototype,'description').get});
 windows.set(global,record);windows.set(actualGlobal,record);callers.set(actualGlobal,record);
 const binding=getRuntimeBinding();
 for(const name of ['alert','confirm','prompt']){
  const entry=binding.createEntry((caller,receiver,args)=>operation(record,name,caller,receiver,args),actualGlobal,name);
  define(entry,'length',{value:0,configurable:true});
  define(global,name,{value:entry,writable:true,enumerable:true,configurable:true});
 }
}
