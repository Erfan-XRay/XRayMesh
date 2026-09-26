#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

ICMP_LINK_DIR="${TMP_DIR}/icmp-links"

# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

declare -F install_backpack_runtime >/dev/null
declare -F apply_icmp_links >/dev/null
declare -F ensure_icmp_listen_link >/dev/null
declare -F create_icmp_dial_link >/dev/null
declare -F delete_icmp_link >/dev/null
declare -F prune_icmp_links >/dev/null
declare -F remove_all_icmp_links >/dev/null

# Every supported architecture has a pinned checksum.
for asset in backpack_linux_amd64.tar.gz backpack_linux_arm64.tar.gz backpack_linux_armv7.tar.gz backpack_linux_386.tar.gz; do
  [[ "$(backpack_asset_sha256 "$asset")" =~ ^[0-9a-f]{64}$ ]]
done
! backpack_asset_sha256 "backpack_linux_s390x.tar.gz" >/dev/null

# Link index -> /30: the dialler takes .1 and the listener .2, and neighbours never overlap.
[[ "$(icmp_link_addrs 0)" == $'10.214.0.1\t10.214.0.2' ]]
[[ "$(icmp_link_addrs 1)" == $'10.214.0.5\t10.214.0.6' ]]
[[ "$(icmp_link_addrs 64)" == $'10.214.1.1\t10.214.1.2' ]]
[[ "$(icmp_link_addrs 16383)" == $'10.214.255.253\t10.214.255.254' ]]

valid_icmp_index 0
valid_icmp_index 16383
! valid_icmp_index 16384
! valid_icmp_index -1
! valid_icmp_index abc
valid_icmp_token "0123456789abcdef0123456789abcdef"
! valid_icmp_token "short"
! valid_icmp_token 'bad"token;rm -rf /'
valid_icmp_host "185.100.200.30"
valid_icmp_host "kharej.example.com"
valid_icmp_host "2001:db8::1"
! valid_icmp_host 'evil"host'
! valid_icmp_host "host name"
valid_icmp_link_name "in-42"
valid_icmp_link_name "out-16383"
! valid_icmp_link_name "../etc/passwd"

# Both ends of one link, as each server would write them.
token="0123456789abcdef0123456789abcdef0123456789abcdef"
save_icmp_link "in-42" "listen" "" "20042" "$token" "42"
save_icmp_link "out-7" "dial" "185.100.200.30" "20007" "$token" "7"
save_icmp_link "out-9" "dial" "2001:db8::1" "20009" "$token" "9"

[[ "$(icmp_index_owner 42)" == "in-42" ]]
[[ "$(icmp_index_owner 7)" == "out-7" ]]
! icmp_index_owner 8 >/dev/null

for idx in $(seq 1 20); do
  free="$(icmp_free_index)"
  valid_icmp_index "$free"
  ! icmp_index_owner "$free" >/dev/null
done

generate_icmp_link_toml "${ICMP_LINK_DIR}/in-42.env"
generate_icmp_link_toml "${ICMP_LINK_DIR}/out-7.env"
generate_icmp_link_toml "${ICMP_LINK_DIR}/out-9.env"

grep -qx 'mode     = "listen"' "${ICMP_LINK_DIR}/in-42.toml"
grep -qx 'addr     = "0.0.0.0:20042"' "${ICMP_LINK_DIR}/in-42.toml"
grep -qx 'carrier  = "xdi"' "${ICMP_LINK_DIR}/in-42.toml"
grep -qx 'iface    = "xrmi42"' "${ICMP_LINK_DIR}/in-42.toml"
grep -qx 'local_ip = "10.214.0.170/30"' "${ICMP_LINK_DIR}/in-42.toml"
grep -qx 'peer_ip  = "10.214.0.169"' "${ICMP_LINK_DIR}/in-42.toml"
grep -qx "token    = \"${token}\"" "${ICMP_LINK_DIR}/in-42.toml"

grep -qx 'mode     = "dial"' "${ICMP_LINK_DIR}/out-7.toml"
grep -qx 'addr     = "185.100.200.30:20007"' "${ICMP_LINK_DIR}/out-7.toml"
grep -qx 'local_ip = "10.214.0.29/30"' "${ICMP_LINK_DIR}/out-7.toml"
grep -qx 'peer_ip  = "10.214.0.30"' "${ICMP_LINK_DIR}/out-7.toml"
grep -qx 'addr     = "\[2001:db8::1\]:20009"' "${ICMP_LINK_DIR}/out-9.toml"

# Link files hold the token, so they must not be world-readable.
if [[ "$(uname -s)" == "Linux" ]]; then
  [[ "$(stat -c '%a' "${ICMP_LINK_DIR}/in-42.env")" == "600" ]]
  [[ "$(stat -c '%a' "${ICMP_LINK_DIR}/in-42.toml")" == "600" ]]
fi

# A listen link is unclaimed until packets have crossed it; the claim is then remembered.
! icmp_link_claimed "${ICMP_LINK_DIR}/in-42.env"
sed -i 's/^CLAIMED=.*/CLAIMED=yes/' "${ICMP_LINK_DIR}/in-42.env"
icmp_link_claimed "${ICMP_LINK_DIR}/in-42.env"

echo "ICMP link helper tests passed."
