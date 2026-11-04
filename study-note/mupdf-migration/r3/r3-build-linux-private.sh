#!/usr/bin/env bash
# R3 operator-initiated PRIVATE Linux build. Never used in CI or public hosting.
set -euo pipefail
if [[ "${1:-}" != "--preflight" && "${1:-}" != "--build" ]]; then
  echo "Usage: R3_PRIVATE_DIR=/private/path bash r3-build-linux-private.sh --preflight|--build"
  exit 2
fi
MODE="$1"
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "BLOCKED: Official MuPDF 1.28.1 WASM recipe is verified on Linux; current host is not Linux."
  exit 3
fi
: "${R3_PRIVATE_DIR:?Set a private isolated build root; NEVER use the public repository}"
if [[ "${R3_PRIVATE_DIR%/}" != */.r3-private ]]; then
  echo "BLOCKED: R3_PRIVATE_DIR must reside in the git-ignored .r3-private tree"
  exit 3
fi
SRC="$R3_PRIVATE_DIR/mupdf-1.28.1-src"
if [[ ! -d "$SRC/.git" ]]; then
  echo "BLOCKED: privately cloned exact release source not found"
  exit 3
fi
if [[ "$(git -C "$SRC" rev-parse HEAD)" != "20061bd45183f5a2bff8f43675e4da91e5ac2901" ]]; then
  echo "BLOCKED: MuPDF upstream revision is not pinned 1.28.1 commit"
  exit 3
fi
if git -C "$SRC" submodule status | grep -E '^[-+U]' >/dev/null; then
  echo "BLOCKED: upstream submodule revision mismatch"
  exit 3
fi
for tool in bash make emcc npm node sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "BLOCKED: missing official Linux build prerequisite: $tool"
    exit 3
  fi
done
if ! emcc --version | head -n 1 | grep -q '4.0.8'; then
  echo "BLOCKED: emcc must be Emscripten 4.0.8"
  exit 3
fi
if [[ "$MODE" == "--build" && "${R3_ACK_PRIVATE_BUILD:-}" != "YES" ]]; then
  echo "BLOCKED: R3_ACK_PRIVATE_BUILD=YES required for upstream prepack"
  exit 3
fi
echo "R3_PRIVATE_LINUX_BUILD_PREREQUISITES_PASS"
if [[ "$MODE" == "--preflight" ]]; then exit 0; fi
# All modifying commands below run only within the isolated ignored checkout.
cd "$SRC/platform/wasm"
# Release 1.28.1 lacks a package-lock.json: npm resolution not pinned.
npm install --ignore-scripts --no-audit --no-fund
npm run prepack
node "${R3_TOOLING_PATH:?Set R3_TOOLING_PATH to tracked R3 tooling}/r3-compare-built.cjs" \
  "$SRC/platform/wasm/dist" "$R3_PRIVATE_DIR/build-comparison.json"
