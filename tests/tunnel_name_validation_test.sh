#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

validate_tunnel_name 'web-forward'
validate_tunnel_name 'web_forward_01'
validate_tunnel_name 'A'
validate_tunnel_name '12345678901234567890123456789012'

! validate_tunnel_name ''
! validate_tunnel_name 'web forward'
! validate_tunnel_name 'web.forward'
! validate_tunnel_name '-web'
! validate_tunnel_name '_web'
! validate_tunnel_name '123456789012345678901234567890123'

# Invalid requests must be rejected before downloading/installing a runtime.
install_called=0
require_root() { :; }
install_realm_runtime() { install_called=1; }
if create_realm_tunnel_noninteractive 'bad name' '10.0.0.2' '1234:443' 'both' >/dev/null 2>&1; then
  echo 'Expected invalid tunnel name to fail.' >&2
  exit 1
fi
[[ "$install_called" -eq 0 ]]

printf 'Tunnel name validation tests passed.\n'
