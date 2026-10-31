// Independent std-JSON f64 token parser. Grammar is scanned before numerical
// conversion; whitespace/empty/partial tokens never use JavaScript coercion.
const errors=new WeakSet(),number=Number,lower=String.prototype.toLowerCase;
function fail(message){const error=new Error(message);errors.add(error);throw error}
export const protocolFloatError=error=>errors.has(error)?error.message:undefined;
const digit=(code,radix)=>code>=48&&code<=57?code-48:radix===16&&code>=65&&code<=70?code-55:radix===16&&code>=97&&code<=102?code-87:-1;
function exponent(text,limit){let index=0,sign=1,value=0;if(text[index]==='+'||text[index]==='-'){if(text[index++]==='-')sign=-1}for(;index<text.length;index++){value=Math.min(limit,value*10+(text.charCodeAt(index)-48))}return sign*value}
function binary64(coefficient,power,sticky,negative){
 if(coefficient===0n)return negative?-0:0;
 const bits=coefficient.toString(2).length,top=bits-1+power;if(top>1023)return negative?-Infinity:Infinity;if(top< -1075)return negative?-0:0;
 const unit=Math.max(-1074,top-52),shift=unit-power;let rounded;
 if(shift>0){const n=BigInt(shift),whole=coefficient>>n,discarded=coefficient-(whole<<n),half=1n<<(n-1n);rounded=whole+(discarded>half||discarded===half&&(sticky||(whole&1n)===1n)?1n:0n)}else rounded=coefficient<<BigInt(-shift);
 const value=number(rounded)*2**unit;return negative?-value:value;
}
export function parseProtocolFloat(value){
 if(typeof value==='number')return value;if(typeof value!=='string')fail('UnexpectedToken');
 const source=value;if(!source.length)fail('InvalidCharacter');let index=0,negative=false;
 if(source[index]==='+'||source[index]==='-'){negative=source[index++]==='-';if(index===source.length)fail('InvalidCharacter')}
 const special=Reflect.apply(lower,source.slice(index),[]);
 if(special==='inf'||special==='infinity')return negative?-Infinity:Infinity;if(special==='nan')return negative?-NaN:NaN;
 const hexadecimal=source[index]==='0'&&(source[index+1]==='x'||source[index+1]==='X');if(hexadecimal)index+=2;
 const radix=hexadecimal?16:10;
 function digits(base){let result='',seen=false,lastDigit=false;while(index<source.length){const code=source.charCodeAt(index),d=digit(code,base);if(d>=0&&d<base){result+=source[index++];seen=lastDigit=true;continue}if(source[index]==='_'){if(!lastDigit)fail('InvalidCharacter');index++;const next=digit(source.charCodeAt(index),base);if(next<0||next>=base)fail('InvalidCharacter');lastDigit=false;continue}break}return{result,seen}}
 const integer=digits(radix);let fraction={result:'',seen:false};if(source[index]==='.'){index++;fraction=digits(radix)}
 if(!integer.seen&&!fraction.seen)fail('InvalidCharacter');
 let exp='';const marker=source[index];if(marker&&(hexadecimal?marker==='p'||marker==='P':marker==='e'||marker==='E')){index++;if(source[index]==='+'||source[index]==='-')exp=source[index++];const parsed=digits(10);if(!parsed.seen)fail('InvalidCharacter');exp+=parsed.result}
 if(index!==source.length)fail('InvalidCharacter');
 if(!hexadecimal){
  // Only accepted decimal grammar reaches the engine's correctly rounded
  // decimal-to-binary64 primitive. Number does not decide token acceptance.
  return number((negative?'-':'')+(integer.result||'0')+(fraction.seen?'.'+fraction.result:'')+(exp?'e'+exp:''));
 }
 const significant=(integer.result+fraction.result).replace(/^0+/, '');if(!significant)return negative?-0:0;
 // Keep sufficient exact binary guard bits and a sticky tail. This avoids
 // constructing an unbounded BigInt for a long, otherwise valid hex token.
 const kept=significant.slice(0,64),tail=significant.slice(64),power=(exp?exponent(exp,source.length*4+10000):0)-fraction.result.length*4+tail.length*4;
 return binary64(BigInt('0x'+kept),power,/[1-9a-fA-F]/.test(tail),negative);
}
