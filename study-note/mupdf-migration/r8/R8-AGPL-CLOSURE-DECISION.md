# MuPDF.js AGPL — R8 finite compliance closure

**Scope and date:** Pe-Exam-Search Study Note viewer, 2026-11-04.
**Decision method:** objective A–E checklist, exactly once for an unchanged release.
**User's election:** AGPL rather than commercial licence, with explicit
authorization to publicly release project-owned application source and
request to deploy the viewer to operating main.

## No perpetual legal-review loop

Artifex officially allows AGPL use at no license charge **if** the combined
application's complete Corresponding Source is shared and all terms are honored.
No written Artifex commercial contract or case-by-case approval is required
for the AGPL branch. GNU AGPLv3 section 13 requires a prominent network source
offer when a modified covered work is used interactively. Review only concrete
licence changes, new external components, or changed source/distribution
interfaces in later versions; never reopen unchanged SHA evidence without cause.

**Primary texts:**
- https://artifex.com/licensing
- https://mupdfjs.readthedocs.io/en/latest/faq/index.html
- https://www.gnu.org/licenses/agpl-3.0.html
- https://www.gnu.org/licenses/gpl-faq.en.html
- https://mupdf.readthedocs.io/en/latest/other/third-party.html
- https://docs.sheetjs.com/docs/miscellany/license/

## A. Project ownership and redistribution rights — finite evidence

The maintainer explicitly authorized AGPL publication for **their own app
code**, not third-party works they do not control. `study-note/LICENSE`
and the existing `r5/source/APPLICATION-LICENSE-SCOPE.md` identify the scope.
Original PDF and user data are explicitly excluded. Do not claim this
authorization re-licenses third-party material. Third-party rights are
determined from the actual original licences below.

## B. Third-party copyright/licence inventory — finite evidence

- Official MuPDF AGPL licence SHA256
  `57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6`.
- Upstream MuPDF core commit
  `20061bd45183f5a2bff8f43675e4da91e5ac2901`.
- **18 of 18** actual submodule revisions verified. Original licence/copyright
  evidence copied as **20 unchanged text files** with SHA-256 in
  `R8-UPSTREAM-LICENSE-MANIFEST.json` and linked from
  `study-note/THIRD_PARTY_NOTICES.md`.
- Previously unclear `leptonica` original BSD-style licence found in its
  exact upstream `src/environ.h`; `libjpeg` IJG licence in original
  `README`. Both copied unchanged, and IJG attribution explicitly appears
  in the notice. FreeType chooses the GPLv3-compatible FTL option with full
  licence and notice.
- `pdfjs-dist@6.5.438` Apache-2.0 licence copied; legacy PDF.js
  3.11.174 same Apache2.0 licence; `pdf-lib@1.17.1` MIT licence copied.
- Actual external SheetJS CE 0.18.5 CDN version is Apache-2.0,
  mandatory SheetJS LLC attribution copied verbatim in the public notice;
  no SheetJS Pro included.
- Upstream MuPDF docs describe other covered static libraries.
  Actual R5 Emscripten build disables optional `extract` and other components;
  the complete source pins and original notices are nonetheless preserved.
- Existing upstream copyright headers are preserved. No confidential
  Script Properties or user PDF/ink data are included in this licence bundle.

## C. Runtime/backend source correspondence

- The user's public frontend `DEFAULT_API_URL` deployment matched the
  read-only `clasp deployments` listing's version 21 deployment.
- The independently fetched exact deployed version 21 Code.js (171,107
  bytes) had SHA256 `e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f`
  and **byte-matched** published `r5/source/Code.js`.
- R7 candidate Code.js is **not deployed** and never substituted for the
  source offer of operating v21.
- The runtime MuPDF JS/WASM and PDF.js assets are SHA-256 pinned from
  original npm locks and genuine R5 Linux Emscripten 4.0.8 build evidence.
  No independent byte-identical rebuild is required by AGPL.
- Final frontend deployment must have the exact same *Git tree* as the
  release source tag; this is verified at actual deploy, not inferred here.

## D. Source offer and install/rebuild material

The delivered viewer will expose the release-tag URL containing
`study-note/LICENSE`, `THIRD_PARTY_NOTICES.md`,
`r8/third-party-licenses/`, `r5/source/Code.js`, `r5` pinned
C-to-WASM scripts, `m2/m3` npm lockfiles and `r8/R8-SOURCE-AND-BUILD.md`.
The R6 open-source UI links to that URL and all licence/notice documents.
The planned immutable release tag is
`pe-study-note-mupdf-1.28.1-r8-20261104`.
**Until that tag and operating Pages distribution are published and checked,
this part is RELEASE-PENDING, not PASS.**

## E. Secrets and user data

R5 heuristic scanner checks the deployed v21 and independent R7 candidate;
original Script Properties and `.clasp.json` are not included. The public
Study Note source tree contains no tracked PDF/image/annotation data, nor any
tracked `.wasm` until a legally released binary is deliberately deployed.
Exact tag-source checks and operational non-caching tests are required.

## Exit rule

**A + B complete with the recorded licence evidence; C's operating Apps
Script v21 parity complete. D (published tag + runtime equality) and E
(post-publish public inspection) are objectively testable release steps,
not requests for a new legal opinion.**
Once D/E pass, mark technical AGPL release evidence **CLOSED/PASS for this
fixed release**. Only changed inputs or a specific identified copyright
conflict reopen the corresponding item; no indefinite check/recheck cycle.

This is a documented license-compliance implementation decision, not an
assertion that all litigation risk can be eliminated or that an independent
lawyer issued an opinion.
