# Changelog

All notable XRayMesh changes are documented here.

## [3.0.3] - 2026-09-27

### Changed
- Persian: latency is shown in «میلی‌ثانیه» instead of "ms" everywhere (overview, servers, ping, speed test and tunnels).

### Fixed
- Servers list: the column titles did not line up with the rows on large screens, because the empty title row had a narrower actions column than the rows. The header and rows now share one set of columns.
- Overview in Persian: average latency and the RAM usage ("1.4 GB / 3.8 GB") read backwards. They now keep their order.
- Servers list in Persian: the protocol under Connection sat at the far edge of its column, and traffic and latency read backwards (for example "MB ۱۲٫۳"). They now read "۱۲٫۳ MB" and line up with their titles.
- The WSS description said it needs a domain with a valid certificate. It does not: EasyTier makes its own certificate, and the certificate from `xraymesh ssl` is only for the web panel.

## [3.0.2] - 2026-09-27

### Removed
- The beta update channel. Every server now checks for and installs updates only from the `main` branch, and the panel no longer has the "Receive beta updates" switch or channel badges.

### Changed
- Servers that had beta updates turned on move to `main` on their next update. When the panel updates a mesh server that is still on beta, it first moves that server to `main`, so the update is the stable release.
- `install.sh` downloads the script from `main` instead of `beta`.

## [3.0.1] - 2026-09-27

The first stable release of the 3.0 line, published on the `main` branch. It includes everything from 3.0.0-beta.1 to 3.0.0-beta.16 below, plus the changes in this section. Servers on 2.2.x get it through the normal update (`xraymesh update` or the panel).

