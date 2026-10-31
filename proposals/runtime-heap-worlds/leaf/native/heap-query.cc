#include <node.h>
#include <v8-profiler.h>
#include <v8-version.h>
#include <chrono>
#include <cmath>
#include <vector>
#define HP_STR_INNER(x) #x
#define HP_STR(x) HP_STR_INNER(x)
#define HP_V8_BASE HP_STR(V8_MAJOR_VERSION) "." HP_STR(V8_MINOR_VERSION) "." HP_STR(V8_BUILD_NUMBER) "." HP_STR(V8_PATCH_LEVEL)
namespace independent_heap_query {
using namespace v8;
void Throw(Isolate* isolate, const char* code) {
  auto context=isolate->GetCurrentContext();
  auto message=String::NewFromUtf8(isolate,code).ToLocalChecked();
  auto error=Exception::Error(message).As<Object>();
  error->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"code"),message).Check();
  isolate->ThrowException(error);
}
bool Limit(Local<Value> value, double maximum, uint64_t* output) {
  if(!value->IsNumber())return false;
  double number=value.As<Number>()->Value();
  if(!std::isfinite(number)||number<1||number>maximum||std::floor(number)!=number)return false;
  *output=static_cast<uint64_t>(number);return true;
}
struct Predicate final:QueryObjectPredicate {
  Isolate* isolate;Local<Object> prototype,anchor;uint64_t maxRaw,maxVisited,maxDepth,visited=0,matched=0;
  const char* failure=nullptr;std::chrono::steady_clock::time_point deadline;
  Predicate(Isolate*i,Local<Object>p,Local<Object>a,uint64_t raw,uint64_t visit,uint64_t depth,uint64_t time)
   :isolate(i),prototype(p),anchor(a),maxRaw(raw),maxVisited(visit),maxDepth(depth),deadline(std::chrono::steady_clock::now()+std::chrono::milliseconds(time)){}
  bool Filter(Local<Object> object)override {
    HandleScope scope(isolate);if(failure)return false;
    if(++visited>maxVisited){failure="ERR_HEAP_QUERY_VISIT_LIMIT";return false;}
    if(object->StrictEquals(prototype)||object->StrictEquals(anchor))return false;
    Local<Value> current=object;
    for(uint64_t depth=0;depth<maxDepth;depth++){
      if((depth&31)==0&&std::chrono::steady_clock::now()>deadline){failure="ERR_HEAP_QUERY_TIMEOUT";return false;}
      if(!current->IsObject()||current->IsProxy())return false;
      current=current.As<Object>()->GetPrototypeV2();
      if(current.IsEmpty()){failure="ERR_HEAP_QUERY_PROTOTYPE";return false;}
      if(current->StrictEquals(prototype)){
        if(++matched>maxRaw){failure="ERR_HEAP_QUERY_RESULT_LIMIT";return false;}return true;
      }
      if(current->IsNull())return false;
    }
    failure="ERR_HEAP_QUERY_DEPTH_LIMIT";return false;
  }
};
void Query(const FunctionCallbackInfo<Value>&info){
  auto isolate=info.GetIsolate();auto host=isolate->GetCurrentContext();
  if(info.Length()!=6||!info[0]->IsObject()||!info[1]->IsArray()||info[1]->IsProxy()){Throw(isolate,"ERR_HEAP_QUERY_ARGUMENT");return;}
  uint64_t raw,visit,depth,time;
  if(!Limit(info[2],500000,&raw)||!Limit(info[3],5000000,&visit)||!Limit(info[4],16384,&depth)||!Limit(info[5],60000,&time)){Throw(isolate,"ERR_HEAP_QUERY_ARGUMENT");return;}
  Local<Context> context;if(!info[1].As<Object>()->GetCreationContext().ToLocal(&context)){Throw(isolate,"ERR_HEAP_QUERY_CONTEXT");return;}
  auto started=std::chrono::steady_clock::now();Predicate predicate(isolate,info[0].As<Object>(),info[1].As<Object>(),raw,visit,depth,time);
  std::vector<Global<Object>> objects;isolate->GetHeapProfiler()->QueryObjects(context,&predicate,&objects);
  if(predicate.failure){for(auto&object:objects) { object.Reset(); }
  objects.clear();Throw(isolate,predicate.failure);return;}
  Local<Array> result;
  {Context::Scope selected(context);result=Array::New(isolate,static_cast<int>(objects.size()));
   for(uint32_t index=0;index<objects.size();index++){
     if(std::chrono::steady_clock::now()>predicate.deadline){for(auto&object:objects) { object.Reset(); }
  objects.clear();Throw(isolate,"ERR_HEAP_QUERY_TIMEOUT");return;}
     if(!result->CreateDataProperty(context,index,objects[index].Get(isolate)).FromMaybe(false)){for(auto&object:objects) { object.Reset(); }
  objects.clear();return;}
   }}
  for(auto&object:objects) { object.Reset(); }
  objects.clear();
  auto metadata=Object::New(isolate);metadata->CreateDataProperty(host,String::NewFromUtf8Literal(isolate,"objects"),result).Check();
  metadata->CreateDataProperty(host,String::NewFromUtf8Literal(isolate,"visited"),Number::New(isolate,predicate.visited)).Check();
  metadata->CreateDataProperty(host,String::NewFromUtf8Literal(isolate,"rawMatches"),Number::New(isolate,predicate.matched)).Check();
  metadata->CreateDataProperty(host,String::NewFromUtf8Literal(isolate,"milliseconds"),Number::New(isolate,std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count())).Check();
  info.GetReturnValue().Set(metadata);
}
void Targets(const FunctionCallbackInfo<Value>&info){
 auto isolate=info.GetIsolate();auto context=isolate->GetCurrentContext();auto array=Array::New(isolate);Local<Value> current=info[0];uint32_t index=0;
 while(current->IsProxy()){
  if(index==32){Throw(isolate,"ERR_HEAP_QUERY_PROXY_DEPTH");return;}
  auto proxy=current.As<Proxy>();if(proxy->IsRevoked()){Throw(isolate,"ERR_HEAP_QUERY_REVOKED_FACTORY_PROXY");return;}
  current=proxy->GetTarget();if(!array->CreateDataProperty(context,index++,current).FromMaybe(false))return;
 }info.GetReturnValue().Set(array);
}
void SameRealm(const FunctionCallbackInfo<Value>&info){
 if(info.Length()!=2||!info[0]->IsObject()||!info[1]->IsObject()){info.GetReturnValue().Set(false);return;}
 Local<Context>a,b;bool same=info[0].As<Object>()->GetCreationContext().ToLocal(&a)&&info[1].As<Object>()->GetCreationContext().ToLocal(&b)&&a==b;info.GetReturnValue().Set(same);
}
void CreationGlobal(const FunctionCallbackInfo<Value>&info){
 if(info.Length()!=1||!info[0]->IsObject()){info.GetReturnValue().SetNull();return;}
 Local<Context> context;if(!info[0].As<Object>()->GetCreationContext().ToLocal(&context)){info.GetReturnValue().SetNull();return;}
 info.GetReturnValue().Set(context->Global());
}
NODE_MODULE_INIT(){
 auto isolate=Isolate::GetCurrent();NODE_SET_METHOD(exports,"queryObjects",Query);NODE_SET_METHOD(exports,"proxyTargets",Targets);NODE_SET_METHOD(exports,"sameRealm",SameRealm);NODE_SET_METHOD(exports,"creationGlobal",CreationGlobal);
 exports->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"headersVersion"),String::NewFromUtf8Literal(isolate,NODE_VERSION)).Check();
 exports->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"abiVersion"),Integer::New(isolate,NODE_MODULE_VERSION)).Check();
 exports->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"apiVersion"),Integer::New(isolate,1)).Check();
 exports->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"v8HeaderBase"),String::NewFromUtf8Literal(isolate,HP_V8_BASE)).Check();
 exports->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"backend"),String::NewFromUtf8Literal(isolate,"public-v8-query-objects")).Check();
}
}
