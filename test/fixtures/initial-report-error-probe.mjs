// The SAME authored observation runs on quiet Root646 and after real timeout.
// No fixture expectation is substituted for a delivered event.
export function initialReportErrorProbe(){
 const sentinel=new Error('actual later report');let saved,called=0,during=null;
 const listener=event=>{
  called++;saved=event;
  during={message:event.message,expectedMessage:String(sentinel),bareMessagePredicate:event.message==='actual later report',errorSame:event.error===sentinel,errorRealm:event.error instanceof Error,eventRealm:event instanceof ErrorEvent,trusted:event.isTrusted,cancelable:event.cancelable,targetSame:event.target===globalThis,currentSame:event.currentTarget===globalThis,windowEventSame:globalThis.event===event,phase:event.eventPhase,defaultPreventedBefore:event.defaultPrevented};
  event.preventDefault();during.defaultPreventedAfter=event.defaultPrevented;
 };
 addEventListener('error',listener,{once:true});let returned;
 try{returned=reportError(sentinel)}finally{removeEventListener('error',listener)}
 return{called,returnedUndefined:returned===undefined,during,after:saved?{phase:saved.eventPhase,currentTargetNull:saved.currentTarget===null,pathLength:saved.composedPath().length,defaultPrevented:saved.defaultPrevented,windowEventUndefined:globalThis.event===undefined}:null};
}
