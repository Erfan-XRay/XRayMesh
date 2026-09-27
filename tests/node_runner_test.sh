#!/usr/bin/env bash
# Checks the EasyTier arguments xraymesh-runner builds from a node config.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

# Firewall and sysctl calls in the runner become no-ops, and EasyTier prints its arguments.
mkdir -p "${TMP_DIR}/bin"
for tool in sysctl iptables ip6tables ufw; do
  printf '#!/bin/sh\nexit 0\n' > "${TMP_DIR}/bin/${tool}"
done
printf '#!/bin/sh\nprintf "%%s\\n" "$@"\n' > "${TMP_DIR}/bin/easytier-core"
chmod +x "${TMP_DIR}/bin/"*

awk "/<<'RUNNER'\$/{f=1;next} /^RUNNER\$/{f=0} f" "${ROOT_DIR}/xraymesh.sh" |
  sed -e "s#/etc/xraymesh/config.env#${TMP_DIR}/config.env#" \
      -e "s#/opt/xraymesh/bin/easytier-core#${TMP_DIR}/bin/easytier-core#" > "${TMP_DIR}/runner"

# run_runner KEY=VALUE... prints EasyTier's arguments on one line.
run_runner() {
  {
    printf '%s\n' "NETWORK_NAME='mesh'" "NETWORK_SECRET='secret'" "HOSTNAME='node1'" \
      "IPV4='10.144.144.1'" "PORT='11010'"
    printf '%s\n' "$@"
  } > "${TMP_DIR}/config.env"
  PATH="${TMP_DIR}/bin:${PATH}" bash "${TMP_DIR}/runner" | tr '\n' ' '
}

has() { [[ " $1 " == *" $2 "* ]] || { printf 'expected "%s" in: %s\n' "$2" "$1" >&2; return 1; }; }
lacks() { [[ " $1 " != *" $2 "* ]] || { printf 'did not expect "%s" in: %s\n' "$2" "$1" >&2; return 1; }; }

# Strangers with another network secret must never be able to use a node as a relay.
for proto in dual udp tcp ws wss quic faketcp icmp pck; do
  args="$(run_runner "PROTOCOL='${proto}'")"
  has "$args" "--private-mode true"
done

# Multi-thread follows the config; configs from before it existed stay single-threaded.
has "$(run_runner "MULTI_THREAD='yes'")" "--multi-thread"
lacks "$(run_runner "MULTI_THREAD='no'")" "--multi-thread"
lacks "$(run_runner)" "--multi-thread"

# IPv6 stays off unless the config turns it on.
has "$(run_runner)" "--disable-ipv6"
lacks "$(run_runner "IPV6='yes'")" "--disable-ipv6"

# Encryption and KCP.
has "$(run_runner "ENCRYPTION='no'")" "--disable-encryption"
lacks "$(run_runner)" "--disable-encryption"
has "$(run_runner "ENABLE_KCP='yes'")" "--enable-kcp-proxy"

# WireGuard peers keep their scheme instead of becoming TCP/UDP peers on the WireGuard port.
args="$(run_runner "PEERS='wg://203.0.113.9:11011'")"
has "$args" "--peers wg://203.0.113.9:11011"
lacks "$args" "tcp://203.0.113.9:11011"

# Peers without a scheme follow the protocol, and IPv6 addresses keep their brackets.
args="$(run_runner "PROTOCOL='quic'" "PEERS='203.0.113.9,[2001:db8::1]:12000'")"
has "$args" "--peers quic://203.0.113.9:11010"
has "$args" "--peers tcp://203.0.113.9:11010"
has "$args" "--peers quic://[2001:db8::1]:12000"
has "$(run_runner "PROTOCOL='ws'" "PEERS='203.0.113.9'")" "--peers ws://203.0.113.9:11010/"

# ICMP and PCK cap the MTU and keep peer sockets off the physical interface.
for proto in icmp pck; do
  args="$(run_runner "PROTOCOL='${proto}'" "MTU='1360'")"
  has "$args" "--mtu 1280"
  has "$args" "--bind-device false"
done
has "$(run_runner "MTU='1360'")" "--mtu 1360"

# The terminal setup only accepts yes or no answers.
# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"
answer=""
ask_yes_no_into answer "Enable KCP?" "no" <<< "y" >/dev/null 2>&1
[[ "$answer" == "yes" ]]
ask_yes_no_into answer "Enable KCP?" "no" <<< "" >/dev/null 2>&1
[[ "$answer" == "no" ]]
ask_yes_no_into answer "Enable KCP?" "yes" < <(printf 'maybe\nNO\n') >/dev/null 2>&1
[[ "$answer" == "no" ]]
# Input that ends without an answer takes the default instead of asking forever.
ask_yes_no_into answer "Enable KCP?" "yes" < /dev/null >/dev/null 2>&1
[[ "$answer" == "yes" ]]
valid_mtu 1360
valid_mtu 576
for bad in 575 9001 abc ""; do
  if valid_mtu "$bad"; then printf 'MTU "%s" should be rejected\n' "$bad" >&2; exit 1; fi
done

printf 'node runner tests passed\n'
