#!/usr/bin/env python3
"""
XRayMesh Web UI Daemon & API Server
Developed by ErfanXRay

A lightweight, zero-dependency Python 3 HTTP server providing:
- Real-time Mesh & Node Monitoring
- In-Mesh Speedtest & iperf3 Benchmarking (TCP / UDP)
- Interactive Latency / Ping Diagnostics
- Hybrid Authentication (One-Time Token & Admin Password)
"""

import http.server
import socketserver
import json
import os
import sys
import subprocess
import urllib.parse
import urllib.request
import base64
import time
import uuid
import hashlib
import hmac
import secrets
import re
import signal
import threading
import shutil
import concurrent.futures
import ssl
from pathlib import Path

# Paths & Defaults
CURRENT_VERSION = "3.0.0-beta.3"
CURRENT_BRANCH = "beta"
INSTALL_DIR = os.environ.get("INSTALL_DIR", "/opt/xraymesh")
BIN_DIR = os.path.join(INSTALL_DIR, "bin")
CONFIG_FILE = os.environ.get("CONFIG_FILE", "/etc/xraymesh/config.env")
CONFIG_BACKUP_FILE = CONFIG_FILE + ".bak"
CONFIG_STAGED_FILE = CONFIG_FILE + ".staged"
WEB_ENV_FILE = os.environ.get("WEB_ENV_FILE", "/etc/xraymesh/web.env")
WEB_TOKEN_FILE = os.environ.get("WEB_TOKEN_FILE", "/etc/xraymesh/web-tokens.json")
HAPROXY_DIR = os.environ.get("HAPROXY_DIR", "/etc/xraymesh/haproxy-tunnels")
IPTABLES_DIR = os.environ.get("IPTABLES_DIR", "/etc/xraymesh/iptables-tunnels")
GOST_TUNNEL_DIR = os.environ.get("GOST_TUNNEL_DIR", "/etc/xraymesh/gost-tunnels")
REALM_TUNNEL_DIR = os.environ.get("REALM_TUNNEL_DIR", "/etc/xraymesh/realm-tunnels")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

PORT = int(os.environ.get("WEB_PORT", "11080"))
BIND_ADDR = os.environ.get("WEB_BIND", "0.0.0.0")
SESSION_COOKIE_NAME = "xraymesh_session"
SESSION_DURATION_SEC = 86400 * 7  # 7 days

# In-Memory Active Sessions & Tokens
SESSIONS = {}  # session_id -> {"expires": timestamp, "user": "admin"}
SESSION_LOCK = False

# Version & Release Caching
VERSION_CACHE = {}  # branch -> {"data": version info, "last_checked": ts}
VERSION_CACHE_TTL = 300  # 5 minutes
VERSION_FAIL_TTL = 60  # a failed check is retried soon instead of posing as "up to date"
VERSION_REFRESHING = set()  # branches with a background refresh in flight
PEER_VERSION_CACHE = {}  # ip -> {"version": ver, "timestamp": ts}

# Update channels map to the GitHub branch each server downloads releases from.
CHANNEL_BRANCHES = {"stable": "main", "beta": "beta"}
UPDATE_STATUS_FILE = os.environ.get("XRAYMESH_UPDATE_STATUS_FILE", "/var/lib/xraymesh/update-status.json")
UPDATE_STALE_SEC = 900  # a job that stops reporting for this long is treated as failed
UPDATE_QUEUED_STALE_SEC = 90  # a queued job the updater never picked up


def is_ssl_enabled():
    """Check if valid SSL cert and key exist for Web UI."""
    web_cfg = load_env_file(WEB_ENV_FILE)
    cert = os.environ.get("WEB_SSL_CERT") or web_cfg.get("WEB_SSL_CERT", "")
    key = os.environ.get("WEB_SSL_KEY") or web_cfg.get("WEB_SSL_KEY", "")
    return bool(cert and key and os.path.isfile(cert) and os.path.isfile(key))


def get_active_branch():
    """Determine active branch for version checks, downloads, and drift detection."""
    env_branch = os.environ.get("XRAYMESH_BRANCH")
    if env_branch and env_branch.strip():
        return env_branch.strip()
    web_cfg = load_env_file(WEB_ENV_FILE)
    if web_cfg.get("XRAYMESH_BRANCH"):
        return web_cfg["XRAYMESH_BRANCH"].strip()
    node_cfg = load_env_file(CONFIG_FILE)
    if node_cfg.get("XRAYMESH_BRANCH"):
        return node_cfg["XRAYMESH_BRANCH"].strip()
    return CURRENT_BRANCH


def parse_semver(v):
    """Parse semver string supporting pre-release tags, e.g. 2.2.6-beta.1."""
    s = str(v).strip().lstrip('v')
    m = re.match(r'^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-?([a-zA-Z]+)(?:\.?(\d+))?)?', s)
    if not m:
        return (0, 0, 0, 0, "", 0)
    major = int(m.group(1) or 0)
    minor = int(m.group(2) or 0)
    patch = int(m.group(3) or 0)
    tag = m.group(4)
    tag_num = int(m.group(5) or 0)
    is_release = 1 if tag is None else 0
    tag_str = (tag or "").lower()
    return (major, minor, patch, is_release, tag_str, tag_num)


def is_newer_version(remote_ver, local_ver):
    """Compare semver strings with pre-release awareness (e.g. 2.2.6-beta.2 vs 2.2.6-beta.1)."""
    try:
        r = parse_semver(remote_ver)
        l = parse_semver(local_ver)
        if r[:3] != l[:3]:
            return r[:3] > l[:3]
        if r[3] != l[3]:
            return r[3] > l[3]
        if r[4] != l[4]:
            return r[4] > l[4]
        return r[5] > l[5]
    except Exception:
        return False


def branch_channel(branch):
    """Name of the update channel a branch belongs to ("custom" for anything else)."""
    for channel, channel_branch in CHANNEL_BRANCHES.items():
        if branch == channel_branch:
            return channel
    return "custom"


def set_env_file_value(path, key, value):
    """Set KEY="value" in a shell-style env file, keeping every other line."""
    lines = []
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    entry = f'{key}="{value}"\n'
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = entry
            break
    else:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(entry)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.writelines(lines)
    try:
        os.chmod(tmp, 0o600)
    except Exception:
        pass
    os.replace(tmp, path)


def set_update_channel(channel):
    """Persist the update channel for this server and apply it without a restart."""
    branch = CHANNEL_BRANCHES[channel]
    set_env_file_value(WEB_ENV_FILE, "XRAYMESH_BRANCH", branch)
    # The service's environment is a snapshot of web.env from start-up; keep it in sync.
    os.environ["XRAYMESH_BRANCH"] = branch
    VERSION_CACHE.pop(branch, None)
    return branch


