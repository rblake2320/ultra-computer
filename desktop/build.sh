#!/usr/bin/env bash
# =============================================================================
# build.sh — Build Ultra Computer desktop apps for all platforms
# =============================================================================
# Usage:
#   ./build.sh               # build all platforms
#   ./build.sh --win         # Windows only
#   ./build.sh --mac         # macOS only
#   ./build.sh --linux       # Linux only
#
# Prerequisites:
#   - Node.js 20+
#   - npm
#   - For macOS builds on Mac: Xcode Command Line Tools
#   - For Windows builds on non-Windows: Wine (via electron-builder docs)
#   - Icons generated from desktop/icons/icon.svg (see README.md)
# =============================================================================

set -euo pipefail

# ── Resolve directories ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESKTOP_DIR="${SCRIPT_DIR}"

echo "======================================================"
echo "  Ultra Computer Desktop Builder"
echo "======================================================"
echo "  Project root : ${PROJECT_ROOT}"
echo "  Desktop dir  : ${DESKTOP_DIR}"
echo ""

# ── Step 1: Build the Express/Vite app ────────────────────────────────────────
echo ">>> [1/3] Building server + client (npm run build) ..."
cd "${PROJECT_ROOT}"

if [ ! -f "package.json" ]; then
  echo "ERROR: package.json not found in ${PROJECT_ROOT}"
  exit 1
fi

npm run build
echo "    ✓ Server + client built successfully."
echo ""

# ── Step 2: Install desktop dependencies ──────────────────────────────────────
echo ">>> [2/3] Installing Electron dependencies ..."
cd "${DESKTOP_DIR}"
npm install
echo "    ✓ Dependencies installed."
echo ""

# ── Step 3: Build Electron packages ───────────────────────────────────────────
echo ">>> [3/3] Packaging with electron-builder ..."

PLATFORM="${1:-}"

case "${PLATFORM}" in
  --win)
    echo "    Target: Windows"
    npm run build:win
    ;;
  --mac)
    echo "    Target: macOS"
    npm run build:mac
    ;;
  --linux)
    echo "    Target: Linux"
    npm run build:linux
    ;;
  "")
    echo "    Target: all platforms"
    npm run build:all
    ;;
  *)
    echo "ERROR: Unknown platform '${PLATFORM}'. Use --win, --mac, or --linux."
    exit 1
    ;;
esac

echo ""
echo "======================================================"
echo "  Build complete!"
echo "  Output: ${DESKTOP_DIR}/release/"
echo "======================================================"
