# Selector-only integration proposal

selector.patch was generated against the exact production browser/runtime bytes
listed in manifest.json at commit9d8250e. The manifest is immutable pre-application
evidence: it records that these proposed tests had not run at generation time.
Root subsequently applied the patch and reported 71 combined selector/runtime/CDP/
form/parser checks passing. Later frozen/full results are tracked separately.

The change names VM contexts before the first Window, keeps their actual context
keys in a host WeakMap, and replaces inspector marker execution with an exact
non-default name lookup. It does not enable Runtime.queryObjects, change a native
builder, or add heap enumeration to the default test glob.

The three proposed tests cover preserved native VM options/context identity,
actual inspector name notifications for pages/frames, and reversed selection plus
navigation/stale handles without Runtime.callFunctionOn/evaluate selector probes.
No heap enumeration is performed by these tests.

The algorithm was separately exercised in an ignored frozen copy on Node24.22.1
and26.13.0. Mapping controls passed6cycles/42 selections each. Snapshot-backed and
direct-profiler lifecycle probes then passed4cycles/28 selections/41 actual queries
each per runtime. Those isolated tests used the diagnostic private prefix; the
proposal changes only private prefix/tag constants/comments and omits diagnostic
metadata exports. Production heap enablement is a separate proposal.
