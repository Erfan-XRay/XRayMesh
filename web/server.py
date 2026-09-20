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
import time
import uuid
import hashlib
import secrets
import re
import signal
from pathlib import Path

# Paths & Defaults
INSTALL_DIR = os.environ.get("INSTALL_DIR", "/opt/xraymesh")
BIN_DIR = os.path.join(INSTALL_DIR, "bin")
CONFIG_FILE = os.environ.get("CONFIG_FILE", "/etc/xraymesh/config.env")
WEB_ENV_FILE = os.environ.get("WEB_ENV_FILE", "/etc/xraymesh/web.env")
WEB_TOKEN_FILE = os.environ.get("WEB_TOKEN_FILE", "/etc/xraymesh/web-tokens.json")
HAPROXY_DIR = os.environ.get("HAPROXY_DIR", "/etc/xraymesh/haproxy-tunnels")
IPTABLES_DIR = os.environ.get("IPTABLES_DIR", "/etc/xraymesh/iptables-tunnels")
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
    """Read HAProxy and iptables configured tunnels."""
    tunnels = {"haproxy": [], "iptables": []}

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

    # Check systemd status
    def check_service(name):
        try:
            r = subprocess.run(["systemctl", "is-active", name], stdout=subprocess.PIPE, text=True)
            return r.stdout.strip()
        except Exception:
            return "unknown"

    tunnels["haproxy_service"] = check_service("xraymesh-haproxy.service")
    tunnels["iptables_service"] = check_service("xraymesh-iptables.service")
    tunnels["iperf_service"] = check_service("xraymesh-iperf.service")

    return tunnels


def get_xraymesh_script():
    """Find the xraymesh.sh script path."""
    candidates = [
        os.path.join(INSTALL_DIR, "xraymesh.sh"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "xraymesh.sh"),
        "/usr/local/bin/xraymesh",
        "xraymesh"
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return candidates[0]


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


def run_xraymesh_cmd(args):
    """Execute an xraymesh.sh command with arguments and return (success, message)."""
    script = get_xraymesh_script()
    cmd = ["bash", script] + args
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
        output = (r.stdout + "\n" + r.stderr).strip()
        clean_out = re.sub(r'\x1b\[[0-9;]*[mGKF]', '', output).strip()
        return r.returncode == 0, clean_out
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

        self.send_error(404, "Endpoint not found")


def run_server():
    """Start the HTTP server on configured BIND_ADDR and PORT."""
    # Ensure tokens directory exists
    try:
        os.makedirs(os.path.dirname(WEB_TOKEN_FILE), exist_ok=True)
    except Exception:
        pass

    # Threading server to handle multiple simultaneous requests (e.g. live status + ping)
    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    server = ThreadedHTTPServer((BIND_ADDR, PORT), XRayMeshHandler)
    print(f"[*] XRayMesh Web Daemon listening on {BIND_ADDR}:{PORT}")

    def shutdown_signal(sig, frame):
        print("\n[*] Shutting down XRayMesh Web Daemon...")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_signal)
    signal.signal(signal.SIGTERM, shutdown_signal)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
