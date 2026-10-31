// Three further original generated public installers. Only their public class
// definitions execute in the selected VM; private generated factories and the
// Select ProxyHandler/cache remain on the same canonical Host module graph.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const definitions=Object.freeze({
 HTMLTextAreaElement:{sha:'799ee17e382f9e2352bc13bbe7795c7b54488a61cb61b76670c26812d058d6a0',names:['exports','conversions','utils','HTMLConstructor_helpers_html_constructor','SelectionMode','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','parseNonNegativeInteger_helpers_strings','create_DOMException','implSymbol','ctorRegistrySymbol','HTMLElement','interfaceName','exposed','Impl']},
 HTMLSelectElement:{sha:'c414c96dea79a10812673a08c1ec7159c8ebe91ae1a0d9b7cd024969345f60f5',names:['exports','conversions','utils','HTMLConstructor_helpers_html_constructor','HTMLOptionElement','HTMLOptGroupElement','HTMLElement','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','parseNonNegativeInteger_helpers_strings','implSymbol','ctorRegistrySymbol','interfaceName','exposed','Impl']},
 HTMLOptionElement:{sha:'821b44d734cbfbf00b839ec26189337d35abff46ec38da9304166e664e9e1d2f',names:['exports','conversions','utils','HTMLConstructor_helpers_html_constructor','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','implSymbol','ctorRegistrySymbol','HTMLElement','interfaceName','exposed','Impl']}
});
export function isAdditionalControlInterface(kind){return Object.hasOwn(definitions,kind)}
function bodyOf(source,kind){
 const signature='exports.install = (globalObject, globalNames) => {\n';
 // Select has private Host ProxyHandler definitions AFTER its public installer.
 // They are deliberately excluded rather than moved into the public VM.
 const footer=kind==='HTMLSelectElement'?'};\n\nconst proxyHandlerCache = new WeakMap();':'};\n\nconst Impl = require(';
 const start=source.indexOf(signature),end=source.indexOf(footer,start);
 if(start<0||end<start||source.split(signature).length!==2||source.split(footer).length!==2)throw new Error('Unexpected generated additional control installer: '+kind);
 return source.slice(start+signature.length,end);
}
export function transformAdditionalControlInterface(source,kind,originalSource){
 const definition=definitions[kind];
 if(!definition||require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(originalSource).digest('hex')!==definition.sha)throw new Error('Pinned generated additional control interface source changed: '+kind);
 const body=bodyOf(source,kind);
 if(body!==bodyOf(originalSource,kind))throw new Error('Generated additional public control body changed: '+kind);
 const names=definition.names;
 return source+'\nconst originalAdditionalControlInstall = exports.install;\nexports.install = (globalObject, globalNames) => installControlInterface(globalObject, globalNames, originalAdditionalControlInstall, '+JSON.stringify(body)+', '+JSON.stringify(names)+', ['+names.join(', ')+'], __filename);\n';
}
