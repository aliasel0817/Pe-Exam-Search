# R5 Corresponding Source access and reconstruction — pre-release candidate

**Status: REVIEW CANDIDATE — NOT A LICENSE-COMPLIANT BINARY RELEASE CLAIM.** This file identifies all current public pieces. It becomes a live user source offer only after an exact deployed commit/source scope, build completion, copyright notices and legal review.

## 1. Application and deployed Apps Script source

**Public application source root:** https://github.com/aliasel0817/Pe-Exam-Search/tree/feature/mupdf-r5-agpl-public-source-integration/study-note

The R5 branch is a candidate. The final operating release MUST link an exact released commit or immutable release tag, not a moving branch.

- Study-note front end: `study-note/study-note.html`, `study-note/service-worker.js`, `study-note/study-planner.js`, all auxiliary application and annotation/viewer code under `study-note/`.
- MuPDF integration: `study-note/mupdf-migration/m3/`, `m4/`, `m5/`, `m6/`, `m7/`, `r0/`–`r5/` (source and tests).
- **Apps Script server implementation:** `study-note/mupdf-migration/r5/source/Code.js` (R2 verified version21 read-only source snapshot). This is disclosed as application source, **not** as a call to edit or redeploy the operating Apps Script service.
- Existing backend helper: `study-note/backend/referencePdfContent.addon.gs` and tracked backend patch/design docs.
- Explicitly excluded: `Script Properties` values, OAuth/HMAC private keys, user files/PDFs/learning content/device registry, annotations and any `.r*-private` directory. The absence of these is an intended distinction between program source and operational/customer secrets, not a request to redact core program logic.

## 2. Exact MuPDF 1.28.1 source and build prerequisites

- Artifex official MuPDF Git: https://github.com/ArtifexSoftware/mupdf
- Exact source tag: `1.28.1`
- Immutable source commit: `20061bd45183f5a2bff8f43675e4da91e5ac2901`
- All 18 third-party gitlinked submodules, each pinned in `../../r3/r3-draft-source-manifest.json` (verified in previous R3 local private checkout).
- Original upstream build/installation scripts: `platform/wasm/tools/build.sh`, `tools/compress.sh`, `lib/mupdf.c`, `lib/mupdf.ts`.
- Linux Emscripten SDK version `4.0.8` and Node.js `22`, as specified in the upstream `platform/wasm/BUILDING.md`.
- Exact npm development dependencies: `source/mupdf-wasm-package-lock.json`, generated from the SHA-256-verified upstream package.json. This lock is a new R5 adjunct, not part of the upstream tag.
- Nondeploy build procedure: `r5-build-from-source.sh --prepare|--build` on a separate Linux private directory named `r5-private`, with `R5_EMSDK` and `R5_ACK_PRIVATE_BUILD=YES`. Verify artifacts using `r5-verify-built.cjs`. Build outputs MUST remain private until all license and release gates pass.

## 3. Intended reproduction commands (approved isolated Linux only)

```bash
git clone https://github.com/aliasel0817/Pe-Exam-Search.git study-note-source
cd study-note-source
# Checkout the exact, independently verified deployed commit SHA/tag.
git checkout VERIFIED_RELEASE_COMMIT_SHA
# Prepare a separate git-ignored or temporary private build root:
export R5_PRIVATE_ROOT="/secure/work/r5-private"
export R5_EMSDK="/secure/work/emsdk"
bash study-note/mupdf-migration/r5/r5-build-from-source.sh --prepare
# Install/activate Emscripten SDK 4.0.8 and Node.js 22 in isolated Linux environment.
export R5_ACK_PRIVATE_BUILD="YES"
bash study-note/mupdf-migration/r5/r5-build-from-source.sh --build
```

**No actual source offer is activated in the operating viewer yet.** Never use an unresolved `VERIFIED_RELEASE_COMMIT_SHA` in a public link, claim real binary/source correspondence before actual build, or copy production private configuration into the archive.

## 4. Licenses and changes

- Original MuPDF npm 1.28.1 LICENSE: `../../r4/licenses/AGPL-3.0.txt`, SHA-256 `57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6`
- Application-owned code scope: `APPLICATION-LICENSE-SCOPE.md`.
- Existing project notice inventories: `../../m2/THIRD-PARTY-NOTICES.md` and `../../r4/R4-THIRD-PARTY-NOTICES-DRAFT.md`.
- All third-party copyright notices and exact license texts must be checked against included source files before the final operating release; do not override upstream copyright headers or treat a missing root LICENSE as permissive.
- Byte-for-byte WASM hash equality is a useful reproducibility metric, **not** an independent AGPL obligation. The actual distribution must have complete corresponding source and scripts to build/use/modify it.
- Source access and AGPL notice should remain visible in the application under a genuine release URL after approval. The R4 notice currently remains limited to localhost/private testing, intentionally.

## 5. Final release checklist (all must be evidenced)

- [ ] Exact release main SHA and correspondence of latest deployed Apps Script source.
- [ ] Full frontend/backend source ownership, third-party attribution and AGPL-compliant rights reviewed.
- [ ] Source rebuild completed with exact core revision, submodules, dependencies, build/installation scripts and runtime verification.
- [ ] No secrets or user PDF/ink/Sheets data present in public source or browser caches.
- [ ] Real PUBLIC source-access link points to **that exact release** and is readable by remote users.
- [ ] Physical PC/Tab S11/iPhone Safari and authenticated read/isolated ink protection accepted as required or explicitly waived with risk authorization.
- [ ] GitHub Actions, safe rollback, owner-only policy, released JS/WASM provenance and operating deployment approval.

**If any essential item is missing, public MuPDF distribution remains NO-GO regardless of whether these sources are hosted on a public review branch.**
