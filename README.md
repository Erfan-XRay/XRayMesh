<p align="center">
  <img src="assets/logo.svg" alt="XRayMesh logo" width="128" height="128" />
</p>

<h1 align="center">XRayMesh</h1>

<p align="center">
  <strong>Next-Generation Mesh Network Manager & Web Dashboard for Linux Servers</strong><br>
  Built on <a href="https://github.com/EasyTier/EasyTier">EasyTier</a>, Multi-Backend Port Forwarding Tunnels, and SafeSync Cluster Automation.
</p>

<p align="center">
  <a href="https://github.com/Erfan-XRay/XRayMesh/releases/tag/v3.0.6"><img src="https://img.shields.io/badge/version-3.0.6-2dd4bf.svg?style=flat-square" alt="Version 3.0.6" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Source--Available-red.svg?style=flat-square" alt="Source-Available License" /></a>
  <img src="https://img.shields.io/badge/EasyTier-v2.6.4-cyan.svg?style=flat-square" alt="EasyTier core" />
  <img src="https://img.shields.io/badge/platform-Debian%20%7C%20Ubuntu-orange.svg?style=flat-square" alt="Supported OS" />
  <img src="https://img.shields.io/badge/arch-x86__64%20%7C%20aarch64%20%7C%20armv7-purple.svg?style=flat-square" alt="Architecture" />
</p>

<p align="center">
  <strong>English</strong> | <a href="README_FA.md">فارسی (Persian)</a>
</p>

---

XRayMesh joins your Linux servers into one encrypted private network with [EasyTier](https://github.com/EasyTier/EasyTier), forwards ports between them, and gives you a web panel to run it all, in English or Persian.

<p align="center">
  <a href="https://erfan-xray.github.io/XRayMesh/"><strong>📖 Read the documentation</strong></a>
  &nbsp;·&nbsp;
  <a href="https://erfan-xray.github.io/XRayMesh/fa/">مستندات فارسی</a>
</p>

## Features

- **Private mesh:** every server gets a private address like `10.144.144.2` and reaches the others directly, encrypted.
- **Nine transports:** TCP, UDP, WebSocket (with or without TLS), QUIC, FakeTCP, and ICMP or PCK links powered by [BackPack](https://github.com/AminMGMT/BackPack) for networks where little else gets through.
- **Web panel:** live peers, latency and traffic, ping and speed tests between any two servers, light and dark themes, installable on your phone.
- **Port forwarding:** Realm, HAProxy, GOST or kernel iptables, from single ports to whole ranges.
- **SafeSync:** change shared settings on every server at once, with an automatic rollback if a server loses its peers.
- **Secure by default:** one-time login links, optional password-free sign-in, rate limiting and free HTTPS with Let's Encrypt.

## Quick install

On each Debian or Ubuntu server, as `root`:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/main/xraymesh.sh)
```

Open the login link it prints, create a mesh on the first server, and join the others with its invite code. The [getting started guide](https://erfan-xray.github.io/XRayMesh/start/introduction/) walks through every step.

## Documentation

| Section | What's inside |
| :--- | :--- |
| [Getting started](https://erfan-xray.github.io/XRayMesh/start/introduction/) | Requirements, installation, first sign-in, creating a mesh and adding servers |
| [Guides](https://erfan-xray.github.io/XRayMesh/guides/tunnels/) | Port forwarding, transports, SafeSync, updates, security, ping and speed test |
| [Terminal commands](https://erfan-xray.github.io/XRayMesh/reference/cli/) | Every `xraymesh` command |
| [Troubleshooting](https://erfan-xray.github.io/XRayMesh/troubleshooting/) | Fixes for the most common problems |

Looking for the terminal-only **v1.x**? It stays available at [v1.7.0](https://github.com/Erfan-XRay/XRayMesh/tree/v1.7.0).

## Support the project

XRayMesh is free for personal use. If it helps you, you can support its development. Send each coin **only on the network shown**; coins sent on another network are lost.

**USDT** on **TRC20 (Tron)**

```text
TKM87mEXhUpEBzqvNxs1qjM4EddX6VMXmw
```

**Gram (TON)** on **TON**

```text
UQDfjT-h4ENIrt_Sq5-zBy9TvhckniwSLCkS7zIVX4fVSaFw
```

**Bitcoin (BTC)**

```text
bc1qc4cgy5etuwj2375c5zqma7xmjtk59s5s49rfp5
```

QR codes are on the [support page](https://erfan-xray.github.io/XRayMesh/support/). A ⭐ on GitHub helps too.

---

## License & Intellectual Property

Copyright (c) 2026 ErfanXRay. All Rights Reserved.

This project is protected under the **[XRayMesh Source-Available License](LICENSE)**.

- **Permitted:** Free for personal, non-commercial, and internal server usage.
- **Strictly Prohibited:** You may **not** copy, redistribute, mirror, fork, or republish this project or any derivative work under another author, developer, brand, or repository name without prior written permission from ErfanXRay.
- Commercial monetization and white-label rebranding are strictly prohibited.
- Third-party components (such as EasyTier and [BackPack](https://github.com/AminMGMT/BackPack), AGPL-3.0) remain subject to their respective licenses.

Created and maintained with passion by [ErfanXRay](https://github.com/Erfan-XRay).
