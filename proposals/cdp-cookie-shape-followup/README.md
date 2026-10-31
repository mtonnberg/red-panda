# Verified URL and cookie-member shape followup

Apply integration.patch after immutable eda5b0d9. Exactly two adapter lines change: the decoder rejects actual array members, and both named/nameless branches consume one actual parsed URL. One additional regression brings cookie-ingress.test.js to seven tests. No generic CDP envelope, HTTP, metadata serializer, CLI, Document, CookieStore or raw-jar policy is changed.

Actual Native accepts all six empty/null/omitted URL × normal/empty name combinations when a valid domain and Secure None policy are supplied. It rejects array cookie members as UnexpectedToken/-31998 before any earlier valid member is stored. The old candidate's two genuine mismatches are retained in baseline evidence. The corrected candidate matches all seven adapter rows and actual cookie fields after excluding only the known preexisting priority metadata field; all raw fields remain available.

The eighth input is a separately retained preexisting envelope boundary: Network.setCookie with params itself an array closed Native's CDP connection, while Root's generic validation returns Invalid CDP request/-32600. This followup does not simulate the connection failure or claim that row matches. The evidence does not classify whether Native lost only the connection or its process.

Corrected candidate controls completed in 3.105 seconds with all 6,831 inputs unchanged. All seven Cookie tests passed on Node24.22.1,24.19.0 and26.13.0, in 11.620 seconds total, with all 6,832 inputs unchanged. Both controllers exited zero and owned processes were closed before lease release. Existing eda5,31-leaf and190-test variants remain unchanged. Earlier static-manifest status is retained as historical preparation; manifest.json is the final receipt.
