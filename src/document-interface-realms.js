// Execute the canonical generated Document/XMLDocument public definitions in
// their actual initial owning VM. Setup/backend/unforgeable caches remain on
// the same Host factory graph; HTMLDocument's existing installer is untouched.
import{createRequire}from'node:module';
import{createHash}from'node:crypto';
const require=createRequire(import.meta.url);
const definitions=Object.freeze({
 Document:{privateArgumentArrays:26,sha:'89c68968aa52645c8e0849316c624286ee808020f979e0e97cc4bec8c2fafd20',names:['exports','conversions','utils','ElementCreationOptions','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','Node','NodeFilter','HTMLElement','EventHandlerNonNull','OnErrorEventHandlerNonNull','implSymbol','ctorRegistrySymbol','interfaceName','exposed','Impl','createShell','callFactory']},
 XMLDocument:{privateArgumentArrays:0,sha:'d59ec74246f8f016d3544a040d005c2a9c6250fee933e9decd361cdea6292302',names:['exports','conversions','utils','implSymbol','ctorRegistrySymbol','Document','interfaceName','exposed','Impl']}
});
export function isDocumentInterface(kind){return Object.hasOwn(definitions,kind)}
function bodyOf(source,kind){
 const signature='exports.install = (globalObject, globalNames) => {\n',footer='};\n\nconst Impl = require(',start=source.indexOf(signature),end=source.indexOf(footer,start);
 if(start<0||end<start||source.split(signature).length!==2||source.split(footer).length!==2)throw new Error('Unexpected canonical Document public installer: '+kind);
 return source.slice(start+signature.length,end);
}
function existingDocumentBody(body){
 // These are exactly the prior frozen canonical same-shell constructor and
 // method-realm factory calls. No public conversion/body change is added here.
 const constructor='exports.setup(Object.create(new.target.prototype),';
 if(body.split(constructor).length!==2)throw new Error('Unexpected prior canonical Document constructor');
 body=body.replace(constructor,'exports.setup(createShell(globalObject, new.target.prototype),');
 for(const method of ['createElement','createElementNS','createTextNode','createComment','createAttribute','createAttributeNS']){
  const expression=`esValue[implSymbol].${method}(...args)`;
  if(body.split(expression).length!==2)throw new Error('Unexpected prior canonical Document method: '+method);
  body=body.replace(expression,`callFactory(globalObject, esValue[implSymbol], ${JSON.stringify(method)}, args)`);
 }
 const fragment='esValue[implSymbol].createDocumentFragment()';
 if(body.split(fragment).length!==2)throw new Error('Unexpected prior canonical Document fragment method');
 return body.replace(fragment,'callFactory(globalObject, esValue[implSymbol], "createDocumentFragment", [])');
}
export function transformDocumentInterface(source,kind,originalSource){
 const definition=definitions[kind];
 if(!definition||require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(originalSource).digest('hex')!==definition.sha)throw new Error('Pinned canonical Document interface source changed: '+kind);
 const body=bodyOf(source,kind),original=bodyOf(originalSource,kind),expected=kind==='Document'?existingDocumentBody(original):original;
 if(body!==expected)throw new Error('Canonical Document public installer changed beyond frozen factory calls: '+kind);
 // Generated conversion arguments are private implementation state. Keep the
 // original pinned body guard above, then change only its recognized private
 // argument-array allocation sites. Public functions still compile in the VM;
 // public arrays and all conversion/backend operations remain unchanged.
 const allocation='const args = [];',privateAllocation='const args = createPrivateIDLArguments();';
 if(body.split(allocation).length-1!==definition.privateArgumentArrays||body.includes('createPrivateIDLArguments'))throw new Error('Canonical private IDL argument allocation changed: '+kind);
 let publicBody=body.replaceAll(allocation,privateAllocation);
 const names=definition.privateArgumentArrays?[...definition.names,'createPrivateIDLArguments']:[...definition.names];
 if(kind==='Document'){
  names.push('htmlDocumentBirth');
  publicBody+='\nif (htmlDocumentBirth.enabled(globalObject)) {\nclass HTMLDocument extends Document { constructor() { super(); htmlDocumentBirth.initialize(this); } }\nObject.defineProperty(HTMLDocument.prototype, Symbol.toStringTag, {value: "HTMLDocument", configurable: true});\nhtmlDocumentBirth.remember(globalObject, HTMLDocument);\n}\n';
 }
 const privateAllocator=definition.privateArgumentArrays?'\nconst createPrivateIDLArguments = () => [];\n':'';
 return source+privateAllocator+'\nconst originalDocumentInterfaceInstall = exports.install;\nexports.install = (globalObject, globalNames) => installControlInterface(globalObject, globalNames, originalDocumentInterfaceInstall, '+JSON.stringify(publicBody)+', '+JSON.stringify(names)+', ['+names.join(', ')+'], __filename);\n';
}
