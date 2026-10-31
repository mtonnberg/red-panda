# Source load-first partial epoch

Stopped after **168 of 455** selections without changing its
frozen helper. All recorded outcomes and controls remain in place. The helper
implements source load completion (its own2,000ms) followed by a fresh
2,000/8,000ms assertion budget and no settling delay. Its eight final load-first
controls pass, including earlier set_body and dynamic-script failures.

The static server still rejected POST with405, contrary to pinned
TestHTTPServer.sendFile. The old epoch exposed this on frames/target; rather
than run a knowingly setup-mismatched full baseline, the complete selection
was restarted after an isolated correction and actual POST/Native controls.
See ../native455-canonical/. Nothing here was silently replaced.
