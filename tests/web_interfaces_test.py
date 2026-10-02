#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return self.payload


class WebInterfaceDiscoveryTests(unittest.TestCase):
    def setUp(self):
        server.PEER_VERSION_CACHE.clear()

    def test_normalize_interfaces_is_validated_and_deduplicated(self):
        interfaces = server.normalize_network_interfaces([" eth0 ", "any", "eth0", 7, ""])
        self.assertEqual(interfaces, ["any", "eth0"])

    def test_peer_probe_caches_interfaces_and_responsive_port(self):
        payload = {
            "ok": True,
            "version": "2.2.3",
            "interfaces": ["any", "ens3"],
        }
        with mock.patch.object(server, "is_ssl_enabled", return_value=False), mock.patch.object(
            server.urllib.request,
            "urlopen",
            return_value=FakeResponse(payload),
        ) as urlopen:
            version = server.get_peer_version("10.144.144.2", port=19090, timeout=0.01)

        self.assertEqual(version, "2.2.3")
        self.assertIn(":19090/api/cluster/info", urlopen.call_args.args[0].full_url)
        self.assertEqual(
            server.PEER_VERSION_CACHE["10.144.144.2"],
            {
                "version": "2.2.3",
                "port": 19090,
                "interfaces": ["any", "ens3"],
                "timestamp": mock.ANY,
            },
        )

    def test_peer_probe_keeps_the_reported_public_ip(self):
        payload = {"ok": True, "version": "3.2.0", "interfaces": ["any", "ens3"], "public_ip": "203.0.113.7"}
        with mock.patch.object(server, "is_ssl_enabled", return_value=False), mock.patch.object(
            server.urllib.request, "urlopen", return_value=FakeResponse(payload)
        ):
            server.get_peer_version("10.144.144.2", port=19090, timeout=0.01)
        self.assertEqual(server.PEER_VERSION_CACHE["10.144.144.2"]["public_ip"], "203.0.113.7")

        # A later probe without the field (or with a private address) must not erase or replace it.
        server.PEER_VERSION_CACHE["10.144.144.2"]["timestamp"] = 1
        for answer in ({"ok": True, "version": "3.2.0"}, {"ok": True, "version": "3.2.0", "public_ip": "10.0.0.5"}):
            with mock.patch.object(server, "is_ssl_enabled", return_value=False), mock.patch.object(
                server.urllib.request, "urlopen", return_value=FakeResponse(answer)
            ):
                server.get_peer_version("10.144.144.2", port=19090, timeout=0.01)
            server.PEER_VERSION_CACHE["10.144.144.2"]["timestamp"] = 1
            self.assertEqual(server.PEER_VERSION_CACHE["10.144.144.2"]["public_ip"], "203.0.113.7")

    def test_peek_public_ip_never_waits_for_the_lookup(self):
        server._public_ip_cache.update({"ip": "198.51.100.4", "time": 0.0})
        server._public_ip_last_try = 0.0
        started = server.threading.Event()
        release = server.threading.Event()

        def slow_lookup():
            started.set()
            release.wait(5)
            return "198.51.100.4"

        with mock.patch.object(server, "get_server_public_ip", side_effect=slow_lookup):
            self.assertEqual(server.peek_server_public_ip(), "198.51.100.4")
            self.assertTrue(started.wait(2))
            # Within the throttle window another call neither starts a second lookup nor blocks.
            self.assertEqual(server.peek_server_public_ip(), "198.51.100.4")
            release.set()

    def test_public_peer_fallback_uses_cached_custom_port(self):
        server.PEER_VERSION_CACHE["10.144.144.2"] = {
            "version": "2.2.3",
            "port": 19090,
            "interfaces": [],
            "timestamp": 1,
        }
        payload = {
            "ok": True,
            "version": "2.2.3",
            "interfaces": ["any", "eth1"],
        }
        with mock.patch.object(server, "is_ssl_enabled", return_value=False), mock.patch.object(
            server.urllib.request,
            "urlopen",
            return_value=FakeResponse(payload),
        ) as urlopen:
            peer_info, port, error = server.fetch_peer_cluster_info("10.144.144.2", timeout=0.01)

        self.assertEqual(error, "")
        self.assertEqual(port, 19090)
        self.assertEqual(peer_info["interfaces"], ["any", "eth1"])
        self.assertIn(":19090/api/cluster/info", urlopen.call_args.args[0].full_url)

    def test_remote_lookup_uses_cached_interfaces_when_hmac_fails(self):
        server.PEER_VERSION_CACHE["10.144.144.2"] = {
            "version": "2.2.3",
            "port": 19090,
            "interfaces": ["any", "eth0"],
            "timestamp": 1,
        }
        with mock.patch.object(server, "send_cluster_http", return_value=(False, "Cluster authentication failed")), mock.patch.object(
            server,
            "fetch_peer_cluster_info",
            return_value=({}, None, "Connection refused"),
        ):
            interfaces, warning = server.get_remote_network_interfaces("10.144.144.2", "secret")

        self.assertEqual(interfaces, ["any", "eth0"])
        self.assertIn("cached", warning.lower())

    def test_fresh_cached_interfaces_skip_network_requests(self):
        server.PEER_VERSION_CACHE["10.144.144.2"] = {
            "version": "2.2.4",
            "port": 19090,
            "interfaces": ["any", "eth0"],
            "timestamp": server.time.time(),
        }
        with mock.patch.object(server, "send_cluster_http", side_effect=AssertionError("signed request should be skipped")) as signed, mock.patch.object(
            server,
            "fetch_peer_cluster_info",
            side_effect=AssertionError("peer probe should be skipped"),
        ):
            interfaces, warning = server.get_remote_network_interfaces("10.144.144.2", "secret")

        self.assertEqual(interfaces, ["any", "eth0"])
        signed.assert_not_called()
        self.assertIn("cached", warning.lower())

    def test_remote_lookup_falls_back_to_public_peer_metadata(self):
        peer_info = {
            "ok": True,
            "version": "2.2.3",
            "interfaces": ["any", "enp1s0"],
        }
        with mock.patch.object(server, "send_cluster_http", return_value=(False, "Forbidden")), mock.patch.object(
            server,
            "fetch_peer_cluster_info",
            return_value=(peer_info, 19090, ""),
        ):
            interfaces, warning = server.get_remote_network_interfaces("10.144.144.2", "wrong-secret")

        self.assertEqual(interfaces, ["any", "enp1s0"])
        self.assertIn("public cluster metadata", warning.lower())
        self.assertEqual(server.PEER_VERSION_CACHE["10.144.144.2"]["port"], 19090)

    def test_signed_fallback_targets_discovered_port_only(self):
        peer_info = {
            "ok": True,
            "version": "2.2.4",
        }
        with mock.patch.object(server, "send_cluster_http", return_value=(False, "Forbidden")) as signed, mock.patch.object(
            server,
            "fetch_peer_cluster_info",
            return_value=(peer_info, 19090, ""),
        ):
            interfaces, error = server.get_remote_network_interfaces("10.144.144.2", "secret")

        signed.assert_called_once_with(
            "10.144.144.2",
            19090,
            "/api/cluster/interfaces",
            "secret",
            {},
            timeout=2.0,
            strict_port=True,
        )
        self.assertEqual(interfaces, [])
        self.assertIn("Forbidden", error)

    def test_unreachable_peer_shares_one_time_budget(self):
        # The probe burns most of the budget, so the signed fallback must not get its full timeout again.
        clock = iter([100.0, 104.0, 104.0])
        with mock.patch.object(server.time, "time", side_effect=lambda: next(clock, 104.0)), mock.patch.object(
            server, "send_cluster_http", return_value=(False, "timed out")
        ) as signed, mock.patch.object(server, "fetch_peer_cluster_info", return_value=({}, None, "timed out")):
            interfaces, error = server.get_remote_network_interfaces("10.144.144.2", "secret")

        self.assertEqual(interfaces, [])
        self.assertAlmostEqual(signed.call_args.kwargs["timeout"], 0.5)
        self.assertIn("timed out", error)

    def test_remote_lookup_reports_failure_instead_of_faking_any(self):
        with mock.patch.object(server, "send_cluster_http", return_value=(False, "Forbidden")), mock.patch.object(
            server,
            "fetch_peer_cluster_info",
            return_value=({}, None, "Connection refused"),
        ):
            interfaces, error = server.get_remote_network_interfaces("10.144.144.2", "wrong-secret")

        self.assertEqual(interfaces, [])
        self.assertIn("Forbidden", error)
        self.assertIn("Connection refused", error)

    def test_is_local_origin_accepts_local_values_and_rejects_remote(self):
        with mock.patch.object(server, "load_env_file", return_value={"IPV4": "10.144.144.1"}):
            self.assertTrue(server.is_local_origin(""))
            self.assertTrue(server.is_local_origin(None))
            self.assertTrue(server.is_local_origin("local"))
            self.assertTrue(server.is_local_origin("127.0.0.1"))
            self.assertTrue(server.is_local_origin("10.144.144.1"))
            self.assertFalse(server.is_local_origin("10.144.144.2"))

    def test_peer_version_preserves_valid_version_on_probe_failure(self):
        server.PEER_VERSION_CACHE["10.144.144.2"] = {
            "version": "2.2.4",
            "port": 11080,
            "interfaces": ["any", "eth0"],
            "timestamp": 1,
        }
        with mock.patch.object(server, "fetch_peer_cluster_info", return_value=({}, None, "Connection timed out")):
            version = server.get_peer_version("10.144.144.2")

        self.assertEqual(version, "2.2.4")
        self.assertEqual(server.PEER_VERSION_CACHE["10.144.144.2"]["interfaces"], ["any", "eth0"])
        self.assertNotEqual(version, "legacy (< 2.0.0)")

    def test_peer_port_candidates_avoids_blind_port_scanning(self):
        candidates = server.get_peer_port_candidates("10.144.144.2")
        self.assertEqual(candidates, [server.PORT])
        self.assertNotIn(8080, candidates)
        self.assertNotIn(8443, candidates)


if __name__ == "__main__":
    unittest.main()
