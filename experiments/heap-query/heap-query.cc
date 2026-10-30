#include <node.h>
#include <node_version.h>
#include <v8-profiler.h>
#include <chrono>
#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>

// Independent feasibility experiment using public V8 heap-profiler APIs only.
// No inspector Runtime.queryObjects call, serialized object reconstruction,
// upstream browser implementation or persistent object handles are used.
namespace red_panda_heap_query {
using namespace v8;

Local<String> Text(Isolate* isolate, const char* value) {
  return String::NewFromUtf8(isolate, value).ToLocalChecked();
}
void Set(Local<Context> context, Local<Object> target, const char* key,
         Local<Value> value) {
  target->CreateDataProperty(context, Text(Isolate::GetCurrent(), key), value).Check();
}
void Fail(Isolate* isolate, const char* message) {
  isolate->ThrowException(Exception::Error(Text(isolate, message)));
}
struct SnapshotDeleter {
  void operator()(const HeapSnapshot* snapshot) const {
    if (snapshot) const_cast<HeapSnapshot*>(snapshot)->Delete();
  }
};
using Snapshot = std::unique_ptr<const HeapSnapshot, SnapshotDeleter>;
struct Deadline final : ActivityControl {
  std::chrono::steady_clock::time_point end;
  explicit Deadline(int milliseconds)
      : end(std::chrono::steady_clock::now() + std::chrono::milliseconds(milliseconds)) {}
  ControlOption ReportProgressValue(uint32_t, uint32_t) override {
    return std::chrono::steady_clock::now() > end ? kAbort : kContinue;
  }
};
std::string Name(Isolate* isolate, Local<Value> value) {
  if (!value->IsString()) return "";
  String::Utf8Value string(isolate, value);
  return *string ? std::string(*string, string.length()) : "";
}
Snapshot Take(Isolate* isolate, Deadline* deadline) {
  HeapProfiler::HeapSnapshotOptions options;
  options.control = deadline;
  return Snapshot(isolate->GetHeapProfiler()->TakeHeapSnapshot(options));
}

// The graph exposes genuine [[Prototype]] through each object's internal map
// and that map's internal prototype edge. A named "__proto__" property alone
// is ambiguous: pages can define their own data property with that exact name.
// Neither getters nor Proxy getPrototypeOf traps are called here.
void QueryObjects(const FunctionCallbackInfo<Value>& info) {
  auto isolate = info.GetIsolate();
  if (info.Length() < 1 || !info[0]->IsObject()) {
    isolate->ThrowException(Exception::TypeError(Text(isolate, "A prototype object is required"))); return;
  }
  int limits[] = {100000, 2000000, 10000, 10000000};
  const int maximum[] = {1000000, 10000000, 60000, 50000000};
  for (int i = 0; i < 4 && i + 1 < info.Length(); ++i) {
    if (!info[i + 1]->IsUint32()) {
      isolate->ThrowException(Exception::RangeError(Text(isolate, "Heap query limits must be positive bounded integers"))); return;
    }
    auto value = info[i + 1].As<Uint32>()->Value();
    if (value == 0 || value > static_cast<uint32_t>(maximum[i])) {
      isolate->ThrowException(Exception::RangeError(Text(isolate, "Heap query limits must be positive bounded integers"))); return;
    }
    limits[i] = static_cast<int>(value);
  }
  Local<Context> result_context;
  if (!info[0].As<Object>()->GetCreationContext(isolate).ToLocal(&result_context)) {
    Fail(isolate, "The prototype creation context is unavailable"); return;
  }
  Deadline deadline(limits[2]);
  auto snapshot = Take(isolate, &deadline);
  if (!snapshot) { Fail(isolate, "Heap snapshot aborted"); return; }
  if (snapshot->GetNodesCount() > limits[1]) { Fail(isolate, "Heap query node limit exceeded"); return; }
  const auto prototype_id = isolate->GetHeapProfiler()->GetObjectId(info[0]);
  if (!prototype_id || !snapshot->GetNodeById(prototype_id)) {
    Fail(isolate, "The prototype was not found in the heap snapshot"); return;
  }
  std::unordered_map<SnapshotObjectId, std::vector<SnapshotObjectId>> maps_by_prototype, objects_by_map;
  int64_t edge_count = 0;
  for (int index = 0; index < snapshot->GetNodesCount(); ++index) {
    HandleScope iteration(isolate);
    if ((index & 255) == 0 && std::chrono::steady_clock::now() > deadline.end) {
      Fail(isolate, "Heap query deadline exceeded"); return;
    }
    auto node = snapshot->GetNode(index);
    edge_count += node->GetChildrenCount();
    if (edge_count > limits[3]) { Fail(isolate, "Heap query edge limit exceeded"); return; }
    for (int child = 0; child < node->GetChildrenCount(); ++child) {
      auto edge = node->GetChild(child);
      if (edge->GetType() != HeapGraphEdge::kInternal) continue;
      const auto name = Name(isolate, edge->GetName());
      if (name == "prototype" && node->GetType() == HeapGraphNode::kObjectShape) {
        maps_by_prototype[edge->GetToNode()->GetId()].push_back(node->GetId());
      } else if (name == "map" && edge->GetToNode()->GetType() == HeapGraphNode::kObjectShape) {
        objects_by_map[edge->GetToNode()->GetId()].push_back(node->GetId());
      }
    }
  }
  std::vector<SnapshotObjectId> queue{prototype_id};
  std::unordered_set<SnapshotObjectId> seen{prototype_id};
  std::vector<Local<Value>> matches;
  for (size_t current = 0; current < queue.size(); ++current) {
    if (std::chrono::steady_clock::now() > deadline.end) { Fail(isolate, "Heap query deadline exceeded"); return; }
    auto maps = maps_by_prototype.find(queue[current]);
    if (maps == maps_by_prototype.end()) continue;
    for (auto map : maps->second) {
      if (std::chrono::steady_clock::now() > deadline.end) { Fail(isolate, "Heap query deadline exceeded"); return; }
      auto instances = objects_by_map.find(map);
      if (instances == objects_by_map.end()) continue;
      for (auto id : instances->second) {
        if (std::chrono::steady_clock::now() > deadline.end) { Fail(isolate, "Heap query deadline exceeded"); return; }
        if (!seen.insert(id).second) continue;
        auto object = isolate->GetHeapProfiler()->FindObjectById(id);
        if (object.IsEmpty() || !object->IsObject()) continue;
        if (matches.size() >= static_cast<size_t>(limits[0])) {
          Fail(isolate, "Heap query result limit exceeded"); return;
        }
        matches.push_back(object); queue.push_back(id);
      }
    }
  }
  // Real local handles now root every result. Releasing the graph retains no
  // persistent handles or result registry, and does not clear shared profiler IDs.
  snapshot.reset();
  Context::Scope scope(result_context);
  auto result = Array::New(isolate, static_cast<int>(matches.size()));
  for (uint32_t index = 0; index < matches.size(); ++index) {
    if (!result->CreateDataProperty(result_context, index, matches[index]).FromMaybe(false)) return;
  }
  info.GetReturnValue().Set(result);
}
NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "queryObjects", QueryObjects);
  auto isolate = Isolate::GetCurrent();
  Set(context, exports, "headersVersion", Text(isolate, NODE_VERSION));
  Set(context, exports, "abiVersion", Integer::New(isolate, NODE_MODULE_VERSION));
}
}  // namespace red_panda_heap_query
