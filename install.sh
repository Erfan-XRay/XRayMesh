#!/usr/bin/env bash
# XRayMesh Installer & Launcher Wrapper
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/xraymesh.sh" ]]; then
    exec bash "${SCRIPT_DIR}/xraymesh.sh" "$@"
else
    exec bash <(curl -fsSL "https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/beta/xraymesh.sh") "$@"
fi
