#!/usr/bin/env bash
# XRayMesh - EasyTier mesh network manager
# Developed by ErfanXRay

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP="XRayMesh"
readonly VERSION="1.4.1"
readonly OWNER="ErfanXRay"
readonly INSTALL_DIR="/opt/xraymesh"
readonly BIN_DIR="${INSTALL_DIR}/bin"
readonly CONFIG_FILE="/etc/xraymesh/config.env"
readonly SERVICE_FILE="/etc/systemd/system/xraymesh.service"
readonly LOG_TAG="xraymesh"
readonly FALLBACK_EASYTIER_VERSION="v2.6.4"

if [[ -t 1 ]]; then
  readonly RESET=$'\033[0m' BOLD=$'\033[1m' DIM=$'\033[2m'
  readonly CYAN=$'\033[38;5;45m' BLUE=$'\033[38;5;75m'
  readonly PURPLE=$'\033[38;5;141m' PINK=$'\033[38;5;213m'
  readonly GREEN=$'\033[38;5;84m' YELLOW=$'\033[38;5;220m'
  readonly RED=$'\033[38;5;203m' GRAY=$'\033[38;5;245m'
else
  readonly RESET="" BOLD="" DIM="" CYAN="" BLUE="" PURPLE="" PINK="" GREEN="" YELLOW="" RED="" GRAY=""
fi

IN_MAIN_MENU=0

trap 'printf "\n%bError on line %s. Check the logs for details.%b\n" "$RED" "$LINENO" "$RESET" >&2' ERR

handle_interrupt() {
  if (( IN_MAIN_MENU )); then
    printf '\n%b  XRayMesh closed.%b\n' "$CYAN" "$RESET"
    exit 0
  else
    printf '\n%b  Interrupted — returning to the main menu...%b\n' "$YELLOW" "$RESET"
  fi
}

trap 'handle_interrupt' INT

say() { printf '%b%s%b\n' "$2" "$1" "$RESET"; }
ok() { say "  [OK] $*" "$GREEN"; }
warn() { say "  ! $*" "$YELLOW"; }
fail() { say "  [ERROR] $*" "$RED" >&2; }
info() { say "  > $*" "$BLUE"; }
pause() { read -r -p "  Press Enter to continue..." _ || true; }

section() {
  printf '\n%b  %s%b\n' "$BOLD$PURPLE" "$1" "$RESET"
  printf '%b  ------------------------------------------------------------%b\n' "$DIM$BLUE" "$RESET"
}

run_screen() {
  # Run each screen in its own signal boundary. Ctrl+C exits only this screen,
  # while the parent menu remains alive and redraws immediately.
  local status=0
  (
    trap 'exit 130' INT
    "$@"
  ) || status=$?
  if (( status == 130 )); then
    printf '\n%b  Returned to the main menu.%b\n' "$YELLOW" "$RESET"
    sleep 0.5
  elif (( status != 0 )); then
    warn "The operation ended with status ${status}."
    pause
  fi
  return 0
}

header() {
  clear 2>/dev/null || true
  printf '%b' "$BOLD$CYAN"
  if command -v figlet >/dev/null 2>&1; then
    figlet -f slant -w 120 "$APP" 2>/dev/null || figlet "$APP"
  else
    cat <<'ART'
 __  __ ____              __  __           _
 \ \/ // __ \____ ___  __/  |/  /___  _____/ /_
  \  // /_/ / __ `/ / / / /|_/ / __ \/ ___/ __ \
  / // _, _/ /_/ / /_/ / /  / / /_/ (__  ) / / /
 /_//_/ |_|\__,_/\__, /_/  /_/\____/____/_/ /_/
                /____/
ART
  fi
  printf '%b' "$RESET"
  printf '%b  EasyTier Mesh Manager%b  %b|%b  v%s  %b|%b  Developed by %s\n' \
    "$BOLD$PINK" "$RESET" "$GRAY" "$RESET" "$VERSION" "$GRAY" "$RESET" "$OWNER"
  printf '%b  ============================================================%b\n\n' "$DIM$BLUE" "$RESET"
}

