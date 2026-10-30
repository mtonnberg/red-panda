# Actual utility-world merge handoff

The implementation is a working independent prototype, not a production edit.
`isolated-world-leaf.patch` adds the core world and manager plus focused tests.
`isolated-world-frozen-integration.patch` is an executable integration example
against `/tmp/red-panda-isolated-world-frozen-sis2agaa` only. Its Browser/CDP files
predate Root's subsequent caller/realm-values/invocation and API work. Merge the
hooks below into current code; do not replace those current implementations with
the frozen copies.

The frozen source/native manifest is `source-manifest.json` in that directory.
Both prepared Node24.22.1 and26.13.0 runtime/collection binaries and manifests are
included. Original frozen files were not edited; the proposal uses loader hooks.
The existing pinned jsdom generated wrappers are compiled in a real new vm.Context
and operate on the original shared implementation tree. Per-world private WeakMaps
select actual public wrappers; the canonical main wrapperSymbol is preserved.
The compiler reads the installed dependency; no target engine source is imported.

## Required existing dependencies

- Keep Root's current `src/invocation.js` and its
  `createInvocationTrampoline(actualContext)` API. The prototype uses the reviewed
  peer helper byte-for-byte; utility callFunction remains inside a real VM timeout
  and uses its captured-intrinsic lexical frame, not Host Reflect.apply.
- Keep Root's current `src/realm-values.js`. Call
  `captureProtocolRealm(actualUtilityGlobal)` before authored utility preloads.
  Root's `Session.argument` must receive the selected facade's actual
  `dom.window`; do not substitute the main Window for logical utility context IDs.
- Keep all current caller parameter validation, object-group inheritance,
  released-object diagnostics and cross-context CallArgument checks. Resolve
  uniqueContextId only after validating its mutual exclusions; the frozen manager
  run-wrapper is an older executable demonstration, not permission to bypass
  current validation.

## Session and DOM hooks

1. Initialize the session manager after Session fields are initialized. The
   prototype's `initializeUtilitySession(session, resetRuntime)` owns its manager
   callbacks. A per-frame/document world-name cache is shared across CDP sessions;
   repeated calls use the same actual VM and logical executionContextId.
2. Replace alias selection with manager-backed `Session.executionPage(id)`.
   Its utility facade has actual `dom.window`, actual
   `dom.getInternalVMContext()`, executionContextId/uniqueId and document lifetime.
   It forwards URL reconciliation to the underlying real Page. Root's existing
   Runtime compile/run/await/lexical operations can then select the real VM.
3. Keep each actual realm's unique ID stable for its lifetime and expose a
   validated uniqueContextId lookup. Repeated Runtime.enable does not manufacture
   new realm identities. Explicit empty worldName is a real isolated VM. Pinned
   native rejects missing worldName with-31998 MissingField and wrong types with
   -31998 UnexpectedToken; empty-name ScriptValue tests must not fall back to root.
4. Emit the host-only `utilityWindowPrepared({page, window})` hook before main
   authored preloads/scripts. Utility worldName preloads execute only in that VM;
   main preload loop skips nonempty worldName. Registered binding functions must
   exist before utility preloads and main inline code. Context-targeted/name
   binding specs select actual realms, and queued binding events follow their
   real context announcement. Removed bindings leave inert functions as native.
5. Add the private `utilityNodeIdentity` classifier ahead of the existing Node
   check. Only the factory-owned WeakMap can admit utility wrappers; copied impl
   symbols do not. Normalize utility nodes to their canonical actual main node
   for backend-node IDs.
6. `DOM.resolveNode` is a typed producer: validate frame affinity against the
   canonical shared Document, then call `wrapUtilityDOMNode` for its requested
   context and retain that exact logical context ID. **Do not broadly rewrap
   Session.remote values.** Native CustomEvent.detail can carry an actual main
   Node/Array into utility JS. A returned handle remains logically utility while
   preserving that foreign object's identity/prototype/expandos.

The manager's current public host entry points are
`initializeUtilitySession`, `attachUtilityMethods`, `utilityUniqueId`,
`wrapUtilityDOMNode` and `configureUtilityFactories`. Root can merge these as
ordinary methods instead of retaining the experimental monkey-patch installer.
The facade's actual context is authoritative; no page-global marker evaluation or
alternate-ID main-context fallback is used.

## Trusted heap factories

No heap enumeration was run by this task. The optional factory API is:

```js
configureUtilityFactories({
  onRealm(global, context, metadata) {
    return registerHeapRealmAuthority({
      context,
      contextId: metadata.contextId,
      isActive: metadata.isActive,
    }); // returned disposer is tied to document abort
  },
  onWrapper(publicValue, global, metadata) {
    registerHeapFactoryValue(publicValue, {
      implementation: metadata.impl,
      globalObject: global,
    });
  },
});
```

onRealm receives the actual VM context before any authored utility preload;
onWrapper receives the final public wrapper after setup/repointing. Metadata also
includes interfaceName, actual context, page, signal and a disposed/liveness view.
Bootstrap notifications are briefly buffered until onRealm has run, then released;
no strong heap-candidate enumeration is exposed. Main wrapperSymbol is never used
as the utility query's canonical public key. Combined queryObjects ownership,
host-map exceptions and lifecycle acceptance remain with Root/MCP.

## Optional main-IDL hunk

`main-idl-prototypes-proposal.patch` is separate. Before authored code, it changes
only fresh pinned constructor-registry base links and method function prototypes
that still point to Node Object/Function prototypes. Existing EventTarget→main
Object alignment is untouched; Window/EventTarget/canonical wrapper identities
and shared CSS/host constructors remain unchanged. This corrects measured public
instanceof shapes through actual internal prototype links. Host function [[Realm]]
elsewhere remains a limit; heap counts are not claimed.

The getAttributeNames replacement is a real nonconstructable method created in
that Window's VM. It preserves descriptor/name/length and captures original,
Reflect.apply, Array.from and Array before authored code. Native borrowed parent
method returns the parent's actual Array, including after globals are poisoned;
the helper reproduces this with actual Array construction, not prototype changes
on output. The helper bootstraps jsdom before accessing private interfaces to
avoid cold-start CommonJS cycles.

## Explicit integration limits

Native retired-frame behavior is unusual: after iframe removal, the frame leaves
Page.getFrameTree and new-world creation is rejected, but existing main/utility
contexts and the old document remain callable; window.closed=true and a scheduled
utility timer still fires. Frozen FramePage abort immediately destroys/cancels that
state. The prototype preserves that abort policy and records the native mismatch;
it does not create copied DOMs or fake live aliases to conceal it.

Utility postMessage/structuredClone/Broadcast/Blob/File and Root-owned CSS/layout,
XML and other Window/DOM API decorators need their own genuine realm integration.
Do not alias main postMessage: register the actual utility incumbent global with
Root's trusted Window producer and use a realm-local native entry. Generated core
DOM wrappers are not a claim that all nongenerated/shared JS APIs have separate
wrapper expandos or correct callback/error producer realms. Per-world exception
reporting, cross-world foreign callbacks and the full API surface remain unproven.

The invocation helper's random lexical frame is not enumerable as a Window
property, but its name can be addressed if learned. This is documented rather
than described as a native private slot. Root must run combined current-source
and browser/Puppeteer acceptance after merging; frozen component evidence is not
a current production pass rate.
