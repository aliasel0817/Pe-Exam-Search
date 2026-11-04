# Study Note MuPDF.js R9 — production rollout / rollback runbook

Release reference: `pe-study-note-mupdf-1.28.1-r8-20261104`
Operating source repository: `aliasel0817/Pe-Exam-Search`
Original main before rollout:
`e758fc3145add56f151ec4231927001c28a142b6`.
Immutable backup branch:
`backup/mupdf-before-r9-main-20261104`.

## Scope and release authorization

The project owner expressly requested AGPL publication of owned application
source and the actual release to main and Pages. Real isolated cloud Ink
readback, conflict and backup checksum PASS was supplied via user's
2026-11-04 21:26 KST Apps Script screenshot. Original production signed
GET returns real subnote/textbook PDF.js; user's source, zoom and page
navigation tests PASS. Windows Chrome MuPDF synthetic reference/attachment,
PDF.js fallback and 144 legacy/new unit tests PASS.

Physical Galaxy Tab S11 S Pen and iPhone 16 Pro Safari tests were delegated
to the owner with stated rollout risk. **No actual physical device PASS
is claimed.** A device issue reported after release triggers rollback
according to user risk decision; it never justifies deleting annotations.

## Exact changes shipped to GitHub Pages

- One same-origin MuPDF JS 1.28.1 Worker/runtime and pinned WASM
  `5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7`.
- PDF.js fallback 6.5.438, M3-M7 high-resolution viewers, pen/gesture modules.
- R9 release selector activates only exact
  `https://aliasel0817.github.io/Pe-Exam-Search/study-note/` URL scope,
  and preserves R6 BLOCKED on wrong origin or missing script.
- Complete AGPL source, 3-piece complete MuPDF C archive, 18 pinned submodule
  source and attribution, mandatory copyright and original LICENSE notices.
- No production Apps Script code is changed: actual deployed v21 Code.js
  matches the public source exactly (SHA:
  `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`).
- No LIVE MASTER, original PDF/images/attachments, authenticated user ink,
  Script Properties, OAuth/HMAC secrets or signed URLs touched or committed.
- R7 server security alternative remains clearly marked **candidate,
  not deployed**; this release keeps existing signed GET/backend behavior.

## Commit → test → rollback

1. Verify main/integration heads and release PR dependencies; never merge each
   historical cumulative Draft PR separately.
2. Keep backup branch on original main. Verify GitHub Actions all pass.
3. Merge single reviewed R9 cumulative PR to main; do not force push.
4. Tag the exact *release tree* using the immutable release ref above, and
   verify `git rev-parse main^{tree}` equals tag `^{tree}`. Never move tag.
5. Verify public GitHub Pages HTML, JS/WASM HTTP and SHA with content-type
   application/wasm. Verify live source and NOTICE links.
6. In real PC browser on normal signed GET: first-open subnote/textbook and
   attachment automatically use MuPDF high-quality, fallback PDF.js on error,
   pen/scroll/pinch/annotations unchanged. No account secrets in console/logs.
7. User performs separate physical Tab S11 and iPhone Safari acceptance,
   reports issues without credentials, original data or signed URLs.
8. On a blocker: deploy an approved revert restoring original main tree from
   `backup/mupdf-before-r9-main-20261104`, confirm Pages content and
   the original PDF.js viewer. **Never delete or modify** original Sheet,
   Apps Script version 21 or user pen/attachment data to roll back frontend.
   Never use git reset/clean/force push; use a reviewed revert/restore PR.

If GitHub Pages branch source is not main, explicitly confirm its publishing
branch before claiming the viewer is live. A successful PR merge alone does
not equal a successful Pages deployment.
