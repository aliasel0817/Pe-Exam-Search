# MuPDF 1.28.1 — Complete Corresponding Source for Study Note R9

The project maintainer elected GNU AGPLv3 for project-owned Study Note code
that integrates MuPDF.js, together with its exact operating Apps Script v21
server source. Source offer URL (same release tree):

https://github.com/aliasel0817/Pe-Exam-Search/tree/pe-study-note-mupdf-1.28.1-r8-20261104/study-note

This is a **release-specific, immutable Git tag**. The Git tree used for
GitHub Pages must match the tag tree and be verified after deployment.
Original GNU AGPL: [study-note/LICENSE](../../LICENSE)
Third-party copyright/attribution: [NOTICE](../../THIRD_PARTY_NOTICES.md)
Build recipe: [R8-SOURCE-AND-BUILD.md](../r8/R8-SOURCE-AND-BUILD.md)

## Full original MuPDF C source and 18 submodules

The source distribution includes all MuPDF C sources and all
**18 exact pinned upstream submodule** source checkouts in a reproducible
93,863,687-byte `.tar.gz` archive split into three parts to avoid large
individual Git blobs. These parts are the actual archived upstream checkout,
not merely GitHub hyperlinks.

`source/mupdf-1.28.1-complete-source.tar.gz.part01`
`source/mupdf-1.28.1-complete-source.tar.gz.part02`
`source/mupdf-1.28.1-complete-source.tar.gz.part03`

Original complete archive SHA-256:
`328c12b65cbdfffc2ad803bd14d9fb526496937575c14fac4634d9968461de15`

Each part's exact byte length and SHA-256 are recorded in
`R9-SOURCE-ARCHIVE-MANIFEST.json`. Every part is in the
**same exact tagged source tree** as the web application, AGPL, installation
and build scripts.

### Reassemble and inspect (Node.js 22+)

```bash
git clone --branch pe-study-note-mupdf-1.28.1-r8-20261104 --depth 1 https://github.com/aliasel0817/Pe-Exam-Search.git
cd Pe-Exam-Search
mkdir -p /tmp/mupdf-r9
node study-note/mupdf-migration/r9/r9-reassemble-source.cjs /tmp/mupdf-r9
mkdir -p /tmp/mupdf-r9/source
tar -xzf /tmp/mupdf-r9/mupdf-1.28.1-complete-source.tar.gz -C /tmp/mupdf-r9/source
```

The verifier refuses unexpected chunk hashes, incomplete byte counts and
overwriting existing archives. Extracted source includes the official
MuPDF C source, `platform/wasm`, exact 18 submodules, and original notices.
No local private Git repository metadata, user learning files or credentials
are included.

## Build and install material

- `../r5/r5-build-from-source.sh` and
  `../r5/source/mupdf-wasm-package-lock.json`: real Linux C-to-WASM
  build with Emscripten 4.0.8 and locked Node dependencies.
- `../r3/r3-draft-source-manifest.json`: official C core SHA
  `20061bd45183f5a2bff8f43675e4da91e5ac2901` and 18 submodule SHAs.
- `../m2/m2-asset-lock.json` and `../m3/package-lock.json`:
  exact npm MuPDF JS/WASM and fallback PDF.js hashes.
- `R9-PUBLIC-ASSET-MANIFEST.json`: seven exact
  release assets served by Pages at `study-note/vendor`.
- `r9-release-config.js`: release selector verifies fixed origin,
  tag reference, MuPDF commit, WASM hash, and approvals before activation.
  If unavailable, original R6 `BLOCKED` config remains and PDF.js is preserved.
- `../r5/source/Code.js`, `referencePdfContent.js`, `appsscript.json`:
  version 21, SHA-256
  `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`,
  verified against actual deployed Apps Script by read-only `clasp pull`.
  R7's alternate server implementation was NOT deployed and is a
  separately labeled candidate.

The complete pinned source archive is supplied so reconstruction does not
depend on a third-party repository continuing to host that commit. Binary
byte-identical builds are an engineering check, not a standalone legal
requirement; exact compiled code and toolchain settings are documented.

## User data exclusion and licensing

User textbooks, actual original PDFs, images, photos, learning Sheet rows,
annotations/ink and their backups are NOT licensed as program source, are
not embedded in the archive or published in the Git repository. HMAC keys,
OAuth secrets, Script Properties, signed GET links and `.clasp.json` are
excluded. Third-party authors retain their original attribution and terms.

Physical Galaxy Tab S11 and iPhone Safari user acceptance is delegated
with documented release risk; it is NOT reported as a physical-device PASS.
