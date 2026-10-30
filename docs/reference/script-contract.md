# Saved-script observations and independent implementation

The reference is the verified Lightpanda executable at
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, version
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The `script-*-observations.json` files record read-only black-box executions of
scripts written for these probes. They use data URLs and an owned local HTTP
fixture. No provider or LLM requests were made. Public demo scripts were consulted
for positional method usage; upstream production implementation was not copied.

Observed grammar and contracts:

- A saved script is JavaScript executed as an asynchronous function body. It can
  use top-level `await` and `return`. A bare trailing expression prints nothing.
- `return undefined` prints nothing, strings print directly, and other results
  print JSON followed by a newline. `console.log` output precedes the final value.
- `Page` and `console` are globals. `process`, `args`, `fetch`, `setTimeout`, `URL`,
  and `lp` are absent from the native outer script context.
- `new Page()` creates a page. `goto` is asynchronous. Evaluation, extraction,
  actions, waits, download and close are synchronous. Separate pages share cookies
  while retaining separate documents. A closed Page can navigate again.
- The native Page owns `goto`, `screenshot`, `evaluate`, `extract`, `click`, `fill`,
  `scroll`, `waitForSelector`, `waitForScript`, `waitForState`, `hover`, `press`,
  `selectOption`, `setChecked`, `download`, and `close`. MCP reading tools such as
  `html`, `markdown` and `getUrl` are not Page methods.
- `evaluate` returns text, including JSON text for objects, numbers and booleans;
  it supports a return statement or a promise. `extract` returns actual objects.
  Evaluation runs in the page context and cannot access outer script variables.
- Both positional and object arguments are supported by native navigation,
  evaluation, actions and waits. Wait options are objects, not a numeric timeout.
  `waitForSelector` returns a message containing a usable node identifier.
- Literal `$LP_...` values are not interpolated by saved scripts.

`src/script.js` exports `runScript({path,args=[],browserOptions={},cwd,env,input,
source,timeout=30000})`. A path is resolved relative to `cwd`; `-` reads the
provided input stream. `source` is an optional direct-source API for embedding.
Nonempty positional args are rejected because native `run` exposes none. `env`
does not expose environment globals or expand script literals. The result is
`{value,output}`; the module does not write stdout. `ScriptError` includes `phase`
(`load`, `parse`, `runtime`, or `timeout`), `code`, and already captured `output`.

The script executes in a worker and calls the browser host over a message bridge.
Synchronous waits block only the worker, allowing browser network requests and
timers to progress. Importing the module does not bind stdin. Script contexts,
pages and workers are released on success, failure or deadline. Script and page
content must be trusted: Node vm and the host bridges are not a security sandbox.

Current bounds:

- `screenshot` and `scroll` throw explicit unsupported errors. No visual rendering
  or synthetic successful effect is supplied.
- The browser and MCP implementations still bound supported DOM, network, input,
  extraction and navigation behavior. Agent prompting, REPL and LLM execution are
  outside this runner. Full script or browser parity is not established.
- V8 rather than the native JavaScript engine executes the outer script. Exact
  engine behavior, stack/error formatting, all native argument variations,
  download result text, and internal frame/node numbering remain unverified.
- The host deadline terminates busy outer scripts and unresolved promises, but
  browser JavaScript can temporarily occupy the host event loop up to the page's
  evaluation limit. This is not a resource-isolation guarantee.

`script-differential.json` records exact stdout agreement for 25 successful native
probe scripts. This is a bounded observation set, not a compatibility percentage
for the full runtime. `node --test test/script.test.js` exercises additional actual
local HTTP, dynamic waiting, cookies, input effects, download, errors and cleanup.
