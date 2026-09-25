#!/usr/bin/env python3

import importlib.util
import io
import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server_update", SERVER_PATH)
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
    assert out.count(b"HTTP/1.0 ") == 1, out
    head, payload = out.split(b"\r\n\r\n", 1)
    return int(head.split(b" ", 2)[1]), json.loads(payload.decode("utf-8"))


class UpdateTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.web_env = root / "web.env"
        self.config = root / "config.env"
        self.status_file = root / "state" / "update-status.json"
        for name, value in {
            "WEB_ENV_FILE": str(self.web_env),
            "CONFIG_FILE": str(self.config),
            "UPDATE_STATUS_FILE": str(self.status_file),
        }.items():
            patcher = mock.patch.object(server, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        env = mock.patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("XRAYMESH_BRANCH", None)
        auth = mock.patch.object(server, "is_authenticated", return_value=(True, "session"))
        auth.start()
        self.addCleanup(auth.stop)
        server.VERSION_CACHE.clear()
        server.PEER_VERSION_CACHE.clear()
        server.save_node_config_env({
            "NETWORK_NAME": "alpha-mesh", "NETWORK_SECRET": "4f1c9e02b7d35a68", "HOSTNAME": "tehran-edge",
            "IPV4": "10.144.144.1", "PROTOCOL": "dual", "PORT": "11010", "PEERS": "",
            "ENCRYPTION": "yes", "IPV6": "no", "MTU": "1380", "ENABLE_KCP": "no",
        })

    def write_status(self, **fields):
        self.status_file.parent.mkdir(parents=True, exist_ok=True)
        self.status_file.write_text(json.dumps(fields), encoding="utf-8")


class ChannelTests(UpdateTestCase):
    def test_set_channel_persists_applies_live_and_keeps_other_settings(self):
        self.web_env.write_text('WEB_PORT="11080"\nXRAYMESH_BRANCH="main"\nWEB_PASSWORD_HASH="x"', encoding="utf-8")
        server.VERSION_CACHE["beta"] = {"data": {"latest_version": "old"}, "last_checked": time.time()}

        server.set_update_channel("beta")

        lines = self.web_env.read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines, ['WEB_PORT="11080"', 'XRAYMESH_BRANCH="beta"', 'WEB_PASSWORD_HASH="x"'])
        self.assertEqual(os.environ["XRAYMESH_BRANCH"], "beta")
        self.assertEqual(server.get_active_branch(), "beta")
        self.assertNotIn("beta", server.VERSION_CACHE)
        self.assertEqual(server.branch_channel("beta"), "beta")
        self.assertEqual(server.branch_channel("main"), "stable")
        self.assertEqual(server.branch_channel("feature-x"), "custom")

    def test_channel_endpoint_validates_input(self):
        status, payload = call_handler("POST", "/api/update/channel", {"channel": "nightly"})
        self.assertEqual((status, payload["code"]), (400, "invalid_channel"))
        self.assertFalse(self.web_env.exists())

        with mock.patch.object(server, "get_version_info", return_value={}):
            status, payload = call_handler("POST", "/api/update/channel", {"channel": "stable"})
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"]["channel"], "stable")
        self.assertIn('XRAYMESH_BRANCH="main"', self.web_env.read_text(encoding="utf-8"))

    def test_cluster_info_reports_channel_and_update_job(self):
        os.environ["XRAYMESH_BRANCH"] = "beta"
        self.write_status(state="running", step="download", target_version="9.0.0", updated_at=time.time())
        with mock.patch.object(server, "get_cached_version_info", return_value={"latest_version": "9.0.0"}):
            status, payload = call_handler("GET", "/api/cluster/info")
        self.assertEqual(status, 200)
        self.assertEqual(payload["version"], server.CURRENT_VERSION)
        self.assertEqual((payload["branch"], payload["channel"]), ("beta", "beta"))
        self.assertEqual(payload["latest_version"], "9.0.0")
        self.assertTrue(payload["update_available"])
        self.assertEqual((payload["update"]["state"], payload["update"]["step"]), ("running", "download"))


class LocalUpdateTests(UpdateTestCase):
    def test_stalled_job_is_reported_as_failed(self):
        self.write_status(state="running", step="download", updated_at=time.time() - server.UPDATE_STALE_SEC - 5)
        job = server.read_update_status()
        self.assertEqual(job["state"], "failed")
        self.assertIn("stopped reporting", job["error"])

    def test_second_update_is_refused_while_one_runs(self):
        self.write_status(state="running", step="install", updated_at=time.time())
        status, payload = call_handler("POST", "/api/update/start")
        self.assertEqual((status, payload["code"]), (409, "already_running"))

    def test_start_launches_detached_unit_with_channel_and_records_queued(self):
        os.environ["XRAYMESH_BRANCH"] = "beta"
        calls = []

        def fake_run(cmd, *args, **kwargs):
            calls.append(cmd)
            return subprocess.CompletedProcess(cmd, 0, "", "")

        with mock.patch.object(server.shutil, "which", return_value="/usr/bin/systemd-run"), \
                mock.patch.object(server.subprocess, "run", side_effect=fake_run), \
                mock.patch.object(server, "get_xraymesh_script", return_value=str(SERVER_PATH)), \
                mock.patch.object(server, "ensure_cli_and_runner_fixed"), \
                mock.patch.object(server, "get_cached_version_info", return_value={"latest_version": "9.0.0"}):
            status, payload = call_handler("POST", "/api/update/start")

        self.assertEqual((status, payload["code"]), (200, "queued"))
        launch = next(c for c in calls if c[0] == "systemd-run")
        self.assertIn("--setenv=XRAYMESH_BRANCH=beta", launch)
        self.assertEqual(launch[-2:], [str(SERVER_PATH), "node-update"])
        job = json.loads(self.status_file.read_text(encoding="utf-8"))
        self.assertEqual((job["state"], job["target_version"], job["branch"]), ("queued", "9.0.0", "beta"))