def get_version_info(branch=None, force=False):
    """Fetch version info from the branch's version.json, cached per branch (failed checks only briefly)."""
    now = time.time()
    branch = branch or get_active_branch()
    cached = VERSION_CACHE.get(branch)
    ttl = VERSION_CACHE_TTL if cached and cached.get("data", {}).get("checked") else VERSION_FAIL_TTL
    if not force and cached and cached.get("data") and (now - cached.get("last_checked", 0) < ttl):
        # Compare against the running version at read time; it changes after a self-update.
        data = dict(cached["data"])
        data["current_version"] = CURRENT_VERSION
        data["update_available"] = is_newer_version(data.get("latest_version", ""), CURRENT_VERSION)
        return data

    remote_data = None
    url = f"https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/{branch}/version.json?t={int(now)}"
    try:
        req = urllib.request.Request(
            url,
            headers={
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "User-Agent": f"XRayMesh-Web/{CURRENT_VERSION} ({branch})"
            }
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                remote_data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        pass

    if not isinstance(remote_data, dict):
        previous = (cached or {}).get("data") or {}
        if previous.get("latest_version") and previous.get("checked_at"):
            # Keep the last good answer, but retry soon.
            data = dict(previous, current_version=CURRENT_VERSION, checked=False, check_failed_at=now)
            data["update_available"] = is_newer_version(data["latest_version"], CURRENT_VERSION)
            VERSION_CACHE[branch] = {"data": data, "last_checked": now}
            return data

    # Unknown until GitHub answers; never report "up to date" from a failed check.
    latest_ver = ""
    changelog = []
    update_cmd = f"bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/{branch}/xraymesh.sh) update"
    release_notes = ""

    if isinstance(remote_data, dict):
        latest_ver = remote_data.get("version", CURRENT_VERSION)
        changelog = remote_data.get("changelog", [])
        update_cmd = remote_data.get("update_command", update_cmd)
        release_notes = remote_data.get("release_notes", "")

    result = {
        "current_version": CURRENT_VERSION,
        "latest_version": latest_ver,
        "branch": branch,
        "channel": branch_channel(branch),
        "update_available": is_newer_version(latest_ver, CURRENT_VERSION),
        "changelog": changelog,
        "release_notes": release_notes,
        "update_command": update_cmd,
        "checked": isinstance(remote_data, dict),
        "checked_at": now if isinstance(remote_data, dict) else None,
    }
    VERSION_CACHE[branch] = {"data": result, "last_checked": now}
    return result


def get_cached_version_info():
    """Non-blocking variant for latency-sensitive probes: serve the cache and refresh it in the background."""
    branch = get_active_branch()
    cached = VERSION_CACHE.get(branch) or {}
    ttl = VERSION_CACHE_TTL if (cached.get("data") or {}).get("checked") else VERSION_FAIL_TTL
    fresh = cached.get("data") and time.time() - cached.get("last_checked", 0) < ttl
    if not fresh and branch not in VERSION_REFRESHING:
        VERSION_REFRESHING.add(branch)

        def refresh():
            try:
                get_version_info(branch)
            finally:
                VERSION_REFRESHING.discard(branch)

        threading.Thread(target=refresh, daemon=True).start()
    return cached.get("data")


def read_update_status():
    """Last self-update job recorded by xraymesh.sh, with stalled jobs reported as failed."""
    try:
        with open(UPDATE_STATUS_FILE, "r", encoding="utf-8") as f:
            status = json.load(f)
    except Exception:
        return {"state": "idle"}
    if not isinstance(status, dict):
        return {"state": "idle"}
    last_seen = status.get("updated_at") or status.get("started_at") or 0
    age = time.time() - last_seen
    if status.get("state") == "queued" and age > UPDATE_QUEUED_STALE_SEC:
        # The updater reports within seconds of starting; a job still queued never ran.
        # Failing it here also stops it from blocking the next attempt as "already running".
        status["state"] = "failed"
        status["error"] = status.get("error") or "The updater never started. Check journalctl -u xraymesh-updater-temp -n 50 or /var/log/xraymesh-update.log."
    elif status.get("state") in ("queued", "running") and age > UPDATE_STALE_SEC:
        status["state"] = "failed"
        status["error"] = status.get("error") or "The updater stopped reporting progress. Check /var/log/xraymesh-update.log or journalctl -u xraymesh-updater-temp."
    return status


def write_update_status(status):
    """Record an update job state from the web side (queued / failed to launch)."""
    os.makedirs(os.path.dirname(UPDATE_STATUS_FILE), exist_ok=True)
    tmp = UPDATE_STATUS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(status, f)
    os.replace(tmp, UPDATE_STATUS_FILE)


def update_job_running():
    return read_update_status().get("state") in ("queued", "running")


def local_update_summary():
    """Version, channel and update job of this server, as shown in every panel of the mesh."""
    info = get_cached_version_info() or {}
    branch = get_active_branch()
    latest = info.get("latest_version") or ""
    job = read_update_status()
    return {
        "version": CURRENT_VERSION,
        "branch": branch,
        "channel": branch_channel(branch),
        "latest_version": latest,
        "update_available": bool(latest) and is_newer_version(latest, CURRENT_VERSION),
        "update_checked": bool(info.get("checked")),
        "update": {k: job.get(k) for k in ("state", "step", "target_version", "error", "rolled_back", "started_at", "finished_at")},
    }


def normalize_network_interfaces(raw_interfaces):
    """Return a validated, de-duplicated interface list with any first."""
    if not isinstance(raw_interfaces, (list, tuple, set)):
        return []

    interfaces = []
    for raw_interface in raw_interfaces:
        if not isinstance(raw_interface, str):
            continue
        interface = raw_interface.strip()
        if interface and interface not in interfaces:
            interfaces.append(interface)

    if interfaces:
        if "any" in interfaces:
            interfaces.remove("any")
        interfaces.insert(0, "any")
    return interfaces


def get_peer_port_candidates(peer_ip, preferred_port=None):
    """Build a stable, de-duplicated Web UI port list for a mesh peer."""
    cached_peer = PEER_VERSION_CACHE.get(peer_ip, {})
    ports = []
    for candidate in (preferred_port, cached_peer.get("port"), PORT):
        try:
            port = int(candidate)
        except (TypeError, ValueError):
            continue
        if 1 <= port <= 65535 and port not in ports:
            ports.append(port)
    return ports


def fetch_peer_cluster_info(peer_ip, preferred_port=None, timeout=1.0, strict_port=False):
    """Fetch public cluster metadata, preserving the responsive peer port."""
    insecure_ssl_ctx = ssl.create_default_context()
    insecure_ssl_ctx.check_hostname = False
    insecure_ssl_ctx.verify_mode = ssl.CERT_NONE
    schemes = ("https", "http") if is_ssl_enabled() else ("http", "https")
    last_err = "Failed to connect to cluster peer"

    if strict_port and preferred_port:
        try:
            ports_to_try = [int(preferred_port)]
        except (TypeError, ValueError):
            ports_to_try = get_peer_port_candidates(peer_ip, preferred_port)
    else:
        ports_to_try = get_peer_port_candidates(peer_ip, preferred_port)
    for port in ports_to_try:
        for scheme in schemes:
            url = f"{scheme}://{peer_ip}:{port}/api/cluster/info"
            req = urllib.request.Request(url, headers={"User-Agent": f"XRayMesh-Cluster/{CURRENT_VERSION}"})
            try:
                ctx = insecure_ssl_ctx if scheme == "https" else None
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if isinstance(data, dict) and data.get("ok") is True and data.get("version"):
                        return data, port, ""
            except urllib.error.HTTPError as error:
                last_err = f"HTTP {error.code}"
            except Exception as error:
                last_err = str(error)

    return {}, None, last_err


def get_peer_version(peer_ip, port=None, timeout=1.0):
    """Probe peer's /api/cluster/info or cached version across candidate ports."""
    now = time.time()
    cached = PEER_VERSION_CACHE.get(peer_ip, {})
    # Unreachable results expire sooner, so a peer that just came up shows its version quickly
    # without re-probing offline peers (seconds of timeouts) on every poll.
    # Same for a peer that has not finished checking its own channel for updates yet.
    incomplete = cached.get("version") in (None, "", "unknown") or ("channel" in cached and not cached.get("latest_version"))
    ttl = 15.0 if incomplete else 60.0
    if cached and (now - cached.get("timestamp", 0) < ttl) and cached.get("version"):
        return cached.get("version", "unknown")

    peer_info, responsive_port, _ = fetch_peer_cluster_info(peer_ip, port, timeout)
    version_found = peer_info.get("version") if peer_info else None
    if not version_found:
        prev_ver = cached.get("version")
        if prev_ver and prev_ver not in ("legacy (< 2.0.0)", "unknown"):
            version_found = prev_ver
        else:
            version_found = "unknown"

    peer_branch = (peer_info.get("branch") if peer_info else None) or cached.get("branch") or ""
    cache_entry = {
        "version": version_found,
        "port": responsive_port or cached.get("port") or port or PORT,
        "interfaces": normalize_network_interfaces(
            (peer_info.get("interfaces") if peer_info else None) or cached.get("interfaces")
        ),
        "timestamp": now
    }
    if peer_branch:
        cache_entry["branch"] = peer_branch
    # Peers from 2.2.6-beta.5 on report their own channel, latest release and update job.
    source = peer_info if peer_info else cached
    for key in ("channel", "latest_version", "update_available", "update_checked", "update"):
        if key in source:
            cache_entry[key] = source[key]
    PEER_VERSION_CACHE[peer_ip] = cache_entry
    return version_found


def load_env_file(filepath):
    """Safely parse shell-style .env file."""
    res = {}
    if not os.path.isfile(filepath):
        return res
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                v = re.sub(r'\\([, \t\'\"])', r'\1', v)
                res[k] = v
    except Exception:
        pass
    return res


def hash_password(password, salt=None):
    """Hash password using SHA-256 with salt."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"sha256${salt}${hashed}"


def verify_password(password, stored_hash):
    """Verify password against stored sha256$salt$hash."""
    try:
        parts = stored_hash.split("$")
        if len(parts) != 3 or parts[0] != "sha256":
            return False
        salt, target_hash = parts[1], parts[2]
        computed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
        return secrets.compare_digest(computed, target_hash)
    except Exception:
        return False


def load_tokens():
    """Load valid one-time/access tokens from file."""
    if not os.path.isfile(WEB_TOKEN_FILE):
        return {}
    try:
        with open(WEB_TOKEN_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            now = time.time()
            return {k: v for k, v in data.items() if v.get("expires", 0) > now}
    except Exception:
        return {}


def save_tokens(tokens):
    """Save tokens to file with secure permissions."""
    try:
        os.makedirs(os.path.dirname(WEB_TOKEN_FILE), exist_ok=True)
        with open(WEB_TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(tokens, f, indent=2)
        try:
            os.chmod(WEB_TOKEN_FILE, 0o600)
        except Exception:
            pass
    except Exception:
        pass


def validate_token(token_str):
    """Validate a token and remove it if one-time use."""
    if not token_str:
        return False
    tokens = load_tokens()
    if token_str in tokens:
        info = tokens[token_str]
        if info.get("expires", 0) > time.time():
            if info.get("one_time", True):
                del tokens[token_str]
                save_tokens(tokens)
            return True
    return False


def is_authenticated(headers, query_params=None):
    """Check if request is authenticated via session cookie or direct query token."""
    # 1. Check query parameter token
    if query_params and "token" in query_params:
        token = query_params["token"]
        if validate_token(token):
            return True, "token"

    # 2. Check session cookie
    cookie_header = headers.get("Cookie", "")
    if cookie_header:
        for item in cookie_header.split(";"):
            item = item.strip()
            if item.startswith(f"{SESSION_COOKIE_NAME}="):
                session_id = item.split("=", 1)[1]
                if session_id in SESSIONS:
                    sess = SESSIONS[session_id]
                    if sess.get("expires", 0) > time.time():
                        return True, session_id
                    else:
                        del SESSIONS[session_id]

    # 3. If neither password nor tokens are set, check if web.env has password configured
    web_cfg = load_env_file(WEB_ENV_FILE)
    has_password = bool(web_cfg.get("WEB_PASSWORD_HASH"))
    tokens = load_tokens()

    # If system has zero password and zero tokens, require generating a token via CLI for security
    if not has_password and not tokens:
        return False, None

    return False, None


def create_session():
    """Create a new session ID with expiry."""
    session_id = secrets.token_hex(32)
    SESSIONS[session_id] = {
        "expires": time.time() + SESSION_DURATION_SEC,
        "created": time.time(),
        "user": "admin"
    }
    return session_id


def get_session_cookie(session_id):
    """Generate Set-Cookie header value with security attributes."""
    secure_flag = "; Secure" if is_ssl_enabled() else ""
    return f"{SESSION_COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DURATION_SEC}{secure_flag}"


# Login Rate Limiting (In-Memory IP tracking)
LOGIN_ATTEMPTS = {}  # ip -> [timestamp, ...]
LOGIN_RATE_LIMIT = 5  # max failed attempts
LOGIN_RATE_WINDOW = 60  # window in seconds
LOGIN_ATTEMPTS_LOCK = threading.Lock()


def check_login_rate_limit(ip):
    """Return (allowed: bool, retry_after: int) for IP address."""
    now = time.time()
    with LOGIN_ATTEMPTS_LOCK:
        attempts = [ts for ts in LOGIN_ATTEMPTS.get(ip, []) if now - ts < LOGIN_RATE_WINDOW]
        LOGIN_ATTEMPTS[ip] = attempts
        if len(attempts) >= LOGIN_RATE_LIMIT:
            retry_after = max(1, int(LOGIN_RATE_WINDOW - (now - attempts[0])))
            return False, retry_after
        return True, 0


def record_failed_login(ip):
    """Record a failed login attempt for rate limiting."""
    now = time.time()
    with LOGIN_ATTEMPTS_LOCK:
        attempts = [ts for ts in LOGIN_ATTEMPTS.get(ip, []) if now - ts < LOGIN_RATE_WINDOW]
        attempts.append(now)
        LOGIN_ATTEMPTS[ip] = attempts


def reset_login_attempts(ip):
    """Clear failed login records for IP upon successful authentication."""
    with LOGIN_ATTEMPTS_LOCK:
        LOGIN_ATTEMPTS.pop(ip, None)


_last_cpu_sample = {"total": 0.0, "idle": 0.0, "time": 0.0}


def read_proc_stat_cpu():
    """Read total and idle CPU times from /proc/stat."""
    if not os.path.isfile("/proc/stat"):
        return None, None
    try:
        with open("/proc/stat", "r") as f:
            for line in f:
                if line.startswith("cpu "):
                    parts = [float(x) for x in line.split()[1:]]
                    idle = parts[3] + (parts[4] if len(parts) > 4 else 0.0)
                    total = sum(parts)
                    return total, idle
    except Exception:
        pass
    return None, None


def get_cpu_percent():
    """Compute CPU usage percent using /proc/stat delta."""
    global _last_cpu_sample
    total_now, idle_now = read_proc_stat_cpu()
    if total_now is None or idle_now is None:
        return 0.0

    last_total = _last_cpu_sample["total"]
    last_idle = _last_cpu_sample["idle"]
    now = time.time()

    if last_total == 0.0 or total_now <= last_total:
        _last_cpu_sample = {"total": total_now, "idle": idle_now, "time": now}
        time.sleep(0.06)
        t2, i2 = read_proc_stat_cpu()
        if t2 is not None and i2 is not None and t2 > total_now:
            d_total = t2 - total_now
            d_idle = i2 - idle_now
            pct = round(max(0.0, min(100.0, (1.0 - (d_idle / d_total)) * 100.0)), 1)
            _last_cpu_sample = {"total": t2, "idle": i2, "time": time.time()}
            return pct
        return 0.0

    d_total = total_now - last_total
    d_idle = idle_now - last_idle
    _last_cpu_sample = {"total": total_now, "idle": idle_now, "time": now}
    if d_total <= 0:
        return 0.0
    return round(max(0.0, min(100.0, (1.0 - (d_idle / d_total)) * 100.0)), 1)


def get_system_stats():
    """Retrieve host system information (CPU, RAM, Uptime)."""
    stats = {
        "cpu_percent": 0.0,
        "ram_total_mb": 0,
        "ram_used_mb": 0,
        "ram_percent": 0.0,
        "uptime_str": "unknown",
        "load_avg": [0.0, 0.0, 0.0]
    }

    try:
        stats["cpu_percent"] = get_cpu_percent()
    except Exception:
        pass

    try:
        # Load average
        if hasattr(os, "getloadavg"):
            stats["load_avg"] = [round(x, 2) for x in os.getloadavg()]
    except Exception:
        pass

    try:
        # Memory from /proc/meminfo
        if os.path.isfile("/proc/meminfo"):
            mem = {}
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        key = parts[0].strip()
                        val = parts[1].strip().split()[0]
                        mem[key] = int(val)
            total_kb = mem.get("MemTotal", 0)
            avail_kb = mem.get("MemAvailable", mem.get("MemFree", 0))
            used_kb = total_kb - avail_kb
            if total_kb > 0:
                stats["ram_total_mb"] = round(total_kb / 1024, 1)
                stats["ram_used_mb"] = round(used_kb / 1024, 1)
                stats["ram_percent"] = round((used_kb / total_kb) * 100, 1)
    except Exception:
        pass

    try:
        # Uptime from /proc/uptime
        if os.path.isfile("/proc/uptime"):
            with open("/proc/uptime", "r") as f:
                up_sec = float(f.read().split()[0])
                days = int(up_sec // 86400)
                hours = int((up_sec % 86400) // 3600)
                minutes = int((up_sec % 3600) // 60)
                parts = []
                if days > 0:
                    parts.append(f"{days}d")
                if hours > 0 or days > 0:
                    parts.append(f"{hours}h")
                parts.append(f"{minutes}m")
                stats["uptime_str"] = " ".join(parts)
    except Exception:
        pass

    return stats


def get_easytier_peers():
    """Call easytier-cli peer -o json and return parsed structured list."""
    cli_path = os.path.join(BIN_DIR, "easytier-cli")
    if not os.path.isfile(cli_path):
        cli_path = "easytier-cli"

    cmd = [cli_path, "-p", "127.0.0.1:15888", "-o", "json", "peer"]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if res.returncode == 0 and res.stdout.strip():
            return json.loads(res.stdout)
    except Exception:
        pass

    # Try fallback without -p
    try:
        cmd2 = [cli_path, "-o", "json", "peer"]
        res2 = subprocess.run(cmd2, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if res2.returncode == 0 and res2.stdout.strip():
            return json.loads(res2.stdout)
    except Exception:
        pass

    return None


def get_easytier_routes():
    """Call easytier-cli route and return table/JSON."""
    cli_path = os.path.join(BIN_DIR, "easytier-cli")
    if not os.path.isfile(cli_path):
        cli_path = "easytier-cli"

    # Try json if supported, else text
    try:
        cmd = [cli_path, "-p", "127.0.0.1:15888", "-o", "json", "route"]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if res.returncode == 0 and res.stdout.strip():
            return json.loads(res.stdout)
    except Exception:
        pass

    try:
        cmd = [cli_path, "-p", "127.0.0.1:15888", "route"]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        if res.returncode == 0:
            return {"raw": res.stdout}
    except Exception:
        pass

    return {"raw": "Routing table unavailable or EasyTier offline."}


def get_tunnels():
    """Read HAProxy, iptables, GOST, and Realm configured tunnels."""
    tunnels = {"haproxy": [], "iptables": [], "gost": [], "realm": []}

    # HAProxy tunnels
    if os.path.isdir(HAPROXY_DIR):
        for fname in os.listdir(HAPROXY_DIR):
            if fname.endswith(".env"):
                data = load_env_file(os.path.join(HAPROXY_DIR, fname))
                if data:
                    tunnels["haproxy"].append(data)

    # iptables tunnels
    if os.path.isdir(IPTABLES_DIR):
        for fname in os.listdir(IPTABLES_DIR):
            if fname.endswith(".env"):
                data = load_env_file(os.path.join(IPTABLES_DIR, fname))
                if data:
                    tunnels["iptables"].append(data)

    # GOST tunnels
    if os.path.isdir(GOST_TUNNEL_DIR):
        for fname in os.listdir(GOST_TUNNEL_DIR):
            if fname.endswith(".env"):
                data = load_env_file(os.path.join(GOST_TUNNEL_DIR, fname))
                if data:
                    tunnels["gost"].append(data)

    # Realm tunnels
    if os.path.isdir(REALM_TUNNEL_DIR):
        for fname in os.listdir(REALM_TUNNEL_DIR):
            if fname.endswith(".env"):
                data = load_env_file(os.path.join(REALM_TUNNEL_DIR, fname))
                if data:
                    tunnels["realm"].append(data)

    # Check systemd status
    def check_service(name):
        try:
            r = subprocess.run(["systemctl", "is-active", name], stdout=subprocess.PIPE, text=True)
            return r.stdout.strip()
        except Exception:
            return "unknown"

    tunnels["haproxy_service"] = check_service("xraymesh-haproxy.service")
    tunnels["iptables_service"] = check_service("xraymesh-iptables.service")
    tunnels["gost_service"] = check_service("xraymesh-gost.service")
    tunnels["realm_service"] = check_service("xraymesh-realm.service")
    tunnels["iperf_service"] = check_service("xraymesh-iperf.service")

    return tunnels


def ensure_xraymesh_script():
    """Find the xraymesh.sh script path or automatically download it if missing."""
    import shutil
    candidates = [
        os.path.join(INSTALL_DIR, "xraymesh.sh"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "xraymesh.sh"),
        "/usr/local/bin/xraymesh",
    ]
    which_xraymesh = shutil.which("xraymesh")
    if which_xraymesh and which_xraymesh not in candidates:
        candidates.append(which_xraymesh)

    for c in candidates:
        if os.path.isfile(c) and os.access(c, os.R_OK):
            return c

    for loc in ["/root/xraymesh.sh", "/root/XRayMesh/xraymesh.sh"]:
        if os.path.isfile(loc) and os.access(loc, os.R_OK):
            return loc

    target = os.path.join(INSTALL_DIR, "xraymesh.sh")
    try:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        branch = get_active_branch()
        url = f"https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/{branch}/xraymesh.sh?t={int(time.time())}"
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "User-Agent": f"XRayMesh-Web/{CURRENT_VERSION}"
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                with open(target, "wb") as f:
                    f.write(resp.read())
                os.chmod(target, 0o755)
                try:
                    if not os.path.exists("/usr/local/bin/xraymesh"):
                        os.symlink(target, "/usr/local/bin/xraymesh")
                except Exception:
                    pass
                return target
    except Exception as e:
        sys.stderr.write(f"Failed to auto-download xraymesh.sh: {e}\n")

    return target


def ensure_cli_and_runner_fixed():
    """Ensure xraymesh-runner and xraymesh.sh do not contain accidental TCP fallback in pure UDP mode."""
    runner_path = os.path.join(INSTALL_DIR, "xraymesh-runner")
    if os.path.isfile(runner_path):
        try:
            with open(runner_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            changed = False
            old_udp_listener = 'args+=(--listeners "udp://0.0.0.0:${PORT}" --listeners "tcp://0.0.0.0:${PORT}")'
            new_udp_listener = 'args+=(--listeners "udp://0.0.0.0:${PORT}")'
            if old_udp_listener in content:
                content = content.replace(old_udp_listener, new_udp_listener)
                changed = True

            if re.search(r'udp\)\s+peer_args\+=\("tcp://\$\{target\}"\s+"udp://\$\{target\}"\)', content):
                content = re.sub(r'(udp\)\s+)peer_args\+=\("tcp://\$\{target\}"\s+"udp://\$\{target\}"\)', r'\1peer_args+=("udp://${target}")', content)
                changed = True

            if changed:
                with open(runner_path, "w", encoding="utf-8") as f:
                    f.write(content)
                os.chmod(runner_path, 0o755)
                print("[Cluster-Fix] Patched /opt/xraymesh/xraymesh-runner to ensure pure UDP execution.", flush=True)
        except Exception as e:
            print(f"[Cluster-Fix] Warning patching runner: {e}", flush=True)

    for sh_path in [os.path.join(INSTALL_DIR, "xraymesh.sh"), "/usr/local/bin/xraymesh"]:
        if os.path.isfile(sh_path):
            try:
                with open(sh_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                changed = False
                old_udp_listener = 'args+=(--listeners "udp://0.0.0.0:${PORT}" --listeners "tcp://0.0.0.0:${PORT}")'
                new_udp_listener = 'args+=(--listeners "udp://0.0.0.0:${PORT}")'
                if old_udp_listener in content:
                    content = content.replace(old_udp_listener, new_udp_listener)
                    changed = True
                if re.search(r'udp\)\s+peer_args\+=\("tcp://\$\{target\}"\s+"udp://\$\{target\}"\)', content):
                    content = re.sub(r'(udp\)\s+)peer_args\+=\("tcp://\$\{target\}"\s+"udp://\$\{target\}"\)', r'\1peer_args+=("udp://${target}")', content)
                    changed = True
                if changed:
                    with open(sh_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    os.chmod(sh_path, 0o755)
                    print(f"[Cluster-Fix] Patched {sh_path} to ensure pure UDP execution.", flush=True)
            except Exception:
                pass


def get_xraymesh_script():
    """Find the xraymesh.sh script path."""
    return ensure_xraymesh_script()


def get_network_interfaces():
    """Retrieve available host network interfaces using multiple discovery methods."""
    found = set()

    # 1. Method A: ip -o link show
    try:
        r = subprocess.run(["ip", "-o", "link", "show"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2)
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                parts = line.split(":", 2)
                if len(parts) >= 2:
                    iface = parts[1].strip().split("@")[0]
                    if iface and iface not in ("lo", "any") and not iface.startswith(("easytier", "docker", "veth", "br-")):
                        found.add(iface)
    except Exception:
        pass

    # 2. Method B: /sys/class/net directory listing
    try:
        if os.path.isdir("/sys/class/net"):
            for iface in os.listdir("/sys/class/net"):
                if iface not in ("lo", "any") and not iface.startswith(("easytier", "docker", "veth", "br-")):
                    found.add(iface)
    except Exception:
        pass

    # 3. Method C: /proc/net/dev inspection
    try:
        if os.path.isfile("/proc/net/dev"):
            with open("/proc/net/dev", "r") as f:
                for line in f:
                    if ":" in line:
                        iface = line.split(":")[0].strip()
                        if iface and iface not in ("lo", "any") and not iface.startswith(("easytier", "docker", "veth", "br-")):
                            found.add(iface)
    except Exception:
        pass

    return normalize_network_interfaces(sorted(found)) or ["any"]


def run_xraymesh_cmd(args, timeout=45):
    """Execute an xraymesh.sh command with arguments and return (success, message)."""
    ensure_cli_and_runner_fixed()
    script = get_xraymesh_script()
    if not os.path.isfile(script):
        return False, (
            f"XRayMesh CLI script not found at {script}. "
            f"Please run: bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/{get_active_branch()}/xraymesh.sh)"
        )
    cmd = ["bash", script] + args
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
        output = (r.stdout + "\n" + r.stderr).strip()
        clean_out = re.sub(r'\x1b\[[0-9;]*[mGKF]', '', output).strip()
        return r.returncode == 0, clean_out
    except subprocess.TimeoutExpired:
        return False, f"Command timed out after {timeout}s."
    except Exception as e:
        return False, str(e)


UPDATER_UNIT = "xraymesh-updater-temp"


def spawn_detached_node_update():
    """Start `xraymesh.sh node-update` outside the web service's cgroup and record it as queued.

    The web service is restarted during the update, so the updater must not be its child.
    Returns (ok, message, code) with code queued, already_running or launch_failed.
    """
    if update_job_running():
        return False, "An update is already running on this server.", "already_running"

    ensure_cli_and_runner_fixed()
    script = get_xraymesh_script()
    if not os.path.isfile(script):
        return False, f"XRayMesh CLI script not found at {script}", "launch_failed"

    branch = get_active_branch()
    now = int(time.time())
    job = {
        "state": "queued",
        "step": "queued",
        "branch": branch,
        "from_version": CURRENT_VERSION,
        "target_version": (get_cached_version_info() or {}).get("latest_version", ""),
        "error": "",
        "rolled_back": False,
        "started_at": now,
        "updated_at": now,
    }
    try:
        write_update_status(job)
    except Exception:
        pass

    # 1. A transient systemd unit survives the web service restart. The branch is passed
    #    explicitly because systemd-run does not inherit this process's environment.
    if shutil.which("systemd-run"):
        for cmd in (["systemctl", "stop", f"{UPDATER_UNIT}.service"], ["systemctl", "reset-failed", f"{UPDATER_UNIT}.service"]):
            try:
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
            except Exception:
                pass
        base = [
            "systemd-run",
            f"--unit={UPDATER_UNIT}",
            "--description=XRayMesh Background Node Updater",
            "--remain-after-exit=no",
            f"--setenv=XRAYMESH_BRANCH={branch}",
        ]
        # --collect (systemd 236+) cleans up failed runs; retry without it on older hosts.
        for extra in (["--collect"], []):
            try:
                r = subprocess.run(base + extra + ["bash", script, "node-update"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
                if r.returncode == 0:
                    return True, "Update started in a detached systemd unit.", "queued"
            except Exception:
                pass

    # 2. Fallback: a new session outside this request, logging to a file.
    try:
        log_file = "/var/log/xraymesh-update.log"
        with open(log_file, "ab") as log:
            subprocess.Popen(
                ["bash", script, "node-update"],
                stdout=log,
                stderr=log,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
                close_fds=True,
                env=dict(os.environ, XRAYMESH_BRANCH=branch),
            )
        return True, f"Update started in the background (log: {log_file}).", "queued"
    except Exception as e:
        job.update({"state": "failed", "step": "queued", "error": f"Could not start the updater: {e}", "finished_at": int(time.time())})
        try:
            write_update_status(job)
        except Exception:
            pass
        return False, f"Could not start the updater: {e}", "launch_failed"


_public_ip_cache = {"ip": "", "time": 0.0}

def is_public_ipv4(ip_str):
    """Check if an IPv4 address is publicly routable (not private/loopback/carrier-grade)."""
    if not ip_str or not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip_str):
        return False
    parts = [int(p) for p in ip_str.split(".")]
    if any(p < 0 or p > 255 for p in parts):
        return False
    if parts[0] in (0, 10, 127):
        return False
    if parts[0] == 172 and 16 <= parts[1] <= 31:
        return False
    if parts[0] == 192 and parts[1] == 168:
        return False
    if parts[0] == 169 and parts[1] == 254:
        return False
    if parts[0] == 100 and 64 <= parts[1] <= 127:  # Carrier-grade NAT
        return False
    return True

def get_server_public_ip():
    """Detect public IPv4 of the server prioritizing local physical interfaces before outbound NAT (cached 60s)."""
    now = time.time()
    if _public_ip_cache["ip"] and (now - _public_ip_cache["time"]) < 60:
        return _public_ip_cache["ip"]

    # 1. Check web.env or config.env for explicit public IP
    web_cfg = load_env_file(WEB_ENV_FILE)
    node_cfg = load_env_file(CONFIG_FILE)
    configured = web_cfg.get("WEB_PUBLIC_IP") or node_cfg.get("PUBLIC_IP")
    if configured and is_public_ipv4(configured):
        _public_ip_cache["ip"] = configured
        _public_ip_cache["time"] = now
        return configured

    # 2. Check physical network interfaces for a directly bound public IPv4
    try:
        r = subprocess.run(["ip", "-o", "-4", "addr", "show", "scope", "global"], stdout=subprocess.PIPE, text=True, timeout=2)
        for line in r.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 4:
                dev = parts[1]
                if any(dev.startswith(pfx) for pfx in ("easytier", "tun", "tap", "docker", "br-", "veth", "wg", "lo")):
                    continue
                ip = parts[3].split("/")[0]
                if is_public_ipv4(ip):
                    _public_ip_cache["ip"] = ip
                    _public_ip_cache["time"] = now
                    return ip
    except Exception:
        pass

    # 3. Route lookup (if default route source is public)
    try:
        r = subprocess.run(["ip", "route", "get", "1.1.1.1"], stdout=subprocess.PIPE, text=True, timeout=2)
        m = re.search(r"src\s+([0-9.]+)", r.stdout)
        if m and is_public_ipv4(m.group(1)):
            ip = m.group(1)
            _public_ip_cache["ip"] = ip
            _public_ip_cache["time"] = now
            return ip
    except Exception:
        pass

    # 4. Multi-provider external query (fallback for 1:1 NAT cloud servers)
    providers = [
        "https://api.ipify.org",
        "https://icanhazip.com",
        "https://ifconfig.me/ip",
        "https://checkip.amazonaws.com"
    ]
    for url in providers:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "curl/7.88.1"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                ip = resp.read().decode("utf-8").strip()
                if is_public_ipv4(ip):
                    _public_ip_cache["ip"] = ip
                    _public_ip_cache["time"] = now
                    return ip
        except Exception:
            continue

    # Fallback to curl CLI
    for url in ("https://api.ipify.org", "https://icanhazip.com"):
        try:
            r = subprocess.run(["curl", "-4", "-s", "--connect-timeout", "2", url], stdout=subprocess.PIPE, text=True, timeout=3)
            ip = r.stdout.strip()
            if is_public_ipv4(ip):
                _public_ip_cache["ip"] = ip
                _public_ip_cache["time"] = now
                return ip
        except Exception:
            pass

    # Route lookup fallback (only accept if truly public)
    try:
        r = subprocess.run(["ip", "route", "get", "1.1.1.1"], stdout=subprocess.PIPE, text=True, timeout=2)
        m = re.search(r"src\s+([0-9.]+)", r.stdout)
        if m and is_public_ipv4(m.group(1)):
            ip = m.group(1)
            _public_ip_cache["ip"] = ip
            _public_ip_cache["time"] = now
            return ip
    except Exception:
        pass

    return ""


def valid_tunnel_name(name):
    """Return True for tunnel names safe for env filenames and CLI usage."""
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,31}", name or ""))


def sanitize_peer_endpoint(raw_peer, default_port="11010"):
    """
    Sanitize and validate a peer endpoint string.
    Returns cleaned 'scheme://host:port' or 'host:port', or '' if invalid.
    Fixes double colons, trailing colons, and missing hosts.
    """
    if not raw_peer:
        return ""
    p = str(raw_peer).strip().rstrip("/")
    if not p:
        return ""
    scheme = ""
    if "://" in p:
        scheme, p = p.split("://", 1)
        scheme = scheme.lower().strip()

    p = p.rstrip(":")
    if not p or p.startswith(":") or p.isdigit():
        return ""

    if "[" in p and "]" in p:
        m = re.match(r"^(\[[^\]]+\])(?::+(\d+))?$", p)
        if not m:
            return ""
        host = m.group(1)
        port = m.group(2) or str(default_port)
    else:
        m = re.match(r"^(.+?):+(\d+)$", p)
        if m:
            host = m.group(1).rstrip(":")
            port = m.group(2)
        else:
            host = p.rstrip(":")
            port = str(default_port)

    if not host or host.startswith(":") or host == ":" or host.isdigit():
        return ""
    if not str(port).isdigit():
        port = str(default_port)

    hostport = f"{host}:{port}"
    if scheme:
        if scheme in ("ws", "wss"):
            return f"{scheme}://{hostport}/"
        return f"{scheme}://{hostport}"
    return hostport


MESH_PROTOCOLS = ("dual", "udp", "tcp", "ws", "wss", "quic", "faketcp")

# Zero-width and bidi control characters that chat apps and RTL pages slip into copied text.
_INVISIBLE_CHARS_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]")
_INVITE_RUN_RE = re.compile(r"[A-Za-z0-9+/_=\s-]+")


class InviteTokenError(ValueError):
    """Raised when a pasted mesh invite code cannot be used. `code` is a stable id for the UI."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _decode_invite_candidate(token):
    token = token.replace("-", "+").replace("_", "/").rstrip("=")
    if not token:
        return None
    token += "=" * (-len(token) % 4)
    try:
        text = base64.b64decode(token, validate=True).decode("utf-8")
        data, _ = json.JSONDecoder().raw_decode(text.lstrip())
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def decode_invite_token(raw):
    """
    Decode an xrmesh:// invite code into a normalized dict.
    Tolerates surrounding text, line wrapping, invisible bidi marks, URL-safe base64
    and missing padding, because codes are usually copied from terminals or chat apps.
    """
    text = _INVISIBLE_CHARS_RE.sub("", str(raw or ""))
    prefix = re.search(r"xrmesh://", text, re.IGNORECASE)
    if prefix:
        text = text[prefix.end():]
    text = re.sub(r"^[^A-Za-z0-9+/_-]+", "", text)
    run = _INVITE_RUN_RE.match(text)
    run = run.group(0) if run else ""

    # A wrapped code spans several lines; a code followed by other words must stop at the first gap.
    data = None
    for candidate in (re.sub(r"\s+", "", run), run.split()[0] if run.split() else ""):
        data = _decode_invite_candidate(candidate)
        if data is not None:
            break
    if data is None:
        raise InviteTokenError(
            "invalid_invite",
            "This is not a valid XRayMesh invite code. Copy the complete code that starts with xrmesh:// and try again.",
        )

    net = str(data.get("net") or data.get("network_name") or "").strip()
    secret = str(data.get("secret") or data.get("network_secret") or "").strip()
    if not net or not secret:
        raise InviteTokenError("invite_incomplete", "The invite code is missing the network name or secret.")

    proto = str(data.get("proto") or data.get("protocol") or "dual").strip().lower()
    invite = {
        "net": net,
        "secret": secret,
        "endpoint": str(data.get("endpoint") or data.get("peer") or "").strip(),
        "proto": proto if proto in MESH_PROTOCOLS else "dual",
    }
    # Optional transport settings (added in 2.2.6-beta.4) so a joining node matches the mesh.
    for key in ("enc", "kcp", "ipv6"):
        if isinstance(data.get(key), bool):
            invite[key] = data[key]
    mtu = data.get("mtu")
    if isinstance(mtu, int) and not isinstance(mtu, bool) and 576 <= mtu <= 9000:
        invite["mtu"] = mtu
    return invite


def valid_mesh_hostname(name):
    """Return True for node names EasyTier and the peer listings can display safely."""
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,62}", name or ""))


