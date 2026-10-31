# Additional 48-case coverage recovery

This is a selected diagnostic cohort of previously unattempted registered default
fixtures, not the complete registration or WPT matrix. Original and recovered
reports remain separate. `selection.json` binds the source/profile inventory;
`recovery/source-freeze.json` binds the actual fresh candidate graph above HEAD,
including uncommitted custom-element, header and heap integration. The frozen
candidate lives at `/workspace/shared/coverage-recovery-20261031`.

The official Native binary SHA-256 remains
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Original native static46 produced44 passes and2 unobserved setup outcomes:
mediaerror/vttcue request `/src/browser/tests//testing.js`, which the original
owned server incorrectly resolved outside its root and rejected403. A copied
helper now strips repeated leading slashes from the fixture-relative suffix,
then still resolves and checks root containment and realpath containment. Its
real HTTP controls verify identical harness hashes for normal/double/triple
slashes and rejection of encoded traversal/backslashes. The two affected Native
fixtures then pass. Original failures are retained and remain setup mismatches.

Native canonical2 passed both before and after recovery. These48 per-case Native
positive controls span the preserved44 plus corrected2 plus canonical2; they are
not presented as one newly executed48-case run. Fresh candidate static46 produced
**9 passed,36 failed,1 unobserved**; canonical2 produced**2 failures**. The final
selected candidate total is**9 passed,38 failed,1 unobserved**. None had unavailable
fixture routes after the correction. `recovery/comparison.json` maps every case
to its actual report, status and fixture hash.

Candidate parser_reparented_element closed the CDP connection and its owned child
reported exit1; the original helper discarded child stderr, so cause requires the
separate diagnostic replay. Dynamic-markup insertion recorded zero observations
and stays unobserved. Missing constructors, actual assertion failures, quota
errors, process failure and absent observations are not interchangeable passes.

The unchanged upstream assertion harness SHA-256 is
`23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b`.
All runs use actual iframe/worker flags, the required native/external-runner
branch, document-complete plus100ms settling and15s diagnostic budget. The source
default is2s; this evidence makes no speed-equivalence claim. Canonical media and
IndexedDB controls owned9582 briefly and released it; other fixtures used port0.

Four initial recovery commands exited before launching browsers because an
unchanged support import was omitted from the copy. `support-missing-*` files
preserve these startup errors. Copying the exact `test/cdp-client.js` corrected
that setup issue; all later commands and exit statuses are in `run-status.json`.
No production code or upstream fixture assertions were changed by this cohort.
