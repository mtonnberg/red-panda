#include <node.h>
#include <v8.h>

// The entry point captures V8's incumbent context before invoking the host JS
// bridge. It does not inspect message data or guess a sender from the receiver.
namespace red_panda_messaging {
using namespace v8;

void Entry(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  auto incumbent = isolate->GetIncumbentContext();
  auto arguments = Array::New(isolate, info.Length());
  for (int i = 0; i < info.Length(); ++i) {
    if (!arguments->CreateDataProperty(context, i, info[i]).FromMaybe(false)) return;
  }
  Local<Value> args[] = {incumbent->Global(), info.This(), arguments};
  Local<Value> result;
  auto callback = info.Data().As<Function>();
  if (callback->Call(context, Undefined(isolate), 3, args).ToLocal(&result)) {
    info.GetReturnValue().Set(result);
  }
}

void CreateEntry(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  if (info.Length() != 2 || !info[0]->IsFunction() || !info[1]->IsObject()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "A callback and realm anchor are required")));
    return;
  }
  Local<Context> realm;
  if (!info[1].As<Object>()->GetCreationContext().ToLocal(&realm)) return;
  Local<Function> entry;
  if (!Function::New(realm, Entry, info[0], 1, ConstructorBehavior::kThrow).ToLocal(&entry)) return;
  entry->SetName(String::NewFromUtf8Literal(isolate, "postMessage"));
  info.GetReturnValue().Set(entry);
}

NODE_MODULE_INIT() {
  NODE_SET_METHOD(exports, "createEntry", CreateEntry);
}
}  // namespace red_panda_messaging
