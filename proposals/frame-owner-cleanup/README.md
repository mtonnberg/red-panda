# Guard already-closed frame owners

The first owned frame-navigation cleanup correction fixed the genuine Browser path: popup installation makes ordinary public Window.close() a no-op, so replacement must invoke captured owner cleanup. The original Native control and genuine retained inactive DOM test remain in phase18-regression-recovery.

A subsequent full run exposed three standalone-registry regressions. Without popup installation, pinned jsdom had already executed the genuine old frame close before constructing the replacement. Repeating retainDocument then found a null Window.document and threw. root-before-three-failures.log preserves all three exact traces. No assertion or native fixture is changed here.

The correction captures the actual old Document backend before destroying registry authority and consults its real _defaultView after teardown. It invokes owner cleanup only while that Document remains active. Already-closed standalone Documents keep their existing cleanup; real Browser navigation still retires the old view and preserves the actual inactive DOM.

An isolated exact copy differs from the frozen Root in src/frames.js only; isolated-source-graph.json records every copied input and that one difference. The three original standalone cases and the real Browser retained-document case all pass unchanged on Node24.22.1,24.19.0 and26.13.0 (4/4 each). These are focused controls, not a completed full-run or all-browser claim. Root remained unchanged during the failing full validation; this patch was prepared independently for its next immutable epoch.