class ClusterProxyTests(UpdateTestCase):
    def test_remote_failures_map_to_codes(self):
        for http_status, code in ((403, "auth_failed"), (404, "unsupported"), (None, "unreachable"), (500, "remote_error")):
            with self.subTest(http_status=http_status):
                with mock.patch.object(server, "cluster_request", return_value=(False, "boom", http_status)):
                    status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.7"})
                self.assertEqual((status, payload["ok"], payload["code"]), (502, False, code))

    def test_remote_update_passes_through_peer_codes(self):
        reply = {"ok": False, "code": "already_running", "error": "busy", "status": {}}
        with mock.patch.object(server, "cluster_request", return_value=(True, reply, 200)):
            status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["code"], payload["legacy"]), (409, "already_running", False))

    def test_legacy_peer_update_is_flagged(self):
        with mock.patch.object(server, "cluster_request", return_value=(True, {"ok": True, "message": "started"}, 200)):
            status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["ok"], payload["code"], payload["legacy"]), (200, True, "queued", True))

    def test_status_falls_back_to_version_probe_for_old_or_restarting_peers(self):
        with mock.patch.object(server, "cluster_request", return_value=(False, "Not Found", 404)), \
                mock.patch.object(server, "fetch_peer_cluster_info", return_value=({"version": "2.2.5"}, 11080, "")):
            status, payload = call_handler("POST", "/api/cluster/update/status", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["reachable"], payload["legacy"]), (200, True, True))
        self.assertEqual(payload["status"]["version"], "2.2.5")

        with mock.patch.object(server, "cluster_request", return_value=(False, "timed out", None)), \
                mock.patch.object(server, "fetch_peer_cluster_info", return_value=({}, None, "timed out")):
            status, payload = call_handler("POST", "/api/cluster/update/status", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["ok"], payload["reachable"]), (200, True, False))

    def test_channel_change_is_forwarded_and_validated(self):
        status, payload = call_handler("POST", "/api/cluster/channel", {"target_ip": "10.144.144.7", "channel": "x"})
        self.assertEqual((status, payload["code"]), (400, "invalid_channel"))

        with mock.patch.object(server, "cluster_request", return_value=(True, {"ok": True, "status": {"channel": "beta"}}, 200)) as req:
            status, payload = call_handler("POST", "/api/cluster/channel", {"target_ip": "10.144.144.7", "channel": "beta"})
        self.assertEqual((status, payload["status"]["channel"]), (200, "beta"))
        self.assertEqual(req.call_args[0][2:5], ("/api/cluster/node/channel", "4f1c9e02b7d35a68", {"channel": "beta"}))

    def test_local_target_is_handled_without_the_network(self):
        with mock.patch.object(server, "spawn_detached_node_update", return_value=(True, "ok", "queued")) as spawn, \
                mock.patch.object(server, "cluster_request") as req:
            status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.1"})
        self.assertEqual((status, payload["code"]), (200, "queued"))
        spawn.assert_called_once()
        req.assert_not_called()

    def test_rejects_invalid_target(self):
        status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "all"})
        self.assertEqual((status, payload["code"]), (400, "invalid_target"))


class PeersListTests(UpdateTestCase):
    def test_peer_update_state_comes_from_the_peer_itself(self):
        peers = [
            {"ipv4": "10.144.144.7", "hostname": "new-peer", "cost": "p2p"},
            {"ipv4": "10.144.144.8", "hostname": "old-peer-other-branch", "cost": "relay(2)"},
        ]

        def fake_probe(ip, *args, **kwargs):
            if ip == "10.144.144.7":
                server.PEER_VERSION_CACHE[ip] = {"version": "2.2.6-beta.4", "branch": "main", "channel": "stable",
                                                 "latest_version": "2.2.7", "update_available": True, "update": {"state": "idle"}}
                return "2.2.6-beta.4"
            server.PEER_VERSION_CACHE[ip] = {"version": "2.2.5", "branch": "main"}
            return "2.2.5"

        os.environ["XRAYMESH_BRANCH"] = "beta"
        with mock.patch.object(server, "get_easytier_peers", return_value=peers), \
                mock.patch.object(server, "get_peer_version", side_effect=fake_probe), \
                mock.patch.object(server, "get_version_info", return_value={"latest_version": "9.9.9"}), \
                mock.patch.object(server, "get_cached_version_info", return_value={"latest_version": "9.9.9"}), \
                mock.patch.object(server, "get_network_interfaces", return_value=["any"]):
            status, payload = call_handler("GET", "/api/peers")

        self.assertEqual(status, 200)
        by_ip = {p["ipv4"]: p for p in payload["data"]}
        new_peer, old_peer, local = by_ip["10.144.144.7"], by_ip["10.144.144.8"], by_ip["10.144.144.1"]
        self.assertEqual((new_peer["channel"], new_peer["latest_version"], new_peer["update_available"]), ("stable", "2.2.7", True))
        self.assertEqual(new_peer["connection"], "direct")
        # An older peer on another branch cannot be judged against this server's beta release.
        self.assertEqual((old_peer["update_available"], old_peer["connection"]), (False, "relay"))
        # Only the peer that does not report a channel runs the untracked legacy updater.
        self.assertEqual((new_peer["legacy"], old_peer["legacy"]), (False, True))
        self.assertEqual((local["is_current"], local["channel"], local["update_available"]), (True, "beta", True))


if __name__ == "__main__":
    unittest.main()