def valid_ipv4(ip_str):
    """Return True for a dotted-quad IPv4 address written with ASCII digits."""
    if not re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", ip_str or "", re.ASCII):
        return False
    return all(int(p) <= 255 for p in ip_str.split("."))


def parse_port(value):
    """Return the port as an int when it is within 1-65535, otherwise None."""
    try:
        port = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return port if 1 <= port <= 65535 else None


def write_config_bytes(raw):
    """Atomically restore CONFIG_FILE from raw bytes with secure permissions."""
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "wb") as f:
        f.write(raw)
    try:
        os.chmod(tmp, 0o600)
    except Exception:
        pass
    os.replace(tmp, CONFIG_FILE)


def save_node_config_env(cfg):
    """Write dictionary to CONFIG_FILE with secure file permissions."""
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    if "PEERS" in cfg:
        mesh_port = str(cfg.get("PORT", "11010"))
        clean_p = []
        for p in str(cfg["PEERS"]).split(","):
            sp = sanitize_peer_endpoint(p, mesh_port)
            if sp and sp not in clean_p:
                clean_p.append(sp)
        cfg["PEERS"] = ",".join(clean_p)

    lines = []
    keys = [
        "NETWORK_NAME", "NETWORK_SECRET", "HOSTNAME", "IPV4",
        "PROTOCOL", "PORT", "PEERS", "ENCRYPTION", "IPV6",
        "MTU", "ENABLE_KCP"
    ]
    for k in keys:
        v = str(cfg.get(k, ""))
        escaped_v = v.replace("'", "'\\''")
        lines.append(f"{k}='{escaped_v}'\n")

    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.writelines(lines)
    try:
        os.chmod(tmp, 0o600)
    except Exception:
        pass
    os.replace(tmp, CONFIG_FILE)


# ==============================================================================
# 🌐 SafeSync: Mesh-Wide Cluster Synchronization & Rollback Watchdog
# ==============================================================================

CLUSTER_NONCE_CACHE = {}  # nonce -> timestamp
ROLLBACK_TIMER = None
ROLLBACK_LOCK = threading.Lock()
ROLLBACK_EXPIRY = 0.0
LAST_ROLLBACK = {
    "occurred": False,
    "timestamp": 0,
    "reason": "",
    "failed_protocol": "",
    "restored_protocol": ""
}

ALLOWED_CLUSTER_KEYS = (
    "PROTOCOL",
    "ENABLE_KCP",
    "ENCRYPTION",
    "IPV6",
    "MTU",
    "NETWORK_SECRET",
    "NETWORK_NAME",
)


def cleanup_nonce_cache():
    now = time.time()
    for n in list(CLUSTER_NONCE_CACHE.keys()):
        if now - CLUSTER_NONCE_CACHE[n] > 120.0:
            del CLUSTER_NONCE_CACHE[n]


