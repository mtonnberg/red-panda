# Preserved named-context lifecycle evidence

These are the exact independently authored sources used by the positive mapping,
snapshot and direct-profiler diagnostics on Node 24.22.1 and 26.13.0. They remain
outside production imports, builders and default tests. Production
Runtime.queryObjects remains unsupported. Original crashes using the old marker
selector remain relevant negative evidence; these later results changed the realm
selection mechanism in a frozen copy and do not establish general heap safety.

`manifest.json` pins every preserved historical file, the complete frozen source
tree, its Git baseline and all six positive raw result artifacts. Every recorded
sourceHashes entry in those results was checked against the preserved bytes.
The historical comments saying “prepared” or “unexecuted” are preserved verbatim;
the later result artifacts, rather than those old comments, record execution.

- `probe-mapping-control.mjs` was executed as `.cache/heap-query-named/probe.mjs`
  for the mapping controls: six cycles and 42 exact selections on each runtime.
- `probe.mjs` was then executed at that path for snapshot/direct: four cycles,
  28 tracked selections and 41 actual queries per runtime/backend. It additionally
  checks actual object mutation, cross-realm descendants, Proxy stopping,
  retained closed contexts, navigation and real CDP result-group lifecycle.
- `run-{mapping,snapshot,direct}.mjs` are the exact sequential bounded drivers.
  They preserve absolute SDK/cache paths and write the historical reference
  filenames. **Run only in a disposable checkout:** otherwise they overwrite
  existing reference observations. Their original external deadlines are 60, 180
  and 120 seconds per child respectively; every child uses `run-probe.sh` (core0).
- `overlays/` contains the exact five differences from the baseline commit,
  including unrelated pre-existing classic-script/form changes in the frozen
  snapshot. Diagnostic runtime metadata exports are not production APIs.
- `direct-profiler.cc` is byte-identical to `../direct-unsafe.cc`, SHA256
  `ac681b83c94d342de1590ec10cf626bd6f3041898aee2fd27cc00af59555991d`.
- `collections-node-*.json` preserves the exact collection-binary manifests used.
  No native binaries are committed. `cdp-client.js` preserves the imported helper.

There was no retained original preparer program: preparation used ad-hoc tool
calls. `prepare.py` is a **new, unexecuted reconstruction helper**, not the source
of the historical results. It reconstructs hash-pinned files using Git plus the
preserved overlays and refuses to replace an existing cache tree. Merely preparing
the sources neither loads nor builds native code.

## Reconstruct sources without runtime execution

Use a disposable checkout containing this preservation directory and the complete
Git history. The reconstruction baseline is
`9d8250eb785360379d60c2bfdacfe97dd929a51e`; the helper retrieves the exact baseline
file contents even when the disposable checkout's HEAD is newer. Its pinned
`test/cdp-client.js` must match. Run from the repository root:

```sh
python3 experiments/heap-query/named-lifecycle/prepare.py --phase mapping
```

For the historical snapshot/direct source shape use `--phase snapshot` or
`--phase direct` in a fresh disposable checkout. All three prepare the identical
frozen Browser/runtime/helper sources; mapping selects its earlier probe bytes.

## Explicit dependency and native build setup

The historical environment was Linux x64 with the root's existing npm dependencies
(jsdom 26); reproduce them using the baseline package-lock.json in a disposable
checkout. The prepared `base/package.json` is byte-pinned, and module resolution
uses the root node_modules. The exact runtimes/SDKs used were:

| Node | V8 | ABI | Node executable | Headers |
| --- | --- | --- | --- | --- |
| 24.22.1 | 13.6.233.17-node.58 | 137 | /workspace/shared/rea-tools/node_modules/node/bin/node | /workspace/shared/rea-tools/node_modules/node/node_modules/node-linux-x64/include/node |
| 26.13.0 | 14.6.202.34-node.40 | 147 | /workspace/shared/node26/node_modules/node/bin/node | /workspace/shared/node26/node_modules/node/node_modules/node-linux-x64/include/node |

In the disposable checkout only, the explicit dependency setup is:

```sh
git show 9d8250eb785360379d60c2bfdacfe97dd929a51e:package.json > package.json
git show 9d8250eb785360379d60c2bfdacfe97dd929a51e:package-lock.json > package-lock.json
env PATH="/workspace/shared/rea-tools/node_modules/node/bin:$PATH" npm ci
```

