# Changelog

All notable XRayMesh changes are documented here.

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
- One-line installation now works correctly for non-root users through `sudo`.

## [1.6.2] - 2026-07-24

- Read peer statistics from EasyTier JSON output for reliable live dashboards.
