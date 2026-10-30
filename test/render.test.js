import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { renderDocument, getRenderBackendInfo, RenderError } from '../src/render.js';

const inspector = `import sys,json,io
data=sys.stdin.buffer.read()
if data.startswith(b'\\x89PNG'):
 from PIL import Image,ImageChops
 image=Image.open(io.BytesIO(data)).convert('RGBA');rgb=image.convert('RGB')
 difference=ImageChops.difference(rgb,Image.new('RGB',image.size,'white'))
 dark=coloured=0
 for r,g,b in rgb.getdata():
  dark+=min(r,g,b)<200;coloured+=r!=g or g!=b
 print(json.dumps({'format':'png','width':image.width,'height':image.height,'mode':image.mode,'bbox':difference.getbbox(),'darkPixels':dark,'colouredPixels':coloured}))
else:
 import fitz
 document=fitz.open(stream=data,filetype='pdf')
 print(json.dumps({'format':'pdf','pageCount':len(document),'sizes':[[p.rect.width,p.rect.height] for p in document],'pageTexts':[p.get_text() for p in document],'text':''.join(p.get_text() for p in document),'fonts':sorted(set(f[3] for p in document for f in p.get_fonts())),'images':sum(len(p.get_images()) for p in document),'spans':[{'text':s['text'],'size':s['size'],'font':s['font'],'origin':s['origin']} for p in document for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]}))
`;
function inspect(bytes) {
  return new Promise((accept, reject) => {
    const child = spawn('python3', ['-c', inspector], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.once('error', reject); child.once('close', code => {
      if (code) reject(new Error(stderr)); else { try { accept(JSON.parse(stdout)); } catch (error) { reject(error); } }
    });
    child.stdin.end(bytes);
  });
}
async function withDocument(source, task) {
  const dom = new JSDOM(source, { url: 'https://fixture.test/render' });
  try { return await task(dom.window.document); } finally { dom.window.close(); }
}
const normalize = value => value.replace(/\s+/g, ' ').trim();

function compareCrop(original, cropped, box) {
  return new Promise((accept, reject) => {
    const code = `import sys,json,base64,io\nfrom PIL import Image,ImageChops\nv=json.load(sys.stdin);a=Image.open(io.BytesIO(base64.b64decode(v['original']))).convert('RGB');b=Image.open(io.BytesIO(base64.b64decode(v['cropped']))).convert('RGB');e=a.crop(tuple(v['box']));print(json.dumps({'equal':e.size==b.size and ImageChops.difference(e,b).getbbox() is None}))`;
    const child = spawn('python3', ['-c', code], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.once('error', reject); child.once('close', code => code ? reject(new Error(stderr)) : accept(JSON.parse(stdout)));
    child.stdin.end(JSON.stringify({ original: original.toString('base64'), cropped: cropped.toString('base64'), box }));
  });
}

test('render backend reports actual installed font/raster/PDF capabilities', async () => {
  const info = await getRenderBackendInfo();
  assert.deepEqual(info.formats, ['png', 'pdf']); assert.match(info.backend.name, /Pillow.*ReportLab/);
  assert.ok(info.backend.pillow); assert.ok(info.backend.reportlab); assert.ok(info.fonts.includes('sans-bold'));
});

test('PNG contains real glyph pixels and glyph widths respond to actual text changes', async () => {
  await withDocument('<p>iiiiiiii</p>', async document => {
    const narrow = await renderDocument(document), narrowPixels = await inspect(narrow.bytes);
    document.querySelector('p').textContent = 'WWWWWWWW';
    const wide = await renderDocument(document), widePixels = await inspect(wide.bytes);
    assert.equal(narrowPixels.format, 'png'); assert.equal(narrowPixels.mode, 'RGBA'); assert.ok(narrowPixels.darkPixels > 100);
    assert.ok(widePixels.bbox[2] - widePixels.bbox[0] > (narrowPixels.bbox[2] - narrowPixels.bbox[0]) * 2);
    assert.notDeepEqual(narrow.bytes, wide.bytes); assert.equal(wide.mimeType, 'image/png');
    assert.equal(widePixels.width, wide.width); assert.equal(widePixels.height, wide.height);
  });
});

test('owned native fixtures agree on measured full PNG dimensions and real output is nonblank', async () => {
  const { observations } = JSON.parse(await readFile(new URL('../docs/reference/render-native-observations.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const sample of observations.filter(item => item.format === 'png')) await withDocument(sample.source, async document => {
    const result = await renderDocument(document);
    assert.equal(result.width, sample.width, sample.name); assert.equal(result.height, sample.height, sample.name);
    assert.ok(result.bytes.length > 500); assert.ok(result.lineCount > 0); checked++;
  });
  assert.equal(checked, 4);
});

test('selectors and node roots render actual selected content, with explicit missing/foreign-node errors', async () => {
  await withDocument('<h1 id=chosen>Selected heading</h1><p>Outside content</p>', async document => {
    const selected = await renderDocument(document, { selector: '#chosen' });
    assert.equal(selected.text, 'Selected heading'); assert.ok((await inspect(selected.bytes)).darkPixels > 300);
    const whole = await renderDocument(document); assert.ok(selected.height < whole.height);
    assert.deepEqual((await renderDocument(document, { node: document.querySelector('#chosen') })).bytes, selected.bytes);
    await assert.rejects(renderDocument(document, { selector: '#absent' }), error => error.code === 'SelectorNotFound');
    await assert.rejects(renderDocument(document, { selector: '[' }), error => error.code === 'InvalidSelector');
    const other = new JSDOM('<p>Foreign</p>');
    try { await assert.rejects(renderDocument(document, { node: other.window.document.querySelector('p') }), /another document/); }
    finally { other.window.close(); }
  });
});

test('native screenshot viewport/inline/full-page dimension contracts are represented without scaling glyphs', async () => {
  const native = JSON.parse(await readFile(new URL('../docs/reference/render-mcp-observations.json', import.meta.url), 'utf8'));
  await withDocument(native.small, async document => {
    const viewport = await renderDocument(document, { inline: true, fullPage: false });
    assert.equal(viewport.width, 1280); assert.equal(viewport.height, 1080);
    const full = await renderDocument(document, { inline: true, fullPage: true });
    assert.equal(full.width, 1280); assert.equal(full.height, 107);
    const pathImage = await renderDocument(document, { fullPage: true });
    assert.equal(pathImage.width, 1920); assert.equal(pathImage.height, 107);
  });
  await withDocument(native.long, async document => {
    const result = await renderDocument(document, { inline: true });
    assert.equal(result.width, 1280); assert.equal(result.height, 4096); assert.equal(result.clipped, true);
    assert.ok(result.contentHeight > 4096); assert.ok((await inspect(result.bytes)).darkPixels > 10000);
  });
});

test('font measurements wrap Unicode prose and long words rather than clipping a single raw line', async () => {
  await withDocument(`<p>${'Own café Ω Ж wrapping content. '.repeat(12)}</p><p>${'LongWord'.repeat(30)}</p>`, async document => {
    const narrow = await renderDocument(document, { width: 240 }), wide = await renderDocument(document, { width: 960 });
    assert.ok(narrow.lineCount > wide.lineCount * 2); assert.ok(narrow.height > wide.height * 2);
    const image = await inspect(narrow.bytes); assert.ok(image.darkPixels > 1000); assert.ok(image.bbox[2] <= 240);
    assert.deepEqual(narrow.missingGlyphs, []);
  });
});

test('PNG clip crops original glyph pixels without reflow, scales real fonts and can read beyond the viewport', async () => {
  await withDocument('<h1>Crop original text</h1>'+Array.from({ length: 30 }, (_, index) => `<p>Own line ${index} has actual glyphs</p>`).join(''), async document => {
    const original = await renderDocument(document, { width: 400 });
    const clip = { x: 10, y: 20, width: 120, height: 80, scale: 1 };
    const cropped = await renderDocument(document, { width: 400, fullPage: false, height: 100, clip });
    assert.equal(cropped.width, 120); assert.equal(cropped.height, 80); assert.equal(cropped.sourceWidth, 400);
    assert.equal((await compareCrop(original.bytes, cropped.bytes, [10, 20, 130, 100])).equal, true);
    const scaled = await renderDocument(document, { width: 400, clip: { ...clip, scale: 2 } });
    assert.equal(scaled.width, 240); assert.equal(scaled.height, 160);
    const basePixels = await inspect(cropped.bytes), scaledPixels = await inspect(scaled.bytes);
    assert.ok(scaledPixels.darkPixels > basePixels.darkPixels * 2.5);
    const below = await renderDocument(document, { width: 400, height: 100, fullPage: false, clip: { x: 0, y: 400, width: 200, height: 60, scale: 1 } });
    assert.ok((await inspect(below.bytes)).darkPixels > 100);
    const ignored = await renderDocument(document, { width: 400, height: 100, fullPage: false, clip: { x: 0, y: 0, width: -1, height: 50, scale: 1 } });
    assert.equal(ignored.width, 400); assert.equal(ignored.height, 100);
    await assert.rejects(renderDocument(document, { clip: { x: 0, y: 0, width: 100, height: 50, scale: 0 } }), error => error.code === 'RENDER_SCREENSHOT_OPTIONS');
  });
});

test('PDF has selectable Unicode text, embedded fonts and meaningful missing-glyph metadata', async () => {
  const value = 'Own café Ω Ж 中文 😀 🐼';
  await withDocument(`<h1>Unicode PDF</h1><p>${value}</p>`, async document => {
    const result = await renderDocument(document, { format: 'pdf' }), pdf = await inspect(result.bytes);
    assert.match(result.bytes.subarray(0, 8).toString(), /%PDF-1\.4/); assert.equal(result.mimeType, 'application/pdf');
    assert.ok(pdf.text.includes(value)); assert.equal(pdf.images, 0); assert.equal(pdf.pageCount, result.pageCount);
    assert.deepEqual(pdf.sizes, [[612, 792]]); assert.ok(pdf.fonts.some(font => /DejaVuSans/.test(font)));
    assert.ok(result.missingGlyphs.includes('中'.codePointAt(0))); assert.ok(result.missingGlyphs.includes('🐼'.codePointAt(0)));
  });
});

test('PDF paginates the actual long document and preserves beginning and final selectable lines', async () => {
  const { observations } = JSON.parse(await readFile(new URL('../docs/reference/render-native-observations.json', import.meta.url), 'utf8'));
  const source = observations.find(sample => sample.name === 'long' && sample.format === 'pdf');
  const native = await inspect(await readFile(new URL(`../${source.path}`, import.meta.url)));
  await withDocument(source.source, async document => {
    const result = await renderDocument(document, { format: 'pdf' }), pdf = await inspect(result.bytes);
    assert.equal(pdf.pageCount, native.pageCount); assert.equal(result.pageCount, 11);
    assert.ok(pdf.text.includes('Line 001')); assert.ok(pdf.text.includes('Line 130')); assert.ok(pdf.text.includes('Long document'));
    assert.equal(pdf.images, 0); assert.deepEqual(pdf.sizes[0], [612, 792]);
  });
});

test('PDF landscape, paper points, independent margins and scale change actual page/text geometry', async () => {
  await withDocument('<h1>Print geometry</h1><p>Own body text</p>', async document => {
    const landscape = await renderDocument(document, { format: 'pdf', landscape: true });
    assert.deepEqual((await inspect(landscape.bytes)).sizes, [[792, 612]]); assert.equal(landscape.width, 792);
    const paper = await renderDocument(document, { format: 'pdf', paperWidth: 288, paperHeight: 432,
      marginTop: 7.2, marginBottom: 14.4, marginLeft: 21.6, marginRight: 28.8 });
    const pdf = await inspect(paper.bytes); assert.deepEqual(pdf.sizes, [[288, 432]]);
    assert.ok(Math.abs(pdf.spans[0].origin[0] - 21.6) < .001); assert.ok(Math.abs(pdf.spans[0].origin[1] - 30.45) < .001);
    const doubled = await inspect((await renderDocument(document, { format: 'pdf', PDFscale: 2 })).bytes);
    assert.ok(doubled.spans.some(span => span.size === 48)); assert.ok(doubled.spans.some(span => span.size === 24));
    const half = await inspect((await renderDocument(document, { format: 'pdf', PDFscale: .5 })).bytes);
    assert.ok(half.spans.some(span => span.size === 12)); assert.ok(half.spans.some(span => span.size === 6));
    await assert.rejects(renderDocument(document, { format: 'pdf', PDFscale: 0 }), /Invalid PDF print/);
    await assert.rejects(renderDocument(document, { format: 'pdf', marginTop: -1 }), /Invalid PDF paper/);
    await assert.rejects(renderDocument(document, { format: 'pdf', displayHeaderFooter: true }), error => error.code === 'RENDER_OPTION_UNSUPPORTED');
  });
});

test('PDF pageRanges filters actual paginated content, sorts/deduplicates, supports open ranges and rejects invalid selections', async () => {
  await withDocument(Array.from({ length: 75 }, (_, index) => `<p>Unique line ${String(index + 1).padStart(3, '0')}</p>`).join(''), async document => {
    const options = { format: 'pdf', paperHeight: 200, paperWidth: 300, paperMargin: 10 };
    const all = await renderDocument(document, options), complete = await inspect(all.bytes);
    assert.ok(complete.pageCount > 3);
    const selected = await renderDocument(document, { ...options, pageRanges: '3,1,3' }), pdf = await inspect(selected.bytes);
    assert.equal(selected.pageCount, 2); assert.equal(selected.totalPageCount, all.pageCount); assert.deepEqual(selected.selectedPages, [1, 3]);
    assert.deepEqual(pdf.pageTexts.map(normalize), [complete.pageTexts[0], complete.pageTexts[2]].map(normalize));
    const second = await inspect((await renderDocument(document, { ...options, pageRanges: '2' })).bytes);
    assert.deepEqual(second.pageTexts.map(normalize), [normalize(complete.pageTexts[1])]);
    const openStart = await renderDocument(document, { ...options, pageRanges: '-2' }); assert.deepEqual(openStart.selectedPages, [1, 2]);
    const openEnd = await renderDocument(document, { ...options, pageRanges: '2-' }); assert.equal(openEnd.pageCount, all.pageCount - 1);
    const clamped = await renderDocument(document, { ...options, pageRanges: '1-999' }); assert.equal(clamped.pageCount, all.pageCount);
    for (const range of ['0', '3-1']) await assert.rejects(renderDocument(document, { ...options, pageRanges: range }), error => error.code === 'RENDER_PAGE_RANGE_INVALID' && error.message === 'Invalid page range');
    await assert.rejects(renderDocument(document, { ...options, pageRanges: 'one' }), error => error.code === 'RENDER_PAGE_RANGE_SYNTAX' && error.message === 'Invalid page range syntax');
    await assert.rejects(renderDocument(document, { ...options, pageRanges: '999' }), error => error.code === 'RENDER_PAGE_RANGE_EXCEEDS_COUNT' && error.message === 'Page range exceeds page count');
  });
});

test('render visibility and semantic fonts follow measured native text-only behavior', async () => {
  await withDocument('<style>.gone{display:none}</style><h1 style="font-size:10px;color:red">Heading</h1><p class=gone>CSS hidden</p><p hidden>Hidden attr</p><p aria-hidden=true>ARIA hidden</p><p style="visibility:hidden">Invisible retained</p><div style="font-weight:bold;font-family:monospace">CSS font ignored</div><p><strong>Semantic bold</strong> <em>Semantic italic</em></p><input value="Input omitted"><button>Button text</button><img alt="Panda alt" src=own>', async document => {
    const result = await renderDocument(document, { format: 'pdf' }), pdf = await inspect(result.bytes);
    assert.match(pdf.text, /Heading/); assert.match(pdf.text, /Invisible retained/); assert.match(pdf.text, /Panda alt/); assert.match(pdf.text, /Button text/);
    assert.doesNotMatch(pdf.text, /CSS hidden|Hidden attr|ARIA hidden|Input omitted/);
    assert.ok(pdf.spans.some(span => span.text.includes('Heading') && span.size === 24 && /Bold/.test(span.font)));
    assert.ok(pdf.spans.some(span => span.text.includes('Semantic') && /Oblique/.test(span.font)));
    const png = await renderDocument(document), pixels = await inspect(png.bytes); assert.equal(pixels.colouredPixels, 0);
  });
});

test('strip groups remove real UI/chrome while preserving main text and leaving the DOM unchanged', async () => {
  await withDocument('<header>Site shell</header><nav>Navigation</nav><main><h1>Actual main</h1><p>Body text</p><img alt="Image alt"></main><footer>Site foot</footer>', async document => {
    const stripped = await renderDocument(document, { strip: { shell: true, ui: true } });
    assert.match(stripped.text, /Actual main/); assert.doesNotMatch(stripped.text, /Site shell|Site foot|Navigation|Image alt/);
    assert.ok((await inspect(stripped.bytes)).darkPixels > 300); assert.ok(document.querySelector('img')); assert.ok(document.querySelector('nav'));
  });
});

test('missing backend, deadline, cancellation and unsupported/bounded requests fail explicitly', async () => {
  await withDocument('<p>Actual content</p>', async document => {
    await assert.rejects(renderDocument(document, { pythonExecutable: '/missing-own-render-python' }), error => error instanceof RenderError && error.code === 'RENDER_BACKEND_UNAVAILABLE');
    await assert.rejects(renderDocument(document, { timeout: 1 }), error => error.code === 'RENDER_TIMEOUT');
    await assert.rejects(renderDocument(document, { signal: AbortSignal.abort() }), error => error.code === 'RENDER_ABORTED');
    await assert.rejects(renderDocument(document, { signal: {} }), /AbortSignal/);
    await assert.rejects(renderDocument(document, { format: 'jpeg' }), error => error.code === 'RENDER_FORMAT_UNSUPPORTED');
    await assert.rejects(renderDocument(document, { fontFamily: '/untrusted/page/font.ttf' }), /fixed sans and mono/);
    await assert.rejects(renderDocument(document, { renderFonts: ['/untrusted/page/font.ttf'] }), error => error.code === 'RENDER_FONT_UNSUPPORTED');
    await assert.rejects(renderDocument(document, { width: 0 }), error => error.code === 'RENDER_BOUNDS');
    await assert.rejects(renderDocument(document, { width: 8192, height: 32768, fullPage: false }), error => error.code === 'RENDER_BOUNDS');
    await assert.rejects(renderDocument(document, { stripModes: ['invented'] }), /Unknown strip mode/);
    document.body.innerHTML = '<p>Own bounded line</p>'.repeat(1100);
    await assert.rejects(renderDocument(document), error => error.code === 'RENDER_BOUNDS' && /height/.test(error.message));
  });
});

test('empty content produces a legitimate blank artifact with no invented page text', async () => {
  await withDocument('<title>Empty</title>', async document => {
    const result = await renderDocument(document), png = await inspect(result.bytes);
    assert.equal(result.text, ''); assert.equal(result.lineCount, 0); assert.equal(result.height, 32);
    assert.equal(png.darkPixels, 0); assert.equal(png.bbox, null);
  });
});
