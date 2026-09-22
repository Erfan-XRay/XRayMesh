<p align="center">
  <img src="assets/logo.svg" alt="XRayMesh Logo" width="130" height="130" />
</p>

<h1 align="center">XRayMesh</h1>

<p align="center">
  <strong>Next-Generation Mesh Network Manager & Web Dashboard for Linux Servers</strong><br>
  Built on <a href="https://github.com/EasyTier/EasyTier">EasyTier</a>, Multi-Backend Port Forwarding Tunnels, and SafeSync Cluster Automation.
</p>

<p align="center">
  <a href="https://github.com/Erfan-XRay/XRayMesh/releases/tag/v2.1.0"><img src="https://img.shields.io/badge/version-2.1.0-blue.svg?style=flat-square" alt="Version 2.1.0" /></a>
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="MIT License" />
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
- **Multiple Transports:** Dual TCP/UDP fallback, strict WSS (WebSocket over TLS), and QUIC.
- **Mesh Accel:** Automatic multi-path peer routing and optional KCP transport acceleration for high-loss links.
- **Service Resilience:** Managed systemd services with auto-recovery and health watchdogs.

### 💻 Modern Web UI Dashboard
- **Real-Time Monitoring:** Live peer topology, latency badges, route cost, real-time RX/TX traffic, and host CPU/RAM/load stats.
- **Node Highlight:** Current local node is clearly identified and pinned at the top of the cluster list.
- **Streamlined Node Configuration:** Segmented sub-tabs (*Identity*, *Transport & Protocol*, *Cluster Invite*, and *Danger Zone*) for clutter-free node management.
- **In-Mesh Speedtest Suite:** Integrated **iperf3** TCP throughput benchmarking and UDP jitter/packet loss analysis across the encrypted mesh.
- **Interactive Ping Diagnostics:** Real-time multi-packet ping diagnostics directly between mesh peers.
- **Cyber Aesthetic & Mobile-Optimized:** 5 futuristic theme palettes (Cyber Cyan, Emerald Matrix, Neon Purple, Amber Gold, Midnight Blue) with responsive mobile drawer navigation and full English/Persian RTL support.

### 🛡️ Multi-Backend Port Forwarding Tunnels
- **HAProxy Tunnels:** High-throughput TCP proxying with connection pooling and health checks.
- **Realm Tunnels:** Ultra-lightweight, memory-efficient Rust forwarding for TCP and UDP.
- **GOST v3 Tunnels:** Versatile multi-protocol forwarding engine with user-space reliability.
- **iptables Kernel Forwarding:** Native Linux kernel-level DNAT + MASQUERADE for lowest possible latency on TCP and UDP applications (e.g. Hysteria2, WireGuard).
- Flexible port specifications: single ports (`443`), lists (`80,443,8080`), and port ranges (`8000-8020`).

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

| Command | Description |
| :--- | :--- |
| `xraymesh` | Open the interactive terminal manager |
| `xraymesh menu` | Open the interactive terminal manager |
| `xraymesh token` | Generate a fresh 1-hour one-click Web UI login URL |
| `xraymesh status` | Show real-time node, peer, and service status |
| `xraymesh peers` | Show connected peers and live latency |
| `xraymesh routes` | Show EasyTier mesh routing table |
| `xraymesh logs` | View live systemd logs for the mesh daemon |
| `xraymesh web` | Manage Web UI service, ports, and SSL certificates |
| `xraymesh haproxy` | Manage HAProxy TCP forwarding tunnels |
| `xraymesh realm` | Manage Realm TCP/UDP forwarding tunnels |
| `xraymesh gost` | Manage GOST v3 forwarding tunnels |
| `xraymesh iptables`| Manage Linux kernel iptables forwarding tunnels |
| `xraymesh update` | Update core CLI, Web UI assets, and EasyTier binaries |
| `xraymesh restart` | Restart XRayMesh daemon |
| `xraymesh stop` | Stop XRayMesh daemon |
| `xraymesh uninstall` | Completely remove XRayMesh, configs, and binaries |

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

## License

This project is licensed under the [MIT License](LICENSE).  
EasyTier is licensed under its respective open-source license.

Created and maintained by [ErfanXRay](https://github.com/Erfan-XRay).