### Highlights of 3.0
- New mesh transports: **ICMP** (inside ping packets) and **PCK** (inside TCP segments built without the kernel's TCP stack), both provided by [BackPack](https://github.com/AminMGMT/BackPack) by Amin Mohammadi (AminMGMT).
- Mesh nodes accept only servers that share the network secret (EasyTier private mode), and a multi-thread mode runs EasyTier on more than one CPU core.
- Redesigned Firouzeh web panel with full Persian RTL support, a live speed test and ping, an installable web app, and animated backgrounds.
- Update channels (stable and beta) and per-server updates from the panel with verification and automatic rollback.

### Changed
- Stable installs now use the `main` update channel. Servers that turned on beta updates keep the beta channel.
- The README logo is now the same mark as the web panel and home-screen icon.
- The terminal menu was redesigned. Move with the arrow keys (or j/k) and open with Enter; typing an item's number still jumps to it. A status panel at the top shows the mesh node, web panel, speedtest server and sign-in mode, a hint line describes the highlighted item, and the list scrolls on short terminals and redraws when the window is resized.
- The menu has new items: Live status & peers, Connection diagnostics and Health check. Menu numbers changed: Update is now 16 and Uninstall is 17.
- Choices inside screens (setup method, protocol, IPv4 or IPv6, password options, log source) use the same arrow-key picker. Text questions support editing with the arrow keys, Home and End.
- Invite codes and login links are printed on their own line so they copy cleanly.
- Update (menu and `xraymesh update`) now uses the verified update path with rollback, and only moves EasyTier to a newer release instead of downloading it again and restarting the mesh every time.

### Fixed
- Ctrl+C at "Press Enter to continue" (for example after `xraymesh update`) or at any other prompt outside the menu printed "returning to the main menu" and then kept waiting, so the terminal looked frozen until the SSH session was closed. Ctrl+C now cancels the command.
- Ctrl+C inside most menu screens (login link, password, port, SSL, join, invite) closed the whole menu. It now returns to the menu, and Ctrl+C in the menu itself closes it cleanly.
- Ctrl+C in Live logs closed the whole menu; it now returns to the menu.
- Ctrl+C while getting an SSL certificate could leave the web server that was paused for port 80 stopped. It is started again.
- Ctrl+C during an update could stop it halfway between installing files and the health check, with no rollback. The download can still be cancelled (nothing is changed); the install, restart and rollback steps now finish first.
- Ctrl+C while a node configuration or an invite join was being applied could leave a half-applied config. Those steps now finish first.
- "Start all services" and "Restart all services" did not bring the tunnels (HAProxy, GOST, Realm, iptables) back after "Stop all services". They now start every enabled tunnel, and "Stop all services" also stops ICMP/PCK links and asks first.
- Opening the menu or a login link restarted the mesh node every time. It now restarts only when its runner actually changed.
- The menu looked up the public IP on every redraw, which could take seconds behind NAT; it is looked up once.
- Ctrl+D (end of input) at the menu redrew it in an endless loop; it now closes the menu.
- Screens that ended with an error (SSL, self-test) showed an extra "operation ended with status 1" and asked to press Enter twice.

## [3.0.0-beta.16] - 2026-09-27

### Security
- Mesh nodes now run EasyTier with `--private-mode true`. Before, anyone running EasyTier could connect to a server's mesh port with their own network name and secret and use the server as a free public relay, which cost bandwidth and showed the server's name to them. Only servers with this mesh's secret are accepted now.

### Added
- Multi-thread mode (`--multi-thread`) runs EasyTier on more than one CPU core for higher throughput. New servers and servers that join by invite start with it on; existing servers keep single-thread until it is turned on in the panel (Advanced) or in the terminal node setup. Joining another mesh keeps this server's choice.

### Changed
- New servers use MTU 1360, EasyTier's own default when encryption is on (1380 left too little room for its overhead). Existing servers keep their MTU.
- The panel names the actual cipher, AES-GCM (EasyTier's default), instead of ChaCha20-Poly1305.
- The FakeTCP description explains that links are only made to the peers you add, so other servers may reach each other through them.

### Fixed
- `wg://` peer addresses were turned into TCP and UDP connections on the same port and never connected. They are now passed to EasyTier as WireGuard peers.
- Saving node settings from the panel now checks the name, secret, virtual IPv4, port, protocol and MTU on the server, and puts the previous working configuration back when the mesh service fails to start with the new one.
- The terminal node setup accepts only yes or no for encryption, IPv6, KCP and multi-thread (typing `y` for KCP used to leave it off) and checks the MTU range.
- A node config without an IPv6 setting now keeps IPv6 off, matching every other default.

## [3.0.0-beta.15] - 2026-09-27

### Changed
- ICMP and PCK: servers reached across a BackPack link now show PCK or ICMP under Servers instead of plain UDP. Servers that joined over links and reach each other directly still show UDP, because that traffic really is plain UDP.
- ICMP and PCK: a server that joined over a link no longer says it is the main server under Peers & invite, and no longer starts an extra link just by opening that section. It points to the server it joined through, with an option to create a code there anyway. `xraymesh invite` asks the same question.

### Fixed
- The advice to turn off mesh encryption on ICMP/PCK meshes was unsafe: servers that joined over links also connect to each other directly over plain UDP, outside BackPack. Encryption can now only be turned off safely in a two-server mesh, and the panel and CLI say so.

## [3.0.0-beta.14] - 2026-09-27

### Fixed
- Average latency and Host resources no longer drop to huge negative numbers (and keep falling) after the tab sat in the background for a few minutes. The count-up animation now keeps time only from animation frames, so a stale frame timestamp after the tab resumes can no longer push the value backwards. This also covers the speed test gauge and the live ping readout.

## [3.0.0-beta.13] - 2026-09-27

### Added
- The dashboard can be installed as a web app: use "Add to Home Screen" (iOS Safari) or "Install app" (Android Chrome) and it opens full-screen with its own icon, without the browser's address bar. The server now serves a web app manifest and home-screen icons.

### Fixed
- On phones, tapping the sign-in field or any other input no longer zooms the page in. Text fields use a 16px font on touch screens, and double-tap zoom is turned off on controls (pinch zoom still works).
- In the installed app on notched iPhones, the header, sign-in controls and side menu stay clear of the status bar.

## [3.0.0-beta.12] - 2026-09-27

### Added
- Animated ambient background: soft drifting accent light, a dot lattice and a faint mesh of peers with packets travelling between them. It follows every palette and light/dark mode, and the sign-in and startup screens use a stronger version.
- A dedicated XRayMesh loading animation (peers send packets into the hub, which answers with a ripple) on the startup screen, the self-update restart overlay and while node settings load.
- Background setting in Appearance & language: Animated or Static. The choice is remembered and applied before the page first paints.

### Changed
- The header tab underline glides to the selected tab, and the phone bottom bar's highlight slides between sections.
- Tab sections and server rows rise in one after another; overview numbers count up and glide between refreshes.
- Notifications animate in and out and show a thin countdown line; primary buttons glow softly on hover.

## [3.0.0-beta.11] - 2026-09-27

### Fixed
- The speed test's live number no longer runs into the speedometer's arc and tick labels: it sits below the dial, and values longer than five characters use a smaller size so they fit on phones.

## [3.0.0-beta.10] - 2026-09-27

### Added
- Real-time speed test: throughput is reported every second while iperf3 runs, on a new animated speedometer with a live needle, peak marker, progress bar, packets streaming along the route and a chart that grows as each second arrives. Transferred data, peak, average and retransmits update live.
- Real-time ping: each reply appears the moment it arrives, with an animated echo packet between the two servers, a latency bar per packet, a quality badge and live min / average / max / jitter / loss.
- Tests run as live jobs (`/api/ping/start`, `/api/iperf/start`, `/api/live/status`). When another server runs the test, this panel follows that server's live job; servers that predate live tests still work and show the result when it finishes.

### Changed
- The Ping tab uses the same two-column layout as the speed test.
- The UDP sending rate is validated before it reaches iperf3.

## [3.0.0-beta.9] - 2026-09-26

### Added
- Experimental PCK transport. Each server pair gets its own [BackPack](https://github.com/AminMGMT/BackPack) direct layer-3 link with the `pck` carrier, which sends TCP segments built without the kernel's TCP stack (no handshake or connection state for middleboxes to reset or throttle), and EasyTier peers across it exactly as with ICMP. For routes where normal TCP connects but then stalls, resets or gets throttled.
- PCK invites carry one link each, like ICMP. The inviting server listens on a free TCP port between 20000 and 32767 that avoids the mesh port, local listeners, tunnels and other links; the invite panel and `xraymesh invite` name the port to open in the provider's firewall. Create the invite on the server abroad and join from the server in Iran.
- iptables is installed automatically for PCK links: BackPack needs it to drop the kernel's RSTs and keep the link out of connection tracking.
- HAProxy, iptables, GOST and Realm tunnels refuse TCP ports that a PCK link listens on.
- Selecting ICMP or PCK now explains, in the panel and the terminal, that these links are already encrypted by BackPack (Noise), so mesh encryption can be turned off to save CPU when every server connects over them.
- `xraymesh link-list` and `xraymesh link-delete` show and remove ICMP and PCK links; the `icmp-*` commands still work.

### Changed
- SafeSync refuses mesh-wide switches onto, off or between ICMP and PCK, since both need a link per server pair.
- Existing ICMP links are untouched: their files and units keep their names, and their BackPack configuration is byte-identical, so updating does not restart them.

## [3.0.0-beta.8] - 2026-09-26

### Added
- Invite codes carry the mesh port alongside protocol, MTU, KCP, encryption and IPv6, and joining servers use the invite's port by default (panel and `xraymesh join`). Older codes still work and take the port from their address.
- IPv4 / IPv6 choice for the invite address when IPv6 is on, with the reason shown when IPv6 cannot be used (no public IPv6, ICMP, or FakeTCP). `xraymesh invite` asks too, or takes `--ipv4` / `--ipv6`.
- The invite panel lists the settings the code applies on the other server, and the join preview shows them all before joining.
- ICMP mode explains in three short steps that the main server hands out one code per server.

### Fixed
- `xraymesh join` applied fixed values for encryption, KCP, IPv6 and MTU instead of the invite's settings, and `xraymesh invite` left them out of the code.
- With IPv6 on, the mesh port is now opened in ip6tables as well as iptables.

## [3.0.0-beta.7] - 2026-09-26

### Fixed
- ICMP invites and joins failed with the CLI's usage text on servers where the terminal menu had been opened: the menu's automatic web update pulled the newest panel and web server but never the CLI script (its download was always rejected), so the panel called commands the script did not have.
- The menu now only installs a web server and panel that match the installed CLI version; newer releases come through `xraymesh node-update`, which replaces all three together.
- Running an older copy of `xraymesh.sh` no longer overwrites a newer installed script.
- When the CLI and panel versions differ, ICMP invite and join errors say so and name the command to run, and the panel shows the server's reason when an invite code cannot be created.

## [3.0.0-beta.6] - 2026-09-26

### Added
- Experimental ICMP transport for networks where only ping gets through. Each server pair gets its own [BackPack](https://github.com/AminMGMT/BackPack) (AGPL-3.0, used unmodified) direct layer-3 link with the xDi carrier, and EasyTier peers across it over UDP, so tunnels, SafeSync, ping and speed tests work unchanged.
- ICMP invites carry one link each; the panel shows a refresh button for the next server's code. `xraymesh icmp-list` and `xraymesh icmp-delete` manage links from the terminal.
- BackPack v1.8.4 is pinned with SHA-256 checksums; servers that cannot reach GitHub can install from a copied archive in `/root/`.

### Changed
- In ICMP mode EasyTier uses MTU 1280 and does not bind peer sockets to the physical interface, so traffic reaches the ICMP link.
- SafeSync refuses to switch the whole mesh to or from ICMP, since each link has to be created per server.

## [3.0.0-beta.5] - 2026-09-26

### Changed
- Redesigned web panel ("Firouzeh Console"): flat layered surfaces, a sticky header with the section tabs built in, one overview strip for address, peers, latency and host load, and dialogs that open as bottom sheets on phones.
- Six color palettes (Firouzeh, Ocean, Iris, Saffron, Graphite, Midnight) in light and dark. A palette saved in an earlier version is mapped to its closest new palette.
- Theme, palette and language apply before the page draws, so it no longer flashes on load. Light mode no longer relies on color overrides.
- Persian: right-to-left layout throughout, the Estedad font (bundled, OFL) with a larger type scale, Persian digits for counts and measurements, and Latin digits kept for IPs, ports, versions and host names.
- Text that was still hardcoded in English (tunnel dialog, cluster sync, speed test, notifications) is now translated, and the Persian wording is consistent across the panel.

## [3.0.0-beta.4] - 2026-09-26

Test release for one-click updates from the panel. No functional changes since 3.0.0-beta.3.

## [3.0.0-beta.3] - 2026-09-26

### Fixed
- One-click updates could stay on "Starting..." for 15 minutes when the background updater never started, and every new attempt followed that dead job as "already running". A job still queued after 90 seconds is now reported as failed with the log command to check, and the next attempt starts a fresh update.
- Without systemd-run, the updater downloaded the EasyTier core before reporting anything, so a slow GitHub link looked like a job that never started. It now reports "downloading" first.
- The update start request times out after 25 seconds and the panel keeps following the job; remote status polls time out after 12 seconds.

## [3.0.0-beta.2] - 2026-09-26

Test release for one-click updates from the panel. No functional changes since 3.0.0-beta.1.

## [3.0.0-beta.1] - 2026-09-26

First beta of XRayMesh 3.0. It brings together the 2.2.6 betas: resilient multi-server tunnels (beta.6), reliable update checks (beta.7), a smooth finish for self-updates (beta.8) and the clean mobile UI (beta.9).

### Fixed
- Updating the server you are signed in to could still get stuck on "Waiting for the server...". A status request to the restarting server could hang with no answer and no error, and polling waited on it forever. Every poll now times out after 5 seconds, and if the status endpoint keeps failing while the panel page is served again, the panel reloads and shows the update notice on the sign-in page.

## [2.2.6-beta.9] - 2026-09-25

### Changed
- Mobile header is one row: logo, name, a single network and version line, refresh and menu. Language and palette live in the menu.
- Mobile overview is one compact 2x2 card (IP with tap-to-copy, peers, latency, CPU/RAM) instead of four full-height cards, so tab content starts on the first screen.
- Bottom navigation uses short labels in a 5-column grid, marks the active tab, and has accessible names.
- Server rows on phones are three dense lines (name, IP and latency; connection and traffic; version, update and actions).
- Ping and Speedtest share a new source/destination picker with a swap button; the ping count is a segmented control, loss is color-coded, and raw output is collapsible.
- Tunnels toolbar and type filters fit on phones; section descriptions are hidden on small screens.
- Switching tabs scrolls to the top.

### Fixed
- Bottom navigation overflowed the screen and cut off its labels.
- Ping and Speedtest route summary overflowed on phones.
- Tunnels server picker overflowed its card on phones.
- Side menu title was truncated.

## [2.2.6-beta.8] - 2026-09-25

### Added
- Full-screen notice while the server you are signed in to restarts to finish its update, followed by an automatic reload.
- The sign-in page says the server was updated (and to which version) after that reload, and a toast confirms it after signing in.

### Fixed
- Updating the server you are signed in to got stuck on "Waiting for the server...": the restart drops the login session, so the signed-in status check failed with 401 until the 4 minute timeout. The panel now follows its own update through the public `/api/cluster/info` endpoint.

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
