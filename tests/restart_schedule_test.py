#!/usr/bin/env python3

import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server_restart", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


def call_handler(method, path, body=None):
    raw = json.dumps(body or {}).encode("utf-8")
    handler = server.XRayMeshHandler.__new__(server.XRayMeshHandler)
    handler.rfile = io.BytesIO(raw)
    handler.wfile = io.BytesIO()
    handler.headers = {"Content-Length": str(len(raw)), "Content-Type": "application/json"}
    handler.path = path
    handler.command = method
    handler.request_version = "HTTP/1.0"
    handler.requestline = f"{method} {path} HTTP/1.0"
    handler.client_address = ("127.0.0.1", 50000)
    getattr(handler, f"do_{method}")()
    out = handler.wfile.getvalue()
    head, payload = out.split(b"\r\n\r\n", 1)
    return int(head.split(b" ", 2)[1]), json.loads(payload.decode("utf-8"))


class RestartScheduleTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.units = root / "units"
        self.units.mkdir()
        self.config = root / "config.env"
        self.schedule_file = root / "etc" / "auto-restart.json"
        self.last_file = root / "var" / "auto-restart.last"
        for name, value in {
            "CONFIG_FILE": str(self.config),
            "WEB_ENV_FILE": str(root / "web.env"),
            "RESTART_UNIT_DIR": str(self.units),
            "RESTART_SCHEDULE_FILE": str(self.schedule_file),
            "RESTART_LAST_FILE": str(self.last_file),
        }.items():
            patcher = mock.patch.object(server, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        auth = mock.patch.object(server, "is_authenticated", return_value=(True, "session"))
        auth.start()
        self.addCleanup(auth.stop)
        server.PEER_VERSION_CACHE.clear()
        server.save_node_config_env({
            "NETWORK_NAME": "alpha-mesh", "NETWORK_SECRET": "4f1c9e02b7d35a68", "HOSTNAME": "tehran-edge",
            "IPV4": "10.144.144.1", "PROTOCOL": "dual", "PORT": "11010", "PEERS": "",
            "ENCRYPTION": "yes", "IPV6": "no", "MTU": "1380", "ENABLE_KCP": "no",
        })
        self.systemctl = []

        def fake_run(cmd, *args, **kwargs):
            self.systemctl.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, "", "")

        run = mock.patch.object(server.subprocess, "run", side_effect=fake_run)
        run.start()
        self.addCleanup(run.stop)


class ParseTests(RestartScheduleTestCase):
    def test_enabled_needs_an_interval_in_range(self):
        self.assertEqual(server.parse_restart_schedule({"enabled": True, "interval_minutes": 90}), (True, 90, ""))
        for bad in (4, 0, -5, server.RESTART_MAX_MINUTES + 1, "soon", None, True, 1.5e9):
            with self.subTest(interval=bad):
                enabled, minutes, err = server.parse_restart_schedule({"enabled": True, "interval_minutes": bad})
                self.assertTrue(err)

    def test_enabled_must_be_a_boolean(self):
        self.assertTrue(server.parse_restart_schedule({"enabled": "yes", "interval_minutes": 60})[2])
        self.assertTrue(server.parse_restart_schedule({"interval_minutes": 60})[2])

    def test_turning_off_keeps_the_saved_interval(self):
        server.apply_restart_schedule(True, 120)
        self.assertEqual(server.parse_restart_schedule({"enabled": False}), (False, 120, ""))


class ApplyTests(RestartScheduleTestCase):
    def test_default_is_off(self):
        schedule = server.read_restart_schedule()
        self.assertEqual((schedule["enabled"], schedule["last_restart_at"]), (False, 0))

    def test_enabling_writes_units_and_starts_the_timer(self):
        ok, _ = server.apply_restart_schedule(True, 180)
        self.assertTrue(ok)
        timer = (self.units / "xraymesh-autorestart.timer").read_text(encoding="utf-8")
        service = (self.units / "xraymesh-autorestart.service").read_text(encoding="utf-8")
        self.assertIn("OnActiveSec=180min", timer)
        self.assertIn("OnUnitActiveSec=180min", timer)
        self.assertIn("Unit=xraymesh-autorestart.service", timer)
        self.assertIn("Type=oneshot", service)
        # Only a running mesh service is restarted, and "%" must be escaped for systemd.
        self.assertIn("systemctl is-active --quiet xraymesh.service", service)
        self.assertIn("date +%%s", service)
        self.assertIn(["systemctl", "enable", "xraymesh-autorestart.timer"], self.systemctl)
        self.assertIn(["systemctl", "restart", "xraymesh-autorestart.timer"], self.systemctl)
        self.assertEqual(server.read_restart_schedule()["interval_minutes"], 180)
        self.assertTrue(server.read_restart_schedule()["enabled"])

    def test_disabling_removes_units_and_stops_the_timer(self):
        server.apply_restart_schedule(True, 60)
        self.systemctl.clear()
        ok, _ = server.apply_restart_schedule(False, 60)
        self.assertTrue(ok)
        self.assertEqual(list(self.units.iterdir()), [])
        self.assertIn(["systemctl", "disable", "--now", "xraymesh-autorestart.timer"], self.systemctl)
        self.assertFalse(server.read_restart_schedule()["enabled"])

    def test_a_refused_timer_is_not_saved_as_enabled(self):
        def refuse(cmd, *args, **kwargs):
            return subprocess.CompletedProcess(cmd, 1 if "enable" in cmd else 0, "", "Failed to enable unit")

        with mock.patch.object(server.subprocess, "run", side_effect=refuse):
            ok, msg = server.apply_restart_schedule(True, 60)
        self.assertFalse(ok)
        self.assertIn("Failed to enable", msg)
        self.assertFalse(server.read_restart_schedule()["enabled"])

    def test_last_restart_is_read_from_the_marker(self):
        self.last_file.parent.mkdir(parents=True)
        self.last_file.write_text("1700000000\n", encoding="utf-8")
        self.assertEqual(server.read_restart_schedule()["last_restart_at"], 1700000000)


