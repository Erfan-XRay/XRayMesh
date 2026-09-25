# Changelog

All notable XRayMesh changes are documented here.

## [2.2.6-beta.7] - 2026-09-25

### Changed
- New releases are picked up within 5 minutes instead of 15.
- The Refresh button now checks GitHub for updates again right away (`GET /api/version?refresh=1`).

### Fixed
- A server that could not reach GitHub reported itself as "Up to date" for 15 minutes. It now keeps its last good answer, or shows "Couldn't check for updates", and retries within a minute. Every server reports this state to the rest of the mesh.

## [2.2.6-beta.6] - 2026-09-25

### Added
- Tunnels tab scope switch: this server (default), all servers, or a single server. The choice is remembered per browser.
- Per-server health strip in the Tunnels tab with status, tunnel count, latency or data age, and a retry button for servers that did not respond.
- Tunnel search by name, destination, port or server.
- New endpoints `GET /api/tunnels?node=<ip|local>` (one server's tunnels plus its status) and `GET /api/tunnels/nodes`.

### Changed
- Tunnels load server by server instead of in one blocking request, so a slow or lossy server only delays its own tunnels.
- Remote tunnel lists are fetched with a retry (known port first, then a wider port search), and the last good list is kept. A server that stops responding shows its cached tunnels marked as cached and read-only until it reconnects, instead of its tunnels silently disappearing.
- The combined `GET /api/tunnels` now has an 8 second overall deadline and reports each server's status.
- Redesigned tunnel cards and sections, fully translated and RTL-safe. New tunnels default their origin to the server the view is scoped to, and unreachable servers are flagged in the origin list.

### Fixed
- Loading network interfaces of a remote server used only the first character of its IP.

## [2.2.6-beta.5] - 2026-09-25

### Added
- One-click update for any server in the mesh, from any panel. Progress is shown live (downloading, verifying, installing, restarting), and the result is reported back: updated, already up to date, or failed with the reason.
- Safe self-updater (`xraymesh update` and `node-update`): every file is downloaded to a staging directory and must parse and carry exactly the target release version before anything is replaced, so lagging mirrors can never mix two releases. The current files are backed up, a lock prevents two updates at once, and if the web panel or mesh service is not healthy within 45 seconds the previous version is restored automatically.
- Update channels: each server can opt into beta updates, with a clear warning, from its own panel or from any other panel in the mesh. Switching back to stable never downgrades; the server waits for the next newer stable release.
- `index.html` now carries a `xraymesh-version` marker injected at build time, used by the updater to verify the web UI.

### Changed
- Redesigned Peers & Nodes: a "This server" card with version, update and beta switch, and a clean server list (connection type, latency quality, traffic, version and channel) with search and filters for updates and relayed peers. Fully translated and RTL-safe.
- Each server now reports its own channel, latest release and update job, so update availability is always judged against that server's own channel.
- The update banner links to the Peers tab instead of copying a terminal command.
- Redesigned sign-in page: full-screen layout with ambient background, animated password/token switch, show/hide password, Caps Lock warning, token paste button, inline errors, and language and theme switches before sign-in.

### Fixed
- Older servers are updated through their legacy updater, with success detected from the version change; failures that the panel cannot fix offer the terminal command as a fallback.
- Changing the update channel now applies immediately instead of after a web service restart.
- Unreachable peers are re-probed after 15 seconds instead of showing an unknown version for a full minute.

## [2.2.6-beta.4] - 2026-09-25

### Changed
- Redesigned the Node Config tab. The 3-step wizard and the 4 manual sub-tabs are replaced by a two-step setup (join an existing mesh or create a new one) and, once configured, a compact service header with two tabs: Settings and Peers & invite.
- Settings is one form with a single sticky save bar that only appears when something changed. "Apply to all servers" (SafeSync) is offered when only shared settings changed.
- Joining another mesh from a configured node now shows a confirmation that compares the current and new configuration. On confirm, the old network settings, secret, protocol and peers are replaced. The server name, listen port and tunnels are kept.
- Invite codes now carry the mesh's transport settings (encryption, KCP, IPv6, MTU) so joining nodes match the mesh. Older codes still work.
- All Node Config text is translated (English and Persian) and follows the RTL rules: logical CSS properties, mirrored directional icons, and isolated LTR values.

### Fixed
- Joining a mesh from the web panel always showed an error (for example `JSON.parse: unexpected non-whitespace character after JSON data`) even though the join succeeded. `/api/node/join` wrote a second HTTP response after the JSON body.
- Invite codes copied from terminals or chat apps are accepted even with line wraps, invisible bidi characters, surrounding text, uppercase prefix, missing padding or URL-safe base64.
- If the mesh service fails to start after a join, the previous configuration is restored automatically instead of leaving the node broken.
- The Stop button in the web panel also stopped the web panel itself. It now stops only the mesh service.

## [2.2.6-beta.3] - 2026-09-25

### Added
- Complete Design System overhaul implementing mathematical 60-30-10 palette architecture across all 6 themes.
- Re-architected Light Mode with high-contrast slate/zinc neutrals eliminating harsh glare and muddy grays (WCAG AA/AAA compliant).
- Theme-matched dynamic ambient radial mesh gradients (`--bg-radial-1`, `--bg-radial-2`) and subtle dot-grid canvas depth (`--dot-pattern`).
- Full semantic token architecture (`bg-base`, `bg-subtle`, `bg-card`, `bg-elevated`, `border-subtle`, `border-strong`, `text-primary`, `text-secondary`, `text-muted`, `accent-glow`).
- Reusable glassmorphic classes (`.glass-panel`, `.glass-panel-elevated`, `.ambient-glow-card`) with calibrated opacity and backdrop blur.

## [2.2.6-beta.2] - 2026-09-25

### Added
- Anti-Slop Frontend Modernization based on Taste Skill v2 framework.
- Upgraded all micro-typography scales to standard ergonomic text-xs (12px) and text-sm (14px).
- Fluid cubic-bezier tab transition motion, status indicators, and live telemetry animations.
- Clean matte engineering canvas background replacing generic AI grid lines.

## [2.2.6-beta.1] - 2026-09-25

### Added
- Beta channel version tracking reading remote version checks directly from the beta branch.
- Pre-release semver comparator supporting `-beta.x` increments and official release upgrades.
- Automatic branch propagation across CLI, Web UI service environment, and peer cluster info probes.
- Cluster version drift detection across mixed main and beta mesh nodes.

## [2.2.5] - 2026-09-24

### Fixed
- Restricted iptables tunnels to local host origin, eliminating remote interface discovery hangs and ensuring kernel-level forwarding rules execute on the correct host.
- Removed blind port scanning across arbitrary ports in peer version discovery, targeting only the primary/cached Web UI port.
- Reduced peer probe request timeouts to 1.0s, preventing Web UI lag during dashboard peer polling.
- Preserved valid peer versions and interface metadata during transient network timeouts instead of falsely falling back to `legacy (< 2.0.0)`.

## [2.2.4] - 2026-09-24

### Fixed
- Remote iptables interface discovery now preserves interface metadata from peer probes and honors the responsive remote Web UI port, including custom ports.
- Remote interface lookup is bounded to the discovered peer port, with an 8-second UI timeout, so a slow peer no longer leaves the selector stuck on “Loading interfaces…”.
- Interface API failures no longer degrade silently to `any`; the Web UI shows the actual remote discovery error.
- Added regression coverage for peer interface caching, custom-port fallback, and remote lookup failures.

## [2.2.3] - 2026-09-23

### Added
- Listen-to-target port mapping for HAProxy, iptables, GOST, and Realm tunnels using `LISTEN:TARGET` syntax (e.g. `1234:443`, `1000-1002:2000-2002`).
- Unified tunnel name validation across Web UI, API, and CLI with early rejection before runtime installation.
- Web UI presets and localized helper text for port mapping.

## [2.2.1] - 2026-09-23

### Fixed
- Fixed unlocalized translation keys in Peers tab: search filter placeholder and current node badge (`peer_badge_current`, `peers_filter_placeholder`).
- Polished current node badge in Peers tab with an active pulsing status indicator and clean spacing.

## [2.2.0] - 2026-09-23

### Added
- Auto theme matching as default for new installations (detects OS light/dark preference with live sync).
- Complete High-Contrast Light Mode overhaul across all 6 themes with dedicated tinted canvases and compartment elevation.
- Data-Dense Bento Grid architecture with full mobile thumb navigation bar and Persian RTL isolation.

## [2.1.5] - 2026-09-23

### Changed
- Light mode color palettes overhaul: Sky Tech, Cyber Emerald, Neon Violet, Amber Glow, Crimson Rose, and OLED Midnight now feature rich tinted canvases, tailored compartment surfaces, and AAA contrast ink typography.
- Enhanced Bento card legibility: solid light card surfaces with elevation shadows and distinct compartment fills prevent card wash-out and preserve visual depth.
- Default appearance mode set to Dark mode across all initial sessions.
- High-contrast primary buttons and badges with crisp text contrast in Light mode.
- Fixed nested UI utility classes in node configuration and speedtest diagnostic views.

## [2.1.4] - 2026-09-23

### Added
- Data-Dense Bento Grid layout: asymmetric high-density topology cards, latency metrics, and server telemetry gauges.
- Mobile Bottom Navigation Bar: fixed thumb-reachable glassy nav bar with active tab indicators and badge counts on mobile viewports.
- Enhanced Color Palette system: Sky Tech, Cyber Emerald, Neon Violet, Amber Glow, Crimson Rose, and OLED Midnight themes with dynamic CSS token propagation.
- Mobile quick toggles: single-tap Persian/English language switch and color palette selector directly accessible from mobile top bar.
- Technical LTR isolation: strict LTR bidi isolation for IP addresses, ports, protocols, and latency values in RTL Persian layout.

## [2.1.3] - 2026-09-23

### Changed
- Web dashboard accessibility and UX polish: keyboard-navigable tabs with visible focus rings and reduced-motion support.
- Semantic landmarks and dialogs (`tablist`/`tabpanel`, `role=dialog` with Escape handling) plus screen-reader live regions and labeled icon-only controls.
- Global text-selection unlock, searchable peers list with clear-search, touch-friendly targets, and Lucide icons replacing emoji status symbols.
- Rebuilt bundled Web UI assets (`web/static/index.html`).


## [2.1.2] - 2026-09-22

### Added
- Multi-node in-mesh ping and latency diagnostics: select any mesh node as source (packet runner) and any other node or IP as destination directly from Web UI.
- Inter-node HMAC-authenticated ping execution proxying (`/api/cluster/ping/run`).
- Quick swap button and dynamic route visual chips in Ping tab.
- Diagnostic route header showing origin execution node and cluster proxy badges.

## [2.1.1] - 2026-09-22

### Added
- Multi-node in-mesh speedtest benchmarking: select any mesh node as source (benchmark runner) and any other node as destination (iperf3 target) directly from Web UI.
- Inter-node HMAC-authenticated speedtest execution proxying (`/api/cluster/iperf/run`).
- Quick swap button for instant switching between source and destination benchmark endpoints.
- Active route visual indicator chips with remote benchmark execution badge.
- CLI mesh join and invite commands (`xraymesh join` and `xraymesh invite`) for joining networks directly from terminal.
- Setup Mode lock for freshly installed nodes: hides operational tabs and blocks unauthorized endpoints until node is configured.

## [2.1.0] - 2026-09-22

### Added
- Complete modern Web UI dashboard with multi-protocol support (HAProxy, Realm, GOST, iptables).
- SafeSync transactional cluster synchronizer with 2-phase commit, rollback watchdog, and HMAC verification.
- Peer health monitoring with cluster version drift detection.
- Polished post-install CLI interface with structured card layouts and status badges.

## [1.8.0] - 2026-09-20

### Added

- Interactive Web UI Dashboard with real-time EasyTier mesh monitoring and host server stats.
- In-Mesh Speedtest Suite powered by `iperf3` for both TCP (bandwidth capacity) and UDP (jitter, latency & packet loss) benchmarking.
- Hybrid Authentication: Instant One-Click login links (`xraymesh.sh token`) and optional admin password protection.
- Live multi-packet ping diagnostics with minimum, average, maximum latency and packet loss calculation.
- Tunnels status tab in Web UI showing active HAProxy TCP and iptables TCP/UDP rules.
- Standalone zero-dependency Python 3 HTTP daemon (`xraymesh-web.service`) and automated in-mesh iperf listener (`xraymesh-iperf.service`).
- Web management CLI commands and sub-menu in `xraymesh.sh`.
- Test suite for Web UI helpers in `tests/web_api_test.sh`.

## [1.7.0] - 2026-07-24

### Added

- SHA-256 verification for official EasyTier release archives.
- Transactional rollback when a node edit or HAProxy configuration fails.
- HAProxy duplicate-port and local port-conflict detection.
- `self-test` / `doctor` command for installation and service validation.
- GitHub Actions checks for Bash syntax, ShellCheck, LF endings, executable mode,
  and the HAProxy port parser.

### Changed

- HAProxy tunnels are disabled when the mesh is deleted and restored after a
  new mesh node is configured.
- Removed unsupported Linux i686 downloads.
- Restored the interactive process-substitution installer so menu prompts read
  directly from the terminal.

## [1.6.2] - 2026-07-24

- Read peer statistics from EasyTier JSON output for reliable live dashboards.
