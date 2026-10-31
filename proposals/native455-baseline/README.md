# Initial Native baseline epoch: load contract mismatch

This epoch was stopped cleanly after **321 of 455** selections. Its raw reports
and matrix remain unchanged. The recorded 306 passes and 15 failures are
early-driver observations, **not canonical Native acceptance**. The driver
called `assertOk` before establishing the source-required load barrier; even
apparent passes may precede later inline script parsing.

Upstream `src/testing.zig:454` first waits up to 2,000 ms for `.load`;
`Runner.zig:303` defines this as frame load-state complete. Only then does
`testing.zig:456` start the fresh registration assertion budget (2,000 or
8,000 ms). The initial driver instead used one shared navigation/assertion
budget and immediate polling.

`epoch-status.json` preserves the reason and raw matrix hash. Source and
helper hashes remained unchanged throughout this interrupted epoch. A separate
load-first helper and new full selection run live in
`../native455-load-first/`; no report here was silently replaced.
