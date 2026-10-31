// Authoritative CSS producer state. This module never authenticates a public
// shape or reads authored accessors while the renderer requests scalar facts.
const declarations=new WeakMap(),rules=new WeakMap(),sheets=new WeakMap(),media=new WeakMap(),lists=new WeakMap(),authorities=new WeakMap();
const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,extensible=Object.isExtensible,apply=Reflect.apply,mapEntries=Map.prototype.entries,mapGet=Map.prototype.get;
function fieldMethods(bridge){'use strict';const E=TypeError,S=String;const check=(value,kind)=>{if(!bridge.has(value,kind))throw new E('Illegal invocation')},text=value=>{if(typeof value==='symbol')throw new E('Cannot convert a Symbol value to a string');return S(value)};return{
 selector:{get:Object.getOwnPropertyDescriptor({get selectorText(){check(this,'rule');return bridge.selector(this)}},'selectorText').get,set:Object.getOwnPropertyDescriptor({set selectorText(value){check(this,'rule');bridge.selector(this,text(value),true)}},'selectorText').set},
 ruleList:{get:Object.getOwnPropertyDescriptor({get cssRules(){check(this,'sheet');return bridge.ruleList(this)}},'cssRules').get},
 disabled:{get:Object.getOwnPropertyDescriptor({get disabled(){check(this,'sheet');return bridge.disabled(this)}},'disabled').get,set:Object.getOwnPropertyDescriptor({set disabled(value){check(this,'sheet');bridge.disabled(this,!!value,true)}},'disabled').set},
 mediaText:{get:Object.getOwnPropertyDescriptor({get mediaText(){check(this,'media');return bridge.media(this)}},'mediaText').get,set:Object.getOwnPropertyDescriptor({set mediaText(value){check(this,'media');bridge.media(this,text(value),true)}},'mediaText').set},
 appendMedium(medium){check(this,'media');bridge.append(this,text(medium))},deleteMedium(medium){check(this,'media');bridge.remove(this,text(medium))},
 condition:{get:Object.getOwnPropertyDescriptor({get conditionText(){check(this,'media-rule');return bridge.condition(this)}},'conditionText').get,set:Object.getOwnPropertyDescriptor({set conditionText(value){check(this,'media-rule');bridge.condition(this,text(value),true)}},'conditionText').set},
}}
function reflectMedia(record){const list=record.list,write=(key,value)=>{const old=descriptor(list,key);if(old){if('value'in old&&old.writable)define(list,key,{...old,value})}else if(extensible(list))define(list,key,{value,writable:true,enumerable:true,configurable:true})};const previous=descriptor(list,'length');for(let i=record.values.length;i<(previous?.value??0);i++){const old=descriptor(list,String(i));if(old&&'value'in old&&old.configurable)delete list[i]}for(let i=0;i<record.values.length;i++)write(String(i),record.values[i]);write('length',record.values.length)}
function replaceMedia(record,value){record.values=value.split(',').map(item=>item.trim());record.version++;reflectMedia(record)}
export function createCSSReadAuthority(compile){
 if(typeof compile!=='function')throw new TypeError('An actual CSS realm compiler is required');
 const authority=Object.freeze(Object.create(null));const bridge={has:(value,kind)=>kind==='rule'?rules.get(value)?.type===1:kind==='sheet'?sheets.has(value):kind==='media'?media.has(value):kind==='media-rule'&&rules.get(value)?.type===4&&media.has(rules.get(value).media),
 selector(value,next,set=false){const state=rules.get(value);if(set){state.selector=next;state.version++}return state.selector},
 ruleList(value){const state=sheets.get(value);state.observe?.();return state.list},
 disabled(value,next,set=false){const state=sheets.get(value);if(set){state.disabled=next;state.version++}return state.disabled},
 media(value,next,set=false){const state=media.get(value);if(set)replaceMedia(state,next);return state.values.join(', ')},
 append(value,next){const state=media.get(value);if(!state.values.includes(next)){state.values.push(next);state.version++;reflectMedia(state)}},
 remove(value,next){const state=media.get(value),index=state.values.indexOf(next);if(index>=0){state.values.splice(index,1);state.version++;reflectMedia(state)}},
 condition(value,next,set=false){const state=rules.get(value),actual=media.get(state.media);if(set)replaceMedia(actual,next);return actual.values.join(', ')},
 };
 const fields=compile('return ('+fieldMethods.toString()+')(bridge)',['bridge'])(bridge);authorities.set(authority,fields);return authority;
}
export function registerCSSDeclaration(style){if(!declarations.has(style)){const values=style._values,priorities=style._priorities;apply(mapEntries,values,[]);apply(mapEntries,priorities,[]);declarations.set(style,{values,priorities})}return style}
export function readCSSDeclaration(style){const state=declarations.get(style);if(!state)throw Error('A genuine CSS declaration producer is required');return Array.from(apply(mapEntries,state.values,[]),([name,value])=>({name,value,priority:apply(mapGet,state.priorities,[name])??''}))}
export function registerCSSRuleList(list,read){if(!lists.has(list))lists.set(list,read)}
export function readCSSRuleList(list){const read=lists.get(list);if(!read)throw Error('A genuine CSS rule list producer is required');return read().slice()}
export function registerCSSMediaList(list,authority){if(media.has(list))return;const values=[];for(let i=0;i<list.length;i++)values.push(list[i]);media.set(list,{list,values,version:1});const fields=authorities.get(authority);if(fields){define(list,'mediaText',{...fields.mediaText,enumerable:true,configurable:true});for(const name of['appendMedium','deleteMedium'])define(list,name,{value:fields[name],writable:true,enumerable:true,configurable:true})}}
export function readCSSMediaList(list){const state=media.get(list);if(!state)throw Error('A genuine CSS media producer is required');return state.values.join(', ')}
export function registerCSSRule(rule,options={}){
 const{authority,group}=options;
 if(rules.has(rule))return;const fresh=(name,property=name)=>Object.hasOwn(options,name)?options[name]:rule[property],state={type:fresh('type'),selector:fresh('selector','selectorText'),style:fresh('style'),list:fresh('list','cssRules'),media:fresh('media'),group,version:1};rules.set(rule,state);if(state.style)registerCSSDeclaration(state.style);if(state.media)registerCSSMediaList(state.media,authority);const fields=authorities.get(authority);if(fields){if(state.type===1)define(rule,'selectorText',{...fields.selector,enumerable:true,configurable:true});if(state.type===4&&state.media)define(rule,'conditionText',{...fields.condition,enumerable:true,configurable:true})}
}
export function replaceCSSRuleData(rule,{selector,style,list}){const state=rules.get(rule);if(!state)return;if(selector!==undefined)state.selector=selector;if(style!==undefined){registerCSSDeclaration(style);state.style=style}if(list!==undefined)state.list=list;state.version++}
export function readCSSRule(rule){const state=rules.get(rule);if(!state)throw Error('A genuine CSS rule producer is required');return state}
export function registerCSSSheet(sheet,{authority,list,media:medium,disabled=false,observe}){if(sheets.has(sheet))return;registerCSSMediaList(medium,authority);sheets.set(sheet,{sheet,list,media:medium,disabled:!!disabled,observe,version:1});const fields=authorities.get(authority);if(fields){define(sheet,'disabled',{...fields.disabled,enumerable:true,configurable:true});define(sheet,'cssRules',{...fields.ruleList,enumerable:true,configurable:true})}}
export function readCSSSheet(sheet){const state=sheets.get(sheet);if(!state)throw Error('A genuine CSS sheet producer is required');return state}
