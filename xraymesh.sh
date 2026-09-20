#!/usr/bin/env bash
# XRayMesh - EasyTier mesh network manager
# Developed by ErfanXRay

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP="XRayMesh"
readonly VERSION="1.8.0"
readonly OWNER="ErfanXRay"
readonly INSTALL_DIR="/opt/xraymesh"
readonly BIN_DIR="${INSTALL_DIR}/bin"
readonly CONFIG_FILE="/etc/xraymesh/config.env"
readonly SERVICE_FILE="/etc/systemd/system/xraymesh.service"
readonly HAPROXY_SERVICE_FILE="/etc/systemd/system/xraymesh-haproxy.service"
readonly HAPROXY_CONFIG="/etc/xraymesh/haproxy.cfg"
readonly HAPROXY_TUNNEL_DIR="/etc/xraymesh/haproxy-tunnels"
readonly IPTABLES_SERVICE_FILE="/etc/systemd/system/xraymesh-iptables.service"
readonly IPTABLES_TUNNEL_DIR="/etc/xraymesh/iptables-tunnels"
readonly IPTABLES_APPLY_SCRIPT="${INSTALL_DIR}/xraymesh-iptables-apply"
readonly IPTABLES_SYSCTL_FILE="/etc/sysctl.d/99-xraymesh-forwarding.conf"
readonly WEB_DIR="${INSTALL_DIR}/web"
readonly WEB_CONFIG_FILE="/etc/xraymesh/web.env"
readonly WEB_SERVICE_FILE="/etc/systemd/system/xraymesh-web.service"
readonly IPERF_SERVICE_FILE="/etc/systemd/system/xraymesh-iperf.service"
readonly WEB_TOKEN_FILE="/etc/xraymesh/web-tokens.json"
readonly DEFAULT_WEB_PORT="11080"
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
  for cmd in curl unzip openssl ip ping figlet jq sha256sum ss python3 iperf3; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  ((${#missing[@]} == 0)) && return
  info "Installing dependencies..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl unzip openssl iproute2 iputils-ping ca-certificates figlet jq python3 iperf3
}

arch_asset() {
  case "$(uname -m)" in
    x86_64|amd64) echo "easytier-linux-x86_64" ;;
    aarch64|arm64) echo "easytier-linux-aarch64" ;;
    armv7l|armv7) echo "easytier-linux-armv7" ;;
    *) fail "Unsupported architecture: $(uname -m)"; return 1 ;;
  esac
}

