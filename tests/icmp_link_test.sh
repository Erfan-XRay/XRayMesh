#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

ICMP_LINK_DIR="${TMP_DIR}/icmp-links"
HAPROXY_TUNNEL_DIR="${TMP_DIR}/haproxy-tunnels"
IPTABLES_TUNNEL_DIR="${TMP_DIR}/iptables-tunnels"
GOST_TUNNEL_DIR="${TMP_DIR}/gost-tunnels"
REALM_TUNNEL_DIR="${TMP_DIR}/realm-tunnels"

# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

# set -e ignores commands negated with "!", so negative checks go through this helper.
refute() {
  if "$@"; then
    echo "Expected failure: $*" >&2
    exit 1
  fi
}

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
refute backpack_asset_sha256 "backpack_linux_s390x.tar.gz" >/dev/null

# Link index -> /30: the dialler takes .1 and the listener .2, and neighbours never overlap.
[[ "$(icmp_link_addrs 0)" == $'10.214.0.1\t10.214.0.2' ]]
[[ "$(icmp_link_addrs 1)" == $'10.214.0.5\t10.214.0.6' ]]
[[ "$(icmp_link_addrs 64)" == $'10.214.1.1\t10.214.1.2' ]]
[[ "$(icmp_link_addrs 16383)" == $'10.214.255.253\t10.214.255.254' ]]

valid_icmp_index 0
valid_icmp_index 16383
refute valid_icmp_index 16384
refute valid_icmp_index -1
refute valid_icmp_index abc
valid_icmp_token "0123456789abcdef0123456789abcdef"
refute valid_icmp_token "short"
refute valid_icmp_token 'bad"token;rm -rf /'
valid_icmp_host "185.100.200.30"
valid_icmp_host "kharej.example.com"
valid_icmp_host "2001:db8::1"
refute valid_icmp_host 'evil"host'
refute valid_icmp_host "host name"
valid_icmp_link_name "in-42"
valid_icmp_link_name "out-16383"
refute valid_icmp_link_name "../etc/passwd"

# Both ends of one link, as each server would write them.
token="0123456789abcdef0123456789abcdef0123456789abcdef"
save_icmp_link "in-42" "listen" "" "20042" "$token" "42"
save_icmp_link "out-7" "dial" "185.100.200.30" "20007" "$token" "7"
save_icmp_link "out-9" "dial" "2001:db8::1" "20009" "$token" "9"

[[ "$(icmp_index_owner 42)" == "in-42" ]]
[[ "$(icmp_index_owner 7)" == "out-7" ]]
refute icmp_index_owner 8 >/dev/null

for idx in $(seq 1 20); do
  free="$(icmp_free_index)"
  valid_icmp_index "$free"
  refute icmp_index_owner "$free" >/dev/null
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
refute icmp_link_claimed "${ICMP_LINK_DIR}/in-42.env"
sed -i 's/^CLAIMED=.*/CLAIMED=yes/' "${ICMP_LINK_DIR}/in-42.env"
icmp_link_claimed "${ICMP_LINK_DIR}/in-42.env"

# ------------------------------------------------------------------------------
# PCK links: the same link files with the pck carrier and a real TCP port.
# ------------------------------------------------------------------------------
is_backpack_proto icmp
is_backpack_proto pck
refute is_backpack_proto faketcp
[[ "$(backpack_carrier_for_proto icmp)" == "xdi" ]]
[[ "$(backpack_carrier_for_proto pck)" == "pck" ]]
refute backpack_carrier_for_proto udp >/dev/null
[[ "$(invite_link_key icmp)" == "icmp" ]]
[[ "$(invite_link_key pck)" == "link" ]]
valid_backpack_carrier xdi
valid_backpack_carrier pck
refute valid_backpack_carrier kcp

save_icmp_link "in-100" "listen" "" "24567" "$token" "100" "pck"
save_icmp_link "out-101" "dial" "185.100.200.30" "24568" "$token" "101" "pck"
generate_icmp_link_toml "${ICMP_LINK_DIR}/in-100.env"
generate_icmp_link_toml "${ICMP_LINK_DIR}/out-101.env"
grep -qx 'carrier  = "pck"' "${ICMP_LINK_DIR}/in-100.toml"
grep -qx 'addr     = "0.0.0.0:24567"' "${ICMP_LINK_DIR}/in-100.toml"
grep -qx "mtu      = ${PCK_LINK_MTU}" "${ICMP_LINK_DIR}/in-100.toml"
grep -qx 'addr     = "185.100.200.30:24568"' "${ICMP_LINK_DIR}/out-101.toml"
grep -qx 'carrier  = "pck"' "${ICMP_LINK_DIR}/out-101.toml"
# ICMP link files are unchanged by PCK support: no extra keys, so running links are not restarted.
[[ "$(tail -n1 "${ICMP_LINK_DIR}/in-42.toml")" == 'peer_ip  = "10.214.0.169"' ]]
refute grep -q '^mtu' "${ICMP_LINK_DIR}/in-42.toml"

# Links written before PCK support have no CARRIER line and are ICMP links.
[[ "$(icmp_link_carrier "${ICMP_LINK_DIR}/in-100.env")" == "pck" ]]
sed -i '/^CARRIER=/d' "${ICMP_LINK_DIR}/out-7.env"
[[ "$(icmp_link_carrier "${ICMP_LINK_DIR}/out-7.env")" == "xdi" ]]
generate_icmp_link_toml "${ICMP_LINK_DIR}/out-7.env"
grep -qx 'carrier  = "xdi"' "${ICMP_LINK_DIR}/out-7.toml"

# Only listening pck links own a TCP port; ICMP link "ports" are not TCP ports.
[[ "$(pck_link_port_owner 24567)" == "in-100" ]]
refute pck_link_port_owner 24568 >/dev/null
refute pck_link_port_owner 20042 >/dev/null
check_pck_link_ports "443,8000-8010" 2>/dev/null
refute check_pck_link_ports "443,24560-24570" 2>/dev/null
# Only the listen side of a mapping is bound on this server.
check_pck_link_ports "1234:24567" 2>/dev/null
refute validate_haproxy_ports "web" "24567" >/dev/null 2>&1
refute validate_gost_ports "web" "24567" "tcp" >/dev/null 2>&1
validate_gost_ports "web" "24567" "udp" >/dev/null 2>&1
refute validate_realm_ports "web" "24567" "both" >/dev/null 2>&1

# A new pck link avoids ports that links and tunnels already use.
refute pck_port_available 24567
mkdir -p "$HAPROXY_TUNNEL_DIR"
save_haproxy_tunnel "web" "10.144.144.2" "25000-25010"
refute pck_port_available 25005
for _ in $(seq 1 20); do
  port="$(pck_free_port)"
  (( port >= PCK_PORT_MIN && port <= PCK_PORT_MAX ))
  refute pck_link_port_owner "$port" >/dev/null
  (( port < 25000 || port > 25010 ))
done

echo "ICMP/PCK link helper tests passed."
