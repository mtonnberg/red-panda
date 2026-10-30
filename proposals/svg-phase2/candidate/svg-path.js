// Independent SVG path mathematics. Geometry comes from actual commands/attrs.
// Beziers use publicly calibrated adaptive subdivision; ellipse arcs use
// 256 straight edges per turn. No target engine implementation is imported.
const TAU = Math.PI * 2;
const point = (x, y) => ({ x, y });
const lerp = (a, b, t) => a + (b - a) * t;
const boundsOf = values => {
  if (!values.length) return null;
  const xs = values.map(p => p.x), ys = values.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};
function quadraticAt(a, b, c, t) { const u = 1 - t; return point(u*u*a.x + 2*u*t*b.x + t*t*c.x, u*u*a.y + 2*u*t*b.y + t*t*c.y); }
function cubicAt(a, b, c, d, t) { const u = 1 - t; return point(u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x, u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y); }
function roots(a, b, c) {
  if (Math.abs(a) < 1e-14) return Math.abs(b) < 1e-14 ? [] : [-c / b];
  const discriminant = b*b - 4*a*c;
  return discriminant < 0 ? [] : [(-b + Math.sqrt(discriminant)) / (2*a), (-b - Math.sqrt(discriminant)) / (2*a)];
}
function flattenBezier(controls) {
  const points = [controls[0]], midpoint = (a,b) => point((a.x+b.x)/2,(a.y+b.y)/2);
  function distance(p,a,b) { const x=b.x-a.x,y=b.y-a.y,squared=x*x+y*y,t=squared?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/squared)):0;return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y); }
  function subdivide(values,depth) {
    if(depth===10||Math.max(...values.slice(1,-1).map(p=>distance(p,values[0],values.at(-1))))<=.001){points.push(values.at(-1));return;}
    const levels=[values];while(levels.at(-1).length>1){const row=levels.at(-1);levels.push(row.slice(1).map((p,i)=>midpoint(row[i],p)));}
    subdivide(levels.map(row=>row[0]),depth+1);subdivide(levels.map(row=>row.at(-1)).reverse(),depth+1);
  }
  subdivide(controls,0);return points;
}
export function pathBuilder() {
  const segments = [];
  function add(points, extrema = points) { if (points.length > 1) segments.push({ points, bounds: boundsOf(extrema) }); }
  function line(a, b) { add([a, b]); }
  function quadratic(a, b, c) {
    const values = [a, c];
    for (const key of ['x', 'y']) { const divisor = a[key] - 2*b[key] + c[key]; const t = divisor ? (a[key] - b[key]) / divisor : 0; if (t > 0 && t < 1) values.push(quadraticAt(a, b, c, t)); }
    add(flattenBezier([a,b,c]), values);
  }
  function cubic(a, b, c, d) {
    const values = [a, d];
    for (const key of ['x', 'y']) for (const t of roots(-a[key]+3*b[key]-3*c[key]+d[key], 2*(a[key]-2*b[key]+c[key]), b[key]-a[key])) if (t > 0 && t < 1) values.push(cubicAt(a, b, c, d, t));
    add(flattenBezier([a,b,c,d]), values);
  }
  function centeredArc(cx, cy, rx, ry, rotation, start, delta, first, last) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation), at = angle => point(cx + rx*cos*Math.cos(angle) - ry*sin*Math.sin(angle), cy + rx*sin*Math.cos(angle) + ry*cos*Math.sin(angle));
    const count = Math.max(1, Math.ceil(Math.abs(delta) / TAU * 256)), points = Array.from({ length: count + 1 }, (_, i) => at(start + delta*i/count));
    if (first) points[0] = first; if (last) points[count] = last;
    const extrema = [points[0], points[count]], within = angle => { const distance = delta >= 0 ? ((angle-start)%TAU+TAU)%TAU : ((start-angle)%TAU+TAU)%TAU; return distance <= Math.abs(delta) + 1e-12; };
    for (const base of [Math.atan2(-ry*sin, rx*cos), Math.atan2(ry*cos, rx*sin)]) for (const angle of [base, base + Math.PI]) if (within(angle)) extrema.push(at(angle));
    add(points, extrema);
  }
  function arc(a, rx, ry, degrees, large, sweep, b) {
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (a.x === b.x && a.y === b.y) return;
    if (!rx || !ry) { line(a, b); return; }
    const rotation = degrees * Math.PI / 180, cos = Math.cos(rotation), sin = Math.sin(rotation), dx = (a.x-b.x)/2, dy = (a.y-b.y)/2;
    const x = cos*dx + sin*dy, y = -sin*dx + cos*dy, radius = x*x/(rx*rx) + y*y/(ry*ry);
    if (radius > 1) { const scale = Math.sqrt(radius); rx *= scale; ry *= scale; }
    const denominator = rx*rx*y*y + ry*ry*x*x, coefficient = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx*rx*ry*ry-denominator)/denominator));
    const centerX = coefficient*rx*y/ry, centerY = -coefficient*ry*x/rx, cx = cos*centerX-sin*centerY+(a.x+b.x)/2, cy = sin*centerX+cos*centerY+(a.y+b.y)/2;
    const ux = (x-centerX)/rx, uy = (y-centerY)/ry, vx = (-x-centerX)/rx, vy = (-y-centerY)/ry;
    const start = Math.atan2(uy, ux); let delta = Math.atan2(ux*vy-uy*vx, ux*vx+uy*vy);
    if (!sweep && delta > 0) delta -= TAU; if (sweep && delta < 0) delta += TAU;
    centeredArc(cx, cy, rx, ry, rotation, start, delta, a, b);
  }
  return { segments, line, quadratic, cubic, arc, centeredArc };
}
export function parsePath(source = '') {
  const builder = pathBuilder(); let cursor = 0, command = '', current = point(0, 0), first = current, previous = '', cubicControl = null, quadraticControl = null;
  const skip = () => { while (cursor < source.length && /[\t\n\r ,]/.test(source[cursor])) cursor++; };
  function number(flag = false) { skip(); const text = source.slice(cursor), match = flag ? /^[01]/.exec(text) : /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(text); if (!match) return null; const value = Number(match[0]); if (!Number.isFinite(value)) return null; cursor += match[0].length; return value; }
  const counts = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  while (cursor < source.length) {
    skip(); if (cursor >= source.length) break;
    if (/[a-zA-Z]/.test(source[cursor])) command = source[cursor++];
    const type = command.toUpperCase(), relative = command !== type;
    if (type === 'Z') { builder.line(current, first); current = first; previous = 'Z'; command = ''; cubicControl = quadraticControl = null; continue; }
    if (!counts[type] || (!builder.segments.length && previous === '' && type !== 'M')) break;
    const args = []; for (let i = 0; i < counts[type]; i++) { const value = number(type === 'A' && (i === 3 || i === 4)); if (value === null) break; args.push(value); }
    if (args.length !== counts[type]) break;
    const p = (x, y) => point(x + (relative ? current.x : 0), y + (relative ? current.y : 0));
    let end;
    if (type === 'M') { current = p(args[0], args[1]); first = current; command = relative ? 'l' : 'L'; }
    else if (type === 'L') { end = p(args[0], args[1]); builder.line(current, end); }
    else if (type === 'H') { end = point(args[0] + (relative ? current.x : 0), current.y); builder.line(current, end); }
    else if (type === 'V') { end = point(current.x, args[0] + (relative ? current.y : 0)); builder.line(current, end); }
    else if (type === 'C') { const a = p(args[0], args[1]), b = p(args[2], args[3]); end = p(args[4], args[5]); builder.cubic(current, a, b, end); cubicControl = b; }
    else if (type === 'S') { const a = ['C', 'S'].includes(previous) ? point(2*current.x-cubicControl.x, 2*current.y-cubicControl.y) : current, b = p(args[0], args[1]); end = p(args[2], args[3]); builder.cubic(current, a, b, end); cubicControl = b; }
    else if (type === 'Q') { const a = p(args[0], args[1]); end = p(args[2], args[3]); builder.quadratic(current, a, end); quadraticControl = a; }
    else if (type === 'T') { const a = ['Q', 'T'].includes(previous) ? point(2*current.x-quadraticControl.x, 2*current.y-quadraticControl.y) : current; end = p(args[0], args[1]); builder.quadratic(current, a, end); quadraticControl = a; }
    else if (type === 'A') { end = p(args[5], args[6]); builder.arc(current, args[0], args[1], args[2], !!args[3], !!args[4], end); }
    if (end) current = end; previous = type;
    if (!['C', 'S'].includes(type)) cubicControl = null; if (!['Q', 'T'].includes(type)) quadraticControl = null;
  }
  return builder.segments;
}
export function parsePoints(source) {
  const values = []; let cursor = 0;
  while (cursor < source.length) { const separator = /^[\t\n\r ,]*/.exec(source.slice(cursor))[0]; cursor += separator.length; if (cursor === source.length) break; const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(source.slice(cursor)); if (!match || !Number.isFinite(Number(match[0]))) return []; values.push(Number(match[0])); cursor += match[0].length; }
  return Array.from({ length: Math.floor(values.length / 2) }, (_, i) => point(values[2*i], values[2*i+1]));
}
export function geometryFor(tag, get) {
  const b = pathBuilder(), n = name => get(name), p = (x, y) => point(x, y);
  if (tag === 'path') return parsePath(n('d') ?? '');
  if (tag === 'line') b.line(p(n('x1'), n('y1')), p(n('x2'), n('y2')));
  else if (tag === 'polygon' || tag === 'polyline') { const points = parsePoints(n('points') ?? ''); for (let i = 1; i < points.length; i++) b.line(points[i-1], points[i]); if (tag === 'polygon' && points.length > 1) b.line(points.at(-1), points[0]); }
  else if (tag === 'circle' || tag === 'ellipse') { const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? rx : n('ry'); if (rx > 0 && ry > 0) b.centeredArc(cx, cy, rx, ry, 0, 0, TAU, p(cx+rx, cy), p(cx+rx, cy)); }
  else if (tag === 'rect' || tag === 'foreignObject') {
    const x = n('x'), y = n('y'), w = n('width'), h = n('height'); if (!(w > 0 && h > 0)) return [];
    let rx = n('rx'), ry = n('ry'); if (rx === null) rx = ry ?? 0; if (ry === null) ry = rx ?? 0; rx = Math.min(w/2, Math.max(0, rx)); ry = Math.min(h/2, Math.max(0, ry));
    if (!rx || !ry) { const points = [p(x,y), p(x+w,y), p(x+w,y+h), p(x,y+h), p(x,y)]; for (let i=1;i<points.length;i++) b.line(points[i-1],points[i]); }
    else { b.line(p(x+rx,y),p(x+w-rx,y)); b.centeredArc(x+w-rx,y+ry,rx,ry,0,-Math.PI/2,Math.PI/2); b.line(p(x+w,y+ry),p(x+w,y+h-ry)); b.centeredArc(x+w-rx,y+h-ry,rx,ry,0,0,Math.PI/2); b.line(p(x+w-rx,y+h),p(x+rx,y+h)); b.centeredArc(x+rx,y+h-ry,rx,ry,0,Math.PI/2,Math.PI/2); b.line(p(x,y+h-ry),p(x,y+ry)); b.centeredArc(x+rx,y+ry,rx,ry,0,Math.PI,Math.PI/2); }
  }
  return b.segments;
}
export function metricsFor(segments) {
  const edges = []; let length = 0;
  for (const segment of segments) for (let i=1;i<segment.points.length;i++) { const a=segment.points[i-1],b=segment.points[i],distance=Math.hypot(b.x-a.x,b.y-a.y); edges.push({a,b,start:length,length:distance}); length+=distance; }
  return { length, pointAt(distance) { if (!edges.length) return point(0,0); if(distance<=0)return {...edges[0].a};if(distance>=length)return {...edges.at(-1).b}; distance=Math.max(0,Math.min(length,distance)); const edge=edges.find(edge=>edge.start+edge.length>=distance)??edges.at(-1),t=edge.length?(distance-edge.start)/edge.length:0; return point(lerp(edge.a.x,edge.b.x,t),lerp(edge.a.y,edge.b.y,t)); }, bounds: unionBounds(segments.map(segment=>segment.bounds)) };
}
export function unionBounds(bounds) { const values=bounds.filter(Boolean); if(!values.length)return null; const x=Math.min(...values.map(b=>b.x)),y=Math.min(...values.map(b=>b.y));return{x,y,width:Math.max(...values.map(b=>b.x+b.width))-x,height:Math.max(...values.map(b=>b.y+b.height))-y}; }
