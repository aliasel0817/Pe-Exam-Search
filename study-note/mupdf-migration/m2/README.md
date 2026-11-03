# M2 — non-production MuPDF.js packaging

Status: nonproduction staging and automated checks only.

## Requirements
Node >=20, npm >=10 and Git, isolated working directory.

## Reproducible build instructions
1. npm ci --ignore-scripts --no-audit --no-fund
2. node m2-stage-assets.cjs
3. node m2-verify-assets.cjs
4. node m2-esm-smoke.mjs (ESM/WASM init only; no PDF opened)
5. node --test m2.test.cjs
6. node --test ../m1/m1-audit.test.cjs

First-time initialization only: node m2-stage-assets.cjs --init-asset-lock. Never run this after the lock exists; version changes require explicit review.

Stage result: repository-root .m2-private/staged/mupdf/1.28.1. It and node_modules are ignored by Git. NEVER add public GitHub Pages file copies or publish the staged binary.

## Architecture
No study-note.html PDF loader modified. Same-origin ESM JS loads its adjacent JS and WASM; see m2-runtime-paths.json for MIME and cache plans. Worker is not implemented in M2. Authenticated PDFs and signed GET URLs are never Service Worker cached. M3 handles actual renderers; M6/M7 handles full SW and device compatibility.

## Security and release
Never publish Script Properties, .clasp.json, secrets, PDF, attachments, annotations, user identity and backups. The M2 CI only runs tests, without upload, pages deploy, Apps Script push or main merge. m2-release-gate.cjs intentionally returns code 3 to prevent mistaken release.

See THIRD-PARTY-NOTICES.md, licenses/AGPL-3.0.txt and M2-SOURCE-OFFER-DRAFT.md. These are not a completed AGPL source offer.
