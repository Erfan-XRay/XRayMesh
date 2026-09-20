# XRayMesh

**English** | [فارسی](README_FA.md)

XRayMesh is a Bash-based manager for creating and operating secure mesh
networks between Linux servers. It uses
[EasyTier](https://github.com/EasyTier/EasyTier) to connect servers through
virtual private IP addresses, with support for direct peers, multiple
transports, live monitoring, and automatic service recovery.

Developed by **ErfanXRay**

## What XRayMesh Does

- Connects two or more Linux servers in one encrypted private network
- Assigns a unique virtual IPv4 address to every server
- Supports multiple peer addresses for redundant mesh paths
- Supports TCP/UDP fallback and strict WSS or QUIC transport modes
- Downloads and updates the latest stable EasyTier core automatically
- Runs each node as a persistent systemd service with automatic restart
- Displays connected peers, latency, routes, traffic, and transport information
- Creates isolated HAProxy TCP tunnels to existing EasyTier nodes
- Creates managed iptables TCP/UDP forwarding tunnels to EasyTier nodes
- Supports comma-separated ports and port ranges for HAProxy and iptables forwarding
- Provides service logs and connection diagnostics for failed handshakes
- Shows physical server IPv4/IPv6 addresses separately from mesh addresses
- Safely edits or deletes a node without requiring a complete reinstall
- Responsive dark Web UI Dashboard with real-time mesh monitoring, peer status, and host stats
- In-Mesh Speedtest Suite powered by iperf3 for TCP (bandwidth) and UDP (jitter and packet loss) benchmarks
- Hybrid authentication with instant One-Click CLI login tokens and optional admin password
- Supports `x86_64`, `aarch64`, `armv7`, and `i686`

XRayMesh includes a clean, colored terminal interface to make configuration and
day-to-day management easier.

## Common Use Cases

- Connecting domestic and international VPS servers through a private network
- Accessing services through stable virtual IP addresses
- Building multi-node relay or routing topologies
- Carrying TCP and UDP application traffic through WSS or QUIC
- Maintaining alternative peer paths when one server or route becomes
  unavailable
- Monitoring the active EasyTier transport, peer latency, and routing state

## Requirements

- Debian or Ubuntu
- Root access
- systemd
- An open firewall port for the selected transport

## Installation

Run XRayMesh with one command:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/main/xraymesh.sh)
```

Or download and run it locally:

```bash
chmod +x xraymesh.sh
sudo ./xraymesh.sh
```

XRayMesh installs its dependencies and the correct EasyTier binary for the
server architecture. The official release archive is verified against the
SHA-256 digest published by GitHub before installation.

## Connect Two Servers

### First server

1. Run XRayMesh and select **Configure or edit node**.
2. Choose a network name.
3. Save the generated network secret.
4. Assign a virtual IP such as `10.144.144.1`.
5. Select a transport and port.
6. Leave the peer address empty.

### Second server

1. Use exactly the same network name and secret.
2. Assign a different virtual IP, such as `10.144.144.2`.
3. Use the same transport and port.
4. Enter the public IP address of the first server:

```text
1.2.3.4:11010
```

Every additional node must use the same network identity and a unique virtual
IP address.

## Transport Modes

### TCP/UDP fallback

Selecting TCP or UDP enables listeners for both protocols. When a peer is
entered without a scheme, XRayMesh creates TCP and UDP connection paths so
EasyTier can use the working route.

Open the selected port for both TCP and UDP.

### WSS only

Selecting WSS creates only WSS listeners and peer connections:

```text
wss://1.2.3.4:11010
```

WSS carries mesh traffic over TLS/TCP. Open the selected port as TCP.

### QUIC only

Selecting QUIC creates only QUIC listeners and peer connections:

```text
quic://1.2.3.4:11010
```

QUIC carries mesh traffic over UDP. Open the selected port as UDP.

## Multiple Peers

Enter peer addresses as a comma-separated list:

```text
1.2.3.4:11010,5.6.7.8:11010
```

Multiple peers improve availability and allow a node to join through more than
one reachable server.

## Monitoring and Diagnostics

The dashboard shows:

- Service and EasyTier status
- Physical server IPv4 and IPv6 addresses
- Virtual mesh IP and network name
- Active transport and connected peers
- Peer latency, traffic, route cost, and tunnel protocol

Live Status updates the data panel in place once per second without clearing or
redrawing the full terminal. Press `q` or `Ctrl+C` to return to the main menu.

The main menu uses a non-refreshing peer snapshot with the online peer count,
average latency, total RX/TX traffic, and last-check time. This keeps menu input
stable while detailed monitoring remains available in Live Status.

The diagnostics section checks local listeners, EasyTier peer-center state, and
recent handshake, timeout, and connection errors. Live systemd logs and the
EasyTier routing table are also available from the menu.

## HAProxy TCP Tunnels

XRayMesh can create TCP port-forwarding tunnels from the current server to an
existing EasyTier node. The manager automatically suggests nodes discovered in
the EasyTier peer list, while also allowing a virtual IP to be entered manually.

Ports can be entered individually, as a comma-separated list, as a range, or as
a combination:

```text
22
80,443
8000-8010
22,80,443,8000-8010
```

Each listening port is forwarded to the same port on the selected destination
node. Tunnel definitions can be listed, edited, or deleted from the HAProxy
submenu. XRayMesh validates the generated configuration before restarting its
dedicated `xraymesh-haproxy.service`.

HAProxy tunnels in XRayMesh support **TCP only**. Standard HAProxy does not
provide generic UDP port forwarding. QUIC support in HAProxy is not equivalent
to forwarding arbitrary UDP applications.

## iptables TCP/UDP Tunnels

XRayMesh can forward raw TCP, UDP, or both from a selected local interface to an EasyTier virtual IP. Each tunnel stores its destination mesh IP, protocol, port list/ranges, inbound interface, and allowed source IPv4/CIDR. Rules are isolated in `XRAYMESH_DNAT`, `XRAYMESH_FWD`, and `XRAYMESH_SNAT` chains.

The manager enables IPv4 forwarding and applies DNAT + FORWARD + MASQUERADE so replies return through the relay instead of escaping through the destination node's default route. Because MASQUERADE is used, the destination service sees the relay's mesh-side source address rather than the original client address. The forwarding rules support arbitrary UDP applications such as Hysteria2/QUIC as well as TCP services.

Tunnel definitions are preserved when the mesh node is deleted and re-applied after the mesh is configured again. Use the source CIDR prompt to restrict who can reach a forwarded service.

## Web UI Dashboard & In-Mesh Speedtest

XRayMesh includes a standalone, zero-dependency Web UI Dashboard designed for real-time monitoring and network performance benchmarking:

- **Live Mesh Monitoring:** Real-time visibility into EasyTier connected peers, latency badges, route costs, RX/TX traffic, and host server CPU/RAM/uptime.
- **In-Mesh Speedtest (iperf3):**
  - **TCP Mode:** Measures maximum end-to-end throughput (Mbps), bytes transferred, and TCP retransmits across the encrypted mesh.
  - **UDP Mode:** Evaluates network quality, jitter (ms), and packet loss percentage (%), critical for gaming and latency-sensitive protocols such as Hysteria2.
- **Interactive Ping Diagnostics:** Runs multi-packet ping tests to any mesh IP with min, average, max latency and loss percentage.
- **Tunnels Overview:** Displays configured HAProxy and iptables forwarding tunnels.

### Access & Authentication

1. **One-Click Quick Login (Recommended):**
   Generate a temporary, one-click login link on the server:
   ```bash
   sudo ./xraymesh.sh token
   ```
   This generates a secure URL such as `http://<SERVER_IP>:11080/?token=...` valid for 60 minutes. Opening this link in any browser logs you in instantly and sets a persistent session.

