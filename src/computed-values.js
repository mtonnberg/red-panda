import {createGeometryKernel} from './geometry.js';
const {DOMMatrix}=createGeometryKernel();
const matrixFields=Array.from({length:16},(_,index)=>`m${Math.floor(index/4)+1}${index%4+1}`);
const format=value=>value.toPrecision(6).replace(/(\.\d*?[1-9])0+(?=e|$)|\.0+(?=e|$)/g,'$1');

/** Computed transform serialization uses real 4x4 arithmetic. Native's
 * transform profile retains raw magnitudes for absolute-length/percent units,
 * while em/rem and calc remain unsupported and resolve to none. */
export function computedTransform(value){
 if(!value||value.trim().toLowerCase()==='none')return'none';
 try{
  const input=value.replace(/([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|cm|mm|q|in|pt|pc|%)(?=\s|,|\))/gi,'$1px');
  const matrix=new DOMMatrix(input),values=matrixFields.map(key=>matrix[key]);if(!values.every(Number.isFinite))return'none';
  return matrix.is2D?`matrix(${[0,1,4,5,12,13].map(index=>format(values[index])).join(', ')})`:`matrix3d(${values.map(format).join(', ')})`;
 }catch{return'none'}
}

export function computedFontSize(value,parent='16px',root='16px',{isRoot=false}={}){
 const keyword=value.trim().toLowerCase(),parentPixels=Number.parseFloat(parent)||16,rootPixels=isRoot?16:Number.parseFloat(root)||16;
 const keywords={'xx-small':9,'x-small':10,small:13,medium:16,large:18,'x-large':24,'xx-large':32,'xxx-large':48};
 if(Object.hasOwn(keywords,keyword))return`${keywords[keyword]}px`;
 if(keyword==='larger')return`${parentPixels*1.2}px`;if(keyword==='smaller')return`${parentPixels/1.2}px`;
 const length=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|em|rem|%|pt|pc|in|cm|mm|q)$/i.exec(keyword);if(!length)return value;
 const units={px:1,em:parentPixels,rem:rootPixels,'%':parentPixels/100,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4,q:96/101.6};
 return`${Number(length[1])*units[length[2]]}px`;
}
