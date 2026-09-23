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

actual="$(expand_port_mappings '1234:443,8443:443')"
[[ "$actual" == $'1234\t443\n8443\t443' ]]

actual="$(expand_port_mappings '1000-1002:2000-2002')"
[[ "$actual" == $'1000\t2000\n1001\t2001\n1002\t2002' ]]

actual="$(expand_port_mappings '3000-3002:443')"
[[ "$actual" == $'3000\t443\n3001\t443\n3002\t443' ]]

actual="$(expand_port_spec '1234:443,8443:443' | paste -sd, -)"
[[ "$actual" == "1234,8443" ]]

! expand_port_mappings '1000-1002:2000-2001' >/dev/null
! expand_port_mappings '1234:443,1234:8443' >/dev/null
! expand_port_mappings '1234:' >/dev/null

printf 'HAProxy port parser tests passed.\n'
