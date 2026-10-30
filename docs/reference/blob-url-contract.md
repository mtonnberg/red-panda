# Document-owned object URLs

`src/blob-urls.js` exports:

```js
const controller = installBlobURLs(page, window);
// controller.dispose(), controller.size, controller.disposed
const { bytes, mimeType, url } = resolveBlobURL(page, objectURL);
```

Install before inline scripts and workers for every Page and FramePage. DOM
`URL.createObjectURL` accepts jsdom-branded Blob and File objects, snapshots their
actual bytes using the pinned jsdom26 implementation, and returns a unique
`blob:<creator-origin>/<uuid>` identifier. Opaque creators serialize as
`blob:null/<uuid>`. No filesystem URL or Node object-URL registry is exposed.
MIME type comes from the actual Blob implementation, including its normalization.

Registry ownership is the BrowserContext object plus the creator's actual
document origin identity. Tuple-origin peers in that context can resolve and
revoke entries. Different origins, different contexts and independent opaque
documents cannot do either. Distinct opaque documents remain distinct even when
their serialized origin is `null`. Unsandboxed about:blank/srcdoc frames inherit
their parent's origin identity, including an opaque parent's identity. Sandboxed
frames without allow-same-origin use separate opaque identities. These registry
checks do not establish general sandbox or cross-origin isolation elsewhere in
the browser.

Before creation, revocation and resolution, the owner refreshes its origin from
jsdom's private actual document origin. This handles frame windows installed
before an HTTP redirect commits the final origin, without trusting a forged
`window.origin`. A changed actual origin revokes entries created under the
obsolete origin. Stable opaque documents retain their identity, and sandbox
origin state remains a snapshot for that document even if iframe attributes
change. Already returned byte snapshots remain valid.

Revocation blocks subsequent lookups. A resolver call synchronously returns a
fresh Uint8Array snapshot, so already retained/inflight bytes survive revocation
or document disposal. Caller mutation and transfer cannot change the registry or
another snapshot. Document abort, page close, raw window close, frame detach and
context disposal revoke the creator document's entries. Other live documents'
entries remain intact. Explicit controller disposal is idempotent.

Missing, revoked, stale, forbidden and unsupported object URLs fail with
`BlobURLFetchError`, a TypeError with code `ERR_BLOB_URL_UNAVAILABLE`. Revoking an
unknown or foreign-origin/context URL is a no-op. Required arguments and Blob
brands are checked. Fetch lookup accepts a fragment and preserves it in the
returned URL; native fragment-bearing revocation is a no-op. Queries are not
removed from registry lookup.

Integration requirements:

- Resolve at request entry, before the first await, and construct a real response
  from returned bytes. The native observed response status is 200; content-type is
  present only for a nonempty Blob type, and the observed native response omits
  content-length. No network or base64 rewrite is needed.
- Resolve using the calling FramePage when a frame fetch delegates to the root
  Page transport. Using root-page origin would misclassify child requests.
- Worker construction can retain a constructor-time snapshot for startup. A
  later resource request must not accidentally re-resolve a URL already captured
  before immediate revocation. Snapshot bytes are safe to transfer to the worker.
- Worker relative imports against blob URLs still need explicit supported URL
  handling; this registry does not rewrite their base to a synthetic HTTP URL.

Native observations were collected with the verified binary
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, version
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The `blob-url-*-observations.json` files contain owned data/loopback HTTP and CDP
probes. No upstream production implementation was copied.

Native fixtures establish real binary bytes, File acceptance, origin serialization,
MIME normalization, invalid-argument TypeErrors, fragment fetch/revocation,
revocation failure and inflight snapshot survival. A native fetch started before
revocation returned its original bytes with status 200; a later fetch rejected with TypeError.

Native cross-page context scope remains unestablished. Separate PandaScript
Pages could not fetch each other's entries, but their BrowserContext relationship
is not exposed. A clean CDP probe created one explicit context/target and object
URL, then native rejected a second Target in the same context with
`TargetAlreadyLoaded` (-31998). Native also rejected a second concurrent context
with code -32000. Those limits prevent the requested two-target native comparison;
the context/origin sharing model here is an explicit independent policy, not a
claim of measured native cross-page equality.

`node --test test/blob-urls.test.js` passes 13 tests using actual Browser pages,
DOM Blobs/Files, inherited frames, an actual cross-origin redirected frame,
forged public origins, stable opaque/sandbox identities, owned HTTP origins and
document/context teardown.
Parent integration into fetch/worker startup is separate. Worker-created Blob
objects, range requests, blob document navigation, general CSP/storage-partition
rules and complete native scope parity remain unverified or outside this module.
