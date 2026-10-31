// Genuine selected-VM public constructors, prototypes and methods. All native
// endpoints and successful producer brands remain in the caller's Host maps.
export function createMessagingInterfaces(realm,bridge){
 const evaluate=realm.eval,apply=Reflect.apply;
 return apply(evaluate,realm,[`(${factory.toString()})`])(realm,bridge);
}
function factory(g,b){
 'use strict';const TypeError=g.TypeError,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,setPrototype=g.Object.setPrototypeOf,construct=g.Reflect.construct,Target=g.EventTarget;
 const valid=value=>{if(!b.port(value))throw new TypeError('Illegal invocation')};
 function MessagePort(){if(!new.target||!b.token(arguments[0]))throw new TypeError('Illegal Constructor');return b.target?b.target(this):construct(Target,[],new.target)}
 const pp={postMessage(data){valid(this);if(!arguments.length)throw new TypeError('postMessage requires a message');return b.post(this,data,arguments[1])},start(){valid(this);return b.start(this)},close(){valid(this);return b.close(this)},get onmessage(){valid(this);return b.handler(this,'message')},set onmessage(value){valid(this);b.handler(this,'message',value,true)},get onmessageerror(){valid(this);return b.handler(this,'messageerror')},set onmessageerror(value){valid(this);b.handler(this,'messageerror',value,true)}};
 define(pp,'constructor',{value:MessagePort,writable:true,configurable:true});define(pp,g.Symbol.toStringTag,{value:'MessagePort',configurable:true});setPrototype(pp,Target.prototype);setPrototype(MessagePort,Target);define(MessagePort,'prototype',{value:pp,writable:false});
 function MessageChannel(){if(!new.target)throw new TypeError('invalid argument');b.channel(this)}
 const cp={get port1(){return b.channelPort(this,1)},get port2(){return b.channelPort(this,2)}};define(cp,'constructor',{value:MessageChannel,writable:true,configurable:true});define(cp,g.Symbol.toStringTag,{value:'MessageChannel',configurable:true});define(MessageChannel,'prototype',{value:cp,writable:false});
 return{MessagePort,MessageChannel};
}
