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
assert.match(functionSource('requestReferencePdfDriveToken'), /drive\.readonly/);
assert.match(functionSource('enableReferencePdfHighQuality'), /requestReferencePdfDriveToken\(\)/);

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

async function testDriveOAuthClick() {
  let prompts = 0;
  let scope = '';
  const ctx = {
    GOOGLE_OAUTH_CLIENT_ID: 'test-client',
    referencePdfDriveToken: '',
    referencePdfDriveTokenExpiry: 0,
    Date,
    window: {
      google: { accounts: { oauth2: { initTokenClient(opts) {
        scope = opts.scope;
        return { requestAccessToken(args) {
          prompts++;
          assert.equal(args.prompt, 'consent');
          opts.callback({ access_token: 'token-only-in-memory', expires_in: 3600 });
        } };
      } } } },
    },
  };
  const h = harness(['hasReferencePdfDriveToken', 'requestReferencePdfDriveToken'], ctx);
  assert.equal(h.hasReferencePdfDriveToken(), false);
  const token = await h.requestReferencePdfDriveToken();
  assert.equal(token, 'token-only-in-memory');
  assert.equal(scope, 'https://www.googleapis.com/auth/drive.readonly');
  assert.equal(prompts, 1);
  await h.requestReferencePdfDriveToken();
  assert.equal(prompts, 1, 'Valid in-memory token should be reused');
}

async function testRealPdfBytesReachPdfJs() {
  let url = '', authorization = '', firstPage = null, docData = null, errors = [];
  const pdfPage = { getViewport: ({ scale }) => ({ width: 400 * scale, height: 600 * scale }) };
  const doc = { getPage: async n => { firstPage = n; return pdfPage; } };
  const ctx = {
    referencePdfDriveToken: 'test-bearer',
    referencePdfDriveTokenExpiry: Date.now() + 3600000,
    referencePdfQualityPending: false,
    referencePdfLoadSerial: 4,
    activeReferencePdfVectorReady: false,
    activeReferencePdfDocument: null,
    activeReferencePdfPage: null,
    Date, Uint8Array, String, console,
    hasReferencePdfDriveToken: () => true,
    updateReferencePdfZoomUi: () => {},
    repaintReferencePdfAtZoom: async () => { ctx.activeReferencePdfVectorReady = true; },
    showToast: e => errors.push(e),
    els: { referencePdfViewerModal: { classList: { contains: () => false } } },
    ensurePdfJsLoaded: async () => ({
      getDocument({ data }) { docData = data; return { promise: Promise.resolve(doc) }; },
    }),
    fetch: async (target, opts) => {
      url = target; authorization = opts.headers.Authorization;
      return { ok: true, arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 52]).buffer };
    },
  };
  const h = harness(['loadReferencePdfHighQuality'], ctx);
  await h.loadReferencePdfHighQuality({ driveFileId: 'verified-file-id' }, 4);
  assert.match(url, /www\.googleapis\.com\/drive\/v3\/files\/verified-file-id\?alt=media/);
  assert.equal(authorization, 'Bearer test-bearer');
  assert(docData instanceof Uint8Array);
  assert.equal(firstPage, 1);
  assert.equal(ctx.activeReferencePdfDocument, doc);
  assert.equal(ctx.referencePdfQualityPending, false);
  assert.equal(errors.length, 0, errors.join(','));
}

(async () => {
  await testDriveOAuthClick();
  await testRealPdfBytesReachPdfJs();
  console.log('PDF_VECTOR_SHARP_QA_PASS: in-viewer vector PDF, zoom resolution, OAuth click, real PDF byte path, no Drive iframe');
})().catch(error => { console.error(error); process.exitCode = 1; });
