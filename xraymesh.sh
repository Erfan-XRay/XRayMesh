#!/usr/bin/env bash
# XRayMesh - EasyTier mesh network manager
# Developed by ErfanXRay

set -Eeuo pipefail
IFS=$'\n\t'

readonly APP="XRayMesh"
readonly VERSION="2.1.5"
readonly OWNER="ErfanXRay"
readonly INSTALL_DIR="/opt/xraymesh"
readonly BIN_DIR="${INSTALL_DIR}/bin"
readonly CONFIG_FILE="/etc/xraymesh/config.env"
readonly SERVICE_FILE="/etc/systemd/system/xraymesh.service"
readonly HAPROXY_SERVICE_FILE="/etc/systemd/system/xraymesh-haproxy.service"
readonly HAPROXY_CONFIG="/etc/xraymesh/haproxy.cfg"
readonly HAPROXY_TUNNEL_DIR="${HAPROXY_TUNNEL_DIR:-/etc/xraymesh/haproxy-tunnels}"
readonly IPTABLES_SERVICE_FILE="/etc/systemd/system/xraymesh-iptables.service"
readonly IPTABLES_TUNNEL_DIR="${IPTABLES_TUNNEL_DIR:-/etc/xraymesh/iptables-tunnels}"
readonly IPTABLES_APPLY_SCRIPT="${INSTALL_DIR}/xraymesh-iptables-apply"
readonly IPTABLES_SYSCTL_FILE="/etc/sysctl.d/99-xraymesh-forwarding.conf"
readonly GOST_BIN="${BIN_DIR}/gost"
readonly GOST_SERVICE_FILE="/etc/systemd/system/xraymesh-gost.service"
readonly GOST_CONFIG_FILE="${GOST_CONFIG_FILE:-/etc/xraymesh/gost.json}"
readonly GOST_TUNNEL_DIR="${GOST_TUNNEL_DIR:-/etc/xraymesh/gost-tunnels}"
readonly FALLBACK_GOST_VERSION="v3.3.0"
readonly REALM_BIN="${BIN_DIR}/realm"
readonly REALM_SERVICE_FILE="/etc/systemd/system/xraymesh-realm.service"
readonly REALM_CONFIG_FILE="${REALM_CONFIG_FILE:-/etc/xraymesh/realm.json}"
readonly REALM_TUNNEL_DIR="${REALM_TUNNEL_DIR:-/etc/xraymesh/realm-tunnels}"
readonly FALLBACK_REALM_VERSION="v2.6.2"
readonly WEB_DIR="${INSTALL_DIR}/web"
readonly WEB_CONFIG_FILE="/etc/xraymesh/web.env"
readonly WEB_SERVICE_FILE="/etc/systemd/system/xraymesh-web.service"
readonly IPERF_SERVICE_FILE="/etc/systemd/system/xraymesh-iperf.service"
readonly IPERF_RUNNER="${INSTALL_DIR}/xraymesh-iperf-runner"
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
  printf '\n%b  %s%b\n' "$BOLD$CYAN" "$1" "$RESET"
  printf '%b  ────────────────────────────────────────────────────────────%b\n' "$DIM$BLUE" "$RESET"
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
  printf '%b  EasyTier Mesh Manager%b  %b│%b  v%s  %b│%b  Developed by %s\n' \
    "$BOLD$PINK" "$RESET" "$GRAY" "$RESET" "$VERSION" "$GRAY" "$RESET" "$OWNER"
  printf '%b  ────────────────────────────────────────────────────────────%b\n\n' "$DIM$BLUE" "$RESET"
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
  for cmd in curl unzip openssl ip ping figlet jq sha256sum ss python3 iperf3 tar; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  ((${#missing[@]} == 0)) && return
  info "Installing dependencies..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl unzip openssl iproute2 iputils-ping ca-certificates figlet jq python3 iperf3 tar
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
  local enable_kcp="${11:-no}"

  # Pre-sanitize stored peers list
  local clean_peers=()
  if [[ -n "$peers" ]]; then
    IFS=',' read -ra raw_p_list <<< "$peers"
    for p in "${raw_p_list[@]}"; do
      p="${p//[[:space:]]/}"
      [[ -z "$p" ]] && continue
      p="${p%/}"
      while [[ "$p" == *: ]]; do p="${p%:}"; done
      [[ "$p" =~ ^:+ || "$p" =~ ^[0-9]+$ ]] && continue
      if [[ ! "$p" =~ \[.*\] && "$p" =~ ^(.+):+([0-9]+)$ ]]; then
        local ph="${BASH_REMATCH[1]}"
        while [[ "$ph" == *: ]]; do ph="${ph%:}"; done
        p="${ph}:${BASH_REMATCH[2]}"
      fi
      clean_peers+=("$p")
    done
  fi
  local peers_formatted=""
  if ((${#clean_peers[@]})); then
    peers_formatted="$(IFS=','; echo "${clean_peers[*]}")"
  fi

  umask 077
  {
    printf 'NETWORK_NAME=%q\n' "$name"
    printf 'NETWORK_SECRET=%q\n' "$secret"
    printf 'HOSTNAME=%q\n' "$hostname"
    printf 'IPV4=%q\n' "$ipv4"
    printf 'PROTOCOL=%q\n' "$protocol"
    printf 'PORT=%q\n' "$port"
    printf 'PEERS=%q\n' "$peers_formatted"
    printf 'ENCRYPTION=%q\n' "$encryption"
    printf 'IPV6=%q\n' "$ipv6"
    printf 'MTU=%q\n' "$mtu"
    printf 'ENABLE_KCP=%q\n' "$enable_kcp"
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
StartLimitIntervalSec=60
StartLimitBurst=10

[Service]
Type=simple
EnvironmentFile=${CONFIG_FILE}
ExecStart=${INSTALL_DIR}/xraymesh-runner
Restart=always
RestartSec=3
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

  write_runner
  write_iperf_service
  systemctl daemon-reload
}

write_runner() {
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
  --mtu "$MTU"
)

# Normalize protocol (EasyTier --default-protocol only takes tcp or udp)
proto_lower="$(echo "${PROTOCOL:-dual}" | tr '[:upper:]' '[:lower:]')"
if [[ "$proto_lower" == "tcp" || "$proto_lower" == "ws" || "$proto_lower" == "wss" ]]; then
  args+=(--default-protocol "tcp")
else
  args+=(--default-protocol "udp")
fi

# Configure listeners based on protocol (always use explicit URI schemes)
case "$proto_lower" in
  tcp)
    args+=(--listeners "tcp://0.0.0.0:${PORT}")
    ;;
  udp)
    args+=(--listeners "udp://0.0.0.0:${PORT}")
    ;;
  ws)
    args+=(--listeners "ws://0.0.0.0:${PORT}/")
    ;;
  wss)
    args+=(--listeners "wss://0.0.0.0:${PORT}/")
    ;;
  quic)
    # QUIC mode: enable QUIC listener with proxy and TCP fallback for strict firewall environments
    args+=(--listeners "quic://0.0.0.0:${PORT}" --listeners "tcp://0.0.0.0:${PORT}" --enable-quic-proxy)
    ;;
  faketcp)
    args+=(--listeners "faketcp://0.0.0.0:${PORT}")
    ;;
  dual|*)
    args+=(--listeners "tcp://0.0.0.0:${PORT}" --listeners "udp://0.0.0.0:${PORT}")
    ;;
esac

# KCP Loss-Resistance Proxy
if [[ "${ENABLE_KCP:-no}" == "yes" ]]; then
  args+=(--enable-kcp-proxy)
fi

[[ "${IPV6:-yes}" == "no" ]] && args+=(--disable-ipv6)
[[ "${ENCRYPTION:-yes}" == "no" ]] && args+=(--disable-encryption)

