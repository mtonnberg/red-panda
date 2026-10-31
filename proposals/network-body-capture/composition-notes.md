Preserve all later Root changes; this is a five-leaf929 patch, not a full-file replacement request.

Browser.fetch: keep genuine current navigationResponseReader/signal/finishNavigationReader handling. Insert Document byte append immediately after accepted chunks.push(value). Finish capture from the same actual Buffer.concat prefix; do not capture unaccepted cancellation bytes or restore the old navigation UTF8 responseBodies write. Current cookie/header Unicode changes stay intact.

CDP: preserve current generic routing/error and cookie handlers. Add capture enable/disable before successful domain registration, body/post handlers on the existing attached-session path and inline real request metadata fields. Cookie context tracking is independent of this private WeakMap. Session limits use actual page.context, never authored IDs or current URL authority. Root-connection body routing remains unmeasured.

SyncHTTP/classic stylesheet: retain genuine cancellation and successful-byte producer ownership. Capture the actual returned bytes before existing requestFinished emission. No transport response reconstruction or fabricated events.

Existing browser plaintext test migrates its private string-cache assertion to the shared inspector result while preserving original DOM/contentType/inert-script assertions. The new independent public CDP plaintext case verifies the wire endpoint and actual raw body. Existing32 regression tests and fixture are unchanged dependencies, not production patch leaves.