install_core() {
  require_root
  install_dependencies
  local version asset asset_name url digest actual_digest tmp release_json
  asset="$(arch_asset)"
  tmp="$(mktemp -d)"
  release_json="${tmp}/release.json"
  if ! curl -fsSL --connect-timeout 8 --max-time 20 \
    https://api.github.com/repos/EasyTier/EasyTier/releases/latest -o "$release_json"; then
    warn "Latest-release lookup failed; checking the pinned fallback release."
    curl -fsSL --connect-timeout 8 --max-time 20 \
      "https://api.github.com/repos/EasyTier/EasyTier/releases/tags/${FALLBACK_EASYTIER_VERSION}" \
      -o "$release_json" || { fail "Could not retrieve trusted EasyTier release metadata."; rm -rf -- "$tmp"; return 1; }
  fi
  version="$(jq -er '.tag_name' "$release_json")" ||
    { fail "EasyTier release metadata is invalid."; rm -rf -- "$tmp"; return 1; }
  asset_name="${asset}-${version}.zip"
  url="$(jq -er --arg name "$asset_name" '.assets[] | select(.name == $name) | .browser_download_url' "$release_json")" ||
    { fail "No official EasyTier asset exists for $(uname -m)."; rm -rf -- "$tmp"; return 1; }
  digest="$(jq -er --arg name "$asset_name" '.assets[] | select(.name == $name) | .digest' "$release_json")" ||
    { fail "The official release did not provide a checksum for ${asset_name}."; rm -rf -- "$tmp"; return 1; }
  [[ "$digest" =~ ^sha256:([0-9a-fA-F]{64})$ ]] ||
    { fail "The official checksum has an unexpected format."; rm -rf -- "$tmp"; return 1; }
  digest="${BASH_REMATCH[1],,}"

  info "Downloading EasyTier ${version} for $(uname -m)..."
  mkdir -p "$BIN_DIR" /etc/xraymesh
  if ! curl -fL --retry 3 --connect-timeout 10 --progress-bar "$url" -o "${tmp}/core.zip"; then
    fail "Download failed: $url"
    rm -rf -- "$tmp"
    return 1
  fi
  actual_digest="$(sha256sum "${tmp}/core.zip" | awk '{print $1}')"
  if [[ "$actual_digest" != "$digest" ]]; then
    fail "EasyTier archive checksum verification failed. Nothing was installed."
    rm -rf -- "$tmp"
    return 1
  fi
  ok "EasyTier archive SHA-256 verified."
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
  local config_backup="" had_config=0 service_was_active=0
  local default_name="xraymesh" default_secret="" default_hostname default_ipv4="10.144.144.1"
  local default_protocol="udp" default_port="11010" default_peers=""
  local default_encryption="yes" default_ipv6="no" default_mtu="1380"
  default_hostname="$(hostname -s)"

  if [[ -f "$CONFIG_FILE" ]]; then
    had_config=1
    config_backup="$(mktemp)"
    cp -p "$CONFIG_FILE" "$config_backup"
    if systemctl is-active --quiet xraymesh.service; then
      service_was_active=1
    fi
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
    warn "Restoring the previous working node configuration."
    systemctl stop xraymesh.service 2>/dev/null || true
    if (( had_config )); then
      cp -p "$config_backup" "$CONFIG_FILE"
      write_service
      if (( service_was_active )); then
        systemctl restart xraymesh.service || true
      fi
    else
      systemctl disable xraymesh.service 2>/dev/null || true
      rm -f "$CONFIG_FILE" "$SERVICE_FILE" "${INSTALL_DIR}/xraymesh-runner"
      systemctl daemon-reload
    fi
    [[ -z "$config_backup" ]] || rm -f "$config_backup"
    return 1
  fi
  [[ -z "$config_backup" ]] || rm -f "$config_backup"
  if compgen -G "${HAPROXY_TUNNEL_DIR}/*.env" >/dev/null; then
    info "Re-enabling the existing HAProxy tunnels."
    apply_haproxy_config || warn "The mesh is online, but HAProxy tunnels need attention."
  fi
  if compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null; then
    info "Re-enabling the existing iptables UDP/TCP tunnels."
    apply_iptables_config || warn "The mesh is online, but iptables tunnels need attention."
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
  systemctl disable --now xraymesh-haproxy.service 2>/dev/null || true
  systemctl disable --now xraymesh-iptables.service 2>/dev/null || true
  if [[ -x "$IPTABLES_APPLY_SCRIPT" ]]; then
    "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
  fi
  compgen -G "${HAPROXY_TUNNEL_DIR}/*.env" >/dev/null &&
    info "HAProxy tunnels were disabled and preserved for the next mesh configuration."
  compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null &&
    info "iptables tunnels were disabled and preserved for the next mesh configuration."
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

render_peer_snapshot() {
  section "PEER SNAPSHOT"
  if ! systemctl is-active --quiet xraymesh.service 2>/dev/null ||
     [[ ! -x "${BIN_DIR}/easytier-cli" ]]; then
    warn "Peer information is unavailable while the mesh node is offline."
    return
  fi

  local output rows summary count latency rx tx
  output="$("${BIN_DIR}/easytier-cli" -p 127.0.0.1:15888 -o json peer 2>/dev/null ||
    "${BIN_DIR}/easytier-cli" -o json peer 2>/dev/null || true)"
  if [[ -z "$output" ]]; then
    warn "Could not retrieve the EasyTier peer snapshot."
    return
  fi

  rows="$(printf '%s\n' "$output" | jq -r '
    .. | objects |
    select(.cost? != null and .cost != "Local" and (.ipv4? // "") != "") |
    [.ipv4, (.lat_ms // "0"), (.rx_bytes // "0 B"), (.tx_bytes // "0 B")] |
    @tsv
  ' 2>/dev/null || true)"

  summary="$(printf '%s\n' "$rows" | awk -F'\t' '
    function to_bytes(value, parts, number, unit) {
      if (value == "" || value == "*") return 0
      split(value, parts, /[ \t]+/)
      number=parts[1]+0
      unit=tolower(parts[2])
      if (unit == "kb") return number*1000
      if (unit == "mb") return number*1000*1000
      if (unit == "gb") return number*1000*1000*1000
      if (unit == "tb") return number*1000*1000*1000*1000
      if (unit == "kib") return number*1024
      if (unit == "mib") return number*1024*1024
      if (unit == "gib") return number*1024*1024*1024
      if (unit == "tib") return number*1024*1024*1024*1024
      return number
    }
    function human(value) {
      if (value >= 1099511627776) return sprintf("%.2f TB", value/1099511627776)
      if (value >= 1073741824) return sprintf("%.2f GB", value/1073741824)
      if (value >= 1048576) return sprintf("%.2f MB", value/1048576)
      if (value >= 1024) return sprintf("%.2f KB", value/1024)
      return sprintf("%.0f B", value)
    }
    {
      ip=$1
      if (ip == "" || seen[ip]++) next
      count++
      current_latency=$2
      if (current_latency ~ /^[0-9]+([.][0-9]+)?$/) {
        latency_total+=current_latency
        latency_count++
      }
      rx_total+=to_bytes($3)
      tx_total+=to_bytes($4)
    }
    END {
      average=(latency_count ? sprintf("%.1f ms", latency_total/latency_count) : "n/a")
      printf "%d|%s|%s|%s", count+0, average, human(rx_total), human(tx_total)
    }
  ')"
  IFS='|' read -r count latency rx tx <<< "$summary"

  printf '  %-18s %b%s online%b\n' "Connected peers" "$BOLD$GREEN" "${count:-0}" "$RESET"
  printf '  %-18s %b%s%b\n' "Average latency" "$CYAN" "${latency:-n/a}" "$RESET"
  printf '  %-18s %b%s%b\n' "Total traffic" "$BLUE" "RX ${rx:-0 B} / TX ${tx:-0 B}" "$RESET"
  printf '  %-18s %s\n' "Last check" "$(date '+%Y-%m-%d %H:%M:%S')"
  printf '%b  Open Live Status for the complete real-time peer table.%b\n' "$DIM$GRAY" "$RESET"
}

dashboard() {
  header
  render_network_overview
  render_peer_snapshot
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
  local local_ip="" output normalized line ip host json_rows
  local -A seen=()
  if [[ -f "$CONFIG_FILE" ]]; then
    local_ip="$(sed -n 's/^IPV4=//p' "$CONFIG_FILE" | head -n1)"
  fi

  output="$("${BIN_DIR}/easytier-cli" -p 127.0.0.1:15888 -o json peer 2>/dev/null ||
    "${BIN_DIR}/easytier-cli" -o json peer 2>/dev/null || true)"
  [[ -n "$output" ]] || return 0

  if command -v jq >/dev/null 2>&1; then
    json_rows="$(printf '%s\n' "$output" | jq -r '
      .. | objects |
      select(.cost? != null and .cost != "Local" and (.ipv4? // "") != "") |
      [(.ipv4 // ""), (.hostname // "EasyTier peer")] |
      @tsv
    ' 2>/dev/null || true)"
    while IFS=$'\t' read -r ip host; do
      [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || continue
      [[ "$ip" == "$local_ip" || -n "${seen[$ip]:-}" ]] && continue
      seen["$ip"]=1
      printf '%s|%s\n' "$ip" "${host:-EasyTier peer}"
    done <<< "$json_rows"
    ((${#seen[@]})) && return 0
  fi

  # Compatibility fallback for EasyTier versions without JSON output.
  output="$("${BIN_DIR}/easytier-cli" -p 127.0.0.1:15888 peer 2>/dev/null ||
    "${BIN_DIR}/easytier-cli" peer 2>/dev/null || true)"
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
      # Values are loaded from the validated tunnel definition above.
      # shellcheck disable=SC2153
      name="$TUNNEL_NAME"
      target="$TARGET_IP"
      # shellcheck disable=SC2153
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
  local backup="" was_active=0
  if [[ -f "$HAPROXY_CONFIG" ]]; then
    backup="$(mktemp)"
    cp -p "$HAPROXY_CONFIG" "$backup"
  fi
  if systemctl is-active --quiet xraymesh-haproxy.service 2>/dev/null; then
    was_active=1
  fi
  generate_haproxy_config
  if ! haproxy -c -f "$HAPROXY_CONFIG"; then
    fail "HAProxy rejected the generated configuration."
    [[ -z "$backup" ]] || cp -p "$backup" "$HAPROXY_CONFIG"
    [[ -z "$backup" ]] || rm -f "$backup"
    return 1
  fi
  write_haproxy_service
  if ! systemctl enable xraymesh-haproxy.service >/dev/null ||
     ! systemctl restart xraymesh-haproxy.service ||
     ! systemctl is-active --quiet xraymesh-haproxy.service; then
    fail "HAProxy failed to start with the new configuration."
    if [[ -n "$backup" ]]; then
      cp -p "$backup" "$HAPROXY_CONFIG"
      if (( was_active )); then
        systemctl restart xraymesh-haproxy.service 2>/dev/null || true
      fi
    else
      systemctl disable --now xraymesh-haproxy.service 2>/dev/null || true
      rm -f "$HAPROXY_CONFIG"
    fi
    [[ -z "$backup" ]] || rm -f "$backup"
    return 1
  fi
  [[ -z "$backup" ]] || rm -f "$backup"
  ok "HAProxy tunnel configuration applied."
}

validate_haproxy_ports() {
  local tunnel_name="$1" port_spec="$2" definition port other_port
  local -A requested=()
  while IFS= read -r port; do requested["$port"]=1; done < <(expand_port_spec "$port_spec")

  for definition in "$HAPROXY_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    unset TUNNEL_NAME TARGET_IP PORT_SPEC
    # shellcheck disable=SC1090
    source "$definition"
    [[ "$TUNNEL_NAME" == "$tunnel_name" ]] && continue
    while IFS= read -r other_port; do
      if [[ -n "${requested[$other_port]:-}" ]]; then
        fail "TCP port ${other_port} is already assigned to tunnel '${TUNNEL_NAME}'."
        return 1
      fi
    done < <(expand_port_spec "$PORT_SPEC")
  done

  for port in "${!requested[@]}"; do
    local listeners
    listeners="$(ss -H -ltnp "sport = :${port}" 2>/dev/null || true)"
    if [[ -n "$listeners" && "$listeners" != *haproxy* ]]; then
      fail "TCP port ${port} is already used by another local service."
      return 1
    fi
  done
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
    expand_port_spec "$ports" >/dev/null && validate_haproxy_ports "$name" "$ports" && break
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
  if [[ ! "$choice" =~ ^[0-9]+$ ]] ||
     (( choice < 1 || choice > ${#HAPROXY_FILES[@]} )); then
    fail "Invalid tunnel selection."
    return 1
  fi
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
    expand_port_spec "$ports" >/dev/null && validate_haproxy_ports "$old_name" "$ports" && break
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
  if [[ ! "$choice" =~ ^[0-9]+$ ]] ||
     (( choice < 1 || choice > ${#HAPROXY_FILES[@]} )); then
    fail "Invalid tunnel selection."
    return 1
  fi
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

create_haproxy_tunnel_noninteractive() {
  require_root
  install_haproxy_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ ! -f "${HAPROXY_TUNNEL_DIR}/${name}.env" ]] || { fail "A tunnel with this name already exists."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port list or range."; return 1; }
  validate_haproxy_ports "$name" "$ports" || return 1

  save_haproxy_tunnel "$name" "$target" "$ports"
  if apply_haproxy_config; then
    ok "HAProxy tunnel '${name}' forwards TCP ports ${ports} to ${target}."
  else
    rm -f "${HAPROXY_TUNNEL_DIR}/${name}.env"
    generate_haproxy_config
    return 1
  fi
}

delete_haproxy_tunnel_noninteractive() {
  require_root
  local name="${1:-}" file="${HAPROXY_TUNNEL_DIR}/${1}.env"
  [[ -f "$file" ]] || { fail "HAProxy tunnel '${name}' not found."; return 1; }
  rm -f "$file"
  if compgen -G "${HAPROXY_TUNNEL_DIR}/*.env" >/dev/null; then
    apply_haproxy_config
  else
    systemctl disable --now xraymesh-haproxy.service 2>/dev/null || true
    rm -f "$HAPROXY_CONFIG" "$HAPROXY_SERVICE_FILE"
    systemctl daemon-reload
  fi
  ok "HAProxy tunnel '${name}' deleted."
}

install_iptables_runtime() {
  if command -v iptables >/dev/null 2>&1; then return; fi
  info "Installing iptables..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq iptables
  ok "iptables installed."
}

valid_ipv4_address() {
  local ip="$1" a b c d
  IFS='.' read -r a b c d <<< "$ip"
  [[ -n "${a:-}" && -n "${b:-}" && -n "${c:-}" && -n "${d:-}" ]] || return 1
  [[ "$a" =~ ^[0-9]+$ && "$b" =~ ^[0-9]+$ && "$c" =~ ^[0-9]+$ && "$d" =~ ^[0-9]+$ ]] || return 1
  (( 10#$a <= 255 && 10#$b <= 255 && 10#$c <= 255 && 10#$d <= 255 ))
}

valid_ipv4_cidr() {
  local value="$1" ip prefix
  if [[ "$value" == */* ]]; then
    ip="${value%/*}"
    prefix="${value##*/}"
    [[ "$prefix" =~ ^[0-9]+$ ]] && (( prefix >= 0 && prefix <= 32 )) || return 1
  else
    ip="$value"
  fi
  valid_ipv4_address "$ip"
}

default_public_interface() {
  ip -4 route show default 2>/dev/null | awk '/^default / {print $5; exit}'
}

select_iptables_protocol() {
  local current="${1:-udp}" choice default_choice=1
  case "$current" in
    tcp) default_choice=2 ;;
    both) default_choice=3 ;;
  esac
  printf '\n'
  say "  Forward protocol" "$BOLD$CYAN"
  printf '  %b[1]%b  UDP  (recommended for Hysteria2 / QUIC)\n' "$CYAN" "$RESET"
  printf '  %b[2]%b  TCP\n' "$PURPLE" "$RESET"
  printf '  %b[3]%b  TCP + UDP\n\n' "$PINK" "$RESET"
  read -r -p "  Select protocol [${default_choice}]: " choice
  choice="${choice:-$default_choice}"
  case "$choice" in
    1) SELECTED_IPTABLES_PROTOCOL="udp" ;;
    2) SELECTED_IPTABLES_PROTOCOL="tcp" ;;
    3) SELECTED_IPTABLES_PROTOCOL="both" ;;
    *) fail "Invalid protocol selection."; return 1 ;;
  esac
}

iptables_protocols() {
  case "$1" in
    udp) printf '%s\n' udp ;;
    tcp) printf '%s\n' tcp ;;
    both) printf '%s\n' tcp udp ;;
    *) return 1 ;;
  esac
}

validate_iptables_interface() {
  [[ "$1" == "any" ]] && return 0
  ip link show dev "$1" >/dev/null 2>&1
}

validate_iptables_ports() {
  local tunnel_name="$1" protocol="$2" port_spec="$3" in_if="$4"
  local definition other_port port proto other_proto listeners
  local TUNNEL_NAME TARGET_IP PORT_SPEC FORWARD_PROTOCOL IN_IF SOURCE_CIDR
  local -A requested=()

  while IFS= read -r proto; do
    while IFS= read -r port; do requested["${proto}:${port}"]=1; done < <(expand_port_spec "$port_spec")
  done < <(iptables_protocols "$protocol")

  for definition in "$IPTABLES_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    TUNNEL_NAME=""; TARGET_IP=""; PORT_SPEC=""; FORWARD_PROTOCOL=""; IN_IF=""; SOURCE_CIDR=""
    # shellcheck disable=SC1090
    source "$definition"
    [[ "$TUNNEL_NAME" == "$tunnel_name" ]] && continue
    [[ "$in_if" == "any" || "$IN_IF" == "any" || "$in_if" == "$IN_IF" ]] || continue
    while IFS= read -r other_proto; do
      while IFS= read -r other_port; do
        if [[ -n "${requested[${other_proto}:${other_port}]:-}" ]]; then
          fail "${other_proto^^} port ${other_port} is already assigned to iptables tunnel '${TUNNEL_NAME}'."
          return 1
        fi
      done < <(expand_port_spec "$PORT_SPEC")
    done < <(iptables_protocols "$FORWARD_PROTOCOL")
  done

  for proto in tcp udp; do
    while IFS= read -r port; do
      [[ -n "${requested[${proto}:${port}]:-}" ]] || continue
      if [[ "$proto" == "tcp" ]]; then
        listeners="$(ss -H -ltnp "sport = :${port}" 2>/dev/null || true)"
      else
        listeners="$(ss -H -lunp "sport = :${port}" 2>/dev/null || true)"
      fi
      if [[ -n "$listeners" ]]; then
        fail "${proto^^} port ${port} is already used by a local service."
        return 1
      fi
    done < <(expand_port_spec "$port_spec")
  done
}

write_ip_forwarding_config() {
  cat > "$IPTABLES_SYSCTL_FILE" <<'EOF_SYSCTL'
# Managed by XRayMesh iptables tunnels.
net.ipv4.ip_forward=1
EOF_SYSCTL
  chmod 644 "$IPTABLES_SYSCTL_FILE"
  sysctl -w net.ipv4.ip_forward=1 >/dev/null
}

save_iptables_tunnel() {
  local name="$1" target="$2" ports="$3" protocol="$4" in_if="$5" source_cidr="$6"
  local file="${IPTABLES_TUNNEL_DIR}/${name}.env"
  mkdir -p "$IPTABLES_TUNNEL_DIR"
  umask 077
  {
    printf 'TUNNEL_NAME=%q\n' "$name"
    printf 'TARGET_IP=%q\n' "$target"
    printf 'PORT_SPEC=%q\n' "$ports"
    printf 'FORWARD_PROTOCOL=%q\n' "$protocol"
    printf 'IN_IF=%q\n' "$in_if"
    printf 'SOURCE_CIDR=%q\n' "$source_cidr"
  } > "$file"
}

write_iptables_service() {
  cat > "$IPTABLES_SERVICE_FILE" <<EOF_SERVICE
[Unit]
Description=XRayMesh iptables UDP/TCP Tunnels
Wants=network-online.target xraymesh.service
After=network-online.target xraymesh.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${IPTABLES_APPLY_SCRIPT} apply
ExecReload=${IPTABLES_APPLY_SCRIPT} apply
ExecStop=${IPTABLES_APPLY_SCRIPT} remove
CapabilityBoundingSet=CAP_NET_ADMIN
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  systemctl daemon-reload
}

generate_iptables_apply_script() {
  mkdir -p "$IPTABLES_TUNNEL_DIR" "$INSTALL_DIR"
  local tmp="${IPTABLES_APPLY_SCRIPT}.tmp"
  local definition target port_spec protocol in_if source_cidr proto port
  local TUNNEL_NAME TARGET_IP PORT_SPEC FORWARD_PROTOCOL IN_IF SOURCE_CIDR

  cat > "$tmp" <<'EOF_SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

IPT="${IPT:-iptables}"
DNAT_CHAIN="XRAYMESH_DNAT"
SNAT_CHAIN="XRAYMESH_SNAT"
FWD_CHAIN="XRAYMESH_FWD"

remove_jump() {
  local table="$1" parent="$2" child="$3"
  while "$IPT" -w -t "$table" -C "$parent" -j "$child" >/dev/null 2>&1; do
    "$IPT" -w -t "$table" -D "$parent" -j "$child"
  done
}

remove_chain() {
  local table="$1" chain="$2"
  "$IPT" -w -t "$table" -F "$chain" >/dev/null 2>&1 || true
  "$IPT" -w -t "$table" -X "$chain" >/dev/null 2>&1 || true
}

remove_rules() {
  remove_jump nat PREROUTING "$DNAT_CHAIN"
  remove_jump nat POSTROUTING "$SNAT_CHAIN"
  remove_jump filter FORWARD "$FWD_CHAIN"
  remove_chain nat "$DNAT_CHAIN"
  remove_chain nat "$SNAT_CHAIN"
  remove_chain filter "$FWD_CHAIN"
}

apply_rules() {
  remove_rules
  "$IPT" -w -t nat -N "$DNAT_CHAIN"
  "$IPT" -w -t nat -N "$SNAT_CHAIN"
  "$IPT" -w -t filter -N "$FWD_CHAIN"
EOF_SCRIPT

  for definition in "$IPTABLES_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    TUNNEL_NAME=""; TARGET_IP=""; PORT_SPEC=""; FORWARD_PROTOCOL=""; IN_IF=""; SOURCE_CIDR=""
    # shellcheck disable=SC1090
    source "$definition"
    target="$TARGET_IP"
    port_spec="$PORT_SPEC"
    protocol="$FORWARD_PROTOCOL"
    in_if="$IN_IF"
    source_cidr="$SOURCE_CIDR"

    # shellcheck disable=SC2016,SC2129
    while IFS= read -r proto; do
      while IFS= read -r port; do
        printf '  "$IPT" -w -t nat -A "$DNAT_CHAIN"' >> "$tmp"
        [[ "$in_if" == "any" ]] || printf ' -i %q' "$in_if" >> "$tmp"
        printf ' -s %q -p %q --dport %q -j DNAT --to-destination %q\n' \
          "$source_cidr" "$proto" "$port" "${target}:${port}" >> "$tmp"

        printf '  "$IPT" -w -t filter -A "$FWD_CHAIN"' >> "$tmp"
        [[ "$in_if" == "any" ]] || printf ' -i %q' "$in_if" >> "$tmp"
        printf ' -s %q -p %q -d %q --dport %q -m conntrack --ctstate NEW,ESTABLISHED,RELATED -j ACCEPT\n' \
          "$source_cidr" "$proto" "$target" "$port" >> "$tmp"

        printf '  "$IPT" -w -t filter -A "$FWD_CHAIN" -p %q -s %q --sport %q -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT\n' \
          "$proto" "$target" "$port" >> "$tmp"

        printf '  "$IPT" -w -t nat -A "$SNAT_CHAIN" -p %q -d %q --dport %q -m conntrack --ctstate DNAT -j MASQUERADE\n' \
          "$proto" "$target" "$port" >> "$tmp"
      done < <(expand_port_spec "$port_spec")
    done < <(iptables_protocols "$protocol")
  done

  cat >> "$tmp" <<'EOF_SCRIPT'
  "$IPT" -w -t nat -I PREROUTING 1 -j "$DNAT_CHAIN"
  "$IPT" -w -t nat -I POSTROUTING 1 -j "$SNAT_CHAIN"
  "$IPT" -w -t filter -I FORWARD 1 -j "$FWD_CHAIN"
}

case "${1:-apply}" in
  apply) apply_rules ;;
  remove) remove_rules ;;
  *) echo "Usage: $0 [apply|remove]" >&2; exit 2 ;;
esac
EOF_SCRIPT

  mv -f "$tmp" "$IPTABLES_APPLY_SCRIPT"
  chmod 700 "$IPTABLES_APPLY_SCRIPT"
}

apply_iptables_config() {
  local backup="" was_active=0
  install_iptables_runtime
  write_ip_forwarding_config

  if [[ -f "$IPTABLES_APPLY_SCRIPT" ]]; then
    backup="$(mktemp)"
    cp -p "$IPTABLES_APPLY_SCRIPT" "$backup"
  fi
  if systemctl is-active --quiet xraymesh-iptables.service 2>/dev/null; then
    was_active=1
  fi

  generate_iptables_apply_script
  write_iptables_service

  if ! "$IPTABLES_APPLY_SCRIPT" apply; then
    fail "iptables rejected one or more generated rules."
    "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
    if [[ -n "$backup" ]]; then
      cp -p "$backup" "$IPTABLES_APPLY_SCRIPT"
      "$IPTABLES_APPLY_SCRIPT" apply >/dev/null 2>&1 || true
    fi
    [[ -z "$backup" ]] || rm -f "$backup"
    return 1
  fi

  if ! systemctl enable xraymesh-iptables.service >/dev/null ||
     ! systemctl restart xraymesh-iptables.service ||
     ! systemctl is-active --quiet xraymesh-iptables.service; then
    fail "The XRayMesh iptables service failed to start."
    if [[ -n "$backup" ]]; then
      cp -p "$backup" "$IPTABLES_APPLY_SCRIPT"
      if (( was_active )); then
        systemctl restart xraymesh-iptables.service 2>/dev/null || true
      else
        "$IPTABLES_APPLY_SCRIPT" apply >/dev/null 2>&1 || true
      fi
    else
      "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
      systemctl disable --now xraymesh-iptables.service 2>/dev/null || true
    fi
    [[ -z "$backup" ]] || rm -f "$backup"
    return 1
  fi

  [[ -z "$backup" ]] || rm -f "$backup"
  ok "iptables tunnel configuration applied."
}

disable_iptables_tunnels() {
  systemctl disable --now xraymesh-iptables.service 2>/dev/null || true
  if [[ -x "$IPTABLES_APPLY_SCRIPT" ]]; then
    "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
  fi
  rm -f "$IPTABLES_SERVICE_FILE" "$IPTABLES_APPLY_SCRIPT" "$IPTABLES_SYSCTL_FILE"
  systemctl daemon-reload
}

create_iptables_tunnel() {
  header
  section "CREATE IPTABLES TUNNEL"
  info "This forwards raw TCP/UDP through the EasyTier mesh using DNAT + FORWARD + MASQUERADE."
  info "MASQUERADE is enabled so replies return through this server instead of escaping through the destination's default route."
  install_iptables_runtime

  local name ports in_if source_cidr default_if
  while :; do
    read -r -p "  Tunnel name (letters, numbers, _ or -): " name
    validate_tunnel_name "$name" || { warn "Enter a valid name with up to 32 characters."; continue; }
    [[ ! -f "${IPTABLES_TUNNEL_DIR}/${name}.env" ]] || { warn "A tunnel with this name already exists."; continue; }
    break
  done

  select_mesh_target || return 1
  ip route get "$SELECTED_TARGET" >/dev/null 2>&1 || { fail "No route to mesh target ${SELECTED_TARGET}."; return 1; }
  select_iptables_protocol udp || return 1

  default_if="$(default_public_interface)"
  [[ -n "$default_if" ]] || default_if="any"
  while :; do
    in_if="$(prompt_default "Inbound interface (or 'any')" "$default_if")"
    validate_iptables_interface "$in_if" && break
    warn "Interface '${in_if}' does not exist."
  done

  while :; do
    source_cidr="$(prompt_default "Allowed source IPv4/CIDR" "0.0.0.0/0")"
    valid_ipv4_cidr "$source_cidr" && break
    warn "Enter a valid IPv4 address or CIDR, e.g. 0.0.0.0/0 or 203.0.113.0/24."
  done

  while :; do
    read -r -p "  Ports (e.g. 443 or 80,443,8000-8010): " ports
    if expand_port_spec "$ports" >/dev/null &&
       validate_iptables_ports "$name" "$SELECTED_IPTABLES_PROTOCOL" "$ports" "$in_if"; then
      break
    fi
    warn "Invalid/conflicting ports. Use comma-separated ports/ranges; maximum 256 expanded ports."
  done

  save_iptables_tunnel "$name" "$SELECTED_TARGET" "$ports" "$SELECTED_IPTABLES_PROTOCOL" "$in_if" "$source_cidr"
  if apply_iptables_config; then
    ok "Tunnel '${name}' forwards ${SELECTED_IPTABLES_PROTOCOL^^} ports ${ports} to ${SELECTED_TARGET}."
  else
    rm -f "${IPTABLES_TUNNEL_DIR}/${name}.env"
    generate_iptables_apply_script
    return 1
  fi
  pause
}

list_iptables_tunnels() {
  local definition count=0
  local TUNNEL_NAME TARGET_IP PORT_SPEC FORWARD_PROTOCOL IN_IF SOURCE_CIDR
  printf '\n'
  printf '  %-4s %-18s %-16s %-7s %-12s %-18s %s\n' "ID" "NAME" "TARGET" "PROTO" "INTERFACE" "SOURCE" "PORTS"
  printf '  %-4s %-18s %-16s %-7s %-12s %-18s %s\n' "--" "------------------" "---------------" "-------" "------------" "------------------" "----------------"
  IPTABLES_FILES=()
  for definition in "$IPTABLES_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    TUNNEL_NAME=""; TARGET_IP=""; PORT_SPEC=""; FORWARD_PROTOCOL=""; IN_IF=""; SOURCE_CIDR=""
    # shellcheck disable=SC1090
    source "$definition"
    IPTABLES_FILES+=("$definition")
    ((count+=1))
    printf '  %-4s %-18s %-16s %-7s %-12s %-18s %s\n' \
      "$count" "$TUNNEL_NAME" "$TARGET_IP" "${FORWARD_PROTOCOL^^}" "$IN_IF" "$SOURCE_CIDR" "$PORT_SPEC"
  done
  ((count)) || warn "No iptables tunnels are configured."
}

edit_iptables_tunnel() {
  header
  section "EDIT IPTABLES TUNNEL"
  list_iptables_tunnels
  ((${#IPTABLES_FILES[@]})) || { pause; return; }

  local choice definition old_name name ports in_if source_cidr backup
  local TUNNEL_NAME TARGET_IP PORT_SPEC FORWARD_PROTOCOL IN_IF SOURCE_CIDR
  read -r -p "  Select tunnel ID: " choice
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#IPTABLES_FILES[@]} )); then
    fail "Invalid tunnel selection."
    return 1
  fi

  definition="${IPTABLES_FILES[$((choice - 1))]}"
  # shellcheck disable=SC1090
  source "$definition"
  old_name="$TUNNEL_NAME"

  name="$(prompt_default "Tunnel name" "$TUNNEL_NAME")"
  validate_tunnel_name "$name" || { fail "Invalid tunnel name."; return 1; }
  if [[ "$name" != "$old_name" && -f "${IPTABLES_TUNNEL_DIR}/${name}.env" ]]; then
    fail "A tunnel named '${name}' already exists."
    return 1
  fi

  select_mesh_target || return 1
  ip route get "$SELECTED_TARGET" >/dev/null 2>&1 || { fail "No route to mesh target ${SELECTED_TARGET}."; return 1; }
  select_iptables_protocol "$FORWARD_PROTOCOL" || return 1

  while :; do
    in_if="$(prompt_default "Inbound interface (or 'any')" "$IN_IF")"
    validate_iptables_interface "$in_if" && break
    warn "Interface '${in_if}' does not exist."
  done

  while :; do
    source_cidr="$(prompt_default "Allowed source IPv4/CIDR" "$SOURCE_CIDR")"
    valid_ipv4_cidr "$source_cidr" && break
    warn "Invalid source IPv4/CIDR."
  done

  while :; do
    ports="$(prompt_default "Ports" "$PORT_SPEC")"
    if expand_port_spec "$ports" >/dev/null &&
       validate_iptables_ports "$old_name" "$SELECTED_IPTABLES_PROTOCOL" "$ports" "$in_if"; then
      break
    fi
    warn "Invalid/conflicting port list or range."
  done

  backup="$(mktemp)"
  cp "$definition" "$backup"
  [[ "$name" == "$old_name" ]] || rm -f "$definition"
  save_iptables_tunnel "$name" "$SELECTED_TARGET" "$ports" "$SELECTED_IPTABLES_PROTOCOL" "$in_if" "$source_cidr"

  if ! apply_iptables_config; then
    rm -f "${IPTABLES_TUNNEL_DIR}/${name}.env"
    cp "$backup" "$definition"
    rm -f "$backup"
    generate_iptables_apply_script
    fail "The previous iptables tunnel configuration was restored."
    return 1
  fi

  rm -f "$backup"
  ok "iptables tunnel '${name}' updated."
  pause
}

delete_iptables_tunnel() {
  header
  section "DELETE IPTABLES TUNNEL"
  list_iptables_tunnels
  ((${#IPTABLES_FILES[@]})) || { pause; return; }

  local choice definition confirm
  local TUNNEL_NAME TARGET_IP PORT_SPEC FORWARD_PROTOCOL IN_IF SOURCE_CIDR
  read -r -p "  Select tunnel ID: " choice
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#IPTABLES_FILES[@]} )); then
    fail "Invalid tunnel selection."
    return 1
  fi

  definition="${IPTABLES_FILES[$((choice - 1))]}"
  # shellcheck disable=SC1090
  source "$definition"
  read -r -p "  Type DELETE to remove '${TUNNEL_NAME}': " confirm
  [[ "$confirm" == "DELETE" ]] || { info "Delete operation cancelled."; return; }

  rm -f "$definition"
  if compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null; then
    apply_iptables_config
  else
    disable_iptables_tunnels
  fi
  ok "iptables tunnel '${TUNNEL_NAME}' deleted."
  pause
}

show_iptables_rules() {
  header
  section "ACTIVE IPTABLES RULES"
  install_iptables_runtime
  printf '\n  NAT / DNAT\n'
  iptables -w -t nat -L XRAYMESH_DNAT -n -v --line-numbers 2>/dev/null || warn "XRAYMESH_DNAT is not active."
  printf '\n  FILTER / FORWARD\n'
  iptables -w -t filter -L XRAYMESH_FWD -n -v --line-numbers 2>/dev/null || warn "XRAYMESH_FWD is not active."
  printf '\n  NAT / MASQUERADE\n'
  iptables -w -t nat -L XRAYMESH_SNAT -n -v --line-numbers 2>/dev/null || warn "XRAYMESH_SNAT is not active."
  printf '\n'
  pause
}

iptables_tunnel_menu() {
  while true; do
    header
    section "IPTABLES UDP/TCP TUNNELS"
    printf '  Service: %s\n' "$(systemctl is-active xraymesh-iptables.service 2>/dev/null || echo inactive)"
    printf '  IPv4 forwarding: %s\n' "$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo unknown)"
    list_iptables_tunnels
    printf '\n'
    printf '  %b[1]%b  Create tunnel\n' "$CYAN" "$RESET"
    printf '  %b[2]%b  Edit tunnel\n' "$PURPLE" "$RESET"
    printf '  %b[3]%b  Delete tunnel\n' "$RED" "$RESET"
    printf '  %b[4]%b  Reapply managed rules\n' "$BLUE" "$RESET"
    printf '  %b[5]%b  View active rules/counters\n' "$GREEN" "$RESET"
    printf '  %b[0]%b  Back\n\n' "$GRAY" "$RESET"
    read -r -p "  Select an option [0-5]: " choice
    case "$choice" in
      1) run_screen create_iptables_tunnel ;;
      2) run_screen edit_iptables_tunnel ;;
      3) run_screen delete_iptables_tunnel ;;
      4)
        if compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null; then
          run_screen apply_iptables_config
          pause
        else
          warn "No iptables tunnels are configured."
          sleep 1
        fi
        ;;
      5) run_screen show_iptables_rules ;;
      0) return ;;
      *) warn "Invalid option"; sleep 1 ;;
    esac
  done
}

create_iptables_tunnel_noninteractive() {
  require_root
  install_iptables_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}" protocol="${4:-udp}" in_if="${5:-any}" source_cidr="${6:-0.0.0.0/0}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ ! -f "${IPTABLES_TUNNEL_DIR}/${name}.env" ]] || { fail "A tunnel with this name already exists."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  [[ "$protocol" =~ ^(tcp|udp|both)$ ]] || { fail "Protocol must be tcp, udp, or both."; return 1; }
  validate_iptables_interface "$in_if" || { fail "Interface '${in_if}' does not exist."; return 1; }
  valid_ipv4_cidr "$source_cidr" || { fail "Invalid source IPv4/CIDR '${source_cidr}'."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port specification."; return 1; }
  validate_iptables_ports "$name" "$protocol" "$ports" "$in_if" || return 1

  save_iptables_tunnel "$name" "$target" "$ports" "$protocol" "$in_if" "$source_cidr"
  if apply_iptables_config; then
    ok "iptables tunnel '${name}' forwards ${protocol^^} ports ${ports} to ${target}."
  else
    rm -f "${IPTABLES_TUNNEL_DIR}/${name}.env"
    generate_iptables_apply_script
    return 1
  fi
}

delete_iptables_tunnel_noninteractive() {
  require_root
  local name="${1:-}" file="${IPTABLES_TUNNEL_DIR}/${1}.env"
  [[ -f "$file" ]] || { fail "iptables tunnel '${name}' not found."; return 1; }
  rm -f "$file"
  if compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null; then
    apply_iptables_config
  else
    disable_iptables_tunnels
  fi
  ok "iptables tunnel '${name}' deleted."
}

update_web_assets() {
  mkdir -p "${WEB_DIR}/static" /etc/xraymesh
  local script_dir branch="${XRAYMESH_BRANCH:-beta}" updated=0
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [[ -f "${script_dir}/web/server.py" && -f "${script_dir}/web/static/index.html" ]]; then
    install -m 0755 "${script_dir}/web/server.py" "${WEB_DIR}/server.py"
    install -m 0644 "${script_dir}/web/static/index.html" "${WEB_DIR}/static/index.html"
    updated=1
  else
    local tmp_srv tmp_idx
    tmp_srv="$(mktemp)"
    tmp_idx="$(mktemp)"
    if curl -fsSL --connect-timeout 8 \
      "https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/${branch}/web/server.py" \
      -o "$tmp_srv" 2>/dev/null && [[ -s "$tmp_srv" ]]; then
      install -m 0755 "$tmp_srv" "${WEB_DIR}/server.py"
      updated=1
    fi
    rm -f "$tmp_srv"

    if curl -fsSL --connect-timeout 8 \
      "https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/${branch}/web/static/index.html" \
      -o "$tmp_idx" 2>/dev/null && [[ -s "$tmp_idx" ]]; then
      install -m 0644 "$tmp_idx" "${WEB_DIR}/static/index.html"
      updated=1
    fi
    rm -f "$tmp_idx"
  fi

  if (( updated )) && systemctl is-active --quiet xraymesh-web.service 2>/dev/null; then
    systemctl restart xraymesh-web.service 2>/dev/null || true
  fi
}

install_web_runtime() {
  install_dependencies
  update_web_assets

  if [[ ! -f "$WEB_CONFIG_FILE" ]]; then
    umask 077
    cat > "$WEB_CONFIG_FILE" <<EOF_WEB_CFG
WEB_PORT="${DEFAULT_WEB_PORT}"
WEB_BIND="0.0.0.0"
WEB_PASSWORD_HASH=""
EOF_WEB_CFG
    chmod 600 "$WEB_CONFIG_FILE"
  fi

  write_web_services
}

write_web_services() {
  cat > "$WEB_SERVICE_FILE" <<EOF_WEB_SVC
[Unit]
Description=XRayMesh Web UI & API Daemon
Documentation=https://github.com/Erfan-XRay/XRayMesh
Wants=network-online.target xraymesh.service
After=network-online.target xraymesh.service

[Service]
Type=simple
EnvironmentFile=-${WEB_CONFIG_FILE}
ExecStart=/usr/bin/python3 ${WEB_DIR}/server.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=/etc/xraymesh ${INSTALL_DIR}
SyslogIdentifier=xraymesh-web

[Install]
WantedBy=multi-user.target
EOF_WEB_SVC

  cat > "$IPERF_SERVICE_FILE" <<EOF_IPERF_SVC
[Unit]
Description=XRayMesh iperf3 Speedtest Daemon
Documentation=https://github.com/Erfan-XRay/XRayMesh
Wants=network-online.target xraymesh.service
After=network-online.target xraymesh.service

[Service]
Type=simple
ExecStart=/usr/bin/iperf3 -s -p 5201
Restart=always
RestartSec=3
SyslogIdentifier=xraymesh-iperf

[Install]
WantedBy=multi-user.target
EOF_IPERF_SVC

  systemctl daemon-reload
}

get_web_port() {
  if [[ -f "$WEB_CONFIG_FILE" ]]; then
    local port
    port="$(grep -E '^WEB_PORT=' "$WEB_CONFIG_FILE" 2>/dev/null | cut -d= -f2 | tr -d '"'\'' ')"
    echo "${port:-$DEFAULT_WEB_PORT}"
  else
    echo "$DEFAULT_WEB_PORT"
  fi
}

get_server_ip() {
  local ip
  ip="$(curl -fsS4 --connect-timeout 2 https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "$ip" ]]; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || true)"
  fi
  echo "${ip:-127.0.0.1}"
}

generate_web_token() {
  install_web_runtime
  local token now expiry_ts pub_ip port mesh_ip
  token="$(openssl rand -hex 16)"
  now="$(date +%s)"
  expiry_ts=$(( now + 3600 ))
  port="$(get_web_port)"
  pub_ip="$(get_server_ip)"
  mesh_ip=""
  if [[ -f "$CONFIG_FILE" ]]; then
    mesh_ip="$(grep -E '^IPV4=' "$CONFIG_FILE" 2>/dev/null | cut -d= -f2 | tr -d '"'\'' ')"
  fi

  python3 -c "import json, os, sys
p = sys.argv[1]
tk = sys.argv[2]
exp = int(sys.argv[3])
tokens = {}
if os.path.isfile(p):
    try:
        with open(p, 'r') as f: tokens = json.load(f)
    except Exception: pass
tokens[tk] = {'expires': exp, 'one_time': True}
with open(p, 'w') as f: json.dump(tokens, f, indent=2)
try: os.chmod(p, 0o600)
except Exception: pass
" "$WEB_TOKEN_FILE" "$token" "$expiry_ts"

  if ! systemctl is-active --quiet xraymesh-web.service 2>/dev/null; then
    systemctl enable --now xraymesh-web.service >/dev/null 2>&1 || true
    systemctl enable --now xraymesh-iperf.service >/dev/null 2>&1 || true
  fi

  header
  section "ONE-CLICK WEB DASHBOARD LOGIN"
  ok "A temporary login token was generated (valid for 60 minutes)."
  printf '\n'
  say "  Direct Browser Link (Public IP):" "$BOLD$CYAN"
  printf '  %bhttp://%s:%s/?token=%s%b\n\n' "$BOLD$GREEN" "$pub_ip" "$port" "$token" "$RESET"

  if [[ -n "$mesh_ip" ]]; then
    say "  Internal Mesh Link (Virtual IP):" "$BOLD$PURPLE"
    printf '  %bhttp://%s:%s/?token=%s%b\n\n' "$BLUE" "$mesh_ip" "$port" "$token" "$RESET"
  fi

  say "  Token string:" "$BOLD$YELLOW"
  printf '  %b%s%b\n\n' "$BOLD" "$token" "$RESET"
  info "Opening the URL in your browser logs you in instantly."
  pause
}

set_web_password() {
  install_web_runtime
  header
  section "SET ADMIN PASSWORD"
  local pass1 pass2 hash
  read -r -s -p "  Enter new admin password: " pass1
  printf '\n'
  read -r -s -p "  Confirm admin password: " pass2
  printf '\n'
  if [[ "$pass1" != "$pass2" ]]; then
    fail "Passwords do not match."
    pause
    return 1
  fi
  if [[ ${#pass1} -lt 6 ]]; then
    fail "Password must be at least 6 characters long."
    pause
    return 1
  fi

  hash="$(python3 -c "import secrets, hashlib, sys
pw = sys.argv[1]
salt = secrets.token_hex(16)
h = hashlib.sha256((salt + pw).encode('utf-8')).hexdigest()
print(f'sha256\${salt}\${h}')
" "$pass1")"

  if grep -q '^WEB_PASSWORD_HASH=' "$WEB_CONFIG_FILE" 2>/dev/null; then
    sed -i "s|^WEB_PASSWORD_HASH=.*|WEB_PASSWORD_HASH=\"${hash}\"|" "$WEB_CONFIG_FILE"
  else
    printf 'WEB_PASSWORD_HASH=%q\n' "$hash" >> "$WEB_CONFIG_FILE"
  fi
  chmod 600 "$WEB_CONFIG_FILE"

  systemctl restart xraymesh-web.service 2>/dev/null || true
  ok "Admin password configured successfully."
  pause
}

configure_web_port() {
  install_web_runtime
  header
  section "CHANGE WEB PORT"
  local current_port new_port
  current_port="$(get_web_port)"
  read -r -p "  Enter web port [${current_port}]: " new_port
  new_port="${new_port:-$current_port}"
  if ! valid_port "$new_port"; then
    fail "Invalid port number."
    pause
    return 1
  fi

  if grep -q '^WEB_PORT=' "$WEB_CONFIG_FILE" 2>/dev/null; then
    sed -i "s|^WEB_PORT=.*|WEB_PORT=\"${new_port}\"|" "$WEB_CONFIG_FILE"
  else
    printf 'WEB_PORT=%q\n' "$new_port" >> "$WEB_CONFIG_FILE"
  fi

  systemctl restart xraymesh-web.service 2>/dev/null || true
  ok "Web port updated to ${new_port}."
  pause
}

web_menu() {
  install_web_runtime
  while true; do
    header
    section "WEB DASHBOARD & SPEEDTEST"
    local web_state iperf_state port pub_ip has_pw
    web_state="$(systemctl is-active xraymesh-web.service 2>/dev/null || echo inactive)"
    iperf_state="$(systemctl is-active xraymesh-iperf.service 2>/dev/null || echo inactive)"
    port="$(get_web_port)"
    pub_ip="$(get_server_ip)"
    has_pw="No (Token only)"
    if grep -qE '^WEB_PASSWORD_HASH="sha256' "$WEB_CONFIG_FILE" 2>/dev/null; then
      has_pw="Yes (Password + Token)"
    fi

    printf '  Web Service:      %s\n' "$web_state"
    printf '  iperf3 Service:   %s\n' "$iperf_state"
    printf '  Web URL:          http://%s:%s\n' "$pub_ip" "$port"
    printf '  Password Login:   %s\n\n' "$has_pw"

    printf '  %b[1]%b  Start / Enable Web Dashboard & iperf3\n' "$GREEN" "$RESET"
    printf '  %b[2]%b  Stop Web Dashboard\n' "$RED" "$RESET"
    printf '  %b[3]%b  Restart Web Dashboard & iperf3\n' "$BLUE" "$RESET"
    printf '  %b[4]%b  Generate One-Click Login Link (Token)\n' "$CYAN" "$RESET"
    printf '  %b[5]%b  Set / Change Admin Password\n' "$PURPLE" "$RESET"
    printf '  %b[6]%b  Change Web Port\n' "$YELLOW" "$RESET"
    printf '  %b[7]%b  View Web Logs\n' "$PINK" "$RESET"
    printf '  %b[0]%b  Back\n\n' "$GRAY" "$RESET"

    read -r -p "  Select an option [0-7]: " choice
    case "$choice" in
      1)
        systemctl enable --now xraymesh-web.service xraymesh-iperf.service
        ok "Web Dashboard and iperf3 services started."
        pause
        ;;
      2)
        systemctl stop xraymesh-web.service
        warn "Web Dashboard stopped."
        pause
        ;;
      3)
        systemctl restart xraymesh-web.service xraymesh-iperf.service
        ok "Services restarted."
        pause
        ;;
      4) run_screen generate_web_token ;;
      5) run_screen set_web_password ;;
      6) run_screen configure_web_port ;;
      7) journalctl -u xraymesh-web.service -f -n 50 ;;
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
  if [[ -d "$WEB_DIR" || -f "$WEB_SERVICE_FILE" ]]; then
    update_web_assets
  fi
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
  systemctl disable --now xraymesh-iptables.service 2>/dev/null || true
  systemctl disable --now xraymesh-web.service 2>/dev/null || true
  systemctl disable --now xraymesh-iperf.service 2>/dev/null || true
  if [[ -x "$IPTABLES_APPLY_SCRIPT" ]]; then
    "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
  fi
  rm -f "$SERVICE_FILE" "$HAPROXY_SERVICE_FILE" "$IPTABLES_SERVICE_FILE" "$IPTABLES_SYSCTL_FILE" "$WEB_SERVICE_FILE" "$IPERF_SERVICE_FILE"
  rm -rf -- "$INSTALL_DIR" /etc/xraymesh
  systemctl daemon-reload
  ok "XRayMesh has been removed."
  exit 0
}