The lock SHA256 is
`91b516feab2b8ec27ff7a7843dc6d07efd817232556a7031c1cf89fab7772962`.
The npm executable comes from the host PATH; use a compatible npm installation
on another host. These install commands are instructions only and
were not executed during preservation.

The original SDK paths are pinned in the runners and manifests. Another host must
provide these paths or use a separately labeled adapted/unexecuted runner; do not
call changed runner bytes the historical run. Never import an addon built for a
different Node/ABI/V8 version. With the exact runtimes and headers available,
explicitly compile the frozen collection source into its prepared tree (do this
for each runtime, changing the two version-specific paths):

```sh
mkdir -p .cache/heap-query-named/base/native/build/linux-x64/node-24.22.1
g++ -std=c++20 -O2 -fno-strict-aliasing -fPIC -shared -Wall -Wextra -Wno-unused-parameter -Wno-cast-function-type -DNODE_GYP_MODULE_NAME=red_panda_collections -I/workspace/shared/rea-tools/node_modules/node/node_modules/node-linux-x64/include/node .cache/heap-query-named/base/native/collections.cc -o .cache/heap-query-named/base/native/build/linux-x64/node-24.22.1/collections.node
cp experiments/heap-query/named-lifecycle/collections-node-24.22.1.json .cache/heap-query-named/base/native/build/linux-x64/node-24.22.1/collections.node.json
sha256sum .cache/heap-query-named/base/native/build/linux-x64/node-24.22.1/collections.node
```

**Compare the generated binary digest with its preserved manifest before any
execution.** Compiler/linker/SDK differences can alter digests. A mismatch is a new
build requiring separately recorded provenance, never a reason to replace an
old manifest's digest silently. The historical build recipes below are supplied
for reproducibility and have not been rerun during this preservation step.

Snapshot backend uses the preserved standalone builder with an explicit output:

```sh
/workspace/shared/rea-tools/node_modules/node/bin/node experiments/heap-query/build.mjs --headers /workspace/shared/rea-tools/node_modules/node/node_modules/node-linux-x64/include/node --output .cache/heap-query-probe/heap-query.node
/workspace/shared/node26/node_modules/node/bin/node experiments/heap-query/build.mjs --headers /workspace/shared/node26/node_modules/node/node_modules/node-linux-x64/include/node --output .cache/heap-query-probe/heap-query-node26.node
```

Direct backend's explicit compiler recipe (repeat with Node26 headers and
`direct-node26.node`) is:

```sh
mkdir -p .cache/heap-query-probe
g++ -std=c++20 -O2 -fno-strict-aliasing -fPIC -shared -Wall -Wextra -Wno-unused-parameter -Wno-cast-function-type -DNODE_GYP_MODULE_NAME=red_panda_heap_query_direct -I/workspace/shared/rea-tools/node_modules/node/node_modules/node-linux-x64/include/node experiments/heap-query/named-lifecycle/direct-profiler.cc -o .cache/heap-query-probe/direct.node
sha256sum .cache/heap-query-probe/direct.node
```

The original snapshot/direct binary digests and runtime versions are retained in
`docs/reference/runtime-query-provenance.json` and the newer successful raw JSON.
The exact direct runner rejects binaries differing from the original pinned
digests; snapshot verifies its build manifest's binary digest. A fresh rebuild is
not itself evidence that the historical workload was rerun successfully.

## Explicit reproduction after setup

No commands in this section were rerun for preservation. After source/hash/SDK
setup and once an isolated runtime window is authorized, select the matching
prepared phase in a disposable checkout and invoke one historical runner:

```sh
/workspace/shared/rea-tools/node_modules/node/bin/node .cache/heap-query-named/run-mapping.mjs
/workspace/shared/rea-tools/node_modules/node/bin/node .cache/heap-query-named/run-snapshot.mjs
/workspace/shared/rea-tools/node_modules/node/bin/node .cache/heap-query-named/run-direct.mjs
```

Each driver runs its two runtimes sequentially and stops after a failure. Snapshot
and direct require their own prepared probe bytes; mapping requires the earlier
mapping-only probe. Preserve new outputs under distinct result names after a
reproduction and label partial/failing/time-out outcomes honestly. The public CDP
queryObjects route is asserted unsupported even inside these diagnostic runs.
