'use strict';
// Browser integration: actual PDF.js 3.11.174, actual PDF bytes, and the production
// reference-PDF canvas/zoom functions. DOES NOT test deployed Apps Script auth.
// Optional PDF_QA_FIXTURES_DIR contains local/private MG_0187.pdf, SW_0010.pdf.
// Never commit those private files, file IDs, auth tokens, or PDF screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('../../.qa-browser/node_modules/puppeteer-core');

const pdfjsDir = path.resolve(__dirname, '../../.qa-browser/pdfjs');
const pdfjs = fs.readFileSync(path.join(pdfjsDir, 'pdf.min.js'));
const worker = fs.readFileSync(path.join(pdfjsDir, 'pdf.worker.min.js'));
const rawHtml = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const html = rawHtml
  .replace("window.addEventListener('DOMContentLoaded', init);",
    "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__pdfRealReady = true; });")
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/, '')
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/, '')
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/, '');

function makeSyntheticPdf() {
  const drawing = [
    '0.98 0.98 0.98 rg 0 0 595 842 re f',
    '0 0 0 rg BT /F1 22 Tf 46 750 Td (PDF.js vector sharpness regression) Tj ET',
    '0 0 0 RG 2 w 46 720 m 549 720 l S',
    '0 0 0 rg BT /F1 13 Tf 46 680 Td (All zoom levels must repaint from PDF bytes.) Tj ET',
    ''
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(drawing, 'ascii') + ' >>\nstream\n' + drawing + 'endstream',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, 'ascii'));
    out += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xrefOffset = Buffer.byteLength(out, 'ascii');
  out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) out += String(offset).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
  return Buffer.from(out, 'ascii');
}