def verify_cluster_hmac(headers, raw_body):
    """Verify HMAC-SHA256 signature on inter-node cluster commands with clock-skew tolerance and secret fallback."""
    cleanup_nonce_cache()
    sig = headers.get("X-Cluster-Signature", "").strip()
    ts_str = headers.get("X-Cluster-Timestamp", "").strip()
    nonce = headers.get("X-Cluster-Nonce", "").strip()
    direct_secret = headers.get("X-Cluster-Secret", "").strip()

    cfg = load_env_file(CONFIG_FILE)
    secret = cfg.get("NETWORK_SECRET", "").strip()
    secrets_to_try = [secret]
    if os.path.isfile(CONFIG_BACKUP_FILE):
        bak_cfg = load_env_file(CONFIG_BACKUP_FILE)
        bak_secret = bak_cfg.get("NETWORK_SECRET", "").strip()
        if bak_secret and bak_secret not in secrets_to_try:
            secrets_to_try.append(bak_secret)

    # 1. If direct secret matches, authenticate immediately (safeguard against clock skew or proxy header loss)
    if direct_secret and any(s and secrets.compare_digest(direct_secret, s) for s in secrets_to_try):
        if nonce:
            CLUSTER_NONCE_CACHE[nonce] = time.time()
        return True, ""

    if not sig or not ts_str or not nonce:
        return False, "Missing cluster authentication headers"

    try:
        ts = float(ts_str)
    except Exception:
        return False, "Invalid timestamp"

    now = time.time()
    if abs(now - ts) > 300.0:
        return False, f"Request expired or clock skew (drift: {round(abs(now - ts), 1)}s)"

    if nonce in CLUSTER_NONCE_CACHE:
        return False, "Replay attack detected (nonce already processed)"

    body_hash = hashlib.sha256(raw_body if raw_body else b"{}").hexdigest()
    msg = f"{ts_str}\n{nonce}\n{body_hash}".encode("utf-8")

    verified = False
    for s in secrets_to_try:
        if not s:
            continue
        expected = hmac.new(s.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        if secrets.compare_digest(sig.lower(), expected.lower()):
            verified = True
            break

    if not verified:
        return False, "Invalid HMAC signature"

    CLUSTER_NONCE_CACHE[nonce] = now
    return True, ""


def sign_cluster_request(secret, payload_dict):
    """Sign inter-node cluster request using HMAC-SHA256 and include direct secret fallback."""
    body_bytes = json.dumps(payload_dict, ensure_ascii=False).encode("utf-8")
    ts_str = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    msg = f"{ts_str}\n{nonce}\n{body_hash}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "X-Cluster-Signature": sig,
        "X-Cluster-Timestamp": ts_str,
        "X-Cluster-Nonce": nonce,
        "X-Cluster-Secret": secret,
        "User-Agent": f"XRayMesh-Cluster/{CURRENT_VERSION}"
    }
    return body_bytes, headers


def rollback_cluster_config(reason=None):
    """Revert configuration from backup and restart node service."""
    global LAST_ROLLBACK
    if os.path.isfile(CONFIG_BACKUP_FILE):
        try:
            failed_cfg = load_env_file(CONFIG_FILE)
            failed_proto = failed_cfg.get("PROTOCOL", "unknown")
            backup_cfg = load_env_file(CONFIG_BACKUP_FILE)
            restored_proto = backup_cfg.get("PROTOCOL", "dual")

            shutil.copy2(CONFIG_BACKUP_FILE, CONFIG_FILE)
            try:
                os.remove(CONFIG_STAGED_FILE)
            except Exception:
                pass

            LAST_ROLLBACK = {
                "occurred": True,
                "timestamp": int(time.time()),
                "reason": reason or f"Automatic self-healing rollback: No active peers connected with protocol '{failed_proto}' within 90s (UDP packet drop/filtering). Restored safe '{restored_proto}' configuration.",
                "failed_protocol": failed_proto,
                "restored_protocol": restored_proto
            }
            print(f"[Cluster-Rollback] {LAST_ROLLBACK['reason']}", flush=True)
            print("[Cluster-Rollback] Restored config from backup! Restarting node...", flush=True)
            ensure_cli_and_runner_fixed()
            run_xraymesh_cmd(["node-restart"])
            return True
        except Exception as e:
            print(f"[Cluster-Rollback] Error rolling back: {e}", flush=True)
    return False


def arm_rollback_watchdog(timeout_sec=90):
    """Arm a self-healing rollback watchdog. If no peers connect within timeout, auto-rollback."""
    global ROLLBACK_TIMER, ROLLBACK_EXPIRY
    with ROLLBACK_LOCK:
        if ROLLBACK_TIMER:
            ROLLBACK_TIMER.cancel()
        ROLLBACK_EXPIRY = time.time() + timeout_sec

        def watchdog_action():
            print("[Cluster-Watchdog] Timer expired! Verifying peer connectivity...", flush=True)
            peers = get_easytier_peers()
            connected = False
            if peers:
                for p in peers:
                    cost = str(p.get("cost", "0"))
                    if cost not in ("0", "Local", "none", ""):
                        connected = True
                        break
            if not connected:
                print("[Cluster-Watchdog] ⚠️ No active peers detected after configuration sync. Initiating self-healing rollback!", flush=True)
                rollback_cluster_config()
            else:
                print("[Cluster-Watchdog] ✓ Active peer detected. Configuration verified safe.", flush=True)

        ROLLBACK_TIMER = threading.Timer(timeout_sec, watchdog_action)
        ROLLBACK_TIMER.daemon = True
        ROLLBACK_TIMER.start()


def disarm_rollback_watchdog():
    """Disarm the rollback watchdog once configuration safety is verified."""
    global ROLLBACK_TIMER, ROLLBACK_EXPIRY
    with ROLLBACK_LOCK:
        if ROLLBACK_TIMER:
            ROLLBACK_TIMER.cancel()
            ROLLBACK_TIMER = None
        ROLLBACK_EXPIRY = 0.0


def apply_staged_cluster_config():
    """Apply staged configuration, create backup, arm watchdog, and restart service."""
    if not os.path.isfile(CONFIG_STAGED_FILE):
        return False, "No staged configuration found"

    staged = load_env_file(CONFIG_STAGED_FILE)
    if not staged:
        return False, "Staged configuration file is empty"

    current = load_env_file(CONFIG_FILE)
    # 1. Create backup
    try:
        shutil.copy2(CONFIG_FILE, CONFIG_BACKUP_FILE)
    except Exception as e:
        return False, f"Failed to backup current config: {e}"

    # 2. Merge only cluster-wide keys, preserving node identity (Hostname, IPV4, Port)
    for k in ALLOWED_CLUSTER_KEYS:
        if k in staged and staged[k] != "":
            current[k] = staged[k]

    # 3. Save new config
    save_node_config_env(current)

    # 4. Remove staged file
    try:
        os.remove(CONFIG_STAGED_FILE)
    except Exception:
        pass

    # 5. Arm rollback watchdog (90 seconds)
    arm_rollback_watchdog(timeout_sec=90)

    # 6. Restart node service in background thread so HTTP response returns immediately
    def restart_bg():
        time.sleep(0.4)
        ensure_cli_and_runner_fixed()
        run_xraymesh_cmd(["node-restart"])

    threading.Thread(target=restart_bg, daemon=True).start()
    return True, "Config committed. Service restarting with 90s rollback watchdog."


def send_cluster_http(target_ip, target_port, endpoint, secret, payload, timeout=6, strict_port=False):
    """Send signed HTTP/HTTPS POST request to a cluster peer over mesh network,
    probing candidate ports if connection to target_port fails."""
    ok, data, _ = cluster_request(target_ip, target_port, endpoint, secret, payload, timeout, strict_port)
    if not ok and isinstance(data, dict):
        data = data.get("error") or str(data)
    return ok, data


def cluster_request(target_ip, target_port, endpoint, secret, payload, timeout=6, strict_port=False):
    """Like send_cluster_http, but also returns the HTTP status of the last reply
    (None when the peer could not be reached at all)."""
    body_bytes, headers = sign_cluster_request(secret, payload)

    insecure_ssl_ctx = ssl.create_default_context()
    insecure_ssl_ctx.check_hostname = False
    insecure_ssl_ctx.verify_mode = ssl.CERT_NONE

    if strict_port and target_port:
        try:
            ports_to_try = [int(target_port)]
        except (TypeError, ValueError):
            ports_to_try = get_peer_port_candidates(target_ip, target_port)
    else:
        ports_to_try = get_peer_port_candidates(target_ip, target_port)

    schemes = ("https", "http") if is_ssl_enabled() else ("http", "https")
    last_err = "Failed to connect to cluster peer"
    last_status = None

    for port in ports_to_try:
        for scheme in schemes:
            url = f"{scheme}://{target_ip}:{port}{endpoint}"
            req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
            try:
                ctx = insecure_ssl_ctx if scheme == "https" else None
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if target_ip in PEER_VERSION_CACHE:
                        PEER_VERSION_CACHE[target_ip]["port"] = port
                    return True, data, resp.status
            except urllib.error.HTTPError as e:
                last_status = e.code
                try:
                    err_data = json.loads(e.read().decode("utf-8"))
                    last_err = err_data.get("error", str(e)) if isinstance(err_data, dict) else str(e)
                    if isinstance(err_data, dict) and err_data.get("code"):
                        return False, err_data, e.code
                except Exception:
                    last_err = str(e)
                # 403 and 404 mean we reached an XRayMesh panel: wrong secret, or too old for this endpoint.
                if e.code in (403, 404):
                    return False, last_err, e.code
                continue
            except Exception as e:
                last_err = str(e)
                continue
    return False, last_err, last_status


def cluster_error_code(http_status):
    """Map a failed cluster_request to a stable code the UI can explain."""
    if http_status == 403:
        return "auth_failed"
    if http_status == 404:
        return "unsupported"
    if http_status is None:
        return "unreachable"
    return "remote_error"


def get_remote_network_interfaces(peer_ip, secret, timeout=2.0):
    """Resolve interfaces from the selected peer without degrading failures to any."""
    cached_interfaces = normalize_network_interfaces(
        PEER_VERSION_CACHE.get(peer_ip, {}).get("interfaces")
    )
    cached_peer = PEER_VERSION_CACHE.get(peer_ip, {})
    cache_is_fresh = (
        cached_interfaces
        and time.time() - cached_peer.get("timestamp", 0) < 60.0
    )
    if cache_is_fresh:
        return cached_interfaces, "Used cached interface metadata from the peer probe."

    peer_info, responsive_port, info_error = fetch_peer_cluster_info(
        peer_ip,
        cached_peer.get("port") or PORT,
        timeout,
        strict_port=True,
    )
    info_interfaces = normalize_network_interfaces(peer_info.get("interfaces") if peer_info else None)
    if info_interfaces:
        cached_peer = PEER_VERSION_CACHE.setdefault(peer_ip, {})
        cached_peer["interfaces"] = info_interfaces
        if responsive_port:
            cached_peer["port"] = responsive_port
        cached_peer["timestamp"] = time.time()
        return info_interfaces, "Used public cluster metadata for interface discovery."


    signed_target_port = responsive_port or PORT
    signed_ok, signed_response = send_cluster_http(
        peer_ip,
        signed_target_port,
        "/api/cluster/interfaces",
        secret,
        {},
        timeout=timeout,
        strict_port=True,
    )
    signed_interfaces = None
    signed_error = str(signed_response) if not signed_ok else "Remote response did not include interfaces"
    if signed_ok and isinstance(signed_response, dict) and signed_response.get("ok"):
        signed_interfaces = normalize_network_interfaces(signed_response.get("interfaces"))
        if signed_interfaces:
            cached_peer = PEER_VERSION_CACHE.setdefault(peer_ip, {})
            cached_peer["interfaces"] = signed_interfaces
            if signed_target_port:
                cached_peer["port"] = signed_target_port
            cached_peer["timestamp"] = time.time()
            return signed_interfaces, ""

    if cached_interfaces:
        return cached_interfaces, "Used cached interface metadata from the peer probe."

    errors = [error for error in (signed_error, info_error) if error]
    return [], "; ".join(dict.fromkeys(errors))


def is_local_origin(origin_node):
    """Check if the provided origin_node represents the local machine."""
    origin = (origin_node or "").strip()
    if not origin or origin in ("local", "127.0.0.1"):
        return True
    cfg = load_env_file(CONFIG_FILE)
    local_ip = cfg.get("IPV4", "").strip()
    return bool(local_ip and origin == local_ip)


TUNNEL_TYPES = ("haproxy", "iptables", "gost", "realm")
TUNNEL_CACHE = {}  # peer ip -> {"tunnels": {...}, "name": str, "fetched_at": ts}
TUNNEL_CACHE_LOCK = threading.Lock()
TUNNEL_FETCH_TIMEOUT = 3.0
TUNNEL_FETCH_DEADLINE = 8.0


def get_tunnel_nodes():
    """Return (local node, reachable mesh peers) for the tunnels view."""
    cfg = load_env_file(CONFIG_FILE)
    local_ip = cfg.get("IPV4", "127.0.0.1")
    local_node = {"ip": local_ip, "name": cfg.get("HOSTNAME", "local")}

    peers_raw = get_easytier_peers() or []
    if isinstance(peers_raw, dict):
        peers_raw = peers_raw.get("peers", []) or []

    peers, seen = [], set()
    for p in peers_raw:
        if not isinstance(p, dict):
            continue
        vip = str(p.get("ipv4", "")).strip()
        cost = str(p.get("cost", "0"))
        if vip and vip != local_ip and vip not in seen and cost not in ("0", "Local", "none", ""):
            seen.add(vip)
            peers.append({"ip": vip, "name": p.get("hostname") or vip})
    return local_node, peers


def tag_remote_tunnels(tunnels, ip, name):
    out = {}
    for t_type in TUNNEL_TYPES:
        items = []
        for item in tunnels.get(t_type, []) or []:
            if isinstance(item, dict):
                items.append(dict(item, _node_ip=ip, _node_name=name, _is_local=False))
        out[t_type] = items
    return out


def tunnel_cache_fallback(peer, status, error):
    """Serve the last good tunnel list for a peer that failed to answer."""
    with TUNNEL_CACHE_LOCK:
        cached = TUNNEL_CACHE.get(peer["ip"])
    node = {
        "ip": peer["ip"],
        "name": (cached or {}).get("name") or peer["name"],
        "is_local": False,
        "status": status,
        "error": error,
        "stale": bool(cached),
        "fetched_at": (cached or {}).get("fetched_at"),
    }
    data = (cached or {}).get("tunnels") or {t: [] for t in TUNNEL_TYPES}
    return data, node


def fetch_remote_tunnels(peer):
    """Fetch one peer's tunnels with a retry; fall back to the cached copy on failure."""
    cfg = load_env_file(CONFIG_FILE)
    secret = cfg.get("NETWORK_SECRET", "").strip()
    known_port = PEER_VERSION_CACHE.get(peer["ip"], {}).get("port")
    # Lossy links: first try the port that answered before, then widen the search once.
    attempts = [(known_port, True), (PORT, False)] if known_port else [(PORT, False), (PORT, False)]

    status, error = "unreachable", "Failed to connect to cluster peer"
    for port, strict in attempts:
        started = time.time()
        ok, res, http_status = cluster_request(
            peer["ip"], port, "/api/cluster/tunnels", secret, {}, TUNNEL_FETCH_TIMEOUT, strict
        )
        if ok and isinstance(res, dict) and res.get("ok"):
            name = res.get("node_name") or peer["name"]
            data = tag_remote_tunnels(res.get("tunnels") or {}, peer["ip"], name)
            now = time.time()
            with TUNNEL_CACHE_LOCK:
                TUNNEL_CACHE[peer["ip"]] = {"tunnels": data, "name": name, "fetched_at": now}
            return data, {
                "ip": peer["ip"], "name": name, "is_local": False, "status": "ok",
                "stale": False, "fetched_at": now, "latency_ms": int((now - started) * 1000),
            }
        status = cluster_error_code(http_status)
        error = res.get("error") if isinstance(res, dict) else str(res)
        if status in ("auth_failed", "unsupported"):
            break  # Retrying will not change a definitive answer.
    return tunnel_cache_fallback(peer, status, error)


