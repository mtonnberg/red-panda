import {getDomain} from 'tldts';
import {navigatorProfile} from './navigator.js';

// Only captured browser API producers can attach context. Authored init fields
// and mutable Window.origin/location metadata do not authenticate a principal.
const contexts = new WeakMap();
export function withRequestMetadata(init, {origin, mode = 'cors', destination = 'empty'}) {
  contexts.set(init, {origin, mode, destination});
  return init;
}
export function forwardRequestMetadata(source, destination) {
  const context = contexts.get(source);
  if (context) contexts.set(destination, context);
  return destination;
}
function relation(origin, target) {
  if (!origin || origin === 'null') return 'cross-site';
  const source = new URL(origin);
  if (source.origin === target.origin) return 'same-origin';
  const site = url => getDomain(url.hostname, {allowPrivateDomains: true}) ?? url.hostname;
  return source.protocol === target.protocol && site(source) === site(target) ? 'same-site' : 'cross-site';
}
const rank = {'same-origin': 0, 'same-site': 1, 'cross-site': 2};
const quote = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';

export function requestMetadataPolicy(init) {
  const context = contexts.get(init);
  let site = 'same-origin';
  return (headers, input) => {
    const target = new URL(input);
    if (!['http:', 'https:'].includes(target.protocol)) return;
    // Identity describes this actual independent engine. Privileged CDP/CLI
    // headers are layered after these defaults on each actual transport hop.
    headers.set('sec-ch-ua', quote(navigatorProfile.brand) + ';v=' + quote(navigatorProfile.version.split('.')[0]));
    headers.set('sec-ch-ua-full-version-list', quote(navigatorProfile.brand) + ';v=' + quote(navigatorProfile.version));
    if (!context) return;
    const current = relation(context.origin, target);
    if (rank[current] > rank[site]) site = current;
    headers.set('sec-fetch-site', site);
    headers.set('sec-fetch-mode', context.mode);
    headers.set('sec-fetch-dest', context.destination);
  };
}
