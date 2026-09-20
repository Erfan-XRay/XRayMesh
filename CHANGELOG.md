# Changelog

All notable XRayMesh changes are documented here.

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
