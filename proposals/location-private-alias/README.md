# Private Location identity after public prototype changes

This dependent followup fixes a genuine utility-world lookup failure. Native accepts an authored null prototype on the real main Location: the borrowed href getter and document identity still work, and a newly created utility world receives its own genuine Location prototype over the same document. The previous candidate throws `No pinned IDL interface for implementation` when it scans the main front's public prototype to identify that private backend.

The production change is one line in `isolated-world.js`: use `canonicalLocation(actualImpl)` to identify an already privately registered Location before the generic prototype scan. All other interfaces retain their existing path. The private backend and actual alias allocation are unchanged; public names and prototypes do not grant Location authority.

Apply `integration.patch` after the frozen `location-first-allocation` packet. Two leaves are included: the single source-line change and one regression test. Base and candidate hashes are in `leaves.json`; this is a leaf packet, with unchanged source/native/dependency bytes supplied by the first packet and pinned again in the runtime inventories.

Actual Native/candidate main and fresh utility snapshots match exactly for retained null prototype, same-document identity, real URL, utility prototype and document body. The regression passes on Node 24.22.1, 24.19.0 and 26.13.0. It checks that the canonical main object remains unchanged and that an authored ordinary lookalike remains ordinary. The exact old source fails the same test with the measured lookup error.

The final controller exited cleanly in 13.918 seconds. The proper 6,783-input graph and negative 166-input graph have separate unchanged before/after records. The earlier Native/candidate baseline is also retained with 6,780 unchanged inputs. No source fixture, runtime timeout, native implementation or dependency was changed. The first packet remains immutable.

This scope establishes private Location classification after public prototype mutation. It does not establish equivalent behavior for other generated interfaces, all public descriptor mutations, cross-origin access policy or reusable global proxies. Root composition and broader regression acceptance remain separate.
