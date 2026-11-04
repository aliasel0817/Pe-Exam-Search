# Pe-Exam-Search / Study Note — AGPL source licence and scope

**Release track:** R5 public source candidate, 2026-11-04 (Asia/Seoul). **AGPL source publication is NOT equivalent to activating/approving operating MuPDF JS/WASM distribution.**

## Project-owned application source

The project maintainer has selected the open-source AGPL compliance approach for the study-note application. To the extent they own or have authority to license the code, the project-owned application implementation and MuPDF integration layers under `study-note/` (including its browser HTML/CSS/JavaScript, background worker, viewer adapters, annotation input/overlay code, and the Apps Script `Code.js` server-side implementation in this folder) are offered under **GNU AGPL-3.0-or-later**.

Read the complete licence as shipped from the official MuPDF package at:

`../../r4/licenses/AGPL-3.0.txt`

GitHub repository source: https://github.com/aliasel0817/Pe-Exam-Search

For a released binary, the exact checked-out commit and its `mupdf@1.28.1` source/lock/installation instructions must be supplied together. This source directory is a candidate only until deployment and version-specific source correspondence are validated.

## Rights and boundaries

- Existing third-party source remains under its own original terms; this notice is NOT a claim of copyright ownership over MuPDF, PDF.js, pdf-lib, SheetJS, typefaces or other third-party works.
- Unrelated documentation and user-created learning content, actual LIVE MASTER rows, source PDFs, images, attachments, security-device registry, annotations and data exports are NOT relicensed or distributed by this statement.
- No production secret values, Script Properties, HMAC/refresh tokens or credentials are granted any publication rights; use user-supplied values in private operational settings.
- Any included files not owned/controlled by the project maintainer require a rights review before final source redistribution.
- Publishing source is not automatically a representation that a safe complete Corresponding Source offer exists for a particular WebAssembly binary.

## Included Apps Script source provenance

`Code.js` is a **byte-equivalent source snapshot** (SHA-256 `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`, 171107 bytes) of the R2 **read-only version21/HEAD** snapshots verified on 2026-11-04. This is a historical fact, NOT proof of the current Apps Script deployment version at the time of release. The actual deployed runtime source and version must be rechecked before operating deployment.

The associated configuration is supplied through Script Properties, NOT through hardcoded credentials. R5 heuristic scanners found no known literal credentials or ID patterns, but human security and license review remains required; the scanner's zero findings are not a complete guarantee.
