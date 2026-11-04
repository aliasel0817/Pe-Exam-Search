# MuPDF.js 1.28.1 — Third-party Notices and Copyright Access

**R5 release source candidate.** The terms of each external component remain those of its rights holders; the application AGPL declaration does not relicense third-party files. The exact corresponding source for these files is obtained by `git submodule update --init --recursive` at MuPDF Git commit `20061bd45183f5a2bff8f43675e4da91e5ac2901`.

## Components known to be linked / included in source tree

| Component (MuPDF 1.28.1 gitlink) | License/copyright document in exact upstream source | Status |
|---|---|---|
| MuPDF core + MuPDF.js JS/WASM | MuPDF root `COPYING`, npm `LICENSE`, per-file copyrights | AGPL-3.0-or-later |
| thirdparty/brotli | `LICENSE` | Source document found |
| thirdparty/cmark-gfm | `COPYING` | Source document found |
| thirdparty/curl | `COPYING` | Source document found |
| thirdparty/extract | `COPYING` | Source document found |
| thirdparty/freeglut | `COPYING` | Source document found |
| thirdparty/freetype | `LICENSE.TXT` | Source document found |
| thirdparty/gumbo-parser | `COPYING` | Source document found |
| thirdparty/harfbuzz | `COPYING` | Source document found |
| thirdparty/jbig2dec | `COPYING`, `LICENSE` | Source documents found |
| thirdparty/lcms2 | `LICENSE`, `COPYING.GPL3` | Source documents found |
| thirdparty/leptonica | `leptonica-license.txt` | Source document found at nested location |
| thirdparty/libjpeg | `README` (IJG license details require file-level verification) | Manual license text verification required |
| thirdparty/mujs | `COPYING`, `license.html` | Source documents found |
| thirdparty/openjpeg | `LICENSE` | Source document found |
| thirdparty/tesseract | `LICENSE` | Source document found |
| thirdparty/zint | `LICENSE` | Source document found |
| thirdparty/zlib | `LICENSE` | Source document found |
| thirdparty/zxing-cpp | `LICENSE` | Source document found |

**Upstream provenance:** exact 18 paths and SHA-1 revisions in `../../r3/r3-draft-source-manifest.json`; R3 verified checkout contains all 18. The above file names were verified by read-only directory traversal in the existing private R3 source on 2026-11-04. Their presence does **not** establish that legal conditions are fully satisfied, that all submodules actually compile into the minimal WASM, or that the runtime has no other third-party assets.

## Other app/runtime components

| Component | Expected version/source | Rights |
|---|---|---|
| PDF.js existing operating path | 3.11.174 | Apache-2.0; vulnerable legacy version tracked independently |
| PDF.js safe fallback | 6.5.438 | Apache-2.0 |
| pdf-lib | 1.17.1 | MIT |
| SheetJS CE | 0.18.5 (per previous M2 report; exact actual included file must be rechecked) | Previous M2 described Apache-2.0; exact artifact/legal notice still to be confirmed |
| Fonts, CJK mapping data, ICC profiles inside MuPDF WASM | bundled by MuPDF official build | Check MuPDF upstream source and individual rights/NOTICE in reproduced distribution |

## Before PUBLIC JS/WASM and actual application release

- Confirm the final exact dependencies **actually bundled** in the distributed outputs. Do not claim every listed source-only third-party module is compiled into WASM.
- Preserve all applicable original copyright/licence notices; review libjpeg IJG conditions and all MuPDF bundled font/CMap/ICC attribution.
- Verify rights and licences of any non-project-owned frontend assets and scripts, and compatibility with the combined work.
- Provide this notice plus the actual complete corresponding source, runnable scripts, app and Apps Script implementation without secrets.
- Create and test the **real version-specific** source-access URL and user-facing notice before enabling MuPDF in Pages.
- Document changes, licence and no-warranty terms; do not modify the original user PDF metadata simply to add attribution to a viewer.

This file is a source provenance and NOTICE candidate, not a conclusive legal opinion or full external publication approval.
