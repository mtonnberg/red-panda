// Public Fetch values are allocated by real selected-VM functions. All state,
// backend methods, iterator producers and network algorithms stay Host-private.
function factory(g,b){'use strict';
 const define=g.Object.defineProperty,create=g.Object.create,construct=g.Reflect.construct,apply=g.Reflect.apply,TypeError=g.TypeError,Object=g.Object,own=g.Object.getOwnPropertyDescriptor;
 const invalid=()=>{throw new TypeError('invalid argument')};
 function Headers(init){if(!new.target)invalid();b.construct('Headers',this,arguments)}
 function Request(input){if(!new.target||!arguments.length)invalid();b.construct('Request',this,arguments)}
 function Response(){if(!new.target)invalid();b.construct('Response',this,arguments)}
 function HeadersIterator(){throw new TypeError('Illegal constructor')}
 define(Headers,'length',{value:0,configurable:true});
 for(const C of[Headers,Request,Response,HeadersIterator]){delete C.prototype.constructor;define(C,'prototype',{writable:false})}
 const hp=Headers.prototype,rp=Request.prototype,sp=Response.prototype,ip=HeadersIterator.prototype;
 function iterator(value,key){const out=construct(Object,[],HeadersIterator);b.iterator(out,value,key);return out}
 const hm={append(name,value){if(arguments.length<2)invalid();return b.method('Headers','append',this,arguments)},delete(name){if(!arguments.length)invalid();return b.method('Headers','delete',this,arguments)},get(name){if(!arguments.length)invalid();return b.method('Headers','get',this,arguments)},getSetCookie(){return b.method('Headers','getSetCookie',this,arguments)},has(name){if(!arguments.length)invalid();return b.method('Headers','has',this,arguments)},set(name,value){if(arguments.length<2)invalid();return b.method('Headers','set',this,arguments)},keys(){return iterator(this,'keys')},values(){return iterator(this,'values')},entries(){return iterator(this,'entries')},forEach(callback){if(typeof callback!=='function')invalid();const it=iterator(this,'entries'),self=arguments[1];for(let step;(step=it.next()).done===false;)apply(callback,self,[step.value[1],step.value[0],this])}};
 const im={next(){const step=b.next(this);return{done:!!step.done,value:step.value}},[Symbol.iterator](){if(!b.hasIterator(this))invalid();return this}};
 const bodies=kind=>({text(){return b.method(kind,'text',this,arguments)},json(){return b.method(kind,'json',this,arguments)},arrayBuffer(){return b.method(kind,'arrayBuffer',this,arguments)},bytes(){return b.method(kind,'bytes',this,arguments)},blob(){return b.method(kind,'blob',this,arguments)},formData(){return b.method(kind,'formData',this,arguments)},textStream(){return b.method(kind,'textStream',this,arguments)},clone(){return b.method(kind,'clone',this,arguments)}}),rm=bodies('Request'),sm=bodies('Response');
 const method=(p,key,value)=>define(p,key,{value,writable:true,enumerable:true,configurable:true});
 const getter=(p,key,kind)=>{const get=own({get value(){return b.get(kind,key,this)}},'value').get;define(get,'name',{value:'get '+key,configurable:true});define(p,key,{get,enumerable:true,configurable:true})};
 for(const[key,value]of Object.entries(hm))method(hp,key,value);
 for(const key of Reflect.ownKeys(im))method(ip,key,im[key]);
 for(const key of ['url','method','headers','cache','credentials','redirect','mode','signal','bodyUsed','body'])getter(rp,key,'Request');
 for(const key of ['blob','text','json','arrayBuffer','bytes','formData','textStream','clone'])method(rp,key,rm[key]);
 for(const key of ['referrer','referrerPolicy'])getter(rp,key,'Request');
 for(const key of ['ok','status','statusText','type'])getter(sp,key,'Response');
 for(const key of ['text','json'])method(sp,key,sm[key]);
 for(const key of ['headers','body','bodyUsed','url','redirected'])getter(sp,key,'Response');
 for(const key of ['arrayBuffer','blob','bytes','formData','textStream','clone'])method(sp,key,sm[key]);
 const statics={error(){return b.static('error',arguments)},redirect(url){if(!arguments.length)invalid();return b.static('redirect',arguments)},json(data){if(!arguments.length)invalid();return b.static('json',arguments)}};
 for(const[key,value]of Object.entries(statics))define(Response,key,{value,writable:true,enumerable:true,configurable:true});
 define(hp,Symbol.iterator,{value:hm.entries,writable:true,configurable:true});
 for(const[C,name]of[[Headers,'Headers'],[Request,'Request'],[Response,'Response'],[HeadersIterator,'HeadersIterator']]){define(C.prototype,'constructor',{value:C,writable:true,configurable:true});if(name!=='HeadersIterator')define(C.prototype,Symbol.toStringTag,{value:name,configurable:true})}
 const functions={fetch(input){return b.fetch(this,arguments)}};
 for(const[name,value]of Object.entries({Headers,Request,Response,fetch:functions.fetch}))define(g,name,{value,writable:true,configurable:true});
 return{Headers,Request,Response,allocate(kind){return construct(Object,[],({Headers,Request,Response})[kind])}};
}
export function installFetchInterfaceRealm(realm,bridge,{evaluate=source=>realm.eval(source)}={}){return evaluate(`(${factory.toString()})`)(realm,bridge)}
