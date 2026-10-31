# Exact CDP domain lifecycle dispatch

On an actual attached session, unknown methods such as `Network.nested.enable` and `.disable` currently succeed and change Network event delivery. `Network.disable` before enable currently returns -32601. The two-file patch accepts exact known lifecycle names and makes those explicit disables idempotent. Dedicated DOM handlers, all substantive dispatch branches and known Root extensions remain. Runtime utility cleanup retains its original enabled-only guard.

Base: Root commit `78dbea872990db066747a3f17431de49a5fb4135`; source `src/cdp.js` SHA `703812e30b0d41d815e5abb955fc26eba4565f994bead64acd8ac2f7bfcce176`. Final source SHA `fb31a7b10830f3f962c88c4920dbd00aa9c10ba4e0a7fb73d62cf85eab27fb8c`. Final integration patch SHA `96fa23fb90f4c41b9c5a71732df32eaf48d11f11c8c8f4a18ce963a8dd4f1f52`. Root is unedited; application is reserved to the parent reviewer.

## Actual control outcomes

| Observation | Actual Native | Unpatched current candidate | Final isolated candidate |
| --- | --- | --- | --- |
| Network.disable before enable | `{}` | -32601 | `{}` |
| Unknown domain enable/disable | -32601 each | -32601 each | -32601 each |
| Network.nested.enable/disable | -32601 each | `{}` each | -32601 each |
| Request and response event counts: disabled / enabled / disabled again | 0 / 1 / 0 | 1 / 0 / 0 | 0 / 1 / 0 |
| Real complete documents and primary server requests | 3 and3 | 3 and3 | 3 and3 |

Every stage uses a fresh actual browser/target/session and real authored HTTP response bytes on an ephemeral port, with document.complete observed. Original wire frames, returned error text, navigation payloads, actual server requests and process stderr remain in `evidence/*controls.json`. Native's owned process exits0, signal null. RPC budget2500ms; each post-navigation document-complete budget2000ms; no settling delay or canonical port. The comparison is an explicit lifecycle projection, not whole-payload parity: generated ids/navigation fields/error wording differ and remain visible in raw reports. Pinned reference source948d773786 is a behavior contract; no engine code is imported. Actual binary SHA `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`; driver SHA `637268ca97035fd90f6a0240ce649934d64bab56738523885d3c78d313448716`.

## Validation and retained contrary evidence

Final25 focused checks pass separately on Node24.19.0,24.22.1 and26.13.0. The scope is3 new cases plus22 unchanged cases from cdp.test.js, dom.test.js and world-protocol.test.js. The third new case preserves a real utility context, object handle and binding across repeated Runtime.disable and re-enable, verifies one fresh context announcement, and checks real post-enable binding delivery. Existing original timeouts/assertions are unchanged. Unchanged already compiled PureScript Puppeteer suite passes100 checks on24.22.1 against the isolated candidate. No compiler/build/new dependency or other SDK PureScript run occurred.

The first variant passed24 checks on each SDK but called Runtime utility cleanup unconditionally. Parent review identified that expansion beyond measured Network behavior. `evidence/superseded-unconditional-runtime-hook` preserves that exact code/test and original logs; those results are not final corrected validation. The original unpatched negative control is also retained. The final narrow condition preserves old Runtime cleanup semantics; no extra Native Runtime lifecycle claim is inferred. Existing MaxListeners warnings appear in both original and patched candidate logs and are retained.

Static `git apply --check` succeeds against an owned copy of the exact baseline. Source/lock/native/bin/script/test guard protects520 Root files; an additional5894 original automation source/output files also match after execution, for6414 selected protected files unchanged. Shared node_modules is a read-only symlink to Root; this packet does NOT claim an independent before/after6579-dependency guard or the parent's full-input guard. Parent verification remains required. All copied native sources/artifacts remain unchanged; native/runtime.cc stays `cb235f736c7ab4171543d29f6a7278c1c895f35785d001ed2115e43b3c3bedd6`. No old2db/C984 owned-context artifact is involved. Runtime lease released and owned processes closed before packaging.

## Scope

Generic exact methods are Page/Runtime/Network/Log/Performance/Audits enable and disable. DOM.enable/disable remain in their existing substantive dedicated router. Page.disable is preserved as a known Root extension, not advertised as a Native Page action. No new absent domain is acknowledged. The existing Network response ledger/cache/buffer policy is unchanged; Native.disable's broader response-retention behavior is outside the four controls and not claimed complete. Cookie metadata, fetch bodies, typed sessions, Inspector/Debugger, missing protocol discovery, owned contexts and the module bridge remain separate tranches. Red Panda branding remains intentional. This is a bounded protocol fix, not a full-suite, WPT, performance or full replication acceptance claim.

The prior static206-command inventory `/workspace/shared/cdp-gap-inventory-handoff/static1` remains unchanged and separate. This packet supersedes its deferred93b68 lifecycle implementation only through the conditional Runtime cleanup refinement and the additional meaningful regression. Selectively apply only `src/cdp.js` and `test/cdp-domain-dispatch.test.js`.