if [[ -n "${PEERS:-}" ]]; then
  IFS=',' read -ra peer_list <<< "$PEERS"
  peer_args=()
  for peer in "${peer_list[@]}"; do
    peer="${peer//[[:space:]]/}"
    [[ -z "$peer" ]] && continue

    p_scheme=""
    if [[ "$peer" == *"://"* ]]; then
      p_scheme="${peer%%://*}"
      p_hostport="${peer#*://}"
    else
      p_hostport="$peer"
    fi

    # Strip trailing slashes and colons
    p_hostport="${p_hostport%/}"
    while [[ "$p_hostport" == *: ]]; do
      p_hostport="${p_hostport%:}"
    done

    if [[ "$p_hostport" =~ ^(\[[^\]]+\])(:([0-9]+))?$ ]]; then
      p_host="${BASH_REMATCH[1]}"
      p_port="${BASH_REMATCH[3]:-$PORT}"
    elif [[ "$p_hostport" =~ ^(.+):+([0-9]+)$ ]]; then
      p_host="${BASH_REMATCH[1]}"
      while [[ "$p_host" == *: ]]; do p_host="${p_host%:}"; done
      p_port="${BASH_REMATCH[2]}"
    else
      p_host="$p_hostport"
      p_port="$PORT"
    fi

    # Skip if host is empty, starts with colon, or is just digits
    if [[ -z "$p_host" || "$p_host" =~ ^:+ || "$p_host" =~ ^[0-9]+$ || "$p_host" == ":" ]]; then
      continue
    fi

    target="${p_host}:${p_port}"
    if [[ -n "$p_scheme" ]]; then
      if [[ "$p_scheme" == "ws" || "$p_scheme" == "wss" ]]; then
        peer_args+=("${p_scheme}://${target}/")
      elif [[ "$p_scheme" == "quic" ]]; then
        peer_args+=("quic://${target}" "tcp://${target}")
      elif [[ "$p_scheme" == "wg" ]]; then
        peer_args+=("tcp://${target}" "udp://${target}")
      else
        peer_args+=("${p_scheme}://${target}")
      fi
    else
      case "$proto_lower" in
        tcp)
          peer_args+=("tcp://${target}")
          ;;
        ws)
          peer_args+=("ws://${target}/")
          ;;
        wss)
          peer_args+=("wss://${target}/")
          ;;
        quic)
          peer_args+=("quic://${target}" "tcp://${target}")
          ;;
        faketcp)
          peer_args+=("faketcp://${target}")
          ;;
        udp)
          peer_args+=("udp://${target}")
          ;;
        dual|*)
          peer_args+=("tcp://${target}" "udp://${target}")
          ;;
      esac
    fi
  done
  if ((${#peer_args[@]})); then
    for p in "${peer_args[@]}"; do
      args+=(--peers "$p")
    done
  fi
fi

# Ensure kernel IP forwarding is active
sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

# Auto-allow Mesh Port in iptables and ufw if installed
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null || true
  iptables -C INPUT -p udp --dport "$PORT" -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport "$PORT" -j ACCEPT 2>/dev/null || true
fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
  ufw allow "$PORT"/udp >/dev/null 2>&1 || true
fi

exec /opt/xraymesh/bin/easytier-core "${args[@]}"
RUNNER
  chmod 0755 "${INSTALL_DIR}/xraymesh-runner"
}

write_iperf_service() {
  cat > "$IPERF_RUNNER" <<'RUNNER_IPERF'
#!/usr/bin/env bash
set -Eeuo pipefail
config_file="/etc/xraymesh/config.env"
mesh_ip=""
if [[ -f "$config_file" ]]; then
  mesh_ip="$( (grep -E '^IPV4=' "$config_file" 2>/dev/null || true) | cut -d= -f2- | tr -d '"'\'' ' )"
fi

# Wait for mesh virtual IP to be assigned to an interface (up to 20 seconds)
if [[ -n "$mesh_ip" ]]; then
  for _ in {1..20}; do
    if ip addr show 2>/dev/null | grep -Fq "$mesh_ip"; then
      break
    fi
    sleep 1
  done
  # Bind strictly to Mesh Virtual IP so port 5201 is NEVER exposed to public WAN
  exec /usr/bin/iperf3 -s -B "$mesh_ip" -p 5201
else
  exec /usr/bin/iperf3 -s -p 5201
fi
RUNNER_IPERF
  chmod 0755 "$IPERF_RUNNER"

  cat > "$IPERF_SERVICE_FILE" <<EOF_IPERF_SVC
[Unit]
Description=XRayMesh iperf3 In-Mesh Speedtest Daemon
Documentation=https://github.com/Erfan-XRay/XRayMesh
PartOf=xraymesh.service
After=network-online.target xraymesh.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${IPERF_RUNNER}
Restart=always
RestartSec=3
TimeoutStopSec=5
KillMode=mixed
SyslogIdentifier=xraymesh-iperf

[Install]
WantedBy=multi-user.target
EOF_IPERF_SVC

  systemctl daemon-reload
}

apply_node_config() {
  require_root
  require_linux

  if [[ ! -f "$CONFIG_FILE" ]]; then
    fail "Configuration file not found: $CONFIG_FILE"
    return 1
  fi

  # 1. Ensure core binary is installed and executable
  if [[ ! -x "${BIN_DIR}/easytier-core" ]]; then
    info "EasyTier core binary not found. Installing..."
    install_core || { fail "Failed to install EasyTier core."; return 1; }
  fi

  # 2. Source configuration to get port and parameters
  local port="11010"
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  port="${PORT:-11010}"

  # 3. Ensure kernel IP forwarding and persistence
  sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
  if [[ ! -f /etc/sysctl.d/99-xraymesh.conf ]]; then
    echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-xraymesh.conf 2>/dev/null || true
  fi

  # 4. Whitelist firewall ports
  if command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true
    iptables -C INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null || true
  fi
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$port"/tcp >/dev/null 2>&1 || true
    ufw allow "$port"/udp >/dev/null 2>&1 || true
  fi

  # 5. Write service file, runner, iperf service, and reload systemd
  write_service

  # 6. Enable systemd units on boot
  systemctl enable xraymesh.service >/dev/null 2>&1 || true
  systemctl enable xraymesh-iperf.service >/dev/null 2>&1 || true

  # 7. Start or restart xraymesh.service
  if systemctl is-active --quiet xraymesh.service; then
    systemctl restart xraymesh.service
  else
    systemctl start xraymesh.service
  fi

  # 8. Start or restart xraymesh-iperf.service (isolated so it never blocks mesh)
  if systemctl is-active --quiet xraymesh-iperf.service; then
    systemctl restart xraymesh-iperf.service >/dev/null 2>&1 || true
  else
    systemctl start xraymesh-iperf.service >/dev/null 2>&1 || true
  fi

  # 9. Wait and verify service health
  sleep 2
  if systemctl is-active --quiet xraymesh.service; then
    ok "The XRayMesh node is online and active."
    return 0
  else
    fail "The XRayMesh node service failed to start."
    journalctl -u xraymesh.service -n 25 --no-pager 2>/dev/null || true
    return 1
  fi
}

setup_node() {
  require_root
  [[ -x "${BIN_DIR}/easytier-core" ]] || install_core
  header
  say "  Configure Mesh Node" "$BOLD$CYAN"
  printf '\n'

  if [[ ! -f "$CONFIG_FILE" ]]; then
    say "  Choose setup method:" "$BOLD$YELLOW"
    printf '  %b[ 1 ]%b  Join Existing Mesh Network via Invite Code (xrmesh://)\n' "$BOLD$CYAN" "$RESET"
    printf '  %b[ 2 ]%b  Create New Mesh Network Manually\n\n' "$BOLD$GREEN" "$RESET"
    local s_mode="1"
    read -r -p "  Select an option [1-2, default: 1]: " s_mode
    s_mode="${s_mode:-1}"
    if [[ "$s_mode" == "1" ]]; then
      join_mesh_invite
      return $?
    fi
    printf '\n'
  fi

  local name secret hostname ipv4 protocol port peers encryption ipv6 mtu
  local config_backup="" had_config=0 service_was_active=0
  local default_name="xraymesh" default_secret="" default_hostname default_ipv4="10.144.144.1"
  local default_protocol="dual" default_port="11010" default_peers=""
  local default_encryption="yes" default_ipv6="no" default_mtu="1380"
  local default_enable_kcp="no"
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
    default_enable_kcp="${ENABLE_KCP:-$default_enable_kcp}"
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
    say "  ┌── GENERATED NETWORK SECRET ─────────────────────────────────" "$YELLOW"
    printf '  │  %b%s%b\n' "$BOLD$CYAN" "$secret" "$RESET"
    say "  └─────────────────────────────────────────────────────────────" "$YELLOW"
    warn "You must enter this exact secret on every other mesh node."
    read -r -p "  Press Enter after you have saved the secret..." _
  fi
  hostname="$(prompt_default "Node hostname" "$default_hostname")"
  while :; do
    ipv4="$(prompt_default "Virtual IPv4 address" "$default_ipv4")"
    valid_ip "$ipv4" && break
    warn "Enter a valid address from the 10.x.x.x range."
  done
  protocol="$(prompt_default "Preferred protocol (dual/udp/tcp/ws/wss/quic/faketcp)" "$default_protocol")"
  [[ "$protocol" =~ ^(dual|udp|tcp|ws|wss|quic|faketcp)$ ]] || protocol="dual"

  while :; do
    port="$(prompt_default "Mesh port" "$default_port")"
    valid_port "$port" && break
    warn "The port must be between 1 and 65535."
  done
  peers="$(prompt_default "Peer addresses, comma-separated (empty for first node)" "$default_peers")"
  encryption="$(prompt_default "Enable encryption? (yes/no)" "$default_encryption")"
  ipv6="$(prompt_default "Enable IPv6? (yes/no)" "$default_ipv6")"
  mtu="$(prompt_default "MTU" "$default_mtu")"

  enable_kcp="$(prompt_default "Enable KCP loss-resistance proxy? (yes/no)" "$default_enable_kcp")"

  write_config "$name" "$secret" "$hostname" "$ipv4" "$protocol" "$port" "$peers" "$encryption" "$ipv6" "$mtu" "$enable_kcp"

  if apply_node_config; then
    info "Network: $name"
    info "Virtual IP: $ipv4"
    case "$protocol" in
      wss)
        info "Strict listener: wss://0.0.0.0:${port}"
        ;;
      quic)
        info "QUIC listener with TCP fallback: quic://0.0.0.0:${port}"
        ;;
      ws)
        info "WebSocket listener: ws://0.0.0.0:${port}"
        ;;
      faketcp)
        info "FakeTCP listener: faketcp://0.0.0.0:${port}"
        ;;
      tcp)
        info "TCP-only listener: tcp://0.0.0.0:${port}"
        ;;
      udp)
        info "UDP-only listener: udp://0.0.0.0:${port}"
        ;;
      dual|*)
        info "Dual listeners: TCP and UDP on 0.0.0.0:${port}"
        ;;
    esac
    warn "Keep this network secret private: $secret"
  else
    warn "Restoring the previous working node configuration."
    systemctl stop xraymesh.service 2>/dev/null || true
    if (( had_config )) && [[ -f "$config_backup" ]]; then
      cp -p "$config_backup" "$CONFIG_FILE"
      write_service
      if (( service_was_active )); then
        systemctl start xraymesh.service >/dev/null 2>&1 || true
        systemctl start xraymesh-iperf.service >/dev/null 2>&1 || true
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
  if compgen -G "${GOST_TUNNEL_DIR}/*.env" >/dev/null; then
    info "Re-enabling the existing GOST TCP/UDP tunnels."
    apply_gost_config || warn "The mesh is online, but GOST tunnels need attention."
  fi
  if compgen -G "${REALM_TUNNEL_DIR}/*.env" >/dev/null; then
    info "Re-enabling the existing Realm TCP/UDP tunnels."
    apply_realm_config || warn "The mesh is online, but Realm tunnels need attention."
  fi
}

show_mesh_invite() {
  require_root
  require_linux
  if [[ ! -f "$CONFIG_FILE" ]]; then
    fail "Mesh node is not configured yet. Configure the node or join a mesh first."
    pause
    return 1
  fi

  header
  section "MESH INVITE CODE"

  local net secret proto port pub_ip invite_code
  # shellcheck disable=SC1090
  source "$CONFIG_FILE" 2>/dev/null || true
  net="${NETWORK_NAME:-xraymesh}"
  secret="${NETWORK_SECRET:-}"
  proto="${PROTOCOL:-dual}"
  port="${PORT:-11010}"
  pub_ip="$(get_server_ip)"

  if [[ -z "$secret" ]]; then
    fail "Current node has no network secret configured."
    pause
    return 1
  fi

  local endpoint="${pub_ip}:${port}"
  invite_code="$(python3 -c "import sys, json, base64
d = {
    'v': 1,
    'net': sys.argv[1],
    'secret': sys.argv[2],
    'endpoint': sys.argv[3],
    'proto': sys.argv[4]
}
token = base64.b64encode(json.dumps(d).encode('utf-8')).decode('utf-8')
print(f'xrmesh://{token}')
" "$net" "$secret" "$endpoint" "$proto" 2>/dev/null || true)"

  ok "Generated mesh invite code for this server."
  printf '\n'
  say "  ┌── Mesh Invite Code ─────────────────────────────────────────" "$DIM$BLUE"
  printf '  │  %b%s%b\n' "$BOLD$GREEN" "$invite_code" "$RESET"
  say "  ├── Mesh Parameters ──────────────────────────────────────────" "$DIM$BLUE"
  printf '  │  • %-16s : %s\n' "Network Name" "$net"
  printf '  │  • %-16s : %s\n' "Protocol" "$proto"
  printf '  │  • %-16s : %s\n' "Peer Endpoint" "$endpoint"
  say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
  printf '\n'
  info "On another server, run 'xraymesh join' and paste this code to connect instantly."
  pause
}

join_mesh_invite() {
  require_root
  require_linux
  [[ -x "${BIN_DIR}/easytier-core" ]] || install_core

  header
  section "JOIN MESH VIA INVITE CODE"
  info "Paste an invite code (xrmesh://...) from another server to join its mesh overlay."
  printf '\n'

  local raw_invite="${1:-}"
  if [[ -z "$raw_invite" ]]; then
    read -r -p "  Enter Mesh Invite Code (xrmesh://...): " raw_invite
  fi
  raw_invite="${raw_invite#"${raw_invite%%[![:space:]]*}"}"
  raw_invite="${raw_invite%"${raw_invite##*[![:space:]]}"}"

  if [[ -z "$raw_invite" ]]; then
    fail "No invite code provided."
    pause
    return 1
  fi

  # Decode invite token using Python
  local decoded_json
  decoded_json="$(python3 -c '
import sys, base64, json
raw = sys.argv[1].strip().strip("\"\x27")
token = raw.replace("xrmesh://", "").strip()
try:
    data = json.loads(base64.b64decode(token).decode("utf-8"))
    print(json.dumps(data))
except Exception:
    sys.exit(1)
' "$raw_invite" 2>/dev/null || true)"
  if [[ -z "$decoded_json" ]]; then
    fail "Invalid invite code format. Make sure you copied the complete 'xrmesh://...' link."
    pause
    return 1
  fi

  local net secret proto endpoint
  net="$(python3 -c "import sys, json; d=json.loads(sys.argv[1]); print(d.get('net', '').strip())" "$decoded_json")"
  secret="$(python3 -c "import sys, json; d=json.loads(sys.argv[1]); print(d.get('secret', '').strip())" "$decoded_json")"
  proto="$(python3 -c "import sys, json; d=json.loads(sys.argv[1]); print(d.get('proto', 'dual').strip().lower())" "$decoded_json")"
  endpoint="$(python3 -c "import sys, json; d=json.loads(sys.argv[1]); print(d.get('endpoint', '').strip())" "$decoded_json")"

  if [[ -z "$net" || -z "$secret" ]]; then
    fail "The invite code is missing essential network credentials."
    pause
    return 1
  fi

  printf '\n'
  say "  ┌── Decoded Mesh Network Details ─────────────────────────────" "$DIM$BLUE"
  printf '  │  • %-16s : %b%s%b\n' "Network Name" "$BOLD$CYAN" "$net" "$RESET"
  printf '  │  • %-16s : %b%s%b\n' "Protocol" "$BOLD$CYAN" "$proto" "$RESET"
  printf '  │  • %-16s : %b%s%b\n' "Peer Endpoint" "$BOLD$GREEN" "${endpoint:-Relayed Peer}" "$RESET"
  printf '  │  • %-16s : %bVerified (Encrypted)%b\n' "Security" "$GREEN" "$RESET"
  say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
  printf '\n'

  local default_hostname default_ipv4 default_port="11010"
  default_hostname="$(hostname -s 2>/dev/null || echo "node")"

  # Generate suggested random IP in 10.144.144.2 - 254
  local rand_host=$(( (RANDOM % 240) + 10 ))
  default_ipv4="10.144.144.${rand_host}"

  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE" 2>/dev/null || true
    [[ -n "${IPV4:-}" && "$IPV4" != "10.144.144.1" ]] && default_ipv4="$IPV4"
    [[ -n "${HOSTNAME:-}" ]] && default_hostname="$HOSTNAME"
    [[ -n "${PORT:-}" ]] && default_port="$PORT"
  fi

  local hostname ipv4 port
  hostname="$(prompt_default "Server Node Hostname" "$default_hostname")"

  while :; do
    ipv4="$(prompt_default "Virtual IPv4 in Mesh Overlay" "$default_ipv4")"
    valid_ip "$ipv4" && break
    warn "Enter a valid address from the private IP range (e.g. 10.144.144.x)."
  done

  while :; do
    port="$(prompt_default "Mesh Listen Port" "$default_port")"
    valid_port "$port" && break
    warn "The port must be between 1 and 65535."
  done

  local peers_val=""
  if [[ -n "$endpoint" ]]; then
    peers_val="$endpoint"
  fi

  info "Applying configuration and connecting to mesh network '${net}'..."
  write_config "$net" "$secret" "$hostname" "$ipv4" "$proto" "$port" "$peers_val" "yes" "no" "1380" "no"

  if apply_node_config; then
    systemctl restart xraymesh-web.service >/dev/null 2>&1 || true
    ok "Successfully joined mesh '${net}' as ${hostname} (${ipv4})!"
    info "Run 'xraymesh peers' anytime to see connected nodes and live latency."
  else
    fail "Failed to start mesh service. Please check logs: journalctl -u xraymesh.service -n 30"
  fi
  pause
}

delete_mesh_noninteractive() {
  require_root
  systemctl disable --now xraymesh.service 2>/dev/null || true
  systemctl disable --now xraymesh-haproxy.service 2>/dev/null || true
  systemctl disable --now xraymesh-iptables.service 2>/dev/null || true
  systemctl disable --now xraymesh-gost.service 2>/dev/null || true
  systemctl disable --now xraymesh-realm.service 2>/dev/null || true
  if [[ -x "$IPTABLES_APPLY_SCRIPT" ]]; then
    "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
  fi
  rm -f "$SERVICE_FILE" "$CONFIG_FILE" "${INSTALL_DIR}/xraymesh-runner"
  systemctl daemon-reload
  systemctl reset-failed xraymesh.service 2>/dev/null || true
  ok "The mesh node and its configuration have been deleted."
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

  compgen -G "${HAPROXY_TUNNEL_DIR}/*.env" >/dev/null &&
    info "HAProxy tunnels were disabled and preserved for the next mesh configuration."
  compgen -G "${IPTABLES_TUNNEL_DIR}/*.env" >/dev/null &&
    info "iptables tunnels were disabled and preserved for the next mesh configuration."
  compgen -G "${GOST_TUNNEL_DIR}/*.env" >/dev/null &&
    info "GOST tunnels were disabled and preserved for the next mesh configuration."
  compgen -G "${REALM_TUNNEL_DIR}/*.env" >/dev/null &&
    info "Realm tunnels were disabled and preserved for the next mesh configuration."

  delete_mesh_noninteractive
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
    case "${PROTOCOL:-dual}" in
      wss)
        printf '  %-16s %b%s only%b\n' "Transport" "$YELLOW" "WSS" "$RESET"
        ;;
      quic)
        printf '  %-16s %b%s (TCP fallback)%b\n' "Transport" "$PURPLE" "QUIC" "$RESET"
        ;;
      ws)
        printf '  %-16s %b%s%b\n' "Transport" "$CYAN" "WebSocket (ws)" "$RESET"
        ;;
      faketcp)
        printf '  %-16s %b%s%b\n' "Transport" "$RED" "FakeTCP" "$RESET"
        ;;
      tcp)
        printf '  %-16s %b%s only%b\n' "Transport" "$BLUE" "TCP" "$RESET"
        ;;
      udp)
        printf '  %-16s %b%s only%b\n' "Transport" "$GREEN" "UDP" "$RESET"
        ;;
      dual|*)
        printf '  %-16s %bDual (TCP + UDP)%b\n' "Transport" "$GREEN" "$RESET"
        ;;
    esac
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
  case "${PROTOCOL:-dual}" in
    wss)
      printf '  Transport:     WSS only (strict)\n'
      printf '  Listen port:   %s/WSS\n' "$PORT"
      ;;
    quic)
      printf '  Transport:     QUIC (with TCP fallback)\n'
      printf '  Listen port:   %s (QUIC + TCP)\n' "$PORT"
      ;;
    ws)
      printf '  Transport:     WebSocket (ws)\n'
      printf '  Listen port:   %s/WS\n' "$PORT"
      ;;
    faketcp)
      printf '  Transport:     FakeTCP\n'
      printf '  Listen port:   %s/FakeTCP\n' "$PORT"
      ;;
    tcp)
      printf '  Transport:     TCP only\n'
      printf '  Listen port:   %s/TCP\n' "$PORT"
      ;;
    udp)
      printf '  Transport:     UDP only\n'
      printf '  Listen port:   %s/UDP\n' "$PORT"
      ;;
    dual|*)
      printf '  Transport:     Dual (TCP + UDP)\n'
      printf '  Listen port:   %s (TCP + UDP)\n' "$PORT"
      ;;
  esac
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

