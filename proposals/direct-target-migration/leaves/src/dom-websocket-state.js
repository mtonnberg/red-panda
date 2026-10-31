// Genuine canonical WebSocket wrappers keep their implementation in Host
// private state. Only successful setup/new callsites can install this brand.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {bindEventTargetImplementation} from './dom-event-target-state.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const values=new WeakMap(),installed=new WeakSet();
export function webSocketImplementation(value){return values.get(value)}
export function hasWebSocketImplementation(value){return values.has(value)}
export function bindWebSocketImplementation(value,implementation){bindEventTargetImplementation(value,implementation);values.set(value,implementation);return implementation}
export function installPrivateWebSocketUtils(target=utils){if(installed.has(target))return;installed.add(target);target.webSocketImplementation=webSocketImplementation;target.hasWebSocketImplementation=hasWebSocketImplementation;target.bindWebSocketImplementation=bindWebSocketImplementation;target.configureWebSocketPrototype=configureWebSocketPrototype}
// Native exposes extensions as a constant and preserves this IDL member order.
// Rebuild the actual generated prototype's own descriptors before publication.
function configureWebSocketPrototype(prototype){
 const descriptors=Object.getOwnPropertyDescriptors(prototype),keys=['CONNECTING','OPEN','CLOSING','CLOSED','url','readyState','bufferedAmount','binaryType','protocol','extensions','onopen','onmessage','onerror','onclose','send','close','constructor',Symbol.toStringTag];
 for(const key of Reflect.ownKeys(prototype))if(descriptors[key].configurable)delete prototype[key];
 descriptors.extensions={value:'',writable:false,enumerable:true,configurable:false};
 // Constants already exist nonconfigurably on the original generated prototype.
 // Their physical order precedes all configurable members after removal.
 for(const key of keys)if(descriptors[key].configurable||key==='extensions')Object.defineProperty(prototype,key,descriptors[key]);
}
installPrivateWebSocketUtils();
export function transformPrivateWebSocketSource(source){
 if(createHash('sha256').update(source).digest('hex')!=='8ee5efbe6419e82e8f3983c022acd66f7651c25d11045fdf579023b4434b3053')throw new Error('Pinned generated WebSocket source changed');
 const setup='Object.defineProperty(wrapper, implSymbol, {\n    value: new Impl.implementation(globalObject, constructorArgs, privateData),\n    configurable: true\n  });',allocate='Object.defineProperty(wrapper, implSymbol, {\n    value: Object.create(Impl.implementation.prototype),\n    configurable: true\n  });',brand='utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation';
 for(const expression of[setup,allocate,brand])if(source.split(expression).length!==2)throw new Error('Pinned generated WebSocket backing changed');
 source=source.replace(setup,'utils.bindWebSocketImplementation(wrapper, new Impl.implementation(globalObject, constructorArgs, privateData));').replace(allocate,'utils.bindWebSocketImplementation(wrapper, Object.create(Impl.implementation.prototype));').replace(brand,'utils.isObject(value) && utils.hasWebSocketImplementation(value)');
 for(const name of['wrapper','esValue','value'])source=source.replaceAll(name+'[implSymbol]','utils.webSocketImplementation('+name+')');return source.replace('  ctorRegistry[interfaceName] = WebSocket;','  utils.configureWebSocketPrototype(WebSocket.prototype);\n  ctorRegistry[interfaceName] = WebSocket;');
}
