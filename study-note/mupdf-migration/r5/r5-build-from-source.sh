#!/usr/bin/env bash
# R5 exact-source private Linux MuPDF C-to-WASM build. NEVER uploads or publishes dist.
set -euo pipefail
[[ "$#" == 1 && "$1" =~ ^--(prepare|build)$ ]] || {
  echo 'Usage: R5_PRIVATE_ROOT=/abs/parent/r5-private R5_EMSDK=/abs/emsdk bash r5-build-from-source.sh --prepare|--build';exit 2;
}
[[ "$(uname -s)" == "Linux" ]] || { echo 'BLOCKED_LINUX_ONLY';exit 3; }
: "$R5_PRIVATE_ROOT"
[[ "$R5_PRIVATE_ROOT" == */r5-private ]] || { echo 'BLOCKED_PRIVATE_PATH';exit 3; }
HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$R5_PRIVATE_ROOT/mupdf-1.28.1-source"
COMMIT='20061bd45183f5a2bff8f43675e4da91e5ac2901'
LOCK="$HERE/source/mupdf-wasm-package-lock.json"
[[ -f "$LOCK" ]] || { echo 'BLOCKED_PINNED_LOCK_MISSING';exit 3; }
mkdir -p "$R5_PRIVATE_ROOT"
if [[ ! -d "$SOURCE/.git" ]]; then
  if [[ -e "$SOURCE" ]]; then echo 'BLOCKED_SOURCE_PATH_ALREADY_EXISTS';exit 3;fi
  git clone --depth 1 --branch 1.28.1 https://github.com/ArtifexSoftware/mupdf.git "$SOURCE"
fi
[[ "$(git -C "$SOURCE" rev-parse HEAD)" == "$COMMIT" ]] || {
 echo 'BLOCKED_WRONG_MUPDF_SOURCE_REVISION';exit 3;
}
git -C "$SOURCE" submodule update --init --recursive
if git -C "$SOURCE" submodule status --recursive | grep -Eq '^[-+U]'; then
 echo 'BLOCKED_MISSING_OR_DIRTY_SUBMODULE_REVISION';exit 3
fi
R3_MANIFEST="$HERE/../r3/r3-draft-source-manifest.json" node - "$SOURCE" <<'NODE'
const fs=require('fs'),cp=require('child_process');
const manifest=JSON.parse(fs.readFileSync(process.env.R3_MANIFEST,'utf8'));
const root=process.argv[2];
for(const mod of manifest.mupdf.submodules){
 const sha=cp.execFileSync('git',['-C',root+'/'+mod.path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(sha!==mod.commit)throw Error('Unexpected submodule revision in '+mod.path);
}
console.log('R5_CORE_AND_18_THIRDPARTY_REVISIONS_MATCH');
NODE
echo 'R5_PUBLIC_SOURCE_REFS_PREPARED_FROM_IMMUTABLE_COMMIT'
if [[ "$1" == "--prepare" ]]; then exit 0; fi
[[ "$R5_ACK_PRIVATE_BUILD" == 'YES' ]] || { echo 'BLOCKED_PRIVATE_BUILD_ACK_REQUIRED';exit 3; }
: "$R5_EMSDK"
[[ -f "$R5_EMSDK/emsdk_env.sh" ]] || { echo 'BLOCKED_EMSDK_MISSING';exit 3; }
export EMSDK="$R5_EMSDK"
# Official MuPDF tools/build.sh installs and activates pinned SDK.
source "$R5_EMSDK/emsdk_env.sh" >/dev/null
emcc --version | head -n 1 | grep -q '4.0.8' || {
 echo 'BLOCKED_EMCC_4_0_8_REQUIRED';exit 3;
}
for required in npm node make sha256sum bash git; do
 command -v "$required" >/dev/null || { echo "BLOCKED_MISSING_TOOL_$required";exit 3; }
done
cd "$SOURCE/platform/wasm"
# Do not modify the R3 checkout. Only the isolated R5 core clone is altered.
cp "$LOCK" package-lock.json
npm ci --ignore-scripts --no-audit --no-fund
export BUILD='small'
export FEATURES='brotli=no mujs=no extract=no xps=no svg=no html=no'
export DEFINES='-DTOFU -DTOFU_CJK_EXT -DFZ_ENABLE_HYPHEN=0'
npm run prepack
node "$HERE/r5-verify-built.cjs" "$SOURCE/platform/wasm/dist"
echo 'R5_PRIVATE_C_TO_WASM_BUILD_COMPLETED_NO_PUBLIC_BINARY'
