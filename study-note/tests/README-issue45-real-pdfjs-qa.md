# Issue #45: actual PDF.js Canvas browser regression

This is an **additional QA harness**, not an Apps Script endpoint and not a replacement for the existing tests.

## What it covers

- The production reference-PDF viewer markup, `loadReferencePdfHighQuality()`, `repaintReferencePdfAtZoom()`, and width-fit/zoom controls.
- The separate production attachment-PDF viewer (`renderPdfViewer()`, `loadAttachmentPdfPage()`, `repaintAttachmentPdfAtZoom()`) with a local fixture replacing only the server media response.
- The **real PDF.js 3.11.174 renderer and worker** (not a mocked `page.render()`).
- A generated, nonsensitive, one-page vector/text PDF in CI, tested at desktop/tablet/phone viewport sizes.
- At 100%, 275%, and 400%: Canvas output pixels, PDF content present, width fit, no left/right clipping when fitted, and fit restoration.
- If `PDF_QA_FIXTURES_DIR` is provided, also opens local copies of the registered `MG_0187.pdf` and `SW_0010.pdf` in the desktop-size browser using actual PDF.js. **Never commit, upload, or log the PDF bytes.**

## Setup

The existing GitHub Actions browser job installs Puppeteer and fetches the pinned PDF.js assets. It checks both assets' SHA-256 digests before running this test.

Local preconditions:
1. Chrome installed, Puppeteer at `.qa-browser/node_modules/puppeteer-core`.
2. Pinned files `.qa-browser/pdfjs/pdf.min.js` and `.qa-browser/pdfjs/pdf.worker.min.js`, exact PDF.js version `3.11.174`.
3. Execute `node study-note/tests/test_reference_pdf_real_pdfjs_browser_qa.cjs` from the repository root; set `CHROME_BIN` if Chrome is not found at `/usr/bin/google-chrome`.

Optional Windows PowerShell for **private local fixtures only**:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PDF_QA_FIXTURES_DIR = 'E:\private\pdf-qa'
node study-note/tests/test_reference_pdf_real_pdfjs_browser_qa.cjs
```

The optional directory must contain local **authorized copies** of `MG_0187.pdf` and `SW_0010.pdf`; no public links, browser-supplied Drive file IDs, or user authentication secrets are used. The test binds only to `127.0.0.1` and rejects all outside requests.

## Strict limitations

This browser harness intentionally stubs **only the incoming server bytes and PDF.js bundle loader**, so it can test the existing viewer with actual PDF bytes. It does **not** establish:
- Whether the deployed Apps Script has a signed `referencePdfContent` route or `referencePdfContentReady: true`.
- ACTIVE/PENDING/REVOKED, HMAC, TTL, nonce, session validity, CORS, or actual API response compatibility.
- The production attachment-PDF `mediaContent` route, real device touch/stylus input, saved user annotation coordinates, or Adobe Reader visual parity.

Those must be verified against the actual deployed Apps Script source and an isolated staging environment before requesting operating `main` merge or deployment approval. **Issue #45 must remain open** until that integration is verified. No real PDF or content should be uploaded as a CI artifact.
