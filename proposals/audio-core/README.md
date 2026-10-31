# Independent audio buffer and offline rendering

Use `root-allocation-integration.patch` for the current composition. The earlier
`integration-current.patch` is a historical functional draft and must not be
applied as well. The shared known-kind classification export was integrated
separately; it classifies ordinary prototype lookalikes without granting brands.

The implementation owns actual Float32 channel storage, channel copies and
buffer-source rendering. Offline contexts perform genuine scheduling, offsets,
resampling, looping, reverse/zero playback, rate/detune automation, channel mixing
and summing. Completion uses real trusted events and actual nonzero rendered
samples. Context time follows the measured 128-frame rendering quantum. No
silent output substitutes for work that the Native renderer performs.

The initial isolated functional graph passed 16 checks on all three prepared
Node runtimes and 111 combined checks on Node24. The unchanged audio-buffer
fixture passed Native and each candidate runtime. Root adaptation stages and
raw Native observations remain separate in this directory.

Review then found that selected-VM slot objects and a construction token were
discoverable through genuine heap queries. `slots-before.json` and
`slots-native.json` preserve that actual mismatch. The delegated worker stopped
before applying its allocation refactor. Root continued in
`/workspace/shared/audio-core-final-root`: persistent buffer/context/node/param
and automation records now use Host null-prototype allocations, and the token is
a Host Symbol. Public buffers and Float32Arrays keep their actual allocating
realm. Authored lookalike records remain present in heap results.

Root's final allocation composition passed 17 focused checks on Node24.22.1 and
Node26.13.0, including actual heap identities and preservation of immutable
public metadata. The latest Root audio/HTMLDDA/collection combination passed31
checks. Exact source and patch hashes are in `root-allocation-manifest.json`.
These stages do not establish a complete fresh full-suite pass by themselves.

AudioContext, wider processing nodes, suspension, complete DSP fidelity and
exhaustive coercion/realm behavior remain incomplete. Existing rendering has a
sample allocation cap; it is not a Native performance/resource-equivalence
claim. Broader visibility of implementation helper functions through heap queries
is also outside this bounded change.
