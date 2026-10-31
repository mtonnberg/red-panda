// Metadata for exact adapter-owned public prototypes. This does not participate
// in structured-clone brands, heap factories, or candidate property inspection.
const prototypes = new WeakMap();
export function registerProtocolPrototype(value, className) {
  if (value === null || !['object', 'function'].includes(typeof value) || typeof className !== 'string' || !className) throw new TypeError('Invalid protocol prototype metadata');
  const previous = prototypes.get(value);
  if (previous !== undefined && previous !== className) throw new TypeError('Protocol prototype metadata conflict');
  prototypes.set(value, className);
}
export function protocolPrototypeClass(value) { return prototypes.get(value); }
