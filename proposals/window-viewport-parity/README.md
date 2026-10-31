# Window viewport and scroll handoff

The sealed implementation passes all five requested unchanged fixtures:
`window/visual_viewport.html`, `window/screen.html`, `window/scroll.html`,
`window/scroll_dedup.html`, and `window_scroll.html`. Pinned Native passes 5/5;
the original Root + frozen Event prerequisite passes 0/5. Final quiet paired
Native/candidate runs each pass 5/5 under the original 2000ms load + 2000ms
assertion contracts, actual upstream harness branch and source registrations.
No fixture/assertion/deadline edits or canonical ports were used.

`integration.patch` is based on the frozen Event parity standalone prerequisite
SHA256 `8f9648d31db11593e703f1345701f4bc253006ba247dbee5c51d47bafe44d9f6`.
It applies cleanly after that prerequisite on a reconstructed current Root tree;
every applied leaf matches `source-manifest.json`. Root production is untouched.
The alternative `integration-after-namespace-event.patch` is a deterministic
static composition after the frozen namespace + Event-after-namespace packages.
Its base/target hashes are explicit; runtime results below refer to the sealed
standalone-prerequisite epoch. Apply one alternative, not both.

The change adds genuine VM VisualViewport/Screen/ScreenOrientation fronts over
the actual canonical EventTarget implementation, exact private brands and
readonly descriptors, actual viewport/DPR/screen override state, synchronous
visual page offsets, and real trusted asynchronous scroll/scrollend dispatch.
Element state stays in its genuine implementation. Conversions, relative
arithmetic, computed extent clamping, duplicate suppression and callback
reentrancy follow the measured algorithms. Timer ownership is bound to the real
Document and canceled on retirement. Frame metric object sharing and utility
front ownership match actual Native controls. There is no raster result,
coordinate/event vector replay, fabricated user action, key/prototype/heap or
protocol mask, dependency addition, CXX change or Native engine import.

The canonical Target layer uses private backing and successful factory
provenance. It preserves same-object setup, actual backend identity, legitimate
Window setup readers and trusted VM-global alias capture. Direct Target values
therefore lose the old reflected implementation-symbol gap, including SSE;
its production surface test is strengthened to direct Native equality.
**Broad direct-Target compatibility followup is required before Root integration**
for existing SharedWorker/Port/WebSocket fronts and captured readers. Parent
explicitly authorized that separate followup. Frozen Shared raw artifacts are
not edited. The sealed all-private epoch remains the preferred implementation;
an unvalidated opt-in experiment remains only in the evidence archive and is
not used merely to retain incorrect old gap assertions.

Validation:

- Fifteen new tests pass 15/15 on Node 24.19.0, 24.22.1 and 26.13.0. They include
  nine exact Native value/scroll groups, device override and actual navigation,
  private brands/forged symbols/proxies/Symbol.hasInstance, genuine setup receiver,
  retirement, and captured intrinsics. The groups contain 139 list rows plus the
  full scroll-event record and actual CDP controls.
- Ninety-nine direct public-V8 creation-context rows pass all three SDKs, before
  and after null prototypes. Frame values correctly have the main VM origin;
  constructors/accessors and utility fronts have their actual selected origins.
  No heap enumeration is used.
- Forty-five bounded existing layout/flow/custom-element/private-utility tests
  pass in the initial 60-test run. Its sole failure was a new test counter that
  also counted two unrelated Blob factory calls while Host constructor hooks
  were installed. Preparing the real Blob before those hooks fixes the test
  boundary without Runtime changes; all fifteen then pass. Both logs remain.
- One existing SSE constructor surface control passes exact Native equality
  after removing only its prior implementation-symbol normalization.
- The final exact Runtime/test epoch manifest is
  `cc9775cd3f74dfa76f8cf8d1101602bfda5bf2b989de4bc9d6ec945e0237a22d`.
  Final candidate fixture loads are 207, 223, 332, 298 and 401ms.

Raw failures are preserved separately. The first post-change Source run had
four passes and one real load timeout (~2956ms, no exceptions); an unchanged
isolated retry passed at 522ms load + 6ms assert. These are not promoted into a
passing aggregate; the later quiet paired Source5 epoch is separate. An early
Host JSDOM parsingContext failure was fixed using its actual Host origin, then
its eleven layout checks passed. One old probe template lacked the Native
DOCTYPE; the corrected candidate template matches Native instead of changing
layout by a captured offset. Two attempted Native multi-target/context controls
fail at Native setup and remain raw, rather than being treated as supported
features. Native screenOrientation/mobile/scale extras are genuinely ignored;
zero/omitted viewport fields and physical overrides retain their observed state.

This is a bounded value/state slice. General faux-layout/text-renderer boundaries
remain, including the existing Page.getLayoutMetrics content-size difference
(Native text-renderer height versus current document extent). Additional borrowed
cross-window event scheduling and unsupported APIs are not claimed. Window/Node
physical-symbol migration remains separate from direct Target backing.

Exact input/source hashes, raw Native observations, commands, SDK logs, sealed
failed/successful epochs and both branch snapshots are archived. Earlier audio,
Event parity and namespace packages remain unchanged. No processes/ports remain.
