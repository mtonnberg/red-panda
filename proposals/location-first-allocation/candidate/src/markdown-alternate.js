import { dumpDocument, truncateDump, DumpError } from './dump.js';

const navigationAccept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

/**
 * Dump an author's Markdown alternate when available, otherwise convert the DOM.
 * deadline is an absolute Date.now() timestamp shared with the navigation budget.
 * This helper never navigates or replaces the live page and never writes streams.
 */
export async function alternateMarkdown(page, { deadline = Date.now() + (page?.timeout ?? 10000), signal,
  onDiagnostic, ...dumpOptions } = {}) {
  if (!page?.dom?.window?.document || typeof page.fetch !== 'function') throw new DumpError('A loaded browser Page is required');
  if (!Number.isFinite(deadline)) throw new DumpError('deadline must be an absolute finite timestamp');
  if (onDiagnostic !== undefined && typeof onDiagnostic !== 'function') throw new DumpError('onDiagnostic must be a function');
  if (dumpOptions.selector !== undefined) throw new DumpError('--markdown-alternate conflicts with --dump-selector');
  if (dumpOptions.format !== undefined && dumpOptions.format !== 'markdown') throw new DumpError('Markdown alternate requires Markdown output');
  // Validate options before fetching even when the alternate would bypass conversion.
  dumpDocument(page.dom.window.document, { ...dumpOptions, format: 'markdown' });
  const navigation = {
    url: page.url, httpStatus: page.status ?? 0,
    headers: (page.responseHeaders ?? []).map(header => ({ ...header })),
  };
  let attemptedURL;
  const fallback = reason => {
    if (reason === 'deadline') onDiagnostic?.({ message: 'markdown alternate skipped', url: attemptedURL, reason: 'wait budget used up' });
    return {
      content: dumpDocument(page.dom.window.document, { ...dumpOptions, format: 'markdown' }),
      ...navigation, sourceURL: navigation.url, navigationURL: navigation.url,
      usedAlternate: false, fallbackReason: reason, ...(attemptedURL ? { attemptedURL } : {}),
    };
  };
  if (navigation.httpStatus >= 400) return fallback('navigation-status');
  const link = [...page.dom.window.document.querySelectorAll('link[href]')].find(node =>
    (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('alternate') &&
    (node.getAttribute('type') ?? '').toLowerCase() === 'text/markdown');
  if (!link) return fallback('missing-link');
  try { attemptedURL = new URL(link.getAttribute('href'), page.dom.window.document.baseURI).href; }
  catch { return fallback('invalid-url'); }
  if (!['http:', 'https:', 'data:'].includes(new URL(attemptedURL).protocol)) return fallback('unsupported-protocol');
  const remaining = Math.floor(deadline - Date.now());
  if (remaining <= 0) return fallback('deadline');
  if (signal?.aborted) return fallback('aborted');
  const budgetSignal = AbortSignal.timeout(Math.min(remaining, 2147483647));
  let requestSignal;
  try { requestSignal = signal ? AbortSignal.any([budgetSignal, signal]) : budgetSignal; }
  catch (cause) { throw new DumpError(`Invalid abort signal: ${cause.message}`); }
  let response, content;
  try {
    response = await page.fetch(attemptedURL, {
      signal: requestSignal, skipDefaultReferrer: true, headers: { accept: navigationAccept },
    }, 'Other');
    if (Date.now() >= deadline || budgetSignal.aborted) return fallback('deadline');
    if (!response.ok) { await response.body?.cancel(); return fallback('http-status'); }
    const mime = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!['text/markdown', 'text/plain'].includes(mime)) { await response.body?.cancel(); return fallback('content-type'); }
    content = await response.text();
    if (Date.now() >= deadline || budgetSignal.aborted) return fallback('deadline');
    if (!content.length) return fallback('empty-body');
  } catch {
    return fallback(budgetSignal.aborted || Date.now() >= deadline ? 'deadline' : signal?.aborted ? 'aborted' : 'fetch-failed');
  }
  const url = response.url || response.finalUrl || attemptedURL;
  return {
    content: truncateDump(content, dumpOptions.maxBytes), url, sourceURL: url, navigationURL: navigation.url,
    httpStatus: response.status, headers: [...response.headers].map(([name, value]) => ({ name, value })),
    usedAlternate: true, attemptedURL,
  };
}
