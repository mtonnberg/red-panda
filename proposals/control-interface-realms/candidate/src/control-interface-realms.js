// Execute only the original public generated interface installation in its
// owning Node VM. Canonical factories, setup, conversions and backends remain
// the original Host graph; no VM factory/controller is retained.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const fingerprints=Object.freeze({HTMLInputElement:'3cc1581ce8543184fb3f611b3f731e43571f1fb3dd0be5565190af74ac141d85',ValidityState:'e51af4b3331c3dba269f595d3f075621dcda0ee1a9ed607543bac927cc0e1933'});
const bindings=Object.freeze({
 HTMLInputElement:['exports','conversions','utils','HTMLConstructor_helpers_html_constructor','SelectionMode','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','FileList','parseNonNegativeInteger_helpers_strings','create_DOMException','serializeURLwhatwg_url','implSymbol','ctorRegistrySymbol','HTMLElement','interfaceName','exposed','Impl'],
 ValidityState:['exports','conversions','utils','implSymbol','ctorRegistrySymbol','interfaceName','exposed','Impl']
});
export function assertControlInterfaceSource(source,kind){
 if(require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(source).digest('hex')!==fingerprints[kind])throw new Error('Pinned generated control interface source changed: '+kind);
}
export function installControlInterface(globalObject,globalNames,original,body,names,values,filename){
 const context=vm.isContext(globalObject)?globalObject:utils.implForWrapper(globalObject)?._globalObject;
 // A genuine non-scriptable JSDOM belongs to Host. Its original installer is
 // correct, and no new context is synthesized for that case.
 if(!context||!vm.isContext(context))return Reflect.apply(original,undefined,[globalObject,globalNames]);
 // The entry is temporary. Only the actual public class/prototype/members
 // created by the unchanged body survive; dependency records stay Host-owned.
 return vm.compileFunction('"use strict";\n'+body,['globalObject','globalNames',...names],{parsingContext:context,filename})(globalObject,globalNames,...values);
}
function installationParts(source,kind){
 const names=bindings[kind];if(!names)throw new Error('Unsupported generated control interface: '+kind);
 const signature='exports.install = (globalObject, globalNames) => {\n',start=source.indexOf(signature),footer='};\n\nconst Impl = require(',end=source.lastIndexOf(footer);
 if(start<0||source.split(signature).length!==2||end<start||!source.slice(end).trimEnd().endsWith(');'))throw new Error('Unexpected generated control interface installation: '+kind);
 return {names,body:source.slice(start+signature.length,end),footer:source.slice(end+4)};
}
function adapterExpression(body,names){
 return '(globalObject, globalNames) => installControlInterface(globalObject, globalNames, originalControlInterfaceInstall, '+JSON.stringify(body)+', '+JSON.stringify(names)+', ['+names.join(', ')+'], __filename)';
}
export function transformControlInterfaceInstall(source,kind){
 const {names,body}=installationParts(source,kind);
 // Appended after Impl initializes: no changed module cycle or TDZ access.
 return source+'\nconst originalControlInterfaceInstall = exports.install;\nexports.install = '+adapterExpression(body,names)+';\n';
}
let installed=false;
export function installValidityStateInterfaceRealm(){
 if(installed)return;installed=true;
 const filename=require.resolve('jsdom/lib/jsdom/living/generated/ValidityState.js'),factory=require(filename),source=readFileSync(filename,'utf8');
 assertControlInterfaceSource(source,'ValidityState');
 const {names,body,footer}=installationParts(source,'ValidityState'),headerEnd=source.indexOf('exports.is = '),exposure='const exposed = new Set(["Window"]);';
 if(headerEnd<0||source.split(exposure).length!==2)throw new Error('Unexpected generated ValidityState lexical dependencies');
 // Compile only the original lexical declarations and installer adapter in
 // Host. All existing canonical setup/new/create/is functions stay identical.
 const adapter=source.slice(0,headerEnd)+exposure+'\n'+footer+'\nreturn '+adapterExpression(body,names)+';';
 factory.install=vm.compileFunction(adapter,['exports','require','__filename','installControlInterface','originalControlInterfaceInstall'],{filename})(factory,createRequire(filename),filename,installControlInterface,factory.install);
}
