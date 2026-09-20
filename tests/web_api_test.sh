#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

[[ "$VERSION" == "1.8.0" ]]
[[ "$DEFAULT_WEB_PORT" == "11080" ]]
[[ "$(get_web_port)" == "11080" ]]

# Test function declarations
declare -F install_web_runtime >/dev/null
declare -F write_web_services >/dev/null
declare -F get_web_port >/dev/null
declare -F get_server_ip >/dev/null
declare -F generate_web_token >/dev/null
declare -F set_web_password >/dev/null
declare -F configure_web_port >/dev/null
declare -F web_menu >/dev/null

# Test static assets exist
test -f "${ROOT_DIR}/web/server.py"
test -f "${ROOT_DIR}/web/static/index.html"
test -f "${ROOT_DIR}/systemd/xraymesh-web.service"
test -f "${ROOT_DIR}/systemd/xraymesh-iperf.service"

grep -Fq 'xraymesh-web.service' "${ROOT_DIR}/xraymesh.sh"
grep -Fq 'xraymesh-iperf.service' "${ROOT_DIR}/xraymesh.sh"
grep -Fq 'web_menu' "${ROOT_DIR}/xraymesh.sh"

printf 'Web UI & speedtest helper tests passed.\n'
