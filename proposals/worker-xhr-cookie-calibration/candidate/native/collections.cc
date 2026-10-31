#include <node.h>
#include <node_version.h>
#include <v8.h>
#include <string>

// The native portion supplies V8's real HTMLDDA bit, a call handler and property
// interceptors. DOM membership and WebIDL behavior stay in independent JS code.
namespace red_panda {
using namespace v8;

bool Invoke(Isolate* isolate, Local<Value> data, const char* method,
            int argc, Local<Value>* argv, Local<Value>* result) {
  auto context = isolate->GetCurrentContext();
  auto bridge = data.As<Object>();
  Local<Value> callback;
  if (!bridge->Get(context, String::NewFromUtf8(isolate, method).ToLocalChecked()).ToLocal(&callback)) return false;
  if (!callback->IsFunction()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "Invalid HTMLAllCollection bridge")));
    return false;
  }
  return callback.As<Function>()->Call(context, bridge, argc, argv).ToLocal(result);
}

Intercepted NamedGet(Local<Name> key, const PropertyCallbackInfo<Value>& info) {
  if (!key->IsString()) return Intercepted::kNo;
  Local<Value> args[] = {key}, present, value;
  if (!Invoke(info.GetIsolate(), info.Data(), "has", 1, args, &present)) return Intercepted::kYes;
  if (!present->BooleanValue(info.GetIsolate())) return Intercepted::kNo;
  if (Invoke(info.GetIsolate(), info.Data(), "get", 1, args, &value)) info.GetReturnValue().Set(value);
  return Intercepted::kYes;
}

Intercepted NamedQuery(Local<Name> key, const PropertyCallbackInfo<Integer>& info) {
  if (!key->IsString()) return Intercepted::kNo;
  Local<Value> args[] = {key}, present;
  if (!Invoke(info.GetIsolate(), info.Data(), "has", 1, args, &present)) return Intercepted::kYes;
  if (!present->BooleanValue(info.GetIsolate())) return Intercepted::kNo;
  info.GetReturnValue().Set(static_cast<int>(DontEnum));
  return Intercepted::kYes;
}

void NamedKeys(const PropertyCallbackInfo<Array>& info) {
  Local<Value> value;
  if (Invoke(info.GetIsolate(), info.Data(), "keys", 0, nullptr, &value) && value->IsArray()) info.GetReturnValue().Set(value.As<Array>());
}

Intercepted IndexGet(uint32_t index, const PropertyCallbackInfo<Value>& info) {
  Local<Value> args[] = {Integer::NewFromUnsigned(info.GetIsolate(), index)}, present, value;
  if (!Invoke(info.GetIsolate(), info.Data(), "hasIndex", 1, args, &present)) return Intercepted::kYes;
  if (!present->BooleanValue(info.GetIsolate())) return Intercepted::kNo;
  if (Invoke(info.GetIsolate(), info.Data(), "getIndex", 1, args, &value)) info.GetReturnValue().Set(value);
  return Intercepted::kYes;
}

Intercepted IndexQuery(uint32_t index, const PropertyCallbackInfo<Integer>& info) {
  Local<Value> args[] = {Integer::NewFromUnsigned(info.GetIsolate(), index)}, present;
  if (!Invoke(info.GetIsolate(), info.Data(), "hasIndex", 1, args, &present)) return Intercepted::kYes;
  if (!present->BooleanValue(info.GetIsolate())) return Intercepted::kNo;
  info.GetReturnValue().Set(static_cast<int>(ReadOnly));
  return Intercepted::kYes;
}

void IndexKeys(const PropertyCallbackInfo<Array>& info) {
  Local<Value> value;
  if (Invoke(info.GetIsolate(), info.Data(), "indices", 0, nullptr, &value) && value->IsArray()) info.GetReturnValue().Set(value.As<Array>());
}

void Call(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  auto arguments = Array::New(isolate, info.Length());
  for (int i = 0; i < info.Length(); ++i) if (!arguments->Set(context, i, info[i]).FromMaybe(false)) return;
  Local<Value> args[] = {arguments}, value;
  if (Invoke(isolate, info.Data(), "call", 1, args, &value)) info.GetReturnValue().Set(value);
}