def proxy_tunnel_if_remote(handler, data, tunnel_type, action):
    """If origin_node is specified and not local, forward tunnel request via HMAC-signed cluster request."""
    origin_node = (data.get("origin_node") or "").strip()
    if not is_local_origin(origin_node):
        secret = cfg.get("NETWORK_SECRET", "").strip()
        payload = dict(data)
        payload["tunnel_type"] = tunnel_type
        ok, res = send_cluster_http(origin_node, PORT, f"/api/cluster/tunnel/{action}", secret, payload, timeout=8)
        if ok and isinstance(res, dict) and res.get("ok"):
            handler.send_json({"ok": True, "message": res.get("message", f"Tunnel {action} succeeded on remote node {origin_node}.")})
        else:
            err = res.get("error") if isinstance(res, dict) else str(res)
            handler.send_json({"ok": False, "error": f"Remote node {origin_node} error: {err}"}, status=400)
        return True
    return False


def execute_iperf_benchmark(target, protocol="tcp", duration=5, bandwidth="50M", port=5201, source_ip=None):
    if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target):
        return False, "Invalid target IP", 400

    if protocol not in ("tcp", "udp"):
        protocol = "tcp"

    # Check iperf3 command available
    try:
        subprocess.run(["iperf3", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except Exception:
        return False, "iperf3 is not installed on this server. Run sudo ./xraymesh.sh web to install.", 500

    cmd = ["iperf3", "-c", target, "-p", str(port), "-t", str(duration), "-J"]
    if protocol == "udp":
        cmd.extend(["-u", "-b", bandwidth])

    try:
        # Add 8s grace period to timeout
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=duration + 8)
        raw_json = res.stdout.strip()
        if not raw_json:
            err_msg = res.stderr.strip() or "No output from iperf3 test"
            return False, err_msg, 500

        parsed_res = json.loads(raw_json)

        if "error" in parsed_res:
            return False, parsed_res["error"], 500

        benchmark = {
            "source": source_ip or "local",
            "target": target,
            "protocol": protocol,
            "duration": duration,
            "error": None,
            "intervals": [],
            "summary": {}
        }

        end_data = parsed_res.get("end", {})
        if protocol == "tcp":
            sum_sent = end_data.get("sum_sent", {})
            sum_received = end_data.get("sum_received", {})
            benchmark["summary"] = {
                "sent_mbps": round(sum_sent.get("bits_per_second", 0) / 1e6, 2),
                "received_mbps": round(sum_received.get("bits_per_second", 0) / 1e6, 2),
                "total_bytes_sent": sum_sent.get("bytes", 0),
                "total_bytes_received": sum_received.get("bytes", 0),
                "retransmits": sum_sent.get("retransmits", 0)
            }
        else:
            sum_udp = end_data.get("sum", {})
            benchmark["summary"] = {
                "mbps": round(sum_udp.get("bits_per_second", 0) / 1e6, 2),
                "total_bytes": sum_udp.get("bytes", 0),
                "jitter_ms": round(sum_udp.get("jitter_ms", 0), 3),
                "lost_packets": sum_udp.get("lost_packets", 0),
                "total_packets": sum_udp.get("packets", 0),
                "loss_percent": round(sum_udp.get("lost_percent", 0), 2)
            }

        # Add interval data for charting
        for interval in parsed_res.get("intervals", []):
            sum_int = interval.get("sum", {})
            benchmark["intervals"].append({
                "start": sum_int.get("start", 0),
                "end": sum_int.get("end", 0),
                "interval": sum_int.get("start", 0),
                "mbps": round(sum_int.get("bits_per_second", 0) / 1e6, 2)
            })

        return True, benchmark, 200
    except subprocess.TimeoutExpired:
        return False, "iperf3 test timed out. Ensure the target node is running an iperf3 server on port 5201.", 504
    except Exception as e:
        return False, str(e), 500


def execute_ping_benchmark(target, count=4, source_ip=None):
    if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target):
        return False, "Invalid target IP", 400

    count = min(max(int(count), 1), 10)
    try:
        cmd = ["ping", "-c", str(count), "-W", "2", target]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=count * 2 + 5)
        output = res.stdout

        stats = {
            "source": source_ip or "local",
            "target": target,
            "count": count,
            "raw": output,
            "packets_sent": count,
            "packets_received": 0,
            "packet_loss_percent": 100.0,
            "min_ms": 0.0,
            "avg_ms": 0.0,
            "max_ms": 0.0,
            "mdev_ms": 0.0
        }

        loss_match = re.search(r"(\d+)% packet loss", output)
        if loss_match:
            stats["packet_loss_percent"] = float(loss_match.group(1))

        rx_match = re.search(r"(\d+)\s+(?:packets\s+)?received", output)
        if rx_match:
            stats["packets_received"] = int(rx_match.group(1))

        rtt_match = re.search(r"(?:rtt|round-trip)\s+min/avg/max/(?:mdev|stddev)\s*=\s*([0-9.]+)/([0-9.]+)/([0-9.]+)/([0-9.]+)", output)
        if rtt_match:
            stats["min_ms"] = float(rtt_match.group(1))
            stats["avg_ms"] = float(rtt_match.group(2))
            stats["max_ms"] = float(rtt_match.group(3))
            stats["mdev_ms"] = float(rtt_match.group(4))

        return True, stats, 200
    except subprocess.TimeoutExpired:
        return False, "Ping request timed out", 504
    except Exception as e:
        return False, str(e), 500


