#!/usr/bin/env python3

import base64
import importlib.util
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server_join", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


def make_invite(**overrides):
    payload = {
        "v": 1,
        "net": "alpha-mesh",
        "secret": "4f1c9e02b7d35a68",
        "endpoint": "185.100.200.30:11010",
        "proto": "udp",
    }
    payload.update(overrides)
    return "xrmesh://" + base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def call_handler(method, path, body=None):
    """Run one request through XRayMeshHandler and return the raw bytes written to the socket."""
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
    return handler.wfile.getvalue()


def parse_single_response(testcase, raw):
    """Fail unless exactly one HTTP response with a JSON body was written."""
    testcase.assertEqual(raw.count(b"HTTP/1.0 "), 1, f"expected one HTTP response, got: {raw!r}")
    head, body = raw.split(b"\r\n\r\n", 1)
    status = int(head.split(b" ", 2)[1])
    return status, json.loads(body.decode("utf-8"))


class InviteDecodingTests(unittest.TestCase):
    def test_decodes_codes_mangled_by_copy_paste(self):
        token = make_invite()[len("xrmesh://"):]
        variants = {
            "plain": f"xrmesh://{token}",
            "uppercase prefix and whitespace": f"  XRMESH://{token}  \n",
            "wrapped lines": "xrmesh://" + "\n".join(token[i:i + 40] for i in range(0, len(token), 40)),
            "bidi marks": f"\u200fxrmesh://{token}\u200e",
            "cli box output": f"  │  xrmesh://{token}\n  ├── Mesh Parameters ──",
            "missing padding": f"xrmesh://{token.rstrip('=')}",
            "url-safe alphabet": f"xrmesh://{token.replace('+', '-').replace('/', '_')}",
            "quoted": f'"xrmesh://{token}"',
            "trailing words": f"xrmesh://{token} Network Name : alpha-mesh",
        }
        for name, raw in variants.items():
            with self.subTest(name):
                invite = server.decode_invite_token(raw)
                self.assertEqual(invite["net"], "alpha-mesh")
                self.assertEqual(invite["secret"], "4f1c9e02b7d35a68")
                self.assertEqual(invite["proto"], "udp")

    def test_rejects_unusable_codes(self):
        incomplete = "xrmesh://" + base64.b64encode(b'{"net": "alpha-mesh"}').decode("ascii")
        cases = {
            "": "invalid_invite",
            "hello there": "invalid_invite",
            "xrmesh://": "invalid_invite",
            "xrmesh://" + base64.b64encode(b"[1, 2]").decode("ascii"): "invalid_invite",
            incomplete: "invite_incomplete",
        }
        for raw, code in cases.items():
            with self.subTest(raw=raw):
                with self.assertRaises(server.InviteTokenError) as ctx:
                    server.decode_invite_token(raw)
                self.assertEqual(ctx.exception.code, code)

    def test_unknown_protocol_falls_back_to_dual_and_keeps_transport_settings(self):
        invite = server.decode_invite_token(make_invite(proto="carrier-pigeon", enc=False, kcp=True, mtu=1300, ipv6=True))
        self.assertEqual(invite["proto"], "dual")
        self.assertEqual((invite["enc"], invite["kcp"], invite["mtu"], invite["ipv6"]), (False, True, 1300, True))


class NodeJoinEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        config_file = os.path.join(self.tmp.name, "config.env")
        for name, value in {
            "CONFIG_FILE": config_file,
            "CONFIG_BACKUP_FILE": config_file + ".bak",
            "CONFIG_STAGED_FILE": config_file + ".staged",
        }.items():
            patcher = mock.patch.object(server, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        auth = mock.patch.object(server, "is_authenticated", return_value=(True, "session"))
        auth.start()
        self.addCleanup(auth.stop)
        server.LAST_ROLLBACK["occurred"] = False

    def write_existing_config(self):
        server.save_node_config_env({
            "NETWORK_NAME": "old-mesh",
            "NETWORK_SECRET": "old-secret",
            "HOSTNAME": "tehran-edge",
            "IPV4": "10.144.144.1",
            "PROTOCOL": "tcp",
            "PORT": "12000",
            "PEERS": "91.107.130.4:12000,ws://relay.example.net:12000/",
            "ENCRYPTION": "yes",
            "IPV6": "no",
            "MTU": "1380",
            "ENABLE_KCP": "yes",
        })
        with open(server.CONFIG_FILE, "rb") as f:
            return f.read()

    def test_join_sends_one_response_and_replaces_config(self):
        self.write_existing_config()
        for stale in (server.CONFIG_BACKUP_FILE, server.CONFIG_STAGED_FILE):
            Path(stale).write_text("NETWORK_SECRET='old-secret'\n", encoding="utf-8")
        server.LAST_ROLLBACK["occurred"] = True

        with mock.patch.object(server, "run_xraymesh_cmd", return_value=(True, "online")) as run_cmd:
            raw = call_handler("POST", "/api/node/join", {
                "invite": make_invite(),
                "hostname": "tehran-edge",
                "ipv4": "10.144.144.23",
            })

        status, payload = parse_single_response(self, raw)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["network_name"], "alpha-mesh")
        run_cmd.assert_called_once_with(["node-restart"])

        cfg = server.load_env_file(server.CONFIG_FILE)
        self.assertEqual(cfg["NETWORK_NAME"], "alpha-mesh")
        self.assertEqual(cfg["NETWORK_SECRET"], "4f1c9e02b7d35a68")
        self.assertEqual(cfg["PROTOCOL"], "udp")
        self.assertEqual(cfg["IPV4"], "10.144.144.23")
        # Old-mesh peers are gone; name and listen port carry over.
        self.assertEqual(cfg["PEERS"], "185.100.200.30:11010")
        self.assertEqual(cfg["HOSTNAME"], "tehran-edge")
        self.assertEqual(cfg["PORT"], "12000")
        self.assertEqual(cfg["ENABLE_KCP"], "no")
        self.assertEqual(cfg["ENCRYPTION"], "yes")
        self.assertFalse(os.path.exists(server.CONFIG_BACKUP_FILE))
        self.assertFalse(os.path.exists(server.CONFIG_STAGED_FILE))
        self.assertFalse(server.LAST_ROLLBACK["occurred"])

    def test_join_applies_transport_settings_from_invite(self):
        with mock.patch.object(server, "run_xraymesh_cmd", return_value=(True, "")):
            raw = call_handler("POST", "/api/node/join", {
                "invite": make_invite(enc=False, kcp=True, mtu=1300, ipv6=True),
                "hostname": "frankfurt-2",
                "ipv4": "10.144.144.40",
                "port": 11010,
            })

        status, payload = parse_single_response(self, raw)
        self.assertEqual((status, payload["ok"]), (200, True))
        cfg = server.load_env_file(server.CONFIG_FILE)
        self.assertEqual((cfg["ENCRYPTION"], cfg["ENABLE_KCP"], cfg["MTU"], cfg["IPV6"]), ("no", "yes", "1300", "yes"))

    def test_failed_start_restores_previous_config(self):
        original = self.write_existing_config()
        with mock.patch.object(server, "run_xraymesh_cmd", side_effect=[(False, "easytier exited"), (True, "")]) as run_cmd:
            raw = call_handler("POST", "/api/node/join", {"invite": make_invite(), "hostname": "tehran-edge"})

        status, payload = parse_single_response(self, raw)
        self.assertEqual(status, 500)
        self.assertEqual((payload["ok"], payload["code"], payload["restored"]), (False, "start_failed", True))
        self.assertIn("easytier exited", payload["error"])
        with open(server.CONFIG_FILE, "rb") as f:
            self.assertEqual(f.read(), original)
        self.assertEqual(run_cmd.call_args_list[-1], mock.call(["node-restart"]))

    def test_failed_start_without_previous_config_cleans_up(self):
        with mock.patch.object(server, "run_xraymesh_cmd", side_effect=[(False, "easytier exited"), (True, "")]) as run_cmd:
            raw = call_handler("POST", "/api/node/join", {"invite": make_invite(), "hostname": "frankfurt-2"})

        status, payload = parse_single_response(self, raw)
        self.assertEqual((status, payload["code"]), (500, "start_failed"))
        self.assertEqual(run_cmd.call_args_list[-1], mock.call(["delete-node"]))

    def test_rejects_bad_input_without_touching_config(self):
        original = self.write_existing_config()
        cases = [
            ({"invite": "not an invite"}, "invalid_invite"),
            ({"invite": make_invite(), "hostname": "-bad name"}, "invalid_hostname"),
            ({"invite": make_invite(), "ipv4": "10.144.144.300"}, "invalid_ipv4"),
            ({"invite": make_invite(), "port": 70000}, "invalid_port"),
        ]
        for body, code in cases:
            with self.subTest(code=code):
                with mock.patch.object(server, "run_xraymesh_cmd") as run_cmd:
                    raw = call_handler("POST", "/api/node/join", body)
                status, payload = parse_single_response(self, raw)
                self.assertEqual((status, payload["code"]), (400, code))
                run_cmd.assert_not_called()
                with open(server.CONFIG_FILE, "rb") as f:
                    self.assertEqual(f.read(), original)

    def test_invite_round_trips_transport_settings(self):
        self.write_existing_config()
        with mock.patch.object(server, "get_server_public_ip", return_value="185.100.200.30"):
            raw = call_handler("GET", "/api/node/invite")

        status, payload = parse_single_response(self, raw)
        self.assertEqual(status, 200)
        invite = server.decode_invite_token(payload["data"]["invite"])
        self.assertEqual(invite["endpoint"], "185.100.200.30:12000")
        self.assertEqual((invite["proto"], invite["enc"], invite["kcp"], invite["mtu"]), ("tcp", True, True, 1380))


if __name__ == "__main__":
    unittest.main()
