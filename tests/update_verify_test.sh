#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

export XRAYMESH_UPDATE_STATUS_FILE="${TMP_DIR}/state/update-status.json"
export XRAYMESH_UPDATE_LOCK_FILE="${TMP_DIR}/update.lock"

# shellcheck source=../xraymesh.sh
source "${ROOT_DIR}/xraymesh.sh"

# "! cmd" never trips set -e, so negative checks need an explicit assertion.
expect_fail() {
  if "$@"; then
    printf 'Expected failure:' >&2
    printf ' %s' "$@" >&2
    printf '
' >&2
    exit 1
  fi
}

declare -F update_app_safe >/dev/null
declare -F update_node_full >/dev/null
declare -F update_easytier_core_safe >/dev/null

# Version ordering matches is_newer_version() in web/server.py.
version_is_newer "2.2.6-beta.5" "2.2.6-beta.4"
version_is_newer "2.2.6" "2.2.6-beta.9"
version_is_newer "2.3.0" "2.2.6"
expect_fail version_is_newer "2.2.5" "2.2.6-beta.4"
expect_fail version_is_newer "2.2.6-beta.4" "2.2.6-beta.4"
expect_fail version_is_newer "2.2.6-beta.3" "2.2.6-beta.4"

# Mirror list always starts with raw.githubusercontent and honours the branch.
mapfile -t urls < <(release_mirror_urls "version.json" "main")
[[ "${#urls[@]}" -eq 4 ]]
[[ "${urls[0]}" == https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/main/version.json\?t=* ]]
[[ "${urls[1]}" == "https://cdn.jsdelivr.net/gh/Erfan-XRay/XRayMesh@main/version.json" ]]

# Staged files must parse and carry exactly the expected release version.
stage="${TMP_DIR}/stage"
mkdir -p "${stage}/web/static"
printf '#!/usr/bin/env bash\nreadonly VERSION="9.9.9-beta.1"\necho ok\n' > "${stage}/xraymesh.sh"
printf 'import os\nCURRENT_VERSION = "9.9.9-beta.1"\n' > "${stage}/server.py"
printf '<!DOCTYPE html><html><head><meta name="xraymesh-version" content="9.9.9-beta.1" /></head></html>\n' > "${stage}/index.html"

stage_file_ok "${stage}/xraymesh.sh" "xraymesh.sh" "9.9.9-beta.1"
stage_file_ok "${stage}/server.py" "web/server.py" "9.9.9-beta.1"
stage_file_ok "${stage}/index.html" "web/static/index.html" "9.9.9-beta.1"

# A lagging mirror serving another release is rejected.
expect_fail stage_file_ok "${stage}/xraymesh.sh" "xraymesh.sh" "9.9.9-beta.2"
expect_fail stage_file_ok "${stage}/server.py" "web/server.py" "9.9.9-beta.2"
expect_fail stage_file_ok "${stage}/index.html" "web/static/index.html" "9.9.9-beta.2"

# Broken or truncated downloads are rejected.
printf 'readonly VERSION="9.9.9-beta.1"\nif then fi\n' > "${stage}/broken.sh"
expect_fail stage_file_ok "${stage}/broken.sh" "xraymesh.sh" "9.9.9-beta.1"
printf 'CURRENT_VERSION = "9.9.9-beta.1"\ndef broken(:\n' > "${stage}/broken.py"
expect_fail stage_file_ok "${stage}/broken.py" "web/server.py" "9.9.9-beta.1"
printf '<html><body>404: Not Found</body></html>\n' > "${stage}/error.html"
expect_fail stage_file_ok "${stage}/error.html" "web/static/index.html" "9.9.9-beta.1"
: > "${stage}/empty.sh"
expect_fail stage_file_ok "${stage}/empty.sh" "xraymesh.sh" "9.9.9-beta.1"
expect_fail stage_file_ok "${stage}/server.py" "unknown/file.txt" "9.9.9-beta.1"

# Status is written as JSON that keeps a queued job's start time.
mkdir -p "$(dirname "$XRAYMESH_UPDATE_STATUS_FILE")"
printf '{"state": "queued", "started_at": 1000}\n' > "$XRAYMESH_UPDATE_STATUS_FILE"
export UPDATE_FROM="2.2.6-beta.4" UPDATE_TARGET="2.2.6-beta.5" UPDATE_BRANCH="beta"
update_status running download
python3 - "$XRAYMESH_UPDATE_STATUS_FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d["state"] == "running" and d["step"] == "download", d
assert d["started_at"] == 1000, d
assert d["from_version"] == "2.2.6-beta.4" and d["target_version"] == "2.2.6-beta.5" and d["branch"] == "beta", d
assert "finished_at" not in d, d
PY
update_status failed rollback 'Health check "timed out"' true
python3 - "$XRAYMESH_UPDATE_STATUS_FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d["state"] == "failed" and d["rolled_back"] is True, d
assert d["error"] == 'Health check "timed out"', d
assert d["finished_at"] >= d["started_at"], d
PY

# Backups round-trip through restore.
printf 'old\n' > "${TMP_DIR}/app-file"
update_app_files() { printf '%s\n' "${TMP_DIR}/app-file"; }
backup_app_files "${TMP_DIR}/backup"
printf 'new\n' > "${TMP_DIR}/app-file"
restore_app_files "${TMP_DIR}/backup"
[[ "$(cat "${TMP_DIR}/app-file")" == "old" ]]

printf 'Safe updater helper tests passed.\n'
