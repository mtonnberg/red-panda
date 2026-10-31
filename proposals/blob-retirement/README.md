# Blob URLs in actual retained frames

`integration.patch` changes one production lookup and two test portions. It does
not edit Root production files directly. Apply after Root's current full run.

The original failing assertion at `test/blob-urls.test.js:115` expected frame
removal to revoke a child-created Blob URL. The independently executed native
browser retains the actual frame realm/document and keeps that URL readable by
its parent. It also permits the retained child to create and revoke new URLs.
The assertion is updated to that observation; retained snapshots remain intact.

A separate genuine defect appeared in the same native comparison: parent reads
worked, but the retained child's `fetch(blobURL)` rejected both old and new URLs.
`FramePage.fetch` correctly delegates its actual frame ID, while the root Blob
transport only looked in the current frame tree. The production change first
uses that live lookup, then checks the registry's actual owned `executionPages`
for the exact frame ID. Retired realms already remain in that registry. No frame
tree entry, new world, alias context or copied document is created.

The new test exercises real parent and retained-child fetches, creation and
revocation after removal, retained Response and Blob bytes, revocation when the
root actually closes, and survival of a separate page's own URL. Existing origin,
sandbox, cookie-context, explicit revoke, navigation and disposal tests remain.

## Evidence

The pinned native binary SHA256 is
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Both engines use raw CDP against the same real fixture, with actual child context
IDs and returned Response/Blob values. The baseline comparison matches17/19
observations; only the two retained-child fetches differ. The fixed comparison
matches19/19, normalizing only nondeterministic terminal UUIDs while retaining
actual origins. Raw observations, exact hash-checked drivers and comparison
artifacts are under `evidence/`.

The unchanged baseline suite reproduced12 passing and1 failing Blob URL test,
with `Missing expected exception` at the reported assertion. The candidate passed
22/22 combined Blob URL, Blob integration and retired-world checks on prepared
Node24.22.1 and Node26.13.0. Root's complete suite and PureScript checks are still
integration work; they are not claimed here. Source and patch hashes plus an
exact candidate source archive are retained in `manifest.json` and `evidence/`.

An additional attempted native cross-page root-close control was rejected with
`TargetAlreadyLoaded` when creating a second target in the same native CDP browser
context. Changing its initial URL to about:blank produced the same rejection.
The reference source's target creation check confirms one loaded target per that
context. Those partial observations and setup failures are retained explicitly;
they do not establish a native cross-page Blob lifetime outcome. Candidate
cross-page cleanup is covered by the new real-byte test. Broader page/context URL
sharing parity remains outside this bounded fix. Port9582 was not used.
