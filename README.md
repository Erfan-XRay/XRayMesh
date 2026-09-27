<p align="center">
  <img src="assets/logo.svg" alt="XRayMesh logo" width="128" height="128" />
</p>

<h1 align="center">XRayMesh</h1>

<p align="center">
  <strong>Next-Generation Mesh Network Manager & Web Dashboard for Linux Servers</strong><br>
  Built on <a href="https://github.com/EasyTier/EasyTier">EasyTier</a>, Multi-Backend Port Forwarding Tunnels, and SafeSync Cluster Automation.
</p>

<p align="center">
  <a href="https://github.com/Erfan-XRay/XRayMesh/releases/tag/v3.0.5"><img src="https://img.shields.io/badge/version-3.0.5-2dd4bf.svg?style=flat-square" alt="Version 3.0.5" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Source--Available-red.svg?style=flat-square" alt="Source-Available License" /></a>
  <img src="https://img.shields.io/badge/EasyTier-v2.6.4-cyan.svg?style=flat-square" alt="EasyTier core" />
  <img src="https://img.shields.io/badge/platform-Debian%20%7C%20Ubuntu-orange.svg?style=flat-square" alt="Supported OS" />
  <img src="https://img.shields.io/badge/arch-x86__64%20%7C%20aarch64%20%7C%20armv7-purple.svg?style=flat-square" alt="Architecture" />
</p>

<p align="center">
  <strong>English</strong> | <a href="README_FA.md">فارسی (Persian)</a>
</p>

---

## Overview

**XRayMesh** is a comprehensive, production-grade mesh network and traffic forwarding manager for Linux servers. It enables seamless, encrypted, multi-server interconnectivity using **EasyTier**, paired with a rich, responsive **Web UI Dashboard**, automated multi-tunnel orchestration (HAProxy, Realm, GOST v3, and iptables), and cluster-wide configuration synchronization with safety watchdogs.

Developed with passion by **ErfanXRay**.

---

## Key Features

