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
from pathlib import Path

# Paths & Defaults
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
        branch = os.environ.get("XRAYMESH_BRANCH", "beta")
        url = f"https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/{branch}/xraymesh.sh?t={int(time.time())}"
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "User-Agent": "XRayMesh-Web/1.8.0"
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


def get_xraymesh_script():
    """Find the xraymesh.sh script path."""
    return ensure_xraymesh_script()


def get_network_interfaces():
    """Retrieve available host network interfaces."""
    interfaces = ["any"]
    try:
        r = subprocess.run(["ip", "-o", "link", "show"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2)
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                parts = line.split(":", 2)
                if len(parts) >= 2:
                    iface = parts[1].strip().split("@")[0]
                    if iface and iface not in ("lo", "any") and not iface.startswith("easytier") and not iface.startswith("docker"):
                        if iface not in interfaces:
                            interfaces.append(iface)
    except Exception:
        pass
    return interfaces


def run_xraymesh_cmd(args, timeout=45):
    """Execute an xraymesh.sh command with arguments and return (success, message)."""
    script = get_xraymesh_script()
    if not os.path.isfile(script):
        return False, (
            f"XRayMesh CLI script not found at {script}. "
            "Please run: bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/beta/xraymesh.sh)"
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
    """Detect public IPv4 of the server with multi-provider fallback (cached for 60s)."""
    now = time.time()
    if _public_ip_cache["ip"] and (now - _public_ip_cache["time"]) < 60:
        return _public_ip_cache["ip"]

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
    """Verify HMAC-SHA256 signature on inter-node cluster commands."""
    cleanup_nonce_cache()
    sig = headers.get("X-Cluster-Signature", "").strip()
    ts_str = headers.get("X-Cluster-Timestamp", "").strip()
    nonce = headers.get("X-Cluster-Nonce", "").strip()

    if not sig or not ts_str or not nonce:
        return False, "Missing cluster authentication headers"

    try:
        ts = float(ts_str)
    except Exception:
        return False, "Invalid timestamp"

    now = time.time()
    if abs(now - ts) > 35.0:
        return False, f"Request expired or clock skew (drift: {round(abs(now - ts), 1)}s)"

    if nonce in CLUSTER_NONCE_CACHE:
        return False, "Replay attack detected (nonce already processed)"

    cfg = load_env_file(CONFIG_FILE)
    secret = cfg.get("NETWORK_SECRET", "").strip()

    # Also verify against staged secret or backup secret if recently committed
    secrets_to_try = [secret]
    if os.path.isfile(CONFIG_BACKUP_FILE):
        bak_cfg = load_env_file(CONFIG_BACKUP_FILE)
        bak_secret = bak_cfg.get("NETWORK_SECRET", "").strip()
        if bak_secret and bak_secret not in secrets_to_try:
            secrets_to_try.append(bak_secret)

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
    """Sign inter-node cluster request using HMAC-SHA256."""
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
        "User-Agent": "XRayMesh-Cluster/1.8.0"
    }
    return body_bytes, headers


def rollback_cluster_config():
    """Revert configuration from backup and restart node service."""
    if os.path.isfile(CONFIG_BACKUP_FILE):
        try:
            shutil.copy2(CONFIG_BACKUP_FILE, CONFIG_FILE)
            try:
                os.remove(CONFIG_STAGED_FILE)
            except Exception:
                pass
            print("[Cluster-Rollback] Restored config from backup! Restarting node...", flush=True)
            run_xraymesh_cmd(["node-restart"])
            return True
        except Exception as e:
            print(f"[Cluster-Rollback] Error rolling back: {e}", flush=True)
    return False


def arm_rollback_watchdog(timeout_sec=60):
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

    # 5. Arm rollback watchdog
    arm_rollback_watchdog(timeout_sec=60)

    # 6. Restart node service in background thread so HTTP response returns immediately
    def restart_bg():
        time.sleep(0.4)
        run_xraymesh_cmd(["node-restart"])

    threading.Thread(target=restart_bg, daemon=True).start()
    return True, "Config committed. Service restarting with 60s rollback watchdog."


def send_cluster_http(target_ip, target_port, endpoint, secret, payload, timeout=6):
    """Send signed HTTP POST request to a cluster peer."""
    url = f"http://{target_ip}:{target_port}{endpoint}"
    body_bytes, headers = sign_cluster_request(secret, payload)
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return True, data
    except Exception as e:
        return False, str(e)


class XRayMeshHandler(http.server.BaseHTTPRequestHandler):
    """Custom HTTP handler with REST API and Single Page Application routing."""

    server_version = "XRayMesh-Web/1.8.0"

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

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = dict(urllib.parse.parse_qsl(parsed.query))

        # Check token parameter in URL for one-click browser entry
        if "token" in query:
            token = query["token"]
            if validate_token(token):
                session_id = create_session()
                # Redirect to clean URL '/' with Set-Cookie
                cookie_val = f"{SESSION_COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DURATION_SEC}"
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
            self.send_json({
                "authenticated": auth_ok,
                "password_configured": has_pw,
                "node_configured": os.path.isfile(CONFIG_FILE)
            })
            return

        # Protected API endpoints below
        if not auth_ok:
            self.send_json({"error": "Unauthorized", "authenticated": False}, status=401)
            return

        if path == "/api/status":
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

            self.send_json({
                "node": {
                    "network_name": config.get("NETWORK_NAME", ""),
                    "hostname": config.get("HOSTNAME", ""),
                    "ipv4": config.get("IPV4", ""),
                    "protocol": config.get("PROTOCOL", "tcp/udp"),
                    "port": config.get("PORT", ""),
                    "encryption": config.get("ENCRYPTION", "yes"),
                    "service_active": svc_active,
                    "easytier_version": et_ver
                },
                "system": system_stats
            })
            return

        elif path == "/api/peers":
            peers_data = get_easytier_peers()
            self.send_json({
                "ok": True,
                "data": peers_data
            })
            return

        elif path == "/api/routes":
            routes_data = get_easytier_routes()
            self.send_json({
                "ok": True,
                "data": routes_data
            })
            return

        elif path == "/api/tunnels":
            tunnels_data = get_tunnels()
            self.send_json({
                "ok": True,
                "data": tunnels_data
            })
            return

        elif path == "/api/interfaces":
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
                "staged_exists": os.path.isfile(CONFIG_STAGED_FILE)
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
                    "node_configured": os.path.isfile(CONFIG_FILE),
                    "service_active": svc_active
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

            invite_obj = {
                "v": 1,
                "net": config.get("NETWORK_NAME", "xraymesh"),
                "secret": config.get("NETWORK_SECRET", ""),
                "endpoint": f"{pub_ip}:{port}" if pub_ip else "",
                "proto": proto
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
            password = data.get("password", "")
            token = data.get("token", "")

            web_cfg = load_env_file(WEB_ENV_FILE)
            stored_hash = web_cfg.get("WEB_PASSWORD_HASH", "")

            # 1. Try Token
            if token and validate_token(token):
                session_id = create_session()
                cookie_val = f"{SESSION_COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DURATION_SEC}"
                self.send_json({"ok": True, "method": "token"}, headers={"Set-Cookie": cookie_val})
                return

            # 2. Try Password
            if password and stored_hash and verify_password(password, stored_hash):
                session_id = create_session()
                cookie_val = f"{SESSION_COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DURATION_SEC}"
                self.send_json({"ok": True, "method": "password"}, headers={"Set-Cookie": cookie_val})
                return

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
            clear_cookie = f"{SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
            self.send_json({"ok": True}, headers={"Set-Cookie": clear_cookie})
            return

        # ======================================================================
        # 🌐 Cluster Inter-Node SafeSync Endpoints (Authenticated via HMAC-SHA256)
        # ======================================================================
        if path in ("/api/cluster/prepare", "/api/cluster/commit", "/api/cluster/confirm", "/api/cluster/rollback"):
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

        # Authenticated Endpoints
        auth_ok, _ = is_authenticated(self.headers)
        if not auth_ok:
            self.send_json({"error": "Unauthorized", "authenticated": False}, status=401)
            return

        if path == "/api/ping":
            target = data.get("target", "").strip()
            count = min(max(int(data.get("count", 4)), 1), 10)

            # Security: Validate target is IPv4
            if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target):
                self.send_json({"ok": False, "error": "Invalid target IP"}, status=400)
                return

            try:
                cmd = ["ping", "-c", str(count), "-W", "2", target]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=12)
                output = res.stdout

                # Parse ping stats
                # Example: 4 packets transmitted, 4 received, 0% packet loss, time 3004ms
                # rtt min/avg/max/mdev = 12.34/15.67/18.90/2.12 ms
                stats = {
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

                self.send_json({"ok": True, "data": stats})
            except subprocess.TimeoutExpired:
                self.send_json({"ok": False, "error": "Ping request timed out"}, status=504)
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, status=500)
            return

        elif path == "/api/iperf/run":
            target = data.get("target", "").strip()
            protocol = data.get("protocol", "tcp").lower()
            duration = min(max(int(data.get("duration", 5)), 1), 30)
            bandwidth = data.get("bandwidth", "50M").strip()
            port = int(data.get("port", 5201))

            if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", target):
                self.send_json({"ok": False, "error": "Invalid target IP"}, status=400)
                return

            if protocol not in ("tcp", "udp"):
                protocol = "tcp"

            # Check iperf3 command available
            try:
                subprocess.run(["iperf3", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            except Exception:
                self.send_json({"ok": False, "error": "iperf3 is not installed on this server. Run sudo ./xraymesh.sh web to install."}, status=500)
                return

            cmd = ["iperf3", "-c", target, "-p", str(port), "-t", str(duration), "-J"]
            if protocol == "udp":
                cmd.extend(["-u", "-b", bandwidth])

            try:
                # Add 5s grace period to timeout
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=duration + 8)
                raw_json = res.stdout.strip()
                if not raw_json:
                    err_msg = res.stderr.strip() or "No output from iperf3 test"
                    self.send_json({"ok": False, "error": err_msg}, status=500)
                    return

                parsed_res = json.loads(raw_json)

                # Extract key benchmark figures
                benchmark = {
                    "target": target,
                    "protocol": protocol,
                    "duration": duration,
                    "error": parsed_res.get("error", None),
                    "intervals": [],
                    "summary": {}
                }

                if "error" in parsed_res:
                    self.send_json({"ok": False, "error": parsed_res["error"]}, status=500)
                    return

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
                        "mbps": round(sum_int.get("bits_per_second", 0) / 1e6, 2)
                    })

                self.send_json({"ok": True, "data": benchmark})
            except subprocess.TimeoutExpired:
                self.send_json({"ok": False, "error": "iperf3 test timed out. Ensure the target node is running an iperf3 server on port 5201."}, status=504)
            except Exception as e:
                self.send_json({"ok": False, "error": str(e)}, status=500)
            return

        elif path == "/api/tunnels/haproxy/create":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["haproxy-create", name, target, ports])
            if ok:
                self.send_json({"ok": True, "message": msg or "HAProxy tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create HAProxy tunnel."}, status=400)
            return

        elif path == "/api/tunnels/haproxy/edit":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["haproxy-edit", name, target, ports])
            if ok:
                self.send_json({"ok": True, "message": msg or "HAProxy tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update HAProxy tunnel."}, status=400)
            return

        elif path == "/api/tunnels/haproxy/delete":
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["haproxy-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "HAProxy tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete HAProxy tunnel."}, status=400)
            return

        elif path == "/api/tunnels/iptables/create":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "udp").strip().lower()
            in_if = data.get("interface", "any").strip()
            source_cidr = data.get("source_cidr", "0.0.0.0/0").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["iptables-create", name, target, ports, protocol, in_if, source_cidr])
            if ok:
                self.send_json({"ok": True, "message": msg or "iptables tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create iptables tunnel."}, status=400)
            return

        elif path == "/api/tunnels/iptables/edit":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "udp").strip().lower()
            in_if = data.get("interface", "any").strip()
            source_cidr = data.get("source_cidr", "0.0.0.0/0").strip()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["iptables-edit", name, target, ports, protocol, in_if, source_cidr])
            if ok:
                self.send_json({"ok": True, "message": msg or "iptables tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update iptables tunnel."}, status=400)
            return

        elif path == "/api/tunnels/iptables/delete":
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["iptables-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "iptables tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete iptables tunnel."}, status=400)
            return

        elif path == "/api/tunnels/gost/create":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["gost-create", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "GOST tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create GOST tunnel."}, status=400)
            return

        elif path == "/api/tunnels/gost/edit":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["gost-edit", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "GOST tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update GOST tunnel."}, status=400)
            return

        elif path == "/api/tunnels/gost/delete":
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["gost-delete", name])
            if ok:
                self.send_json({"ok": True, "message": msg or "GOST tunnel deleted successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to delete GOST tunnel."}, status=400)
            return

        elif path == "/api/tunnels/realm/create":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["realm-create", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "Realm tunnel created successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to create Realm tunnel."}, status=400)
            return

        elif path == "/api/tunnels/realm/edit":
            name = data.get("name", "").strip()
            target = data.get("target", "").strip()
            ports = data.get("ports", "").strip()
            protocol = data.get("protocol", "both").strip().lower()

            if not name or not target or not ports:
                self.send_json({"ok": False, "error": "Missing required fields: name, target, ports"}, status=400)
                return

            ok, msg = run_xraymesh_cmd(["realm-edit", name, target, ports, protocol])
            if ok:
                self.send_json({"ok": True, "message": msg or "Realm tunnel updated successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to update Realm tunnel."}, status=400)
            return

        elif path == "/api/tunnels/realm/delete":
            name = data.get("name", "").strip()
            if not name:
                self.send_json({"ok": False, "error": "Missing tunnel name"}, status=400)
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
            invite_raw = data.get("invite", "").strip()
            if not invite_raw:
                self.send_json({"ok": False, "error": "Missing invite token"}, status=400)
                return

            token = invite_raw.replace("xrmesh://", "").strip()
            try:
                decoded_json = base64.b64decode(token).decode("utf-8")
                invite_data = json.loads(decoded_json)
            except Exception as e:
                self.send_json({"ok": False, "error": f"Invalid invite format: {e}"}, status=400)
                return

            net = invite_data.get("net", "").strip()
            secret = invite_data.get("secret", "").strip()
            endpoint = invite_data.get("endpoint", "").strip()
            proto = invite_data.get("proto", "dual").strip().lower()

            if not net or not secret:
                self.send_json({"ok": False, "error": "Invite token is missing network name or secret"}, status=400)
                return

            custom_hostname = data.get("hostname", "").strip()
            custom_ipv4 = data.get("ipv4", "").strip()

            cfg = load_env_file(CONFIG_FILE)
            cur_ip = custom_ipv4 or cfg.get("IPV4", "")
            if not cur_ip or cur_ip == "10.144.144.1":
                cur_ip = f"10.144.144.{secrets.randbelow(200) + 2}"

            final_hostname = custom_hostname or cfg.get("HOSTNAME", "").strip()
            if not final_hostname:
                final_hostname = os.uname().nodename if hasattr(os, "uname") else "node"

            cfg["NETWORK_NAME"] = net
            cfg["NETWORK_SECRET"] = secret
            cfg["PROTOCOL"] = proto
            cfg["IPV4"] = cur_ip
            cfg["HOSTNAME"] = final_hostname
            if not cfg.get("PORT"):
                cfg["PORT"] = "11010"
            if not cfg.get("ENCRYPTION"):
                cfg["ENCRYPTION"] = "yes"
            if not cfg.get("IPV6"):
                cfg["IPV6"] = "no"
            if not cfg.get("MTU"):
                cfg["MTU"] = "1380"

            mesh_port = str(cfg.get("PORT", "11010"))
            clean_endpoint = sanitize_peer_endpoint(endpoint, mesh_port)
            cur_peers = [sanitize_peer_endpoint(p, mesh_port) for p in cfg.get("PEERS", "").split(",") if p.strip()]
            cur_peers = [p for p in cur_peers if p]
            if clean_endpoint and clean_endpoint not in cur_peers:
                cur_peers.append(clean_endpoint)
            cfg["PEERS"] = ",".join(cur_peers)

            save_node_config_env(cfg)
            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({
                    "ok": True,
                    "message": f"Successfully joined mesh '{net}'. Node is online.",
                    "data": {
                        "network_name": net,
                        "ipv4": cur_ip,
                        "peer": clean_endpoint
                    }
                })
            else:
                self.send_json({"ok": False, "error": f"Joined mesh '{net}', but node service failed to start: {msg}"}, status=500)
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
            arm_rollback_watchdog(timeout_sec=60)

            # Restart local controller service
            run_xraymesh_cmd(["node-restart"])

            # Phase 4: Launch asynchronous confirmation monitor in background
            def monitor_and_confirm():
                time.sleep(3.0)
                start_check = time.time()
                while time.time() - start_check < 30.0:
                    peers = get_easytier_peers()
                    has_connected_peer = False
                    if peers:
                        for p in peers:
                            if str(p.get("cost", "0")) not in ("0", "Local", "none", ""):
                                has_connected_peer = True
                                break
                    if has_connected_peer:
                        print("[Cluster-Broadcast] Peers reconnected! Sending confirmation to disarm watchdogs...", flush=True)
                        for p in active_peers:
                            send_cluster_http(p["ipv4"], PORT, "/api/cluster/confirm", new_secret, {}, 4)
                        disarm_rollback_watchdog()
                        break
                    time.sleep(2.0)

            threading.Thread(target=monitor_and_confirm, daemon=True).start()

            synced_names = [p["hostname"] for p in active_peers] + [cfg.get("HOSTNAME", "local")]
            self.send_json({
                "ok": True,
                "message": f"Successfully synchronized settings to {len(active_peers)} peer(s). Nodes are restarting with self-healing watchdogs armed.",
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

        elif path == "/api/node/start":
            ok, msg = run_xraymesh_cmd(["node-restart"])
            if ok:
                self.send_json({"ok": True, "message": "Mesh node service started successfully."})
            else:
                self.send_json({"ok": False, "error": msg or "Failed to start node service."}, status=500)
            return

        elif path == "/api/node/stop":
            ok, msg = run_xraymesh_cmd(["stop"])
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

        self.send_error(404, "Endpoint not found")


def run_server():
    """Start the HTTP server on configured BIND_ADDR and PORT."""
    # Ensure tokens directory exists
    try:
        os.makedirs(os.path.dirname(WEB_TOKEN_FILE), exist_ok=True)
    except Exception:
        pass

    # Prefetch and verify xraymesh script in background
    threading.Thread(target=ensure_xraymesh_script, daemon=True).start()

    # Threading server to handle multiple simultaneous requests (e.g. live status + ping)
    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    server = ThreadedHTTPServer((BIND_ADDR, PORT), XRayMeshHandler)
    print(f"[*] XRayMesh Web Daemon listening on {BIND_ADDR}:{PORT}")

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
