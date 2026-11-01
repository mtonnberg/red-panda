import{installQualifiedElementBirth,qualifiedHTMLBirth}from'./qualified-element-birth.js';
// Preserve qualified HTML tokens as real prefix/local-name private factory
// data. The parser keeps its actual original token spelling in a Host WeakMap,
// so parse5's open-element and closing-tag algorithms use qualified tokens.
import vm from'node:vm';
import{createRequire}from'node:module';
import{readFileSync}from'node:fs';
import{dirname}from'node:path';
import{createHash}from'node:crypto';
import{ownsNamespaceNode}from'./namespace-state.js';
const require=createRequire(import.meta.url),originalNames=new WeakMap();
let html,HTML_NS;
let installed=false;
export function installHTMLQualifiedNameParser(){
 if(installed)return;
 installQualifiedElementBirth();
 html=require('jsdom/lib/jsdom/browser/parser/html.js');HTML_NS=require('jsdom/lib/jsdom/living/helpers/namespaces.js').HTML_NS;

 const full=require.resolve('jsdom/lib/jsdom/browser/parser/html.js'),source=readFileSync(full,'utf8');
 if(createHash('sha256').update(source).digest('hex')!=='d3c8ae7f9330eaa6dfb6b8d9b918b1a6398a43d40d71648b99b7f3e30a0e5333')throw new Error('Pinned canonical HTML token producer changed');
 const allocation='const element = createElement(ownerDocument, localName, namespace, null, isValue, willExecuteScript);',adapter='Object.assign(JSDOMParse5Adapter.prototype, serializationAdapter);';
 if(source.split(allocation).length!==2||source.split(adapter).length!==2)throw new Error('Canonical qualified token allocation seam changed');
 const transformed=source.replace(allocation,'const element = createHTMLToken(createElement, ownerDocument, localName, namespace, isValue, willExecuteScript);').replace(adapter,adapter+'\nconst originalTagName = JSDOMParse5Adapter.prototype.getTagName;\nJSDOMParse5Adapter.prototype.getTagName = function(node) { return tokenName(node, originalTagName); };');
 const module={exports:{}};
 function createHTMLToken(create,document,name,namespace,isValue,script){
  const colon=name.indexOf(':');
  if(!ownsNamespaceNode(document)||namespace!==HTML_NS||colon<=0||colon===name.length-1)return create(document,name,namespace,null,isValue,script);
  // A qualified HTML token is not a registered HTML/custom-element name. The
  // canonical uncustomized Generic/Unknown factory receives its original namespace and split name
  // BEFORE the one genuine frontend allocation/setup; no prototype repair.
  const node=qualifiedHTMLBirth(document,name.slice(0,colon),name.slice(colon+1),isValue);
  originalNames.set(node,name);return node;
 }
 vm.compileFunction(transformed,['require','exports','module','__filename','__dirname','createHTMLToken','tokenName'],{filename:full})(createRequire(full),module.exports,module,full,dirname(full),createHTMLToken,(node,original)=>originalNames.get(node)??original(node));
 // Keep the canonical CommonJS exports identity and all downstream consumers.
 html.parseIntoDocument=module.exports.parseIntoDocument;html.parseFragment=module.exports.parseFragment;installed=true;
}