### 🌐 Zero-Config Mesh Networking
- Connects distributed VPS and dedicated servers into an encrypted private mesh network (`10.144.144.0/24`).
- **Nine Transports:** Dual TCP/UDP, UDP, TCP, WS, WSS (WebSocket over TLS), QUIC, FakeTCP, and the new **ICMP** and **PCK** links powered by [BackPack](https://github.com/AminMGMT/BackPack). See [Mesh Transport Protocols](#mesh-transport-protocols).
- **Private Mesh:** Nodes accept only servers that share your network secret, so nobody else can use your server as a free EasyTier relay.
- **Multi-Thread Mode:** Runs EasyTier on more than one CPU core for higher throughput (on by default for new servers).
- **Mesh Accel:** Automatic multi-path peer routing and optional KCP transport acceleration for high-loss links.
- **Service Resilience:** Managed systemd services with auto-recovery and health watchdogs.

### 💻 Modern Web UI Dashboard
- **Real-Time Monitoring:** Live peer topology, latency badges, route cost, real-time RX/TX traffic, and host CPU/RAM/load stats.
- **Node Highlight:** Current local node is clearly identified and pinned at the top of the cluster list.
- **Streamlined Node Configuration:** Segmented sub-tabs (*Identity*, *Transport & Protocol*, *Cluster Invite*, and *Danger Zone*) for clutter-free node management.
- **In-Mesh Speedtest Suite:** Integrated **iperf3** TCP throughput benchmarking and UDP jitter/packet loss analysis across the encrypted mesh.
- **Interactive Ping Diagnostics:** Real-time multi-packet ping diagnostics directly between mesh peers.
- **Firouzeh Design & Mobile-Optimized:** Several color palettes with light and dark modes, an animated ambient background, a phone bottom bar, and full English/Persian RTL support.
- **Installable Web App:** Add the dashboard to your home screen (iOS Safari or Android Chrome) and it opens full-screen with its own icon.
- **Updates From the Panel:** Update any server in the mesh from the dashboard, with verification and automatic rollback. Updates always come from the stable `main` branch.

### 🛡️ Multi-Backend Port Forwarding Tunnels
- **HAProxy Tunnels:** High-throughput TCP proxying with connection pooling and health checks.
- **Realm Tunnels:** Ultra-lightweight, memory-efficient Rust forwarding for TCP and UDP.
- **GOST v3 Tunnels:** Versatile multi-protocol forwarding engine with user-space reliability.
- **iptables Kernel Forwarding:** Native Linux kernel-level DNAT + MASQUERADE for lowest possible latency on TCP and UDP applications (e.g. Hysteria2, WireGuard).
- Flexible port specifications: single ports (`443`), lists (`80,443,8080`), port ranges (`8000-8020`), and listen-to-target mappings (`1234:443`, `1000-1002:2000-2002`). Legacy entries still map each port to itself.

### ⚡ Cluster SafeSync (Inter-Node Synchronization)
- Sync mesh configuration updates to all cluster nodes simultaneously.
- **Automated Safety Watchdog:** If a configuration change causes a node to lose connection to its peers, a 90-second hardware watchdog automatically rolls back to the previous known-good backup.
- HMAC-SHA256 authenticated inter-node communication.

### 🔐 Hardened Authentication & Security
- **One-Click Instant Login:** Generate temporary CLI tokens (`sudo xraymesh token`) for instant browser access without typing passwords.
- **Address Bar Sanitization:** Tokens are immediately scrubbed from the browser URL history on login to prevent accidental exposure.
- **Brute-Force Rate Limiter:** Protects web login with strict attempt limiting (HTTP 429) per IP.
- **Secure Cookie Flag:** Dynamically appends `; Secure` to session cookies when HTTPS/SSL is active.
- **UFW Firewall Auto-Allow:** Detects active UFW firewalls and automatically opens required web and mesh communication ports.

---

## Mesh Transport Protocols

Pick the protocol under **Node Config → Transport & Protocol** in the panel, or in the terminal node setup. Every server in the mesh uses the same protocol, and an invite code carries it to the servers that join.

| Protocol | Best for |
| :--- | :--- |
| `dual` | Listens on TCP and UDP and picks the faster path automatically. A good default. |
| `udp` | Lowest latency. Needs UDP open on every server. |
| `tcp` | Networks where UDP is blocked or throttled. |
| `ws` | Wraps traffic in WebSocket frames to get past DPI. No certificate needed. |
| `wss` | WebSocket inside TLS, so traffic looks like HTTPS. No domain or certificate needed: EasyTier makes its own (the SSL certificate from `xraymesh ssl` is only for the web panel). Servers connect by IP, so it does not work behind a CDN. |
| `quic` | QUIC with BBR congestion control and automatic TCP fallback. |
| `faketcp` | Makes UDP look like TCP to avoid ISP UDP throttling. Links are made only to the peers you add. |
| `icmp` | **New in 3.0, powered by BackPack.** Carries the mesh inside ping packets, for networks where only ICMP gets through. |
| `pck` | **New in 3.0, powered by BackPack.** Carries the mesh inside TCP segments built without the kernel's TCP stack, for routes where normal TCP connects but then stalls, resets or gets throttled. |

### ICMP and PCK, powered by BackPack

The ICMP and PCK transports come from **[BackPack](https://github.com/AminMGMT/BackPack)**, a project by Amin Mohammadi ([AminMGMT](https://github.com/AminMGMT)). XRayMesh downloads the official BackPack release (pinned to one version and checked against its SHA-256 checksums) and runs it unmodified under its AGPL-3.0 license. BackPack builds an encrypted point-to-point link between two servers, and EasyTier runs the mesh across that link.

- **ICMP** (BackPack's xDi carrier) hides the traffic inside ping packets.
- **PCK** (BackPack's pck carrier) sends real-looking TCP segments without a kernel TCP connection. The joining server connects to a TCP port on the inviting server, so open that port in the provider's firewall. Create the invite on the server abroad and join from the server in Iran.

How to connect servers over ICMP or PCK:
1. On the main server, set the protocol to `icmp` or `pck` and open **Peers & invite**.
2. Each invite code connects **one** server. Paste it under **Join an existing mesh** on that server (or run `xraymesh join`).
3. When the server shows up under **Servers**, press **New code** for the next one.

`xraymesh link-list` shows the links and their packet counters, and `xraymesh link-delete <name>` removes one. BackPack encrypts each link, but servers that joined over links also reach each other directly over plain UDP, so turn mesh encryption off only in a two-server mesh. These transports are experimental.

Many thanks to Amin Mohammadi for BackPack. If ICMP or PCK helps you, please give [BackPack](https://github.com/AminMGMT/BackPack) a star.

---

## Quick Installation

Run the following command on any Debian or Ubuntu server:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/main/xraymesh.sh)
```

During installation:
1. XRayMesh automatically downloads and verifies the latest EasyTier core for your server architecture (`x86_64`, `aarch64`, `armv7`, `i686`).
2. You can enable free automated SSL/TLS (HTTPS) if you have a domain pointed to your server.
3. You can set a fixed admin password or choose **Token-Only Mode** (highest security, immune to password brute-force).
4. A 1-hour **One-Click Login URL** is displayed to open the Web UI instantly.

To launch the terminal management menu at any time, run:
```bash
xraymesh
```

---

## Connecting Two Nodes (Step-by-Step)

### Server 1 (First Node)
1. In the Web UI (or terminal `xraymesh`), configure the node:
   - **Network Name:** e.g. `xraymesh`
   - **Network Secret:** (auto-generated)
   - **Virtual IP:** e.g. `10.144.144.1`
   - **Protocol:** `dual` (TCP/UDP)
   - **Peers:** Leave empty.
2. In the **Node Config** tab, copy the generated **One-Click Invite Token** (`xrmesh://...`).

### Server 2 (Second Node)
1. Open Server 2's Web UI.
2. Under **Node Config**, paste the `xrmesh://...` token into the **One-Click Invite Code** field.
3. Network name, secret, protocol, and peer address are auto-populated.
4. Assign a unique IP (e.g. `10.144.144.2`) and click **Save & Start Node**.
5. Within seconds, both servers appear in each other's **Peers** tab with live latency and traffic metrics!

---

## CLI Commands Reference

All forwarding tunnels (HAProxy, Realm, GOST, iptables) and SafeSync cluster actions are managed directly from the Web UI Dashboard. The terminal CLI provides the following core operational commands:

| Command | Description |
| :--- | :--- |
| `xraymesh` | Open the interactive terminal manager menu |
| `xraymesh token` | Generate a fresh 1-hour one-click Web UI login URL |
| `xraymesh password` | Configure or update the Web Admin password |
| `xraymesh port` | Change the Web Dashboard HTTP/HTTPS port |
| `xraymesh ssl` | Configure free automated SSL/TLS (HTTPS) with a domain |
| `xraymesh remove-ssl` | Revert Web Dashboard back to plain HTTP |
| `xraymesh join` | Join an existing mesh network using invite code (`xrmesh://...`) |
| `xraymesh invite` | Display mesh invite code to connect other servers to this mesh |
| `xraymesh status` | Show real-time node, mesh, and Web UI status summary |
| `xraymesh peers` | Show connected peers and live latency via EasyTier CLI |
| `xraymesh routes` | Show the EasyTier mesh routing table |
| `xraymesh logs` | View live systemd logs for the mesh daemon |
| `xraymesh link-list` | Show ICMP/PCK links (BackPack) and their packet counters |
| `xraymesh link-delete` | Delete one ICMP/PCK link by name (e.g. `out-1234`) |
| `xraymesh tunnels` | Show saved tunnels, their ports and service state, even when the panel is down |
| `xraymesh tunnels-stop` | Stop all tunnels and keep them off after a reboot (saved tunnels are kept) |
| `xraymesh tunnels-apply` | Start the saved tunnels again |
| `xraymesh self-test` | Run diagnostic tests on local services and connectivity |
| `xraymesh start` | Start or apply node configuration and start all services |
| `xraymesh restart` | Restart all XRayMesh services |
| `xraymesh stop` | Stop all XRayMesh services |
| `xraymesh update` | Update core CLI, Web UI assets, and EasyTier binaries |
| `xraymesh delete` | Delete node configuration while preserving binaries |
| `xraymesh uninstall` | Completely remove XRayMesh, configs, and binaries |
| `xraymesh version` | Display installed XRayMesh version |
| `xraymesh help` | Display CLI commands reference and usage |

---

## 📦 Legacy CLI-Only Version (v1.x)

If you prefer a minimal, terminal-only manager without the Web UI daemon or background Python services, the legacy **v1.x** release is permanently archived:

- **Legacy GitHub Release:** [v1.7.0 (CLI-Only)](https://github.com/Erfan-XRay/XRayMesh/tree/v1.7.0)
- **Install Legacy v1.7.0 Command:**
  ```bash
  bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/v1.7.0/xraymesh.sh)
  ```

---

## System Requirements

- **Operating System:** Debian 11+, Debian 12, Ubuntu 20.04, Ubuntu 22.04, Ubuntu 24.04
- **Privileges:** Root access (`sudo`)
- **Init System:** systemd
- **Dependencies:** `curl`, `iproute2`, `python3` (all automatically verified and installed by the script)

---

## License & Intellectual Property

Copyright (c) 2026 ErfanXRay. All Rights Reserved.

This project is protected under the **[XRayMesh Source-Available License](LICENSE)**.

- **Permitted:** Free for personal, non-commercial, and internal server usage.
- **Strictly Prohibited:** You may **not** copy, redistribute, mirror, fork, or republish this project or any derivative work under another author, developer, brand, or repository name without prior written permission from ErfanXRay.
- Commercial monetization and white-label rebranding are strictly prohibited.
- Third-party components (such as EasyTier and [BackPack](https://github.com/AminMGMT/BackPack), AGPL-3.0) remain subject to their respective licenses.

Created and maintained with passion by [ErfanXRay](https://github.com/Erfan-XRay).