2. **Admin Password Login:**
   Set an admin password using option `5` in the Web sub-menu (`sudo ./xraymesh.sh web`) to enable regular password login.

## Commands

```text
sudo ./xraymesh.sh menu       Open the interactive manager
sudo ./xraymesh.sh install    Install and configure a node
sudo ./xraymesh.sh status     Show node and peer status
sudo ./xraymesh.sh peers      Show connected peers
sudo ./xraymesh.sh routes     Show the mesh routing table
sudo ./xraymesh.sh logs       Stream service logs
sudo ./xraymesh.sh update     Update EasyTier
sudo ./xraymesh.sh delete     Delete the current mesh node
sudo ./xraymesh.sh haproxy    Manage HAProxy TCP tunnels
sudo ./xraymesh.sh iptables   Manage iptables TCP/UDP tunnels
sudo ./xraymesh.sh web        Manage Web Dashboard and speedtest services
sudo ./xraymesh.sh token      Generate a one-click login URL for the Web UI
sudo ./xraymesh.sh self-test  Validate the installation and active services
sudo ./xraymesh.sh start      Start the node
sudo ./xraymesh.sh stop       Stop the node
sudo ./xraymesh.sh restart    Restart the node
```

## Delete vs. Uninstall

- **Delete mesh configuration** removes the current node service and private
  configuration while keeping XRayMesh and EasyTier installed.
- **Uninstall XRayMesh completely** removes the configuration, service,
  application files, and EasyTier binaries.

## Troubleshooting Missing Peers

If only the local node appears:

1. Verify that every node uses the exact same network name and secret.
2. Verify that every node has a unique virtual IP.
3. Confirm that the peer contains a reachable public IP and correct port.
4. Open the port in UFW and the VPS provider firewall.
5. For WSS, allow TCP; for QUIC, allow UDP; for fallback mode, allow both.
6. Open **Connection diagnostics** and inspect recent handshake errors.

## Files and Security

- Application: `/opt/xraymesh`
- Private configuration: `/etc/xraymesh/config.env`
- systemd service: `/etc/systemd/system/xraymesh.service`
- HAProxy definitions: `/etc/xraymesh/haproxy-tunnels`
- HAProxy service: `/etc/systemd/system/xraymesh-haproxy.service`
- iptables definitions: `/etc/xraymesh/iptables-tunnels`
- iptables service: `/etc/systemd/system/xraymesh-iptables.service`
- IPv4 forwarding sysctl: `/etc/sysctl.d/99-xraymesh-forwarding.conf`

The private configuration is stored with `600` permissions. Keep the network
secret private, use a different virtual IP for every node, and expose only the
required mesh port.

## EasyTier Updates

XRayMesh queries the official GitHub Releases API and downloads the latest
stable EasyTier release. If the API is temporarily unavailable, it uses
`v2.6.4` as a known stable fallback.

## License

Copyright © 2026 ErfanXRay. All Rights Reserved.

XRayMesh is source-available for personal and internal use. Republishing,
mirroring, rebranding, selling, or distributing this project or a modified
version in another repository is prohibited without prior written permission
from ErfanXRay. See the [XRayMesh Source-Available License](LICENSE).

Security issues should be reported privately as described in
[SECURITY.md](SECURITY.md). Release history is available in
[CHANGELOG.md](CHANGELOG.md).

EasyTier is an independent third-party project and remains subject to its own
license.
