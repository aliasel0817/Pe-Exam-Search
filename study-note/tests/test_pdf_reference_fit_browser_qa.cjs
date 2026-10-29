'use strict';
// Synthetic browser regression for a first-open PDF thumbnail and PDF.js canvas.
// No production data, OAuth tokens, or Google Drive requests.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('../../.qa-browser/node_modules/puppeteer-core');
const raw = fs.readFileSync(path.resolve(__dirname, '../study-note.html'), 'utf8');
const html = raw.replace("window.addEventListener('DOMContentLoaded', init);",
  "window.addEventListener('DOMContentLoaded', () => { bindElements(); window.__pdfFitReady = true; });")
  .replace(/<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/, '')
  .replace(/<script src="\.\/tts\/natural-tts\.js\?v=[^"]+"><\/script>/, '')
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">/, '');
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } else { response.writeHead(404); response.end('Offline QA'); }
});

async function verify(browser, width, height, label) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: label === 'desktop' ? 1 : 2 });
  const port = server.address().port;
  const origin = 'http://127.0.0.1:' + port;
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(origin) ? req.continue() : req.abort());
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  try {
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__pdfFitReady === true, { timeout: 15000 });
    const result = await page.evaluate(async () => {
      activeReferencePdfSourceType = '교재';
      activeReferencePdfCurrentPage = { pageToken: 'MG:187', driveFileId: 'local-synthetic' };
      activeReferencePdfZoomFactor = 1;
      activeReferencePdfVectorReady = false;
      els.referencePdfViewerModal.classList.remove('hidden');
      els.referencePdfFrameWrap.innerHTML = referencePdfViewerMarkup(activeReferencePdfCurrentPage);
      const scroller = els.referencePdfFrameWrap.querySelector('.reference-pdf-pan-scroller');
      const stage = els.referencePdfFrameWrap.querySelector('.reference-pdf-image-stage');
      const image = stage.querySelector('.reference-pdf-preview-image');
      const canvas = stage.querySelector('.reference-pdf-vector-canvas');
      const source = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="white"/><text x="12" y="50" font-size="40">Synthetic PDF Page</text></svg>';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(source);
      });
      const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const measure = () => {
        const rr = scroller.getBoundingClientRect();
        const media = stage.querySelector('.reference-pdf-vector-canvas.is-rendered') || image;
        const mr = media.getBoundingClientRect();
        return {
          scrollerWidth: scroller.clientWidth, imageWidth: mr.width,
          left: mr.left, right: mr.right, viewportLeft: rr.left, viewportRight: rr.right,
          scrollLeft: scroller.scrollLeft, mediaVisible: getComputedStyle(media).display !== 'none',
          imageDisplay: getComputedStyle(image).display, canvasDisplay: getComputedStyle(canvas).display,
          zoom: activeReferencePdfZoomFactor,
        };
      };
      renderActiveReferencePdfImage({ preserveCenter: false, scheduleRender: false });
      await tick();
      const first = measure();
      setReferencePdfZoomFactor(2.75);
      await tick();
      const zoom = measure();
      activeReferencePdfZoomFactor = 1;
      renderActiveReferencePdfImage({ preserveCenter: false, scheduleRender: false });
      await tick();
      const fitAgain = measure();
      destroyAnnotationSurfacesWithin(stage);
      activeReferencePdfPage = { getViewport: ({ scale }) => ({ width: 1200 * scale, height: 1600 * scale }) };
      canvas.width = 1200; canvas.height = 1600;
      image.classList.add('pdf-replaced');
      canvas.classList.add('is-rendered');
      activeReferencePdfVectorReady = true;
      renderActiveReferencePdfImage({ preserveCenter: false, scheduleRender: false });
      await tick();
      const vector = measure();
      activeReferencePdfVectorReady = false;
      activeReferencePdfPage = null;
      return { first, zoom, fitAgain, vector };
    });
    const epsilon = 3;
    function checkFit(state, step) {
      assert.equal(state.zoom, 1, label + ' ' + step + ' zoom default');
      assert(state.mediaVisible, label + ' ' + step + ' PDF media hidden');
      assert(state.scrollerWidth > 130, label + ' ' + step + ' scroller invisible');
      assert(state.imageWidth >= state.scrollerWidth - 32, label + ' ' + step + ' not width-fit: ' + JSON.stringify(state));
      assert(state.left >= state.viewportLeft - epsilon, label + ' ' + step + ' left cropped: ' + JSON.stringify(state));
      assert(state.right <= state.viewportRight + epsilon, label + ' ' + step + ' right outside: ' + JSON.stringify(state));
      assert.equal(Math.round(state.scrollLeft), 0, label + ' ' + step + ' horizontal scroll not reset');
    }
    checkFit(result.first, 'first');
    assert.equal(result.first.canvasDisplay, 'none', label + ' canvas must not take flex space before PDF.js paint');
    assert.equal(result.first.imageDisplay, 'block', label + ' preview should remain visible');
    assert(result.zoom.zoom > 2, label + ' zoom button failed');
    assert(result.zoom.imageWidth > result.first.imageWidth * 2, label + ' zoom pixels unchanged');
    checkFit(result.fitAgain, 'fit again');
    checkFit(result.vector, 'vector');
    assert.equal(result.vector.imageDisplay, 'none', label + ' thumbnail not replaced');
    assert.equal(result.vector.canvasDisplay, 'block', label + ' vector canvas not visible');
    assert.deepEqual(pageErrors, [], label + ' unexpected JavaScript errors');
    console.log('PDF_REFERENCE_FIT_BROWSER_PASS', label, JSON.stringify(result));
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
    await verify(browser, 1280, 900, 'desktop');
    await verify(browser, 820, 1024, 'tablet');
    await verify(browser, 390, 844, 'phone');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error('PDF_REFERENCE_FIT_BROWSER_FAIL', error); process.exitCode = 1; });
