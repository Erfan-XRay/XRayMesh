#!/usr/bin/env bash
# The *_DIR overrides below are read by xraymesh.sh when it is sourced.
# shellcheck disable=SC2034
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

HAPROXY_TUNNEL_DIR="${TMP_DIR}/haproxy-tunnels"
IPTABLES_TUNNEL_DIR="${TMP_DIR}/iptables-tunnels"
GOST_TUNNEL_DIR="${TMP_DIR}/gost-tunnels"
REALM_TUNNEL_DIR="${TMP_DIR}/realm-tunnels"
ICMP_LINK_DIR="${TMP_DIR}/icmp-links"

# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"
set +e +u +o pipefail

SYSTEMCTL_LOG="${TMP_DIR}/systemctl.log"
systemctl() { printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"; [[ "$1" == "is-active" ]] && echo active; return 0; }
get_web_port() { echo 8443; }
apply_haproxy_config() { echo "applied haproxy" >> "$SYSTEMCTL_LOG"; }
apply_iptables_config() { echo "applied iptables" >> "$SYSTEMCTL_LOG"; }
apply_gost_config() { echo "applied gost" >> "$SYSTEMCTL_LOG"; return 1; }
apply_realm_config() { echo "applied realm" >> "$SYSTEMCTL_LOG"; }

fail_test() { echo "FAIL: $*" >&2; exit 1; }

# No tunnels at all.
out="$(tunnels_overview 2>&1)"
[[ "$out" == *"No port-forwarding tunnels are saved"* ]] || fail_test "empty overview: $out"

save_haproxy_tunnel "panel_clash" "10.14.14.2" "8440-8450"
save_iptables_tunnel "game" "10.14.14.3" "27015-27020" "udp"
save_gost_tunnel "udp_only" "10.14.14.4" "8443" "udp"

out="$(tunnels_overview 2>&1)"
[[ "$out" == *"panel_clash"*"10.14.14.2"*"tcp"*"8440-8450"* ]] || fail_test "haproxy row: $out"
[[ "$out" == *"game"*"udp"*"27015-27020"* ]] || fail_test "iptables row: $out"
[[ "$out" == *"HAProxy tunnel 'panel_clash' listens on TCP port 8443"* ]] || fail_test "clash warning: $out"
# A UDP-only forward on the panel's port does not block the (TCP) panel.
[[ "$out" != *"GOST tunnel 'udp_only' listens"* ]] || fail_test "udp tunnel flagged: $out"
[[ "$out" != *"Realm"* ]] || fail_test "realm shown without definitions: $out"
tunnels_overview >/dev/null 2>&1
(( TUNNELS_SAVED == 3 )) || fail_test "TUNNELS_SAVED=$TUNNELS_SAVED"

# Re-apply touches only the kinds with definitions and reports a failure.
: > "$SYSTEMCTL_LOG"
reapply_tunnels "Prefix: " > "${TMP_DIR}/reapply.out" 2>&1 && fail_test "reapply should fail when GOST fails"
grep -qx "applied haproxy" "$SYSTEMCTL_LOG" || fail_test "haproxy not applied"
grep -qx "applied iptables" "$SYSTEMCTL_LOG" || fail_test "iptables not applied"
grep -qx "applied gost" "$SYSTEMCTL_LOG" || fail_test "gost not applied"
grep -q "applied realm" "$SYSTEMCTL_LOG" && fail_test "realm applied without definitions"
grep -q "Prefix: GOST tunnels need attention." "${TMP_DIR}/reapply.out" || fail_test "gost warning missing"

# Nothing set up: stop says so and touches no unit.
: > "$SYSTEMCTL_LOG"
out="$(stop_all_tunnels 2>&1)"
[[ "$out" == *"No tunnel services are set up"* ]] || fail_test "stop with nothing: $out"
[[ ! -s "$SYSTEMCTL_LOG" ]] || fail_test "stop touched units: $(cat "$SYSTEMCTL_LOG")"

# Definitions survive a stop.
[[ -f "${HAPROXY_TUNNEL_DIR}/panel_clash.env" && -f "${IPTABLES_TUNNEL_DIR}/game.env" ]] || fail_test "definitions removed"

echo "tunnels overview tests passed"
