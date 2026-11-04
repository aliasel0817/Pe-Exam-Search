# R3 — MuPDF 1.28.1 corresponding-source readiness (PRIVATE DRAFT)

**NO PUBLIC RELEASE / NO APPS SCRIPT CHANGE / NO MAIN MERGE**.

This folder contains tracked **source-review tooling and planning metadata only**. Exact upstream C sources, 18 third-party git submodules, the npm tarball and audit evidence are deliberately confined to the **ignored** `.r3-private/` of this chat's independent R3 clone; they are **not attached to this PR**. Never commit `.r3-private` or an actual wasm binary.

## Verified upstream artifacts (2026-11-04)

- Upstream tag `1.28.1`, checked-out commit `20061bd45183f5a2bff8f43675e4da91e5ac2901`.
- `platform/wasm/BUILDING.md`, `platform/wasm/tools/build.sh`, `platform/wasm/package.json` from **that exact tag**, not master.
- 18 third-party gitlinks are checked out at their exact pinned SHA values.
- `npm pack mupdf@1.28.1 --ignore-scripts` tarball independently matches all four M2-pinned dist/license file SHA-256 and sizes (2 JS, 1 WASM, 1 LICENSE). npm package identity is NOT a source-build success.
- Exact recipe: Linux / Emscripten SDK **4.0.8**, Node LTS **22**, `BUILD=small`, `DEFINES=-DTOFU -DTOFU_CJK_EXT -DFZ_ENABLE_HYPHEN=0`, `FEATURES=brotli=no mujs=no extract=no xps=no svg=no html=no`, `cd platform/wasm && npm run prepack`.
- Upstream 1.28.1 `platform/wasm` **has no package-lock.json**; `devDependencies` allow version drift. A rebuilt JS/WASM may not match npm tarball even with same tag and emsdk; preserve resolved npm lock evidence in the private build directory.

## Exact source provenance audit — read-only

On the connected Windows PC (example private project location):

```powershell
$root = 'E:\Professional_Engine\Download\Development\Pe-Exam-Search_mupdf_r3_20261104'
node "$root\study-note\mupdf-migration\r3\r3-upstream-provenance.cjs" `
  "$root\.r3-private\mupdf-1.28.1-src" `
  "$root\.r3-private\mupdf-1.28.1.tgz" `
  "$root\.r3-private\provenance-evidence.json"
node "$root\study-note\mupdf-migration\r3\r3-draft-manifest.cjs" `
  "$root\.r3-private\provenance-evidence.json" `
  "$root\study-note\mupdf-migration\r3\r3-draft-source-manifest.json"
```

The audit is **read-only** to MuPDF sources and npm archives; it writes only a private report, and the generator emits a sanitized, clearly NONRELEASE draft. It never exports private source, credentials, user PDFs or wasm.

## Real build (NOT EXECUTED on current Windows machine)

The official release says Linux-tested only. This user's connected Windows PC has no verified WSL Linux distribution, no `emcc`, no GNU `make`, no Docker. The private build script's syntax check passed, and Windows `--preflight` correctly refuses execution. A Linux build may be executed only in an authorized private, isolated environment with Emscripten SDK 4.0.8:

```bash
export R3_PRIVATE_DIR=/private/.r3-private
export R3_TOOLING_PATH=/private/Pe-Exam-Search/study-note/mupdf-migration/r3
bash "$R3_TOOLING_PATH/r3-build-linux-private.sh" --preflight
export R3_ACK_PRIVATE_BUILD=YES
bash "$R3_TOOLING_PATH/r3-build-linux-private.sh" --build
```

The script checks exact tag, submodules and emsdk, calls upstream `npm run prepack` **only inside ignored private checkout**, and invokes `r3-compare-built.cjs` to compare real build files with the M2-pinned npm JS/WASM. If the output is different, investigate exact dependency versions/build options. The script contains no upload or deploy steps.

## Source offer and license limitations

- `r3-draft-source-manifest.json`: **private-review candidate inventory**, not Corresponding Source completeness certification.
- `r3-source-export-audit.cjs`: blocks likely secrets, private paths, PDFs, WASM and non-source media from a proposed **source-only** review bundle; never prints matched secret values. A clean scan does not prove source completeness or legal suitability.
- `r3-verified-idempotency-candidate.mjs`: isolated, nondistributed model for the pre-auth CacheService claim problem. **NOT** a drop-in Apps Script patch. Requires separate lock-duration, Google registration and nonce/idempotency review before deployment.
- `R3-LEGAL-QUESTIONS-20261104.md`: unresolved AGPL/Artifex written questions.
- `R3-REPORT-20261104.md`: confirmed evidence and blocked launch conditions.
- `R4-HANDOFF-20261104.md`: standalone next-stage request.

Artifex official sources: https://github.com/ArtifexSoftware/mupdf/tree/1.28.1/platform/wasm ; https://artifex.com/licensing

**Gate remains `BLOCKED_PENDING_ARTIFEX_LEGAL_REVIEW`.** The private audit and source checkout do **not** authorize any AGPL/operating release.
