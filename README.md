# XRayMesh

A modern command-line manager for building and monitoring Linux server mesh
networks, powered by [EasyTier](https://github.com/EasyTier/EasyTier).

Developed by **ErfanXRay**

## Features

- Automatically downloads the latest stable EasyTier release
- Supports `x86_64`, `aarch64`, `armv7`, and `i686`
- Creates encrypted mesh networks with multiple peers
- Installs a hardened systemd service with automatic restart
- Provides a clean dashboard with live peer, route, and journal information
- Displays an XRayMesh FIGlet banner with a built-in fallback logo
- Handles Ctrl+C safely by returning from the current screen to the main menu
- Exits immediately when Ctrl+C is pressed on the main menu
- Shows the server IPv4 addresses and IPv6 addresses when available
- Supports node reconfiguration, core updates, and safe removal
- Shows newly generated network secrets before setup continues
- Can delete only the mesh service/configuration without uninstalling XRayMesh
- Offers a fully English interactive interface and automation-friendly commands

## Requirements

- Debian or Ubuntu
- Root access
- A system using systemd
- An open firewall port for the selected mesh protocol

## Installation

Download the script and run:

```bash
chmod +x xraymesh.sh
sudo ./xraymesh.sh
```

The interactive menu can install EasyTier, configure the node, display connected
peers, inspect routes, stream service logs, and manage the service.

## Connecting Multiple Servers

On the first server, leave the peer address field empty. On every additional
server, enter the public address of the first server:

```text
1.2.3.4:11010
```

Every node must use the same **network name** and **network secret**. Each node
must have a unique virtual IPv4 address. For example:

- First node: `10.144.144.1`
- Second node: `10.144.144.2`
- Third node: `10.144.144.3`

Open the selected port in both the operating-system firewall and the VPS
provider firewall for **both TCP and UDP**. XRayMesh listens on both protocols
and automatically tries both for peers without an explicit protocol. This is
useful when UDP is restricted between domestic and international networks.

### Transport Behavior

- Selecting **TCP** or **UDP** enables the TCP + UDP reliability fallback.
- Selecting **WSS** enables strict WSS mode. Only a WSS listener and WSS peer
  connections are created; TCP/UDP fallback is disabled.
- Selecting **QUIC** enables strict QUIC mode. Only a QUIC listener and QUIC
  peer connections are created; TCP/UDP fallback is disabled.

In strict mode, XRayMesh enforces the selected transport even when a peer is
entered without a scheme. For example, selecting QUIC and entering
`1.2.3.4:11010` produces `quic://1.2.3.4:11010`.

WSS uses TCP, so its port must be allowed as TCP. QUIC uses UDP, so its port
must be allowed as UDP.

Multiple peers can be entered as a comma-separated list:

```text
1.2.3.4:11010,5.6.7.8:11010
```

You may include an explicit protocol when needed:

```text
udp://1.2.3.4:11010,tcp://5.6.7.8:11010
```

## Commands

```text
sudo ./xraymesh.sh menu       Open the interactive menu
sudo ./xraymesh.sh install    Install and configure a node
sudo ./xraymesh.sh status     Show the dashboard and peers
sudo ./xraymesh.sh peers      Show connected peers
sudo ./xraymesh.sh routes     Show the routing table
sudo ./xraymesh.sh logs       Stream service logs
sudo ./xraymesh.sh update     Update the EasyTier core
sudo ./xraymesh.sh delete     Delete the current mesh configuration
sudo ./xraymesh.sh start      Start the service
sudo ./xraymesh.sh stop       Stop the service
sudo ./xraymesh.sh restart    Restart the service
```

## Delete vs. Uninstall

The interactive menu provides two separate removal operations:

- **Delete mesh configuration** stops the current node and removes its systemd
  service, private configuration, and runner. XRayMesh and EasyTier remain
  installed, so a new node can be created later.
- **Uninstall XRayMesh completely** removes the mesh configuration, service,
  application files, and installed EasyTier binaries.

Deletion requires typing `DELETE`; complete uninstallation requires typing
`REMOVE`.

## Troubleshooting Missing Peers

If the peer list only shows the local server:

1. Confirm that the network name is identical on every server.
2. Confirm that the network secret is identical on every server.
3. Assign a different virtual IP to each node.
4. Open the configured port for both TCP and UDP in UFW and the provider panel.
5. Enter the public IP of at least one reachable node in the peer field.
6. Select **Connection diagnostics** from the XRayMesh menu.

The diagnostics page shows local listeners, EasyTier peer-center information,
and recent handshake or connection errors.

## Files

- Application files: `/opt/xraymesh`
- Private configuration: `/etc/xraymesh/config.env`
- systemd unit: `/etc/systemd/system/xraymesh.service`

The configuration file contains the shared network secret and is stored with
`600` permissions.

## EasyTier Version

XRayMesh queries the official GitHub Releases API during installation and
downloads the latest stable EasyTier release. If the API is temporarily
unavailable, it uses `v2.6.4` as a known stable fallback.

## Security Notes

- Use a long, unique network secret.
- Do not publish `/etc/xraymesh/config.env`.
- Expose only the selected mesh port.
- Keep both XRayMesh and EasyTier updated.
- Use unique virtual IP addresses across all nodes.

## License

XRayMesh is distributed under the MIT License. EasyTier is an independent
project distributed under the LGPL-3.0 License.
