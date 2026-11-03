# M4 — Loopback-only MuPDF reference PDF viewer integration

**Scope:** 기존 학습노트 `study-note/study-note.html` 안의 서브노트·교재 `referencePdf` 경로만 MuPDF.js에 연결. 첨부 PDF 뷰어와 현재 운영 PDF.js는 그대로 둔다.

## Private activation / legal block
- **Default OFF.** `M4_REFERENCE_DEV_ENABLED` requires `http://127.0.0.1:<port>/study-note/study-note.html?m4-local=1` or `http://localhost:...`.
- Production GitHub Pages or any non-loopback host cannot load the new M4 engine. No public staging/previews and no live server mutation.
- On loopback the trusted same-origin vendor routes are `/__m4_private__/mupdf/{mupdf.js,mupdf-wasm.js,mupdf-wasm.wasm}` and `/__m4_private__/pdfjs/{pdf.mjs,pdf.worker.mjs}`. They are served by the dedicated **loopback-only synthetic test server** rather than committed to public Git.
- Source production API `fetchReferencePdfBytesFromServer` remains unchanged; ACTIVE security session, `buildSignedGetUrl(...,'referencePdfContent',...)`, 8MiB payload bound, source/pageToken matching and `cache:'no-store'` remain.
- M4 dispatches to the new engine **after** the existing signed GET, and uses `referencePdf`'s already-existing page ID, annotation overlay, zoom/pan/pinch input and persistence functions.
- No M2 license gate changes. Artifex AGPL corresponding source / Apps Script legal boundary still unresolved. Public distribution remains NO-GO until legally reviewed and approved.

## Implemented modules
- `m4-reference-adapter.mjs`: M3 common engine, MuPDF Worker primary / main thread when needed / secure PDF.js 6.5.438 fallback, crop/rotated bounds facade, preallocated base raster budget 36MiB, visible region tile budget 32MiB, cancellation/close and render engine identification.
- `study-note.html` M4 changes: guard, *read-only* signed GET integration, first-load high-DPI painting, thumbnail→MuPDF switch, previous-fit annotation Surface preservation, tile scheduling on scroll and zoom, stale job abort, cleanup on page/close.
- `.m4-reference-detail-tile` z-index 2; existing `.annotation-canvas` z-index 3 and coordinates `normalized-0-1` are unchanged.
- `window.__M4_REFERENCE_QA__`: **only in explicitly opted-in loopback mode**, accepts generated PDF bytes to exercise the **real study-note viewer DOM** without touching Apps Script or Google Drive; no modification API.
- `tests/m4.test.mjs`: 7 targeted source-preservation, opt-in safety, engine facade and private binary tests.
- `tests/browser-smoke.mjs`: actual Windows Chrome 156, full study-note HTML, synthetic PDF, real sourceType 서브노트/교재, 2nd page navigation, rotated CropBox, fit and 3x zoom detail tile, annotation geometry, old view cleanup, forced PDF.js fallback, emulated touch pinch, no external network access.

## Reproduction — authorized isolated PC only
1. Clone **M4 feature branch** in its own directory; do not use another chat's worktree.
2. From `study-note/mupdf-migration/m2/`: `npm ci --ignore-scripts --no-audit --no-fund`, `node m2-stage-assets.cjs`, `node m2-verify-assets.cjs`.
3. From `study-note/mupdf-migration/m3/`: `npm ci --ignore-scripts --no-audit --no-fund`.
4. From `study-note/mupdf-migration/m4/`: `node --test tests/m4.test.mjs`.
5. Same M4 directory: `node tests/browser-smoke.mjs`; Chrome is launched with an independent profile, ephemeral `127.0.0.1` HTTP test server. All external URLs are blocked by Playwright. Synthetic output screenshot is in repo-root `.m4-private/`, which is gitignored.
6. M1/M2/M3 regression and security tests are reused by the M4 PR workflow. No deployment or binary uploads.

## Current isolated evidence (2026-11-03)
- Real Chrome v156.0.8078.49: sourceType 서브노트 page 1 & 2 `2008×2678px`; 교재 rotated/CropBox page `2008×1607px`; primary `mupdf-worker`.
- At 3x zoom: base pixels `2510×2008`, CSS display `3012×2410`, one new visible-region tile; overlay normalized coordinate roundtrip exact; annotation schema 3 retained.
- Forced PDF.js fallback shows `PDF.js 안전 복구` and renders sample successfully.
- Emulated Chrome `TouchEvent` 2-finger pinch zoom reaches `1.75`; **NOT real Galaxy Tab S11 or iPhone hardware test**.
- Loopback feature gate test on `?m4-local=0` leaves M4 unavailable.
- No JavaScript/page console errors in synthetic browser run; M4 Node tests 7/7 passed.
- **Not tested**: actual ACTIVE signed server GET from a real user device, real source PDF, server-side authorization behavior, S Pen hardware, iPhone Safari or Android/iOS memory endurance; these are follow-up gates (M6/M7).

## M4 boundaries
- Existing PDF.js 3.11.174 running on operating main remains untouched; known security risk is not yet mitigated in production.
- No GitHub Pages, main merge, Apps Script change/version/deploy, LIVE MASTER, Drive content, original PDFs, attachment blobs, or saved annotation edits.
- M5 handles **attachment PDF** view, not this PR.
- M6/M7 handle live hardware/operating acceptance with separate user approval and license resolution.
