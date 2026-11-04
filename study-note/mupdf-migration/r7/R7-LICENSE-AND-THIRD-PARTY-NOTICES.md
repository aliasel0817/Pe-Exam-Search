# Study Note / MuPDF.js R7 — copyright and third-party notices review

**Status: PRE-RELEASE SOURCE CANDIDATE — NOT FINAL DISTRIBUTION NOTICE OR LICENSE OPINION.**
Date: 2026-11-04. Project: Pe-Exam-Search / Issue #45.

## AGPL application and corresponding-source scope

The project maintainer has chosen the **GNU AGPL-3.0-or-later** route for project-owned Study Note code, subject to rights to license the actual files. All modified client HTML/JS, M3-M7 Worker and renderer adapters, the R0-R7 integration and security code, and Apps Script backend code forming the combined application are in the proposed source scope. The original, independently authored textbook/subnote PDF contents, user learning sheet rows, pictures, attachments, ink data, Google auth/session metadata, secret keys, live credentials and Script Properties are **not** project source merely because the application reads them and must not be published here.

- Official AGPL license, verified exact SHA-256: `../r4/licenses/AGPL-3.0.txt` (SHA256 `57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6`).
- Artifex's published licensing guidance: https://artifex.com/licensing
- GNU FAQ and official license: https://www.gnu.org/licenses/gpl-faq.en.html and https://www.gnu.org/licenses/agpl-3.0.html
- Old v21 Apps Script snapshot `../r5/source/Code.js` (SHA-256 `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`).
- R7 **non-deployed** secure idempotency / owner-only fix candidate: `source/Code.js`; its SHA and exact basis recorded in `R7-CODE-PROVENANCE.json`. An application source offer MUST correspond to the code *actually deployed*, not automatically to this candidate.
- R7 privacy rule: no `.clasp.json`, Script Properties, private tokens, signing URLs, user PDF bytes or ink in the source bundle.
- Source build and installation: `../r5/r5-build-from-source.sh`, `../r5/source/mupdf-wasm-package-lock.json`, `../m3/package-lock.json`, `r7-private-release-assemble.cjs` and applicable `README` instructions.

### MuPDF / MuPDF.js

MuPDF 1.28.1 (Artifex Software, Inc. and other upstream contributors), GNU AGPL-3.0-or-later or separately contracted commercial license. Official C source commit `20061bd45183f5a2bff8f43675e4da91e5ac2901`, together with its eighteen exact source submodule revisions in `../r3/r3-draft-source-manifest.json`. `mupdf@1.28.1` npm JS/WASM and LICENSE checksums in `../m2/m2-asset-lock.json`. Actual Emscripten 4.0.8 build and npm parity were verified in earlier R5 CI; R7 avoids rebuilding without reason.

A network-served application using the AGPL library must provide access to corresponding source, preserve notices, and meet the real AGPL conditions. This preliminary catalog is not evidence of a legally approved public binary release. Actual final distribution needs clear license and copyright review, source build correspondence, source offer accessibility and deployment authorization.

### Other browser/runtime components

| Component | Known version/use | License information | Release check |
|---|---|---|---|
| Mozilla PDF.js | Existing 3.11.174; R7 new fallback 6.5.438 | Apache License 2.0 | Official npm 6.5.438 `LICENSE` privately staged; confirm actual bundled fonts/CMaps and old viewer notice |
| pdf-lib | 1.17.1 (existing project & test/build) | MIT | Recheck final distributed artifact and copyright text |
| SheetJS Community Edition | Existing XLSX library, previously identified 0.18.5 | Apache License 2.0 (SheetJS CE only) | Verify exact delivered code/header and SheetJS required attribution; do NOT assume SheetJS Pro license |
| MuPDF 1.28.1 upstream C | Exact pinned official commit | AGPL-3.0-or-later | Keep original notices; complete Corresponding Source |
| Emscripten SDK | 4.0.8 used for private build | Independent upstream license terms | Build/install toolchain identification and availability |
| App specific CSS/fonts, icons and any CDN scripts | Actual operating HTML and npm lock files | Each upstream's own terms | Full running-distribution inventory and rights signoff required |

PDF.js reference: https://github.com/mozilla/pdf.js
SheetJS CE licensing: https://docs.sheetjs.com/docs/miscellany/license/
Artifex MuPDF.js FAQ: https://mupdfjs.readthedocs.io/en/latest/faq/index.html

### MuPDF eighteen upstream source modules — read-only provenance evidence

The separate prior R3 checkout was opened **read-only**. On the exact official MuPDF core SHA, all 18 expected Git submodule HEAD hashes matched `r3-draft-source-manifest.json`. `R7-THIRD-PARTY-EVIDENCE.json` records names, root notice candidates and their SHA-256; no source was changed.

| Module | Root evidence file name (not a license verdict) | Status |
|---|---|---|
| brotli | LICENSE | Verify license contents |
| cmark-gfm | COPYING | Verify license contents |
| curl | COPYING | Verify license contents |
| extract | COPYING | Verify license contents |
| freeglut | COPYING | Verify license contents |
| freetype | LICENSE.TXT | Verify FTL/GPL file terms and fonts |
| gumbo-parser | COPYING | Verify license contents |
| harfbuzz | COPYING | Verify license contents |
| jbig2dec | COPYING / LICENSE | Verify contents and attributions |
| lcms2 | LICENSE | Verify contents |
| leptonica | README.html / README.md only at checkout root | Locate actual applicable copyright/license in source files |
| libjpeg | README only at checkout root | Locate full IJG/copyright attribution in source files |
| mujs | COPYING | Verify license contents |
| openjpeg | LICENSE | Verify contents |
| tesseract | LICENSE | Verify contents |
| zint | LICENSE | Verify contents |
| zlib | LICENSE | Verify contents |
| zxing-cpp | LICENSE | Verify contents |

**A root notice file is not a completed legal review**. In particular, `leptonica` and `libjpeg` require further file-level review; actual static linking and compiled selections must be assessed for complete attribution. No third-party original notice should be removed or altered.

### Final signoff still required

1. Application ownership and actual licenses of all bundled files; AGPL scope and Apps Script interaction reviewed by appropriate rightsholder/legal reviewer.
2. Actual deployment's **precise** Apps Script revision and R7 candidate parity; do not equate snapshot to production.
3. Actual distribution includes complete sources and build/install scripts, copyright, third-party notices and official unmodified LICENSE text.
4. An exact immutable source URL that opens for a public user and matches the binary/app they receive.
5. Sensitive-data audit, authenticated original-PDF and cloud ink testing, physical-device acceptance or documented risk and explicit deployment authorization.
6. No MuPDF JS/WASM published until all hard release checks are affirmatively satisfied. **Current decision: NO-GO.**
