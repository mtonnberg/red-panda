import{DEFAULT_POLICY,UNSAFE_POLICY,HTML,SVG,MATH}from'./sanitizer-policy.js';
const clone=value=>value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(clone):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]));
const key=value=>JSON.stringify([value.namespace,value.name]),piKey=value=>value.target;
const compare=(a,b)=>a.namespace===b.namespace?(a.name<b.name?-1:a.name>b.name?1:0):a.namespace===null?-1:b.namespace===null?1:a.namespace<b.namespace?-1:1;
const invalid=()=>{throw Error('invalid Sanitizer configuration')};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const data=value=>value.namespace===null&&value.name.startsWith('data-');
function list(values,type,duplicates=true){if(values===undefined)return undefined;const out=[],seen=new Set();for(const value of values){const entry=clone(value),identity=type==='pi'?piKey(entry):key(entry);if(seen.has(identity)){if(duplicates)invalid();continue}seen.add(identity);out.push(entry)}return out.sort(type==='pi'?(a,b)=>a.target<b.target?-1:a.target>b.target?1:0:compare)}
function has(values,entry,type){return!!values?.some(value=>(type==='pi'?piKey(value):key(value))===(type==='pi'?piKey(entry):key(entry)))}
function remove(values,entry,type){if(!values)return false;const index=values.findIndex(value=>(type==='pi'?piKey(value):key(value))===(type==='pi'?piKey(entry):key(entry)));if(index<0)return false;values.splice(index,1);return true}
function add(values,entry,type){if(has(values,entry,type))return false;values.push(clone(entry));values.sort(type==='pi'?(a,b)=>a.target<b.target?-1:a.target>b.target?1:0:compare);return true}
function root(entry){return entry.namespace===HTML&&entry.name==='html'||entry.namespace===SVG&&entry.name==='svg'||entry.namespace===MATH&&entry.name==='math'}
function canonicalElement(entry){const value={name:entry.name,namespace:entry.namespace};if(entry.attributes!==undefined)value.attributes=list(entry.attributes,'attr');if(entry.removeAttributes!==undefined)value.removeAttributes=list(entry.removeAttributes,'attr');if(value.attributes===undefined&&value.removeAttributes===undefined)value.removeAttributes=[];return value}
function validate(config){
 for(const[a,b]of[['elements','removeElements'],['attributes','removeAttributes'],['processingInstructions','removeProcessingInstructions']])if(config[a]!==undefined&&config[b]!==undefined)invalid();
 if(config.attributes===undefined&&config.dataAttributes!==undefined)invalid();
 for(const entry of config.replaceWithChildrenElements??[])if(root(entry)||has(config.elements,entry)||has(config.removeElements,entry))invalid();
 for(const entry of config.elements??[]){
  if(entry.attributes!==undefined&&entry.removeAttributes!==undefined&&config.attributes===undefined)invalid();
  for(const attr of entry.attributes??[]){if(has(config.attributes,attr)||has(config.removeAttributes,attr)||config.dataAttributes&&data(attr))invalid();}
  for(const attr of entry.removeAttributes??[]){if(config.attributes!==undefined?!has(config.attributes,attr):has(config.removeAttributes,attr))invalid();if(has(entry.attributes,attr))invalid();}
 }
 if(config.dataAttributes)for(const attr of config.attributes??[])if(data(attr))invalid();
 return config;
}
export function canonicalConfig(input,safe=false){
 if(input===undefined||input==='default')return clone(DEFAULT_POLICY);
 const config={};
 if(input.elements!==undefined)config.elements=list(input.elements.map(canonicalElement),'elem');else config.removeElements=list(input.removeElements??[],'elem');
 const unwrap=list(input.replaceWithChildrenElements??[],'elem');if(unwrap.length)config.replaceWithChildrenElements=unwrap;
 if(input.attributes!==undefined)config.attributes=list(input.attributes,'attr');else config.removeAttributes=list(input.removeAttributes??[],'attr');
 if(input.processingInstructions!==undefined)config.processingInstructions=list(input.processingInstructions,'pi');else config.removeProcessingInstructions=list(input.removeProcessingInstructions??[],'pi');
 config.comments=input.comments??!safe;if(config.attributes!==undefined)config.dataAttributes=input.dataAttributes??!safe;else if(input.dataAttributes!==undefined)invalid();
 config.javascriptURLs=input.javascriptURLs??!safe;
 for(const[a,b]of[['elements','removeElements'],['attributes','removeAttributes'],['processingInstructions','removeProcessingInstructions']])if(input[a]!==undefined&&input[b]!==undefined)invalid();
 return validate(config);
}
export function configCopy(config){return clone(config)}
function settle(config){if(config.replaceWithChildrenElements?.length===0)delete config.replaceWithChildrenElements;return config}
export function modifyConfig(config,method,input){
 const next=clone(config);
 if(method==='setComments'||method==='setJavascriptURLs'){next[method==='setComments'?'comments':'javascriptURLs']=input;}
 else if(method==='setDataAttributes'){
  if(next.attributes===undefined)return false;next.dataAttributes=input;if(input){next.attributes=next.attributes.filter(a=>!data(a));for(const e of next.elements??[])if(e.attributes)e.attributes=e.attributes.filter(a=>!data(a));}
 }else if(method==='allowElement'){
  if(next.elements){const value=canonicalElement({...input,attributes:input.attributes===undefined?undefined:list(input.attributes,'attr',false),removeAttributes:input.removeAttributes===undefined?undefined:list(input.removeAttributes,'attr',false)});if(value.attributes)value.attributes=value.attributes.filter(a=>!has(next.attributes,a)&&!has(next.removeAttributes,a)&&!(next.dataAttributes&&data(a)));if(value.removeAttributes)value.removeAttributes=value.removeAttributes.filter(a=>next.attributes?has(next.attributes,a):!has(next.removeAttributes,a));remove(next.elements,value);add(next.elements,value);remove(next.replaceWithChildrenElements,value);}
  else{if(input.attributes!==undefined||input.removeAttributes!==undefined)return false;remove(next.removeElements,input);remove(next.replaceWithChildrenElements,input);}
 }else if(method==='removeElement'||method==='replaceElementWithChildren'){
  const value={name:input.name,namespace:input.namespace};if(method==='replaceElementWithChildren'&&root(value))return false;
  if(next.elements)remove(next.elements,value);else if(method==='removeElement')add(next.removeElements,value);else remove(next.removeElements,value);
  if(method==='replaceElementWithChildren'){next.replaceWithChildrenElements??=[];add(next.replaceWithChildrenElements,value)}else remove(next.replaceWithChildrenElements,value);
 }else if(method==='allowAttribute'||method==='removeAttribute'){
  const allow=method==='allowAttribute';if(next.attributes){if(allow){if(!(next.dataAttributes&&data(input)))add(next.attributes,input)}else remove(next.attributes,input);}else if(allow)remove(next.removeAttributes,input);else add(next.removeAttributes,input);
  for(const e of next.elements??[]){remove(e.attributes,input);remove(e.removeAttributes,input)}
 }else if(method==='allowProcessingInstruction'||method==='removeProcessingInstruction'){
  const allow=method==='allowProcessingInstruction';if(next.processingInstructions){if(allow)add(next.processingInstructions,input,'pi');else remove(next.processingInstructions,input,'pi')}else if(allow)remove(next.removeProcessingInstructions,input,'pi');else add(next.removeProcessingInstructions,input,'pi');
 }else if(method==='removeUnsafe'){
  for(const entry of UNSAFE_POLICY.removeElements){if(next.elements)remove(next.elements,entry);else add(next.removeElements,entry);remove(next.replaceWithChildrenElements,entry)}
  for(const entry of UNSAFE_POLICY.removeAttributes){if(next.attributes)remove(next.attributes,entry);else add(next.removeAttributes,entry);for(const e of next.elements??[]){remove(e.attributes,entry);remove(e.removeAttributes,entry)}}
  next.javascriptURLs=false;
 }
 settle(next);try{validate(next)}catch{return false}if(equal(next,config))return false;for(const key of Object.keys(config))delete config[key];Object.assign(config,next);return true;
}
export function safeConfig(config){const value=clone(config);modifyConfig(value,'removeUnsafe');return value}
export function elementAction(config,namespace,name){const entry={namespace,name};if(has(config.replaceWithChildrenElements,entry))return'unwrap';return config.elements?has(config.elements,entry)?'keep':'remove':has(config.removeElements,entry)?'remove':'keep'}
export function attributeAllowed(config,element,attribute){
 const entry={name:attribute.localName,namespace:attribute.namespaceURI},rule=config.elements?.find(e=>e.name===element.localName&&e.namespace===element.namespaceURI);
 if(has(rule?.removeAttributes,entry))return false;if(has(rule?.attributes,entry))return true;
 if(config.attributes!==undefined)return has(config.attributes,entry)||config.dataAttributes&&data(entry);if(has(config.removeAttributes,entry))return false;return rule?.attributes!==undefined?has(rule.attributes,entry):true;
}
export function processingAllowed(config,target){const entry={target};return config.processingInstructions?has(config.processingInstructions,entry,'pi'):!has(config.removeProcessingInstructions,entry,'pi')}
