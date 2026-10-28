#!/usr/bin/env bash
# Builds Linux, Windows and Mac packages from a Linux machine into release/.
# Mac comes out as unsigned .zip files (Apple Silicon and Intel); a .dmg needs a real Mac (npm run dist:mac).
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf release
npx vite build

echo "==> Linux"
npx electron-builder --linux AppImage --x64

echo "==> Mac (zip)"
npx electron-builder --mac zip --arm64 --x64

echo "==> Windows"
bash scripts/dist-win-container.sh

echo
echo "Listo. Archivos para entregar:"
ls -1 release | grep -E '\.(AppImage|exe|zip|dmg)$'
