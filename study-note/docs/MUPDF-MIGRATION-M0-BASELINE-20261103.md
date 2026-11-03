# MuPDF.js migration — M0 baseline and architecture (2026-11-03)

## Scope and status
Design-only checkpoint. No production deployment, no Apps Script modification, no LIVE MASTER writes, and no changes to PDF, image, attachment or annotation data. Design is conditionally approved as an engineering architecture, but AGPL/Apps Script legal compatibility and real-device acceptance remain M1/M3 gates.

## Verified baseline
- Repository: aliasel0817/Pe-Exam-Search
- main at inspection: e758fc3145add56f151ec4231927001c28a142b6 (2026-11-03 00:57:34 UTC)
- Pages deployment run 41556501435 success.
- One open PR, #8 (unrelated documentation); Issue #45 remains OPEN.
- study-note/study-note.html blob 1c3518ae7ad573f9846cc2ad33525bc3853e7959, app version 4.6.21-pdf-source-clarity.
- study-note/service-worker.js blob a0290738b2a29dc951bbe693008985d32f0ffb21.
- Local preexisting workspace on DESKTOP-5H5J4TU: E:\Professional_Engine\Download\Development\Pe-Exam-Search_issue45_20261102_chat, branch fix/issue45-pdf-fallback-consistency-20261102, HEAD 767c95b53507c5279f400d6976e70b9103e3ec9c, untracked .qa-browser and .issue45-private-realpdf-qa. These are not to be touched.
- Separate experiment directory: E:\Professional_Engine\Download\Development\Pe-Exam-Search_three_pdf_engines_20261103_chat, no Git metadata, SW12 comparison scripts/images. Preserve untouched.
- Apps Script v20 and postpush local source backups exist in dedicated issue45 directories; deployed v21 is documented in Issue #45, but current live deployment revision must be independently authenticated and reverified before M1.
- No migration code was installed or tested during M0.

## Current production code entry points (line numbers at baseline)
- PDF.js 3.11.174 loader and CDN: 4400, 14089-14113
- Reference PDF entry/page/nav: 8925, 9052, 13464
- Signed GET bytes/health: 13260-13328
- Reference PDF render: 13330-13428
- Attachment viewer: 14115-14355
- Mouse/touch/pinch: 12901, 13161
- Canvas size cap: 14257-14265, 8192 edge and 20 MiPixels
- Annotations: 9166-9296, 12745-12890, 3234-3635
- Annotation schema 3, coordinateSpace normalized-0-1, annotation canvas 2048 edge/4 MiPixels
- Service Worker: study-note/service-worker.js
- Server addon: study-note/backend/referencePdfContent.addon.gs

## Design decisions
1. Keep the original fetch/auth layer, signed ACTIVE-device GET, Google Sheets/Drive identities, and existing data schemas unchanged.
2. Keep all annotation, gesture, zoom and navigation controllers. Introduce an asynchronous document/page/render abstraction with methods open(bytes), countPages(), loadPage(pageNumber), bounds(page), render(page, transform, pixelBudget, abortSignal), close().
3. Use official ESM package `mupdf`, candidate pinned version 1.28.1, self-hosted JS+WASM with lockfile and checksums. Confirm exact distribution files and API under M1/M3. Never use deprecated `mupdf-js`.
4. Preserve PDF.js 3.11.174 as opt-in fallback/recovery with explicit actual engine status, not a misleading label. Avoid auto downgrade that masks bugs; record reason and telemetry without sensitive data.
5. First render visible page at fit; zoom schedules higher-resolution render. For very high zoom, plan viewport/tile bounded by memory and an adaptive pixel budget; maintain annotation overlay aligned with the CSS page rectangle. Confirm CropBox/rotation in M3.
6. Prefer dedicated module worker where supported; fallback to main-thread scheduled rendering if browsers or hosting constraints prohibit worker. Terminate workers, cancel stale jobs, destroy Pixmap/Page/Document, revoke temporary URLs on close.
7. Cache JS/WASM as versioned static application assets only. Do not cache authenticated PDF bytes or signed URLs in Service Worker, Cache Storage or persistent public caches.
8. Maintain public read endpoints where currently intended, but enforce owner-only create/update/delete server-side; client button hiding is not sufficient.
9. No user data, secret, script ID, private backup, PDF binary or production config in public Git history. Scan all branches and prior history before introducing source-publication links.

## AGPL gate
Artifex publicly states that its AGPL offering requires application full source publication for AGPL-covered deployment, including network services. GNU AGPLv3 section 13 and Corresponding Source rules apply. A public frontend repository alone does not establish that every integrated component is compliant. In M1, map what is linked/combined with MuPDF, assess the actual Apps Script coupling, decide legal status with counsel/Artifex if needed, inventory other licenses, confirm source/binary correspondence, license notices, source-access link, no-secret config structure. Stop before distribution if unable to comply; consider commercial license.

Official sources:
- https://artifex.com/licensing
- https://github.com/ArtifexSoftware/mupdf.js
- https://www.gnu.org/licenses/agpl-3.0.en.html
- https://mupdf.readthedocs.io/en/latest/reference/javascript/

## Module graph
M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7.
M4 and M5 can be developed in parallel on separate module branches after M3.
M6 requires both, and M7 integrates all. Every module branches off migration integration head into a separate working directory, PR targets integration, final M7 PR targets main, merges/deploys require separate owner approval.

## Estimated effort (engineering hours, excluding approval waiting)
M1 8-16, M2 6-12, M3 16-30, M4 10-18, M5 8-14, M6 16-30, M7 16-28 = total 80-148 engineering hours beyond M0. These are planning estimates, not elapsed-time commitments.

## Acceptance gates
- M1: publishability/security/legal determination documented; threat model and source inventory.
- M2: deterministic clean build, packaged licenses/source links, no secrets in output; source matches WASM checksum.
- M3: sample PDF pages render in browser with transform alignment and bounded memory; cancellation/release verified.
- M4: reference pages (MG:187, SW:10, SW:12), zoom 100/225/275/400, fit/nav, unchanged annotations and signed GET; preview fallback truthful.
- M5: multi-page attachments, navigation, unchanged annotations, no object leak.
- M6: pointer/touch/pen regression on emulators plus real PC, Galaxy Tab S11, iPhone 16 Pro; memory, tiling, orientation and offline cache.
- M7: full regression incl security, Sheets/Drive read-only contract, worker/cache update, build/deployment candidate, rollback drill, user acceptance. No production release without explicit approval.

## Rollback
Revert *only* migration frontend source on a migration branch to baseline; retain PDF.js engine selectable and restore baseline SW cache naming if rollback. Never revert production server or user data automatically. Preserve other chats' files and processes.

## M1 kickoff
Revalidate current main, PRs, Issue #45 and active remote workspace. Read only deployed source/backups; do not print or commit secrets. Inventory AGPL obligations for frontend + tightly integrated Apps Script; verify owner-only mutating endpoints and public reads; scan public Git and local proposed publish tree. Produce legally reviewed go/no-go gate for M2 and an M2 handoff. No M2 code until user reviews M0 and grants permission. No main merge, Apps Script push or deployment.