require_root() {
  if (( EUID != 0 )); then
    fail "This command must be run as root: sudo bash $0"
    exit 1
  fi
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || { fail "Only Linux is supported."; exit 1; }
  command -v systemctl >/dev/null || { fail "systemd was not found on this system."; exit 1; }
}

install_dependencies() {
  local missing=()
  local cmd
  for cmd in curl unzip openssl ip ping figlet; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  ((${#missing[@]} == 0)) && return
  info "Installing dependencies..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl unzip openssl iproute2 iputils-ping ca-certificates figlet
}

arch_asset() {
  case "$(uname -m)" in
    x86_64|amd64) echo "easytier-linux-x86_64" ;;
    aarch64|arm64) echo "easytier-linux-aarch64" ;;
    armv7l|armv7) echo "easytier-linux-armv7" ;;
    i386|i686) echo "easytier-linux-i686" ;;
    *) fail "Unsupported architecture: $(uname -m)"; return 1 ;;
  esac
}

latest_easytier_version() {
  local tag
  tag="$(curl -fsSL --connect-timeout 8 --max-time 15 \
    https://api.github.com/repos/EasyTier/EasyTier/releases/latest 2>/dev/null |
    sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
  echo "${tag:-$FALLBACK_EASYTIER_VERSION}"
}

install_core() {
  require_root
  install_dependencies
  local version asset url tmp
  version="$(latest_easytier_version)"
  asset="$(arch_asset)"
  url="https://github.com/EasyTier/EasyTier/releases/download/${version}/${asset}-${version}.zip"
  tmp="$(mktemp -d)"

  info "Downloading EasyTier ${version} for $(uname -m)..."
  mkdir -p "$BIN_DIR" /etc/xraymesh
  if ! curl -fL --retry 3 --connect-timeout 10 --progress-bar "$url" -o "${tmp}/core.zip"; then
    fail "Download failed: $url"
    rm -rf -- "$tmp"
    return 1
  fi
  unzip -q -o "${tmp}/core.zip" -d "$tmp"
  local core cli
  core="$(find "$tmp" -type f -name easytier-core | head -n1)"
  cli="$(find "$tmp" -type f -name easytier-cli | head -n1)"
  if [[ -z "$core" || -z "$cli" ]]; then
    fail "EasyTier binaries were not found in the downloaded archive."
    rm -rf -- "$tmp"
    return 1
  fi
  install -m 0755 "$core" "${BIN_DIR}/easytier-core"
  install -m 0755 "$cli" "${BIN_DIR}/easytier-cli"
  printf '%s\n' "$version" > "${INSTALL_DIR}/easytier.version"
  rm -rf -- "$tmp"
  ok "EasyTier ${version} installed successfully."
}

valid_ip() {
  local ip="$1"
  [[ "$ip" =~ ^10\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] &&
    (( BASH_REMATCH[1] <= 255 && BASH_REMATCH[2] <= 255 && BASH_REMATCH[3] <= 255 ))
}

valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && (( "$1" >= 1 && "$1" <= 65535 )); }

prompt_default() {
  local prompt="$1" default="$2" value
  read -r -p "  ${prompt} [${default}]: " value
  printf '%s' "${value:-$default}"
}

write_config() {
  local name="$1" secret="$2" hostname="$3" ipv4="$4" protocol="$5" port="$6" peers="$7"
  local encryption="$8" ipv6="$9" mtu="${10}"
  umask 077
  {
    printf 'NETWORK_NAME=%q\n' "$name"
    printf 'NETWORK_SECRET=%q\n' "$secret"
    printf 'HOSTNAME=%q\n' "$hostname"
    printf 'IPV4=%q\n' "$ipv4"
    printf 'PROTOCOL=%q\n' "$protocol"
    printf 'PORT=%q\n' "$port"
    printf 'PEERS=%q\n' "$peers"
    printf 'ENCRYPTION=%q\n' "$encryption"
    printf 'IPV6=%q\n' "$ipv6"
    printf 'MTU=%q\n' "$mtu"
  } > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
}

