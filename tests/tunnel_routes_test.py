#!/usr/bin/env python3

import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server_tunnels", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)

LOCAL_IP = "10.144.144.1"
PEER_IP = "10.144.144.2"


def call_handler(method, path, body=None, headers=None):
    raw = json.dumps(body or {}).encode("utf-8")
    handler = server.XRayMeshHandler.__new__(server.XRayMeshHandler)
    handler.rfile = io.BytesIO(raw)
    handler.wfile = io.BytesIO()
    handler.headers = {"Content-Length": str(len(raw)), "Content-Type": "application/json", **(headers or {})}
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


class TunnelTestCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.config = Path(tmp.name) / "config.env"
        for name, value in {
            "CONFIG_FILE": str(self.config),
            "CONFIG_BACKUP_FILE": str(Path(tmp.name) / "config.env.bak"),
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
            "IPV4": LOCAL_IP, "PROTOCOL": "dual", "PORT": "11010", "PEERS": "",
            "ENCRYPTION": "yes", "IPV6": "no", "MTU": "1380", "ENABLE_KCP": "no",
        })

    def mock_cli(self, ok=True, msg="done"):
        patcher = mock.patch.object(server, "run_xraymesh_cmd", return_value=(ok, msg))
        cli = patcher.start()
        self.addCleanup(patcher.stop)
        return cli


class LocalTunnelTests(TunnelTestCase):
    def test_local_create_runs_the_cli(self):
        cli = self.mock_cli(msg="Realm tunnel 'web' forwards BOTH ports 443 to 10.144.144.3.")
        status, payload = call_handler("POST", "/api/tunnels/realm/create", {
            "name": "web", "target": "10.144.144.3", "ports": "443", "protocol": "tcp,udp", "origin_node": LOCAL_IP,
        })
        self.assertEqual((status, payload["ok"]), (200, True))
        self.assertEqual(cli.call_args.args[0], ["realm-create", "web", "10.144.144.3", "443", "both"])
        self.assertEqual(cli.call_args.kwargs["timeout"], server.TUNNEL_CMD_TIMEOUT)

    def test_bad_input_is_rejected_before_the_cli(self):
        cli = self.mock_cli()
        for body, error in (
            ({"name": "bad name", "target": "10.144.144.3", "ports": "443"}, "Tunnel name"),
            ({"name": "web", "target": "", "ports": "443"}, "Missing required fields"),
            ({"name": "web", "target": "10.144.144.3", "ports": "443", "protocol": "sctp"}, "Protocol"),
            ({"name": "web", "target": 7, "ports": 443}, "valid IPv4"),
        ):
            with self.subTest(body=body):
                status, payload = call_handler("POST", "/api/tunnels/gost/create", body)
                self.assertEqual((status, payload["ok"]), (400, False))
                self.assertIn(error, payload["error"])
        cli.assert_not_called()

    def test_cli_failure_is_returned_as_json(self):
        self.mock_cli(ok=False, msg="Port 443 is already used by HAProxy tunnel 'x'.")
        status, payload = call_handler("POST", "/api/tunnels/gost/edit", {
            "name": "web", "target": "10.144.144.3", "ports": "443",
        })
        self.assertEqual(status, 400)
        self.assertIn("already used", payload["error"])

    def test_remote_iptables_create_stays_blocked(self):
        cli = self.mock_cli()
        status, payload = call_handler("POST", "/api/tunnels/iptables/create", {
            "name": "web", "target": "10.144.144.3", "ports": "443", "origin_node": PEER_IP,
        })
        self.assertEqual(status, 400)
        self.assertIn("only be configured locally", payload["error"])
        cli.assert_not_called()