class XRayMeshHandler(http.server.BaseHTTPRequestHandler):
    """Custom HTTP handler with REST API and Single Page Application routing."""

    server_version = f"XRayMesh-Web/{CURRENT_VERSION}"

    def log_message(self, format, *args):
        # Suppress noisy standard logging, only print relevant notices
        pass

    def send_json(self, data, status=200, headers=None):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def serve_static(self, filepath, content_type="text/html; charset=utf-8", extra_headers=None):
        if not os.path.isfile(filepath):
            self.send_error(404, "File not found")
            return
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            if extra_headers:
                for k, v in extra_headers.items():
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Server", f"XRayMesh-Web/{CURRENT_VERSION}")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = dict(urllib.parse.parse_qsl(parsed.query))

        # Check token parameter in URL for one-click browser entry (scope to web dashboard root)
        if path in ("/", "/index.html") and "token" in query:
            token = query["token"]
            if validate_token(token):
                session_id = create_session()
                # Redirect to clean URL '/' with Set-Cookie
                cookie_val = get_session_cookie(session_id)
                self.send_response(302)
                self.send_header("Location", "/")
                self.send_header("Set-Cookie", cookie_val)
                self.end_headers()
                return

        # Check authentication for API endpoints
        auth_ok, session_or_token = is_authenticated(self.headers, query)

        # Static root
        if path == "/" or path == "/index.html":
            index_path = os.path.join(STATIC_DIR, "index.html")
            self.serve_static(index_path, "text/html; charset=utf-8")
            return

        # Auth status check
        if path == "/api/auth/status":
            web_cfg = load_env_file(WEB_ENV_FILE)
            has_pw = bool(web_cfg.get("WEB_PASSWORD_HASH"))
            node_cfg = load_env_file(CONFIG_FILE)
            is_node_configured = os.path.isfile(CONFIG_FILE) and bool(node_cfg.get("IPV4"))
            self.send_json({
                "authenticated": auth_ok,
                "password_configured": has_pw,
                "node_configured": is_node_configured
            })
            return

        # Mesh inter-node version/node info probe (unauthenticated for cluster peers)
        if path == "/api/cluster/info":
            config = load_env_file(CONFIG_FILE)
            info = {
                "ok": True,
                "hostname": config.get("HOSTNAME", ""),
                "ipv4": config.get("IPV4", ""),
                "interfaces": get_network_interfaces()
            }
            # version, branch, channel, latest_version, update_available and the update job summary.
            info.update(local_update_summary())
            self.send_json(info)
            return

        # Protected API endpoints below
        if not auth_ok:
            self.send_json({"error": "Unauthorized", "authenticated": False}, status=401)
            return

        if path == "/api/version":
            self.send_json({
                "ok": True,
                "data": get_version_info(force=query.get("refresh") == "1")
            })
            return

        elif path == "/api/update/status":
            info = get_version_info()
            summary = local_update_summary()
            summary["latest_version"] = info.get("latest_version", "")
            summary["update_available"] = bool(info.get("update_available"))
            summary["checked"] = bool(info.get("checked"))
            self.send_json({"ok": True, "data": summary})
            return

        elif path == "/api/status":
            config = load_env_file(CONFIG_FILE)
            system_stats = get_system_stats()

            # EasyTier Service Status
            svc_active = False
            try:
                r = subprocess.run(["systemctl", "is-active", "--quiet", "xraymesh.service"], timeout=3)
                svc_active = (r.returncode == 0)
            except Exception:
                pass

            # EasyTier Version
            et_ver = "unknown"
            ver_file = os.path.join(INSTALL_DIR, "easytier.version")
            if os.path.isfile(ver_file):
                try:
                    with open(ver_file, "r") as vf:
                        et_ver = vf.read().strip()
                except Exception:
                    pass

            web_cfg = load_env_file(WEB_ENV_FILE)
            default_host = os.uname().nodename if hasattr(os, "uname") else "node"
            is_node_configured = os.path.isfile(CONFIG_FILE) and bool(config.get("IPV4"))
            self.send_json({
                "node": {
                    "configured": is_node_configured,
                    "network_name": config.get("NETWORK_NAME", ""),
                    "hostname": config.get("HOSTNAME", default_host),
                    "ipv4": config.get("IPV4", ""),
                    "protocol": config.get("PROTOCOL", "dual"),
                    "port": config.get("PORT", "11010"),
                    "encryption": config.get("ENCRYPTION", "yes"),
                    "service_active": svc_active,
                    "easytier_version": et_ver,
                    "xraymesh_version": CURRENT_VERSION,
                    "branch": get_active_branch(),
                    "web_port": PORT,
                    "ssl_enabled": is_ssl_enabled(),
                    "web_domain": web_cfg.get("WEB_DOMAIN", "")
                },
                "system": system_stats
            })
            return

        elif path == "/api/peers":
            peers_data = get_easytier_peers()
            v_info = get_version_info()
            latest_v = v_info.get("latest_version", CURRENT_VERSION)
            active_branch = get_active_branch()
            node_cfg = load_env_file(CONFIG_FILE)
            local_ip = (node_cfg.get("IPV4", "") or "").strip()
            local_hostname = (node_cfg.get("HOSTNAME", "") or "").strip() or "local"
            local_proto = (node_cfg.get("PROTOCOL", "") or "").strip() or "dual"

            peers_list = []
            if isinstance(peers_data, list):
                peers_list = peers_data
            elif isinstance(peers_data, dict):
                peers_list = peers_data.get("peers", []) or []

            for p in peers_list:
                if isinstance(p, dict) and p.get("ipv4"):
                    p["is_current"] = bool(local_ip and p.get("ipv4", "").strip() == local_ip)
                    cost = str(p.get("cost", "")).strip().lower()
                    p["connection"] = "local" if p["is_current"] or cost == "local" else ("relay" if cost.startswith("relay") else "direct")

            if peers_list:
                with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                    futures = {
                        executor.submit(get_peer_version, p.get("ipv4", "")): p
                        for p in peers_list if isinstance(p, dict) and p.get("ipv4")
                    }
                    for fut in concurrent.futures.as_completed(futures):
                        p = futures[fut]
                        try:
                            p_ver = fut.result()
                        except Exception:
                            p_ver = "unknown"
                        p["xraymesh_version"] = p_ver
                        peer_cache = PEER_VERSION_CACHE.get(p.get("ipv4", ""), {})
                        p["interfaces"] = normalize_network_interfaces(peer_cache.get("interfaces"))
                        p["xraymesh_branch"] = peer_cache.get("branch", "")
                        # Unknown until the peer tells us; never guess from this server's channel.
                        p["channel"] = peer_cache.get("channel") or (branch_channel(p["xraymesh_branch"]) if p["xraymesh_branch"] else "")
                        if "update_available" in peer_cache:
                            # The peer checked its own channel.
                            p["update_available"] = bool(peer_cache.get("update_available"))
                            p["latest_version"] = peer_cache.get("latest_version", "")
                            if "update_checked" in peer_cache:
                                p["update_checked"] = bool(peer_cache.get("update_checked"))
                        elif (p["xraymesh_branch"] or active_branch) == active_branch and p_ver != "unknown":
                            # Older peers do not report it; our channel's release is only valid for the same branch.
                            p["update_available"] = is_newer_version(latest_v, p_ver)
                            p["latest_version"] = latest_v
                        else:
                            p["update_available"] = False
                            p["latest_version"] = ""
                        p["update"] = peer_cache.get("update") or {}
                        # Reachable peers that do not report a channel run the untracked pre-2.2.6-beta.5 updater.
                        p["legacy"] = p_ver != "unknown" and "channel" not in peer_cache
                        p["version_drift"] = (p_ver != CURRENT_VERSION)

            # Always include the current node so the Web UI can highlight it,
            # even when it is alone in the mesh (easytier omits self from peers).
            if local_ip and not any(isinstance(p, dict) and p.get("ipv4", "").strip() == local_ip for p in peers_list):
                peers_list = [{
                    "ipv4": local_ip,
                    "hostname": local_hostname,
                    "tunnel_proto": local_proto,
                    "cost": "Local",
                    "connection": "local",
                    "lat_ms": 0,
                    "rx_bytes": "0 B",
                    "tx_bytes": "0 B",
                    "xraymesh_version": CURRENT_VERSION,
                    "xraymesh_branch": active_branch,
                    "interfaces": get_network_interfaces(),
                    "version_drift": False,
                    "is_current": True,
                }] + peers_list
            # This server's own entry always reflects its live channel and update job.
            local_summary = local_update_summary()
            local_summary["latest_version"] = local_summary["latest_version"] or latest_v
            local_summary["update_available"] = is_newer_version(local_summary["latest_version"], CURRENT_VERSION)
            local_summary["update_checked"] = local_summary["update_checked"] or bool(v_info.get("checked"))
            for p in peers_list:
                if isinstance(p, dict) and p.get("is_current"):
                    p.update({
                        "xraymesh_version": CURRENT_VERSION,
                        "xraymesh_branch": active_branch,
                        "channel": local_summary["channel"],
                        "latest_version": local_summary["latest_version"],
                        "update_available": local_summary["update_available"],
                        "update_checked": local_summary["update_checked"],
                        "update": local_summary["update"],
                        "version_drift": False,
                    })
            if isinstance(peers_data, dict):
                peers_data["peers"] = peers_list
            else:
                # Also covers easytier-cli being unavailable: still show this server.
                peers_data = peers_list

            has_drift = any(isinstance(p, dict) and p.get("version_drift") for p in peers_list)
            self.send_json({
                "ok": True,
                "data": peers_data,
                "cluster_version_drift": has_drift,
                "current_version": CURRENT_VERSION,
                "latest_version": latest_v,
                "branch": active_branch,
                "update_command": v_info.get("update_command", f"bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/{active_branch}/xraymesh.sh) update"),
                "local_ip": local_ip,
                "local_hostname": local_hostname
            })
            return

        elif path == "/api/routes":
            routes_data = get_easytier_routes()
            self.send_json({
                "ok": True,
                "data": routes_data
            })
            return

        elif path == "/api/tunnels/nodes":
            local_node, peers = get_tunnel_nodes()
            nodes = [dict(local_node, is_local=True)]
            for p in peers:
                cached = TUNNEL_CACHE.get(p["ip"]) or {}
                nodes.append({
                    "ip": p["ip"],
                    "name": cached.get("name") or p["name"],
                    "is_local": False,
                })
            self.send_json({"ok": True, "local_ip": local_node["ip"], "nodes": nodes})
            return

        elif path == "/api/tunnels":
            query_node = (query.get("node") or "").strip()
            local_node, peers = get_tunnel_nodes()

            if query_node in ("local", "127.0.0.1", local_node["ip"]):
                self.send_json({
                    "ok": True,
                    "data": get_tunnels(),
                    "node": dict(local_node, is_local=True, status="ok", stale=False,
                                 fetched_at=time.time(), latency_ms=0),
                })
                return

            if query_node:
                peer = next((p for p in peers if p["ip"] == query_node), None)
                if peer is None and query_node not in TUNNEL_CACHE:
                    self.send_json({"ok": False, "error": "Unknown mesh node", "code": "unknown_node"}, status=404)
                    return
                peer = peer or {"ip": query_node, "name": TUNNEL_CACHE[query_node].get("name") or query_node}
                data, node = fetch_remote_tunnels(peer)
                self.send_json({"ok": True, "data": data, "node": node})
                return

            # Legacy aggregate view: every node, bounded by one overall deadline.
            local_tunnels = get_tunnels()
            for t_type in TUNNEL_TYPES:
                for item in local_tunnels.get(t_type, []):
                    item["_node_ip"] = local_node["ip"]
                    item["_node_name"] = local_node["name"]
                    item["_is_local"] = True
            node_states = [dict(local_node, is_local=True, status="ok", stale=False)]
            if peers:
                executor = concurrent.futures.ThreadPoolExecutor(max_workers=8)
                futures = {executor.submit(fetch_remote_tunnels, p): p for p in peers}
                done, _ = concurrent.futures.wait(futures, timeout=TUNNEL_FETCH_DEADLINE)
                for fut, p in futures.items():
                    if fut in done:
                        data, node = fut.result()
                    else:
                        data, node = tunnel_cache_fallback(p, "timeout", "Node did not answer in time")
                    node_states.append(node)
                    for t_type in TUNNEL_TYPES:
                        local_tunnels.setdefault(t_type, []).extend(data.get(t_type, []))
                executor.shutdown(wait=False)

            self.send_json({"ok": True, "data": local_tunnels, "nodes": node_states})
            return

        elif path == "/api/interfaces":
            query_node = (query.get("node") or "").strip()
            cfg = load_env_file(CONFIG_FILE)
            local_ip = cfg.get("IPV4", "127.0.0.1")

            if query_node and query_node not in ("local", "127.0.0.1", local_ip):
                secret = cfg.get("NETWORK_SECRET", "").strip()
                remote_ifaces, warning = get_remote_network_interfaces(query_node, secret)
                if remote_ifaces:
                    response = {
                        "ok": True,
                        "data": remote_ifaces,
                        "node": query_node,
                    }
                    if warning:
                        response["warning"] = warning
                    self.send_json(response)
                    return

                self.send_json({
                    "ok": False,
                    "error": warning or "Could not load interfaces from remote node.",
                    "node": query_node,
                }, status=502)
                return

            ifaces = get_network_interfaces()
            self.send_json({
                "ok": True,
                "data": ifaces
            })
            return

        elif path == "/api/cluster/status":
            now = time.time()
            rem = max(0.0, ROLLBACK_EXPIRY - now) if ROLLBACK_EXPIRY > now else 0.0
            self.send_json({
                "ok": True,
                "watchdog_armed": rem > 0,
                "watchdog_remaining_sec": round(rem, 1),
                "backup_exists": os.path.isfile(CONFIG_BACKUP_FILE),
                "staged_exists": os.path.isfile(CONFIG_STAGED_FILE),
                "last_rollback": LAST_ROLLBACK
            })
            return

        elif path == "/api/node/config":
            config = load_env_file(CONFIG_FILE)
            peers_raw = config.get("PEERS", "")
            peers_list = [p.strip() for p in peers_raw.split(",") if p.strip()] if peers_raw else []

            svc_active = False
            try:
                r = subprocess.run(["systemctl", "is-active", "--quiet", "xraymesh.service"], timeout=3)
                svc_active = (r.returncode == 0)
            except Exception:
                pass

            hostname_val = config.get("HOSTNAME", "")
            if not hostname_val and hasattr(os, "uname"):
                hostname_val = os.uname().nodename

            web_cfg = load_env_file(WEB_ENV_FILE)
            is_node_configured = os.path.isfile(CONFIG_FILE) and bool(config.get("IPV4"))
            self.send_json({
                "ok": True,
                "data": {
                    "network_name": config.get("NETWORK_NAME", "xraymesh"),
                    "network_secret": config.get("NETWORK_SECRET", ""),
                    "hostname": hostname_val or "node",
                    "ipv4": config.get("IPV4", "10.144.144.1"),
                    "protocol": config.get("PROTOCOL", "dual"),
                    "port": int(config.get("PORT", "11010")),
                    "peers": peers_list,
                    "encryption": config.get("ENCRYPTION", "yes") == "yes",
                    "ipv6": config.get("IPV6", "no") == "yes",
                    "mtu": int(config.get("MTU", "1380")),
                    "enable_kcp": config.get("ENABLE_KCP", "no") == "yes",
                    "public_ip": get_server_public_ip(),
                    "node_configured": is_node_configured,
                    "service_active": svc_active,
                    "last_rollback": LAST_ROLLBACK,
                    "xraymesh_version": CURRENT_VERSION,
                    "branch": get_active_branch(),
                    "web_port": PORT,
                    "ssl_enabled": is_ssl_enabled(),
                    "web_domain": web_cfg.get("WEB_DOMAIN", "")
                }
            })
            return

        elif path == "/api/node/invite":
            config = load_env_file(CONFIG_FILE)
            if not os.path.isfile(CONFIG_FILE):
                self.send_json({"ok": False, "error": "Node is not configured yet."}, status=400)
                return

            pub_ip = get_server_public_ip()
            port = config.get("PORT", "11010")
            proto = config.get("PROTOCOL", "dual")
            try:
                mtu = int(config.get("MTU", "1380"))
            except ValueError:
                mtu = 1380

            invite_obj = {
                "v": 1,
                "net": config.get("NETWORK_NAME", "xraymesh"),
                "secret": config.get("NETWORK_SECRET", ""),
                "endpoint": f"{pub_ip}:{port}" if pub_ip else "",
                "proto": proto,
                # Transport settings let the joining node match this mesh exactly.
                "enc": config.get("ENCRYPTION", "yes") != "no",
                "kcp": config.get("ENABLE_KCP", "no") == "yes",
                "ipv6": config.get("IPV6", "no") == "yes",
                "mtu": mtu
            }
            token_str = base64.b64encode(json.dumps(invite_obj).encode("utf-8")).decode("utf-8")
            self.send_json({
                "ok": True,
                "data": {
                    "invite": f"xrmesh://{token_str}",
                    "details": invite_obj,
                    "public_ip": pub_ip,
                    "port": port
                }
            })
            return

        self.send_error(404, "Endpoint not found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Read JSON body
        content_length = int(self.headers.get("Content-Length", 0))
        body = b"{}"
        if content_length > 0:
            body = self.rfile.read(content_length)

        data = {}
        try:
            data = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            pass

        # Public Auth Endpoints
        if path == "/api/auth/login":
            client_ip = self.client_address[0]
            allowed, retry_after = check_login_rate_limit(client_ip)
            if not allowed:
                self.send_json({
                    "ok": False,
                    "error": f"Too many failed login attempts. Please wait {retry_after} seconds."
                }, status=429, headers={"Retry-After": str(retry_after)})
                return

            password = data.get("password", "")
            token = data.get("token", "")

            web_cfg = load_env_file(WEB_ENV_FILE)
            stored_hash = web_cfg.get("WEB_PASSWORD_HASH", "")

            # 1. Try Token
            if token and validate_token(token):
                reset_login_attempts(client_ip)
                session_id = create_session()
                cookie_val = get_session_cookie(session_id)
                self.send_json({"ok": True, "method": "token"}, headers={"Set-Cookie": cookie_val})
                return

            # 2. Try Password
            if password and stored_hash and verify_password(password, stored_hash):
                reset_login_attempts(client_ip)
                session_id = create_session()
                cookie_val = get_session_cookie(session_id)
                self.send_json({"ok": True, "method": "password"}, headers={"Set-Cookie": cookie_val})
                return

            record_failed_login(client_ip)
            self.send_json({"ok": False, "error": "Invalid password or access token"}, status=401)
            return

        elif path == "/api/auth/logout":
            cookie_header = self.headers.get("Cookie", "")
            if cookie_header:
                for item in cookie_header.split(";"):
                    if item.strip().startswith(f"{SESSION_COOKIE_NAME}="):
                        sid = item.strip().split("=", 1)[1]
                        if sid in SESSIONS:
                            del SESSIONS[sid]
            secure_flag = "; Secure" if is_ssl_enabled() else ""
            clear_cookie = f"{SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT{secure_flag}"
            self.send_json({"ok": True}, headers={"Set-Cookie": clear_cookie})
            return

        # ======================================================================
        # 🌐 Cluster Inter-Node SafeSync Endpoints (Authenticated via HMAC-SHA256)
        # ======================================================================
        if path in (
            "/api/cluster/prepare", "/api/cluster/commit", "/api/cluster/confirm", "/api/cluster/rollback",
            "/api/cluster/tunnels", "/api/cluster/tunnel/create", "/api/cluster/tunnel/edit", "/api/cluster/tunnel/delete",
            "/api/cluster/node/update", "/api/cluster/node/update-status", "/api/cluster/node/channel",
            "/api/cluster/interfaces", "/api/cluster/iperf/run", "/api/cluster/ping/run"
        ):
            valid, err_msg = verify_cluster_hmac(self.headers, body)
            if not valid:
                self.send_json({"ok": False, "error": f"Cluster authentication failed: {err_msg}"}, status=403)
                return

            if path == "/api/cluster/prepare":
                try:
                    shutil.copy2(CONFIG_FILE, CONFIG_BACKUP_FILE)
                except Exception as e:
                    self.send_json({"ok": False, "error": f"Failed to create config backup: {e}"}, status=500)
                    return

                lines = []
                for k in ALLOWED_CLUSTER_KEYS:
                    if k in data and data[k] != "":
                        v = str(data[k]).replace("'", "'\\''")
                        lines.append(f"{k}='{v}'\n")

                with open(CONFIG_STAGED_FILE, "w", encoding="utf-8") as f:
                    f.writelines(lines)
                try:
                    os.chmod(CONFIG_STAGED_FILE, 0o600)
                except Exception:
                    pass

                cur_cfg = load_env_file(CONFIG_FILE)
                self.send_json({
                    "ok": True,
                    "status": "prepared",
                    "node": cur_cfg.get("HOSTNAME", "node"),
                    "staged_keys": [k for k in ALLOWED_CLUSTER_KEYS if k in data]
                })
                return

            elif path == "/api/cluster/commit":
                ok, msg = apply_staged_cluster_config()
                cur_cfg = load_env_file(CONFIG_FILE)
                if ok:
                    self.send_json({
                        "ok": True,
                        "status": "committed",
                        "node": cur_cfg.get("HOSTNAME", "node"),
                        "message": msg
                    })
                else:
                    self.send_json({"ok": False, "error": msg}, status=500)
                return

            elif path == "/api/cluster/confirm":
                disarm_rollback_watchdog()
                cur_cfg = load_env_file(CONFIG_FILE)
                self.send_json({
                    "ok": True,
                    "status": "confirmed_safe",
                    "node": cur_cfg.get("HOSTNAME", "node")
                })
                return

            elif path == "/api/cluster/rollback":
                ok = rollback_cluster_config()
                cur_cfg = load_env_file(CONFIG_FILE)
                if ok:
                    self.send_json({
                        "ok": True,
                        "status": "rolled_back",
                        "node": cur_cfg.get("HOSTNAME", "node")
                    })
                else:
                    self.send_json({"ok": False, "error": "No backup file found or rollback failed."}, status=500)
                return

            elif path == "/api/cluster/tunnels":
                cur_cfg = load_env_file(CONFIG_FILE)
                tunnels = get_tunnels()
                self.send_json({
                    "ok": True,
                    "node_ip": cur_cfg.get("IPV4", ""),
                    "node_name": cur_cfg.get("HOSTNAME", "node"),
                    "tunnels": tunnels
                })
                return

            elif path == "/api/cluster/tunnel/create":
                t_type = data.get("tunnel_type", "").lower()
                name = data.get("name", "").strip()
                target = data.get("target", "").strip()
                ports = data.get("ports", "").strip()
                protocol = data.get("protocol", "both").strip().lower()
                in_if = data.get("interface", "any").strip()
                src_cidr = data.get("source_cidr", "0.0.0.0/0").strip()

                if t_type == "haproxy":
                    ok, msg = run_xraymesh_cmd(["haproxy-create", name, target, ports])
                elif t_type == "iptables":
                    ok, msg = run_xraymesh_cmd(["iptables-create", name, target, ports, protocol, in_if, src_cidr])
                elif t_type == "gost":
                    ok, msg = run_xraymesh_cmd(["gost-create", name, target, ports, protocol])
                elif t_type == "realm":
                    ok, msg = run_xraymesh_cmd(["realm-create", name, target, ports, protocol])
                else:
                    self.send_json({"ok": False, "error": f"Invalid tunnel type: {t_type}"}, status=400)
                    return

                if ok:
                    self.send_json({"ok": True, "message": msg or f"{t_type} tunnel created."})
                else:
                    self.send_json({"ok": False, "error": msg or f"Failed to create {t_type} tunnel."}, status=400)
                return

            elif path == "/api/cluster/tunnel/edit":
                t_type = data.get("tunnel_type", "").lower()
                name = data.get("name", "").strip()
                target = data.get("target", "").strip()
                ports = data.get("ports", "").strip()
                protocol = data.get("protocol", "both").strip().lower()
                in_if = data.get("interface", "any").strip()
                src_cidr = data.get("source_cidr", "0.0.0.0/0").strip()

                if t_type == "haproxy":
                    ok, msg = run_xraymesh_cmd(["haproxy-edit", name, target, ports])
                elif t_type == "iptables":
                    ok, msg = run_xraymesh_cmd(["iptables-edit", name, target, ports, protocol, in_if, src_cidr])
                elif t_type == "gost":
                    ok, msg = run_xraymesh_cmd(["gost-edit", name, target, ports, protocol])
                elif t_type == "realm":
                    ok, msg = run_xraymesh_cmd(["realm-edit", name, target, ports, protocol])
                else:
                    self.send_json({"ok": False, "error": f"Invalid tunnel type: {t_type}"}, status=400)
                    return

                if ok:
                    self.send_json({"ok": True, "message": msg or f"{t_type} tunnel updated."})
                else:
                    self.send_json({"ok": False, "error": msg or f"Failed to update {t_type} tunnel."}, status=400)
                return

            elif path == "/api/cluster/tunnel/delete":
                t_type = data.get("tunnel_type", "").lower()
                name = data.get("name", "").strip()
                if t_type in ("haproxy", "iptables", "gost", "realm") and name:
                    ok, msg = run_xraymesh_cmd([f"{t_type}-delete", name])
                    if ok:
                        self.send_json({"ok": True, "message": msg or f"{t_type} tunnel deleted."})
                    else:
                        self.send_json({"ok": False, "error": msg or f"Failed to delete {t_type} tunnel."}, status=400)
                    return
                self.send_json({"ok": False, "error": "Invalid tunnel delete request"}, status=400)
                return

            elif path == "/api/cluster/node/update":
                ok, msg, code = spawn_detached_node_update()
                cur_cfg = load_env_file(CONFIG_FILE)
                self.send_json({
                    "ok": ok,
                    "code": code,
                    "message": f"Update initiated on node '{cur_cfg.get('HOSTNAME', 'node')}': {msg}",
                    "error": "" if ok else msg,
                    "node": cur_cfg.get("HOSTNAME", "node"),
                    "status": local_update_summary(),
                })
                return

            elif path == "/api/cluster/node/update-status":
                self.send_json({"ok": True, "status": local_update_summary()})
                return

            elif path == "/api/cluster/node/channel":
                channel = str(data.get("channel", "")).strip().lower()
                if channel not in CHANNEL_BRANCHES:
                    self.send_json({"ok": False, "code": "invalid_channel", "error": "Channel must be 'stable' or 'beta'."}, status=400)
                    return
                try:
                    set_update_channel(channel)
                except OSError as e:
                    self.send_json({"ok": False, "code": "save_failed", "error": f"Could not save the update channel: {e}"}, status=500)
                    return
                self.send_json({"ok": True, "status": local_update_summary()})
                return

            elif path == "/api/cluster/interfaces":
                cur_cfg = load_env_file(CONFIG_FILE)
                ifaces = get_network_interfaces()
                self.send_json({
                    "ok": True,
                    "node_ip": cur_cfg.get("IPV4", ""),
                    "node_name": cur_cfg.get("HOSTNAME", "node"),
                    "interfaces": ifaces
                })
                return

            elif path == "/api/cluster/iperf/run":
                target = data.get("target", "").strip()
                protocol = data.get("protocol", "tcp").lower()
                duration = min(max(int(data.get("duration", 5)), 1), 30)
                bandwidth = data.get("bandwidth", "50M").strip()
                port = int(data.get("port", 5201))

                cur_cfg = load_env_file(CONFIG_FILE)
                local_ip = cur_cfg.get("IPV4", "")
                ok, res, status = execute_iperf_benchmark(target, protocol, duration, bandwidth, port, source_ip=local_ip)
                if ok:
                    self.send_json({"ok": True, "data": res})
                else:
                    self.send_json({"ok": False, "error": res}, status=status)
                return

            elif path == "/api/cluster/ping/run":
                target = data.get("target", "").strip()
                count = min(max(int(data.get("count", 4)), 1), 10)
                cur_cfg = load_env_file(CONFIG_FILE)
                local_ip = cur_cfg.get("IPV4", "")
                ok, res, status = execute_ping_benchmark(target, count=count, source_ip=local_ip)
                if ok:
                    self.send_json({"ok": True, "data": res})
                else:
                    self.send_json({"ok": False, "error": res}, status=status)
                return

        # Authenticated Endpoints
        auth_ok, _ = is_authenticated(self.headers)
        if not auth_ok:
            self.send_json({"error": "Unauthorized", "authenticated": False}, status=401)
            return

        # Ensure mesh node is configured before allowing operational endpoints
        if path.startswith(("/api/tunnels/", "/api/ping", "/api/speedtest", "/api/iperf")):
            node_cfg = load_env_file(CONFIG_FILE)
            if not os.path.isfile(CONFIG_FILE) or not node_cfg.get("IPV4"):
                self.send_json({"ok": False, "error": "Mesh node is not configured yet. Please complete node setup first."}, status=400)
                return

        if path == "/api/ping":
            target = data.get("target", "").strip()
            source = data.get("source", "").strip()
            count = min(max(int(data.get("count", 4)), 1), 10)

            if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target):
                self.send_json({"ok": False, "error": "Invalid target IP"}, status=400)
                return

            cfg = load_env_file(CONFIG_FILE)
            local_ip = cfg.get("IPV4", "").strip()

            if source and target == source:
                self.send_json({"ok": False, "error": "Source and target cannot be the same node"}, status=400)
                return

            # If source is remote node, forward via HMAC-signed cluster request
            if source and source not in ("local", "127.0.0.1", local_ip):
                secret = cfg.get("NETWORK_SECRET", "").strip()
                if not secret:
                    self.send_json({"ok": False, "error": "Cluster secret not configured on this node"}, status=500)
                    return
                cached_peer = PEER_VERSION_CACHE.get(source, {})
                peer_port = cached_peer.get("port", PORT)
                payload = {
                    "target": target,
                    "count": count
                }
                timeout = count * 2 + 10
                ok, res = send_cluster_http(source, peer_port, "/api/cluster/ping/run", secret, payload, timeout=timeout)
                if ok and isinstance(res, dict) and res.get("ok"):
                    ping_data = res.get("data", {})
                    ping_data["source"] = source
                    ping_data["target"] = target
                    self.send_json({"ok": True, "data": ping_data})
                else:
                    err = res.get("error") if isinstance(res, dict) else str(res)
                    self.send_json({"ok": False, "error": f"Remote node {source} error: {err}"}, status=400)
                return

            # Otherwise execute locally
            ok, res, status = execute_ping_benchmark(target, count=count, source_ip=local_ip)
            if ok:
                self.send_json({"ok": True, "data": res})
            else:
                self.send_json({"ok": False, "error": res}, status=status)
            return

        elif path == "/api/iperf/run":
            target = data.get("target", "").strip()
            source = data.get("source", "").strip()
            protocol = data.get("protocol", "tcp").lower()
            duration = min(max(int(data.get("duration", 5)), 1), 30)
            bandwidth = data.get("bandwidth", "50M").strip()
            port = int(data.get("port", 5201))

            if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target):
                self.send_json({"ok": False, "error": "Invalid target IP"}, status=400)
                return

            cfg = load_env_file(CONFIG_FILE)
            local_ip = cfg.get("IPV4", "").strip()

            if source and target == source:
                self.send_json({"ok": False, "error": "Source and target cannot be the same node"}, status=400)
                return

            # If source is remote node, forward via HMAC-signed cluster request
            if source and source not in ("local", "127.0.0.1", local_ip):
                secret = cfg.get("NETWORK_SECRET", "").strip()
                if not secret:
                    self.send_json({"ok": False, "error": "Cluster secret not configured on this node"}, status=500)
                    return
                cached_peer = PEER_VERSION_CACHE.get(source, {})
                peer_port = cached_peer.get("port", PORT)
                payload = {
                    "target": target,
                    "protocol": protocol,
                    "duration": duration,
                    "bandwidth": bandwidth,
                    "port": port
                }
                timeout = duration + 15
                ok, res = send_cluster_http(source, peer_port, "/api/cluster/iperf/run", secret, payload, timeout=timeout)
                if ok and isinstance(res, dict) and res.get("ok"):
                    bench_data = res.get("data", {})
                    bench_data["source"] = source
                    bench_data["target"] = target
                    self.send_json({"ok": True, "data": bench_data})
                else:
                    err = res.get("error") if isinstance(res, dict) else str(res)
                    self.send_json({"ok": False, "error": f"Remote node {source} error: {err}"}, status=400)
                return

            # Otherwise execute locally
            ok, res, status = execute_iperf_benchmark(target, protocol, duration, bandwidth, port, source_ip=local_ip)
            if ok:
                self.send_json({"ok": True, "data": res})
            else:
                self.send_json({"ok": False, "error": res}, status=status)
            return

        elif path == "/api/tunnels/haproxy/create":
            if proxy_tunnel_if_remote(self, data, "haproxy", "create"):
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["haproxy-create", name, target, ports])
            if ok:
                self.send_json({"ok": True, "message": msg or "HAProxy tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create HAProxy tunnel."}, status=400)
            return

        elif path == "/api/tunnels/haproxy/edit":
            if proxy_tunnel_if_remote(self, data, "haproxy", "edit"):
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["haproxy-edit", name, target, ports])
            if ok:
                self.send_json({"ok": True, "message": msg or "HAProxy tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update HAProxy tunnel."}, status=400)
            return

        elif path == "/api/tunnels/haproxy/delete":
            if proxy_tunnel_if_remote(self, data, "haproxy", "delete"):
                return
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["haproxy-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "HAProxy tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete HAProxy tunnel."}, status=400)
            return

        elif path == "/api/tunnels/iptables/create":
            origin_node = (data.get("origin_node") or "").strip()
            if not is_local_origin(origin_node):
                self.send_json({
                    "ok": False,
                    "error": "iptables tunnels can only be configured locally on the host server. Please manage iptables tunnels directly from that node's web panel."
                }, status=400)
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "udp").strip().lower()
            in_if = data.get("interface", "any").strip()
            source_cidr = data.get("source_cidr", "0.0.0.0/0").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["iptables-create", name, target, ports, protocol, in_if, source_cidr])
            if ok:
                self.send_json({"ok": True, "message": msg or "iptables tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create iptables tunnel."}, status=400)
            return

        elif path == "/api/tunnels/iptables/edit":
            origin_node = (data.get("origin_node") or "").strip()
            if not is_local_origin(origin_node):
                self.send_json({
                    "ok": False,
                    "error": "iptables tunnels can only be configured locally on the host server. Please manage iptables tunnels directly from that node's web panel."
                }, status=400)
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "udp").strip().lower()
            in_if = data.get("interface", "any").strip()
            source_cidr = data.get("source_cidr", "0.0.0.0/0").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["iptables-edit", name, target, ports, protocol, in_if, source_cidr])
            if ok:
                self.send_json({"ok": True, "message": msg or "iptables tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update iptables tunnel."}, status=400)
            return

        elif path == "/api/tunnels/iptables/delete":
            if proxy_tunnel_if_remote(self, data, "iptables", "delete"):
                return
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["iptables-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "iptables tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete iptables tunnel."}, status=400)
            return

        elif path == "/api/tunnels/gost/create":
            if proxy_tunnel_if_remote(self, data, "gost", "create"):
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["gost-create", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "GOST tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create GOST tunnel."}, status=400)
            return

        elif path == "/api/tunnels/gost/edit":
            if proxy_tunnel_if_remote(self, data, "gost", "edit"):
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["gost-edit", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "GOST tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update GOST tunnel."}, status=400)
            return

        elif path == "/api/tunnels/gost/delete":
            if proxy_tunnel_if_remote(self, data, "gost", "delete"):
                return
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["gost-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "GOST tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete GOST tunnel."}, status=400)
            return

        elif path == "/api/tunnels/realm/create":
            if proxy_tunnel_if_remote(self, data, "realm", "create"):
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["realm-create", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "Realm tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create Realm tunnel."}, status=400)
            return

        elif path == "/api/tunnels/realm/edit":
            if proxy_tunnel_if_remote(self, data, "realm", "edit"):
                return
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["realm-edit", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "Realm tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update Realm tunnel."}, status=400)
            return

        elif path == "/api/tunnels/realm/delete":
            if proxy_tunnel_if_remote(self, data, "realm", "delete"):
                return
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            if not valid_tunnel_name(name):
                self.send_json({"ok": False, "error": "Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'."}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["realm-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "Realm tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete Realm tunnel."}, status=400)
            return

        elif path == "/api/node/config":
            net_name = data.get("network_name", "").strip()
            secret = data.get("network_secret", "").strip()
            hostname = data.get("hostname", "").strip()
            ipv4 = data.get("ipv4", "").strip()
            port = int(data.get("port", 11010))
            protocol = data.get("protocol", "dual").strip().lower()
            peers = data.get("peers", [])
            encryption = "yes" if data.get("encryption", True) else "no"
            ipv6 = "yes" if data.get("ipv6", False) else "no"
            mtu = int(data.get("mtu", 1380))
            enable_kcp = "yes" if data.get("enable_kcp", False) else "no"

            if not net_name or not secret or not ipv4 or not port or not hostname:
                self.send_json({"ok": False, "error": "Missing required fields: network_name, network_secret, ipv4, port, hostname"}, status=400)
                return

            if isinstance(peers, list):
                raw_peers = [p.strip() for p in peers if p.strip()]
            else:
                raw_peers = [p.strip() for p in str(peers).split(",") if p.strip()]
            clean_peers = [sanitize_peer_endpoint(p, str(port)) for p in raw_peers]
            peers_str = ",".join(p for p in clean_peers if p)

            default_hostname = os.uname().nodename if hasattr(os, "uname") else "node"
            cfg_dict = {
                "NETWORK_NAME": net_name,
                "NETWORK_SECRET": secret,
                "HOSTNAME": hostname or default_hostname,
                "IPV4": ipv4,
                "PROTOCOL": protocol,
                "PORT": str(port),
                "PEERS": peers_str,
                "ENCRYPTION": encryption,
                "IPV6": ipv6,
                "MTU": str(mtu),
                "ENABLE_KCP": enable_kcp
            }

            save_node_config_env(cfg_dict)
            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({"ok": True, "message": "Node configuration saved and mesh service is online."})
            else:
                self.send_json({"ok": False, "error": f"Configuration saved, but service failed to start: {msg}"}, status=500)
            return

        elif path == "/api/node/peers/add":
            new_peer_raw = data.get("peer", "").strip()
            if not new_peer_raw:
                self.send_json({"ok": False, "error": "Missing peer address"}, status=400)
                return

            cfg = load_env_file(CONFIG_FILE)
            mesh_port = cfg.get("PORT", "11010")
            new_peer = sanitize_peer_endpoint(new_peer_raw, mesh_port)
            if not new_peer:
                self.send_json({"ok": False, "error": "Invalid peer address format"}, status=400)
                return

            cur_peers = [sanitize_peer_endpoint(p, mesh_port) for p in cfg.get("PEERS", "").split(",") if p.strip()]
            cur_peers = [p for p in cur_peers if p]
            if new_peer not in cur_peers:
                cur_peers.append(new_peer)
            cfg["PEERS"] = ",".join(cur_peers)
            save_node_config_env(cfg)

            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({"ok": True, "message": f"Peer '{new_peer}' added and mesh service restarted.", "peers": cur_peers})
            else:
                self.send_json({"ok": False, "error": f"Peer added, but service reload failed: {msg}"}, status=500)
            return

        elif path == "/api/node/peers/remove":
            peer_to_remove = data.get("peer", "").strip()
            if not peer_to_remove:
                self.send_json({"ok": False, "error": "Missing peer address"}, status=400)
                return

            cfg = load_env_file(CONFIG_FILE)
            mesh_port = cfg.get("PORT", "11010")
            clean_remove = sanitize_peer_endpoint(peer_to_remove, mesh_port) or peer_to_remove
            cur_peers = [p.strip() for p in cfg.get("PEERS", "").split(",") if p.strip()]
            cur_peers = [p for p in cur_peers if p != peer_to_remove and p != clean_remove]
            cfg["PEERS"] = ",".join(cur_peers)
            save_node_config_env(cfg)

            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({"ok": True, "message": f"Peer '{peer_to_remove}' removed.", "peers": cur_peers})
            else:
                self.send_json({"ok": False, "error": f"Peer removed, but service reload failed: {msg}"}, status=500)
            return

        elif path == "/api/node/join":
            # Joining replaces the whole mesh configuration (the UI confirms this first).
            # Only this server's name and listen port carry over; tunnels are untouched.
            try:
                invite = decode_invite_token(data.get("invite", ""))
            except InviteTokenError as e:
                self.send_json({"ok": False, "code": e.code, "error": str(e)}, status=400)
                return

            current = load_env_file(CONFIG_FILE)
            hostname = str(data.get("hostname") or current.get("HOSTNAME") or "").strip()
            if not hostname and hasattr(os, "uname"):
                hostname = os.uname().nodename
            if not valid_mesh_hostname(hostname):
                self.send_json({
                    "ok": False,
                    "code": "invalid_hostname",
                    "error": "Server name must start with a letter or number and may only contain letters, numbers, '.', '-' or '_'."
                }, status=400)
                return

            ipv4 = str(data.get("ipv4") or "").strip() or f"10.144.144.{secrets.randbelow(253) + 2}"
            if not valid_ipv4(ipv4):
                self.send_json({"ok": False, "code": "invalid_ipv4", "error": "Enter a valid virtual IPv4 address."}, status=400)
                return

            port = parse_port(data.get("port") or current.get("PORT") or 11010)
            if port is None:
                self.send_json({"ok": False, "code": "invalid_port", "error": "Listen port must be between 1 and 65535."}, status=400)
                return

            previous_raw = None
            if os.path.isfile(CONFIG_FILE):
                try:
                    with open(CONFIG_FILE, "rb") as f:
                        previous_raw = f.read()
                except OSError as e:
                    self.send_json({"ok": False, "code": "backup_failed", "error": f"Could not back up the current configuration: {e}"}, status=500)
                    return

            # A pending SafeSync watchdog would otherwise roll this server back to the old mesh.
            disarm_rollback_watchdog()
            save_node_config_env({
                "NETWORK_NAME": invite["net"],
                "NETWORK_SECRET": invite["secret"],
                "HOSTNAME": hostname,
                "IPV4": ipv4,
                "PROTOCOL": invite["proto"],
                "PORT": str(port),
                "PEERS": invite["endpoint"],
                "ENCRYPTION": "yes" if invite.get("enc", True) else "no",
                "IPV6": "yes" if invite.get("ipv6", False) else "no",
                "MTU": str(invite.get("mtu", 1380)),
                "ENABLE_KCP": "yes" if invite.get("kcp", False) else "no",
            })

            ok, msg = run_xraymesh_cmd(["node-restart"])
            if not ok:
                if previous_raw is not None:
                    write_config_bytes(previous_raw)
                    run_xraymesh_cmd(["node-restart"])
                else:
                    run_xraymesh_cmd(["delete-node"])
                self.send_json({
                    "ok": False,
                    "code": "start_failed",
                    "restored": True,
                    "error": msg or "The mesh service failed to start with the new configuration."
                }, status=500)
                return

            # SafeSync backup/staged files and rollback notices belong to the previous mesh.
            for stale in (CONFIG_BACKUP_FILE, CONFIG_STAGED_FILE):
                try:
                    os.remove(stale)
                except OSError:
                    pass
            LAST_ROLLBACK["occurred"] = False

            self.send_json({
                "ok": True,
                "message": f"Joined mesh '{invite['net']}'. The previous configuration was replaced.",
                "data": {
                    "network_name": invite["net"],
                    "hostname": hostname,
                    "ipv4": ipv4,
                    "port": port,
                    "peer": sanitize_peer_endpoint(invite["endpoint"], str(port))
                }
            })
            return

        elif path == "/api/cluster/broadcast":
            cfg = load_env_file(CONFIG_FILE)
            current_secret = cfg.get("NETWORK_SECRET", "").strip()
            if not current_secret:
                self.send_json({"ok": False, "error": "Current node has no network secret configured."}, status=400)
                return

            new_protocol = data.get("protocol", cfg.get("PROTOCOL", "dual")).strip().lower()
            new_kcp = "yes" if data.get("enable_kcp", cfg.get("ENABLE_KCP") == "yes") else "no"
            new_encryption = "yes" if data.get("encryption", cfg.get("ENCRYPTION") != "no") else "no"
            new_ipv6 = "yes" if data.get("ipv6", cfg.get("IPV6") == "yes") else "no"
            new_mtu = str(data.get("mtu", cfg.get("MTU", "1380"))).strip()
            new_secret = data.get("network_secret", current_secret).strip()

            staged_payload = {
                "PROTOCOL": new_protocol,
                "ENABLE_KCP": new_kcp,
                "ENCRYPTION": new_encryption,
                "IPV6": new_ipv6,
                "MTU": new_mtu,
                "NETWORK_SECRET": new_secret,
                "NETWORK_NAME": cfg.get("NETWORK_NAME", "xraymesh")
            }

            # Find active peer nodes in the mesh
            peers_raw = get_easytier_peers() or []
            if isinstance(peers_raw, dict):
                peers_raw = peers_raw.get("peers", []) or []

            active_peers = []
            for p in peers_raw:
                if not isinstance(p, dict):
                    continue
                vip = p.get("ipv4", "").strip()
                cost = str(p.get("cost", "0"))
                if vip and vip != cfg.get("IPV4", "") and cost not in ("0", "Local", "none", ""):
                    active_peers.append({
                        "ipv4": vip,
                        "hostname": p.get("hostname", vip),
                        "cost": cost
                    })

            if not active_peers:
                self.send_json({"ok": False, "error": "No active connected peers found in the mesh to sync with."}, status=400)
                return

            # Phase 1: Prepare all remote peers
            prep_results = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                futures = {
                    executor.submit(send_cluster_http, p["ipv4"], PORT, "/api/cluster/prepare", current_secret, staged_payload, 6): p
                    for p in active_peers
                }
                for fut in concurrent.futures.as_completed(futures):
                    p = futures[fut]
                    try:
                        ok, res = fut.result()
                        prep_results[p["ipv4"]] = {"ok": ok, "res": res, "hostname": p["hostname"]}
                    except Exception as ex:
                        prep_results[p["ipv4"]] = {"ok": False, "res": str(ex), "hostname": p["hostname"]}

            failed_preps = [f"{v['hostname']} ({ip}): {v['res']}" for ip, v in prep_results.items() if not v["ok"]]
            if failed_preps:
                # Abort Phase 1 - Rollback any nodes that prepared
                for ip, v in prep_results.items():
                    if v["ok"]:
                        send_cluster_http(ip, PORT, "/api/cluster/rollback", current_secret, {}, 3)
                self.send_json({
                    "ok": False,
                    "error": f"Preparation failed on {len(failed_preps)} node(s). Sync safely aborted without modifying cluster state.",
                    "details": failed_preps
                }, status=500)
                return

            # Phase 2: Commit remote peers
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                commit_futures = [
                    executor.submit(send_cluster_http, p["ipv4"], PORT, "/api/cluster/commit", current_secret, {}, 6)
                    for p in active_peers
                ]
                concurrent.futures.wait(commit_futures, timeout=8)

            # Phase 3: Commit Controller locally
            try:
                shutil.copy2(CONFIG_FILE, CONFIG_BACKUP_FILE)
            except Exception:
                pass
            for k, v in staged_payload.items():
                if v != "":
                    cfg[k] = v
            save_node_config_env(cfg)
            arm_rollback_watchdog(timeout_sec=90)

            # Restart local controller service
            ensure_cli_and_runner_fixed()
            run_xraymesh_cmd(["node-restart"])

            # Phase 4: Launch asynchronous confirmation monitor in background (75s with retries)
            def monitor_and_confirm():
                time.sleep(4.0)
                start_check = time.time()
                while time.time() - start_check < 75.0:
                    peers = get_easytier_peers()
                    has_connected_peer = False
                    if peers:
                        for p in peers:
                            if str(p.get("cost", "0")) not in ("0", "Local", "none", ""):
                                has_connected_peer = True
                                break
                    if has_connected_peer:
                        print("[Cluster-Broadcast] Peers reconnected! Sending confirmation to disarm watchdogs...", flush=True)
                        for attempt in range(3):
                            all_ok = True
                            for p in active_peers:
                                ok_conf, _ = send_cluster_http(p["ipv4"], PORT, "/api/cluster/confirm", new_secret, {}, 4)
                                if not ok_conf:
                                    all_ok = False
                            if all_ok:
                                break
                            time.sleep(1.5)
                        disarm_rollback_watchdog()
                        break
                    time.sleep(2.0)

            threading.Thread(target=monitor_and_confirm, daemon=True).start()

            synced_names = [p["hostname"] for p in active_peers] + [cfg.get("HOSTNAME", "local")]
            self.send_json({
                "ok": True,
                "message": f"Successfully synchronized settings to {len(active_peers)} peer(s). Nodes are restarting with 90s self-healing watchdogs armed.",
                "synced_nodes": synced_names,
                "applied_settings": {
                    "protocol": new_protocol,
                    "enable_kcp": new_kcp == "yes",
                    "encryption": new_encryption == "yes",
                    "ipv6": new_ipv6 == "yes",
                    "mtu": new_mtu,
                    "secret_rotated": new_secret != current_secret
                }
            })
            return

        elif path == "/api/cluster/rollback/dismiss":
            LAST_ROLLBACK["occurred"] = False
            self.send_json({"ok": True, "message": "Rollback notice dismissed."})
            return

        elif path == "/api/node/start":
            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({"ok": True, "message": "Mesh node service started successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to start node service."}, status=500)
            return

        elif path == "/api/node/stop":
            # Stop only the mesh daemon: the CLI "stop" command also stops this web panel.
            try:
                r = subprocess.run(["systemctl", "stop", "xraymesh.service"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
                ok, msg = r.returncode == 0, (r.stderr or r.stdout).strip()
            except Exception as e:
                ok, msg = False, str(e)
            if ok:
                self.send_json({"ok": True, "message": "Mesh node service stopped."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to stop node service."}, status=500)
            return

        elif path == "/api/node/restart":
            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({"ok": True, "message": "Mesh node service restarted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to restart node service."}, status=500)
            return

        elif path == "/api/node/delete":
            ok, msg = run_xraymesh_cmd(["delete-node"])
            if ok:
                self.send_json({"ok": True, "message": "Mesh node configuration deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete node configuration."}, status=400)
            return

        elif path in ("/api/update/start", "/api/node/update"):
            ok, msg, code = spawn_detached_node_update()
            self.send_json({"ok": ok, "code": code, "message": msg, "error": "" if ok else msg,
                            "status": local_update_summary()}, status=200 if ok else 409 if code == "already_running" else 500)
            return

        elif path == "/api/update/channel":
            channel = str(data.get("channel", "")).strip().lower()
            if channel not in CHANNEL_BRANCHES:
                self.send_json({"ok": False, "code": "invalid_channel", "error": "Channel must be 'stable' or 'beta'."}, status=400)
                return
            try:
                set_update_channel(channel)
            except OSError as e:
                self.send_json({"ok": False, "code": "save_failed", "error": f"Could not save the update channel: {e}"}, status=500)
                return
            get_version_info()  # warm the new channel's cache so the next status is accurate
            self.send_json({"ok": True, "status": local_update_summary()})
            return

        elif path in ("/api/cluster/update", "/api/cluster/update/status", "/api/cluster/channel"):
            # Proxy a node action to another mesh server (signed with the network secret),
            # or handle it here when the target is this server.
            target_ip = str(data.get("target_ip") or "").strip()
            cfg = load_env_file(CONFIG_FILE)
            local_ip = cfg.get("IPV4", "").strip()
            secret = cfg.get("NETWORK_SECRET", "").strip()
            if not valid_ipv4(target_ip):
                self.send_json({"ok": False, "code": "invalid_target", "error": "Missing or invalid target_ip."}, status=400)
                return
            channel = str(data.get("channel", "")).strip().lower()
            if path == "/api/cluster/channel" and channel not in CHANNEL_BRANCHES:
                self.send_json({"ok": False, "code": "invalid_channel", "error": "Channel must be 'stable' or 'beta'."}, status=400)
                return

            if target_ip == local_ip or target_ip == "127.0.0.1":
                if path == "/api/cluster/update":
                    ok, msg, code = spawn_detached_node_update()
                    self.send_json({"ok": ok, "code": code, "error": "" if ok else msg, "status": local_update_summary()},
                                   status=200 if ok else 409 if code == "already_running" else 500)
                elif path == "/api/cluster/channel":
                    try:
                        set_update_channel(channel)
                    except OSError as e:
                        self.send_json({"ok": False, "code": "save_failed", "error": f"Could not save the update channel: {e}"}, status=500)
                        return
                    get_version_info()
                    self.send_json({"ok": True, "status": local_update_summary()})
                else:
                    self.send_json({"ok": True, "reachable": True, "status": local_update_summary()})
                return

            if not secret:
                self.send_json({"ok": False, "code": "not_configured", "error": "This server has no mesh secret to sign the request."}, status=400)
                return

            port = PEER_VERSION_CACHE.get(target_ip, {}).get("port", PORT)
            if path == "/api/cluster/update":
                ok, res, http_status = cluster_request(target_ip, port, "/api/cluster/node/update", secret, {}, 10)
                if ok and isinstance(res, dict):
                    # Peers before 2.2.6-beta.5 answer without a code; their update runs untracked.
                    legacy = "code" not in res
                    self.send_json({"ok": bool(res.get("ok", True)), "code": res.get("code") or "queued", "legacy": legacy,
                                    "error": res.get("error", ""), "status": res.get("status") or {}},
                                   status=200 if res.get("ok", True) else 409)
                    return
            elif path == "/api/cluster/channel":
                ok, res, http_status = cluster_request(target_ip, port, "/api/cluster/node/channel", secret, {"channel": channel}, 6)
                if ok and isinstance(res, dict):
                    PEER_VERSION_CACHE.pop(target_ip, None)  # re-probe with the new channel
                    self.send_json({"ok": True, "status": res.get("status") or {}})
                    return
            else:
                ok, res, http_status = cluster_request(target_ip, port, "/api/cluster/node/update-status", secret, {}, 4)
                if ok and isinstance(res, dict):
                    status = res.get("status") or {}
                    if (status.get("update") or {}).get("state") in ("success", "failed", "up_to_date"):
                        PEER_VERSION_CACHE.pop(target_ip, None)  # the peers list must show the new version now
                    self.send_json({"ok": True, "reachable": True, "status": status})
                    return
                if http_status == 404 or http_status is None:
                    # Too old for status reports, or restarting mid-update: fall back to its public version probe.
                    PEER_VERSION_CACHE.pop(target_ip, None)
                    info, _, _ = fetch_peer_cluster_info(target_ip, port, timeout=2.0)
                    self.send_json({"ok": True, "reachable": bool(info), "legacy": http_status == 404,
                                    "status": {"version": info.get("version", "")} if info else {}})
                    return

            code = res.get("code") if isinstance(res, dict) and res.get("code") else cluster_error_code(http_status)
            error = res.get("error") if isinstance(res, dict) else str(res)
            self.send_json({"ok": False, "code": code, "error": error or "Request to the peer failed."}, status=502)
            return

        self.send_error(404, "Endpoint not found")


def run_server():
    """Start the HTTP server on configured BIND_ADDR and PORT."""
    # Ensure tokens directory exists
    try:
        os.makedirs(os.path.dirname(WEB_TOKEN_FILE), exist_ok=True)
    except Exception:
        pass

    # Ensure runner and CLI are properly patched for pure UDP
    ensure_cli_and_runner_fixed()

    # Prefetch and verify xraymesh script in background
    threading.Thread(target=ensure_xraymesh_script, daemon=True).start()

    # Threading server to handle multiple simultaneous requests (e.g. live status + ping)
    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    server = ThreadedHTTPServer((BIND_ADDR, PORT), XRayMeshHandler)

    # Initialize SSL/TLS if certificates are configured
    web_env = load_env_file(WEB_ENV_FILE)
    ssl_cert = os.environ.get("WEB_SSL_CERT") or web_env.get("WEB_SSL_CERT", "")
    ssl_key = os.environ.get("WEB_SSL_KEY") or web_env.get("WEB_SSL_KEY", "")
    ssl_active = False

    if ssl_cert and ssl_key and os.path.isfile(ssl_cert) and os.path.isfile(ssl_key):
        try:
            ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            ssl_ctx.load_cert_chain(certfile=ssl_cert, keyfile=ssl_key)
            server.socket = ssl_ctx.wrap_socket(server.socket, server_side=True)
            ssl_active = True
            domain = web_env.get("WEB_DOMAIN", BIND_ADDR)
            print(f"[*] SSL/TLS enabled! XRayMesh Web Daemon securely serving HTTPS on https://{domain}:{PORT}", flush=True)
        except Exception as e:
            print(f"[!] Warning: Failed to initialize SSL/TLS: {e}. Falling back to plain HTTP.", flush=True)

    if not ssl_active:
        print(f"[*] XRayMesh Web Daemon listening on http://{BIND_ADDR}:{PORT}", flush=True)

    shutdown_done = threading.Event()

    def shutdown_signal(sig, frame):
        print(f"\n[*] Received signal {sig}, shutting down XRayMesh Web Daemon...", flush=True)
        # socketserver.shutdown() blocks until serve_forever() finishes.
        # It MUST run on a different thread than serve_forever() to prevent deadlocking.
        threading.Thread(target=server.shutdown, daemon=True).start()

        # Fallback watchdog: if graceful shutdown exceeds 2.0 seconds, force immediate exit
        def watchdog():
            if not shutdown_done.wait(timeout=2.0):
                print("[*] Forcing process termination...", flush=True)
                os._exit(0)

        threading.Thread(target=watchdog, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown_signal)
    signal.signal(signal.SIGTERM, shutdown_signal)

    try:
        server.serve_forever(poll_interval=0.2)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        shutdown_done.set()
        try:
            server.server_close()
        except Exception:
            pass
        print("[*] XRayMesh Web Daemon stopped cleanly.", flush=True)


if __name__ == "__main__":
    run_server()
