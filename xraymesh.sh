#!/usr/bin/env bash
# XRayMesh - EasyTier mesh network manager
# Developed by ErfanXRay

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP="XRayMesh"
readonly VERSION="1.6.0"
readonly OWNER="ErfanXRay"
readonly INSTALL_DIR="/opt/xraymesh"
readonly BIN_DIR="${INSTALL_DIR}/bin"
readonly CONFIG_FILE="/etc/xraymesh/config.env"
readonly SERVICE_FILE="/etc/systemd/system/xraymesh.service"
readonly HAPROXY_SERVICE_FILE="/etc/systemd/system/xraymesh-haproxy.service"
readonly HAPROXY_CONFIG="/etc/xraymesh/haproxy.cfg"
readonly HAPROXY_TUNNEL_DIR="/etc/xraymesh/haproxy-tunnels"
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
  systemctl enable xraymesh.service >/dev/null
  if systemctl is-active --quiet xraymesh.service; then
    info "Applying the updated node configuration..."
    systemctl restart xraymesh.service
  else
    info "Starting the mesh node..."
    systemctl start xraymesh.service
  fi
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
  if systemctl is-active --quiet xraymesh-haproxy.service 2>/dev/null; then
    systemctl stop xraymesh-haproxy.service
    info "HAProxy tunnels were stopped because the mesh node was deleted."
  fi
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

render_network_overview() {
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
}

render_connected_peers() {
  section "CONNECTED PEERS"
  if systemctl is-active --quiet xraymesh.service && [[ -x "${BIN_DIR}/easytier-cli" ]]; then
    "${BIN_DIR}/easytier-cli" peer 2>/dev/null || warn "Could not retrieve peer information."
  else
    warn "Configure and start a node to display its peers."
  fi
}

dashboard() {
  header
  render_network_overview
  render_connected_peers
}

restore_live_terminal() {
  # Restore cursor visibility and the screen that was active before Live Status.
  printf '\033[?25h\033[?1049l'
}

live_status() {
  [[ -x "${BIN_DIR}/easytier-cli" ]] || { warn "EasyTier is not installed."; pause; return; }
  if [[ ! -t 1 ]]; then
    dashboard
    return
  fi

  local frame key=""
  # Use the alternate screen so Live Status never damages terminal history.
  printf '\033[?1049h\033[?25l'
  trap 'restore_live_terminal' EXIT
  trap 'exit 130' INT TERM

  header
  say "  LIVE STATUS" "$BOLD$PINK"
  printf '%b  Updating every second without redrawing the full screen.%b\n' "$DIM$GRAY" "$RESET"
  printf '%b  Press q or Ctrl+C to return to the main menu.%b\n\n' "$DIM$GRAY" "$RESET"
  # Save the beginning of the dynamic area. It can be restored repeatedly.
  printf '\033[s'

  while true; do
    frame="$(
      render_network_overview
      render_connected_peers
      printf '\n%b  LIVE%b  %s  %b|%b  q: back  %b|%b  Ctrl+C: back\n' \
        "$GREEN" "$RESET" "$(date '+%Y-%m-%d %H:%M:%S')" \
        "$GRAY" "$RESET" "$GRAY" "$RESET"
    )"

    # Restore the dynamic origin, write the complete frame in one operation,
    # then remove stale lines left by a previously larger peer table.
    printf '\033[u%s\n\033[J' "$frame"

    key=""
    read -rsn1 -t 1 key || true
    [[ "${key,,}" == "q" ]] && break
  done

  trap - INT TERM EXIT
  restore_live_terminal
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

validate_tunnel_name() {
  [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$ ]]
}