void Create(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  auto context = isolate->GetCurrentContext();
  if (info.Length() != 2 || !info[0]->IsObject() || !info[1]->IsObject()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "Collection bridge and prototype are required")));
    return;
  }
  auto bridge = info[0];
  auto object = ObjectTemplate::New(isolate);
  object->MarkAsUndetectable();
  object->SetCallAsFunctionHandler(Call, bridge);
  object->SetHandler(NamedPropertyHandlerConfiguration(NamedGet, nullptr, NamedQuery, nullptr, nullptr, bridge,
    static_cast<PropertyHandlerFlags>(static_cast<int>(PropertyHandlerFlags::kNonMasking) | static_cast<int>(PropertyHandlerFlags::kOnlyInterceptStrings))));
  object->SetHandler(IndexedPropertyHandlerConfiguration(IndexGet, nullptr, IndexQuery, nullptr, nullptr, bridge));
  Local<Object> collection;
  if (!object->NewInstance(context).ToLocal(&collection)) return;
  if (!collection->SetPrototypeV2(context, info[1]).FromMaybe(false)) return;
  info.GetReturnValue().Set(collection);
}

// Ordinary live indexed WebIDL objects share the real property interceptors,
// but have neither HTMLDDA undetectability nor callable behavior.
void CreateIndexed(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  if (info.Length() != 2 || !info[0]->IsObject() || !info[1]->IsObject()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate, "Collection bridge and prototype are required")));
    return;
  }
  Local<Context> realm;
  if (!info[1].As<Object>()->GetCreationContext().ToLocal(&realm)) return;
  Context::Scope scope(realm);
  auto object = ObjectTemplate::New(isolate);
  object->SetHandler(IndexedPropertyHandlerConfiguration(IndexGet, nullptr, IndexQuery, nullptr, IndexKeys, info[0]));
  Local<Object> collection;
  if (!object->NewInstance(realm).ToLocal(&collection)) return;
  if (!collection->SetPrototypeV2(realm, info[1]).FromMaybe(false)) return;
  info.GetReturnValue().Set(collection);
}