self_test_platform() {
  [[ "$(uname -s)" == "Linux" ]] && command -v systemctl >/dev/null
}

self_test_commands() {
  local command_name
  for command_name in curl unzip openssl ip ping jq sha256sum ss python3 iperf3; do
    command -v "$command_name" >/dev/null || return 1
  done
}

self_test_core() {
  [[ -x "${BIN_DIR}/easytier-core" && -x "${BIN_DIR}/easytier-cli" ]]
}

self_test_config_permissions() {
  [[ "$(stat -c '%a' "$CONFIG_FILE")" == "600" ]]
}

self_test_iptables_command() {
  command -v iptables >/dev/null 2>&1
}

self_test_ipv4_forwarding() {
  [[ "$(sysctl -n net.ipv4.ip_forward 2>/dev/null)" == "1" ]]
}

self_test() {
  local failures=0 checks=0
  header
  section "XRAYMESH SELF-TEST"

  test_result() {
    ((checks+=1))
    if "$@"; then
      ok "$SELF_TEST_LABEL"
    else
      fail "$SELF_TEST_LABEL"
      ((failures+=1))
    fi
  }

  SELF_TEST_LABEL="Linux and systemd are available"
  test_result self_test_platform
  SELF_TEST_LABEL="Required commands are installed"
  test_result self_test_commands
  SELF_TEST_LABEL="EasyTier core and CLI are executable"
  test_result self_test_core

  if [[ -f "$CONFIG_FILE" ]]; then
    SELF_TEST_LABEL="Node configuration has secure permissions"
    test_result self_test_config_permissions
    SELF_TEST_LABEL="Node systemd unit is valid"
    test_result systemd-analyze verify "$SERVICE_FILE"
    SELF_TEST_LABEL="Mesh service is active"
    test_result systemctl is-active --quiet xraymesh.service
  else
    warn "Node configuration checks skipped: no node is configured."
  fi

  if compgen -G "${HAPROXY_TUNNEL_DIR}/*.env" >/dev/null; then
    SELF_TEST_LABEL="HAProxy configuration is valid"
    test_result haproxy -c -f "$HAPROXY_CONFIG"
    SELF_TEST_LABEL="HAProxy service is active"
    test_result systemctl is-active --quiet xraymesh-haproxy.service
  fi
  if compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null; then
    SELF_TEST_LABEL="iptables command is available"
    test_result self_test_iptables_command
    SELF_TEST_LABEL="IPv4 forwarding is enabled"
    test_result self_test_ipv4_forwarding
    SELF_TEST_LABEL="iptables tunnel service is active"
    test_result systemctl is-active --quiet xraymesh-iptables.service
    SELF_TEST_LABEL="XRayMesh DNAT chain is active"
    test_result iptables -w -t nat -S XRAYMESH_DNAT
  fi
  if [[ -f "$WEB_SERVICE_FILE" ]]; then
    SELF_TEST_LABEL="Web Dashboard service is active"
    test_result systemctl is-active --quiet xraymesh-web.service
    SELF_TEST_LABEL="iperf3 speedtest service is active"
    test_result systemctl is-active --quiet xraymesh-iperf.service
  fi

  printf '\n'
  if (( failures == 0 )); then
    ok "All ${checks} checks passed."
  else
    fail "${failures} of ${checks} checks failed."
  fi
  [[ -t 0 ]] && pause
  (( failures == 0 ))
}

