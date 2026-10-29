'use strict';
// Offline-only PDF.js/Drive-access contract tests. No LIVE Drive files or browser credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(code => code.trim());
assert(scripts.length, 'Application inline script missing');
scripts.forEach((s, i) => new vm.Script(s, { filename: 'study-note-inline-' + i + '.js' }));
const source = scripts.join('\n');
function functionSource(name) {
  const re = new RegExp('^(?:async )?function ' + name + '\\(', 'm');
  const match = re.exec(source);
  assert(match, 'Function not found: ' + name);
  const end = source.indexOf('\n}\n', match.index);
  assert(end > match.index, 'Function end not found: ' + name);
  return source.slice(match.index, end + 2);
}
function harness(names, ctx) {
  const h = vm.createContext(ctx);
  vm.runInContext(names.map(functionSource).join('\n\n'), h);
  return h;
}

assert.match(functionSource('referencePdfViewerMarkup'), /reference-pdf-preview-image/);
assert.match(functionSource('referencePdfViewerMarkup'), /reference-pdf-vector-canvas/);
assert.doesNotMatch(functionSource('renderReferencePdfFallback'), /<iframe|drivePreviewUrl/);
assert.doesNotMatch(functionSource('loadReferencePdfPage'), /syncReferencePdfNativeView|drivePreviewUrl/);
assert.doesNotMatch(source, /reference-pdf-native-overlay|referencePdfNativeView/);
assert.match(functionSource('loadReferencePdfPage'), /hasReferencePdfDriveToken\(\)/);
assert.match(functionSource('renderActiveReferencePdfImage'), /ensureAnnotationSurface/);
assert.match(functionSource('renderActiveReferencePdfImage'), /annotationSurfaceKey\('reference-pdf'/);
assert.match(functionSource('repaintReferencePdfAtZoom'), /computeAttachmentPdfRenderMetrics/);
assert.match(functionSource('fetchReferencePdfBytesFromServer'), /buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);
assert.match(functionSource('openReferencePdfViewer'), /refreshReferencePdfBackendSourceCapability\(\)/);
assert.match(functionSource('loadReferencePdfPage'), /referencePdfBackendSourceReady/);
assert.match(functionSource('loadReferencePdfHighQuality'), /fetchReferencePdfBytesFromServer\(page\)/);
assert.doesNotMatch(html, /id="referencePdfQualityBtn"/);
assert.doesNotMatch(source, /drive\.readonly|www\.googleapis\.com\/drive\/v3\/files|requestReferencePdfDriveToken|enableReferencePdfHighQuality/);
assert.match(html, /\.reference-pdf-page-image\.reference-pdf-vector-canvas\s*\{\s*display:\s*none;/);
assert.match(html, /\.reference-pdf-page-image\.reference-pdf-vector-canvas\.is-rendered\s*\{\s*display:\s*block;/);
assert.match(functionSource('renderActiveReferencePdfImage'), /activeReferencePdfZoomFactor > 1\.001/);
assert.match(functionSource('annotationStudySurface'), /activeReferencePdfVectorReady/);
assert.match(functionSource('refreshReferencePdfBackendSourceCapability'), /health\.referencePdfContentReady === true/);
assert.match(functionSource('loadReferencePdfHighQuality'), /referencePdfBackendSourceReady/);
assert.match(functionSource('refreshReferencePdfBackendSourceCapability'), /health\.referencePdfContentReady === true/);
assert.match(functionSource('fetchReferencePdfBytesFromServer'), /buildSignedGetUrl\(getApiUrl\(\), 'referencePdfContent'/);

const render = harness(['computeAttachmentPdfRenderMetrics'], {});
const page = { getViewport: ({ scale }) => ({ width: 600 * scale, height: 840 * scale }) };
const a = render.computeAttachmentPdfRenderMetrics(page, 1, 1, 1);
const b = render.computeAttachmentPdfRenderMetrics(page, 1, 2.75, 1);
const retina = render.computeAttachmentPdfRenderMetrics(page, 1, 1, 2);
const capped = render.computeAttachmentPdfRenderMetrics(page, 1, 10, 2);
assert(b.width > a.width * 2, 'Zoom must rerender PDF into more pixels');
assert(retina.width > a.width, 'DPR must increase resolution');
assert(capped.width <= 8192 && capped.height <= 8192, 'Edge cap exceeded');
assert(capped.width * capped.height <= 20 * 1024 * 1024, 'Pixel cap exceeded');
assert(Math.abs(b.width / b.height - 600 / 840) < .002, 'PDF aspect ratio changed');

async function testNativeRepaintStaysInViewer() {
  let renderWidth = 0, draws = 0, removed = 0, destroyed = 0, synced = 0, hiddenThumb = 0;
  const visible = {
    isConnected: true, width: 0, height: 0,
    classList: { add: name => assert.equal(name, 'is-rendered') },
    getContext: () => ({ drawImage: () => draws++ }),
  };
  const stage = {};
  const thumb = { classList: { add: name => { assert.equal(name, 'pdf-replaced'); hiddenThumb++; } } };
  const scroller = { clientWidth: 748 };
  const wrap = { querySelector: selector => ({
    '.reference-pdf-vector-canvas': visible,
    '.reference-pdf-pan-scroller': scroller,
    '.reference-pdf-image-stage': stage,
    '.reference-pdf-preview-image': thumb,
    '.reference-pdf-image-loading': { remove: () => removed++ },
  })[selector] || null };
  const pdfPage = {
    getViewport: ({ scale }) => ({ width: 720 * scale, height: 1000 * scale }),
    render({ viewport }) { renderWidth = viewport.width; return { promise: Promise.resolve() }; },
  };
  const ctx = {
    activeReferencePdfPage: pdfPage,
    activeReferencePdfRenderTask: null,
    activeReferencePdfVectorReady: false,
    referencePdfRenderTimer: null,
    referencePdfRenderSerial: 0,
    referencePdfLoadSerial: 7,
    activeReferencePdfFitScale: 1,
    activeReferencePdfZoomFactor: 2.75,
    window: { devicePixelRatio: 2 },
    clearTimeout: () => {},
    setTimeout, console, Math,
    els: { referencePdfFrameWrap: wrap },
    document: { createElement: name => {
      assert.equal(name, 'canvas');
      return { width: 0, height: 0, getContext: () => ({}) };
    } },
    flushPendingAnnotationSaves: () => {},
    destroyAnnotationSurfacesWithin: target => { assert.equal(target, stage); destroyed++; },
    renderActiveReferencePdfImage: ({ scheduleRender }) => {
      assert.equal(scheduleRender, false);
      synced++;
    },
  };
  const h = harness(['computeAttachmentPdfRenderMetrics', 'repaintReferencePdfAtZoom'], ctx);
  await h.repaintReferencePdfAtZoom({ immediate: true, loadSerial: 7 });
  assert.equal(ctx.activeReferencePdfVectorReady, true, 'Native canvas must become the visible media');
  assert(renderWidth > 1500, 'PDF.js must render at zoom, not stretch the thumbnail');
  assert.equal(draws, 1, 'Rendered vector bitmap must be copied to visible canvas');
  assert.equal(removed, 1, 'Thumbnail loading mask must disappear');
  assert.equal(hiddenThumb, 1, 'Thumbnail must be hidden after native render');
  assert.equal(destroyed, 1, 'Old thumbnail annotation surface must be replaced');
  assert.equal(synced, 1, 'Annotation alignment must be restored on native canvas');
}

async function testUnsupportedServerStaysOnPreview() {
  const state = { referencePdfBackendSourceReady: false, referencePdfLoadSerial: 4 };
  const h = harness(['loadReferencePdfHighQuality'], state);
  await h.loadReferencePdfHighQuality({ sourceType: '교재', pageToken: 'MG:187' }, 4);
  assert.equal(state.referencePdfBackendSourceReady, false);
  assert.equal(h.referencePdfBackendSourceReady, false);
}

(async () => {
  await testUnsupportedServerStaysOnPreview();
  await testNativeRepaintStaysInViewer();
  console.log('PDF_VECTOR_SHARP_QA_PASS: inline high density, auto signed backend only, no Drive OAuth or manual button');
})().catch(error => { console.error(error); process.exitCode = 1; });
