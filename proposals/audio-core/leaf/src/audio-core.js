import 'jsdom';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {createInvocationTrampoline} from './invocation.js';
import {registerPlatformFactory} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const require=createRequire(import.meta.url),{implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {createAnEvent}=require('jsdom/lib/jsdom/living/helpers/events.js');
const reportException=require('jsdom/lib/jsdom/living/helpers/runtime-script-errors.js');
const installed=new WeakMap(),shared={buffers:new WeakMap(),contexts:new WeakMap(),nodes:new WeakMap(),params:new WeakMap(),events:new WeakMap()};
const typed=Object.getPrototypeOf(Float32Array.prototype),typedLength=Object.getOwnPropertyDescriptor(typed,'length').get;
const hostSetTimeout=setTimeout,hostClearTimeout=clearTimeout;
function audioFactory(g,bridge){
 const {buffers,contexts,nodes,params,events}=bridge.shared;
 const TypeError=g.TypeError,RangeError=g.RangeError,Exception=g.DOMException,EventTarget=g.EventTarget,Event=g.Event,Promise=g.Promise,F32=g.Float32Array;
 const Set=bridge.Set,String=g.String,internal=()=>new bridge.Array(),promiseReject=Promise.reject,addListener=EventTarget.prototype.addEventListener,removeListener=EventTarget.prototype.removeEventListener;
 const define=Object.defineProperty,create=Object.create,setPrototype=Object.setPrototypeOf,getDescriptor=Object.getOwnPropertyDescriptor,keys=Object.getOwnPropertyNames;
 const finite=Number.isFinite,fround=Math.fround,ceil=Math.ceil,floor=Math.floor,round=Math.round,min=Math.min,max=Math.max,abs=Math.abs,pow=Math.pow,exp=Math.exp;
 const constant=3.4028234663852886e38,token={},apply=Reflect.apply;
 const error=()=>new TypeError('invalid argument'),illegal=()=>{throw new TypeError('Illegal Constructor')};
 const dom=(name)=>new Exception({NotSupportedError:'The operation is not supported',IndexSizeError:'Index or size is negative or greater than the allowed amount',InvalidStateError:'The object is in an invalid state',InvalidAccessError:'The object does not support the operation or argument'}[name]??'The operation is not supported',name);
 const brand=(map,value)=>{const state=map.get(value);if(!state)throw new TypeError('Illegal invocation');return state};
 const dictionary=value=>{if(value==null)return{};if(typeof value!=='object'&&typeof value!=='function')throw error();return value};
 const number=value=>+value,uint=value=>number(value)>>>0,restricted=value=>{const result=number(value);if(!finite(result))throw new TypeError('');return result;},float=value=>{const result=fround(number(value));if(!finite(result))throw new TypeError('');return result};
 const nonnegative=value=>{const result=restricted(value);if(result<0)throw new RangeError('');return result};
 const arrayLength=value=>bridge.arrayLength(value);
 function publish(value,kind){bridge.publish(value,kind);return value;}
 function validate(channels,length,rate){if(!length||!channels||channels>32||!finite(rate)||rate<3000||rate>768000)throw dom('NotSupportedError');if(length*channels>33554432)throw dom('NotSupportedError');}
 function channel(state,index){index=uint(index);if(index>=state.channels.length)throw dom('IndexSizeError');return state.channels[index];}
 function bufferState(length,channels,rate){validate(channels,length,rate);const state={length,rate,channels:internal()};for(let index=0;index<channels;index++)state.channels.push(new F32(length));return state;}
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
 function makeParam(context,value,automation='k-rate'){const object=create(AudioParam.prototype);params.set(object,{context,value:fround(value),defaultValue:fround(value),automation,events:internal(),sequence:0});return publish(object,'AudioParam');}
 function addParam(object,type,value,time,extra){const state=brand(params,object);value=float(value);time=nonnegative(time);state.events.push({type,value,time,extra,sequence:state.sequence++});state.events.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);return object;}
 function paramValue(state,time){let value=state.value,previousTime=0,target=null,curve=null;
  for(const event of state.events){
   if(event.type==='linear'||event.type==='exponential'){
    if(event.time>time){const fraction=event.time===previousTime?1:max(0,min(1,(time-previousTime)/(event.time-previousTime)));return event.type==='linear'?value+(event.value-value)*fraction:value*pow(event.value/value,fraction);}
    value=event.value;previousTime=event.time;target=null;curve=null;continue;
   }
   if(event.time>time)break;
   if(target)value=target.value+(value-target.value)*exp(-(event.time-previousTime)/target.constant);
   if(curve){const at=min(curve.values.length-1,max(0,(event.time-previousTime)/curve.duration*(curve.values.length-1))),low=floor(at);value=curve.values[low]+(curve.values[min(low+1,curve.values.length-1)]-curve.values[low])*(at-low);}
   if(event.type==='target'){target={value:event.value,constant:event.extra};curve=null;}else if(event.type==='curve'){curve={values:event.extra.values,duration:event.extra.duration};target=null;value=curve.values[0];}else{value=event.value;target=null;curve=null;}
   previousTime=event.time;
  }
  if(target)return target.constant===0?target.value:target.value+(value-target.value)*exp(-(time-previousTime)/target.constant);
  if(curve){const at=min(curve.values.length-1,max(0,(time-previousTime)/curve.duration*(curve.values.length-1))),low=floor(at);return curve.values[low]+(curve.values[min(low+1,curve.values.length-1)]-curve.values[low])*(at-low);}
  return value;
 }
 class AudioParam{
  constructor(){illegal();}
  get value(){const state=brand(params,this),context=contexts.get(state.context);return context.frame?fround(paramValue(state,context.frame/context.rate)):state.value;}
  set value(value){brand(params,this).value=float(value);}
  get automationRate(){return brand(params,this).automation;}
  set automationRate(value){const state=brand(params,this);value=String(value);if(!['a-rate','k-rate'].includes(value))return;if(value!==state.automation)throw dom('InvalidStateError');}
  get defaultValue(){return brand(params,this).defaultValue;}
  get minValue(){brand(params,this);return -constant;}
  get maxValue(){brand(params,this);return constant;}
  setValueAtTime(value,time){brand(params,this);if(arguments.length<2)throw error();return addParam(this,'set',value,time);}
  linearRampToValueAtTime(value,time){brand(params,this);if(arguments.length<2)throw error();return addParam(this,'linear',value,time);}
  exponentialRampToValueAtTime(value,time){brand(params,this);if(arguments.length<2)throw error();value=float(value);if(value<=0)throw new RangeError('');return addParam(this,'exponential',value,time);}
  setTargetAtTime(value,time,constant){brand(params,this);if(arguments.length<3)throw error();constant=nonnegative(constant);return addParam(this,'target',value,time,constant);}
  setValueCurveAtTime(values,time,duration){const state=brand(params,this);if(arguments.length<3)throw error();if(!bridge.isFloat32(values))throw new TypeError('');const length=arrayLength(values);if(length<2)throw dom('InvalidStateError');time=nonnegative(time);duration=nonnegative(duration);if(!duration)throw new RangeError('');const copy=internal();for(let at=0;at<length;at++)copy.push(float(values[at]));state.events.push({type:'curve',time,extra:{values:copy,duration},sequence:state.sequence++});state.events.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);return this;}
  cancelScheduledValues(time){const state=brand(params,this);if(!arguments.length)throw error();time=nonnegative(time);state.events=state.events.filter(event=>event.time<time);return this;}
  cancelAndHoldAtTime(time){const state=brand(params,this);if(!arguments.length)throw error();time=nonnegative(time);const value=paramValue(state,time);state.events=state.events.filter(event=>event.time<time);return addParam(this,'set',value,time);}
 }
 function handler(target,state,key,value){const previous=state.handlers[key];if(previous)apply(removeListener,target,[key,previous]);const next=typeof value==='function'?value:null;state.handlers[key]=next;if(next)apply(addListener,target,[key,next]);}
 class AudioNode extends EventTarget{
  constructor(context,key){super();if(key!==token)illegal();brand(contexts,context);nodes.set(this,{context,inputs:1,outputs:1,channelCount:2,mode:'max',interpretation:'speakers',connections:new Set(),handlers:create(null)});}
  get context(){return brand(nodes,this).context;}
  get numberOfInputs(){return brand(nodes,this).inputs;}
  get numberOfOutputs(){return brand(nodes,this).outputs;}
  get channelCount(){return brand(nodes,this).channelCount;}
  set channelCount(value){const state=brand(nodes,this);value=uint(value);if(!value||value>32)throw dom('NotSupportedError');state.channelCount=value;}
  get channelCountMode(){return brand(nodes,this).mode;}
  set channelCountMode(value){const state=brand(nodes,this);value=String(value);if(['max','clamped-max','explicit'].includes(value))state.mode=value;}
  get channelInterpretation(){return brand(nodes,this).interpretation;}
  set channelInterpretation(value){const state=brand(nodes,this);value=String(value);if(['speakers','discrete'].includes(value))state.interpretation=value;}
  connect(destination,output=0,input=0){const state=brand(nodes,this);if(!arguments.length)throw error();const next=nodes.get(destination);if(!next){if(params.has(destination))throw dom('NotSupportedError');throw error();}output=uint(output);input=uint(input);if(next.context!==state.context)throw dom('InvalidAccessError');if(output>=state.outputs||input>=next.inputs)throw dom('IndexSizeError');state.connections.add(destination);return destination;}
  disconnect(destination,output=0,input=0){const state=brand(nodes,this);if(!arguments.length){state.connections.clear();return;}if(typeof destination==='number'){if(uint(destination)>=state.outputs)throw dom('IndexSizeError');state.connections.clear();return;}const next=nodes.get(destination);if(!next)throw error();if(uint(output)>=state.outputs||uint(input)>=next.inputs)throw dom('IndexSizeError');if(!state.connections.delete(destination))throw dom('InvalidAccessError');}
 }
 class AudioDestinationNode extends AudioNode{constructor(context,key){super(context,key);if(key!==token)illegal();const state=nodes.get(this),ctx=contexts.get(context);state.channelCount=ctx.channels;state.mode='explicit';state.kind='destination';publish(this,'AudioDestinationNode');}get maxChannelCount(){return brand(contexts,brand(nodes,this).context).channels;}}
 class AudioScheduledSourceNode extends AudioNode{
  constructor(context,key){super(context,key);if(key!==token)illegal();const state=nodes.get(this);state.kind='source';state.inputs=0;state.started=false;state.ended=false;state.stop=Infinity;contexts.get(context).sources.add(this);}
  start(when=0){const state=brand(nodes,this);when=nonnegative(when);if(state.started)throw dom('InvalidStateError');state.started=true;state.when=when;}
  stop(when=0){const state=brand(nodes,this);when=nonnegative(when);if(!state.started)throw dom('InvalidStateError');state.stop=when;}
  get onended(){return brand(nodes,this).handlers.ended??null;}
  set onended(value){handler(this,brand(nodes,this),'ended',value);}
 }
 class AudioBufferSourceNode extends AudioScheduledSourceNode{
  constructor(context,options={}){if(!arguments.length||!contexts.has(context))throw error();super(context,token);options=dictionary(options);const state=nodes.get(this);state.buffer=null;state.bufferSet=false;state.playbackRate=makeParam(context,1);state.detune=makeParam(context,0);state.loop=false;state.loopStart=0;state.loopEnd=0;
   const buffer=options.buffer;if(buffer!==undefined)this.buffer=buffer;const detune=options.detune;if(detune!==undefined)state.detune.value=detune;const loop=options.loop;if(loop!==undefined)state.loop=!!loop;const loopEnd=options.loopEnd;if(loopEnd!==undefined)state.loopEnd=restricted(loopEnd);const loopStart=options.loopStart;if(loopStart!==undefined)state.loopStart=restricted(loopStart);const playback=options.playbackRate;if(playback!==undefined)state.playbackRate.value=playback;publish(this,'AudioBufferSourceNode');}
  get buffer(){return brand(nodes,this).buffer;}
  set buffer(value){const state=brand(nodes,this);if(value!==null&&!buffers.has(value))throw error();if(value!==null&&state.bufferSet)throw dom('InvalidStateError');state.buffer=value;if(value!==null)state.bufferSet=true;}
  get playbackRate(){return brand(nodes,this).playbackRate;}
  get detune(){return brand(nodes,this).detune;}
  get loop(){return brand(nodes,this).loop;}
  set loop(value){brand(nodes,this).loop=!!value;}
  get loopStart(){return brand(nodes,this).loopStart;}
  set loopStart(value){brand(nodes,this).loopStart=restricted(value);}
  get loopEnd(){return brand(nodes,this).loopEnd;}
  set loopEnd(value){brand(nodes,this).loopEnd=restricted(value);}
  start(when=0,offset=0,duration){const state=brand(nodes,this);when=nonnegative(when);offset=nonnegative(offset);if(duration!==undefined)duration=nonnegative(duration);if(state.started)throw dom('InvalidStateError');state.started=true;state.when=when;state.offset=offset;state.duration=duration;}
 }
 class BaseAudioContext extends EventTarget{
  constructor(key){super();if(key!==token)illegal();}
  get destination(){return brand(contexts,this).destination;}
  get sampleRate(){return brand(contexts,this).rate;}
  get currentTime(){const state=brand(contexts,this);return state.frame/state.rate;}
  get state(){return brand(contexts,this).state;}
  get onstatechange(){return brand(contexts,this).handlers.statechange??null;}
  set onstatechange(value){handler(this,brand(contexts,this),'statechange',value);}
  createBuffer(channels,length,rate){brand(contexts,this);if(arguments.length<3)throw error();return makeBuffer(uint(length),uint(channels),fround(number(rate)));}
  createBufferSource(){brand(contexts,this);return new AudioBufferSourceNode(this);}
 }
 class OfflineAudioCompletionEvent extends Event{
  constructor(type,init){if(arguments.length<2)throw error();init=dictionary(init);const buffer=init.renderedBuffer;if(!buffers.has(buffer))throw error();super(type,init);events.set(this,buffer);}
  get renderedBuffer(){if(!events.has(this))throw new TypeError('Illegal invocation');return events.get(this);}
 }
 function fire(target,type,buffer){const event=bridge.event(target,type);if(type==='complete'){setPrototype(event,OfflineAudioCompletionEvent.prototype);events.set(event,buffer);}bridge.dispatch(target,event);}
 function schedule(action){bridge.schedule(action);}
 function sourceFrames(source,ctx,quantumFrames){const state=nodes.get(source);if(!state.started||state.ended)return {ended:false,samples:null};const b=state.buffer===null?null:buffers.get(state.buffer),samples=internal();for(let ch=0;ch<(b?.channels.length??1);ch++)samples.push(new F32(quantumFrames));
  let position=b?round((state.offset??0)*b.rate):0,consumed=0,started=false,ended=false;
  let loopStart=0,loopEnd=b?.length??0;
  if(b&&state.loop){const start=max(0,min(b.length,round(state.loopStart*b.rate))),end=state.loopEnd>0?max(0,min(b.length,round(state.loopEnd*b.rate))):b.length;if(start<b.length&&end>start){loopStart=start;loopEnd=end;}if(position>=loopEnd)position=loopStart;}
  const when=ceil(state.when*ctx.rate),stop=ceil(state.stop*ctx.rate),duration=b&&state.duration!==undefined?state.duration*b.rate:Infinity;
  for(let frame=0;frame<quantumFrames;frame++){
   if(frame<when)continue;
   if(frame>=stop||!b||consumed>=duration||!state.loop&&(position<0||position>=b.length)){ended=true;break;}
   started=true;
   if(state.loop){const span=loopEnd-loopStart;if(position>=loopEnd)position=loopStart+(position-loopEnd)%span;if(position<0){ended=true;break;}}
   const lower=floor(position),fraction=position-lower,next=state.loop&&lower+1>=loopEnd?loopStart:min(lower+1,b.length-1);
   for(let ch=0;ch<b.channels.length;ch++){const data=b.channels[ch];samples[ch][frame]=data[lower]+(data[next]-data[lower])*fraction;}
   const time=floor(frame/128)*128/ctx.rate,step=paramValue(params.get(state.playbackRate),time)*pow(2,paramValue(params.get(state.detune),time)/1200)*b.rate/ctx.rate;
   position+=step;consumed+=abs(step);
  }
  // The engine executes the full final quantum, even though only requested
  // output frames are returned. A source ending exactly at that boundary ends.
  if(started&&b&&!state.loop&&(position<0||position>=b.length)||started&&consumed>=duration||stop<=quantumFrames)ended=true;
  return {ended,samples};
 }
 function render(context,state){if(!bridge.active())return;const frames=ceil(state.length/128)*128,output=makeBuffer(state.length,state.channels,state.rate),out=buffers.get(output),finished=internal();
  for(const source of state.sources){const result=sourceFrames(source,state,frames),sourceState=nodes.get(source);if(result.ended){sourceState.ended=true;finished.push(source);}if(!sourceState.connections.has(state.destination)||!result.samples)continue;
   const channels=result.samples.length;
   for(let ch=0;ch<state.channels;ch++)for(let frame=0;frame<state.length;frame++){
    let value=0;if(sourceState.interpretation==='discrete'){if(ch<channels)value=result.samples[ch][frame];}
    else if(channels===1)value=result.samples[0][frame];else if(state.channels===1&&channels===2)value=(result.samples[0][frame]+result.samples[1][frame])*.5;else if(ch<channels)value=result.samples[ch][frame];
    out.channels[ch][frame]+=value;
   }
  }
  state.frame=frames;
  for(const source of finished)schedule(()=>fire(source,'ended'));
  schedule(()=>{if(!bridge.active())return;state.state='closed';fire(context,'complete',output);state.resolve(output);schedule(()=>fire(context,'statechange'));});
 }
 class OfflineAudioContext extends BaseAudioContext{
  constructor(options,length,rate){if(!arguments.length)throw error();super(token);let channels;
   if(arguments.length===1){if(options!=null&&typeof options!=='object'&&typeof options!=='function')throw new TypeError('');options=dictionary(options);const lengthValue=options.length;if(!('length'in options))throw error();length=uint(lengthValue);const count=options.numberOfChannels;channels=count===undefined?1:uint(count);if(!('sampleRate'in options))throw error();const sample=options.sampleRate;rate=fround(number(sample));}
   else{if(arguments.length<3)throw new TypeError('');channels=uint(options);length=uint(length);rate=fround(number(rate));}
   validate(channels,length,rate);const state={channels,length,rate,frame:0,state:'suspended',sources:new Set(),handlers:create(null),rendered:false};contexts.set(this,state);state.destination=new AudioDestinationNode(this,token);publish(this,'OfflineAudioContext');}
  get length(){return brand(contexts,this).length;}
  get oncomplete(){return brand(contexts,this).handlers.complete??null;}
  set oncomplete(value){handler(this,brand(contexts,this),'complete',value);}
  startRendering(){const state=brand(contexts,this);if(state.rendered||!bridge.active())return apply(promiseReject,Promise,[dom('InvalidStateError')]);state.rendered=true;state.state='running';const promise=new Promise(resolve=>{state.resolve=resolve;});schedule(()=>fire(this,'statechange'));schedule(()=>render(this,state));return promise;}
  suspend(){brand(contexts,this);return apply(promiseReject,Promise,[dom('NotSupportedError')]);}
  resume(){brand(contexts,this);return apply(promiseReject,Promise,[dom('NotSupportedError')]);}
 }
 for(const [name,Constructor]of Object.entries({AudioBuffer,BaseAudioContext,OfflineAudioContext,AudioNode,AudioParam,AudioDestinationNode,AudioScheduledSourceNode,AudioBufferSourceNode,OfflineAudioCompletionEvent})){
  define(Constructor,'length',{value:{AudioBuffer:1,BaseAudioContext:0,OfflineAudioContext:1,AudioNode:0,AudioParam:0,AudioDestinationNode:0,AudioScheduledSourceNode:0,AudioBufferSourceNode:1,OfflineAudioCompletionEvent:2}[name],configurable:true});
  const constructor=getDescriptor(Constructor.prototype,'constructor');delete Constructor.prototype.constructor;
  for(const key of keys(Constructor.prototype)){const descriptor=getDescriptor(Constructor.prototype,key);define(Constructor.prototype,key,{...descriptor,enumerable:true});}
  define(Constructor.prototype,'constructor',constructor);define(Constructor.prototype,Symbol.toStringTag,{value:name,configurable:true});define(g,name,{value:Constructor,writable:true,configurable:true,enumerable:false});
 }
 return {};
}
export function installAudioCore(page,window){
 if(installed.has(window))return installed.get(window);
 for(const kind of ['AudioBuffer','BaseAudioContext','OfflineAudioContext','AudioNode','AudioParam','AudioDestinationNode','AudioScheduledSourceNode','AudioBufferSourceNode','OfflineAudioCompletionEvent'])registerPlatformFactoryKind(kind);
 const signal=page.documentAbort?.signal,timers=new Set(),invoke=createInvocationTrampoline(implForWrapper(window)._globalObject),deadline={timeout:Math.min(page.timeout??2000,2000),displayErrors:false};let disposed=false;
 const active=()=>!disposed&&!page.closed&&!signal?.aborted&&!!window.document;
 const bridge={shared,Array,Set,isFloat32:types.isFloat32Array,arrayLength:value=>typedLength.call(value),publish:(value,kind)=>registerPlatformFactory(value,{kind,globalObject:window}),active,
  schedule(callback){if(!active())return;const id=hostSetTimeout(()=>{timers.delete(id);if(active()){try{invoke.invoke(callback,window,[],deadline);}catch(error){if(active())reportException(window,error);}}},0);timers.add(id);},
  event:(target,type)=>wrapperForImpl(createAnEvent(type,implForWrapper(target)._globalObject)),
  dispatch:(target,event)=>implForWrapper(target)._dispatch(implForWrapper(event)),
 };
 const controller=window.eval(`(${audioFactory.toString()})`)(window,bridge);
 const dispose=()=>{if(disposed)return;disposed=true;for(const id of timers)hostClearTimeout(id);timers.clear();signal?.removeEventListener('abort',dispose);};
 signal?.addEventListener('abort',dispose,{once:true});const result={dispose,controller};installed.set(window,result);return result;
}