class RemoteTunnelTests(TunnelTestCase):
    def setUp(self):
        super().setUp()
        probe = mock.patch.object(server, "fetch_peer_cluster_info", return_value=({"ok": True, "version": "2.0.0"}, 19090, ""))
        self.probe = probe.start()
        self.addCleanup(probe.stop)

    def remote_create(self, **extra):
        return call_handler("POST", "/api/tunnels/gost/create", {
            "name": "web", "target": LOCAL_IP, "ports": "443", "protocol": "both", "origin_node": PEER_IP, **extra,
        })

    def test_remote_create_is_forwarded_to_the_origin_node(self):
        # Regression: this path used an undefined name, crashed the handler and the browser saw a NetworkError.
        reply = {"ok": True, "message": "GOST tunnel 'web' forwards BOTH ports 443 to 10.144.144.1."}
        with mock.patch.object(server, "cluster_request", return_value=(True, reply, 200)) as request:
            status, payload = self.remote_create()
        self.assertEqual((status, payload), (200, {"ok": True, "message": reply["message"]}))
        args, kwargs = request.call_args
        self.assertEqual((args[0], args[1], args[2]), (PEER_IP, 19090, "/api/cluster/tunnel/create"))
        self.assertEqual(args[4]["tunnel_type"], "gost")
        self.assertNotIn("origin_node", args[4])
        self.assertTrue(kwargs["strict_port"] and kwargs["stop_on_timeout"])

    def test_unreachable_node_fails_fast_with_a_clear_error(self):
        self.probe.return_value = ({}, None, "timed out")
        with mock.patch.object(server, "cluster_request") as request:
            status, payload = self.remote_create()
        self.assertEqual(status, 502)
        self.assertIn("not reachable", payload["error"])
        request.assert_not_called()

    def test_remote_failures_are_explained(self):
        for result, code, text in (
            ((False, "Port 443 is already in use.", 400), 400, "already in use"),
            ((False, "Invalid HMAC signature", 403), 502, "same network secret"),
            ((False, "Not Found", 404), 502, "Update it first"),
            ((False, "Request timed out", None), 504, "may still finish"),
        ):
            with self.subTest(code=code), mock.patch.object(server, "cluster_request", return_value=result):
                status, payload = self.remote_create()
                self.assertEqual((status, payload["ok"]), (code, False))
                self.assertIn(text, payload["error"])

    def test_invalid_input_never_reaches_the_peer(self):
        with mock.patch.object(server, "cluster_request") as request:
            status, _ = self.remote_create(name="../../etc")
        self.assertEqual(status, 400)
        request.assert_not_called()


class ClusterTunnelEndpointTests(TunnelTestCase):
    def signed(self, body):
        _, headers = server.sign_cluster_request("4f1c9e02b7d35a68", body)
        return headers

    def test_peer_request_runs_the_cli(self):
        cli = self.mock_cli(msg="HAProxy tunnel 'web' updated.")
        body = {"tunnel_type": "haproxy", "name": "web", "target": "10.144.144.3", "ports": "80,443"}
        status, payload = call_handler("POST", "/api/cluster/tunnel/edit", body, self.signed(body))
        self.assertEqual((status, payload["ok"]), (200, True))
        self.assertEqual(cli.call_args.args[0], ["haproxy-edit", "web", "10.144.144.3", "80,443"])

    def test_peer_request_is_validated(self):
        cli = self.mock_cli()
        body = {"tunnel_type": "realm", "name": "-x", "target": "10.144.144.3", "ports": "443"}
        status, payload = call_handler("POST", "/api/cluster/tunnel/delete", body, self.signed(body))
        self.assertEqual(status, 400)
        self.assertIn("Tunnel name", payload["error"])
        cli.assert_not_called()


class CrashSafetyTests(TunnelTestCase):
    def test_handler_crash_returns_json_instead_of_dropping_the_connection(self):
        with mock.patch.object(server, "run_tunnel_command", side_effect=RuntimeError("boom")), \
                mock.patch("traceback.print_exc"), mock.patch("builtins.print"):
            status, payload = call_handler("POST", "/api/tunnels/haproxy/delete", {"name": "web"})
        self.assertEqual(status, 500)
        self.assertIn("boom", payload["error"])


if __name__ == "__main__":
    unittest.main()
