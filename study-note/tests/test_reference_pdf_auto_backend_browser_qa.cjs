'use strict';
// Headless Chromium integration test for automatic native high-resolution PDF preview.
// Uses ONLY synthetic PDF signatures and a fake PDF.js renderer. Never uses Google
// Drive IDs, real OAuth credentials, or the production Apps Script server.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../../.qa-browser/node_modules/puppeteer-core');

const original = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const html = original
  .replace("window.addEventListener('DOMContentLoaded', init);",
    "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__autoPdfReady = true; });")
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/, '')
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/, '')
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/, '');

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } else { res.writeHead(404); res.end('Synthetic browser QA only'); }
});

async function check(browser, width, height, label) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: label === 'desktop' ? 1 : 2 });
  const url = 'http://127.0.0.1:' + server.address().port;
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(url) ? req.continue() : req.abort());
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__autoPdfReady === true, { timeout: 15000 });
    const result = await page.evaluate(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const wrap = els.referencePdfFrameWrap;
      const modal = els.referencePdfViewerModal;
      modal.classList.remove('hidden');
      const record = { sourceType: '서브노트', pageToken: 'SW:10', driveFileId: 'synthetic-id-only' };
      activeReferencePdfSourceType = record.sourceType;
      activeReferencePdfCurrentPage = record;
      activeReferencePdfZoomFactor = 1;
      activeReferencePdfFitScale = 1;
      activeReferencePdfVectorReady = false;
      referencePdfBackendSourceReady = false;
      referencePdfQualityPending = false;
      referencePdfLoadSerial = 4;
      wrap.innerHTML = referencePdfViewerMarkup(record);
      const scroller = wrap.querySelector('.reference-pdf-pan-scroller');
      const image = wrap.querySelector('.reference-pdf-preview-image');
      const vector = wrap.querySelector('.reference-pdf-vector-canvas');
      const fakeImage = '<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842"><rect width="595" height="842" fill="white"/></svg>';
      await new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = reject;
        image.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(fakeImage);
      });
      renderActiveReferencePdfImage({ preserveCenter: false });
      await nextPaint();

      let sourceReads = 0, renderWidths = [], notices = [];
      const fakePdfPage = {
        getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }),
        render: ({ canvasContext, viewport }) => {
          renderWidths.push(viewport.width);
          canvasContext.fillStyle = '#fff';
          canvasContext.fillRect(0, 0, viewport.width, viewport.height);
          return { promise: Promise.resolve(), cancel() {} };
        },
      };
      // Preserve and restore every stub after this single isolated fixture.
      const previousFetch = fetchReferencePdfBytesFromServer;
      const previousPdf = ensurePdfJsLoaded;
      const previousToast = showToast;
      try {
        fetchReferencePdfBytesFromServer = async () => {
          sourceReads++;
          return Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 52]);
        };
        ensurePdfJsLoaded = async () => ({
          getDocument: ({ data }) => {
            if (data?.length !== 8) throw new Error('Unexpected synthetic PDF data');
            return { promise: Promise.resolve({
              getPage: async pageNumber => {
                if (pageNumber !== 1) throw new Error('Only a one-page PDF should be read');
                return fakePdfPage;
              },
              destroy: async () => {},
            }) };
          },
        });
        showToast = text => { notices.push(String(text)); };

        // Capability false: no original PDF fetch and existing preview stays visible.
        await loadReferencePdfHighQuality(record, 4);
        const ignoredWithoutServer = sourceReads === 0
          && getComputedStyle(image).display !== 'none'
          && getComputedStyle(vector).display === 'none';

        // Capability true: original PDF bytes pass to the SAME viewer's PDF.js canvas.
        referencePdfBackendSourceReady = true;
        await loadReferencePdfHighQuality(record, 4);
        await nextPaint();
        const first = {
          vectorReady: activeReferencePdfVectorReady,
          imageDisplay: getComputedStyle(image).display,
          vectorDisplay: getComputedStyle(vector).display,
          fitWidth: vector.getBoundingClientRect().width,
          scrollWidth: scroller.clientWidth,
          scrollLeft: scroller.scrollLeft,
          renderWidth: renderWidths.at(-1),
        };

        setReferencePdfZoomFactor(2.75);
        await wait(550);
        await nextPaint();
        const zoom = {
          zoom: activeReferencePdfZoomFactor,
          displayedWidth: vector.getBoundingClientRect().width,
          renderWidth: renderWidths.at(-1),
          renderCount: renderWidths.length,
        };
        activeReferencePdfZoomFactor = 1;
        renderActiveReferencePdfImage({ preserveCenter: false });
        await wait(550);
        await nextPaint();
        const fitAgain = {
          fitWidth: vector.getBoundingClientRect().width,
          scrollWidth: scroller.clientWidth,
          scrollLeft: scroller.scrollLeft,
          vectorDisplay: getComputedStyle(vector).display,
        };

        // Subsequent failure must preserve the thumbnail rather than black out the view.
        referencePdfLoadSerial++;
        resetReferencePdfHighQualityRenderer();
        activeReferencePdfCurrentPage = { ...record, pageToken: 'SW:11' };
        wrap.innerHTML = referencePdfViewerMarkup(activeReferencePdfCurrentPage);
        const fallbackImage = wrap.querySelector('.reference-pdf-preview-image');
        await new Promise((resolve, reject) => {
          fallbackImage.onload = resolve; fallbackImage.onerror = reject;
          fallbackImage.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(fakeImage);
        });
        renderActiveReferencePdfImage({ preserveCenter: false });
        await nextPaint();
        referencePdfBackendSourceReady = true;
        fetchReferencePdfBytesFromServer = async () => {
          sourceReads++;
          throw new Error('synthetic server error');
        };
        await loadReferencePdfHighQuality(activeReferencePdfCurrentPage, referencePdfLoadSerial);
        const fallback = {
          imageDisplay: getComputedStyle(fallbackImage).display,
          vectorDisplay: getComputedStyle(wrap.querySelector('.reference-pdf-vector-canvas')).display,
          sourceReady: referencePdfBackendSourceReady,
          notes: notices.length,
          fileToken: activeReferencePdfCurrentPage.pageToken,
        };
        return { ignoredWithoutServer, first, zoom, fitAgain, fallback, sourceReads };
      } finally {
        fetchReferencePdfBytesFromServer = previousFetch;
        ensurePdfJsLoaded = previousPdf;
        showToast = previousToast;
        referencePdfLoadSerial++;
        resetReferencePdfHighQualityRenderer();
        activeReferencePdfCurrentPage = null;
        modal.classList.add('hidden');
      }
    });

    assert.equal(result.ignoredWithoutServer, true, label + ': unsupported server must keep thumbnail');
    assert.equal(result.first.vectorReady, true, label + ': original high-res must become active');
    assert.equal(result.first.imageDisplay, 'none', label + ': thumbnail must disappear after first paint');
    assert.equal(result.first.vectorDisplay, 'block', label + ': PDF.js canvas must be visible');
    assert(Math.abs(result.first.fitWidth - result.first.scrollWidth) <= 32,
      label + ': first high-res view should fit viewer width: ' + JSON.stringify(result.first));
    assert.equal(Math.round(result.first.scrollLeft), 0, label + ': fit left edge must not crop');
    assert.equal(result.zoom.zoom, 2.75, label + ': zoom factor changed unexpectedly');
    assert(result.zoom.displayedWidth > result.first.fitWidth * 2,
      label + ': zoom did not enlarge PDF');
    assert(result.zoom.renderWidth > result.first.renderWidth * 2,
      label + ': PDF.js must rerender with more pixels after zoom');
    assert.equal(result.fitAgain.vectorDisplay, 'block');
    assert(Math.abs(result.fitAgain.fitWidth - result.fitAgain.scrollWidth) <= 32,
      label + ': fit button should return to width fit');
    assert.equal(Math.round(result.fitAgain.scrollLeft), 0);
    assert.equal(result.fallback.imageDisplay, 'block', label + ': fallback thumbnail must remain');
    assert.equal(result.fallback.vectorDisplay, 'none', label + ': failed PDF.js canvas should stay hidden');
    assert.equal(result.fallback.sourceReady, false, label + ': broken server should not be automatically retried');
    assert(result.fallback.notes >= 1, label + ': load failure should be reported once');
    assert.equal(result.sourceReads, 2, label + ': expected one success and one explicit failure read');
    assert.deepEqual(errors, [], label + ': uncaught page errors');
    console.log('PDF_AUTO_BACKEND_BROWSER_PASS ' + label + ' ' + JSON.stringify(result));
  } finally { await page.close(); }
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-extensions'],
    });
    await check(browser, 1280, 900, 'desktop');
    await check(browser, 820, 1024, 'tablet');
    await check(browser, 390, 844, 'phone');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error('PDF_AUTO_BACKEND_BROWSER_FAIL', error); process.exitCode = 1; });
