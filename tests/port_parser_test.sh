#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

actual="$(expand_port_spec '80,443,8000-8002' | paste -sd, -)"
[[ "$actual" == "80,443,8000,8001,8002" ]]

actual="$(expand_port_spec '443,443,444' | paste -sd, -)"
[[ "$actual" == "443,444" ]]

! expand_port_spec '0,70000' >/dev/null
! expand_port_spec '9000-8000' >/dev/null
! expand_port_spec 'invalid' >/dev/null

printf 'HAProxy port parser tests passed.\n'
