#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

valid_ipv4_cidr 0.0.0.0/0
valid_ipv4_cidr 203.0.113.10
valid_ipv4_cidr 10.144.144.0/24
! valid_ipv4_cidr 999.1.1.1
! valid_ipv4_cidr 192.0.2.0/33

[[ "$(iptables_protocols udp)" == "udp" ]]
[[ "$(iptables_protocols tcp)" == "tcp" ]]
[[ "$(iptables_protocols both)" == $'tcp\nudp' ]]
! iptables_protocols invalid >/dev/null 2>&1

validate_iptables_interface any

grep -Fq -- '--ctstate DNAT' "${ROOT_DIR}/xraymesh.sh"
! grep -Fq -- '--ctstatus DNAT' "${ROOT_DIR}/xraymesh.sh"
grep -Fq 'iptables_tunnel_menu()' "${ROOT_DIR}/xraymesh.sh"
grep -Fq 'iptables) require_root; require_linux; iptables_tunnel_menu' "${ROOT_DIR}/xraymesh.sh"

printf 'iptables tunnel helper tests passed.\n'