save_haproxy_tunnel() {
  local name="$1" target="$2" ports="$3" file="${HAPROXY_TUNNEL_DIR}/${1}.env"
  mkdir -p "$HAPROXY_TUNNEL_DIR"
  umask 077
  {
    printf 'TUNNEL_NAME="%s"\n' "$name"
    printf 'TARGET_IP="%s"\n' "$target"
    printf 'PORT_SPEC="%s"\n' "$ports"
  } > "$file"
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

edit_haproxy_tunnel_noninteractive() {
  require_root
  install_haproxy_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ -f "${HAPROXY_TUNNEL_DIR}/${name}.env" ]] || { fail "HAProxy tunnel '${name}' not found."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port list or range."; return 1; }
  validate_haproxy_ports "$name" "$ports" || return 1

  local backup
  backup="$(mktemp)"
  cp "${HAPROXY_TUNNEL_DIR}/${name}.env" "$backup"
  save_haproxy_tunnel "$name" "$target" "$ports"
  if apply_haproxy_config; then
    rm -f "$backup"
    ok "HAProxy tunnel '${name}' updated."
  else
    mv "$backup" "${HAPROXY_TUNNEL_DIR}/${name}.env"
    generate_haproxy_config
    return 1
  fi
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
net.ipv6.conf.all.forwarding=1
EOF_SYSCTL
  chmod 644 "$IPTABLES_SYSCTL_FILE"
  sysctl -p "$IPTABLES_SYSCTL_FILE" >/dev/null 2>&1 || true
  sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
  sysctl -w net.ipv6.conf.all.forwarding=1 >/dev/null 2>&1 || true
}

save_iptables_tunnel() {
  local name="$1" target="$2" ports="$3" protocol="${4:-udp}"
  local in_if="${5:-any}" source_cidr="${6:-0.0.0.0/0}"
  local file="${IPTABLES_TUNNEL_DIR}/${name}.env"
  mkdir -p "$IPTABLES_TUNNEL_DIR"
  umask 077
  {
    printf 'TUNNEL_NAME="%s"\n' "$name"
    printf 'TARGET_IP="%s"\n' "$target"
    printf 'PORT_SPEC="%s"\n' "$ports"
    printf 'FORWARD_PROTOCOL="%s"\n' "$protocol"
    printf 'IN_IF="%s"\n' "$in_if"
    printf 'SOURCE_CIDR="%s"\n' "$source_cidr"
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
  sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
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

edit_iptables_tunnel_noninteractive() {
  require_root
  install_iptables_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}" protocol="${4:-udp}" in_if="${5:-any}" source_cidr="${6:-0.0.0.0/0}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ -f "${IPTABLES_TUNNEL_DIR}/${name}.env" ]] || { fail "iptables tunnel '${name}' not found."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  [[ "$protocol" =~ ^(tcp|udp|both)$ ]] || { fail "Protocol must be tcp, udp, or both."; return 1; }
  validate_iptables_interface "$in_if" || { fail "Interface '${in_if}' does not exist."; return 1; }
  valid_ipv4_cidr "$source_cidr" || { fail "Invalid source IPv4/CIDR '${source_cidr}'."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port specification."; return 1; }
  validate_iptables_ports "$name" "$protocol" "$ports" "$in_if" || return 1

  local backup
  backup="$(mktemp)"
  cp "${IPTABLES_TUNNEL_DIR}/${name}.env" "$backup"
  save_iptables_tunnel "$name" "$target" "$ports" "$protocol" "$in_if" "$source_cidr"
  if apply_iptables_config; then
    rm -f "$backup"
    ok "iptables tunnel '${name}' updated."
  else
    mv "$backup" "${IPTABLES_TUNNEL_DIR}/${name}.env"
    generate_iptables_apply_script
    return 1
  fi
}

gost_arch_asset() {
  case "$(uname -m)" in
    x86_64|amd64) echo "linux_amd64" ;;
    aarch64|arm64) echo "linux_arm64" ;;
    armv7*|armhf) echo "linux_armv7" ;;
    i686|i386) echo "linux_386" ;;
    *) fail "Unsupported architecture for GOST: $(uname -m)"; return 1 ;;
  esac
}

install_gost_runtime() {
  if [[ -x "$GOST_BIN" ]]; then
    return 0
  fi
  require_root
  install_dependencies
  local arch asset_name version url checksums_url tmp release_json expected_digest actual_digest
  arch="$(gost_arch_asset)" || return 1
  tmp="$(mktemp -d)"
  release_json="${tmp}/release.json"

  if ! curl -fsSL --connect-timeout 8 --max-time 20 \
    https://api.github.com/repos/go-gost/gost/releases/latest -o "$release_json"; then
    warn "Latest GOST release lookup failed; checking the fallback release."
    curl -fsSL --connect-timeout 8 --max-time 20 \
      "https://api.github.com/repos/go-gost/gost/releases/tags/${FALLBACK_GOST_VERSION}" \
      -o "$release_json" || { fail "Could not retrieve trusted GOST release metadata."; rm -rf -- "$tmp"; return 1; }
  fi

  version="$(jq -er '.tag_name' "$release_json")" ||
    { fail "GOST release metadata is invalid."; rm -rf -- "$tmp"; return 1; }
  local clean_ver="${version#v}"
  asset_name="gost_${clean_ver}_${arch}.tar.gz"

  url="$(jq -er --arg name "$asset_name" '.assets[] | select(.name == $name) | .browser_download_url' "$release_json")" ||
    { fail "No official GOST asset exists for $(uname -m)."; rm -rf -- "$tmp"; return 1; }
  checksums_url="$(jq -er '.assets[] | select(.name == "checksums.txt") | .browser_download_url' "$release_json")" || true

  info "Downloading GOST ${version} for $(uname -m)..."
  mkdir -p "$BIN_DIR" "$GOST_TUNNEL_DIR" /etc/xraymesh
  local curl_opts=(-fL --retry 3 --connect-timeout 10)
  if [[ -t 1 ]]; then
    curl_opts+=(--progress-bar)
  else
    curl_opts+=(-sS)
  fi
  if ! curl "${curl_opts[@]}" "$url" -o "${tmp}/gost.tar.gz"; then
    fail "Download failed: $url"
    rm -rf -- "$tmp"
    return 1
  fi

  if [[ -n "$checksums_url" ]] && curl -fsSL --connect-timeout 8 --max-time 15 "$checksums_url" -o "${tmp}/checksums.txt" 2>/dev/null; then
    expected_digest="$( (grep -E "[[:space:]]${asset_name}\$" "${tmp}/checksums.txt" 2>/dev/null || true) | awk '{print $1}' )"
    if [[ -n "$expected_digest" ]]; then
      actual_digest="$(sha256sum "${tmp}/gost.tar.gz" | awk '{print $1}')"
      if [[ "${actual_digest,,}" != "${expected_digest,,}" ]]; then
        fail "GOST archive checksum verification failed. Download discarded."
        rm -rf -- "$tmp"
        return 1
      fi
      ok "GOST archive SHA-256 verified."
    fi
  fi

  tar -xzf "${tmp}/gost.tar.gz" -C "$tmp"
  local bin
  bin="$(find "$tmp" -type f -name gost | head -n1)"
  if [[ -z "$bin" ]]; then
    fail "GOST binary not found in archive."
    rm -rf -- "$tmp"
    return 1
  fi
  install -m 0755 "$bin" "$GOST_BIN"
  printf '%s\n' "$version" > "${INSTALL_DIR}/gost.version"
  write_gost_service
  rm -rf -- "$tmp"
  ok "GOST ${version} installed successfully."
}

write_gost_service() {
  cat > "$GOST_SERVICE_FILE" <<EOF_GOST_SVC
[Unit]
Description=XRayMesh GOST Tunnel Daemon
Documentation=https://gost.run/
Wants=network-online.target xraymesh.service
After=network-online.target xraymesh.service

[Service]
Type=simple
ExecStart=${GOST_BIN} -C ${GOST_CONFIG_FILE}
Restart=always
RestartSec=3
TimeoutStopSec=5
KillMode=mixed
SyslogIdentifier=xraymesh-gost

[Install]
WantedBy=multi-user.target
EOF_GOST_SVC
  systemctl daemon-reload
}