const fixtures = [{ key: 'synthetic', sourceType: '교재', pageToken: 'QA:1', bytes: makeSyntheticPdf() }];
const optionalDirectory = process.env.PDF_QA_FIXTURES_DIR;
if (optionalDirectory) {
  for (const [key, name, sourceType, pageToken] of [
    ['textbook', 'MG_0187.pdf', '교재', 'MG:187'],
    ['subnote', 'SW_0010.pdf', '서브노트', 'SW:10'],
    ['subnote-sw12', 'SW_0012.pdf', '서브노트', 'SW:12']
  ]) {
    const file = path.join(optionalDirectory, name);
    assert(fs.existsSync(file), 'Private PDF fixture missing: ' + name);
    const bytes = fs.readFileSync(file);
    assert(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')), 'PDF fixture invalid: ' + name);
    fixtures.push({ key, sourceType, pageToken, bytes });
  }
}

const fixtureByKey = new Map(fixtures.map(f => [f.key, f]));
function serve(res, body, type) {
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
const server = http.createServer((req, res) => {
  if (req.url === '/') return serve(res, html, 'text/html; charset=utf-8');
  if (req.url === '/pdf.min.js') return serve(res, pdfjs, 'text/javascript');
  if (req.url === '/pdf.worker.min.js') return serve(res, worker, 'text/javascript');
  if (req.url?.startsWith('/fixture/')) {
    const fixture = fixtureByKey.get(req.url.substring('/fixture/'.length));
    if (fixture) return serve(res, fixture.bytes, 'application/pdf');
  }
  res.writeHead(404);
  res.end('Local PDF QA fixture not found');
});

async function verify(browser, fixture, device) {
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const errors = [];
  try {
    await page.setViewport({
      width: device.width, height: device.height, deviceScaleFactor: device.dpr
    });
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(origin) ? req.continue() : req.abort());
    page.on('pageerror', err => errors.push(String(err)));
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__pdfRealReady === true, { timeout: 15000 });
    await page.addScriptTag({ url: origin + '/pdf.min.js' });

    const result = await page.evaluate(async ({ key, sourceType, pageToken }) => {
      if (window.pdfjsLib?.version !== '3.11.174') throw new Error('Wrong PDF.js version');
      const record = { sourceType, pageToken, driveFileId: 'local-fixture-marker' };
      const wrap = els.referencePdfFrameWrap;
      const modal = els.referencePdfViewerModal;
      modal.classList.remove('hidden');
      activeReferencePdfSourceType = sourceType;
      activeReferencePdfCurrentPage = record;
      activeReferencePdfZoomFactor = 1;
      activeReferencePdfFitScale = 1;
      activeReferencePdfVectorReady = false;
      referencePdfBackendSourceReady = true;
      referencePdfQualityPending = false;
      const serial = ++referencePdfLoadSerial;
      wrap.innerHTML = referencePdfViewerMarkup(record);
      const image = wrap.querySelector('.reference-pdf-preview-image');
      const preview = '<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842">' +
        '<rect width="595" height="842" fill="white"/></svg>';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(preview);
      });
      renderActiveReferencePdfImage({ preserveCenter: false, scheduleRender: false });

      const originalFetch = fetchReferencePdfBytesFromServer;
      const originalEnsure = ensurePdfJsLoaded;
      const originalToast = showToast;
      let readCount = 0;
      let toastCount = 0;
      fetchReferencePdfBytesFromServer = async () => {
        readCount++;
        const response = await fetch('/fixture/' + key);
        if (!response.ok) throw new Error('Offline fixture HTTP error');
        return new Uint8Array(await response.arrayBuffer());
      };
      ensurePdfJsLoaded = async () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = location.origin + '/pdf.worker.min.js';
        return window.pdfjsLib;
      };
      showToast = () => { toastCount++; };

      const snapshot = () => {
        const canvas = wrap.querySelector('.reference-pdf-vector-canvas');
        const scroller = wrap.querySelector('.reference-pdf-pan-scroller');
        const rect = canvas.getBoundingClientRect();
        const scRect = scroller.getBoundingClientRect();
        return {
          renderWidth: canvas.width, renderHeight: canvas.height,
          displayWidth: rect.width, displayHeight: rect.height,
          scrollerWidth: scroller.clientWidth, scrollLeft: scroller.scrollLeft,
          viewportLeft: scRect.left, viewportRight: scRect.right,
          mediaLeft: rect.left, mediaRight: rect.right,
          zoom: activeReferencePdfZoomFactor,
          vectorVisible: getComputedStyle(canvas).display === 'block',
          previewHidden: getComputedStyle(image).display === 'none',
          vectorReady: activeReferencePdfVectorReady,
          sourceStatus: document.getElementById('referencePdfSourceStatus')?.textContent,
        };
      };
      try {
        await loadReferencePdfHighQuality(record, serial);
        const first = snapshot();
        const canvas = wrap.querySelector('.reference-pdf-vector-canvas');
        const sampleWidth = Math.min(1100, canvas.width);
        const sampleHeight = Math.min(1100, canvas.height);
        const pixels = canvas.getContext('2d').getImageData(0, 0, sampleWidth, sampleHeight).data;
        let nonwhite = 0;
        for (let i = 0; i < pixels.length; i += 80) {
          if (pixels[i] < 220 || pixels[i + 1] < 220 || pixels[i + 2] < 220) nonwhite++;
        }
        setReferencePdfZoomFactor(2.75);
        await repaintReferencePdfAtZoom({ immediate: true, loadSerial: serial });
        const at275 = snapshot();
        setReferencePdfZoomFactor(4);
        await repaintReferencePdfAtZoom({ immediate: true, loadSerial: serial });
        const at400 = snapshot();
        setReferencePdfZoomFactor(1);
        await repaintReferencePdfAtZoom({ immediate: true, loadSerial: serial });
        const back = snapshot();
        return { first, at275, at400, back, nonwhite, readCount, toastCount };
      } finally {
        fetchReferencePdfBytesFromServer = originalFetch;
        ensurePdfJsLoaded = originalEnsure;
        showToast = originalToast;
        referencePdfLoadSerial++;
        resetReferencePdfHighQualityRenderer();
        activeReferencePdfCurrentPage = null;
        modal.classList.add('hidden');
      }
    }, { key: fixture.key, sourceType: fixture.sourceType, pageToken: fixture.pageToken });

    const label = fixture.key + '/' + device.label;
    const { first, at275, at400, back } = result;
    assert(first.vectorReady && first.vectorVisible && first.previewHidden, label + ' first paint missing');
    assert.equal(first.sourceStatus, '원본 PDF.js', label + ' status falsely claims a preview');
    assert(first.renderWidth >= first.scrollerWidth - 40, label + ' not sharp at width-fit');
    assert(Math.abs(first.displayWidth - first.scrollerWidth) < 40, label + ' not width-fit');
    assert(first.mediaLeft >= first.viewportLeft - 4 && first.mediaRight <= first.viewportRight + 4,
      label + ' width-fit page clipped');
    assert.equal(Math.round(first.scrollLeft), 0, label + ' fit scroll not zero');
    assert(result.nonwhite > 0, label + ' rendered canvas is blank');
    assert.equal(result.readCount, 1, label + ' fetched PDF more than once');
    assert.equal(result.toastCount, 0, label + ' unexpected error toast');
    assert.equal(at275.zoom, 2.75, label + ' 275% zoom not applied');
    assert(at275.renderWidth > first.renderWidth * 1.4, label + ' 275% no high-res rerender');
    assert.equal(at400.zoom, 4, label + ' 400% zoom not applied');
    assert(at400.displayWidth > at275.displayWidth * 1.3, label + ' 400% not enlarged');
    assert(at400.renderWidth >= at275.renderWidth - 4, label + ' 400% bitmap shrank');
    assert.equal(back.zoom, 1, label + ' fit zoom not restored');
    assert(Math.abs(back.displayWidth - first.displayWidth) < 3, label + ' width-fit not restored');
    assert.equal(Math.round(back.scrollLeft), 0, label + ' fit scroller not reset');
    assert.deepEqual(errors, [], label + ' uncaught browser error');
    console.log('REAL_PDFJS_BROWSER_PASS', label, JSON.stringify({
      first: [first.renderWidth, first.renderHeight],
      at275: [at275.renderWidth, at275.renderHeight],
      at400: [at400.renderWidth, at400.renderHeight],
      back: [back.renderWidth, back.renderHeight],
      nonwhite: result.nonwhite
    }));
  } finally {
    await page.close();
  }
}

