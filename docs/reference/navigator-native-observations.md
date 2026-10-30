# Navigator metadata observations

Observed against the verified Linux x86-64 reference binary with SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Queries used CDP Runtime evaluation in a Window and a real dedicated worker;
the reference was started with `--load-resources worker` for the worker probe.
Only public behavior and test fixtures were consulted.

| API | Observed behavior |
| --- | --- |
| `navigator.permissions` | SameObject `Permissions`; only `query` is exposed. |
| `permissions.query({name})` | Returns a Promise and a fresh `PermissionStatus` on every call. The status extends EventTarget; `name` and `state` are enumerable prototype getters; no enumerable own properties. |
| Permission names | Every supplied name tested, including unknown names, numeric `42`, and `null`, is string-coerced and returns state `prompt`. Additional descriptor members do not grant access. Missing/undefined name rejects a Promise with TypeError. |
| `PermissionStatus.onchange` | Initially null; assignment and normal EventTarget listeners both work with a manually dispatched `change` event. |
| `navigator.storage` | SameObject `StorageManager`; only `estimate` is exposed. `persist` and `persisted` are absent. |
| `storage.estimate()` | Returns a Promise for `StorageEstimate`, whose usage/quota are enumerable prototype getters. Empty-origin values are usage 0 and quota 1,073,741,824 bytes. `Object.keys(estimate)` is empty. |
| `navigator.userAgentData` | SameObject `NavigatorUAData`; `brands`, `mobile`, and `platform` are prototype getters. Each brands read returns a new mutable array and brand records. |
| `getHighEntropyValues(hints)` | An array or Set is accepted; missing/null/scalar/noniterable hints reject. Empty and unknown-only hint lists still return the complete metadata object. |
| High-entropy keys | `brands`, `mobile`, `platform`, `architecture`, `bitness`, `model`, `platformVersion`, `uaFullVersion`, `fullVersionList`, `wow64`, and singular `formFactor`. Linux x86-64 reports x86/64, empty model/platformVersion, false wow64, and `["Desktop"]`. |
| Interface constructors | `Permissions`, `PermissionStatus`, `StorageManager`, `StorageEstimate`, and `NavigatorUAData` are exposed but direct construction throws TypeError. |
| Worker surface | WorkerNavigator is exposed and Navigator is absent. Permissions, storage, UAData, vendor, and globalPrivacyControl exist. Plugins, cookieEnabled, webdriver, doNotTrack, maxTouchPoints, sendBeacon, registerProtocolHandler, and modelContext are absent. |

Red Panda implements these metadata contracts independently. Its brand/version
identify the actual Red Panda package, and configurable UA/platform/language and
UA metadata providers remain live. Coarse CPU/memory metadata is bounded by host
capacity. The default storage estimate describes an empty managed-storage origin
and its virtual budget; an optional provider supplies actual backend usage.
This API does not implement permission granting, persistence, device access,
protocol registration, or beacon delivery. Existing jsdom Window members remain
available. JavaScript accessors are not disguised as native functions.