validate_gost_ports() {
  local tunnel_name="$1" port_spec="$2" protocol="${3:-both}"
  local definition port other_port
  local -A requested=()
  while IFS= read -r port; do requested["$port"]=1; done < <(expand_port_spec "$port_spec")

  for definition in "$GOST_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    unset TUNNEL_NAME TARGET_IP PORT_SPEC PROTOCOL
    # shellcheck disable=SC1090
    source "$definition"
    [[ "$TUNNEL_NAME" == "$tunnel_name" ]] && continue
    local other_proto="${PROTOCOL:-both}"
    if [[ "$protocol" == "both" || "$other_proto" == "both" || "$protocol" == "$other_proto" ]]; then
      while IFS= read -r other_port; do
        if [[ -n "${requested[$other_port]:-}" ]]; then
          fail "Port ${other_port} (${protocol^^}) is already assigned to GOST tunnel '${TUNNEL_NAME}' (${other_proto^^})."
          return 1
        fi
      done < <(expand_port_spec "$PORT_SPEC")
    fi
  done

  if [[ "$protocol" == "tcp" || "$protocol" == "both" ]]; then
    for definition in "$HAPROXY_TUNNEL_DIR"/*.env; do
      [[ -f "$definition" ]] || continue
      unset TUNNEL_NAME TARGET_IP PORT_SPEC
      # shellcheck disable=SC1090
      source "$definition"
      while IFS= read -r other_port; do
        if [[ -n "${requested[$other_port]:-}" ]]; then
          fail "TCP port ${other_port} conflicts with HAProxy tunnel '${TUNNEL_NAME}'."
          return 1
        fi
      done < <(expand_port_spec "$PORT_SPEC")
    done
  fi

  return 0
}

save_gost_tunnel() {
  local name="$1" target="$2" ports="$3" protocol="${4:-both}"
  local file="${GOST_TUNNEL_DIR}/${name}.env"
  mkdir -p "$GOST_TUNNEL_DIR"
  umask 077
  {
    printf 'TUNNEL_NAME="%s"\n' "$name"
    printf 'TARGET_IP="%s"\n' "$target"
    printf 'PORT_SPEC="%s"\n' "$ports"
    printf 'PROTOCOL="%s"\n' "$protocol"
  } > "$file"
}

generate_gost_config() {
  if ! compgen -G "${GOST_TUNNEL_DIR}/*.env" >/dev/null; then
    systemctl disable --now xraymesh-gost.service 2>/dev/null || true
    rm -f "$GOST_CONFIG_FILE"
    return 0
  fi

  mkdir -p "$(dirname "$GOST_CONFIG_FILE")"
  local tmp first_service=1 definition port
  tmp="$(mktemp)"

  {
    printf '{\n  "services": [\n'
    for definition in "${GOST_TUNNEL_DIR}"/*.env; do
      [[ -f "$definition" ]] || continue
      unset TUNNEL_NAME TARGET_IP PORT_SPEC PROTOCOL
      # shellcheck disable=SC1090
      source "$definition"
      local name="${TUNNEL_NAME:-$(basename "$definition" .env)}"
      local target="${TARGET_IP:-}"
      local port_spec="${PORT_SPEC:-}"
      local protocol="${PROTOCOL:-both}"
      protocol="${protocol,,}"

      [[ -n "$target" && -n "$port_spec" ]] || continue

      while IFS= read -r port; do
        [[ -n "$port" ]] || continue

        if [[ "$protocol" == "tcp" || "$protocol" == "both" ]]; then
          if (( first_service )); then
            first_service=0
          else
            printf ',\n'
          fi
          cat <<EOF_JSON_TCP
    {
      "name": "${name}-tcp-${port}",
      "addr": ":${port}",
      "handler": {
        "type": "tcp"
      },
      "listener": {
        "type": "tcp"
      },
      "forwarder": {
        "nodes": [
          {
            "name": "target-tcp-${port}",
            "addr": "${target}:${port}"
          }
        ]
      }
    }
EOF_JSON_TCP
        fi

        if [[ "$protocol" == "udp" || "$protocol" == "both" ]]; then
          if (( first_service )); then
            first_service=0
          else
            printf ',\n'
          fi
          cat <<EOF_JSON_UDP
    {
      "name": "${name}-udp-${port}",
      "addr": ":${port}",
      "handler": {
        "type": "udp"
      },
      "listener": {
        "type": "udp"
      },
      "forwarder": {
        "nodes": [
          {
            "name": "target-udp-${port}",
            "addr": "${target}:${port}"
          }
        ]
      }
    }
EOF_JSON_UDP
        fi
      done < <(expand_port_spec "$port_spec")
    done
    printf '\n  ]\n}\n'
  } > "$tmp"

  if [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    fail "Failed to generate GOST configuration."
    return 1
  fi

  mv -f "$tmp" "$GOST_CONFIG_FILE"
  chmod 0600 "$GOST_CONFIG_FILE"
}

apply_gost_config() {
  generate_gost_config || return 1
  if compgen -G "${GOST_TUNNEL_DIR}/*.env" >/dev/null; then
    [[ -f "$GOST_SERVICE_FILE" ]] || write_gost_service
    systemctl enable --now xraymesh-gost.service 2>/dev/null || true
    systemctl restart xraymesh-gost.service 2>/dev/null || (systemctl kill -s SIGKILL xraymesh-gost.service 2>/dev/null && systemctl start xraymesh-gost.service 2>/dev/null) || true
    ok "GOST tunnel configuration applied."
  fi
}

create_gost_tunnel_noninteractive() {
  require_root
  install_gost_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}" protocol="${4:-both}"
  protocol="${protocol,,}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ ! -f "${GOST_TUNNEL_DIR}/${name}.env" ]] || { fail "A tunnel with this name already exists."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port list or range."; return 1; }
  validate_gost_ports "$name" "$ports" "$protocol" || return 1

  save_gost_tunnel "$name" "$target" "$ports" "$protocol"
  if apply_gost_config; then
    ok "GOST tunnel '${name}' forwards ${protocol^^} ports ${ports} to ${target}."
  else
    rm -f "${GOST_TUNNEL_DIR}/${name}.env"
    generate_gost_config
    return 1
  fi
}

delete_gost_tunnel_noninteractive() {
  require_root
  local name="${1:-}" file="${GOST_TUNNEL_DIR}/${1}.env"
  [[ -f "$file" ]] || { fail "GOST tunnel '${name}' not found."; return 1; }
  rm -f "$file"
  apply_gost_config
  ok "GOST tunnel '${name}' deleted."
}

edit_gost_tunnel_noninteractive() {
  require_root
  install_gost_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}" protocol="${4:-both}"
  protocol="${protocol,,}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ -f "${GOST_TUNNEL_DIR}/${name}.env" ]] || { fail "GOST tunnel '${name}' not found."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port list or range."; return 1; }
  validate_gost_ports "$name" "$ports" "$protocol" || return 1

  local backup
  backup="$(mktemp)"
  cp "${GOST_TUNNEL_DIR}/${name}.env" "$backup"
  save_gost_tunnel "$name" "$target" "$ports" "$protocol"
  if apply_gost_config; then
    rm -f "$backup"
    ok "GOST tunnel '${name}' updated."
  else
    mv "$backup" "${GOST_TUNNEL_DIR}/${name}.env"
    generate_gost_config
    return 1
  fi
}

# ==============================================================================
# REALM RELAY TUNNELS (RUST)
# ==============================================================================

install_realm_runtime() {
  [[ -x "$REALM_BIN" ]] && return 0

  header
  info "Installing Realm high-performance relay runtime..."
  mkdir -p "$BIN_DIR" "$REALM_TUNNEL_DIR"
  local arch target_arch version="$FALLBACK_REALM_VERSION"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) target_arch="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) target_arch="aarch64-unknown-linux-gnu" ;;
    armv7*|armv8l|armhf) target_arch="armv7-unknown-linux-musleabihf" ;;
    arm*) target_arch="arm-unknown-linux-musleabi" ;;
    i386|i686) target_arch="i686-unknown-linux-musl" ;;
    *)
      fail "Unsupported CPU architecture for Realm: $arch"
      return 1
      ;;
  esac

  local tmp download_url
  tmp="$(mktemp -d)"
  download_url="https://github.com/zhboner/realm/releases/download/${version}/realm-${target_arch}.tar.gz"

  info "Downloading Realm ${version} (${target_arch})..."
  if ! curl -fsSL --connect-timeout 10 --max-time 60 "$download_url" -o "${tmp}/realm.tar.gz"; then
    fail "Failed to download Realm from ${download_url}."
    rm -rf -- "$tmp"
    return 1
  fi

  tar -xzf "${tmp}/realm.tar.gz" -C "$tmp"
  local bin
  bin="$(find "$tmp" -type f -name realm | head -n1)"
  if [[ -z "$bin" ]]; then
    fail "Realm binary not found in archive."
    rm -rf -- "$tmp"
    return 1
  fi

  install -m 0755 "$bin" "$REALM_BIN"
  printf '%s\n' "$version" > "${INSTALL_DIR}/realm.version"
  write_realm_service
  rm -rf -- "$tmp"
  ok "Realm ${version} installed successfully."
}

write_realm_service() {
  cat > "$REALM_SERVICE_FILE" <<EOF_REALM_SVC
[Unit]
Description=XRayMesh Realm Tunnel Daemon (Rust)
Documentation=https://github.com/zhboner/realm
Wants=network-online.target xraymesh.service
After=network-online.target xraymesh.service

[Service]
Type=simple
ExecStart=${REALM_BIN} -c ${REALM_CONFIG_FILE}
Restart=always
RestartSec=3
TimeoutStopSec=5
KillMode=mixed
LimitNOFILE=1048576
SyslogIdentifier=xraymesh-realm

[Install]
WantedBy=multi-user.target
EOF_REALM_SVC
  systemctl daemon-reload
}

generate_realm_config() {
  if ! compgen -G "${REALM_TUNNEL_DIR}/*.env" >/dev/null; then
    systemctl disable --now xraymesh-realm.service 2>/dev/null || true
    rm -f "$REALM_CONFIG_FILE"
    return 0
  fi

  mkdir -p "$(dirname "$REALM_CONFIG_FILE")"
  local tmp first_ep=1 definition port
  tmp="$(mktemp)"

  {
    printf '{\n'
    printf '  "log": {\n    "level": "warn",\n    "output": "stdout"\n  },\n'
    printf '  "network": {\n    "no_tcp": false,\n    "use_udp": true\n  },\n'
    printf '  "endpoints": [\n'
    for definition in "${REALM_TUNNEL_DIR}"/*.env; do
      [[ -f "$definition" ]] || continue
      unset TUNNEL_NAME TARGET_IP PORT_SPEC PROTOCOL
      # shellcheck disable=SC1090
      source "$definition"
      local target="${TARGET_IP:-}"
      local port_spec="${PORT_SPEC:-}"
      local protocol="${PROTOCOL:-both}"
      protocol="${protocol,,}"
      local no_tcp="false" use_udp="true"
      if [[ "$protocol" == "tcp" ]]; then
        no_tcp="false"
        use_udp="false"
      elif [[ "$protocol" == "udp" ]]; then
        no_tcp="true"
        use_udp="true"
      else
        no_tcp="false"
        use_udp="true"
      fi

      [[ -n "$target" && -n "$port_spec" ]] || continue

      while IFS= read -r port; do
        [[ -n "$port" ]] || continue
        if (( first_ep )); then
          first_ep=0
        else
          printf ',\n'
        fi
        cat <<EOF_EP
    {
      "listen": "0.0.0.0:${port}",
      "remote": "${target}:${port}",
      "network": {
        "no_tcp": ${no_tcp},
        "use_udp": ${use_udp}
      }
    }
EOF_EP
      done < <(expand_port_spec "$port_spec")
    done
    printf '\n  ]\n}\n'
  } > "$tmp"

  if [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    fail "Failed to generate Realm configuration."
    return 1
  fi

  install -m 0600 "$tmp" "$REALM_CONFIG_FILE"
  rm -f "$tmp"
  return 0
}

apply_realm_config() {
  if ! compgen -G "${REALM_TUNNEL_DIR}/*.env" >/dev/null; then
    systemctl disable --now xraymesh-realm.service 2>/dev/null || true
    rm -f "$REALM_CONFIG_FILE"
    return 0
  fi

  generate_realm_config || return 1
  write_realm_service
  systemctl enable --now xraymesh-realm.service >/dev/null 2>&1 || true
  systemctl restart xraymesh-realm.service
  if systemctl is-active --quiet xraymesh-realm.service; then
    return 0
  else
    fail "Realm service failed to start. Showing recent logs:"
    journalctl -u xraymesh-realm.service -n 20 --no-pager
    return 1
  fi
}

validate_realm_ports() {
  local tunnel_name="$1" port_spec="$2" protocol="${3:-both}"
  local definition port other_port
  local -A requested=()
  while IFS= read -r port; do requested["$port"]=1; done < <(expand_port_spec "$port_spec")

  for definition in "$REALM_TUNNEL_DIR"/*.env; do
    [[ -f "$definition" ]] || continue
    unset TUNNEL_NAME TARGET_IP PORT_SPEC PROTOCOL
    # shellcheck disable=SC1090
    source "$definition"
    [[ "$TUNNEL_NAME" == "$tunnel_name" ]] && continue
    local other_proto="${PROTOCOL:-both}"
    if [[ "$protocol" == "both" || "$other_proto" == "both" || "$protocol" == "$other_proto" ]]; then
      while IFS= read -r other_port; do
        if [[ -n "${requested[$other_port]:-}" ]]; then
          fail "Port ${other_port} (${protocol^^}) is already assigned to Realm tunnel '${TUNNEL_NAME}' (${other_proto^^})."
          return 1
        fi
      done < <(expand_port_spec "$PORT_SPEC")
    fi
  done

  if [[ "$protocol" == "tcp" || "$protocol" == "both" ]]; then
    for definition in "$HAPROXY_TUNNEL_DIR"/*.env; do
      [[ -f "$definition" ]] || continue
      unset TUNNEL_NAME TARGET_IP PORT_SPEC
      # shellcheck disable=SC1090
      source "$definition"
      while IFS= read -r other_port; do
        if [[ -n "${requested[$other_port]:-}" ]]; then
          fail "TCP port ${other_port} conflicts with HAProxy tunnel '${TUNNEL_NAME}'."
          return 1
        fi
      done < <(expand_port_spec "$PORT_SPEC")
    done
  fi

  return 0
}

save_realm_tunnel() {
  local name="$1" target="$2" ports="$3" protocol="${4:-both}"
  local file="${REALM_TUNNEL_DIR}/${name}.env"
  mkdir -p "$REALM_TUNNEL_DIR"
  umask 077
  {
    printf 'TUNNEL_NAME="%s"\n' "$name"
    printf 'TARGET_IP="%s"\n' "$target"
    printf 'PORT_SPEC="%s"\n' "$ports"
    printf 'PROTOCOL="%s"\n' "$protocol"
  } > "$file"
}

create_realm_tunnel_noninteractive() {
  require_root
  install_realm_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}" protocol="${4:-both}"
  protocol="${protocol,,}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ ! -f "${REALM_TUNNEL_DIR}/${name}.env" ]] || { fail "A tunnel with this name already exists."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port list or range."; return 1; }
  validate_realm_ports "$name" "$ports" "$protocol" || return 1

  save_realm_tunnel "$name" "$target" "$ports" "$protocol"
  if apply_realm_config; then
    ok "Realm tunnel '${name}' forwards ${protocol^^} ports ${ports} to ${target}."
  else
    rm -f "${REALM_TUNNEL_DIR}/${name}.env"
    generate_realm_config
    return 1
  fi
}

delete_realm_tunnel_noninteractive() {
  require_root
  local name="${1:-}" file="${REALM_TUNNEL_DIR}/${1}.env"
  [[ -f "$file" ]] || { fail "Realm tunnel '${name}' not found."; return 1; }
  rm -f "$file"
  apply_realm_config
  ok "Realm tunnel '${name}' deleted."
}

edit_realm_tunnel_noninteractive() {
  require_root
  install_realm_runtime
  local name="${1:-}" target="${2:-}" ports="${3:-}" protocol="${4:-both}"
  protocol="${protocol,,}"
  validate_tunnel_name "$name" || { fail "Enter a valid tunnel name with up to 32 characters."; return 1; }
  [[ -f "${REALM_TUNNEL_DIR}/${name}.env" ]] || { fail "Realm tunnel '${name}' not found."; return 1; }
  valid_ip "$target" || { fail "Target must be a valid 10.x.x.x mesh IP."; return 1; }
  expand_port_spec "$ports" >/dev/null || { fail "Invalid port list or range."; return 1; }
  validate_realm_ports "$name" "$ports" "$protocol" || return 1

  local backup
  backup="$(mktemp)"
  cp "${REALM_TUNNEL_DIR}/${name}.env" "$backup"
  save_realm_tunnel "$name" "$target" "$ports" "$protocol"
  if apply_realm_config; then
    rm -f "$backup"
    ok "Realm tunnel '${name}' updated."
  else
    mv "$backup" "${REALM_TUNNEL_DIR}/${name}.env"
    generate_realm_config
    return 1
  fi
}

ensure_xraymesh_cli() {
  local target="${INSTALL_DIR}/xraymesh.sh"
  mkdir -p "$INSTALL_DIR"
  local current_source="${BASH_SOURCE[0]:-}"

  if [[ -n "$current_source" && -f "$current_source" && "$current_source" != /dev/fd/* && "$current_source" != /proc/* ]]; then
    if [[ "$current_source" != "$target" ]]; then
      install -m 0755 "$current_source" "$target" 2>/dev/null || cp -f "$current_source" "$target" 2>/dev/null || true
    fi
  else
    local branch="${XRAYMESH_BRANCH:-main}" ts
    ts="$(date +%s)"
    local tmp_sh
    tmp_sh="$(mktemp)"
    if curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' --connect-timeout 5 --max-time 15 \
      "https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/${branch}/xraymesh.sh?t=${ts}" \
      -o "$tmp_sh" 2>/dev/null && [[ -s "$tmp_sh" ]]; then
      install -m 0755 "$tmp_sh" "$target" 2>/dev/null || cp -f "$tmp_sh" "$target" 2>/dev/null || true
      chmod 0755 "$target" 2>/dev/null || true
    fi
    rm -f "$tmp_sh"
  fi

  if [[ -f "$target" ]]; then
    chmod 0755 "$target" 2>/dev/null || true
    ln -sf "$target" /usr/local/bin/xraymesh 2>/dev/null || true
  fi
}

download_file_with_mirrors() {
  local target_path="$1"
  local rel_path="$2"
  local mode="${3:-0644}"
  local branch="${XRAYMESH_BRANCH:-main}"
  local ts
  ts="$(date +%s)"

  local urls=(
    "https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/${branch}/${rel_path}?t=${ts}"
    "https://cdn.jsdelivr.net/gh/Erfan-XRay/XRayMesh@${branch}/${rel_path}"
    "https://fastly.jsdelivr.net/gh/Erfan-XRay/XRayMesh@${branch}/${rel_path}"
    "https://raw.gitmirror.com/Erfan-XRay/XRayMesh/${branch}/${rel_path}"
  )

  local tmp
  tmp="$(mktemp)"
  local success=0

  for url in "${urls[@]}"; do
    if curl -fsSL -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
      --connect-timeout 6 --max-time 35 --retry 1 \
      "$url" -o "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
      # Sanity check: Ensure we didn't download an HTML error page when expecting python/bash/script
      if grep -qi "<html" "$tmp" 2>/dev/null && [[ "$rel_path" != *"index.html"* ]]; then
        continue
      fi
      install -m "$mode" "$tmp" "$target_path" 2>/dev/null || cp -f "$tmp" "$target_path" 2>/dev/null || true
      chmod "$mode" "$target_path" 2>/dev/null || true
      success=1
      break
    fi
  done
  rm -f "$tmp"
  return $(( 1 - success ))
}

update_web_assets() {
  mkdir -p "${WEB_DIR}/static" "${INSTALL_DIR}" /etc/xraymesh
  local branch="${XRAYMESH_BRANCH:-main}" updated=0
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # 1. Ensure core CLI script is updated to latest version
  local target_sh="${INSTALL_DIR}/xraymesh.sh"
  if [[ -f "${script_dir}/xraymesh.sh" && "${script_dir}/xraymesh.sh" != "$target_sh" ]]; then
    install -m 0755 "${script_dir}/xraymesh.sh" "$target_sh" 2>/dev/null || cp -f "${script_dir}/xraymesh.sh" "$target_sh" 2>/dev/null || true
    ln -sf "$target_sh" /usr/local/bin/xraymesh 2>/dev/null || true
    updated=1
  else
    if download_file_with_mirrors "$target_sh" "xraymesh.sh" 0755; then
      ln -sf "$target_sh" /usr/local/bin/xraymesh 2>/dev/null || true
      updated=1
    fi
  fi

  # 2. Update web server and static assets
  # NOTE: Always prefer fresh download from mirrors. Local copy from script_dir
  # is only a fallback (and only when source != target, otherwise install
  # fails with "same file" and the update becomes a fake success).
  local _dl_ok=0
  if download_file_with_mirrors "${WEB_DIR}/server.py" "web/server.py" 0755; then
    _dl_ok=1
    updated=1
  fi
  if download_file_with_mirrors "${WEB_DIR}/static/index.html" "web/static/index.html" 0644; then
    _dl_ok=1
    updated=1
  fi
  if (( !_dl_ok )); then
    local _src_py="${script_dir}/web/server.py" _src_html="${script_dir}/web/static/index.html"
    if [[ -f "$_src_py" && -f "$_src_html" && "$_src_py" != "${WEB_DIR}/server.py" ]]; then
      install -m 0755 "$_src_py" "${WEB_DIR}/server.py" 2>/dev/null || cp -f "$_src_py" "${WEB_DIR}/server.py" 2>/dev/null || true
      install -m 0644 "$_src_html" "${WEB_DIR}/static/index.html" 2>/dev/null || cp -f "$_src_html" "${WEB_DIR}/static/index.html" 2>/dev/null || true
      updated=1
    elif (( !updated )); then
      warn "Web asset download failed and no usable local fallback found."
    fi
  fi

  # 3. Always regenerate runner and services
  write_runner
  write_iperf_service
  systemctl daemon-reload 2>/dev/null || true

  if [[ -f "$WEB_SERVICE_FILE" ]]; then
    write_web_services
  fi

  if (( updated )); then
    ok "Core CLI, runner, and Web UI assets updated successfully."
  fi

  # 4. Restart mesh service asynchronously if active to execute updated runner
  if systemctl is-active --quiet xraymesh.service 2>/dev/null; then
    ( sleep 1 && systemctl restart xraymesh.service ) >/dev/null 2>&1 &
  fi

  # 5. Restart web service asynchronously to avoid killing the updater process mid-execution (prevents deadlock)
  if (( updated )) && systemctl is-active --quiet xraymesh-web.service 2>/dev/null; then
    ( sleep 2 && systemctl restart xraymesh-web.service ) >/dev/null 2>&1 &
  fi
}

update_node_full() {
  require_root
  require_linux
  local branch="${XRAYMESH_BRANCH:-main}"
  info "Starting node update (branch: ${branch})..."

  # 1. Update CLI, Web Server, frontend assets, runner and services
  update_web_assets

  # 2. Check and update EasyTier binary if a new release is available
  local current_et=""
  current_et="$(cat "${INSTALL_DIR}/easytier.version" 2>/dev/null || echo "0.0.0")"
  # Normalize leading 'v' (install_core stores tag_name like v2.6.4,
  # while latest lookup strips it) so equal versions don't trigger re-download.
  current_et="${current_et#v}"
  current_et="${current_et#V}"
  local latest_et_json
  latest_et_json="$(curl -fsSL --connect-timeout 5 --max-time 12 https://api.github.com/repos/EasyTier/EasyTier/releases/latest 2>/dev/null || true)"
  local latest_et=""
  if [[ -n "$latest_et_json" ]]; then
    latest_et="$(printf '%s' "$latest_et_json" | grep -Po '"tag_name":\s*"v?\K[0-9.]+' | head -n1 || true)"
  fi
  latest_et="${latest_et#v}"
  latest_et="${latest_et#V}"
  if [[ -n "$latest_et" && "$latest_et" != "$current_et" ]]; then
    info "Updating EasyTier core (${current_et} → ${latest_et})..."
    install_core || true
    if systemctl is-active --quiet xraymesh.service 2>/dev/null; then
      ( sleep 1 && systemctl restart xraymesh.service ) >/dev/null 2>&1 &
    fi
  fi

  ok "Node update completed successfully."
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
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
EnvironmentFile=-${WEB_CONFIG_FILE}
ExecStart=/usr/bin/python3 ${WEB_DIR}/server.py
Restart=always
RestartSec=3
TimeoutStopSec=5
KillMode=mixed
ProtectHome=read-only
SyslogIdentifier=xraymesh-web

[Install]
WantedBy=multi-user.target
EOF_WEB_SVC

  write_iperf_service
  systemctl daemon-reload
}

get_web_port() {
  local port=""
  if [[ -f "$WEB_CONFIG_FILE" ]]; then
    port="$(awk -F= '/^WEB_PORT=/ {gsub(/[" '\''\r\n]/, "", $2); print $2}' "$WEB_CONFIG_FILE" 2>/dev/null || true)"
  fi
  echo "${port:-$DEFAULT_WEB_PORT}"
  return 0
}

get_web_domain() {
  local domain=""
  if [[ -f "$WEB_CONFIG_FILE" ]]; then
    domain="$(awk -F= '/^WEB_DOMAIN=/ {gsub(/[" '\''\r\n]/, "", $2); print $2}' "$WEB_CONFIG_FILE" 2>/dev/null || true)"
  fi
  echo "${domain:-}"
  return 0
}

get_web_proto() {
  if [[ -f "$WEB_CONFIG_FILE" ]]; then
    if grep -q '^WEB_SSL_CERT=' "$WEB_CONFIG_FILE" 2>/dev/null; then
      echo "https"
      return 0
    fi
  fi
  echo "http"
  return 0
}

is_public_ipv4() {
  local ip="$1" a b c d
  valid_ipv4_address "$ip" || return 1
  IFS='.' read -r a b c d <<< "$ip"
  a=$((10#$a))
  b=$((10#$b))
  if (( a == 0 || a == 10 || a == 127 )); then return 1; fi
  if (( a == 172 && b >= 16 && b <= 31 )); then return 1; fi
  if (( a == 192 && b == 168 )); then return 1; fi
  if (( a == 169 && b == 254 )); then return 1; fi
  if (( a == 100 && b >= 64 && b <= 127 )); then return 1; fi
  return 0
}

get_server_ip() {
  # 1. Check if explicitly configured in web.env or config.env
  local configured_ip=""
  if [[ -f "$WEB_CONFIG_FILE" ]]; then
    configured_ip="$(awk -F= '/^WEB_PUBLIC_IP=/ {gsub(/[" '\''\r\n]/, "", $2); print $2}' "$WEB_CONFIG_FILE" 2>/dev/null || true)"
  fi
  if [[ -z "$configured_ip" && -f "$CONFIG_FILE" ]]; then
    configured_ip="$(awk -F= '/^PUBLIC_IP=/ {gsub(/[" '\''\r\n]/, "", $2); print $2}' "$CONFIG_FILE" 2>/dev/null || true)"
  fi
  if is_public_ipv4 "$configured_ip"; then
    echo "$configured_ip"
    return 0
  fi

  # 2. Check active SSH session (3rd token is the server IP the user connected to)
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    local ssh_srv_ip
    ssh_srv_ip="$(awk '{print $3}' <<< "$SSH_CONNECTION" 2>/dev/null || true)"
    if is_public_ipv4 "$ssh_srv_ip"; then
      echo "$ssh_srv_ip"
      return 0
    fi
  fi

  # 3. Check physical network interfaces for a directly bound public IPv4 (e.g. eth0, ens3)
  local iface_ip
  while read -r iface_ip; do
    if is_public_ipv4 "$iface_ip"; then
      echo "$iface_ip"
      return 0
    fi
  done < <(ip -o -4 addr show scope global 2>/dev/null | awk '$2 !~ /^(easytier|tun|tap|docker|br-|veth|wg|lo)/ {print $4}' | cut -d/ -f1)

  # 4. Check kernel default route source IP
  local route_ip
  route_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p' | awk '{print $1; exit}')"
  if is_public_ipv4 "$route_ip"; then
    echo "$route_ip"
    return 0
  fi

  # 5. Multi-provider public IP query (for cloud servers behind 1:1 NAT like AWS/GCP)
  local providers=(
    "https://api.ipify.org"
    "https://icanhazip.com"
    "https://ifconfig.me/ip"
    "https://checkip.amazonaws.com"
    "https://ipinfo.io/ip"
  )
  local candidate=""
  for url in "${providers[@]}"; do
    candidate="$(curl -fsS4 --connect-timeout 2 --max-time 3 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
    if is_public_ipv4 "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done

  # 6. Fallback if behind private NAT and curl failed
  if valid_ipv4_address "$route_ip"; then
    echo "$route_ip"
    return 0
  fi

  echo "127.0.0.1"
  return 0
}

is_port_80_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -tlpn 'sport = :80' 2>/dev/null | grep -q ':80 '
  elif command -v lsof >/dev/null 2>&1; then
    lsof -i :80 >/dev/null 2>&1
  else
    fuser 80/tcp >/dev/null 2>&1
  fi
}

get_port_80_service() {
  local svc=""
  if command -v ss >/dev/null 2>&1; then
    svc="$(ss -tlpn 'sport = :80' 2>/dev/null | grep -oP 'users:\(\("\K[^"]+' | head -n1 || true)"
  fi
  if [[ -z "$svc" ]] && command -v fuser >/dev/null 2>&1; then
    local pid
    pid="$(fuser 80/tcp 2>/dev/null | awk '{print $1}' || true)"
    if [[ -n "$pid" ]]; then
      svc="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
    fi
  fi
  echo "${svc:-webserver}"
}

ensure_certbot() {
  if ! command -v certbot >/dev/null 2>&1; then
    info "Installing Certbot for free Let's Encrypt SSL certificate generation..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq certbot >/dev/null 2>&1 || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y -q certbot >/dev/null 2>&1 || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y -q certbot >/dev/null 2>&1 || true
    fi
  fi
  command -v certbot >/dev/null 2>&1
}

configure_web_ssl() {
  install_web_runtime
  header
  section "CONFIGURE DOMAIN & FREE SSL (HTTPS)"
  info "This will obtain a Let's Encrypt SSL certificate with automatic background renewal."
  printf '\n'

  local domain pub_ip
  pub_ip="$(get_server_ip)"
  read -r -p "  Enter your domain name pointed to this server (e.g. panel.example.com): " domain
  domain="${domain//[[:space:]]/}"
  if [[ -z "$domain" ]]; then
    fail "Domain cannot be empty."
    return 1
  fi

  info "Verifying DNS records for ${domain}..."
  local resolved_ip=""
  if command -v getent >/dev/null 2>&1; then
    resolved_ip="$(getent ahosts "$domain" 2>/dev/null | awk '{print $1; exit}' || true)"
  elif command -v dig >/dev/null 2>&1; then
    resolved_ip="$(dig +short "$domain" 2>/dev/null | tail -n1 || true)"
  fi

  if [[ -n "$resolved_ip" && "$resolved_ip" != "$pub_ip" ]]; then
    warn "Domain resolves to ${resolved_ip}, but server public IP is ${pub_ip}."
    local cont="n"
    read -r -p "  Proceed anyway? [y/N]: " cont
    [[ "$cont" =~ ^[Yy]$ ]] || return 1
  fi

  ensure_certbot || {
    fail "Could not install certbot. Please install certbot manually."
    return 1
  }

  local paused_service=""
  if is_port_80_busy; then
    paused_service="$(get_port_80_service)"
    warn "Port 80 is currently occupied by: ${paused_service}"
    local stop_perm="y"
    read -r -p "  Temporarily pause ${paused_service} for 10s to issue SSL and restart it immediately after? [Y/n]: " stop_perm
    if [[ "$stop_perm" =~ ^[Nn]$ ]]; then
      fail "Port 80 is required for Let's Encrypt verification. Aborting SSL setup."
      return 1
    fi
    info "Temporarily pausing ${paused_service}..."
    systemctl stop "$paused_service" 2>/dev/null || true
  fi

  # Guaranteed trap to restart paused service regardless of outcome
  trap '[[ -n "$paused_service" ]] && systemctl start "$paused_service" 2>/dev/null || true' RETURN

  info "Requesting SSL certificate from Let's Encrypt for ${domain}..."
  if certbot certonly --standalone -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email; then
    ok "SSL certificate obtained successfully!"
    local cert_file="/etc/letsencrypt/live/${domain}/fullchain.pem"
    local key_file="/etc/letsencrypt/live/${domain}/privkey.pem"

    if [[ -f "$cert_file" && -f "$key_file" ]]; then
      # Setup automatic renewal hook
      mkdir -p /etc/letsencrypt/renewal-hooks/deploy
      cat > /etc/letsencrypt/renewal-hooks/deploy/xraymesh-web.sh <<'EOF_RENEW'
#!/usr/bin/env bash
systemctl restart xraymesh-web.service >/dev/null 2>&1 || true
EOF_RENEW
      chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/xraymesh-web.sh

      # Update web.env
      sed -i '/^WEB_DOMAIN=/d' "$WEB_CONFIG_FILE"
      sed -i '/^WEB_SSL_CERT=/d' "$WEB_CONFIG_FILE"
      sed -i '/^WEB_SSL_KEY=/d' "$WEB_CONFIG_FILE"
      printf 'WEB_DOMAIN=%q\n' "$domain" >> "$WEB_CONFIG_FILE"
      printf 'WEB_SSL_CERT=%q\n' "$cert_file" >> "$WEB_CONFIG_FILE"
      printf 'WEB_SSL_KEY=%q\n' "$key_file" >> "$WEB_CONFIG_FILE"

      systemctl restart xraymesh-web.service 2>/dev/null || true
      ok "Web Dashboard SSL active: https://${domain}:$(get_web_port)"
      return 0
    fi
  else
    fail "Failed to obtain SSL certificate from Let's Encrypt."
    return 1
  fi
}

remove_web_ssl() {
  install_web_runtime
  header
  section "REMOVE WEB SSL (REVERT TO HTTP)"
  if [[ -f "$WEB_CONFIG_FILE" ]]; then
    sed -i '/^WEB_DOMAIN=/d' "$WEB_CONFIG_FILE"
    sed -i '/^WEB_SSL_CERT=/d' "$WEB_CONFIG_FILE"
    sed -i '/^WEB_SSL_KEY=/d' "$WEB_CONFIG_FILE"
  fi
  systemctl restart xraymesh-web.service 2>/dev/null || true
  ok "Web SSL removed. Dashboard reverted to HTTP."
  pause
}

configure_web_ui_interactive() {
  install_web_runtime
  header
  say "  ┌── Web Dashboard & Remote Setup (v${VERSION}) ────────────────" "$DIM$BLUE"
  printf '  │  All tunnels, routing & cluster sync are managed here.\n'
  say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
  printf '\n'

  local current_port
  current_port="$(get_web_port)"
  local custom_port
  read -r -p "  Web Dashboard port [default: ${current_port}]: " custom_port
  if [[ -n "$custom_port" ]]; then
    if valid_port "$custom_port"; then
      if grep -q '^WEB_PORT=' "$WEB_CONFIG_FILE" 2>/dev/null; then
        sed -i "s|^WEB_PORT=.*|WEB_PORT=\"${custom_port}\"|" "$WEB_CONFIG_FILE"
      else
        printf 'WEB_PORT=%q\n' "$custom_port" >> "$WEB_CONFIG_FILE"
      fi
      ok "Web port set to ${custom_port}."
    else
      warn "Invalid port entered. Keeping default port ${current_port}."
    fi
  fi

  printf '\n'
  local want_ssl="n"
  read -r -p "  Do you have a domain pointing to this server and want free SSL (HTTPS)? [y/N]: " want_ssl
  if [[ "$want_ssl" =~ ^[Yy]$ ]]; then
    configure_web_ssl || warn "SSL configuration skipped or failed. Web Dashboard will run over HTTP."
  fi

  printf '\n'
  local want_static_pw="y"
  read -r -p "  Do you want to set a fixed Web Admin Password? [y/N]: " want_static_pw
  local admin_pw=""
  if [[ "$want_static_pw" =~ ^[Yy]$ ]]; then
    read -r -p "  Set Web Admin Password [Press Enter to auto-generate]: " admin_pw
    if [[ -z "$admin_pw" ]]; then
      admin_pw="$(openssl rand -base64 9 | tr -dc 'a-zA-Z0-9' | head -c 10)"
    fi
    local hash
    hash="$(python3 -c "import secrets, hashlib, sys
pw = sys.argv[1]
salt = secrets.token_hex(16)
h = hashlib.sha256((salt + pw).encode('utf-8')).hexdigest()
print(f'sha256\${salt}\${h}')
" "$admin_pw")"
    if grep -q '^WEB_PASSWORD_HASH=' "$WEB_CONFIG_FILE" 2>/dev/null; then
      sed -i "s|^WEB_PASSWORD_HASH=.*|WEB_PASSWORD_HASH=\"${hash}\"|" "$WEB_CONFIG_FILE"
    else
      printf 'WEB_PASSWORD_HASH=%q\n' "$hash" >> "$WEB_CONFIG_FILE"
    fi
    ok "Admin password configured."
  else
    if grep -q '^WEB_PASSWORD_HASH=' "$WEB_CONFIG_FILE" 2>/dev/null; then
      sed -i '/^WEB_PASSWORD_HASH=/d' "$WEB_CONFIG_FILE"
    fi
    ok "Token-Only login enabled (Highest security — password brute-force immune)."
  fi
  chmod 600 "$WEB_CONFIG_FILE" 2>/dev/null || true

  systemctl enable --now xraymesh-web.service >/dev/null 2>&1 || true
  systemctl enable --now xraymesh-iperf.service >/dev/null 2>&1 || true

  # Automatically permit Web & Mesh ports if UFW firewall is active
  if command -v ufw >/dev/null 2>&1; then
    if ufw status 2>/dev/null | grep -qi "Status: active"; then
      local ufw_wport="$(get_web_port)"
      ufw allow "${ufw_wport}/tcp" >/dev/null 2>&1 || true
      local ufw_mport="11010"
      if [[ -f "$CONFIG_FILE" ]]; then
        ufw_mport="$(grep '^PORT=' "$CONFIG_FILE" 2>/dev/null | cut -d= -f2 | tr -d '\"'\'' ')"
        ufw_mport="${ufw_mport:-11010}"
      fi
      ufw allow "${ufw_mport}/tcp" >/dev/null 2>&1 || true
      ufw allow "${ufw_mport}/udp" >/dev/null 2>&1 || true
      ok "Firewall (UFW): Allowed Web (${ufw_wport}/tcp) and Mesh (${ufw_mport}/tcp+udp) ports."
    fi
  fi

  # Generate 1-hour access link
  local token now expiry_ts pub_ip port proto domain web_url
  token="$(openssl rand -hex 16)"
  now="$(date +%s)"
  expiry_ts=$(( now + 3600 ))
  port="$(get_web_port)"
  pub_ip="$(get_server_ip)"
  proto="$(get_web_proto)"
  domain="$(get_web_domain)"

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

  if [[ "$proto" == "https" && -n "$domain" ]]; then
    web_url="https://${domain}:${port}"
  else
    web_url="http://${pub_ip}:${port}"
  fi

  printf '\n'
  say "  ┌── XRayMesh v${VERSION} — Setup Completed Successfully! ───────────" "$GREEN"
  printf '  │  • %bWeb Dashboard URL%b : %b%s%b\n' "$BOLD$CYAN" "$RESET" "$BOLD$CYAN" "$web_url" "$RESET"
  if [[ -n "$admin_pw" ]]; then
    printf '  │  • %bAdmin Password%b    : %b%s%b\n' "$BOLD$YELLOW" "$RESET" "$BOLD$YELLOW" "$admin_pw" "$RESET"
  else
    printf '  │  • %bAdmin Auth%b        : %bToken-Only Mode (Highest Security)%b\n' "$BOLD$GREEN" "$RESET" "$GREEN" "$RESET"
  fi
  printf '  │  • %bOne-Click Login%b   : %b%s/?token=%s%b\n' "$BOLD$GREEN" "$RESET" "$BOLD$GREEN" "$web_url" "$token" "$RESET"
  printf '  │  • %bNew Token Command%b : %bsudo xraymesh token%b\n' "$GRAY" "$RESET" "$BOLD$CYAN" "$RESET"
  say "  ├── Quick Guide ──────────────────────────────────────────────" "$DIM$BLUE"
  printf '  │  • All tunnels (HAProxy, Realm, Gost, iptables), SafeSync\n'
  printf '  │    and cluster updates are managed 100%% in the Web Dashboard.\n'
  printf '  │  • Run %bxraymesh%b at any time in terminal to open the menu.\n' "$BOLD$CYAN" "$RESET"
  say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
  printf '\n'

  printf '  %b[ 1 ]%b  Open XRayMesh Control Panel Menu\n' "$BOLD$GREEN" "$RESET"
  printf '  %b[ 2 ]%b  Join an Existing Mesh Network (Invite Code)\n' "$BOLD$CYAN" "$RESET"
  printf '  %b[ 3 ]%b  Exit to Terminal\n\n' "$GRAY" "$RESET"
  local post_choice="1"
  read -r -p "  Select an option [1-3, default: 1]: " post_choice
  post_choice="${post_choice:-1}"
  if [[ "$post_choice" == "2" ]]; then
    join_mesh_invite
    return 0
  elif [[ "$post_choice" == "3" || "$post_choice" =~ ^[Qq]$ ]]; then
    printf '\n%b  ✓ Installation finished. Run %bxraymesh%b at any time to open the menu.%b\n\n' "$GREEN" "$BOLD$CYAN" "$GREEN" "$RESET"
    return 1
  fi
  return 0
}

generate_web_token() {
  install_web_runtime
  local token now expiry_ts pub_ip port mesh_ip proto domain
  token="$(openssl rand -hex 16)"
  now="$(date +%s)"
  expiry_ts=$(( now + 3600 ))
  port="$(get_web_port)"
  pub_ip="$(get_server_ip)"
  proto="$(get_web_proto)"
  domain="$(get_web_domain)"
  mesh_ip=""
  if [[ -f "$CONFIG_FILE" ]]; then
    mesh_ip="$( (grep -E '^IPV4=' "$CONFIG_FILE" 2>/dev/null || true) | cut -d= -f2- | tr -d '"'\'' ' )"
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
  say "  ┌── Web Dashboard Access ─────────────────────────────────────" "$DIM$BLUE"
  if [[ "$proto" == "https" && -n "$domain" ]]; then
    printf '  │  • %bDirect Browser Link (SSL)%b : %bhttps://%s:%s/?token=%s%b\n' "$BOLD$CYAN" "$RESET" "$BOLD$GREEN" "$domain" "$port" "$token" "$RESET"
  else
    printf '  │  • %bDirect Browser Link (IP)%b  : %bhttp://%s:%s/?token=%s%b\n' "$BOLD$CYAN" "$RESET" "$BOLD$GREEN" "$pub_ip" "$port" "$token" "$RESET"
  fi

  if [[ -n "$mesh_ip" ]]; then
    printf '  │  • %bMesh Virtual IP Link%b     : %bhttp://%s:%s/?token=%s%b\n' "$BOLD$PURPLE" "$RESET" "$BLUE" "$mesh_ip" "$port" "$token" "$RESET"
  fi

  printf '  │  • %bToken String%b             : %b%s%b\n' "$BOLD$YELLOW" "$RESET" "$BOLD$YELLOW" "$token" "$RESET"
  say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
  printf '\n'
  info "Opening the URL in your browser logs you in instantly."
  pause
}

set_web_password() {
  install_web_runtime
  header
  section "ADMIN PASSWORD & AUTHENTICATION"

  local current_hash=""
  if grep -q '^WEB_PASSWORD_HASH=' "$WEB_CONFIG_FILE" 2>/dev/null; then
    current_hash="$(grep -E '^WEB_PASSWORD_HASH=' "$WEB_CONFIG_FILE" | cut -d= -f2- | tr -d '"'\'' ')"
  fi

  if [[ -n "$current_hash" ]]; then
    printf '  Current Status: %bFixed Password Enabled%b\n\n' "$GREEN" "$RESET"
    printf '  %b[1]%b  Change Fixed Admin Password\n' "$GREEN" "$RESET"
    printf '  %b[2]%b  Remove Password (Switch to Token-Only Mode — Highest Security)\n' "$YELLOW" "$RESET"
    printf '  %b[0]%b  Back\n\n' "$GRAY" "$RESET"
    local pw_choice="1"
    read -r -p "  Choice [0-2, default: 1]: " pw_choice
    pw_choice="${pw_choice:-1}"
    if [[ "$pw_choice" == "0" ]]; then
      return 0
    elif [[ "$pw_choice" == "2" ]]; then
      sed -i '/^WEB_PASSWORD_HASH=/d' "$WEB_CONFIG_FILE"
      systemctl restart xraymesh-web.service 2>/dev/null || true
      ok "Password removed. Web UI is now in Token-Only mode."
      pause
      return 0
    fi
  else
    printf '  Current Status: %bToken-Only Mode (No Fixed Password)%b\n\n' "$YELLOW" "$RESET"
    printf '  %b[1]%b  Set a Fixed Admin Password\n' "$GREEN" "$RESET"
    printf '  %b[0]%b  Keep Token-Only Mode (Back)\n\n' "$GRAY" "$RESET"
    local pw_choice="1"
    read -r -p "  Choice [0-1, default: 1]: " pw_choice
    pw_choice="${pw_choice:-1}"
    if [[ "$pw_choice" == "0" ]]; then
      return 0
    fi
  fi

  printf '\n'
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

update_core() {
  local before after
  before="$(cat "${INSTALL_DIR}/easytier.version" 2>/dev/null || echo "not installed")"
  install_core
  after="$(cat "${INSTALL_DIR}/easytier.version")"
  [[ -f "$SERVICE_FILE" ]] && ( sleep 1 && systemctl restart xraymesh.service ) >/dev/null 2>&1 &
  if [[ -d "$WEB_DIR" || -f "$WEB_SERVICE_FILE" ]]; then
    update_web_assets
  fi
  ok "EasyTier: ${before} → ${after}"
  [[ -t 0 ]] && pause || true
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
  systemctl disable --now xraymesh-gost.service 2>/dev/null || true
  systemctl disable --now xraymesh-realm.service 2>/dev/null || true
  systemctl disable --now xraymesh-web.service 2>/dev/null || true
  systemctl disable --now xraymesh-iperf.service 2>/dev/null || true
  if [[ -x "$IPTABLES_APPLY_SCRIPT" ]]; then
    "$IPTABLES_APPLY_SCRIPT" remove >/dev/null 2>&1 || true
  fi
  rm -f "$SERVICE_FILE" "$HAPROXY_SERVICE_FILE" "$IPTABLES_SERVICE_FILE" "$IPTABLES_SYSCTL_FILE" "$GOST_SERVICE_FILE" "$GOST_CONFIG_FILE" "$REALM_SERVICE_FILE" "$REALM_CONFIG_FILE" "$WEB_SERVICE_FILE" "$IPERF_SERVICE_FILE" /usr/local/bin/xraymesh
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
  if compgen -G "${GOST_TUNNEL_DIR}/*.env" >/dev/null; then
    SELF_TEST_LABEL="GOST binary is installed"
    test_result test -x "$GOST_BIN"
    SELF_TEST_LABEL="GOST service is active"
    test_result systemctl is-active --quiet xraymesh-gost.service
  fi
  if compgen -G "${REALM_TUNNEL_DIR}/*.env" >/dev/null; then
    SELF_TEST_LABEL="Realm binary is installed"
    test_result test -x "$REALM_BIN"
    SELF_TEST_LABEL="Realm service is active"
    test_result systemctl is-active --quiet xraymesh-realm.service
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

bootstrap_web_first() {
  require_root
  require_linux
  set +e
  set +u
  set +o pipefail
  trap - ERR

  header
  say "  ┌── XRayMesh v${VERSION} — Fast Web Setup ─────────────────────────" "$GREEN"
  printf '  │  Installing system dependencies, EasyTier core, and Web Dashboard...\n'
  say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
  printf '\n'

  install_dependencies
  install_core
  ensure_xraymesh_cli >/dev/null 2>&1 || true

  if configure_web_ui_interactive; then
    return 0
  else
    return 1
  fi
}

menu() {
  require_root
  require_linux
  set +e
  set +u
  set +o pipefail
  trap - ERR

  # If Web UI is not installed / configured, start Web-First setup immediately
  if [[ ! -f "$WEB_CONFIG_FILE" || ! -f "$WEB_SERVICE_FILE" ]]; then
    if ! bootstrap_web_first; then
      return 0
    fi
  fi

  if [[ -d "$WEB_DIR" || -f "$WEB_SERVICE_FILE" ]]; then
    update_web_assets >/dev/null 2>&1 || true
  fi

  IN_MAIN_MENU=1
  while true; do
    header

    local mesh_state web_state iperf_state port pub_ip proto domain ssl_info v_ip host_name web_url
    mesh_state="$(systemctl is-active xraymesh.service 2>/dev/null || true)"
    [[ -z "$mesh_state" ]] && mesh_state="inactive"
    web_state="$(systemctl is-active xraymesh-web.service 2>/dev/null || true)"
    [[ -z "$web_state" ]] && web_state="inactive"
    iperf_state="$(systemctl is-active xraymesh-iperf.service 2>/dev/null || true)"
    [[ -z "$iperf_state" ]] && iperf_state="inactive"
    port="$(get_web_port 2>/dev/null || echo "$DEFAULT_WEB_PORT")"
    pub_ip="$(get_server_ip 2>/dev/null || echo "127.0.0.1")"
    proto="$(get_web_proto 2>/dev/null || echo "http")"
    domain="$(get_web_domain 2>/dev/null || true)"

    if [[ -f "$CONFIG_FILE" ]]; then
      # shellcheck disable=SC1090
      source "$CONFIG_FILE" 2>/dev/null || true
      v_ip="${IPV4:-unknown}"
      host_name="${HOSTNAME:-$(hostname -s 2>/dev/null || echo node)}"
    else
      v_ip="Not Configured"
      host_name="$(hostname -s 2>/dev/null || echo node)"
    fi

    if [[ "$proto" == "https" && -n "$domain" ]]; then
      ssl_info="Enabled (HTTPS — ${domain})"
      web_url="https://${domain}:${port}"
    else
      ssl_info="Disabled (HTTP)"
      web_url="http://${pub_ip}:${port}"
    fi

    local auth_info="Password + Token"
    if ! grep -q '^WEB_PASSWORD_HASH=' "$WEB_CONFIG_FILE" 2>/dev/null; then
      auth_info="Token-Only (Highest Security)"
    fi

    local mesh_badge web_badge iperf_badge
    if [[ "$mesh_state" == "active" ]]; then
      mesh_badge="${GREEN}● Active${RESET}"
    else
      mesh_badge="${RED}○ Inactive${RESET}"
    fi

    if [[ "$web_state" == "active" ]]; then
      web_badge="${GREEN}● Active${RESET}"
    else
      web_badge="${RED}○ Inactive${RESET}"
    fi

    if [[ "$iperf_state" == "active" ]]; then
      iperf_badge="${GREEN}● Active${RESET}"
    else
      iperf_badge="${GRAY}○ Inactive${RESET}"
    fi

    say "  ┌── System Status ──────────────────────────────────────────" "$DIM$BLUE"
    if [[ ! -f "$CONFIG_FILE" ]]; then
      printf '  │  • %-16s : %bNot Configured%b (Open Web Dashboard to initialize)\n' "Mesh Node" "$YELLOW" "$RESET"
    else
      printf '  │  • %-16s : %b%s%b (%s) — %b\n' "Mesh Node" "$BOLD$CYAN" "$host_name" "$RESET" "$v_ip" "$mesh_badge"
    fi
    printf '  │  • %-16s : %b%s%b — %b\n' "Web Dashboard" "$BOLD$CYAN" "$web_url" "$RESET" "$web_badge"
    printf '  │  • %-16s : %s\n' "Auth Mode" "$auth_info"
    printf '  │  • %-16s : %s\n' "SSL / HTTPS" "$ssl_info"
    printf '  │  • %-16s : Port 5201 (In-Mesh) — %b\n' "Speedtest Server" "$iperf_badge"
    say "  └───────────────────────────────────────────────────────────" "$DIM$BLUE"
    printf '\n'

    say "  ── Web Dashboard & Security ────────────────────────────────" "$BOLD$CYAN"
    printf '  %b[%b 1%b]%b  Show Web Dashboard URL & One-Click Login Link\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 2%b]%b  Admin Password & Authentication Settings\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 3%b]%b  Change Web Dashboard Port\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 4%b]%b  Configure Custom Domain & Free SSL (Let'\''s Encrypt HTTPS)\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 5%b]%b  Remove SSL (Revert to HTTP)\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '\n'

    say "  ── Mesh & Node Management ──────────────────────────────────" "$BOLD$CYAN"
    printf '  %b[%b 6%b]%b  Join Mesh Network via Invite Code (xrmesh://)\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 7%b]%b  Configure Mesh Node (CLI Wizard)\n' "$DIM$GRAY" "$BOLD$YELLOW" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 8%b]%b  Show Mesh Invite Code (for connecting other servers)\n' "$DIM$GRAY" "$BOLD$GREEN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 9%b]%b  Restart All Services (Mesh, Web, Tunnels)\n' "$DIM$GRAY" "$BOLD$BLUE" "$DIM$GRAY" "$RESET"
    printf '  %b[%b10%b]%b  Stop All Services\n' "$DIM$GRAY" "$BOLD$RED" "$DIM$GRAY" "$RESET"
    printf '  %b[%b11%b]%b  Start All Services\n' "$DIM$GRAY" "$BOLD$GREEN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b12%b]%b  View Live Logs\n' "$DIM$GRAY" "$BOLD$CYAN" "$DIM$GRAY" "$RESET"
    printf '\n'

    say "  ── System & Maintenance ────────────────────────────────────" "$BOLD$CYAN"
    printf '  %b[%b13%b]%b  Update XRayMesh to Latest Version\n' "$DIM$GRAY" "$BOLD$GREEN" "$DIM$GRAY" "$RESET"
    printf '  %b[%b14%b]%b  Completely Uninstall XRayMesh\n' "$DIM$GRAY" "$BOLD$RED" "$DIM$GRAY" "$RESET"
    printf '  %b[%b 0%b]%b  Exit\n' "$DIM$GRAY" "$GRAY" "$DIM$GRAY" "$RESET"
    printf '\n'
    printf '%b  Tip: All tunnels (HAProxy, Realm, Gost, iptables), SafeSync, and diagnostics\n' "$DIM$GRAY"
    printf '       are managed 100%% from the modern Web Dashboard.%b\n\n' "$RESET"

    read -r -p "  Select an option [0-14]: " choice || { choice=""; continue; }
    case "$choice" in
      1) run_screen generate_web_token ;;
      2) run_screen set_web_password ;;
      3) run_screen configure_web_port ;;
      4) run_screen configure_web_ssl; pause ;;
      5) run_screen remove_web_ssl ;;
      6) run_screen join_mesh_invite ;;
      7)
        IN_MAIN_MENU=0
        run_screen setup_node
        IN_MAIN_MENU=1
        ;;
      8) run_screen show_mesh_invite ;;
      9)
        info "Restarting all XRayMesh services..."
        apply_node_config >/dev/null 2>&1 || true
        systemctl restart xraymesh-web.service 2>/dev/null || true
        systemctl restart xraymesh-iperf.service 2>/dev/null || true
        ok "Services restarted."
        pause
        ;;
      10)
        info "Stopping all XRayMesh services..."
        systemctl stop xraymesh.service xraymesh-web.service xraymesh-haproxy.service xraymesh-iptables.service xraymesh-gost.service xraymesh-realm.service xraymesh-iperf.service 2>/dev/null || true
        warn "All services stopped."
        pause
        ;;
      11)
        info "Starting all XRayMesh services..."
        apply_node_config >/dev/null 2>&1 || true
        systemctl start xraymesh-web.service 2>/dev/null || true
        systemctl start xraymesh-iperf.service 2>/dev/null || true
        ok "Services started."
        pause
        ;;
      12)
        printf '\n  [1] Mesh Logs  [2] Web Logs  [3] Tunnel Logs\n'
        read -r -p "  Choice [1-3]: " l_choice
        case "$l_choice" in
          1) journalctl -u xraymesh.service -f -n 50 ;;
          2) journalctl -u xraymesh-web.service -f -n 50 ;;
          3) journalctl -u xraymesh-haproxy.service -u xraymesh-gost.service -u xraymesh-realm.service -u xraymesh-iptables.service -f -n 50 ;;
        esac
        ;;
      13) IN_MAIN_MENU=0; run_screen update_core; IN_MAIN_MENU=1 ;;
      14)
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
  set +e
  set +u
  set +o pipefail
  trap - ERR

  if (( EUID == 0 )); then
    ensure_xraymesh_cli >/dev/null 2>&1 || true
  fi

  case "${1:-menu}" in
  menu) menu ;;
  install|setup)
    require_linux
    if bootstrap_web_first; then
      menu
    fi
    ;;
  setup-node) require_linux; setup_node ;;
  join|join-mesh) shift; require_root; require_linux; join_mesh_invite "$@" ;;
  invite|invite-code) require_root; require_linux; show_mesh_invite ;;
  status)
    local mesh_state web_state iperf_state port pub_ip proto domain v_ip host_name url
    mesh_state="$(systemctl is-active xraymesh.service 2>/dev/null || echo inactive)"
    web_state="$(systemctl is-active xraymesh-web.service 2>/dev/null || echo inactive)"
    iperf_state="$(systemctl is-active xraymesh-iperf.service 2>/dev/null || echo inactive)"
    port="$(get_web_port 2>/dev/null || echo "$DEFAULT_WEB_PORT")"
    pub_ip="$(get_server_ip 2>/dev/null || echo "127.0.0.1")"
    proto="$(get_web_proto 2>/dev/null || echo "http")"
    domain="$(get_web_domain 2>/dev/null || true)"
    if [[ -f "$CONFIG_FILE" ]]; then
      # shellcheck disable=SC1090
      source "$CONFIG_FILE" 2>/dev/null || true
      v_ip="${IPV4:-unknown}"
      host_name="${HOSTNAME:-$(hostname -s 2>/dev/null || echo node)}"
    else
      v_ip="Not Configured"
      host_name="$(hostname -s 2>/dev/null || echo node)"
    fi
    url="http://${pub_ip}:${port}"
    [[ "$proto" == "https" && -n "$domain" ]] && url="https://${domain}:${port}"

    local mesh_badge web_badge iperf_badge
    if [[ "$mesh_state" == "active" ]]; then
      mesh_badge="${GREEN}● Active${RESET}"
    else
      mesh_badge="${RED}○ Inactive${RESET}"
    fi
    if [[ "$web_state" == "active" ]]; then
      web_badge="${GREEN}● Active${RESET}"
    else
      web_badge="${RED}○ Inactive${RESET}"
    fi
    if [[ "$iperf_state" == "active" ]]; then
      iperf_badge="${GREEN}● Active${RESET}"
    else
      iperf_badge="${GRAY}○ Inactive${RESET}"
    fi

    printf '\n'
    say "  ┌── XRayMesh Status Summary ──────────────────────────────────" "$DIM$BLUE"
    printf '  │  • %-16s : %b%s%b (%s) — %b\n' "Mesh Node" "$BOLD$CYAN" "$host_name" "$RESET" "$v_ip" "$mesh_badge"
    printf '  │  • %-16s : %b%s%b — %b\n' "Web Dashboard" "$BOLD$CYAN" "$url" "$RESET" "$web_badge"
    printf '  │  • %-16s : Port 5201 (In-Mesh) — %b\n' "Speedtest Server" "$iperf_badge"
    say "  └─────────────────────────────────────────────────────────────" "$DIM$BLUE"
    printf '\n'
    ;;
  peers) "${BIN_DIR}/easytier-cli" peer ;;
  routes) "${BIN_DIR}/easytier-cli" route ;;
  logs) journalctl -u xraymesh.service -u xraymesh-web.service -f -n 50 ;;
  update) require_linux; update_core ;;
  uninstall) require_root; require_linux; uninstall_app ;;
  delete|delete-node|node-delete)
    require_root; require_linux
    if [[ "$1" == "delete" && -t 0 ]]; then
      delete_mesh
    else
      delete_mesh_noninteractive
    fi
    ;;
  realm-create) shift; require_linux; create_realm_tunnel_noninteractive "$@" ;;
  realm-edit) shift; require_linux; edit_realm_tunnel_noninteractive "$@" ;;
  realm-delete) shift; require_linux; delete_realm_tunnel_noninteractive "$@" ;;
  realm-start) require_root; require_linux; systemctl start xraymesh-realm.service ;;
  realm-stop) require_root; require_linux; systemctl stop xraymesh-realm.service ;;
  realm-restart) require_root; require_linux; systemctl restart xraymesh-realm.service ;;
  haproxy-create) shift; require_linux; create_haproxy_tunnel_noninteractive "$@" ;;
  haproxy-edit) shift; require_linux; edit_haproxy_tunnel_noninteractive "$@" ;;
  haproxy-delete) shift; require_linux; delete_haproxy_tunnel_noninteractive "$@" ;;
  iptables-create) shift; require_linux; create_iptables_tunnel_noninteractive "$@" ;;
  iptables-edit) shift; require_linux; edit_iptables_tunnel_noninteractive "$@" ;;
  iptables-delete) shift; require_linux; delete_iptables_tunnel_noninteractive "$@" ;;
  gost-create) shift; require_linux; create_gost_tunnel_noninteractive "$@" ;;
  gost-edit) shift; require_linux; edit_gost_tunnel_noninteractive "$@" ;;
  gost-delete) shift; require_linux; delete_gost_tunnel_noninteractive "$@" ;;
  gost-start) require_root; require_linux; systemctl start xraymesh-gost.service ;;
  gost-stop) require_root; require_linux; systemctl stop xraymesh-gost.service ;;
  gost-restart) require_root; require_linux; systemctl restart xraymesh-gost.service ;;
  web|link|token|login-link) require_root; require_linux; generate_web_token ;;
  password|reset-password) require_root; require_linux; set_web_password ;;
  port|change-port) require_root; require_linux; configure_web_port ;;
  web-start) require_root; require_linux; systemctl start xraymesh-web.service ;;
  web-stop)
    require_root; require_linux
    if systemctl status xraymesh-web.service 2>/dev/null | grep -q "deactivating"; then
      systemctl kill -s SIGKILL xraymesh-web.service 2>/dev/null || true
    fi
    systemctl disable --now xraymesh-web.service 2>/dev/null || systemctl stop xraymesh-web.service 2>/dev/null || true
    ;;
  web-restart)
    require_root; require_linux
    if systemctl status xraymesh-web.service 2>/dev/null | grep -q "deactivating"; then
      systemctl kill -s SIGKILL xraymesh-web.service 2>/dev/null || true
    fi
    systemctl restart xraymesh-web.service 2>/dev/null || (systemctl kill -s SIGKILL xraymesh-web.service 2>/dev/null && systemctl start xraymesh-web.service 2>/dev/null) || true
    ;;
  iperf-start) require_root; require_linux; write_iperf_service; systemctl enable --now xraymesh-iperf.service ;;
  iperf-stop) require_root; require_linux; systemctl disable --now xraymesh-iperf.service 2>/dev/null || systemctl stop xraymesh-iperf.service 2>/dev/null || true ;;
  iperf-restart) require_root; require_linux; write_iperf_service; systemctl restart xraymesh-iperf.service ;;
  write-runner) require_root; require_linux; write_runner; write_iperf_service; systemctl daemon-reload ;;
  node-restart|node-apply) require_root; require_linux; apply_node_config ;;
  web-update|update-all-assets|node-update) require_root; require_linux; update_node_full ;;
  ssl|web-ssl) require_root; require_linux; configure_web_ssl ;;
  remove-ssl|web-ssl-remove) require_root; require_linux; remove_web_ssl ;;
  self-test|doctor) require_linux; self_test ;;
  start|restart)
    require_root; require_linux
    apply_node_config
    systemctl restart xraymesh-web.service 2>/dev/null || true
    systemctl restart xraymesh-iperf.service 2>/dev/null || true
    ok "All services started."
    ;;
  stop)
    require_root; require_linux
    systemctl stop xraymesh.service xraymesh-web.service xraymesh-haproxy.service xraymesh-iptables.service xraymesh-gost.service xraymesh-realm.service xraymesh-iperf.service 2>/dev/null || true
    warn "All services stopped."
    ;;
  version|-v|--version) echo "${APP} ${VERSION} - © ${OWNER}" ;;
  help|-h|--help)
    printf '\n'
    say "  ${APP} v${VERSION} — CLI Commands Reference" "$BOLD$CYAN"
    printf '  %-20s %s\n' "xraymesh" "Open the interactive terminal manager"
    printf '  %-20s %s\n' "xraymesh token" "Generate a 1-hour one-click Web UI login URL"
    printf '  %-20s %s\n' "xraymesh password" "Configure or change Web Admin password"
    printf '  %-20s %s\n' "xraymesh port" "Change the Web Dashboard HTTP/HTTPS port"
    printf '  %-20s %s\n' "xraymesh ssl" "Configure free automated SSL/TLS (HTTPS) domain certificate"
    printf '  %-20s %s\n' "xraymesh remove-ssl" "Revert Web Dashboard back to HTTP"
    printf '  %-20s %s\n' "xraymesh join" "Join an existing mesh network using invite code (xrmesh://)"
    printf '  %-20s %s\n' "xraymesh invite" "Show invite code to connect other servers to this mesh"
    printf '  %-20s %s\n' "xraymesh status" "Show node, mesh, and Web UI status summary"
    printf '  %-20s %s\n' "xraymesh peers" "Show connected peers and live latency"
    printf '  %-20s %s\n' "xraymesh routes" "Show mesh routing table"
    printf '  %-20s %s\n' "xraymesh logs" "Stream live systemd service logs"
    printf '  %-20s %s\n' "xraymesh self-test" "Run installation and service health self-tests"
    printf '  %-20s %s\n' "xraymesh start" "Start or apply node and start all services"
    printf '  %-20s %s\n' "xraymesh restart" "Restart all XRayMesh services"
    printf '  %-20s %s\n' "xraymesh stop" "Stop all XRayMesh services"
    printf '  %-20s %s\n' "xraymesh update" "Update core CLI, Web UI assets, and EasyTier binaries"
    printf '  %-20s %s\n' "xraymesh delete" "Delete node configuration while keeping binaries"
    printf '  %-20s %s\n' "xraymesh uninstall" "Completely remove XRayMesh, services, and binaries"
    printf '  %-20s %s\n' "xraymesh version" "Print version information"
    printf '\n'
    ;;
  *)
    echo "Usage: $0 [menu|join|invite|token|password|port|ssl|remove-ssl|status|peers|routes|logs|self-test|start|restart|stop|update|delete|uninstall|version|help]"
    exit 2
    ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
