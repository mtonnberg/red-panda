# Independent collection binding

`collections.cc` supplies a small V8 binding for the real `[[IsHTMLDDA]]`
behavior of `document.all`. A JavaScript Proxy cannot supply this engine bit.
The binding marks an object undetectable, makes it callable, and delegates live
property lookup/enumeration to `src/collections.js`. It contains no upstream
Lightpanda implementation code, native DOM, JavaScript parser, or browser engine.
V8 owns the bridge references and collection objects; the binding uses no
process-global persistent V8 handles or external object pointers.

The resulting object simultaneously supports:

- `typeof document.all === 'undefined'`, falsiness and equality with `null` or
  `undefined`, while strict equality with `undefined` remains false;
- live element indexing, iteration, callable lookup, `item` and `namedItem`;
- IDs, eligible HTML `name` attributes, duplicate-match live HTMLCollections;
- enumerable indexed properties and unenumerable named properties;
- the `HTMLAllCollection` prototype and receiver checks.

The JS adapter also fixes two related jsdom26 RadioNodeList issues: a derived
list must refresh its lazy form-controls parent, and its value setter must
refresh membership before selecting a radio. The private update hook applies
only to globals that installed this adapter.

## Build and integration

This binding has a Linux build recipe and requires `g++`, matching Node/V8
headers, and the repository's existing jsdom dependency. No node-gyp package or
additional runtime dependency is needed.

Run the builder using the **same Node executable** that will run Red Panda:

```sh
node native/build-collections.mjs
```

The default output is
`native/build/linux-x64/node-VERSION/collections.node`, with an adjacent JSON
manifest. These are generated artifacts; do not commit them. Use `--output`
to place them elsewhere. Header discovery checks the executable's installation,
the npm Node package's bundled headers, the prepared cloud header cache, and
`/usr/include/node`. An explicit path is supported:

```sh
node native/build-collections.mjs --headers /absolute/path/to/include/node --output /tmp/collections.node
```

`RED_PANDA_NODE_HEADERS` provides the same header override. The builder checks
the header major/minor/patch against the running executable and refuses a
mismatch. The loader verifies exact Node and V8 versions, ABI, OS/architecture,
source digest and binary digest before requiring the addon. Matching ABI137
alone is deliberately insufficient: tested Node24.19.0 and24.22.1 use different
V8 patch versions. Rebuild and restart after changing the native source, runtime
or binary. Hot replacement of an already loaded addon is not supported.

The browser loads the binding once and installs it before parsing each main
document and actual child frame. The integration is equivalent to:

```js
import { loadCollectionsBinding, installCollections } from './collections.js';
const binding = loadCollectionsBinding();
// Inside JSDOM.beforeParse, including actual child-frame preparation:
installCollections(window, { binding });
```

Pass a path to `loadCollectionsBinding(path)` or set
`RED_PANDA_COLLECTIONS_ADDON` when building outside the default directory. Load
once and reuse the binding across document installations. Missing or incompatible
native support throws before the adapter installs `document.all`; there is no
fake `typeof` workaround, Proxy fallback, or undefined-returning substitute.

## Verification

These commands compile a fresh addon into a temporary directory, run
nine focused tests, and remove their artifacts:

```sh
node --test test/collections.test.js
/workspace/shared/rea-tools/node_modules/node/bin/node --test test/collections.test.js
/workspace/shared/node26/node_modules/node/bin/node --test test/collections.test.js
```

All passed: current Node24.19.0, prepared Node24.22.1 and Node26.13.0. The native
bridge uses `Object::SetPrototypeV2` and `Isolate::GetCurrent`, which are available
in all three runtimes and preserve the same collection semantics. Tests cover real engine
semantics inside the page realm, live membership, names/IDs, duplicate matches,
enumeration/descriptors, brand checks, parser-time installation, RadioNodeList
refresh, and rejection of incompatible/tampered build manifests.

The prepared Node24.22.1 package already includes its exact headers. For the
current Node24.19.0, official headers were downloaded from
`https://nodejs.org/dist/v24.19.0/node-v24.19.0-headers.tar.gz` and verified against
that directory's official HTTPS `SHASUMS256.txt`. The archive SHA-256 is
`54f14a297d47ea0794fe272363703d9dc419c96ac68f20d890f98b63754a3e4c`.
The extracted cloud cache is
`/workspace/shared/node-headers/v24.19.0/node-v24.19.0/include/node`.
This is checksum verification against the official HTTPS manifest, not a signed
release verification claim.

Unchanged upstream test fixtures can be checked independently:

```sh
node native/verify-collection-fixtures.mjs /absolute/path/to/upstream/src/browser/tests /absolute/path/to/collections.node
```

The following all passed their unmodified `testing.assertOk()` harness with no
reported errors on Node24.19.0:

| Fixture | SHA-256 |
| --- | --- |
| document/all_collection.html | e583874010ec12edbc3605241823a15d514b1a8cd414446091a92ad6158bfb09 |
| collections/html_all_collection.html | 1f9a5bf9f071f39aa217b4751bc0e91930e593868ff80c79a9b6b17775852ced |
| collections/radio_node_list.html | 634c39e1028834d0ff9b32749623356377eae42d5fdde7198e53170725364aa1 |

Their shared `testing.js` SHA-256 is
`23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b`.
This was a local unchanged-fixture check, not a native-reference differential
capture. The fixtures are not copied into this repository.

## Limits

This implements the live read/call/named-property core and the actual HTMLDDA
bit. It is not a complete WebIDL legacy-platform-object implementation.
Assignment, deletion, `Object.defineProperty`, preventExtensions/freeze and
cross-realm borrowed getter edge cases need further conformance work. The native
interceptors currently allow V8's ordinary write/definition behavior, which can
differ from browser legacy collection rules. Supported HTML `name`-tag coverage
has not been exhaustively compared across obsolete tags. No Windows/macOS build
recipe, prebuilt distribution, ABI portability claim or hostile-code security
sandbox claim is supplied.
