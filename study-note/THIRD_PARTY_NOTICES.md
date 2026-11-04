# Pe-Exam-Search Study Note — Open-Source Notices

Release scope: the Study Note application HTML/CSS/JavaScript, its MuPDF Worker and
viewer/annotation adapters, and the **actual deployed Apps Script v21** source
in `mupdf-migration/r5/source/Code.js`.

**Application code license:** GNU AGPL-3.0-or-later for code owned by, or
licensed for redistribution by, the project maintainer. Full licence:
[GNU AGPL-3.0](./LICENSE). Original third-party copyrights remain unchanged;
the application does not acquire copyright ownership over those works.

**Corresponding source:** The application links to a release-tag-specific complete
source tree in the viewer's *오픈소스 고지* menu. The R8 source layout also includes:
`mupdf-migration/r5/r5-build-from-source.sh`,
`mupdf-migration/r5/source/mupdf-wasm-package-lock.json`,
`mupdf-migration/r3/r3-draft-source-manifest.json`,
`mupdf-migration/r8/R8-SOURCE-AND-BUILD.md`, and all publicly readable
upstream commit/submodule references needed to reconstruct the licensed code.

**The following data are excluded from the application copyright grant and
source offer:** LIVE MASTER learning records, user-authored notes and textbook
PDFs/images/attachments, actual pen marks, OAuth/HMAC/session keys,
Script Properties and deployment credentials. Google-account details and
user authentication secrets are not published.

## Runtime components and licenses

| Component | Runtime version | Copyright / licence | Exact notice |
|---|---|---|---|
| MuPDF.js and MuPDF C/WASM | 1.28.1 | Artifex Software, Inc.; AGPL-3.0-or-later | [AGPL-3.0](./LICENSE) |
| Mozilla PDF.js | old CDN 3.11.174, new fallback 6.5.438 | Mozilla and contributors; Apache License 2.0 | [Apache-2.0](./mupdf-migration/r8/licenses/Apache-2.0.txt) |
| pdf-lib | 1.17.1 | pdf-lib contributors; MIT | [pdf-lib MIT notice](./mupdf-migration/r8/licenses/pdf-lib-MIT.txt) |
| SheetJS Community Edition | CDN 0.18.5 | SheetJS LLC; Apache License 2.0 | [Apache-2.0](./mupdf-migration/r8/licenses/Apache-2.0.txt) |

**Required SheetJS CE attribution (not SheetJS Pro):**

SheetJS Community Edition — https://sheetjs.com/
Copyright (C) 2012-present SheetJS LLC
Licensed under the Apache License, Version 2.0.
Provided on an "AS IS" basis, without warranties or conditions.

The application does not intentionally modify the external CDN-distributed
SheetJS/PDF.js/pdf-lib sources. Any future change to distributed library files
requires its original copyright notices and change documentation to be retained.
The original PDF.js/MuPDF standalone LICENSE file also accompanies the private
staging manifest, and the source code includes the original licence texts.

## MuPDF official 18 pinned third-party modules

These licence/attribution source files were **copied unchanged** from the
official pinned MuPDF C source checkout with verified submodule SHAs.
Their exact SHA-256 hashes and Git commit IDs appear in
`mupdf-migration/r8/R8-UPSTREAM-LICENSE-MANIFEST.json`.

| Library | Original licence or attribution evidence |
|---|---|
| brotli | [LICENSE](./mupdf-migration/r8/third-party-licenses/brotli/LICENSE) |
| cmark-gfm | [COPYING](./mupdf-migration/r8/third-party-licenses/cmark-gfm/COPYING) |
| curl | [COPYING](./mupdf-migration/r8/third-party-licenses/curl/COPYING) |
| extract | [COPYING](./mupdf-migration/r8/third-party-licenses/extract/COPYING) |
| freeglut | [COPYING](./mupdf-migration/r8/third-party-licenses/freeglut/COPYING) |
| freetype | [LICENSE.TXT](./mupdf-migration/r8/third-party-licenses/freetype/LICENSE.TXT) and [FTL.TXT](./mupdf-migration/r8/third-party-licenses/freetype/docs/FTL.TXT) |
| gumbo-parser | [COPYING](./mupdf-migration/r8/third-party-licenses/gumbo-parser/COPYING) |
| harfbuzz | [COPYING](./mupdf-migration/r8/third-party-licenses/harfbuzz/COPYING) |
| jbig2dec | [LICENSE](./mupdf-migration/r8/third-party-licenses/jbig2dec/LICENSE), [COPYING](./mupdf-migration/r8/third-party-licenses/jbig2dec/COPYING) |
| lcms2 | [LICENSE](./mupdf-migration/r8/third-party-licenses/lcms2/LICENSE) |
| leptonica | [source copyright / BSD-style licence](./mupdf-migration/r8/third-party-licenses/leptonica/src/environ.h) |
| libjpeg | [original IJG README copyright and redistribution terms](./mupdf-migration/r8/third-party-licenses/libjpeg/README) |
| mujs | [COPYING](./mupdf-migration/r8/third-party-licenses/mujs/COPYING) |
| openjpeg | [LICENSE](./mupdf-migration/r8/third-party-licenses/openjpeg/LICENSE) |
| tesseract | [LICENSE](./mupdf-migration/r8/third-party-licenses/tesseract/LICENSE) |
| zint | [LICENSE](./mupdf-migration/r8/third-party-licenses/zint/LICENSE) |
| zlib | [LICENSE](./mupdf-migration/r8/third-party-licenses/zlib/LICENSE) |
| zxing-cpp | [LICENSE](./mupdf-migration/r8/third-party-licenses/zxing-cpp/LICENSE) |

This software includes portions based on the work of the Independent JPEG
Group (IJG). Original contributor attribution and no-warranty terms are
retained in the copied original `libjpeg/README`. No IJG author name is used
to endorse the application.

FreeType 2 uses the FreeType License (FTL), the BSD-style option compatible
with GPL version 3; its required credit and complete licence text are
provided in the original `FTL.TXT`.

Artifex Software and the original contributors provide upstream code
WITHOUT WARRANTY, as stated in their respective licences. This notice does
not substitute any of those original licences or claim ownership of
third-party software. End users may request corresponding application source
through the public URL displayed inside the application.
