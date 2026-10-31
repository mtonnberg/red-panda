// Protocol JSON values must be created by the selected realm's real intrinsic,
// even after authored code replaces the public JSON object or parse method.
const realms = new WeakMap();
const stringify = JSON.stringify;
export function captureProtocolRealm(window) {
  if (!realms.has(window)) realms.set(window, window.JSON.parse);
}
export function protocolValue(window, value) {
  if (value === undefined) return undefined;
  const parse = realms.get(window);
  if (!parse) throw new Error('The protocol realm was not registered before execution');
  return Reflect.apply(parse, undefined, [stringify(value)]);
}
