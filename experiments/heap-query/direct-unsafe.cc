#include <node.h>
#include <v8-profiler.h>
#include <vector>
#include <chrono>
namespace direct_probe {
using namespace v8;
struct Predicate final : QueryObjectPredicate {
 Isolate* isolate;Local<Object> prototype;size_t visited=0,matched=0;bool limit=false,timedout=false;
 std::chrono::steady_clock::time_point deadline=std::chrono::steady_clock::now()+std::chrono::seconds(10);
 Predicate(Isolate*i,Local<Object>p):isolate(i),prototype(p){}
 bool FilterObject(Local<Object> object){
  if(limit||timedout)return false;
  if(++visited>2000000){limit=true;return false;}
  if(std::chrono::steady_clock::now()>deadline){timedout=true;return false;}
  Local<Value> current=object;
  for(int depth=0;depth<4096;depth++){
   if(!current->IsObject()||current->IsProxy())return false;
   current=current.As<Object>()->GetPrototypeV2();
   if(current->StrictEquals(prototype)){
    if(++matched>100000){limit=true;return false;}
    return true;
   }
  }
  limit=true;return false;
 }
 bool Filter(Local<Object> object) override {HandleScope scope(isolate);return FilterObject(object);}
};
void Query(const FunctionCallbackInfo<Value>&info){
 auto isolate=info.GetIsolate();if(info.Length()<1||!info[0]->IsObject()){isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate,"prototype required")));return;}
 Local<Context> context;if(!info[0].As<Object>()->GetCreationContext(isolate).ToLocal(&context)){isolate->ThrowException(Exception::Error(String::NewFromUtf8Literal(isolate,"context missing")));return;}
 std::vector<Global<Object>> objects;
 Predicate predicate(isolate,info[0].As<Object>());
 isolate->GetHeapProfiler()->QueryObjects(context,&predicate,&objects);
 if(predicate.limit||predicate.timedout){isolate->ThrowException(Exception::Error(String::NewFromUtf8Literal(isolate,"query bound exceeded")));return;}
 Context::Scope scope(context);auto array=Array::New(isolate,static_cast<int>(objects.size()));
 for(uint32_t index=0;index<objects.size();index++)if(!array->CreateDataProperty(context,index,objects[index].Get(isolate)).FromMaybe(false))return;
 info.GetReturnValue().Set(array);
}
NODE_MODULE_INIT(){NODE_SET_METHOD(exports,"queryObjects",Query);}
}
