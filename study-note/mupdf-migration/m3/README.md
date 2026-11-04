# M3 — isolated MuPDF.js / PDF.js rendering adapters

**Status:** non-production only. No existing learning notebook viewer or Apps Script updated.
**Distribution:** MuPDF JS/WASM is private and gitignored until AGPL legal approval.

## API
- `createMuPDFEngine({module, moduleURL, budget}).openDocument(Uint8Array)`
- `createPdfJsEngine({module, moduleURL, canvasFactory, budget}).openDocument(Uint8Array)`
- `createMuPDFWorkerEngine({moduleURL,budget}).openDocument(Uint8Array)`
- `createUnifiedRenderer({mupdf,pdfjs,prefer,allowFallback}).openDocument(Uint8Array)`

Each session provides page count, page metadata, `renderPage(pageNumber,{scale,dpr,region,budget,signal})`, and `close()`. PDF.js metadata is async; MuPDF metadata may be sync. Use `await` for both. Existing annotation schema 3 and normalized-0-1 are untouched.

Return `pixels` is a **COPY** of RGBA bytes, not a WASM heap view; return includes `width,height,fullWidth,fullHeight,x,y,scale,budgetLimited,engine`. `region` is a normalized rectangle for partial/tiled render; annotate with `normalizedToPixel` and `pixelToNormalized` from m3-common.

Cancellation: direct MuPDF checks AbortSignal before and after synchronous WASM work; module Worker mode permits terminating active render and safely reopening the PDF for another page. PDF.js render task calls cancel(). No persistent PDF bytes, signed URLs or user data are cached.

## Exact dependencies
- MuPDF official npm 1.28.1 from M2, integrity protected by M2 asset lock. Never check in the JS/WASM.
- PDF.js secure fallback npm `pdfjs-dist@6.5.438` pinned in M3 lock (Apache-2.0). M3 `isEvalSupported:false` remains explicit. Legacy 3.11.174 in operating HTML is UNCHANGED (CVE-2024-4367 still relevant in production).
- pdf-lib 1.17.1 synthetic fixture generator only; @napi-rs/canvas 1.1.0 Node-only raster test; Playwright 1.64.1 private Chrome browser test.

## Reproduction on isolated Windows
1. In M2: `npm ci --ignore-scripts --no-audit --no-fund`; `node m2-stage-assets.cjs`; `node m2-verify-assets.cjs`.
2. In M3: `npm ci --ignore-scripts --no-audit --no-fund`.
3. `node --test tests/*.test.mjs` (Windows cmd: `node --test tests\\*.test.mjs`).
4. `npm audit --omit=dev --audit-level=moderate`.
5. On an authorized PC with Chrome installed: `node tests/browser-smoke.mjs`. Uses only loopback 127.0.0.1 ephemeral port; launches an independent headless Chrome instance, closes browser and server at end.
6. Optional: `node tests/benchmark.mjs` for synthetic one-process performance samples.

Private browser screenshot: repository-root `.m3-private/browser-m3-chrome.png` (gitignored; never publish as an artifact). Fixture PDF generated entirely in memory. All source JS stays in the private working branch, but proprietary/user PDFs and MuPDF binaries are excluded.

## Module layout
- `m3-common.mjs`: bounds/budget/coordinate conversion/Canvas RGBA.
- `m3-mupdf.mjs`: native Document/Page/Pixmap, rotate/CropBox, region DrawDevice, lifecycle.
- `m3-pdfjs.mjs`: new patched PDF.js version and raster fallback.
- `m3-engine.mjs`: common orchestration with explicit engine switch and failure reason.
- `m3-worker-client.mjs`, `m3-worker.mjs`: browser module Worker, transferable RGBA and abort recovery.
- `tests/renderer.test.mjs`, `routing-worker.test.mjs`: synthetic tests (16).
- `tests/harness.html`, `browser-smoke.mjs`: real browser private side-by-side view.

## Known limitations / M4-M7
- No operating `study-note.html` rendering switch. M4/M5 will integrate with signed original PDF API and existing canvas overlays.
- No Google Sheets LIVE MASTER, user images, PDF or annotation writes.
- No actual Samsung S Pen, iPhone Safari, or real production PDF compatibility testing in this M3; device acceptance is M6/M7.
- Worker cancellation destroys and recreates the Worker; WASM reload overhead needs tuning.
- Large zoom is bounded to protect memory; M4/M6 should use visible region tile scheduling for crisp UX.
- Release remains blocked by AGPL/Apps Script coupling and complete WASM Corresponding Source review. See M2 release gate. No public MuPDF binary or output previews.