write_service() {
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=XRayMesh - EasyTier Mesh Node
Documentation=https://github.com/EasyTier/EasyTier
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
EnvironmentFile=${CONFIG_FILE}
ExecStart=${INSTALL_DIR}/xraymesh-runner
Restart=always
RestartSec=3
StartLimitIntervalSec=60
StartLimitBurst=10
LimitNOFILE=1048576
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=/var/log
SyslogIdentifier=${LOG_TAG}

[Install]
WantedBy=multi-user.target
EOF

  cat > "${INSTALL_DIR}/xraymesh-runner" <<'RUNNER'
#!/usr/bin/env bash
set -Eeuo pipefail
source /etc/xraymesh/config.env
args=(
  --hostname "$HOSTNAME"
  --network-name "$NETWORK_NAME"
  --network-secret "$NETWORK_SECRET"
  --ipv4 "$IPV4"
  --rpc-portal "127.0.0.1:15888"
  --default-protocol "$PROTOCOL"
  --mtu "$MTU"
)
# WSS and QUIC are strict transports. TCP and UDP keep the dual-protocol
# fallback that is useful across restrictive networks.
if [[ "$PROTOCOL" == "wss" || "$PROTOCOL" == "quic" ]]; then
  args+=(--listeners "${PROTOCOL}://0.0.0.0:${PORT}")
else
  args+=(--listeners "$PORT")
fi
[[ "$IPV6" == "no" ]] && args+=(--disable-ipv6)
[[ "$ENCRYPTION" == "no" ]] && args+=(--disable-encryption)
if [[ -n "$PEERS" ]]; then
  IFS=',' read -ra peer_list <<< "$PEERS"
  peer_args=()
  for peer in "${peer_list[@]}"; do
    peer="${peer//[[:space:]]/}"
    [[ -z "$peer" ]] && continue
    if [[ "$PROTOCOL" == "wss" || "$PROTOCOL" == "quic" ]]; then
      # Remove any user-supplied scheme and enforce the selected transport.
      [[ "$peer" == *"://"* ]] && peer="${peer#*://}"
      [[ "$peer" =~ :[0-9]+$ ]] || peer="${peer}:${PORT}"
      peer_args+=("${PROTOCOL}://${peer}")
    elif [[ "$peer" =~ ^(tcp|udp|ws|wss|wg|quic|faketcp):// ]]; then
      [[ "$peer" =~ :[0-9]+$ ]] || peer="${peer}:${PORT}"
      peer_args+=("$peer")
    else
      [[ "$peer" =~ :[0-9]+$ ]] || peer="${peer}:${PORT}"
      # Try both UDP and TCP automatically. EasyTier keeps the working path.
      peer_args+=("udp://${peer}" "tcp://${peer}")
    fi
  done
  ((${#peer_args[@]})) && args+=(--peers "${peer_args[@]}")
fi
exec /opt/xraymesh/bin/easytier-core "${args[@]}"
RUNNER
  chmod 0755 "${INSTALL_DIR}/xraymesh-runner"
  systemctl daemon-reload
}

setup_node() {
  require_root
  [[ -x "${BIN_DIR}/easytier-core" ]] || install_core
  header
  say "  Configure Mesh Node" "$BOLD$CYAN"
  printf '\n'

  local name secret hostname ipv4 protocol port peers encryption ipv6 mtu
  local default_name="xraymesh" default_secret="" default_hostname default_ipv4="10.144.144.1"
  local default_protocol="udp" default_port="11010" default_peers=""
  local default_encryption="yes" default_ipv6="no" default_mtu="1380"
  default_hostname="$(hostname -s)"

  if [[ -f "$CONFIG_FILE" ]]; then
    # Preserve the current values while editing an existing node.
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    default_name="${NETWORK_NAME:-$default_name}"
    default_secret="${NETWORK_SECRET:-}"
    default_hostname="${HOSTNAME:-$default_hostname}"
    default_ipv4="${IPV4:-$default_ipv4}"
    default_protocol="${PROTOCOL:-$default_protocol}"
    default_port="${PORT:-$default_port}"
    default_peers="${PEERS:-}"
    default_encryption="${ENCRYPTION:-$default_encryption}"
    default_ipv6="${IPV6:-$default_ipv6}"
    default_mtu="${MTU:-$default_mtu}"
    info "Editing the existing node. Press Enter to keep each current value."
  fi

  name="$(prompt_default "Network name" "$default_name")"
  secret="${default_secret:-$(openssl rand -hex 16)}"
  warn "All nodes MUST use exactly the same network name and network secret."
  info "On the first node, keep the generated secret. Copy it to every other node."
  if [[ -n "$default_secret" ]]; then
    read -r -p "  Shared network secret [keep current]: " _secret
  else
    read -r -p "  Shared network secret [auto-generated]: " _secret
  fi
  secret="${_secret:-$secret}"
  if [[ -z "$default_secret" && -z "$_secret" ]]; then
    printf '\n'
    say "  +----------------------------------------------------------+" "$YELLOW"
    say "  |  SAVE THIS GENERATED NETWORK SECRET                     |" "$BOLD$YELLOW"
    printf '  |  %b%-56s%b|\n' "$BOLD$CYAN" "$secret" "$RESET$YELLOW"
    say "  +----------------------------------------------------------+" "$YELLOW"
    warn "You must enter this exact secret on every other mesh node."
    read -r -p "  Press Enter after you have saved the secret..." _
  fi
  hostname="$(prompt_default "Node hostname" "$default_hostname")"
  while :; do
    ipv4="$(prompt_default "Virtual IPv4 address" "$default_ipv4")"
    valid_ip "$ipv4" && break
    warn "Enter a valid address from the 10.x.x.x range."
  done
  protocol="$(prompt_default "Preferred protocol (udp/tcp/wss/quic)" "$default_protocol")"
  [[ "$protocol" =~ ^(udp|tcp|ws|wss|quic)$ ]] || protocol="udp"
  if [[ "$protocol" == "wss" || "$protocol" == "quic" ]]; then
    info "${protocol^^} strict mode enabled: no TCP/UDP transport fallback."
  else
    info "TCP/UDP fallback mode enabled for connection reliability."
  fi
  while :; do
    port="$(prompt_default "Mesh port" "$default_port")"
    valid_port "$port" && break
    warn "The port must be between 1 and 65535."
  done
  peers="$(prompt_default "Peer addresses, comma-separated (empty for first node)" "$default_peers")"
  encryption="$(prompt_default "Enable encryption? (yes/no)" "$default_encryption")"
  ipv6="$(prompt_default "Enable IPv6? (yes/no)" "$default_ipv6")"
  mtu="$(prompt_default "MTU" "$default_mtu")"

  write_config "$name" "$secret" "$hostname" "$ipv4" "$protocol" "$port" "$peers" "$encryption" "$ipv6" "$mtu"
  write_service
  systemctl enable --now xraymesh.service
  sleep 2
  if systemctl is-active --quiet xraymesh.service; then
    ok "The XRayMesh node is online."
    info "Network: $name"
    info "Virtual IP: $ipv4"
    if [[ "$protocol" == "wss" || "$protocol" == "quic" ]]; then
      info "Strict listener: ${protocol}://0.0.0.0:${port}"
    else
      info "Listeners: TCP and UDP on 0.0.0.0:${port}"
    fi
    warn "Keep this network secret private: $secret"
  else
    fail "The service failed to start."
    journalctl -u xraymesh.service -n 20 --no-pager
    return 1
  fi
}

delete_mesh() {
  header
  section "DELETE MESH CONFIGURATION"
  if [[ ! -f "$CONFIG_FILE" && ! -f "$SERVICE_FILE" ]]; then
    warn "No mesh configuration exists on this server."
    pause
    return
  fi

  warn "This will stop the node and delete its mesh configuration."
  info "XRayMesh and EasyTier binaries will remain installed."
  read -r -p "  Type DELETE to confirm: " confirm
  if [[ "$confirm" != "DELETE" ]]; then
    info "Delete operation cancelled."
    sleep 1
    return
  fi

  systemctl disable --now xraymesh.service 2>/dev/null || true
  rm -f "$SERVICE_FILE" "$CONFIG_FILE" "${INSTALL_DIR}/xraymesh-runner"
  systemctl daemon-reload
  systemctl reset-failed xraymesh.service 2>/dev/null || true
  ok "The mesh node and its configuration have been deleted."
  info "Select option 1 whenever you want to create a new mesh node."
  pause
}

service_state() {
  if systemctl is-active --quiet xraymesh.service 2>/dev/null; then
    printf '%b● ONLINE%b' "$GREEN" "$RESET"
  elif [[ -f "$SERVICE_FILE" ]]; then
    printf '%b● OFFLINE%b' "$RED" "$RESET"
  else
    printf '%b○ NOT CONFIGURED%b' "$GRAY" "$RESET"
  fi
}

server_addresses() {
  local family="$1"
  ip -o "-${family}" addr show scope global 2>/dev/null |
    awk '{print $2, $4}' |
    awk '$1 !~ /^(easytier|tun|tap|docker|br-|veth)/ {print $2}' |
    cut -d/ -f1 |
    paste -sd ', ' -
}

dashboard() {
  header
  section "NETWORK OVERVIEW"
  printf '  %-16s %s\n' "Service" "$(service_state)"
  if [[ -f "${INSTALL_DIR}/easytier.version" ]]; then
    printf '  %-16s %b%s%b\n' "EasyTier" "$GREEN" "$(cat "${INSTALL_DIR}/easytier.version")" "$RESET"
  fi
  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    printf '  %-16s %b%s%b\n' "Node" "$BOLD$CYAN" "$HOSTNAME" "$RESET"
    printf '  %-16s %b%s%b\n' "Virtual IP" "$CYAN" "$IPV4" "$RESET"
    printf '  %-16s %b%s%b\n' "Network" "$PURPLE" "$NETWORK_NAME" "$RESET"
    if [[ "$PROTOCOL" == "wss" || "$PROTOCOL" == "quic" ]]; then
      printf '  %-16s %b%s only%b\n' "Transport" "$YELLOW" "${PROTOCOL^^}" "$RESET"
    else
      printf '  %-16s %bTCP + UDP fallback%b\n' "Transport" "$GREEN" "$RESET"
    fi
  else
    printf '\n'
  fi
  local server_ipv4 server_ipv6
  server_ipv4="$(server_addresses 4)"
  server_ipv6="$(server_addresses 6)"
  printf '  %-16s %b%s%b\n' "Server IPv4" "$BLUE" "${server_ipv4:-not detected}" "$RESET"
  if [[ -n "$server_ipv6" ]]; then
    printf '  %-16s %b%s%b\n' "Server IPv6" "$BLUE" "$server_ipv6" "$RESET"
  fi
  section "CONNECTED PEERS"
  if systemctl is-active --quiet xraymesh.service && [[ -x "${BIN_DIR}/easytier-cli" ]]; then
    "${BIN_DIR}/easytier-cli" peer 2>/dev/null || warn "Could not retrieve peer information."
  else
    warn "Configure and start a node to display its peers."
  fi
}

live_status() {
  [[ -x "${BIN_DIR}/easytier-cli" ]] || { warn "EasyTier is not installed."; pause; return; }
  while true; do
    dashboard
    printf '\n%b  Refreshing every 2 seconds — press Ctrl+C to return%b\n' "$DIM" "$RESET"
    sleep 2
  done
}

show_routes() {
  header
  say "  Network Routes" "$BOLD$CYAN"
  "${BIN_DIR}/easytier-cli" route 2>/dev/null || warn "The routing table is unavailable."
  printf '\n'; pause
}

show_logs() {
  header
  say "  Live XRayMesh Logs — press Ctrl+C to return" "$BOLD$CYAN"
  journalctl -u xraymesh.service -f -n 80 -o short-iso
}

diagnostics() {
  header
  say "  Connection Diagnostics" "$BOLD$CYAN"
  printf '\n'

  if [[ ! -f "$CONFIG_FILE" ]]; then
    fail "XRayMesh is not configured on this server."
    pause
    return
  fi

  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  printf '  Service:       %s\n' "$(service_state)"
  printf '  Network name:  %s\n' "$NETWORK_NAME"
  printf '  Virtual IP:    %s\n' "$IPV4"
  if [[ "$PROTOCOL" == "wss" || "$PROTOCOL" == "quic" ]]; then
    printf '  Transport:     %s only (strict)\n' "${PROTOCOL^^}"
    printf '  Listen port:   %s/%s\n' "$PORT" "${PROTOCOL^^}"
  else
    printf '  Transport:     TCP + UDP fallback\n'
    printf '  Listen port:   %s (TCP + UDP)\n' "$PORT"
  fi
  printf '  Configured peers: %s\n\n' "${PEERS:-none — first/standalone node}"

  say "  ── Local listeners ──────────────────────────" "$GRAY"
  ss -lntup 2>/dev/null | grep -E "(:${PORT}[[:space:]])|easytier" || warn "No EasyTier listener was found on port ${PORT}."

  printf '\n'
  say "  ── EasyTier peer center ─────────────────────" "$GRAY"
  "${BIN_DIR}/easytier-cli" -p 127.0.0.1:15888 peer-center 2>/dev/null ||
    "${BIN_DIR}/easytier-cli" peer-center 2>/dev/null ||
    warn "peer-center is unavailable."

  printf '\n'
  say "  ── Recent connection messages ───────────────" "$GRAY"
  journalctl -u xraymesh.service -n 120 --no-pager 2>/dev/null |
    grep -Ei 'peer|connect|handshake|secret|network|error|warn|refused|timeout' |
    tail -n 30 || warn "No relevant connection messages were found."

  printf '\n'
  warn "Verify that BOTH servers use the exact same network name and secret."
  if [[ "$PROTOCOL" == "wss" ]]; then
    warn "Open TCP port ${PORT} in UFW and the VPS provider firewall for WSS."
  elif [[ "$PROTOCOL" == "quic" ]]; then
    warn "Open UDP port ${PORT} in UFW and the VPS provider firewall for QUIC."
  else
    warn "Open TCP and UDP port ${PORT} in UFW and the VPS provider firewall."
  fi
  pause
}

update_core() {
  local before after
  before="$(cat "${INSTALL_DIR}/easytier.version" 2>/dev/null || echo "not installed")"
  install_core
  after="$(cat "${INSTALL_DIR}/easytier.version")"
  [[ -f "$SERVICE_FILE" ]] && systemctl restart xraymesh.service
  ok "EasyTier: ${before} → ${after}"
  pause
}

control_service() {
  header
  say "  Service Control" "$BOLD$CYAN"
  printf '\n  1) Start\n  2) Stop\n  3) Restart\n  4) Back\n\n'
  read -r -p "  Select an option: " choice
  case "$choice" in
    1) systemctl start xraymesh ;;
    2) systemctl stop xraymesh ;;
    3) systemctl restart xraymesh ;;
    *) return ;;
  esac
  ok "Operation completed: $(service_state)"
  pause
}

uninstall_app() {
  header
  warn "This removes the XRayMesh service, configuration, and installed binaries."
  read -r -p "  Type REMOVE to confirm: " confirm
  [[ "$confirm" == "REMOVE" ]] || { info "Uninstall cancelled."; sleep 1; return; }
  systemctl disable --now xraymesh.service 2>/dev/null || true
  rm -f "$SERVICE_FILE"
  rm -rf -- "$INSTALL_DIR" /etc/xraymesh
  systemctl daemon-reload
  ok "XRayMesh has been removed."
  exit 0
}

menu() {
  require_root
  require_linux
  IN_MAIN_MENU=1
  while true; do
    # Keep the menu alive if Ctrl+C interrupts dashboard rendering.
    dashboard || true
    section "MAIN MENU"
    printf '  %b[1]%b  Configure or edit node\n' "$CYAN" "$RESET"
    printf '  %b[2]%b  Live status and connected peers\n' "$CYAN" "$RESET"
    printf '  %b[3]%b  View network routes\n' "$BLUE" "$RESET"
    printf '  %b[4]%b  View live logs\n' "$BLUE" "$RESET"
    printf '  %b[5]%b  Control service\n' "$PURPLE" "$RESET"
    printf '  %b[6]%b  Install or update EasyTier\n' "$PURPLE" "$RESET"
    printf '  %b[7]%b  Connection diagnostics\n' "$YELLOW" "$RESET"
    printf '  %b[8]%b  Delete mesh configuration\n' "$YELLOW" "$RESET"
    printf '  %b[9]%b  Uninstall XRayMesh completely\n' "$RED" "$RESET"
    printf '  %b[0]%b  Exit\n\n' "$GRAY" "$RESET"
    printf '%b  Tip: Ctrl+C exits here; inside a screen it returns to this menu.%b\n\n' "$DIM$GRAY" "$RESET"
    read -r -p "  Select an option [0-9]: " choice || { choice=""; continue; }
    case "$choice" in
      1) IN_MAIN_MENU=0; run_screen setup_node; IN_MAIN_MENU=1 ;;
      2) IN_MAIN_MENU=0; run_screen live_status; IN_MAIN_MENU=1 ;;
      3) IN_MAIN_MENU=0; run_screen show_routes; IN_MAIN_MENU=1 ;;
      4) IN_MAIN_MENU=0; run_screen show_logs; IN_MAIN_MENU=1 ;;
      5) IN_MAIN_MENU=0; run_screen control_service; IN_MAIN_MENU=1 ;;
      6) IN_MAIN_MENU=0; run_screen update_core; IN_MAIN_MENU=1 ;;
      7) IN_MAIN_MENU=0; run_screen diagnostics; IN_MAIN_MENU=1 ;;
      8) IN_MAIN_MENU=0; run_screen delete_mesh; IN_MAIN_MENU=1 ;;
      9)
        IN_MAIN_MENU=0
        run_screen uninstall_app
        IN_MAIN_MENU=1
        [[ ! -d "$INSTALL_DIR" && ! -f "$SERVICE_FILE" ]] && exit 0
        ;;
      0) printf '\n%b  Goodbye!%b\n' "$CYAN" "$RESET"; exit 0 ;;
      *) warn "Invalid option"; sleep 1 ;;
    esac
  done
}

case "${1:-menu}" in
  menu) menu ;;
  install|setup) require_linux; setup_node ;;
  status) dashboard ;;
  peers) "${BIN_DIR}/easytier-cli" peer ;;
  routes) "${BIN_DIR}/easytier-cli" route ;;
  logs) journalctl -u xraymesh.service -f -n 100 ;;
  update) require_linux; update_core ;;
  delete) require_root; require_linux; delete_mesh ;;
  start|stop|restart) require_root; systemctl "$1" xraymesh.service ;;
  version|-v|--version) echo "${APP} ${VERSION} - © ${OWNER}" ;;
  *)
    echo "Usage: $0 [menu|install|status|peers|routes|logs|update|delete|start|stop|restart|version]"
    exit 2
    ;;
esac
