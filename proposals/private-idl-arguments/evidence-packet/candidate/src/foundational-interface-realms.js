// Original canonical Node/Element/HTMLElement public definitions, compiled in
// their actual initial owning VM. Factories/setup/converters stay Host-owned;
// this is not an alternative Window architecture or a public-class facade.
import{createRequire}from'node:module';
import{createHash}from'node:crypto';
const require=createRequire(import.meta.url);
const definitions=Object.freeze({
 Node:{privateArgumentArrays:13,sha:'40e32d97310bb450c5ea169a0f48444f91f38bebdbfcaee77237cbf4e55318a5',names:['exports','conversions','utils','GetRootNodeOptions','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','implSymbol','ctorRegistrySymbol','EventTarget','interfaceName','exposed','Impl']},
 Element:{privateArgumentArrays:32,sha:'2df81ad6f660fd10e21dcb2a0167425ff07c968c59d2e667b071c65d8ebd873e',names:['exports','conversions','utils','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','Attr','ShadowRootInit','Node','implSymbol','ctorRegistrySymbol','interfaceName','exposed','Impl']},
 HTMLElement:{privateArgumentArrays:0,sha:'5ed9d5005064e5c34e4919e0f015b358c0e922c49ef57e115a9975dd0c30e63b',names:['exports','conversions','utils','HTMLConstructor_helpers_html_constructor','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','EventHandlerNonNull','OnErrorEventHandlerNonNull','implSymbol','ctorRegistrySymbol','Element','interfaceName','exposed','Impl']}
});
export function isFoundationalInterface(kind){return Object.hasOwn(definitions,kind)}
function bodyOf(source,kind){
 const signature='exports.install = (globalObject, globalNames) => {\n',footer='};\n\nconst Impl = require(',start=source.indexOf(signature),end=source.indexOf(footer,start);
 if(start<0||end<start||source.split(signature).length!==2||source.split(footer).length!==2)throw new Error('Unexpected canonical foundational interface installer: '+kind);
 return source.slice(start+signature.length,end);
}
export function transformFoundationalInterface(source,kind,originalSource){
 const definition=definitions[kind];
 if(!definition||require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(originalSource).digest('hex')!==definition.sha)throw new Error('Pinned canonical foundational interface source changed: '+kind);
 const body=bodyOf(source,kind);
 if(body!==bodyOf(originalSource,kind))throw new Error('Canonical foundational public installer body changed: '+kind);
 // Generated conversion arguments are private implementation state. Keep the
 // original pinned body guard above, then change only its recognized private
 // argument-array allocation sites. Public functions still compile in the VM;
 // public arrays and all conversion/backend operations remain unchanged.
 const allocation='const args = [];',privateAllocation='const args = createPrivateIDLArguments();';
 if(body.split(allocation).length-1!==definition.privateArgumentArrays||body.includes('createPrivateIDLArguments'))throw new Error('Canonical private IDL argument allocation changed: '+kind);
 const publicBody=body.replaceAll(allocation,privateAllocation);
 const names=definition.privateArgumentArrays?[...definition.names,'createPrivateIDLArguments']:definition.names;
 const privateAllocator=definition.privateArgumentArrays?'\nconst createPrivateIDLArguments = () => [];\n':'';
 return source+privateAllocator+'\nconst originalFoundationalInterfaceInstall = exports.install;\nexports.install = (globalObject, globalNames) => installControlInterface(globalObject, globalNames, originalFoundationalInterfaceInstall, '+JSON.stringify(publicBody)+', '+JSON.stringify(names)+', ['+names.join(', ')+'], __filename);\n';
}