menu() {
  require_root
  require_linux
  install_dependencies
  if [[ -d "$WEB_DIR" || -f "$WEB_SERVICE_FILE" ]]; then
    update_web_assets >/dev/null 2>&1 || true
  fi
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
    printf '  %b[9]%b  iptables UDP/TCP tunnels\n' "$CYAN" "$RESET"
    printf '  %b[10]%b Web UI Dashboard & Speedtest\n' "$GREEN" "$RESET"
    printf '  %b[11]%b Run self-test\n' "$BLUE" "$RESET"
    printf '  %b[12]%b Delete mesh configuration\n' "$YELLOW" "$RESET"
    printf '  %b[13]%b Uninstall XRayMesh completely\n' "$RED" "$RESET"
    printf '  %b[0]%b  Exit\n\n' "$GRAY" "$RESET"
    printf '%b  Tip: Ctrl+C exits here; inside a screen it returns to this menu.%b\n\n' "$DIM$GRAY" "$RESET"
    read -r -p "  Select an option [0-13]: " choice || { choice=""; continue; }
    case "$choice" in
      1) IN_MAIN_MENU=0; run_screen setup_node; IN_MAIN_MENU=1 ;;
      2) IN_MAIN_MENU=0; run_screen live_status; IN_MAIN_MENU=1 ;;
      3) IN_MAIN_MENU=0; run_screen show_routes; IN_MAIN_MENU=1 ;;
      4) IN_MAIN_MENU=0; run_screen show_logs; IN_MAIN_MENU=1 ;;
      5) IN_MAIN_MENU=0; run_screen control_service; IN_MAIN_MENU=1 ;;
      6) IN_MAIN_MENU=0; run_screen update_core; IN_MAIN_MENU=1 ;;
      7) IN_MAIN_MENU=0; run_screen diagnostics; IN_MAIN_MENU=1 ;;
      8) IN_MAIN_MENU=0; run_screen haproxy_tunnel_menu; IN_MAIN_MENU=1 ;;
      9) IN_MAIN_MENU=0; run_screen iptables_tunnel_menu; IN_MAIN_MENU=1 ;;
      10) IN_MAIN_MENU=0; run_screen web_menu; IN_MAIN_MENU=1 ;;
      11) IN_MAIN_MENU=0; run_screen self_test; IN_MAIN_MENU=1 ;;
      12) IN_MAIN_MENU=0; run_screen delete_mesh; IN_MAIN_MENU=1 ;;
      13)
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

