#!/usr/bin/env bash
# Builds the Windows installer and portable .exe from Linux or macOS.
# electron-builder needs Wine for Windows targets, so it runs inside the official builder image.
set -euo pipefail

cd "$(dirname "$0")/.."

ENGINE="$(command -v podman || command -v docker || true)"
if [ -z "$ENGINE" ]; then
  echo "Necesitas podman o docker para compilar Windows desde este sistema." >&2
  exit 1
fi

IMAGE="docker.io/electronuserland/builder:wine"
mkdir -p "$HOME/.cache/electron" "$HOME/.cache/electron-builder"

npx vite build

# label=disable avoids SELinux relabeling of the project folder (Fedora).
"$ENGINE" run --rm --security-opt label=disable \
  -v "$PWD":/project \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  -w /project "$IMAGE" \
  npx electron-builder --win nsis portable --x64
