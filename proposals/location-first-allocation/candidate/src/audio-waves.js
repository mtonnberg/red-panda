// Independent Fourier synthesis. This module computes its tables from supplied
// coefficients; no observed samples or native engine code are loaded.
const f=Math.fround,pi=Math.PI,sin=Math.sin,cos=Math.cos,abs=Math.abs,min=Math.min,max=Math.max,floor=Math.floor,log2=Math.log2,pow=Math.pow;
const states=new WeakMap(),basic=new Map(),plans=new Map();
const Float=Float32Array,Double=Float64Array,slot=value=>Object.assign(Object.create(null),value);
function fftPlan(size){
 let plan=plans.get(size);if(plan)return plan;
 const angles=[];for(let length=2;length<=size;length*=2){const real=new Double(length/2),imag=new Double(length/2);for(let k=0;k<length/2;k++){real[k]=cos(2*pi*k/length);imag[k]=sin(2*pi*k/length)}angles.push({real,imag})}
 plan={angles};plans.set(size,plan);return plan;
}
// Standard iterative radix-two inverse transform, without a 1/N scale.
function inverse(real,imag){const size=real.length;let reversed=0;for(let i=1;i<size;i++){let mask=size/2;while(reversed&mask){reversed^=mask;mask/=2}reversed^=mask;if(i<reversed){[real[i],real[reversed]]=[real[reversed],real[i]];[imag[i],imag[reversed]]=[imag[reversed],imag[i]]}}
 const {angles}=fftPlan(size);for(let level=0,length=2;length<=size;level++,length*=2){const half=length/2,twiddle=angles[level];for(let base=0;base<size;base+=length)for(let k=0;k<half;k++){const a=base+k,b=a+half,x=real[b]*twiddle.real[k]-imag[b]*twiddle.imag[k],y=real[b]*twiddle.imag[k]+imag[b]*twiddle.real[k],r=real[a],i=imag[a];real[a]=r+x;imag[a]=i+y;real[b]=r-x;imag[b]=i-y}}
}
export function makeAudioWave(rate,real,imag,disableNormalization=false){
 const size=rate<=24000?2048:rate<=88200?4096:16384,half=size/2,rangeCount=3*log2(size),components=min(imag.length,half),tables=[],unique=new Map();let normalization=.5;
 for(let range=0;range<rangeCount;range++){
  const cutoff=min(components,floor(f(f(pow(2,f(-f(range*400)/1200)))*half))+1);
  if(unique.has(cutoff)){tables.push(unique.get(cutoff));continue}
  const re=new Double(size),im=new Double(size);for(let harmonic=1;harmonic<cutoff;harmonic++){re[harmonic]=re[size-harmonic]=real?.[harmonic]??0;im[harmonic]=-imag[harmonic];im[size-harmonic]=imag[harmonic]}
  inverse(re,im);const table=new Float(size);let peak=0;for(let i=0;i<size;i++){table[i]=re[i];peak=max(peak,abs(table[i]))}if(!range&&!disableNormalization&&peak)normalization=f(1/peak);for(let i=0;i<size;i++)table[i]=f(table[i]*normalization);unique.set(cutoff,table);tables.push(table);
 }
 const token=Object.freeze(Object.create(null));states.set(token,slot({size,rate,scale:f(size/rate),lowest:f(rate/size),tables}));return token;
}
export function basicAudioWave(rate,type){
 const key=rate+':'+type,existing=basic.get(key)?.deref();if(existing)return existing;
 const size=rate<=24000?2048:rate<=88200?4096:16384,imag=new Float(size/2),p=f(pi);
 for(let n=1;n<imag.length;n++){const term=f(2/f(n*p));if(type==='sine')imag[n]=n===1?1:0;else if(type==='square')imag[n]=n%2?f(2*term):0;else if(type==='sawtooth')imag[n]=n%2?term:-term;else if(type==='triangle')imag[n]=n%2?f(f(2*f(term*term))*(((n-1)/2)%2?-1:1)):0;else throw new TypeError('Unknown oscillator waveform')}
 const token=makeAudioWave(rate,null,imag);basic.set(key,new WeakRef(token));return token;
}
function select(state,frequency){const ratio=frequency?f(abs(frequency)/state.lowest):.5,pitch=max(0,min(state.tables.length-1,f(1+f(f(f(log2(ratio))*1200)/400)))),index=floor(pitch);return{high:state.tables[index],low:state.tables[min(index+1,state.tables.length-1)],blend:f(pitch-index)}}
function blend2(data,index,size){const base=floor(index)&(size-1),next=(base+1)&(size-1),t=f(f(index)-base),a=f(data.high[base]+f(t*f(data.high[next]-data.high[base]))),b=f(data.low[base]+f(t*f(data.low[next]-data.low[base])));return f(a+f(data.blend*f(b-a)))}
function interpolate(data,index,step,size){const base=floor(index),t=index-base;let hi=0,lo=0;if(abs(step)>=.3){const a=f(f(index)-(base&(size-1)));hi=(1-a)*data.high[base&(size-1)]+a*data.high[(base+1)&(size-1)];lo=(1-a)*data.low[base&(size-1)]+a*data.low[(base+1)&(size-1)]}else{
 const radius=abs(step)>=.16?1:2;for(let offset=-radius;offset<=radius;offset++){let weight=1;for(let other=-radius;other<=radius;other++)if(other!==offset)weight*=(t-other)/(offset-other);const i=(base+offset)&(size-1);hi+=weight*data.high[i];lo+=weight*data.low[i]}
 }return f((1-data.blend)*hi+data.blend*lo)}
const wrap=(index,size)=>index-floor(index/size)*size;
export function renderAudioWave(token,phase,frequencies,sampleAccurate=false){
 const state=states.get(token);if(!state)throw new TypeError('Invalid private wave');const {size,scale}=state,length=frequencies.length,output=new Float(length);let index=wrap(phase,size);
 if(!sampleAccurate){const frequency=frequencies[0]??0,step=f(frequency*scale),data=select(state,frequency);if(step>=.3){
   const lanes=[0,1,2,3].map(n=>f(wrap(f(index+f(n*step)),size))),jump=f(4*step),blocks=floor(length/4);
   for(let block=0;block<blocks;block++)for(let lane=0;lane<4;lane++){output[block*4+lane]=blend2(data,lanes[lane],size);lanes[lane]=f(wrap(f(lanes[lane]+jump),size))}
   let tail=wrap(index+f(blocks*4*step),size);for(let i=blocks*4;i<length;i++){output[i]=blend2(data,tail,size);tail=wrap(tail+step,size)}index=wrap(index+f(length*step),size);
  }else{for(let i=0;i<length;i++){output[i]=interpolate(data,index,step,size);index=wrap(index+step,size)}}
 }else{
  const inverseScale=f(1/scale);for(let start=0;start<length;start+=4){const count=min(4,length-start),steps=[],positions=[],data=[];let total=0,big=count===4;for(let lane=0;lane<count;lane++){const step=f(frequencies[start+lane]*scale);positions.push(wrap(index+total,size));steps.push(step);data.push(select(state,f(inverseScale*step)));big=big&&abs(step)>=.3;total+=step}for(let lane=0;lane<count;lane++)output[start+lane]=big?blend2(data[lane],positions[lane],size):interpolate(data[lane],positions[lane],steps[lane],size);index=wrap(index+total,size)}
 }
 return slot({samples:output,phase:index});
}
export function audioWaveScale(token){const state=states.get(token);if(!state)throw new TypeError('Invalid private wave');return state.scale}
