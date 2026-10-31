(()=>{
 const rows=[];const own=Object.getOwnPropertyDescriptor,keys=Object.getOwnPropertyNames;
 const capture=(name,fn)=>{try{rows.push([name,{value:fn()}])}catch(e){rows.push([name,{error:e?.name,message:e?.message,realm:e instanceof TypeError}])}};
 const snapshot=p=>Object.fromEntries(['protocol','username','password','hostname','port','pathname','search','hash','hasRegExpGroups'].map(k=>[k,p[k]]));
 const norm=r=>r===null?null:JSON.parse(JSON.stringify(r,(k,v)=>v===undefined?'__undefined__':v));
 capture('shape',()=>({constructor:{length:URLPattern.length,name:URLPattern.name,realm:Object.getPrototypeOf(URLPattern)===Function.prototype,names:keys(URLPattern)},prototype:keys(URLPattern.prototype),tag:Object.prototype.toString.call(new URLPattern()),descriptors:Object.fromEntries(Reflect.ownKeys(URLPattern.prototype).map(k=>{const d=own(URLPattern.prototype,k);return[String(k),{enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,kind:typeof d.value,length:d.value?.length,name:d.value?.name,getLength:d.get?.length,getName:d.get?.name,realm:d.get?Object.getPrototypeOf(d.get)===Function.prototype:typeof d.value==='function'?Object.getPrototypeOf(d.value)===Function.prototype:undefined}]}))}));
 for(const [name,args]of [
 ['empty',[]],['undefined',[undefined]],['null',[null]],['primitive',[17]],['symbol',[Symbol('https://example.com/x')]],['boxed',[new String('https://example.com/x')]],['function',[()=>1]],['array',[[]]],
 ['absolute',['https://example.com']],['relative',['/foo/*','https://example.com/a']],['dict',[{pathname:'/foo/:bar'}]],['dict-base',[{pathname:'/foo'},'https://example.com']],['dict-ignore',[{pathname:'/FOO'},{ignoreCase:true}]],['empty-base',[{pathname:'/foo',baseURL:''}]],
 ['case-port',['HTTP://EXAMPLE.com:80/']],['unicode',[{pathname:'/:café/:℘'}]],['badregex',[{pathname:'/(café)'}]],['dup',[{pathname:'/:a/:a'}]],['bad-host',[{hostname:'bad|hostname'}]],
 ])capture('construct-'+name,()=>snapshot(new URLPattern(...args)));
 capture('constructor-order',()=>{const log=[];new URLPattern(new Proxy({pathname:'/x',baseURL:'https://example.com'},{get(t,k,r){log.push('get:'+String(k));return Reflect.get(t,k,r)},has(t,k){log.push('has:'+String(k));return Reflect.has(t,k)}}),new Proxy({ignoreCase:true},{get(t,k,r){log.push('option:'+String(k));return Reflect.get(t,k,r)}}));return log});
 const p=new URLPattern({pathname:'/foo/:bar?'});
 for(const [name,args]of [['none',[]],['undefined',[undefined]],['null',[null]],['number',[17]],['symbol',[Symbol('https://example.com/foo/x')]],['dict',[{pathname:'/foo/x'}]],['optional',[{pathname:'/foo'}]],['string',['https://example.com/foo/x']],['base',['./foo/x','https://example.com']],['dict-base',[{pathname:'/foo/x'},'https://example.com']],['bad-base',['./foo/x','bad']]])for(const method of['test','exec'])capture(method+'-'+name,()=>{const r=p[method](...args);if(method==='test')return r;return {result:norm(r),resultRealm:r&&Object.getPrototypeOf(r)===Object.prototype,arrayRealm:r&&Object.getPrototypeOf(r.inputs)===Array.prototype,dictRealm:r&&typeof r.inputs[0]==='object'?Object.getPrototypeOf(r.inputs[0])===Object.prototype:null,inputIdentity:r&&typeof args[0]==='object'?r.inputs[0]===args[0]:null,groupsRealm:r&&Object.getPrototypeOf(r.pathname.groups)===Object.prototype,componentRealm:r&&Object.getPrototypeOf(r.pathname)===Object.prototype}});
 for(const method of ['test','exec'])for(const receiver of [{},Object.create(URLPattern.prototype),null])capture('brand-'+method+'-'+String(receiver===null),()=>URLPattern.prototype[method].call(receiver,'https://example.com/'));
 capture('getter-brand',()=>own(URLPattern.prototype,'pathname').get.call({}));
 capture('clone',()=>structuredClone(new URLPattern()));
 capture('exec-order',()=>{const log=[];p.exec(new Proxy({pathname:'/foo/x'},{get(t,k,r){log.push('get:'+String(k));return Reflect.get(t,k,r)},has(t,k){log.push('has:'+String(k));return Reflect.has(t,k)}}));return log});
 const patterns=['/foo/a','/foo/b','/foo/:a','/foo/:b','/foo/*','*','*/foo','/foo/{bar}+','/foo/{bar}?','/foo/:bar?','/foo/:bar+','/foo/(a|b)','/foo/(a*)','/:x/long'];
 for(let a=0;a<patterns.length;a++)for(let b=0;b<patterns.length;b++)capture('compare-'+a+'-'+b,()=>URLPattern.compareComponent('pathname',new URLPattern({pathname:patterns[a]}),new URLPattern({pathname:patterns[b]})));
 for(const [component,pattern,groups]of [['pathname','/foo/:bar',{bar:'a b'}],['pathname','/foo/:bar',{}],['pathname','/foo/:bar',{bar:'a/b'}],['pathname','/foo/:bar?',{}],['pathname','/foo/:bar+',{bar:'a/b'}],['pathname','/foo/*',{'0':'a/b'}],['pathname','/foo/*',{}],['hostname','{:foo}.example.com',{foo:'🍅'}],['pathname','/foo/{bar}+ ',{}],['pathname','/:x(a|b)',{x:'a'}],['pathname','/:x(a|b)',{x:'c'}]])capture('generate-'+component+'-'+pattern+'-'+JSON.stringify(groups),()=>new URLPattern({[component]:pattern}).generate(component,groups));
 capture('generate-opaque',()=>new URLPattern('original-scheme://example.com/:foo').generate('pathname',{foo:' '}));
 capture('generate-invalid-component',()=>new URLPattern().generate('nope',{}));
 capture('compare-invalid-component',()=>URLPattern.compareComponent('nope',new URLPattern(),new URLPattern()));
 capture('compare-brand',()=>URLPattern.compareComponent('pathname',{},new URLPattern()));
 return JSON.stringify(rows);
})()