expand_port_spec() {
  local spec="${1//[[:space:]]/}" item start end port
  local -a expanded=()
  local -A seen=()
  IFS=',' read -ra items <<< "$spec"
  for item in "${items[@]}"; do
    if [[ "$item" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      start="${BASH_REMATCH[1]}"
      end="${BASH_REMATCH[2]}"
      (( start >= 1 && end <= 65535 && start <= end )) || return 1
      (( end - start <= 255 )) || return 1
      for ((port=start; port<=end; port++)); do expanded+=("$port"); done
    elif valid_port "$item"; then
      expanded+=("$item")
    else
      return 1
    fi
  done
  ((${#expanded[@]} > 0 && ${#expanded[@]} <= 256)) || return 1
  for port in "${expanded[@]}"; do
    [[ -n "${seen[$port]:-}" ]] && continue
    seen["$port"]=1
    printf '%s\n' "$port"
  done
}

discover_mesh_nodes() {
  [[ -x "${BIN_DIR}/easytier-cli" ]] || return 0
  local local_ip="" output normalized line ip host
  local -A seen=()
  if [[ -f "$CONFIG_FILE" ]]; then
    local_ip="$(sed -n 's/^IPV4=//p' "$CONFIG_FILE" | head -n1)"
  fi

  output="$("${BIN_DIR}/easytier-cli" -p 127.0.0.1:15888 peer 2>/dev/null ||
    "${BIN_DIR}/easytier-cli" peer 2>/dev/null || true)"
  [[ -n "$output" ]] || return 0

  # EasyTier versions may render tables with ASCII pipes or Unicode box
  # separators. Normalize both before reading the IPv4 and hostname columns.
  normalized="$(printf '%s\n' "$output" | sed 's/│/|/g')"

  while IFS='|' read -r _ ip host _; do
    ip="${ip#"${ip%%[![:space:]]*}"}"
    ip="${ip%"${ip##*[![:space:]]}"}"
    host="${host#"${host%%[![:space:]]*}"}"
    host="${host%"${host##*[![:space:]]}"}"
    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || continue
    [[ "$ip" == "$local_ip" || -n "${seen[$ip]:-}" ]] && continue
    seen["$ip"]=1
    printf '%s|%s\n' "$ip" "${host:-EasyTier peer}"
  done <<< "$normalized"

  # Fallback for future table layouts: extract 10.x virtual addresses directly.
  while IFS= read -r ip; do
    [[ "$ip" == "$local_ip" || -n "${seen[$ip]:-}" ]] && continue
    seen["$ip"]=1
    printf '%s|EasyTier peer\n' "$ip"
  done < <(printf '%s\n' "$normalized" |
    grep -Eo '10(\.[0-9]{1,3}){3}' || true)
}

install_haproxy_runtime() {
  if command -v haproxy >/dev/null 2>&1; then return; fi
  info "Installing HAProxy..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq haproxy
  ok "HAProxy installed."
}

write_haproxy_service() {
  cat > "$HAPROXY_SERVICE_FILE" <<EOF
[Unit]
Description=XRayMesh HAProxy TCP Tunnels
Documentation=https://www.haproxy.org/
Wants=network-online.target xraymesh.service
After=network-online.target xraymesh.service

[Service]
Type=notify
ExecStart=/usr/sbin/haproxy -Ws -f ${HAPROXY_CONFIG} -p /run/xraymesh-haproxy/haproxy.pid
Restart=always
RestartSec=3
RuntimeDirectory=xraymesh-haproxy
RuntimeDirectoryMode=0755
LimitNOFILE=1048576
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

generate_haproxy_config() {
  mkdir -p "$HAPROXY_TUNNEL_DIR"
  local tmp="${HAPROXY_CONFIG}.tmp" definition name target port_spec port safe
  {
    cat <<'EOF'
global
    log stdout format raw local0
    maxconn 100000

defaults
    log global
    mode tcp
    option tcplog
    timeout connect 10s
    timeout client 1h
    timeout server 1h
EOF
    for definition in "$HAPROXY_TUNNEL_DIR"/*.env; do
      [[ -f "$definition" ]] || continue
      unset TUNNEL_NAME TARGET_IP PORT_SPEC
      # shellcheck disable=SC1090
      source "$definition"
      name="$TUNNEL_NAME"
      target="$TARGET_IP"
      port_spec="$PORT_SPEC"
      safe="${name//-/_}"
      while IFS= read -r port; do
        cat <<EOF

frontend xr_${safe}_${port}
    bind 0.0.0.0:${port}
    mode tcp
    default_backend xr_${safe}_${port}_backend

backend xr_${safe}_${port}_backend
    mode tcp
    server ${safe}_node ${target}:${port} check inter 5s fall 3 rise 2
EOF
      done < <(expand_port_spec "$port_spec")
    done
  } > "$tmp"
  mv -f "$tmp" "$HAPROXY_CONFIG"
  chmod 600 "$HAPROXY_CONFIG"
}

apply_haproxy_config() {
  generate_haproxy_config
  if ! haproxy -c -f "$HAPROXY_CONFIG"; then
    fail "HAProxy rejected the generated configuration."
    return 1
  fi
  write_haproxy_service
  systemctl enable --now xraymesh-haproxy.service
  systemctl restart xraymesh-haproxy.service
  ok "HAProxy tunnel configuration applied."
}

select_mesh_target() {
  local -a nodes=()
  local line choice index
  while IFS= read -r line; do [[ -n "$line" ]] && nodes+=("$line"); done < <(discover_mesh_nodes)

  printf '\n'
  if ((${#nodes[@]})); then
    say "  Available EasyTier nodes" "$BOLD$CYAN"
    for index in "${!nodes[@]}"; do
      IFS='|' read -r node_ip node_host <<< "${nodes[$index]}"
      printf '  %b[%d]%b  %-15s  %s\n' "$CYAN" "$((index + 1))" "$RESET" "$node_ip" "${node_host:-unknown}"
    done
  else
    warn "No EasyTier peers were discovered automatically."
  fi
  printf '  %b[M]%b  Enter a virtual IP manually\n\n' "$PURPLE" "$RESET"
  read -r -p "  Select destination node: " choice
  if [[ "${choice,,}" == "m" ]]; then
    read -r -p "  Destination virtual IP: " SELECTED_TARGET
  elif [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#nodes[@]} )); then
    SELECTED_TARGET="${nodes[$((choice - 1))]%%|*}"
  else
    fail "Invalid node selection."
    return 1
  fi
  valid_ip "$SELECTED_TARGET" || { fail "Destination must be a valid 10.x.x.x mesh IP."; return 1; }
}

save_haproxy_tunnel() {
  local name="$1" target="$2" ports="$3" file="${HAPROXY_TUNNEL_DIR}/${1}.env"
  mkdir -p "$HAPROXY_TUNNEL_DIR"
  umask 077
  {
    printf 'TUNNEL_NAME=%q\n' "$name"
    printf 'TARGET_IP=%q\n' "$target"
    printf 'PORT_SPEC=%q\n' "$ports"
  } > "$file"
}

create_haproxy_tunnel() {
  header
  section "CREATE HAPROXY TUNNEL"
  info "HAProxy tunnels support TCP traffic. Generic UDP forwarding is not supported."
  install_haproxy_runtime

  local name ports
  while :; do
    read -r -p "  Tunnel name (letters, numbers, _ or -): " name
    validate_tunnel_name "$name" || { warn "Enter a valid name with up to 32 characters."; continue; }
    [[ ! -f "${HAPROXY_TUNNEL_DIR}/${name}.env" ]] || { warn "A tunnel with this name already exists."; continue; }
    break
  done
  select_mesh_target || return 1
  while :; do
    read -r -p "  TCP ports (e.g. 80,443,8000-8010): " ports
    expand_port_spec "$ports" >/dev/null && break
    warn "Invalid ports. Use comma-separated ports/ranges; maximum 256 expanded ports."
  done

  save_haproxy_tunnel "$name" "$SELECTED_TARGET" "$ports"
  if apply_haproxy_config; then
    ok "Tunnel '${name}' forwards TCP ports ${ports} to ${SELECTED_TARGET}."
  else
    rm -f "${HAPROXY_TUNNEL_DIR}/${name}.env"
    generate_haproxy_config
    return 1
  fi
  pause
}

list_haproxy_tunnels() {
  local definition count=0
  printf '\n'
  printf '  %-4s %-20s %-16s %s\n' "ID" "NAME" "TARGET" "TCP PORTS"
  printf '  %-4s %-20s %-16s %s\n' "--" "--------------------" "---------------" "----------------"
  HAPROXY_FILES=()
  for definition in "$HAPROXY_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    unset TUNNEL_NAME TARGET_IP PORT_SPEC
    # shellcheck disable=SC1090
    source "$definition"
    HAPROXY_FILES+=("$definition")
    ((count+=1))
    printf '  %-4s %-20s %-16s %s\n' "$count" "$TUNNEL_NAME" "$TARGET_IP" "$PORT_SPEC"
  done
  ((count)) || warn "No HAProxy tunnels are configured."
}

edit_haproxy_tunnel() {
  header
  section "EDIT HAPROXY TUNNEL"
  list_haproxy_tunnels
  ((${#HAPROXY_FILES[@]})) || { pause; return; }
  local choice definition old_name name ports backup
  read -r -p "  Select tunnel ID: " choice
  [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#HAPROXY_FILES[@]} )) ||
    { fail "Invalid tunnel selection."; return 1; }
  definition="${HAPROXY_FILES[$((choice - 1))]}"
  # shellcheck disable=SC1090
  source "$definition"
  old_name="$TUNNEL_NAME"
  name="$(prompt_default "Tunnel name" "$TUNNEL_NAME")"
  validate_tunnel_name "$name" || { fail "Invalid tunnel name."; return 1; }
  if [[ "$name" != "$old_name" && -f "${HAPROXY_TUNNEL_DIR}/${name}.env" ]]; then
    fail "A tunnel named '${name}' already exists."
    return 1
  fi
  select_mesh_target || return 1
  while :; do
    ports="$(prompt_default "TCP ports" "$PORT_SPEC")"
    expand_port_spec "$ports" >/dev/null && break
    warn "Invalid port list or range."
  done
  backup="$(mktemp)"
  cp "$definition" "$backup"
  [[ "$name" == "$old_name" ]] || rm -f "$definition"
  save_haproxy_tunnel "$name" "$SELECTED_TARGET" "$ports"
  if ! apply_haproxy_config; then
    rm -f "${HAPROXY_TUNNEL_DIR}/${name}.env"
    cp "$backup" "$definition"
    rm -f "$backup"
    generate_haproxy_config
    fail "The previous tunnel configuration was restored."
    return 1
  fi
  rm -f "$backup"
  ok "Tunnel '${name}' updated."
  pause
}

delete_haproxy_tunnel() {
  header
  section "DELETE HAPROXY TUNNEL"
  list_haproxy_tunnels
  ((${#HAPROXY_FILES[@]})) || { pause; return; }
  local choice definition
  read -r -p "  Select tunnel ID: " choice
  [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#HAPROXY_FILES[@]} )) ||
    { fail "Invalid tunnel selection."; return 1; }
  definition="${HAPROXY_FILES[$((choice - 1))]}"
  # shellcheck disable=SC1090
  source "$definition"
  read -r -p "  Type DELETE to remove '${TUNNEL_NAME}': " confirm
  [[ "$confirm" == "DELETE" ]] || { info "Delete operation cancelled."; return; }
  rm -f "$definition"
  if compgen -G "${HAPROXY_TUNNEL_DIR}/*.env" >/dev/null; then
    apply_haproxy_config
  else
    systemctl disable --now xraymesh-haproxy.service 2>/dev/null || true
    rm -f "$HAPROXY_CONFIG" "$HAPROXY_SERVICE_FILE"
    systemctl daemon-reload
  fi
  ok "HAProxy tunnel '${TUNNEL_NAME}' deleted."
  pause
}

haproxy_tunnel_menu() {
  while true; do
    header
    section "HAPROXY TCP TUNNELS"
    printf '  Service: %s\n' "$(systemctl is-active xraymesh-haproxy.service 2>/dev/null || echo inactive)"
    list_haproxy_tunnels
    printf '\n'
    printf '  %b[1]%b  Create tunnel\n' "$CYAN" "$RESET"
    printf '  %b[2]%b  Edit tunnel\n' "$PURPLE" "$RESET"
    printf '  %b[3]%b  Delete tunnel\n' "$RED" "$RESET"
    printf '  %b[4]%b  View HAProxy logs\n' "$BLUE" "$RESET"
    printf '  %b[0]%b  Back\n\n' "$GRAY" "$RESET"
    read -r -p "  Select an option [0-4]: " choice
    case "$choice" in
      1) run_screen create_haproxy_tunnel ;;
      2) run_screen edit_haproxy_tunnel ;;
      3) run_screen delete_haproxy_tunnel ;;
      4) journalctl -u xraymesh-haproxy.service -f -n 80 -o short-iso ;;
      0) return ;;
      *) warn "Invalid option"; sleep 1 ;;
    esac
  done
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
  systemctl disable --now xraymesh-haproxy.service 2>/dev/null || true
  rm -f "$SERVICE_FILE" "$HAPROXY_SERVICE_FILE"
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
    printf '  %b[8]%b  HAProxy TCP tunnels\n' "$PINK" "$RESET"
    printf '  %b[9]%b  Delete mesh configuration\n' "$YELLOW" "$RESET"
    printf '  %b[10]%b Uninstall XRayMesh completely\n' "$RED" "$RESET"
    printf '  %b[0]%b  Exit\n\n' "$GRAY" "$RESET"
    printf '%b  Tip: Ctrl+C exits here; inside a screen it returns to this menu.%b\n\n' "$DIM$GRAY" "$RESET"
    read -r -p "  Select an option [0-10]: " choice || { choice=""; continue; }
    case "$choice" in
      1) IN_MAIN_MENU=0; run_screen setup_node; IN_MAIN_MENU=1 ;;
      2) IN_MAIN_MENU=0; run_screen live_status; IN_MAIN_MENU=1 ;;
      3) IN_MAIN_MENU=0; run_screen show_routes; IN_MAIN_MENU=1 ;;
      4) IN_MAIN_MENU=0; run_screen show_logs; IN_MAIN_MENU=1 ;;
      5) IN_MAIN_MENU=0; run_screen control_service; IN_MAIN_MENU=1 ;;
      6) IN_MAIN_MENU=0; run_screen update_core; IN_MAIN_MENU=1 ;;
      7) IN_MAIN_MENU=0; run_screen diagnostics; IN_MAIN_MENU=1 ;;
      8) IN_MAIN_MENU=0; run_screen haproxy_tunnel_menu; IN_MAIN_MENU=1 ;;
      9) IN_MAIN_MENU=0; run_screen delete_mesh; IN_MAIN_MENU=1 ;;
      10)
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
  haproxy) require_root; require_linux; haproxy_tunnel_menu ;;
  start|stop|restart) require_root; systemctl "$1" xraymesh.service ;;
  version|-v|--version) echo "${APP} ${VERSION} - © ${OWNER}" ;;
  *)
    echo "Usage: $0 [menu|install|status|peers|routes|logs|update|delete|haproxy|start|stop|restart|version]"
    exit 2
    ;;
esac