main() {
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
  haproxy-create) shift; require_linux; create_haproxy_tunnel_noninteractive "$@" ;;
  haproxy-delete) shift; require_linux; delete_haproxy_tunnel_noninteractive "$@" ;;
  iptables) require_root; require_linux; iptables_tunnel_menu ;;
  iptables-create) shift; require_linux; create_iptables_tunnel_noninteractive "$@" ;;
  iptables-delete) shift; require_linux; delete_iptables_tunnel_noninteractive "$@" ;;
  web|dashboard-web) require_root; require_linux; web_menu ;;
  token|web-token) require_root; require_linux; generate_web_token ;;
  web-start) require_root; require_linux; systemctl start xraymesh-web.service xraymesh-iperf.service ;;
  web-stop) require_root; require_linux; systemctl stop xraymesh-web.service xraymesh-iperf.service ;;
  web-restart) require_root; require_linux; systemctl restart xraymesh-web.service xraymesh-iperf.service ;;
  self-test|doctor) require_linux; self_test ;;
  start|stop|restart) require_root; systemctl "$1" xraymesh.service ;;
  version|-v|--version) echo "${APP} ${VERSION} - © ${OWNER}" ;;
  *)
    echo "Usage: $0 [menu|install|status|peers|routes|logs|update|delete|haproxy|iptables|web|token|self-test|start|stop|restart|version]"
    exit 2
    ;;
esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
