# Native-verified CDP cookie edge correction

Apply this two-leaf dependent patch after the original cookie-ingress delta in the frozen31-leaf phase23 composition. The original56376 patch, composed112 source, proposed9cc7 draft and first failed candidate evidence remain unchanged. No Root source or native build was edited.

The correction gives real shape errors code -31998 and semantic/sanitizer errors code -32602. A single command requires URL or domain before cookie sanitization. Network/Storage batches prevalidate schema, address presence and sanitizer failures across all members before successful mutation, while malformed-URL or insecure-None policy members are skipped individually. These paths operate on the real context CookieJar.

Orthogonal Native controls establish that policy-valid empty-name cookies are stored, finite negative expiry values act as session cookies, null expiry is session, and zero successfully deletes. The adapter implements those semantics using actual Cookie objects for empty names and normalizes negative expiry before the unchanged generic serializer. It does not alter CLI, raw-jar, Document, CookieStore or HTTP response policy.

All38 corrected comparisons pass: the original16 Native edge rows and22 orthogonal rows match actual results/error codes and actual cookie metadata after excluding only the preexisting candidate-only `priority:Medium` field. The raw records retain that difference. Three additional Native sanitizer-code controls establish -32602 for invalid name/value bytes. No helper output is used by production code.

Each completed runtime epoch has a fresh complete unchanged guard: orthogonal Native6,832 inputs/2.348s, sanitizer Native6,834/2.795s, corrected orthogonal candidate6,834/3.187s and corrected original candidate6,836/3.213s. The earlier Native/failed-candidate6830-input epochs are retained. All controllers exited zero and owned processes were closed before release.

The test file now contains six tests, including the positive empty-name/session/deletion cases and atomic failure checks. These regression tests and the larger composed functional suite remain UNRUN after the correction; Parent owns their quiet execution. Native/candidate authored controls ran on Node24.22.1 only. Full protocol field validation, all expiry magnitudes and complete cookie metadata parity are not claimed.

Negative zero is serialized as zero by JSON; no distinct wire sign is invented. Secure-None URL eligibility remains separate from storage. The HTTP helper is unchanged and already returns its normalized actual Cookie object, so jar storage does not reparse later unknown SameSite attributes. Additional allowed-header wire profiles remain unrun evidence bounds, not a demonstrated normalization defect.