// Genuine ordinary Storage objects use non-masking named interceptors. Values
// and keys live in the captured Host bridge; V8 supplies real object reflection.
bool StorageMasked(Local<Name> key, Isolate* isolate, Local<Object> holder);
Intercepted StorageGet(Local<Name> key,const PropertyCallbackInfo<Value>& info) {
  if(StorageMasked(key,info.GetIsolate(),info.HolderV2()))return Intercepted::kNo;
  return NamedGet(key,info);
}
Intercepted StorageSet(Local<Name> key, Local<Value> value, const PropertyCallbackInfo<void>& info) {
#if NODE_MAJOR_VERSION < 26
  // Older V8 can invoke a prototype interceptor for a distinct receiver.
  if(info.This()!=info.HolderV2())return Intercepted::kNo;
#endif
  if(StorageMasked(key,info.GetIsolate(),info.HolderV2()))return Intercepted::kNo;
  Local<Value> args[] = {key,value,info.GetIsolate()->GetCurrentContext()->Global()}, result;
  Invoke(info.GetIsolate(), info.Data(), "set", 3, args, &result);
  return Intercepted::kYes;
}
bool StorageMasked(Local<Name> key, Isolate* isolate, Local<Object> holder) {
  auto prototype=holder->GetPrototypeV2();
  return prototype->IsObject() && prototype.As<Object>()->Has(isolate->GetCurrentContext(),key).FromMaybe(true);
}
Intercepted StorageOwnDescriptor(Local<Name> key,const PropertyCallbackInfo<Value>& info) {
  auto isolate=info.GetIsolate();
  Local<Value> args[]={key},present,value;
  if(!Invoke(isolate,info.Data(),"has",1,args,&present))return Intercepted::kYes;
  if(!present->BooleanValue(isolate))return Intercepted::kNo;
  if(!Invoke(isolate,info.Data(),"get",1,args,&value))return Intercepted::kYes;
  auto descriptor=Object::New(isolate);auto context=isolate->GetCurrentContext();
  if(!descriptor->CreateDataProperty(context,String::NewFromUtf8Literal(isolate,"value"),value).FromMaybe(false))return Intercepted::kYes;
  for(const char* name:{"writable","enumerable","configurable"})if(!descriptor->CreateDataProperty(context,String::NewFromUtf8(isolate,name).ToLocalChecked(),True(isolate)).FromMaybe(false))return Intercepted::kYes;
  info.GetReturnValue().Set(descriptor);return Intercepted::kYes;
}
Intercepted StorageDescriptor(Local<Name> key,const PropertyCallbackInfo<Value>& info) {
  if(StorageMasked(key,info.GetIsolate(),info.HolderV2()))return Intercepted::kNo;
  return StorageOwnDescriptor(key,info);
}
Intercepted StorageDelete(Local<Name> key, const PropertyCallbackInfo<Boolean>& info) {
  if(StorageMasked(key,info.GetIsolate(),info.HolderV2()))return Intercepted::kNo;
  Local<Value> args[] = {key}, result;
  if (Invoke(info.GetIsolate(), info.Data(), "remove", 1, args, &result)) info.GetReturnValue().Set(true);
  return Intercepted::kYes;
}
Intercepted StorageDefine(Local<Name> key, const PropertyDescriptor& descriptor, const PropertyCallbackInfo<void>& info) {
  if (!descriptor.has_value() || StorageMasked(key,info.GetIsolate(),info.HolderV2())) return Intercepted::kNo;
  Local<Value> args[] = {key,descriptor.value(),info.GetIsolate()->GetCurrentContext()->Global()}, result;
  Invoke(info.GetIsolate(), info.Data(), "set", 3, args, &result);
  return Intercepted::kYes;
}
Local<String> StorageIndexKey(Isolate* isolate,uint32_t index){return String::NewFromUtf8(isolate,std::to_string(index).c_str()).ToLocalChecked();}
// Indexed Storage access always resolves the real area, including absent
// indices; ordinary physical accessors and prototype names do not mask it.
Intercepted StorageIndexGet(uint32_t index,const PropertyCallbackInfo<Value>& info){
  Local<Value> args[]={StorageIndexKey(info.GetIsolate(),index)},result;
  if(Invoke(info.GetIsolate(),info.Data(),"get",1,args,&result))info.GetReturnValue().Set(result);
  return Intercepted::kYes;
}
Intercepted StorageIndexSet(uint32_t index,Local<Value> value,const PropertyCallbackInfo<void>& info){
#if NODE_MAJOR_VERSION < 26
  if(info.This()!=info.HolderV2())return Intercepted::kNo;
#endif
  Local<Value> args[]={StorageIndexKey(info.GetIsolate(),index),value,info.GetIsolate()->GetCurrentContext()->Global()},result;
  Invoke(info.GetIsolate(),info.Data(),"set",3,args,&result);return Intercepted::kYes;
}
Intercepted StorageIndexDelete(uint32_t index,const PropertyCallbackInfo<Boolean>& info){
  Local<Value> args[]={StorageIndexKey(info.GetIsolate(),index)},result;
  if(Invoke(info.GetIsolate(),info.Data(),"remove",1,args,&result))info.GetReturnValue().Set(true);
  return Intercepted::kYes;
}
Intercepted StorageIndexDefine(uint32_t index,const PropertyDescriptor& descriptor,const PropertyCallbackInfo<void>& info){
  if(!descriptor.has_value())return Intercepted::kNo;
  return StorageIndexSet(index,descriptor.value(),info);
}
Intercepted StorageIndexDescriptor(uint32_t index,const PropertyCallbackInfo<Value>& info){return StorageOwnDescriptor(StorageIndexKey(info.GetIsolate(),index),info);}
void CreateStorage(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  if (info.Length()!=3 || !info[0]->IsObject() || !info[1]->IsObject() || !info[2]->IsFunction()) {
    isolate->ThrowException(Exception::TypeError(String::NewFromUtf8Literal(isolate,"Storage bridge, prototype and realm anchor are required")));return;
  }
  Local<Context> realm;
  if (!info[2].As<Object>()->GetCreationContext().ToLocal(&realm)) return;
  Context::Scope scope(realm);
  auto constructor=FunctionTemplate::New(isolate);
  constructor->SetClassName(String::NewFromUtf8Literal(isolate,"Storage"));
  auto object=constructor->InstanceTemplate();
  object->SetHandler(NamedPropertyHandlerConfiguration(StorageGet,StorageSet,nullptr,StorageDelete,NamedKeys,StorageDefine,StorageDescriptor,info[0],
    static_cast<PropertyHandlerFlags>(static_cast<int>(PropertyHandlerFlags::kNonMasking)|static_cast<int>(PropertyHandlerFlags::kOnlyInterceptStrings))));
  object->SetHandler(IndexedPropertyHandlerConfiguration(StorageIndexGet,StorageIndexSet,nullptr,StorageIndexDelete,nullptr,StorageIndexDefine,StorageIndexDescriptor,info[0]));
  Local<Object> value;
  if (!object->NewInstance(realm).ToLocal(&value)) return;
  if (!value->SetPrototypeV2(realm,info[1]).FromMaybe(false)) return;
  info.GetReturnValue().Set(value);
}

NODE_MODULE_INIT() {
  NODE_SET_METHOD(exports, "create", Create);
  NODE_SET_METHOD(exports, "createIndexed", CreateIndexed);
  NODE_SET_METHOD(exports, "createStorage", CreateStorage);
  auto isolate = Isolate::GetCurrent();
  exports->Set(context, String::NewFromUtf8Literal(isolate, "headersVersion"), String::NewFromUtf8Literal(isolate, NODE_VERSION)).Check();
  exports->Set(context, String::NewFromUtf8Literal(isolate, "abiVersion"), Integer::New(isolate, NODE_MODULE_VERSION)).Check();
}
}  // namespace red_panda
