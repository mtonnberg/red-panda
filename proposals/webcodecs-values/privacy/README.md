# Private WebCodecs slots and heap integration

Apply `privacy.patch` after the value-types integration. The two-file patch moves
color/chunk state to frozen null-prototype Host records, publishes those exact
records as private implementation provenance and replaces full-slot VM helper
returns with primitive field/brand-only reads. Actual receiving constructors,
immutable bytes, copyTo, transfers, metadata and public object identities remain
genuine. Authored slot-shaped objects remain visible to real heap queries.

The actual frozen baseline reproduces both failures: Object.prototype queries
return a private chunk slot alongside an identically shaped authored object, and
heap-discovered stateFor returns full private bytes/metadata. The new tests retain
the authored object/function and require actual heap results, so hiding all
matches or returning an empty Array cannot pass. The final implementation never
returns a private slot through heap-discovered getters. A helper for the other
chunk interface may reject with its genuine Illegal invocation error.

`baseline-leak.txt` preserves both reproduced failures. An initial post-fix
helper test wrongly assumed every discovered helper belonged to VideoChunk;
`private-slots-node24.txt` retains that test error. Correcting the assertion to
allow a genuine other-interface brand rejection keeps the original full-slot
leak assertion intact. Final20 Node24 checks pass across values, private heap
controls and existing heap-world regressions. Additional exact-runtime checks
and statuses are retained separately.

The preceding frozen production files were not edited. Only the newly written
regression test was temporarily added to the old snapshot to execute the negative
control, then removed after completion. `baseline-source.json` and the integration
manifest identify old/new source. No Root production files were edited.

This closes the observed slot/byte exposure. It does not establish equal Native
heap counts or eliminate every independent implementation helper Function from
heap observations. No function-name filter, authored-object removal or invented
Native object is used. Complete heap/realm/security isolation remains unfinished.
