import {makeAudioWave,basicAudioWave,renderAudioWave,audioWaveScale} from './audio-waves.js';
import 'jsdom';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {createInvocationTrampoline} from './invocation.js';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const require=createRequire(import.meta.url),{implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {setup:setupTarget}=require('jsdom/lib/jsdom/living/generated/EventTarget.js'),{setup:setupEvent}=require('jsdom/lib/jsdom/living/generated/Event.js'),{convert:convertListener}=require('jsdom/lib/jsdom/living/generated/EventListener.js');
const targetBackends=new WeakMap(),eventBackends=new WeakMap(),listenerBackends=new WeakMap();
const reportException=require('jsdom/lib/jsdom/living/helpers/runtime-script-errors.js');
const installed=new WeakMap(),shared={buffers:new WeakMap(),contexts:new WeakMap(),nodes:new WeakMap(),params:new WeakMap(),events:new WeakMap(),waves:new WeakMap()};
const typed=Object.getPrototypeOf(Float32Array.prototype),typedLength=Object.getOwnPropertyDescriptor(typed,'length').get;
const hostSetTimeout=setTimeout,hostClearTimeout=clearTimeout,hostNow=performance.now.bind(performance);
function audioFactory(g,bridge){
 const {buffers,contexts,nodes,params,events,waves}=bridge.shared;
 const TypeError=g.TypeError,RangeError=g.RangeError,Exception=g.DOMException,EventTarget=g.EventTarget,Event=g.Event,Promise=g.Promise,F32=g.Float32Array;
 const Map=bridge.Map,Set=bridge.Set,String=g.String,internal=()=>new bridge.Array(),promiseReject=Promise.reject,addListener=EventTarget.prototype.addEventListener,removeListener=EventTarget.prototype.removeEventListener;
 const define=Object.defineProperty,create=Object.create,setPrototype=Object.setPrototypeOf,getDescriptor=Object.getOwnPropertyDescriptor,keys=Object.getOwnPropertyNames;
 const finite=Number.isFinite,fround=Math.fround,ceil=Math.ceil,floor=Math.floor,round=Math.round,min=Math.min,max=Math.max,abs=Math.abs,pow=Math.pow,exp=Math.exp;
 const constant=3.4028234663852886e38,token=bridge.token,record=bridge.record,apply=Reflect.apply;
 const error=()=>new TypeError('invalid argument'),illegal=()=>{throw new TypeError('Illegal Constructor')};
 const dom=(name)=>new Exception({NotSupportedError:'The operation is not supported',IndexSizeError:'Index or size is negative or greater than the allowed amount',InvalidStateError:'The object is in an invalid state',InvalidAccessError:'The object does not support the operation or argument'}[name]??'The operation is not supported',name);
 const brand=(map,value)=>{const state=map.get(value);if(!state)throw new TypeError('Illegal invocation');return state};
 const dictionary=value=>{if(value==null)return{};if(typeof value!=='object'&&typeof value!=='function')throw error();return value};
 const number=value=>+value,uint=value=>number(value)>>>0,restricted=value=>{const result=number(value);if(!finite(result))throw new TypeError('');return result;},float=value=>{const result=fround(number(value));if(!finite(result))throw new TypeError('');return result};
 const symbolDescription=getDescriptor(g.Symbol.prototype,'description').get,audioText=value=>typeof value==='symbol'?apply(symbolDescription,value,[])??'':String(value);
 const nonnegative=value=>{const result=restricted(value);if(result<0)throw new RangeError('');return result};
 const arrayLength=value=>bridge.arrayLength(value);
 function publish(value,kind){bridge.publish(value,kind);return value;}
 function validate(channels,length,rate){if(!length||!channels||channels>32||!finite(rate)||rate<3000||rate>768000)throw dom('NotSupportedError');if(length*channels>33554432)throw dom('NotSupportedError');}
 function channel(state,index){index=uint(index);if(index>=state.channels.length)throw dom('IndexSizeError');return state.channels[index];}
 function bufferState(length,channels,rate){validate(channels,length,rate);const state=record({length,rate,channels:internal()});for(let index=0;index<channels;index++)state.channels.push(new F32(length));return state;}
 function makeBuffer(length,channels,rate){const result=create(AudioBuffer.prototype);buffers.set(result,bufferState(length,channels,rate));return publish(result,'AudioBuffer');}
 class AudioBuffer{
  constructor(options){if(!arguments.length)throw error();options=dictionary(options);const lengthValue=options.length;if(!('length'in options))throw error();const length=uint(lengthValue),channelsValue=options.numberOfChannels,channels=channelsValue===undefined?1:uint(channelsValue);if(!('sampleRate'in options))throw error();const rate=fround(number(options.sampleRate));buffers.set(this,bufferState(length,channels,rate));publish(this,'AudioBuffer');}
  get sampleRate(){return brand(buffers,this).rate;}
  get length(){return brand(buffers,this).length;}
  get duration(){const state=brand(buffers,this);return state.length/state.rate;}
  get numberOfChannels(){return brand(buffers,this).channels.length;}
  getChannelData(index){const state=brand(buffers,this);if(!arguments.length)throw error();return channel(state,index);}
  copyFromChannel(destination,index,start=0){const state=brand(buffers,this);if(arguments.length<2)throw error();if(!bridge.isFloat32(destination))throw new TypeError('');const source=channel(state,index),offset=uint(start),length=min(arrayLength(destination),max(0,arrayLength(source)-offset));for(let at=0;at<length;at++)destination[at]=source[offset+at];}
  copyToChannel(source,index,start=0){const state=brand(buffers,this);if(arguments.length<2)throw error();if(!bridge.isFloat32(source))throw new TypeError('');const destination=channel(state,index),offset=uint(start),length=min(arrayLength(source),max(0,arrayLength(destination)-offset));const snapshot=internal();for(let at=0;at<length;at++)snapshot.push(source[at]);for(let at=0;at<length;at++)destination[offset+at]=snapshot[at];}
 }
 function makeParam(context,value,automation='k-rate'){const key=record(),state=record({context,canonical:key,wrapper:null,value:fround(value),defaultValue:fround(value),automation,fixed:automation==='k-rate',incoming:new Set(),events:internal(),sequence:0});params.set(key,state);return key;}
 function initialParam(value,input){const state=brand(params,value);state.value=max(state.min??-constant,min(state.max??constant,float(input)));}
 function paramView(value){const state=brand(params,value);if(!state.wrapper){const wrapper=create(AudioParam.prototype);params.set(wrapper,state);state.wrapper=wrapper;publish(wrapper,'AudioParam');}return state.wrapper;}

 function addParam(object,type,value,time,extra){const state=brand(params,object);value=float(value);time=nonnegative(time);automationOverlap(state,time);state.events.push(record({type,value,time,extra,sequence:state.sequence++}));state.events.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);return object;}
 function paramValue(state,time){let value=state.value,previousTime=0,target=null;
  const current=at=>target?(target.constant===0?target.value:target.value+(value-target.value)*exp(-(at-previousTime)/target.constant)):value;
  for(const event of state.events){
   if(event.type==='linear'||event.type==='exponential'){
    if(event.time>time){const fraction=event.time===previousTime?1:max(0,min(1,(time-previousTime)/(event.time-previousTime)));return event.type==='linear'?value+(event.value-value)*fraction:value*pow(event.value/value,fraction);}
    value=event.value;previousTime=event.time;target=null;continue;
   }
   if(event.time>time)break;
   value=current(event.time);target=null;
   if(event.type==='target'){target=record({value:event.value,constant:event.extra});previousTime=event.time;}
   else if(event.type==='curve'){const curve=event.extra;const end=curve.hold??(event.time+curve.duration);if(time<end){const at=min(curve.values.length-1,max(0,(time-event.time)/curve.duration*(curve.values.length-1))),low=floor(at);return curve.values[low]+(curve.values[min(low+1,curve.values.length-1)]-curve.values[low])*(at-low);}const at=min(curve.values.length-1,max(0,(end-event.time)/curve.duration*(curve.values.length-1))),low=floor(at);value=curve.values[low]+(curve.values[min(low+1,curve.values.length-1)]-curve.values[low])*(at-low);previousTime=end;}
   else{value=event.value;previousTime=event.time;}
  }
  return current(time);
 }
 function automationOverlap(state,time,end=time){for(const event of state.events){const otherEnd=event.type==='curve'?(event.extra.hold??(event.time+event.extra.duration)):event.time;if(event.type==='curve'&&(end===time?time>event.time&&time<otherEnd:time<otherEnd&&end>event.time)||end>time&&event.time>time&&event.time<end)throw dom('NotSupportedError');}}

 class AudioParam{
  constructor(){illegal();}
  get value(){const state=brand(params,this),context=contexts.get(state.context);return context.realtime||context.frame?max(state.min??-constant,min(state.max??constant,fround(paramValue(state,updateClock(context)/context.rate)))):state.value;}
  set value(value){const state=brand(params,this);state.value=max(state.min??-constant,min(state.max??constant,float(value)));}
  get automationRate(){return brand(params,this).automation;}
  set automationRate(value){const state=brand(params,this);value=String(value);if(!['a-rate','k-rate'].includes(value))return;if(value!==state.automation&&state.fixed)throw dom('InvalidStateError');state.automation=value;}
  get defaultValue(){return brand(params,this).defaultValue;}
  get minValue(){return brand(params,this).min??-constant;}
  get maxValue(){return brand(params,this).max??constant;}
  setValueAtTime(value,time){brand(params,this);if(arguments.length<2)throw error();return addParam(this,'set',value,time);}
  linearRampToValueAtTime(value,time){brand(params,this);if(arguments.length<2)throw error();return addParam(this,'linear',value,time);}
  exponentialRampToValueAtTime(value,time){brand(params,this);if(arguments.length<2)throw error();value=float(value);if(value<=0)throw new RangeError('');return addParam(this,'exponential',value,time);}
  setTargetAtTime(value,time,constant){brand(params,this);if(arguments.length<3)throw error();constant=nonnegative(constant);return addParam(this,'target',value,time,constant);}
  setValueCurveAtTime(values,time,duration){const state=brand(params,this);if(arguments.length<3)throw error();const original=values;values=internal();const typed=bridge.isFloat32(original);if(!typed&&!bridge.isArray(original))throw error();const count=typed?arrayLength(original):original.length;for(let index=0;index<count;index++)values.push(float(original[index]));const length=values.length;if(length<2)throw dom('InvalidStateError');time=nonnegative(time);duration=nonnegative(duration);if(!duration)throw new RangeError('');automationOverlap(state,time,time+duration);const copy=internal();for(let at=0;at<length;at++)copy.push(float(values[at]));state.events.push(record({type:'curve',time,extra:record({values:copy,duration}),sequence:state.sequence++}));state.events.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);return this;}
  cancelScheduledValues(time){const state=brand(params,this);if(!arguments.length)throw error();time=nonnegative(time);state.events=state.events.filter(event=>event.time<time);return this;}
  cancelAndHoldAtTime(time){const state=brand(params,this);if(!arguments.length)throw error();time=nonnegative(time);const value=paramValue(state,time);let ramp=null;for(const event of state.events){if(event.type==='curve'&&event.time<time&&(event.extra.hold??event.time+event.extra.duration)>time)event.extra=record({values:event.extra.values,duration:event.extra.duration,hold:time});if(!ramp&&event.time>=time&&(event.type==='linear'||event.type==='exponential'))ramp=event;}state.events=state.events.filter(event=>event.time<time);if(ramp)state.events.push(record({type:ramp.type,value,time,sequence:state.sequence++}));return addParam(this,'set',value,time);}
 }
 function handler(target,state,key,value){const next=typeof value==='function'?value:null;state.handlers[key]=next;if(next&&!state.relays[key]){const relay=event=>{const callback=state.handlers[key];if(callback)apply(callback,target,[event]);};state.relays[key]=relay;bridge.listen(target,key,relay,true);}else if(!next&&state.relays[key]){bridge.listen(target,key,state.relays[key],false);delete state.relays[key];}}
 class AudioNode extends EventTarget{
  constructor(context,key){if(key!==token)illegal();brand(contexts,context);const value=create(new.target.prototype);bridge.target(value);nodes.set(value,record({context,inputs:1,outputs:1,channelCount:2,mode:'max',interpretation:'speakers',connections:new Set(),incoming:new Set(),handlers:record(),relays:record()}));return value;}
  get context(){return brand(nodes,this).context;}
  get numberOfInputs(){return brand(nodes,this).inputs;}
  get numberOfOutputs(){return brand(nodes,this).outputs;}
  get channelCount(){return brand(nodes,this).channelCount;}
  set channelCount(value){const state=brand(nodes,this);value=uint(value);if(!value||value>32)throw dom('NotSupportedError');if(state.kind==='destination'&&contexts.get(state.context).realtime&&value>2)throw dom('IndexSizeError');state.channelCount=value;}
  get channelCountMode(){return brand(nodes,this).mode;}
  set channelCountMode(value){const state=brand(nodes,this);value=String(value);if(['max','clamped-max','explicit'].includes(value))state.mode=value;}
  get channelInterpretation(){return brand(nodes,this).interpretation;}
  set channelInterpretation(value){const state=brand(nodes,this);value=String(value);if(['speakers','discrete'].includes(value))state.interpretation=value;}
  connect(destination,output=0,input=0){const state=brand(nodes,this);if(!arguments.length)throw error();const next=nodes.get(destination)??params.get(destination);if(!next)throw error();output=uint(output);if(!params.has(destination))input=uint(input);if(next.context!==state.context)throw dom('InvalidAccessError');if(params.has(destination)&&!next.inputSupported)throw dom('NotSupportedError');if(output>=state.outputs||!params.has(destination)&&input>=next.inputs)throw dom('IndexSizeError');state.connections.add(params.has(destination)?next.canonical:destination);next.incoming.add(this);return params.has(destination)?undefined:destination;}
  disconnect(destination,output=0,input=0){const state=brand(nodes,this);if(!arguments.length||typeof destination==='number'){if(arguments.length&&uint(destination)>=state.outputs)throw dom('IndexSizeError');for(const value of state.connections)(nodes.get(value)??params.get(value)).incoming.delete(this);state.connections.clear();return;}const next=nodes.get(destination)??params.get(destination);if(!next)throw error();if(uint(output)>=state.outputs||!params.has(destination)&&uint(input)>=next.inputs)throw dom('IndexSizeError');if(!state.connections.delete(params.has(destination)?next.canonical:destination))throw dom('InvalidAccessError');next.incoming.delete(this);}

 }
 class AudioDestinationNode extends AudioNode{constructor(context,key){super(context,key);if(key!==token)illegal();const state=nodes.get(this),ctx=contexts.get(context);state.channelCount=ctx.channels;state.mode='explicit';state.kind='destination';publish(this,'AudioDestinationNode');}get maxChannelCount(){return brand(contexts,brand(nodes,this).context).channels;}}
 function sourceBrand(value){const state=brand(nodes,value);if(!['buffer','constant','oscillator'].includes(state.kind))throw new TypeError('Illegal invocation');return state;}
 function bufferBrand(value){const state=brand(nodes,value);if(state.kind!=='buffer')throw new TypeError('Illegal invocation');return state;}
 class AudioScheduledSourceNode extends AudioNode{
  constructor(context,key){super(context,key);if(key!==token)illegal();const state=nodes.get(this);state.kind='source';state.inputs=0;state.started=false;state.ended=false;state.stop=Infinity;contexts.get(context).sources.add(this);}
  start(when=0){const state=sourceBrand(this);when=nonnegative(when);if(state.started)throw dom('InvalidStateError');state.started=true;state.when=contexts.get(state.context).realtime?max(when,updateClock(contexts.get(state.context))/contexts.get(state.context).rate):when;}
  stop(when=0){const state=sourceBrand(this);when=nonnegative(when);if(!state.started)throw dom('InvalidStateError');state.stop=when;}
  get onended(){return sourceBrand(this).handlers.ended??null;}
  set onended(value){handler(this,sourceBrand(this),'ended',value);}
 }
 class AudioBufferSourceNode extends AudioScheduledSourceNode{
  constructor(context,options={}){if(!arguments.length||!contexts.has(context))throw error();super(context,token);options=dictionary(options);const state=nodes.get(this);state.kind='buffer';state.buffer=null;state.bufferSet=false;state.playbackRate=makeParam(context,1);state.detune=makeParam(context,0);state.loop=false;state.loopStart=0;state.loopEnd=0;
   const buffer=options.buffer;if(buffer!==undefined)this.buffer=buffer;const detune=options.detune;if(detune!==undefined)initialParam(state.detune,detune);const loop=options.loop;if(loop!==undefined)state.loop=!!loop;const loopEnd=options.loopEnd;if(loopEnd!==undefined)state.loopEnd=restricted(loopEnd);const loopStart=options.loopStart;if(loopStart!==undefined)state.loopStart=restricted(loopStart);const playback=options.playbackRate;if(playback!==undefined)initialParam(state.playbackRate,playback);publish(this,'AudioBufferSourceNode');}
  get buffer(){return bufferBrand(this).buffer;}
  set buffer(value){const state=bufferBrand(this);if(value!==null&&!buffers.has(value))throw error();if(value!==null&&state.bufferSet)throw dom('InvalidStateError');state.buffer=value;if(value!==null)state.bufferSet=true;}
  get playbackRate(){return paramView(bufferBrand(this).playbackRate);}
  get detune(){return paramView(bufferBrand(this).detune);}
  get loop(){return bufferBrand(this).loop;}
  set loop(value){bufferBrand(this).loop=!!value;}
  get loopStart(){return bufferBrand(this).loopStart;}
  set loopStart(value){bufferBrand(this).loopStart=restricted(value);}
  get loopEnd(){return bufferBrand(this).loopEnd;}
  set loopEnd(value){bufferBrand(this).loopEnd=restricted(value);}
  start(when=0,offset=0,duration){const state=bufferBrand(this);when=nonnegative(when);offset=nonnegative(offset);if(duration!==undefined)duration=nonnegative(duration);if(state.started)throw dom('InvalidStateError');state.started=true;state.when=contexts.get(state.context).realtime?max(when,updateClock(contexts.get(state.context))/contexts.get(state.context).rate):when;state.offset=offset;state.duration=duration;}
 }
 function nodeOptions(value,options){const state=nodes.get(value);for(const key of['channelCount','channelCountMode','channelInterpretation']){const entry=options[key];if(entry!==undefined){if(key==='channelCountMode'&&!['max','clamped-max','explicit'].includes(String(entry))||key==='channelInterpretation'&&!['speakers','discrete'].includes(String(entry)))throw error();value[key]=entry;}}}
 class GainNode extends AudioNode{
  constructor(context,options={}){if(!arguments.length||!contexts.has(context))throw error();super(context,token);options=dictionary(options);nodeOptions(this,options);const state=nodes.get(this);state.kind='gain';state.gain=makeParam(context,1,'a-rate');params.get(state.gain).inputSupported=true;const gain=options.gain;if(gain!==undefined)initialParam(state.gain,gain);publish(this,'GainNode');}
  get gain(){const state=brand(nodes,this);if(state.kind!=='gain')throw new TypeError('Illegal invocation');return paramView(state.gain);}
 }
 class ConstantSourceNode extends AudioScheduledSourceNode{
  constructor(context,options={}){if(!arguments.length||!contexts.has(context))throw error();super(context,token);options=dictionary(options);nodeOptions(this,options);const state=nodes.get(this);state.kind='constant';state.offsetParam=makeParam(context,1,'a-rate');const offset=options.offset;if(offset!==undefined)initialParam(state.offsetParam,offset);publish(this,'ConstantSourceNode');}
  get offset(){const state=brand(nodes,this);if(state.kind!=='constant')throw new TypeError('Illegal invocation');return paramView(state.offsetParam);}
 }
 function updateClock(state){if(state.realtime&&state.state==='running')state.frame=state.clockFrame+floor(max(0,(bridge.now()-state.clockStart))*state.rate/128000)*128;return state.frame;}
 function coefficients(value){if(value==null)return null;const typed=bridge.isFloat32(value);if(!typed&&!bridge.isArray(value))throw error();const out=internal(),count=typed?arrayLength(value):value.length;for(let i=0;i<count;i++)out.push(float(value[i]));return out;}
 function oscillatorBrand(value){const state=brand(nodes,value);if(state.kind!=='oscillator')throw new TypeError('Illegal invocation');return state;}
 class PeriodicWave{
  constructor(context,options={}){if(!arguments.length||!contexts.has(context))throw error();options=dictionary(options);const disabled=!!options.disableNormalization;let imag=coefficients(options.imag),real=coefficients(options.real);if(!imag&&!real){imag=internal();imag.push(0,1);real=internal();real.push(0,0);}else{const count=(real??imag).length;if(!imag){imag=internal();for(let i=0;i<count;i++)imag.push(0);}if(!real){real=internal();for(let i=0;i<count;i++)real.push(0);}}if(imag.length!==real.length||imag.length<2)throw dom('IndexSizeError');waves.set(this,bridge.makeWave(contexts.get(context).rate,real,imag,disabled));publish(this,'PeriodicWave');}
 }
 class OscillatorNode extends AudioScheduledSourceNode{
  constructor(context,options={}){if(!arguments.length||!contexts.has(context))throw error();super(context,token);options=dictionary(options);const state=nodes.get(this),ctx=contexts.get(context);state.kind='oscillator';state.frequency=makeParam(context,440,'a-rate');state.detune=makeParam(context,0,'a-rate');params.get(state.frequency).min=-ctx.rate/2;params.get(state.frequency).max=ctx.rate/2;params.get(state.detune).min=-153600;params.get(state.detune).max=153600;state.phase=0;state.played=false;nodeOptions(this,options);
   const detune=options.detune;if(detune!==undefined)initialParam(state.detune,detune);const frequency=options.frequency;if(frequency!==undefined)initialParam(state.frequency,frequency);const wave=options.periodicWave,typeValue=options.type,type=typeValue===undefined?'sine':audioText(typeValue);if(!['sine','square','sawtooth','triangle','custom'].includes(type))throw error();if(wave!==undefined&&wave!==null)this.setPeriodicWave(wave);else{if(type==='custom')throw dom('InvalidStateError');state.type=type;state.wave=bridge.basicWave(ctx.rate,type);}publish(this,'OscillatorNode');}
  get type(){return oscillatorBrand(this).type;}
  set type(value){const state=oscillatorBrand(this);value=audioText(value);if(!['sine','square','sawtooth','triangle','custom'].includes(value))return;if(value==='custom')throw dom('InvalidStateError');state.type=value;state.wave=bridge.basicWave(contexts.get(state.context).rate,value);}
  get frequency(){return paramView(oscillatorBrand(this).frequency);}
  get detune(){return paramView(oscillatorBrand(this).detune);}
  setPeriodicWave(value){const state=oscillatorBrand(this),wave=waves.get(value);if(!wave)throw error();state.type='custom';state.wave=wave;}
 }
 class BaseAudioContext extends EventTarget{
  constructor(key){if(key!==token)illegal();const value=create(new.target.prototype);bridge.target(value);return value;}
  get destination(){return brand(contexts,this).destination;}
  get sampleRate(){return brand(contexts,this).rate;}
  get currentTime(){const state=brand(contexts,this);return updateClock(state)/state.rate;}
  get state(){return brand(contexts,this).state;}
  get onstatechange(){return brand(contexts,this).handlers.statechange??null;}
  set onstatechange(value){handler(this,brand(contexts,this),'statechange',value);}
  createBuffer(channels,length,rate){brand(contexts,this);if(arguments.length<3)throw error();return makeBuffer(uint(length),uint(channels),fround(number(rate)));}
  createBufferSource(){brand(contexts,this);return new AudioBufferSourceNode(this);}
  createConstantSource(){brand(contexts,this);return new ConstantSourceNode(this);}
  createGain(){brand(contexts,this);return new GainNode(this);}
  createOscillator(){brand(contexts,this);return new OscillatorNode(this);}
  createPeriodicWave(real,imag,options={}){brand(contexts,this);if(arguments.length<2)throw error();options=dictionary(options);return new PeriodicWave(this,{disableNormalization:options.disableNormalization,real,imag});}
 }
 class AudioContext extends BaseAudioContext{
  constructor(options={}){super(token);options=dictionary(options);const sample=options.sampleRate,rate=sample===undefined?48000:fround(number(sample));validate(2,1,rate);const state=record({channels:2,rate,frame:0,state:'running',realtime:true,sources:new Set(),handlers:record(),relays:record(),clockFrame:0,clockStart:0});contexts.set(this,state);state.destination=new AudioDestinationNode(this,token);state.clockStart=bridge.now();publish(this,'AudioContext');schedule(()=>fire(this,'statechange'));}
  get baseLatency(){const state=brand(contexts,this);if(!state.realtime)throw new TypeError('Illegal invocation');return fround(256/state.rate);}
  get outputLatency(){const state=brand(contexts,this);if(!state.realtime)throw new TypeError('Illegal invocation');return 0;}
  resume(){const state=contexts.get(this);if(!state?.realtime)return apply(promiseReject,Promise,[error()]);if(state.state==='closed')return apply(promiseReject,Promise,[dom('InvalidStateError')]);if(state.state==='suspended'){state.clockFrame=state.frame;state.clockStart=bridge.now();state.state='running';schedule(()=>fire(this,'statechange'));}return new Promise(resolve=>resolve());}
  suspend(){const state=contexts.get(this);if(!state?.realtime)return apply(promiseReject,Promise,[error()]);if(state.state==='closed')return apply(promiseReject,Promise,[dom('InvalidStateError')]);if(state.state==='running'){updateClock(state);state.state='suspended';schedule(()=>fire(this,'statechange'));}return new Promise(resolve=>resolve());}
  close(){const state=contexts.get(this);if(!state?.realtime)return apply(promiseReject,Promise,[error()]);if(state.state==='closed')return apply(promiseReject,Promise,[dom('InvalidStateError')]);updateClock(state);state.state='closed';schedule(()=>fire(this,'statechange'));return new Promise(resolve=>resolve());}
 }
 class OfflineAudioCompletionEvent extends Event{
  constructor(type,init){if(arguments.length<2)throw error();init=dictionary(init);const buffer=init.renderedBuffer;if(!buffers.has(buffer))throw error();const value=create(new.target.prototype);bridge.event(value,audioText(type),{bubbles:!!init.bubbles,cancelable:!!init.cancelable,composed:!!init.composed},false);events.set(value,buffer);publish(value,'OfflineAudioCompletionEvent');return value;}
  get renderedBuffer(){if(!events.has(this))throw new TypeError('Illegal invocation');return events.get(this);}
 }
 function fire(target,type,buffer){const event=create(Event.prototype);bridge.event(event,type,{bubbles:false,cancelable:false,composed:false},true);if(type==='complete'){setPrototype(event,OfflineAudioCompletionEvent.prototype);events.set(event,buffer);}bridge.dispatch(target,event);}
 function schedule(action,delay=0){bridge.schedule(action,delay);}

 function sourceFrames(source,ctx,quantumFrames,startFrame=0){const state=nodes.get(source);if(!state.started||state.ended)return record({ended:false,samples:null});if(state.kind==='oscillator'){const data=new F32(quantumFrames),start=ceil(state.when*ctx.rate),stop=ceil(state.stop*ctx.rate),offset=max(0,start-startFrame),count=max(0,min(quantumFrames,stop-startFrame)-offset),fp=params.get(state.frequency),dp=params.get(state.detune),frequencies=internal(),accurate=fp.automation==='a-rate'&&fp.events.length>0||dp.automation==='a-rate'&&dp.events.length>0;for(let i=0;i<count;i++){const absolute=startFrame+(accurate?i:offset),time=absolute/ctx.rate,fv=max(fp.min,min(fp.max,paramValue(fp,fp.automation==='k-rate'?startFrame/ctx.rate:time))),dv=max(dp.min,min(dp.max,paramValue(dp,dp.automation==='k-rate'?startFrame/ctx.rate:time)));frequencies.push(max(-ctx.rate/2,min(ctx.rate/2,fround(fround(fv)*fround(pow(2,fround(dv/1200)))))));}if(count){if(!state.played){state.phase=(start-state.when*ctx.rate)*(accurate?0:frequencies[0])*bridge.waveScale(state.wave);state.played=true;}const result=bridge.renderWave(state.wave,state.phase,frequencies,accurate);state.phase=result.phase;for(let i=0;i<count;i++)data[offset+i]=result.samples[i];}const samples=internal();samples.push(data);return record({ended:stop<=startFrame+quantumFrames,samples});}if(state.kind==='constant'){const data=new F32(quantumFrames),when=ceil(state.when*ctx.rate),stop=ceil(state.stop*ctx.rate),p=params.get(state.offsetParam);for(let frame=0;frame<quantumFrames;frame++){const absolute=startFrame+frame;if(absolute>=when&&absolute<stop)data[frame]=paramValue(p,(p.automation==='k-rate'?floor(absolute/128)*128:absolute)/ctx.rate);}const samples=internal();samples.push(data);return record({ended:stop<=startFrame+quantumFrames,samples});}const b=state.buffer===null?null:buffers.get(state.buffer),samples=internal();for(let ch=0;ch<(b?.channels.length??1);ch++)samples.push(new F32(quantumFrames));
  let position=state.position??(b?round((state.offset??0)*b.rate):0),consumed=state.consumed??0,started=false,ended=false;
  let loopStart=0,loopEnd=b?.length??0;
  if(b&&state.loop){const start=max(0,min(b.length,round(state.loopStart*b.rate))),end=state.loopEnd>0?max(0,min(b.length,round(state.loopEnd*b.rate))):b.length;if(start<b.length&&end>start){loopStart=start;loopEnd=end;}if(state.position===undefined&&position>=loopEnd)position=loopStart;}
  const when=ceil(state.when*ctx.rate),stop=ceil(state.stop*ctx.rate),duration=b&&state.duration!==undefined?state.duration*b.rate:Infinity;
  for(let frame=0;frame<quantumFrames;frame++){
   const absolute=startFrame+frame;if(absolute<when)continue;
   if(absolute>=stop||!b||consumed>=duration||!state.loop&&(position<0||position>=b.length)){ended=true;break;}
   started=true;
   if(state.loop){const span=loopEnd-loopStart;if(position>=loopEnd)position=loopStart+(position-loopEnd)%span;if(position<0){ended=true;break;}}
   const lower=floor(position),fraction=position-lower,next=state.loop&&lower+1>=loopEnd?loopStart:min(lower+1,b.length-1);
   for(let ch=0;ch<b.channels.length;ch++){const data=b.channels[ch];samples[ch][frame]=data[lower]+(data[next]-data[lower])*fraction;}
   const time=floor((startFrame+frame)/128)*128/ctx.rate,step=paramValue(params.get(state.playbackRate),time)*pow(2,paramValue(params.get(state.detune),time)/1200)*b.rate/ctx.rate;
   position+=step;consumed+=abs(step);
  }
  // The engine executes the full final quantum, even though only requested
  // output frames are returned. A source ending exactly at that boundary ends.
  if(started&&b&&!state.loop&&(position<0||position>=b.length)||started&&consumed>=duration||stop<=startFrame+quantumFrames)ended=true;
  state.position=position;state.consumed=consumed;return record({ended,samples});
 }
 function mix(samples,count,interpretation){const out=internal();for(let ch=0;ch<count;ch++)out.push(new F32(128));for(const source of samples){const channels=source.length;for(let ch=0;ch<count;ch++)for(let frame=0;frame<128;frame++){let value=0;if(interpretation==='discrete'){if(ch<channels)value=source[ch][frame];}else if(channels===1)value=source[0][frame];else if(count===1&&channels===2)value=(source[0][frame]+source[1][frame])*.5;else if(ch<channels)value=source[ch][frame];out[ch][frame]+=value;}}return out;}
 function graphQuantum(context,state,sourceOutputs,start){
  const cache=new Map(sourceOutputs),visiting=new Set(),stack=internal();stack.push(record({node:state.destination,done:false}));let allocated=0;
  while(stack.length){const entry=stack.pop(),node=entry.node;if(cache.has(node))continue;const ns=nodes.get(node);
   if(!entry.done){if(visiting.has(node))continue;visiting.add(node);stack.push(record({node,done:true}));for(const source of ns.incoming)if(!cache.has(source)&&!visiting.has(source))stack.push(record({node:source,done:false}));if(ns.gain)for(const source of params.get(ns.gain).incoming)if(!cache.has(source)&&!visiting.has(source))stack.push(record({node:source,done:false}));continue;}
   const inputs=internal();let channels=1;for(const source of ns.incoming){const value=cache.get(source);if(value){inputs.push(value);channels=max(channels,value.length);}}
   channels=ns.kind==='destination'?state.channels:ns.mode==='explicit'?ns.channelCount:ns.mode==='clamped-max'?min(ns.channelCount,channels):channels;
   allocated+=channels*128;if(allocated>33554432)throw dom('NotSupportedError');
   const data=mix(inputs,channels,ns.interpretation);
   if(ns.kind==='gain'){const ps=params.get(ns.gain),modulations=internal();for(const source of ps.incoming){const value=cache.get(source);if(value)modulations.push(value);}const input=mix(modulations,1,'speakers');for(let frame=0;frame<128;frame++){const time=(ps.automation==='k-rate'?start:start+frame)/state.rate,gain=paramValue(ps,time)+input[0][frame];for(let ch=0;ch<channels;ch++)data[ch][frame]*=gain;}}
   cache.set(node,data);visiting.delete(node);
  }
  return cache.get(state.destination);
 }
 function render(context,state){if(!bridge.active()||state.state!=='running')return;
  if(!state.output)state.output=makeBuffer(state.length,state.channels,state.rate);const out=buffers.get(state.output),limit=ceil(state.length/128)*128;
  try{while(state.frame<limit){const suspension=state.suspensions.get(state.frame);if(suspension){state.suspensions.delete(state.frame);state.state='suspended';schedule(()=>fire(context,'statechange'));suspension.resolve();return;}
   const start=state.frame,sourceOutputs=new Map();for(const source of state.sources){const result=sourceFrames(source,state,128,start),sourceState=nodes.get(source);if(result.ended&&!sourceState.ended){sourceState.ended=true;schedule(()=>fire(source,'ended'));}if(result.samples)sourceOutputs.set(source,result.samples);}
   const data=graphQuantum(context,state,sourceOutputs,start),count=min(128,state.length-start);if(data)for(let ch=0;ch<state.channels;ch++)for(let frame=0;frame<count;frame++)out.channels[ch][start+frame]=data[ch][frame];state.frame+=128;
  }}catch(error){state.state='closed';state.reject(error);return;}
  schedule(()=>{if(!bridge.active())return;state.state='closed';fire(context,'complete',state.output);state.resolve(state.output);schedule(()=>fire(context,'statechange'));});
 }
 class OfflineAudioContext extends BaseAudioContext{
  constructor(options,length,rate){if(!arguments.length)throw error();super(token);let channels;
   if(arguments.length===1){if(options!=null&&typeof options!=='object'&&typeof options!=='function')throw new TypeError('');options=dictionary(options);const lengthValue=options.length;if(!('length'in options))throw error();length=uint(lengthValue);const count=options.numberOfChannels;channels=count===undefined?1:uint(count);if(!('sampleRate'in options))throw error();const sample=options.sampleRate;rate=fround(number(sample));}
   else{if(arguments.length<3)throw new TypeError('');channels=uint(options);length=uint(length);rate=fround(number(rate));}
   validate(channels,length,rate);const state=record({channels,length,rate,frame:0,state:'suspended',sources:new Set(),handlers:record(),relays:record(),suspensions:new Map(),rendered:false});contexts.set(this,state);state.destination=new AudioDestinationNode(this,token);publish(this,'OfflineAudioContext');}
  get length(){const state=brand(contexts,this);if(state.realtime)throw new TypeError('Illegal invocation');return state.length;}
  get oncomplete(){return brand(contexts,this).handlers.complete??null;}
  set oncomplete(value){handler(this,brand(contexts,this),'complete',value);}
  startRendering(){const state=contexts.get(this);if(!state||state.realtime)return apply(promiseReject,Promise,[error()]);if(state.rendered||!bridge.active())return apply(promiseReject,Promise,[dom('InvalidStateError')]);state.rendered=true;state.state='running';const promise=new Promise((resolve,reject)=>{state.resolve=resolve;state.reject=reject;});schedule(()=>fire(this,'statechange'));schedule(()=>render(this,state));return promise;}
  suspend(when){const state=brand(contexts,this);let time;try{time=restricted(when);}catch(error){return apply(promiseReject,Promise,[error]);}const frame=ceil(time*state.rate/128)*128;if(time<0||frame<state.frame||time>=state.length/state.rate||state.state==='closed'||state.suspensions.has(frame))return apply(promiseReject,Promise,[dom('InvalidStateError')]);return new Promise(resolve=>state.suspensions.set(frame,record({resolve})));}
  resume(){const state=brand(contexts,this);if(!state.rendered||state.state==='closed')return apply(promiseReject,Promise,[dom('InvalidStateError')]);if(state.state==='suspended'){state.state='running';schedule(()=>fire(this,'statechange'));schedule(()=>render(this,state));}return new Promise(resolve=>resolve());}
 }
 for(const [name,Constructor]of Object.entries({AudioBuffer,BaseAudioContext,OfflineAudioContext,AudioContext,GainNode,ConstantSourceNode,OscillatorNode,PeriodicWave,AudioNode,AudioParam,AudioDestinationNode,AudioScheduledSourceNode,AudioBufferSourceNode,OfflineAudioCompletionEvent})){
  define(Constructor,'length',{value:{AudioBuffer:1,BaseAudioContext:0,OfflineAudioContext:1,AudioContext:0,GainNode:1,ConstantSourceNode:1,OscillatorNode:1,PeriodicWave:1,AudioNode:0,AudioParam:0,AudioDestinationNode:0,AudioScheduledSourceNode:0,AudioBufferSourceNode:1,OfflineAudioCompletionEvent:2}[name],configurable:true});
  const constructor=getDescriptor(Constructor.prototype,'constructor');delete Constructor.prototype.constructor;
  for(const key of keys(Constructor.prototype)){const descriptor=getDescriptor(Constructor.prototype,key);define(Constructor.prototype,key,{...descriptor,enumerable:true});}
  define(Constructor.prototype,'constructor',constructor);define(Constructor.prototype,Symbol.toStringTag,{value:name,configurable:true});define(g,name,{value:Constructor,writable:true,configurable:true,enumerable:false});
 }
 return record();
}
export function installAudioCore(page,window){
 if(installed.has(window))return installed.get(window);
 for(const kind of ['AudioBuffer','BaseAudioContext','OfflineAudioContext','AudioContext','GainNode','ConstantSourceNode','OscillatorNode','PeriodicWave','AudioNode','AudioParam','AudioDestinationNode','AudioScheduledSourceNode','AudioBufferSourceNode','OfflineAudioCompletionEvent'])registerPlatformFactoryKind(kind);
 const signal=page.documentAbort?.signal,timers=new Set(),invoke=createInvocationTrampoline(implForWrapper(window)._globalObject),deadline={timeout:Math.min(page.timeout??2000,2000),displayErrors:false};let disposed=false;
 const active=()=>!disposed&&!page.closed&&!signal?.aborted&&!!window.document;
 const bridge={shared,Array,Map,Set,now:hostNow,makeWave:makeAudioWave,basicWave:basicAudioWave,renderWave:renderAudioWave,waveScale:audioWaveScale,token:Symbol('audio-construction'),record:properties=>Object.assign(Object.create(null),properties),isFloat32:types.isFloat32Array,isArray:Array.isArray,arrayLength:value=>typedLength.call(value),publish:(value,kind)=>registerPlatformFactory(value,{kind,globalObject:window}),active,
  schedule(callback,delay=0){if(!active())return;const id=hostSetTimeout(()=>{timers.delete(id);if(active()){try{invoke.invoke(callback,window,[],deadline);}catch(error){if(active())reportException(window,error);}}},delay);timers.add(id);},
  target(value){setupTarget(value,window);targetBackends.set(value,implForWrapper(value));registerPlatformFactory(value,{kind:'EventTarget',implementation:targetBackends.get(value),globalObject:window});listenerBackends.set(value,new Map());},
  listen(value,type,callback,add){const backend=targetBackends.get(value),listeners=listenerBackends.get(value);let listener=listeners.get(callback);if(add){if(!listener){listener=convertListener(window,callback);listeners.set(callback,listener);}backend.addEventListener(type,listener,false);}else if(listener){backend.removeEventListener(type,listener,false);listeners.delete(callback);}},
  event(value,type,init,trusted){setupEvent(value,window,[type,init],{isTrusted:trusted});eventBackends.set(value,implForWrapper(value));registerPlatformFactory(value,{kind:'Event',implementation:eventBackends.get(value),globalObject:window});},
  dispatch:(target,event)=>targetBackends.get(target)._dispatch(eventBackends.get(event)),
 };
 const controller=window.eval(`(${audioFactory.toString()})`)(window,bridge);
 const dispose=()=>{if(disposed)return;disposed=true;for(const id of timers)hostClearTimeout(id);timers.clear();signal?.removeEventListener('abort',dispose);};
 signal?.addEventListener('abort',dispose,{once:true});const result={dispose,controller};installed.set(window,result);return result;
}