class EndpointTests(RestartScheduleTestCase):
    def test_this_server_is_read_and_changed_without_signing(self):
        status, payload = call_handler("POST", "/api/cluster/restart-schedule", {"target_ip": "10.144.144.1"})
        self.assertEqual(status, 200)
        self.assertFalse(payload["schedule"]["enabled"])
        status, payload = call_handler(
            "POST", "/api/cluster/restart-schedule",
            {"target_ip": "10.144.144.1", "enabled": True, "interval_minutes": 360},
        )
        self.assertEqual(status, 200)
        self.assertEqual((payload["schedule"]["enabled"], payload["schedule"]["interval_minutes"]), (True, 360))

    def test_invalid_requests_are_refused(self):
        status, payload = call_handler("POST", "/api/cluster/restart-schedule", {"target_ip": "not-an-ip"})
        self.assertEqual((status, payload["code"]), (400, "invalid_target"))
        status, payload = call_handler(
            "POST", "/api/cluster/restart-schedule",
            {"target_ip": "10.144.144.1", "enabled": True, "interval_minutes": 1},
        )
        self.assertEqual((status, payload["code"]), (400, "invalid_schedule"))
        self.assertFalse(self.schedule_file.exists())

    def test_another_server_is_asked_with_a_signed_request(self):
        calls = []

        def fake_cluster_request(ip, port, endpoint, secret, payload, timeout=6, **kwargs):
            calls.append((ip, endpoint, secret, payload, kwargs))
            return True, {"ok": True, "schedule": {"enabled": True, "interval_minutes": 60, "last_restart_at": 0}}, 200

        server.PEER_VERSION_CACHE["10.144.144.7"] = {"version": "3.2.0", "port": 11080}
        with mock.patch.object(server, "cluster_request", side_effect=fake_cluster_request):
            status, payload = call_handler(
                "POST", "/api/cluster/restart-schedule",
                {"target_ip": "10.144.144.7", "enabled": True, "interval_minutes": 60},
            )
            self.assertEqual(status, 200)
            self.assertEqual(payload["schedule"]["interval_minutes"], 60)
            self.assertEqual(calls[0][1], "/api/cluster/restart-schedule/set")
            self.assertEqual(calls[0][2], "4f1c9e02b7d35a68")
            self.assertEqual(calls[0][3], {"enabled": True, "interval_minutes": 60})
            # A change must never be sent twice after a timeout.
            self.assertTrue(calls[0][4]["stop_on_timeout"])
            self.assertNotIn("10.144.144.7", server.PEER_VERSION_CACHE)

            call_handler("POST", "/api/cluster/restart-schedule", {"target_ip": "10.144.144.7"})
            self.assertEqual(calls[1][1], "/api/cluster/restart-schedule/get")
        self.assertFalse(self.schedule_file.exists())

    def test_an_old_or_unreachable_server_gets_a_reason(self):
        with mock.patch.object(server, "cluster_request", return_value=(False, "Not Found", 404)):
            status, payload = call_handler("POST", "/api/cluster/restart-schedule", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["code"]), (502, "unsupported"))
        with mock.patch.object(server, "cluster_request", return_value=(False, "timed out", None)):
            status, payload = call_handler("POST", "/api/cluster/restart-schedule", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["code"]), (502, "unreachable"))

    def test_signed_node_endpoints_apply_the_schedule(self):
        with mock.patch.object(server, "verify_cluster_hmac", return_value=(True, "")):
            status, payload = call_handler(
                "POST", "/api/cluster/restart-schedule/set", {"enabled": True, "interval_minutes": 45}
            )
            self.assertEqual(status, 200)
            self.assertEqual(payload["schedule"]["interval_minutes"], 45)
            status, payload = call_handler("POST", "/api/cluster/restart-schedule/get")
            self.assertEqual((status, payload["schedule"]["enabled"]), (200, True))
            status, payload = call_handler("POST", "/api/cluster/restart-schedule/set", {"enabled": True, "interval_minutes": 2})
            self.assertEqual(status, 400)

    def test_signed_node_endpoints_refuse_unsigned_requests(self):
        status, payload = call_handler("POST", "/api/cluster/restart-schedule/set", {"enabled": True, "interval_minutes": 45})
        self.assertEqual(status, 403)
        self.assertFalse(self.schedule_file.exists())

    def test_cluster_info_and_peers_carry_the_schedule(self):
        server.apply_restart_schedule(True, 720)
        status, payload = call_handler("GET", "/api/cluster/info")
        self.assertEqual(payload["auto_restart"], {"enabled": True, "interval_minutes": 720})

    def test_a_peers_schedule_comes_from_its_info_probe(self):
        info = {"ok": True, "version": "3.2.0", "auto_restart": {"enabled": True, "interval_minutes": 30}}
        with mock.patch.object(server, "fetch_peer_cluster_info", return_value=(info, 11080, "")):
            server.get_peer_version("10.144.144.9")
        self.assertEqual(server.PEER_VERSION_CACHE["10.144.144.9"]["auto_restart"], {"enabled": True, "interval_minutes": 30})


if __name__ == "__main__":
    unittest.main()
