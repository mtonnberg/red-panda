# Narrow animation scheduler ownership: static candidate

UNRUN and separate from rejected R3. Five paths change: three runtime files and two event-only authority/watchdog test files. Actual private Window queue capture and trusted initialization order are retained. Original Animation runtime.emit/automaticTask/finish/play source block is byte-for-byte unchanged. No native checkpoint or direct-dispatch change is added. Native10ms and existing0-delay event semantics remain unchanged.

The narrower goal is the proven internal-raw versus authored-owned overdue-queue inversion. The candidate has no claim to complete Native producer/lifetime ordering. All seven measured Native rows will be retained diagnostically, including actual mismatches. Default-queue Promise interruption remains an explicit foundational limitation; no infinite-Promise recovery test is promoted or claimed here. No original production tests, expressions, oracles or delays are removed/changed.

Planned gate: originalAnimation12 + Windowtimers12 + O(1) allocation2 + timer-poison/event-watchdog2 =28 cases, plus six controlled state projections and complete event-order diagnostics. Poison replacements restore their exact original descriptors after all real animation assertions and before unrelated document teardown. The separate non-suppressing cleanup diagnostic must establish the late-error cause. Event callback200ms VM policy,7s child guard and later genuine automatic producer/query/close remain protected.

Root is unchanged. All607 candidate inputs, originalRoot605 inputs, native artifacts and dependency hashes are guarded. Actual semantic/test validation remains unrun. Static apply/reverse is exact. No rendering, effect/timeline or universal timing parity is claimed.
