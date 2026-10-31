import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendPath = fileURLToPath(new URL('../native/render_backend.py', import.meta.url));
const modes = new Set(['js', 'css', 'ui', 'invisible', 'shell', 'clutter']);
const excluded = new Set(['head', 'script', 'style', 'template', 'noscript', 'meta', 'link', 'base', 'title', 'iframe', 'canvas', 'svg', 'input']);
const blockTags = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside', 'form', 'blockquote', 'address', 'figure', 'figcaption', 'dl', 'dt', 'dd']);
const clean = node => (node.textContent ?? '').replace(/\s+/g, ' ').trim();

export class RenderError extends Error {
  constructor(message, code = 'RENDER_ERROR') { super(message); this.name = 'RenderError'; this.code = code; }
}
function integer(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RenderError(`${name} must be an integer from ${minimum} to ${maximum}`, 'RENDER_BOUNDS');
  return value;
}
function normalizeModes(stripModes, strip) {
  if (!Array.isArray(stripModes)) throw new RenderError('stripModes must be an array');
  const selected = new Set(stripModes);
  if (strip !== undefined) {
    if (!strip || typeof strip !== 'object' || Array.isArray(strip)) throw new RenderError('strip must be an object');
    for (const [name, enabled] of Object.entries(strip)) {
      if (!modes.has(name) || typeof enabled !== 'boolean') throw new RenderError(`Invalid strip option: ${name}`);
      if (enabled) selected.add(name);
    }
  }
  for (const mode of selected) if (!modes.has(mode)) throw new RenderError(`Unknown strip mode: ${mode}`);
  return selected;
}
function snapshot(document, root, selected) {
  const blocked = new WeakSet(), computed = new WeakMap();
  const style = node => {
    if (!computed.has(node)) {
      try { computed.set(node, document.defaultView?.getComputedStyle(node) ?? null); } catch { computed.set(node, null); }
    }
    return computed.get(node);
  };
  const elements = [...(root.nodeType === 1 ? [root] : []), ...(root.querySelectorAll?.('*') ?? [])];
  if (selected.has('ui')) for (const node of elements) if (['img', 'picture', 'video', 'svg'].includes(node.localName)) blocked.add(node);
  if (selected.has('shell') || selected.has('clutter')) {
    const chrome = elements.filter(node => ['nav', 'aside', 'dialog', 'header', 'footer'].includes(node.localName) &&
      (!['header', 'footer'].includes(node.localName) || !node.closest('main,article,section,[role="main"]')));
    const top = chrome.filter(node => !chrome.some(other => other !== node && other.contains(node)));
    const total = clean(root).length, lost = top.reduce((sum, node) => sum + clean(node).length, 0);
    if (root.querySelector?.('main,article,[role="main"]') || !total || total - lost >= total * .2) top.forEach(node => blocked.add(node));
    if (selected.has('clutter')) {
      const winner = elements.filter(node => ['main', 'article'].includes(node.localName) || node.getAttribute('role') === 'main').sort((a, b) => clean(b).length - clean(a).length)[0];
      if (winner && clean(winner).length >= 100 && clean(winner).length >= total * .35) {
        for (let node = winner; node !== root && node.parentNode; node = node.parentNode) {
          for (const sibling of node.parentNode.childNodes) if (sibling !== node) blocked.add(sibling);
        }
      }
    }
  }
  const blocks = []; let runs = [], current = { size: 16, after: 12, indent: 0 }, characters = 0, count = 0;
  const flush = () => {
    if (runs.some(run => /\S/.test(run.text))) blocks.push({ ...current, runs });
    runs = [];
    if (blocks.length > 20000) throw new RenderError('Rendering exceeds 20000 text blocks', 'RENDER_BOUNDS');
  };
  const append = (value, font) => {
    characters += value.length;
    if (characters > 1000000) throw new RenderError('Rendering exceeds one million text characters', 'RENDER_BOUNDS');
    if (value) runs.push({ text: value, size: font.size, bold: font.bold, italic: font.italic, mono: font.mono });
  };
  const visit = (node, font = { size: 16, bold: false, italic: false, mono: false }, depth = 0, list = null) => {
    if (++count > 100000 || depth > 256) throw new RenderError('Rendering exceeds DOM traversal bounds', 'RENDER_BOUNDS');
    if (blocked.has(node)) return;
    if (node.nodeType === 3) { append(current.pre ? node.data : node.data.replace(/\s+/g, ' '), font); return; }
    if (node.nodeType === 9 || node.nodeType === 11) { for (const child of node.childNodes) visit(child, font, depth + 1, list); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    // Reference text render ignores CSS colours/fonts/visibility, but removes display:none and hidden/ARIA-hidden content.
    if (excluded.has(tag) || node.hidden || node.getAttribute('aria-hidden') === 'true' || style(node)?.display === 'none') return;
    const nextFont = { ...font };
    if (tag === 'b' || tag === 'strong') nextFont.bold = true;
    if (tag === 'i' || tag === 'em') nextFont.italic = true;
    if (tag === 'code' || tag === 'pre' || tag === 'kbd' || tag === 'samp') nextFont.mono = true;
    if (tag === 'br') { append('\n', nextFont); return; }
    if (tag === 'img') { if (node.alt) append(node.alt, nextFont); return; }
    if (tag === 'ul' || tag === 'ol') {
      flush(); const previous = current;
      const items = [...node.children].filter(child => child.localName === 'li');
      const start = Number(node.getAttribute('start')) || 1;
      items.forEach((child, index) => visit(child, nextFont, depth + 1, { level: (list?.level ?? 0) + 1, prefix: tag === 'ul' ? '• ' : `${start + index}. `, last: index === items.length - 1 }));
      flush(); current = previous; return;
    }
    if (tag === 'tr') {
      flush(); const previous = current; current = { size: 16, after: 4, indent: 0 };
      [...node.children].forEach((cell, index) => { if (index) append(' | ', nextFont); for (const child of cell.childNodes) visit(child, { ...nextFont, bold: nextFont.bold || cell.localName === 'th' }, depth + 1); });
      flush(); current = previous; return;
    }
    const heading = /^h[1-6]$/.test(tag), block = heading || blockTags.has(tag) || tag === 'pre' || tag === 'li' || tag === 'hr';
    let previous;
    if (block) {
      flush(); previous = current;
      if (heading) { nextFont.size = [32, 24, 18.72, 16, 13.28, 10.72][Number(tag[1]) - 1]; nextFont.bold = true; }
      current = { size: nextFont.size, after: heading ? 8 : tag === 'li' ? list?.last ? 12 : 4 : 12,
        indent: tag === 'li' ? (list?.level ?? 1) * 8 : tag === 'blockquote' ? 16 : previous.indent, pre: tag === 'pre' };
      if (tag === 'li') append(list?.prefix ?? '• ', nextFont);
      if (tag === 'hr') append('────────────────────', nextFont);
    }
    for (const child of node.childNodes) visit(child, nextFont, depth + 1, list);
    if (block) { flush(); current = previous; }
  };
  visit(root); flush();
  return { blocks, text: blocks.map(block => block.runs.map(run => run.text).join('').trim()).join('\n') };
}
function invokeBackend(payload, { pythonExecutable = 'python3', timeout = 15000, signal } = {}) {
  integer(timeout, 'timeout', 1, 120000);
  if (typeof pythonExecutable !== 'string' || !pythonExecutable) throw new RenderError('pythonExecutable must name a Python interpreter');
  if (signal !== undefined) { try { AbortSignal.any([signal]); } catch { throw new RenderError('signal must be an AbortSignal'); } }
  if (signal?.aborted) return Promise.reject(new RenderError('Rendering aborted', 'RENDER_ABORTED'));
  return new Promise((accept, reject) => {
    const child = spawn(pythonExecutable, [backendPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let length = 0, stderr = '', failure, finished = false;
    const stop = error => { failure ??= error; child.kill('SIGKILL'); };
    const abort = () => stop(new RenderError('Rendering aborted', 'RENDER_ABORTED'));
    const timer = setTimeout(() => stop(new RenderError(`Rendering exceeded ${timeout}ms`, 'RENDER_TIMEOUT')), timeout);
    const finish = (error, result) => {
      if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      error ? reject(error) : accept(result);
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', error => finish(new RenderError(`Rendering backend unavailable: ${error.message}`, 'RENDER_BACKEND_UNAVAILABLE')));
    child.stdout.on('data', chunk => { length += chunk.length; if (length > 96 * 1024 * 1024) stop(new RenderError('Rendering output exceeds 96MiB', 'RENDER_BOUNDS')); else chunks.push(chunk); });
    child.stderr.on('data', chunk => { if (stderr.length < 16000) stderr += chunk.toString(); });
    child.stdin.on('error', () => {});
    child.once('close', code => {
      if (failure) return finish(failure);
      let result;
      try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return finish(new RenderError(`Rendering backend failed (${code}): ${stderr.trim() || 'invalid response'}`, 'RENDER_BACKEND_ERROR')); }
      if (result.error) return finish(new RenderError(result.error.message, result.error.code));
      if (code !== 0) return finish(new RenderError(`Rendering backend exited ${code}`, 'RENDER_BACKEND_ERROR'));
      finish(null, result);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export function getRenderBackendInfo(options = {}) { return invokeBackend({ mode: 'info' }, options); }

/** Real text-only PNG/PDF output; no page-supplied code, paths or fonts reach the backend. */
export async function renderDocument(document, { format = 'png', selector, node, width = 1920, height = 1080,
  fullPage = true, inline = false, stripModes = [], strip, fontFamily = 'sans', paperWidth = 612,
  paperHeight = 792, paperMargin = 28.8, marginTop = paperMargin, marginBottom = paperMargin,
  marginLeft = paperMargin, marginRight = paperMargin, landscape = false, PDFscale = 1, pageRanges = '',
  clip, displayHeaderFooter = false, headerTemplate, footerTemplate, renderFonts, pythonExecutable, timeout, signal } = {}) {
  if (document?.nodeType !== 9) throw new RenderError('A DOM document is required');
  if (!['png', 'pdf'].includes(format)) throw new RenderError(`Unsupported render format: ${format}`, 'RENDER_FORMAT_UNSUPPORTED');
  if (typeof fullPage !== 'boolean' || typeof inline !== 'boolean') throw new RenderError('fullPage and inline must be booleans');
  if (!['sans', 'mono'].includes(fontFamily)) throw new RenderError('Only fixed sans and mono font families are supported');
  if (renderFonts !== undefined && (!Array.isArray(renderFonts) || renderFonts.length)) throw new RenderError('Additional render fonts are not implemented', 'RENDER_FONT_UNSUPPORTED');
  integer(width, 'width', 64, 8192); integer(height, 'height', 1, 32768);
  if (typeof landscape !== 'boolean' || !Number.isFinite(PDFscale) || PDFscale < .1 || PDFscale > 2) throw new RenderError('Invalid PDF print parameters', 'RENDER_BOUNDS');
  const orientedWidth = landscape ? paperHeight : paperWidth, orientedHeight = landscape ? paperWidth : paperHeight;
  if (![paperWidth, paperHeight, marginTop, marginBottom, marginLeft, marginRight].every(Number.isFinite) || paperWidth < 100 || paperHeight < 100 || paperWidth > 2880 || paperHeight > 2880 || Math.min(marginTop, marginBottom, marginLeft, marginRight) < 0 || marginLeft + marginRight >= orientedWidth || marginTop + marginBottom >= orientedHeight) throw new RenderError('Invalid PDF paper bounds', 'RENDER_BOUNDS');
  if (typeof pageRanges !== 'string') throw new RenderError('pageRanges must be a string', 'RENDER_PAGE_RANGE_SYNTAX');
  if (displayHeaderFooter || headerTemplate || footerTemplate) throw new RenderError('PDF header/footer rendering is not implemented', 'RENDER_OPTION_UNSUPPORTED');
  let normalizedClip;
  if (clip !== undefined) {
    if (format !== 'png' || inline) throw new RenderError('Clip requires PNG output without inline bounds');
    if (!clip || typeof clip !== 'object' || Array.isArray(clip)) throw new RenderError('Invalid screenshot clip', 'RENDER_SCREENSHOT_OPTIONS');
    const { x = 0, y = 0, width: clipWidth, height: clipHeight, scale = 1 } = clip;
    if (![x, y, clipWidth, clipHeight, scale].every(Number.isFinite) || scale <= 0 || scale > 8 || Math.max(Math.abs(x), Math.abs(y)) > 10000000) throw new RenderError('Invalid screenshot clip', 'RENDER_SCREENSHOT_OPTIONS');
    // Reference ignores non-positive clip dimensions, retaining the viewport.
    if (clipWidth > 0 && clipHeight > 0) normalizedClip = { x, y, width: clipWidth, height: clipHeight, scale };
  }
  if (selector !== undefined && node !== undefined) throw new RenderError('Choose selector or node, not both');
  let root = node ?? document.body ?? document.documentElement;
  if (selector !== undefined) {
    if (typeof selector !== 'string' || !selector) throw new RenderError('selector must be a CSS selector');
    try { root = document.querySelector(selector); } catch { throw new RenderError('Invalid CSS selector', 'InvalidSelector'); }
    if (!root) throw new RenderError(`No element matches ${selector}`, 'SelectorNotFound');
  }
  if (!root || root !== document && root.ownerDocument !== document) throw new RenderError('Render node belongs to another document');
  const captured = snapshot(document, root, normalizeModes(stripModes, strip));
  const result = await invokeBackend({ ...captured, format, width: inline ? Math.min(width, 1280) : width, height,
    fullPage, maxHeight: inline ? 4096 : 32768, clipToBounds: inline, maxPixels: 32 * 1024 * 1024, fontFamily,
    paperWidth, paperHeight, marginTop, marginBottom, marginLeft, marginRight, landscape, PDFscale, pageRanges,
    clip: normalizedClip }, { pythonExecutable, timeout, signal });
  if (typeof result.data !== 'string') throw new RenderError('Rendering backend returned no artifact', 'RENDER_BACKEND_ERROR');
  const bytes = Buffer.from(result.data, 'base64'); delete result.data;
  if (format === 'png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || format === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new RenderError('Rendering backend returned invalid artifact bytes', 'RENDER_BACKEND_ERROR');
  return { ...result, bytes, format, mimeType: format === 'png' ? 'image/png' : 'application/pdf', text: captured.text };
}
