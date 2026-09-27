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


class BranchTests(UpdateTestCase):
    def test_leftover_beta_branch_is_ignored(self):
        # A server that used the removed beta channel still has it in web.env and the service environment.
        self.web_env.write_text('WEB_PORT="11080"\nXRAYMESH_BRANCH="beta"\n', encoding="utf-8")
        os.environ["XRAYMESH_BRANCH"] = "beta"
        self.assertEqual(server.get_active_branch(), "main")

    def test_channel_endpoints_are_gone(self):
        for path in ("/api/update/channel", "/api/cluster/channel"):
            with self.subTest(path=path):
                raw = json.dumps({"target_ip": "10.144.144.7", "channel": "beta"}).encode("utf-8")
                handler = server.XRayMeshHandler.__new__(server.XRayMeshHandler)
                handler.rfile = io.BytesIO(raw)
                handler.wfile = io.BytesIO()
                handler.headers = {"Content-Length": str(len(raw)), "Content-Type": "application/json"}
                handler.path = path
                handler.command = "POST"
                handler.request_version = "HTTP/1.0"
                handler.requestline = f"POST {path} HTTP/1.0"
                handler.client_address = ("127.0.0.1", 50000)
                handler.do_POST()
                self.assertTrue(handler.wfile.getvalue().startswith(b"HTTP/1.0 404"))
        self.assertFalse(self.web_env.exists())

    def test_cluster_info_reports_main_and_update_job(self):
        os.environ["XRAYMESH_BRANCH"] = "beta"
        self.write_status(state="running", step="download", target_version="9.0.0", updated_at=time.time())
        with mock.patch.object(server, "get_cached_version_info", return_value={"latest_version": "9.0.0"}):
            status, payload = call_handler("GET", "/api/cluster/info")
        self.assertEqual(status, 200)
        self.assertEqual(payload["version"], server.CURRENT_VERSION)
        # Older panels in the mesh still read "channel"; it is always stable now.
        self.assertEqual((payload["branch"], payload["channel"]), ("main", "stable"))
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

    def test_start_launches_detached_unit_on_main_and_records_queued(self):
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
        self.assertIn("--setenv=XRAYMESH_BRANCH=main", launch)
        self.assertEqual(launch[-2:], [str(SERVER_PATH), "node-update"])
        job = json.loads(self.status_file.read_text(encoding="utf-8"))
        self.assertEqual((job["state"], job["target_version"], job["branch"]), ("queued", "9.0.0", "main"))


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

    def test_beta_peer_is_moved_to_main_before_its_update(self):
        server.PEER_VERSION_CACHE["10.144.144.7"] = {"version": "3.0.0-beta.16", "branch": "beta", "channel": "beta"}
        replies = [(True, {"ok": True, "status": {}}, 200), (True, {"ok": True, "code": "queued", "status": {}}, 200)]
        with mock.patch.object(server, "cluster_request", side_effect=replies) as req:
            status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["code"]), (200, "queued"))
        self.assertEqual([c[0][2:5] for c in req.call_args_list], [
            ("/api/cluster/node/channel", "4f1c9e02b7d35a68", {"channel": "stable"}),
            ("/api/cluster/node/update", "4f1c9e02b7d35a68", {}),
        ])

    def test_beta_peer_is_not_updated_when_the_move_to_main_fails(self):
        server.PEER_VERSION_CACHE["10.144.144.7"] = {"version": "3.0.0-beta.16", "branch": "beta", "channel": "beta"}
        with mock.patch.object(server, "cluster_request", return_value=(False, "timed out", None)) as req:
            status, payload = call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.7"})
        self.assertEqual((status, payload["code"]), (502, "unreachable"))
        req.assert_called_once()

    def test_main_peer_update_skips_the_move(self):
        server.PEER_VERSION_CACHE["10.144.144.7"] = {"version": "3.0.1", "branch": "main", "channel": "stable"}
        with mock.patch.object(server, "cluster_request", return_value=(True, {"ok": True, "code": "queued"}, 200)) as req:
            call_handler("POST", "/api/cluster/update", {"target_ip": "10.144.144.7"})
        self.assertEqual([c[0][2] for c in req.call_args_list], ["/api/cluster/node/update"])

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
    def test_peer_update_state_is_judged_against_main(self):
        peers = [
            {"ipv4": "10.144.144.7", "hostname": "new-peer", "cost": "p2p"},
            {"ipv4": "10.144.144.8", "hostname": "old-peer", "cost": "relay(2)"},
            {"ipv4": "10.144.144.9", "hostname": "beta-peer", "cost": "p2p"},
            {"ipv4": "10.144.144.10", "hostname": "old-peer-other-branch", "cost": "p2p"},
        ]
        cache = {
            "10.144.144.7": {"version": "3.0.1", "branch": "main", "channel": "stable",
                             "latest_version": "3.0.2", "update_available": True, "update": {"state": "idle"}},
            "10.144.144.8": {"version": "2.2.5", "branch": "main"},
            # Checked the removed beta channel and found nothing newer there.
            "10.144.144.9": {"version": "3.0.0-beta.16", "branch": "beta", "channel": "beta",
                             "latest_version": "3.0.0-beta.16", "update_available": False},
            "10.144.144.10": {"version": "2.2.5", "branch": "feature-x"},
        }

        def fake_probe(ip, *args, **kwargs):
            server.PEER_VERSION_CACHE[ip] = dict(cache[ip])
            return cache[ip]["version"]

        os.environ["XRAYMESH_BRANCH"] = "beta"
        with mock.patch.object(server, "get_easytier_peers", return_value=peers), \
                mock.patch.object(server, "get_peer_version", side_effect=fake_probe), \
                mock.patch.object(server, "get_version_info", return_value={"latest_version": "9.9.9"}), \
                mock.patch.object(server, "get_cached_version_info", return_value={"latest_version": "9.9.9"}), \
                mock.patch.object(server, "get_network_interfaces", return_value=["any"]):
            status, payload = call_handler("GET", "/api/peers")

        self.assertEqual(status, 200)
        by_ip = {p["ipv4"]: p for p in payload["data"]}
        new_peer, old_peer = by_ip["10.144.144.7"], by_ip["10.144.144.8"]
        beta_peer, other_peer, local = by_ip["10.144.144.9"], by_ip["10.144.144.10"], by_ip["10.144.144.1"]
        # A peer on main reports its own check.
        self.assertEqual((new_peer["latest_version"], new_peer["update_available"]), ("3.0.2", True))
        self.assertEqual(new_peer["connection"], "direct")
        # Older peers on main and peers left on beta are offered main's release.
        self.assertEqual((old_peer["latest_version"], old_peer["update_available"], old_peer["connection"]), ("9.9.9", True, "relay"))
        self.assertEqual((beta_peer["latest_version"], beta_peer["update_available"]), ("9.9.9", True))
        # A legacy peer on another branch cannot be moved to main from here.
        self.assertFalse(other_peer["update_available"])
        # Only peers that do not report a channel run the untracked legacy updater.
        self.assertEqual((new_peer["legacy"], old_peer["legacy"], beta_peer["legacy"]), (False, True, False))
        self.assertEqual((local["is_current"], local["xraymesh_branch"], local["update_available"]), (True, "main", True))
        self.assertNotIn("channel", local)


if __name__ == "__main__":
    unittest.main()
