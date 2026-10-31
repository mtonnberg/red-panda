(()=>{
 const rows=[],safe=(label,fn)=>{try{rows.push([label,fn()])}catch(e){rows.push([label,{error:e.name,message:e.message,realm:e instanceof TypeError}])}};
 safe('shape',()=>({tag:Object.prototype.toString.call(CSS),keys:Reflect.ownKeys(CSS).map(String),proto:Object.getPrototypeOf(CSS)===Object.prototype,methods:Object.entries(CSS).map(([k,v])=>[k,v.name,v.length,Object.getPrototypeOf(v)===Function.prototype,Object.hasOwn(v,'prototype')])}));
 for(const v of [undefined,null,true,17,Symbol('a'),'', '-', '--','-1','1a','a\0b','a\x01b','a\x7fb','\ud800','a b','a\\b'])safe('escape:'+String(v),()=>CSS.escape(v));
 safe('escape:missing',()=>CSS.escape());
 const properties=['display','width','COLOR',' color','-moz-user-select','-webkit-transform','word-wrap','src','--x','--','gap','all','unknown','transform','content','font-family'];
 const values=['block','bogus','', 'initial','var(--x)','!!!','1px','red','calc(1px + 2px)','url("a b")','x;y','a !important','{x}','('];
 for(const p of properties)for(const v of values)safe('declaration:'+p+':'+v,()=>CSS.supports(p,v));
 for(const v of ['display: block','(display: block)','((display: block))','not (unknown: x)','(display: grid) and (gap: 1px)','(display: grid) and (color: red) or (gap: 1px)','not(display: block)','NOT (display: block)','(display: block) AND (color: red)','(display: block) or (unknown: x)','display:block;color:red','selector(:has(a))','selector(div > p)','selector(a,b)','selector(:unknown)','selector(div[foo="a,b"])','selector(::before)','font-tech(color-COLRv1)','unknown(x)','(--x: )','(--x: x)','(color: red !important)','(width: 1px; color:red)','(color:red)/*x*/and (display:block)'])safe('condition:'+v,()=>CSS.supports(v));
 for(const args of [[],[undefined],[null],[17],[Symbol('display')],[Symbol('display'),'block'],['display',Symbol('block')],[{toString(){throw 7}},'block']])safe('conversion:'+args.map(v=>typeof v).join(','),()=>CSS.supports(...args));
 return rows;
})()