async function verifyAttachment(browser, fixture, device) {
  const page = await browser.newPage();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const errors = [];
  try {
    await page.setViewport({ width: device.width, height: device.height, deviceScaleFactor: device.dpr });
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(origin) ? req.continue() : req.abort());
    page.on('pageerror', err => errors.push(String(err)));
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__pdfRealReady === true, { timeout: 15000 });
    await page.addScriptTag({ url: origin + '/pdf.min.js' });

    const result = await page.evaluate(async key => {
      els.mediaViewerModal.classList.remove('hidden');
      let reads = 0;
      const originalFetch = fetchMediaContent;
      const originalEnsure = ensurePdfJsLoaded;
      fetchMediaContent = async () => {
        reads++;
        const response = await fetch('/fixture/' + key);
        if (!response.ok) throw new Error('Attachment fixture HTTP error');
        const buffer = await response.arrayBuffer();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(new Blob([buffer], { type: 'application/pdf' }));
        });
        return { base64 };
      };
      ensurePdfJsLoaded = async () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = location.origin + '/pdf.worker.min.js';
        return window.pdfjsLib;
      };
      const snapshot = () => {
        const canvas = els.mediaViewerBody.querySelector('.attachment-pdf-canvas');
        const scroller = els.mediaViewerBody.querySelector('.attachment-pdf-pan-scroller');
        if (!canvas || !scroller) return null;
        return {
          width: canvas.width, height: canvas.height, zoom: activeAttachmentPdfZoomFactor,
          cssWidth: canvas.getBoundingClientRect().width,
          scrollerWidth: scroller.clientWidth, scrollLeft: scroller.scrollLeft,
          pageReady: !!activeAttachmentPdfPage,
        };
      };
      try {
        renderPdfViewer([{ attachmentId: 'local-attachment', fileName: 'fixture.pdf' }]);
        await new Promise((resolve, reject) => {
          const started = Date.now();
          const check = () => {
            const state = snapshot();
            // An HTML canvas starts at 300x150 before PDF.js paints; wait for actual pixels.
            if (state?.pageReady && state.width > 350 && state.height > 350 &&
                !activeAttachmentPdfRenderTask) return resolve();
            if (Date.now() - started > 20000) return reject(new Error('Attachment first render timeout'));
            setTimeout(check, 60);
          };
          check();
        });
        const first = snapshot();
        setAttachmentPdfZoomFactor(2.75);
        await repaintAttachmentPdfAtZoom({ immediate: true, loadSerial: attachmentPdfLoadSerial });
        const at275 = snapshot();
        setAttachmentPdfZoomFactor(4);
        await repaintAttachmentPdfAtZoom({ immediate: true, loadSerial: attachmentPdfLoadSerial });
        const at400 = snapshot();
        setAttachmentPdfZoomFactor(1);
        await repaintAttachmentPdfAtZoom({ immediate: true, loadSerial: attachmentPdfLoadSerial });
        const back = snapshot();
        return { first, at275, at400, back, reads };
      } finally {
        fetchMediaContent = originalFetch;
        ensurePdfJsLoaded = originalEnsure;
        attachmentPdfLoadSerial++;
        els.mediaViewerModal.classList.add('hidden');
      }
    }, fixture.key);

    const label = fixture.key + '/' + device.label;
    const { first, at275, at400, back } = result;
    assert.equal(result.reads, 1, label + ' attachment fetched more than once');
    assert(first.pageReady && first.width > 0, label + ' attachment first PDF.js canvas missing');
    assert(Math.abs(first.cssWidth - first.scrollerWidth) <= 40, label + ' attachment width fit failed');
    assert.equal(at275.zoom, 2.75, label + ' attachment 275% zoom missing');
    assert(at275.width > first.width * 1.4, label + ' attachment 275% did not rerender: ' + JSON.stringify({ first, at275 }));
    assert.equal(at400.zoom, 4, label + ' attachment 400% zoom missing');
    assert(at400.cssWidth > at275.cssWidth * 1.3, label + ' attachment 400% not enlarged');
    assert(at400.width >= at275.width - 4, label + ' attachment 400% bitmap shrank');
    assert.equal(back.zoom, 1, label + ' attachment fit zoom not restored');
    assert(Math.abs(back.cssWidth - first.cssWidth) < 3, label + ' attachment fit width not restored');
    assert.deepEqual(errors, [], label + ' attachment browser errors');
    console.log('REAL_ATTACHMENT_PDFJS_BROWSER_PASS', label, JSON.stringify({
      first: [first.width, first.height],
      at275: [at275.width, at275.height],
      at400: [at400.width, at400.height],
      back: [back.width, back.height],
    }));
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-extensions']
    });
    const desktop = { label: 'desktop', width: 1280, height: 900, dpr: 1 };
    const tablet = { label: 'tablet', width: 820, height: 1024, dpr: 2 };
    const phone = { label: 'phone', width: 390, height: 844, dpr: 2 };
    for (const fixture of fixtures) {
      const devices = fixture.key === 'synthetic' ? [desktop, tablet, phone]
        : fixture.key === 'subnote-sw12' ? [desktop, tablet] : [desktop];
      for (const device of devices) await verify(browser, fixture, device);
      // This exercises the separate attachment-PDF viewer with the same real
      // PDF.js engine and local bytes, without using the production media API.
      for (const device of devices) await verifyAttachment(browser, fixture, device);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => { console.error('REAL_PDFJS_BROWSER_FAIL', err); process.exitCode = 1; });
