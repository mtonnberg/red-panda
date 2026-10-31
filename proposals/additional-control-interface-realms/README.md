# Textarea, Select and Option public interface creation

This bounded three-interface change executes the **unchanged original generated public installer bodies** in their actual owning Node VM at first installation. It preserves the canonical CommonJS exports, original derived constructors, private implementations/setup, original custom-element Proxy, original Select sole wrapper Proxy/handler/cache, and existing frontend/backend identities. No existing published prototype is replaced or repaired; no creation hint or production query filter is added.

Patch `18804265d3cf1912568f92f8e8b671ef28b0d2974297ec7fdc3b10a9798fa311` changes three paths: new `src/additional-control-interface-realms.js`, a central compiler import/transform hook in `src/dom-wrapper-realms.js`, and new `test/additional-control-interface-realms.test.js`. The new module is `62b1eb9a098e15c7613bcf3a75a0fb60e3fffa2d90a925ea986e844a9385d0bf`; test is `324cbb1625901e4815df89415fd80e2526ae5f0b4ec8c1e4075d619741465393`.

The proven Input/ValidityState helper `9562a190077d6af25b20740fe40e9044e7989f4e3be6952f1bd79a61b6bb5a3f` is unchanged and reused. No export/setup/cache hook is added there. Frozen form adapter `a08ad697439ae5d8ca57fdb3054d2bd5f9cfae952470c790c6754506deae856a` is unchanged. The447-file exact Root graph was copied and checked stable before/after copying to `/workspace/shared/textarea-select-interface-realms-20261031`. Only the central compiler changes among those existing isolated files; new module/test are additional files. No Root runtime/test/native/dependency mutation or native build occurred.

## Actual gap before editing

`evidence/creation-before-24.22.json` was recorded before any candidate source edit. All three main/frame interface prototypes, untouched textarea.cols/select.add/select.value/option.text members were physically Host-created before and after setting their prototype to null. Existing public constructors were already genuine VM custom-element Proxies; actual DOM wrappers/Select Proxy were already VM. Utility interfaces and frozen Input/ValidityState prototypes were already VM. The separate Window.Option convenience constructor function was Host, and remains an explicit gap.

## Allocation and authority

Each exact original generated template is pinned under jsdom26.1.0: Textarea `799ee17e382f9e2352bc13bbe7795c7b54488a61cb61b76670c26812d058d6a0`, Select `c414c96dea79a10812673a08c1ec7159c8ebe91ae1a0d9b7cd024969345f60f5`, Option `821b44d734cbfbf00b839ec26189337d35abff46ec38da9304166e664e9e1d2f`. Exact signature/footer/body guards reject changed source or changed original public installer code. Original dependency sources and their existing MIT license are included for transparency; no target-engine implementation source is copied.

The existing central Host compiler retains the same canonical module exports and original private graph. Only the public installer body is delegated through the frozen Host-owned installControlInterface helper to actual startup Window/Node Contextify authority. Select's public installer ends **before** its original private ProxyHandler/cache definitions; their source never executes in the VM. The observed actual handler remains physically Host even after null prototype, while the original single public Proxy/target are VM. No second facade is introduced. Genuine no-runScripts Host JSDOM retains the original Host installer. Utility loader is unchanged.

The temporary VM entry is not cached/exposed. Original public operation code runs naturally in its VM, including its transient local values; no native-private transient-allocation or heap-count equivalence is claimed. Future canonical raw owned-context integration must select its actual immutable RealmHandle/compiler authority; it must not guess Node vm.isContext authority from a public global. Coverage agent's canonical installer work is separate and unchanged.

## Validation and actual contraries

Six focused tests pass6/6 on each24.19.0,24.22.1,26.13.0, using the same final source/test leaves. Tests cover genuine first creation, same sole Select Proxy and real Host handler/backend/cache, Native-supported customized factory construction, frame/adoption/utility canonical identities, true Host fallback, exact template/body guards and frozen Input helper identity.

Final direct public-V8 creation proofs in `creation-final-{24.19,24.22,26.13}.json` each contain27rows with no failure. Real VM public values/proxy targets remain VM after null prototype. Actual Host handler, Host Window.Option convenience function and Host negative remain Host. Real option/collection/backend identities remain live; main/utility share the actual canonical implementation. Each proof binds its driver/module/compiler/Input-helper hashes and matching actual runtime/public-V8 addon manifests. No queryObjects/GC/heap traversal was used.

Four final Native/baseline/candidate behavior controls are preserved in `*-behavior-v2.json` and `behavior-comparison-v2.json`. Actual successful factory construction of customized Textarea/Select/Option exactly matches Native: each actual constructor executes once, keeps the authored property and actual prototype/text, and rejects unsupported direct construction with blank TypeError. Other functional rows are unchanged baseline→candidate. Ordinary class-call errors improve from Host TypeError to genuine own-VM TypeError, matching Native error realm; existing constructor/receiver message differences remain.

Important existing Native differences remain explicit:

- Native Select.options returns a fresh front; candidate retains its existing cached actual collection.
- Native indexed select access is missing in these controls, and array iteration yields undefined entries; candidate retains its actual indexed Proxy behavior.
- Constructor/invalid-receiver messages differ from Native; generic generated brands/private implementation symbols are not replaced in this creation slice. Frozen common form methods keep their existing stronger provenance handling.
- Window.Option convenience function itself stays Host, though its returned actual option/prototype/backend behavior is preserved.

The first Native behavior epoch actually threw when its iterator callback dereferenced Native's missing indexed entries. Its raw exception/partial control results remain in `native-behavior.json`. The v2 control safely represents those **real** missing entries as `[missing]`, rather than inventing options or success. A first comparison helper failed with KeyError because it assumed that exception result contained a value; no source fix was made for either observation. No Native cache/index discrepancy was silently repaired or counted as a match.

All controls use fresh BrowserContexts and owned ephemeral localhost HTTP/CDP services, with real cleanup. CDP source/native before-after guards remain unchanged; `candidate-graph.json` binds223source/native/test/dependency files. No broad/full/PureScript/unchanged-fixture replay, heap, build, canonical port, or deadline-sensitive test was run in this slice. Existing ancestor Node/HTMLElement interface creation and cross-frame inheritance remain outside its scope.

Apply `patch.diff` after Parent's Root full freeze ends, on the exact recorded phase21 graph with frozen Input helper/native prerequisites already present. Patch check succeeds. No native/dependency patch is included. Base/candidate leaves, exact sources, logs, Native contraries and source/runtime manifests remain immutable evidence.
