#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

GOST_TUNNEL_DIR="${TMP_DIR}/gost-tunnels"
GOST_CONFIG_FILE="${TMP_DIR}/gost.json"
mkdir -p "$GOST_TUNNEL_DIR"

# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

# Test function declarations
declare -F gost_arch_asset >/dev/null
declare -F install_gost_runtime >/dev/null
declare -F write_gost_service >/dev/null
declare -F validate_gost_ports >/dev/null
declare -F save_gost_tunnel >/dev/null
declare -F generate_gost_config >/dev/null
declare -F apply_gost_config >/dev/null
declare -F create_gost_tunnel >/dev/null
declare -F list_gost_tunnels >/dev/null
declare -F edit_gost_tunnel >/dev/null
declare -F delete_gost_tunnel >/dev/null
declare -F gost_tunnel_menu >/dev/null
declare -F create_gost_tunnel_noninteractive >/dev/null
declare -F delete_gost_tunnel_noninteractive >/dev/null

# Test architecture asset mapping
[[ -n "$(gost_arch_asset)" ]]

save_gost_tunnel "web_relay" "10.14.14.2" "80,443" "both"
save_gost_tunnel "game_udp" "10.14.14.3" "7777-7778" "udp"

test -f "${GOST_TUNNEL_DIR}/web_relay.env"
test -f "${GOST_TUNNEL_DIR}/game_udp.env"

generate_gost_config

test -f "$GOST_CONFIG_FILE"

# Validate generated JSON syntax and structure
if command -v python3 >/dev/null 2>&1 && python3 -c "import json" >/dev/null 2>&1; then
  python3 -c '
import json, sys
with open(sys.argv[1], "r") as f:
    cfg = json.load(f)
assert "services" in cfg, "Missing services in config"
services = cfg["services"]
assert len(services) == 6, f"Expected 6 services, got {len(services)}"

names = [s["name"] for s in services]
assert "web_relay-tcp-80" in names
assert "web_relay-udp-80" in names
assert "web_relay-tcp-443" in names
assert "web_relay-udp-443" in names
assert "game_udp-udp-7777" in names
assert "game_udp-udp-7778" in names
' "$GOST_CONFIG_FILE"
elif command -v node >/dev/null 2>&1; then
  node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!cfg.services || cfg.services.length !== 6) process.exit(1);
const names = cfg.services.map(s => s.name);
["web_relay-tcp-80", "web_relay-udp-80", "web_relay-tcp-443", "web_relay-udp-443", "game_udp-udp-7777", "game_udp-udp-7778"].forEach(n => {
  if (!names.includes(n)) process.exit(1);
});
' "$GOST_CONFIG_FILE"
fi

# Test port collision validation
! validate_gost_ports "new_tunnel" "80" "both" >/dev/null 2>&1
! validate_gost_ports "new_tunnel" "80" "tcp" >/dev/null 2>&1
validate_gost_ports "new_tunnel" "9000" "both" >/dev/null

# Verify web integration strings
grep -Fq 'GOST_TUNNEL_DIR' "${ROOT_DIR}/web/server.py"
grep -Fq '/api/tunnels/gost/create' "${ROOT_DIR}/web/server.py"
grep -Fq '/api/tunnels/gost/delete' "${ROOT_DIR}/web/server.py"
grep -Fq 'gostTunnelsContainer' "${ROOT_DIR}/web/static/index.html"
grep -Fq 'modalGost' "${ROOT_DIR}/web/static/index.html"
grep -Fq 'submitCreateGost' "${ROOT_DIR}/web/static/index.html"

printf 'GOST tunnel helper and configuration tests passed.\n'
