# Main-checkout Promise attribution composition

The exact three-leaf R2 patch was applied over 92a6c389 after the isolated 21 checks passed on each of three SDKs and the separate 100 existing regressions passed. No other runtime source changed.

This fresh main-checkout execution passed 49 of 49 cases: 11 new attribution checks, 10 existing errors checks and 28 animation/Window lifecycle checks. Node exited 0 in 27.240 seconds; all 8,536 inputs stayed unchanged and all eleven attribution child PIDs were absent. Original execution deadlines were retained.

The controller incorrectly expected a TAP summary prefix; Node produced its spec reporter. Its original rejected status and controller are preserved, alongside the raw 49/49 spec summary and a separately hashed accounting supplement. No tests were rerun or source changed to correct that accounting. Existing MaxListeners warnings remain in raw stdout.

This is a focused composition check, not a new complete-suite claim. Native late-handler routing, external/legacy async-hook interruption and full reusable-global lifetimes remain unfinished.
