#include <node.h>
#include <node_version.h>
#include <v8.h>
#include <v8-microtask-queue.h>

// Independent public-V8 bridge. No target browser implementation is imported.
namespace red_panda_runtime {
using namespace v8;
struct State { bool entered = false; };

void Checkpoint(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  auto* state = static_cast<State*>(info.Data().As<External>()->Value());
  const auto context = isolate->GetCurrentContext();
  const bool running = MicrotasksScope::IsRunningMicrotasks(isolate);
  const int depth = MicrotasksScope::GetCurrentDepth(isolate);
  const bool scoped = isolate->GetMicrotasksPolicy() == MicrotasksPolicy::kScoped;
  const bool reentrant = state->entered;
  bool ran = false;
  if (!running && !depth && !scoped && !reentrant) {
    state->entered = true;
    isolate->PerformMicrotaskCheckpoint();
    state->entered = false;
    ran = true;
  }
  Local<Object> result = Object::New(isolate);
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "ran"), Boolean::New(isolate, ran)).Check();
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "running"), Boolean::New(isolate, running)).Check();
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "depth"), Integer::New(isolate, depth)).Check();
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "scoped"), Boolean::New(isolate, scoped)).Check();
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "reentrant"), Boolean::New(isolate, reentrant)).Check();
  info.GetReturnValue().Set(result);
}

void Entry(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  const auto context = isolate->GetCurrentContext();
  const auto incumbent = isolate->GetIncumbentContext();
  auto arguments = Array::New(isolate, info.Length());
  for (int i = 0; i < info.Length(); ++i) {
    if (!arguments->CreateDataProperty(context, i, info[i]).FromMaybe(false)) return;
  }
  Local<Value> args[] = {incumbent->Global(), info.This(), arguments};
  Local<Value> result;
  if (info.Data().As<Function>()->Call(context, Undefined(isolate), 3, args).ToLocal(&result)) {
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

// URLPattern matching uses V8's explicit match-failure backtrack budget.
// The public API returns actual capture strings (including undefined groups)
// or null; no unbounded RegExp execution is used as a fallback.
void BoundedRegExp(const FunctionCallbackInfo<Value>& info) {
  auto* isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  if ((info.Length() != 3 && info.Length() != 4) || !info[0]->IsString() || !info[1]->IsString() || !info[2]->IsBoolean() || (info.Length() == 4 && !info[3]->IsObject())) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "Invalid bounded RegExp arguments")));
    return;
  }
  if (info.Length() == 4 && !info[3].As<Object>()->GetCreationContext().ToLocal(&context)) return;
  Context::Scope execution_scope(context);
  auto flags = static_cast<RegExp::Flags>(RegExp::kUnicodeSets | (info[2]->IsTrue() ? RegExp::kIgnoreCase : RegExp::kNone));
  Local<RegExp> expression;
  if (!RegExp::NewWithBacktrackLimit(context, info[0].As<String>(), flags, 1000000).ToLocal(&expression)) return;
  Local<Object> result;
  if (expression->Exec(context, info[1].As<String>()).ToLocal(&result)) info.GetReturnValue().Set(result);
}

NODE_MODULE_INIT() {
  Isolate* isolate = Isolate::GetCurrent();
  auto* state = new State();
  node::AddEnvironmentCleanupHook(isolate, [](void* pointer) { delete static_cast<State*>(pointer); }, state);
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "checkpoint"), Function::New(context, Checkpoint, External::New(isolate, state)).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "createEntry"), Function::New(context, CreateEntry).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "boundedRegExp"), Function::New(context, BoundedRegExp).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "headersVersion"), String::NewFromUtf8Literal(isolate, NODE_VERSION)).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "abiVersion"), Integer::New(isolate, NODE_MODULE_VERSION)).Check();
}
}  // namespace red_panda_runtime
