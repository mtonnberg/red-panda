# Heap-query crash counterfactuals and a paused next experiment

These Node 24.22.1 diagnostics used an ignored frozen copy of the application's
sources, package metadata, collection source, native binary and manifest under
.cache/heap-query-counterfactual. Production files were not edited. The only
collection-disabled source change was a conditional around installCollections in
that diagnostic copy; its Browser constructor still loaded the real binding.
All native execution used the core-limit-zero wrapper and a 90-second external
SIGKILL deadline. No core files were inspected. No gdb/lldb was found in PATH or
the checked installed binary directories, and no tools were installed.

The exact frozen-source/probe/artifact hashes and raw stage logs are in
runtime-query-counterfactual-summary.json and the individual
runtime-query-counterfactual-*.json files. The snapshot binary is the same
C++ implementation/source hash recorded by the earlier bounded failures.

| Diagnostic | Inspector behavior | Heap operation | Observed result |
| --- | --- | --- | --- |
| Frozen Browser, real collections | Existing realm selector | Actual snapshot query | SIGSEGV |
| Frozen Browser, installation disabled | Existing realm selector | Actual snapshot query | SIGSEGV |
| Plain jsdom, no collection binding loaded | Existing realm selector | Actual snapshot query | SIGSEGV |
| jsdom + real installCollections | Existing realm selector | Actual snapshot query | SIGSEGV |
| Frozen Browser, real collections | Disabled | Actual snapshot query | 6 cycles, 12 navigations, 15 queries pass |
| Frozen Browser, installation disabled | Disabled | Actual snapshot query | 6 cycles, 12 navigations, 15 queries pass |
| Plain jsdom | Runtime.enable only | Actual snapshot query | 6 cycles, 12 realms, 15 queries pass |
| Plain jsdom | Function call only in latest context | Actual snapshot query | 6 cycles, 12 realms, 15 queries pass |
| Plain jsdom | Same marker arguments/silent call only in latest context | Actual snapshot query | 6 cycles, 12 realms, 15 queries pass |
| Plain jsdom | Lexical names only, persistent vm.Script binding verifies selected realm | Actual snapshot query | 6 cycles, 12 realms, 15 queries pass |
| Plain jsdom | Marker call scans all reported non-default contexts | Actual snapshot query | SIGSEGV |
| Plain jsdom | Same all-context marker scan | No heap addon loaded or called | 6 cycles, 12 realms pass |

The all-context crash log ends at beforeContextCall:2:latest=5, after successful
calls to contexts 5, 4 and 3. Context 2 belongs to an earlier document whose
window.close had already been called, but which remained reported by the
inspector. The current document is context 5. The application selector currently
checks a private marker by executing a function in every reported non-default
context, including such older contexts.

These controls rule out HTMLDDA installation and the full Browser API setup as
necessary conditions for the reproduced crash. They isolate an interaction
between prior heap-query activity and later function probing of older closed
contexts. They do not identify the precise native fault, prove a Node/V8 defect,
or establish that every current-context-only workload is safe. The passing
controls are bounded observations. Runtime.queryObjects remains unsupported.

The first lexical-only setup attempted to create a persistent binding through
eval, which does not retain that lexical declaration after the eval. That setup
was corrected to vm.Script.runInContext before recording the passing lexical-only
control. It was not treated as a crash or a successful semantic result.

## Named-context experiment: designed, not executed

Further native work was paused during the root conformance run. All owned heap
probe children had already completed; a process-path check found no active Node
processes for .cache/heap-query* or experiments/heap-query*. Nothing required
termination, and no partially running native result was promoted to success.
No named-context module, build or test has started at this checkpoint.

The proposed diagnostic change will be confined to another frozen ignored copy:

1. Install a wrapper around the host vm.createContext factory before the first
   Browser Window is created. Give each newly created context a unique private
   options.name and retain the returned Context-to-name association in a host
   WeakMap. Do not put a marker on a page global. Pinned jsdom 26 passes its raw
   Window to vm.createContext and getInternalVMContext returns that same
   contextified object; frame facades expose their raw _globalObject similarly.
2. Record Runtime.executionContextCreated id/name pairs only for non-default VM
   contexts. Obtain the expected name from the selected page/frame's actual
   getInternalVMContext. Require exactly one matching reported name, and reject
   missing/ambiguous mappings. Do not call into an older context or choose a
   context merely because it has the latest numeric ID.
3. Test two live pages and two live frames in reversed creation/navigation order.
   Use distinct persistent lexical declarations and actual prototype descendants
   in each realm. Verify correct realm selection, actual returned object identity,
   array creation realm, cross-realm descendants, proxy stopping and mutations.
4. Retain old handles across repeated navigation, while querying and selecting
   the correct active contexts. Run owned, core-zero, externally bounded
   subprocesses on exact Node 24.22.1 and 26.13.0 builds. Only if both survive the
   actual Browser/Runtime lifecycle tests should the faster direct profiler path
   be tested under this changed diagnosis.

This could eventually reduce the production integration to a context-name helper,
initialization before Window creation, and a name lookup replacing RealmInspector's
marker scan. That is a proposal, not an implemented or validated fix. The process-
wide vm factory interception, pre-existing contexts, frames, mapping cleanup and
missing-name failures must be reviewed explicitly before any production change.
