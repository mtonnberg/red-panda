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
  if ((info.Length() != 2 && info.Length() != 3) || !info[0]->IsFunction() || !info[1]->IsObject() || (info.Length() == 3 && !info[2]->IsString())) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "A callback and realm anchor are required")));
    return;
  }
  Local<Context> realm;
  if (!info[1].As<Object>()->GetCreationContext().ToLocal(&realm)) return;
  Local<Function> entry;
  if (!Function::New(realm, Entry, info[0], 1, ConstructorBehavior::kThrow).ToLocal(&entry)) return;
  entry->SetName(info.Length() == 3 ? info[2].As<String>() : String::NewFromUtf8Literal(isolate, "postMessage"));
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

// Mark only an actual owned Promise handled without allocating a derived
// Promise or invoking authored .then hooks. This public-V8 seam is privileged.
void MarkPromiseHandled(const FunctionCallbackInfo<Value>& info) {
  if (info.Length() != 1 || !info[0]->IsPromise()) {
    info.GetIsolate()->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(info.GetIsolate(), "An actual Promise is required")));
    return;
  }
  info[0].As<Promise>()->MarkAsHandled();
}

// Privileged, hook-free inspection of one genuine Promise. The DTO belongs to
// the trusted caller's context, has no prototype and never escapes to authored
// script. The actual result value retains its original identity/creation realm.
void PromiseSnapshot(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  const auto context = isolate->GetCurrentContext();
  if (info.Length() != 1 || !info[0]->IsPromise()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "An actual Promise is required")));
    return;
  }
  const auto promise = info[0].As<Promise>();
  const auto state = promise->State();
  const auto result = Object::New(isolate, Null(isolate), nullptr, nullptr, 0);
  if (!result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "state"), Integer::New(isolate, static_cast<int>(state))).FromMaybe(false)) return;
  if (state != Promise::kPending &&
      !result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "value"), promise->Result()).FromMaybe(false)) return;
  info.GetReturnValue().Set(result);
}

// Only a real Host consumer calls this at the actual adoption seam. Reading a
// Promise snapshot never consumes it. Node maintains its own queued rejection
// bookkeeping in addition to V8's has-handler bit; notify only the one genuine
// already-rejected/unhandled Promise that this consumer has actually adopted.
void ConsumeObservedPromise(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  if (info.Length() != 2 || !info[0]->IsPromise() || !info[1]->IsObject()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "An actual Promise and owner realm are required")));
    return;
  }
  const auto promise = info[0].As<Promise>();
  Local<Context> promise_realm;
  Local<Context> owner_realm;
  if (!promise->GetCreationContext().ToLocal(&promise_realm) ||
      !info[1].As<Object>()->GetCreationContext().ToLocal(&owner_realm)) return;
  if (promise_realm != owner_realm) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "The Promise does not belong to its consumer's owner realm")));
    return;
  }
  auto* environment = node::GetCurrentEnvironment(isolate->GetCurrentContext());
  if (environment == nullptr ||
      node::GetCurrentEnvironment(promise_realm) != environment ||
      node::GetCurrentEnvironment(owner_realm) != environment) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "The Promise consumer requires the same Node environment")));
    return;
  }
  if (!promise->HasHandler() && promise->State() == Promise::kRejected) {
    node::PromiseRejectCallback(PromiseRejectMessage(promise,
        kPromiseHandlerAddedAfterReject, Undefined(isolate)));
  }
  promise->MarkAsHandled();
}

// Privileged Worker-local error origin reader. No JavaScript property lookup,
// stack formatter, prototype/name test or script evaluation is performed.
void ErrorOrigin(const FunctionCallbackInfo<Value>& info) {
  auto* isolate = info.GetIsolate();
  const auto context = isolate->GetCurrentContext();
  if (info.Length() != 2 || !info[0]->IsNativeError() || info[0]->IsProxy() || !info[1]->IsObject()) {
    info.GetReturnValue().Set(Null(isolate));
    return;
  }
  Local<Context> error_context, owner_context;
  if (!info[0].As<Object>()->GetCreationContext().ToLocal(&error_context) ||
      !info[1].As<Object>()->GetCreationContext().ToLocal(&owner_context) ||
      error_context != owner_context) {
    info.GetReturnValue().Set(Null(isolate));
    return;
  }
  const auto message = Exception::CreateMessage(isolate, info[0]);
  // CreateMessage falls back to the CURRENT executing JavaScript caller when
  // the Error's private trace is unavailable (e.g. stackTraceLimit=0 or an
  // assigned formatted stack). A real original trace has a different script
  // identity from this Host adapter caller. Names/URLs never confer authority.
  const auto caller = StackTrace::CurrentStackTrace(isolate, 1, StackTrace::kScriptId);
  if (caller->GetFrameCount() &&
      message->GetScriptOrigin().ScriptId() == caller->GetFrame(isolate, 0)->GetScriptId()) {
    info.GetReturnValue().Set(Null(isolate));
    return;
  }
  const auto filename = message->GetScriptResourceName();
  const int line = message->GetLineNumber(context).FromMaybe(0);
  const int column = message->GetStartColumn(context).FromMaybe(-1);
  if (!filename->IsString() || line <= 0 || column < 0) {
    info.GetReturnValue().Set(Null(isolate));
    return;
  }
  const auto result = Object::New(isolate);
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "filename"), filename).Check();
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "lineno"), Integer::New(isolate, line)).Check();
  // V8's source column index is zero based; ErrorEvent coordinates are one based.
  result->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "colno"), Integer::New(isolate, column + 1)).Check();
  info.GetReturnValue().Set(result);
}

NODE_MODULE_INIT() {
  Isolate* isolate = Isolate::GetCurrent();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "errorOrigin"), Function::New(context, ErrorOrigin).ToLocalChecked()).Check();
  auto* state = new State();
  node::AddEnvironmentCleanupHook(isolate, [](void* pointer) { delete static_cast<State*>(pointer); }, state);
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "markPromiseHandled"), Function::New(context, MarkPromiseHandled).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "promiseSnapshot"), Function::New(context, PromiseSnapshot).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "consumeObservedPromise"), Function::New(context, ConsumeObservedPromise).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "checkpoint"), Function::New(context, Checkpoint, External::New(isolate, state)).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "createEntry"), Function::New(context, CreateEntry).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "boundedRegExp"), Function::New(context, BoundedRegExp).ToLocalChecked()).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "headersVersion"), String::NewFromUtf8Literal(isolate, NODE_VERSION)).Check();
  exports->CreateDataProperty(context, String::NewFromUtf8Literal(isolate, "abiVersion"), Integer::New(isolate, NODE_MODULE_VERSION)).Check();
}
}  // namespace red_panda_runtime
