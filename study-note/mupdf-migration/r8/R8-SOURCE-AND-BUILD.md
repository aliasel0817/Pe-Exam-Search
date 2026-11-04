# R8 — complete source and reproducible build instructions

This is the source recipe for the **MuPDF.js 1.28.1 high-resolution PDF viewer**
used with Pe-Exam-Search Study Note. It covers application HTML/JS, Worker code,
source of the backend **actually deployed** in Apps Script, third-party licensing,
JS/WASM build source and scripts.

## Source tree, scope and privacy

- The public release source tree under `study-note/` contains the application
  scripts, M3/M4/M5/M6/M7 PDF engines, R0-R8 security/packaging scripts, original
  AGPL licence, third-party notices and reproducible build instructions.
- Exact **operating Apps Script version 21** `Code.js`, `referencePdfContent.js`,
  `appsscript.json`: `../r5/source/`. Its fetched deployment version 21
  `Code.js` had SHA-256
  `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`
  and matched the tracked source byte-for-byte in a read-only `clasp pull`.
  The frontend's default deployment ID matched that version-21 deployment.
- `../r7/source/Code.js` is a **non-deployed security patch candidate** and
  must not be misidentified as the currently running Apps Script source.
- User learning documents (PDFs/images/annotations) and the LIVE MASTER Sheet
  are not application source; credentials and Script Properties must never be
  embedded in this public source tree.

## MuPDF 1.28.1 C source

- Official source repository: https://github.com/ArtifexSoftware/mupdf
- Exact core commit: `20061bd45183f5a2bff8f43675e4da91e5ac2901`
- Git tag: `1.28.1`
- 18 exact submodule commits in `../r3/r3-draft-source-manifest.json`
- Original submodule notice texts in `third-party-licenses/` copied
  byte-for-byte; SHA-256 in `R8-UPSTREAM-LICENSE-MANIFEST.json`.
- GNU AGPL full text at `../../LICENSE`. PDF.js Apache-2.0 and pdf-lib MIT
  licence texts at `licenses/`; app notice `../../THIRD_PARTY_NOTICES.md`.

## Build on isolated Linux with Emscripten SDK 4.0.8

The exact upstream C-to-WASM build was previously performed and checked by
the R5 GitHub Action. It should not be rebuilt in each test run.

```bash
git clone https://github.com/aliasel0817/Pe-Exam-Search.git Pe-Exam-Search
cd Pe-Exam-Search
# Checkout the exact tag that the deployed viewer exposes in Open-Source Notice:
git checkout --detach pe-study-note-mupdf-1.28.1-r8-20261104

# Use a separate private, ignored build root. No user data required.
export R5_PRIVATE_ROOT=/secure/work/r5-private
export R5_EMSDK=/secure/work/emsdk
bash study-note/mupdf-migration/r5/r5-build-from-source.sh --prepare
# Install/activate the pinned Emscripten SDK 4.0.8 and Node.js 22.
export R5_ACK_PRIVATE_BUILD=YES
bash study-note/mupdf-migration/r5/r5-build-from-source.sh --build

# Independently install exactly pinned browser dependencies.
npm --prefix study-note/mupdf-migration/m2 ci --ignore-scripts --no-audit
npm --prefix study-note/mupdf-migration/m3 ci --ignore-scripts --no-audit
# Offline JS/WASM release artifact generation (default BLOCKED until signed off):
export R8_ACK_PRIVATE_BUILD=YES
node study-note/mupdf-migration/r8/r8-build-release-assets.cjs
# Rebuilding an actual public release requires a separate ignored approval file
# satisfying every condition checked by the R8 tool; never hand-edit config.
```

- The actual web integration uses `vendor/mupdf/1.28.1/mupdf.js` and
  `vendor/mupdf/1.28.1/mupdf-wasm.wasm`, PDF.js 6.5.438 fallback,
  and the original M3 worker module `../m3/m3-worker.mjs`.
- npm-pinned JS/WASM/LICENSE source SHA information appears in
  `../m2/m2-asset-lock.json`; PDF.js is pinned by
  `../m3/package-lock.json`.
- The official rebuild may differ in binary SHA due to build environment.
  The contractual requirement is full matching source/build scripts; the
  source tree and externally available upstream commits are public.
- The deployed release tag is created only after the exact code tree has been
  built/checked; it must never be moved once published. Its Git tree
  SHA must exactly match the deployed main's Git tree.

## Changes and licence compliance

- M3-M7 adapt the MuPDF renderer into the original client viewers, with
  signed GET and normalized coordinate annotation storage unchanged.
- R0-R8 added security checks, Worker/gesture/cancellation handling, copyright
  attribution, private build verification and conditional release routing.
- No source file with upstream copyright notice has had its notice stripped.
- The AGPL licence and source URL must be visible from the viewer's
  `오픈소스 고지` menu, including for remote users.
- Data, third-party original textbook rights and any unrelated private
  settings are excluded from the licensed application source grant.

**Operational release is only complete when** the source tag is publicly
reachable, the deployed main tree exactly matches its code tree, all required
notices are accessible, the operating source and runtime match, and safety
checks succeed. The presence of this document alone is not deployment evidence.
