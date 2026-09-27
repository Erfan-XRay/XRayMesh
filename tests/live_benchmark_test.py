#!/usr/bin/env python3

import importlib.util
import time
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


IPERF_TCP_OUTPUT = """Connecting to host 10.144.144.2, port 5201
[  5] local 10.144.144.1 port 45168 connected to 10.144.144.2 port 5201
[ ID] Interval           Transfer     Bitrate         Retr  Cwnd
[  5]   0.00-1.00   sec   112 MBytes   940 Mbits/sec    3    895 KBytes
[  5]   1.00-2.00   sec   113 MBytes   948 Mbits/sec    0   1023 KBytes
- - - - - - - - - - - - - - - - - - - - - - - - -
[ ID] Interval           Transfer     Bitrate         Retr
[  5]   0.00-2.00   sec   225 MBytes   944 Mbits/sec    3             sender
[  5]   0.00-2.04   sec   224 MBytes   921 Mbits/sec                  receiver

iperf Done.
"""

IPERF_UDP_OUTPUT = """Connecting to host 10.144.144.2, port 5201
[  5] local 10.144.144.1 port 59483 connected to 10.144.144.2 port 5201
[ ID] Interval           Transfer     Bitrate         Total Datagrams
[  5]   0.00-1.00   sec  5.97 MBytes  50.1 Mbits/sec  4316
[  5]   1.00-2.00   sec  5.97 MBytes  50.1 Mbits/sec  4316
- - - - - - - - - - - - - - - - - - - - - - - - -
[ ID] Interval           Transfer     Bitrate         Jitter    Lost/Total Datagrams
[  5]   0.00-2.00   sec  11.9 MBytes  50.1 Mbits/sec  0.000 ms  0/8632 (0%)  sender
[  5]   0.00-2.04   sec  11.8 MBytes  48.6 Mbits/sec  0.018 ms  86/8632 (1%)  receiver

iperf Done.
"""

PING_OUTPUT = """PING 10.144.144.2 (10.144.144.2) 56(84) bytes of data.
64 bytes from 10.144.144.2: icmp_seq=1 ttl=64 time=21.4 ms
no answer yet for icmp_seq=2
64 bytes from 10.144.144.2: icmp_seq=3 ttl=64 time=19.8 ms
64 bytes from 10.144.144.2: icmp_seq=2 ttl=64 time=2210 ms

--- 10.144.144.2 ping statistics ---
4 packets transmitted, 3 received, 25% packet loss, time 3004ms
rtt min/avg/max/mdev = 19.8/750.4/2210/1031.9 ms
"""


def fake_stream(output, returncode=0):
    """Replay output through run_streaming_command's on_line callback."""
    def run(cmd, timeout, on_line):
        for line in output.splitlines(keepends=True):
            on_line(line)
        return returncode, output, False
    return run


class IperfParsingTests(unittest.TestCase):
    def test_interval_and_total_rows(self):
        row = server.parse_iperf_line("[  5]   1.00-2.00   sec  2.23 GBytes  19133 Mbits/sec    4   1023 KBytes")
        self.assertEqual(row["start"], 1.0)
        self.assertEqual(row["mbps"], 19133.0)
        self.assertEqual(row["bytes"], int(2.23 * 1024 ** 3))
        self.assertEqual(row["count"], 4)
        self.assertIsNone(row["role"])

        row = server.parse_iperf_line("[  5]   0.00-2.04   sec  11.8 MBytes  48.6 Mbits/sec  0.018 ms  86/8632 (1%)  receiver")
        self.assertEqual(row["role"], "receiver")
        self.assertEqual(row["jitter_ms"], 0.018)
        self.assertEqual(row["lost_packets"], 86)
        self.assertEqual(row["loss_percent"], 1.0)

        self.assertIsNone(server.parse_iperf_line("- - - - - - - - - - - - -"))
        self.assertIsNone(server.parse_iperf_line("[ ID] Interval           Transfer     Bitrate"))

    def test_tcp_benchmark_streams_intervals(self):
        events = []
        with mock.patch.object(server.shutil, "which", return_value="/usr/bin/iperf3"), \
                mock.patch.object(server, "iperf_supports_forceflush", return_value=True), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(IPERF_TCP_OUTPUT)) as run:
            ok, res, status = server.execute_iperf_benchmark(
                "10.144.144.2", "tcp", 2, on_progress=lambda event, data: events.append((event, data))
            )
        self.assertTrue(ok)
        self.assertEqual(status, 200)
        self.assertIn("--forceflush", run.call_args[0][0])
        self.assertEqual([e for e, _ in events], ["connected", "interval", "interval"])
        self.assertEqual([i["mbps"] for i in res["intervals"]], [940.0, 948.0])
        self.assertEqual(res["intervals"][0]["retransmits"], 3)
        self.assertEqual(res["summary"]["sent_mbps"], 944.0)
        self.assertEqual(res["summary"]["received_mbps"], 921.0)
        self.assertEqual(res["summary"]["retransmits"], 3)

    def test_udp_benchmark_reports_receiver_loss(self):
        with mock.patch.object(server.shutil, "which", return_value="/usr/bin/iperf3"), \
                mock.patch.object(server, "iperf_supports_forceflush", return_value=False), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(IPERF_UDP_OUTPUT)) as run:
            ok, res, _ = server.execute_iperf_benchmark("10.144.144.2", "udp", 2, "50M")
        self.assertTrue(ok)
        cmd = run.call_args[0][0]
        self.assertNotIn("--forceflush", cmd)
        self.assertEqual(cmd[-3:], ["-u", "-b", "50M"])
        self.assertEqual(res["summary"]["mbps"], 48.6)
        self.assertEqual(res["summary"]["lost_packets"], 86)
        self.assertEqual(res["summary"]["jitter_ms"], 0.018)
        self.assertNotIn("retransmits", res["intervals"][0])

    def test_iperf_error_is_reported(self):
        output = "iperf3: error - unable to connect to server: Connection refused\n"
        with mock.patch.object(server.shutil, "which", return_value="/usr/bin/iperf3"), \
                mock.patch.object(server, "iperf_supports_forceflush", return_value=True), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(output, 1)):
            ok, res, status = server.execute_iperf_benchmark("10.144.144.2")
        self.assertFalse(ok)
        self.assertEqual(status, 500)
        self.assertEqual(res, "unable to connect to server: Connection refused")

    def test_unsafe_bandwidth_falls_back_to_default(self):
        with mock.patch.object(server.shutil, "which", return_value="/usr/bin/iperf3"), \
                mock.patch.object(server, "iperf_supports_forceflush", return_value=True), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(IPERF_UDP_OUTPUT)) as run:
            server.execute_iperf_benchmark("10.144.144.2", "udp", 2, "--logfile=/etc/passwd")
        self.assertEqual(run.call_args[0][0][-1], "50M")


class PingStreamingTests(unittest.TestCase):
    def test_replies_stream_and_late_reply_wins(self):
        events = []
        with mock.patch.object(server, "ping_is_iputils", return_value=True), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(PING_OUTPUT)) as run:
            ok, res, _ = server.execute_ping_benchmark(
                "10.144.144.2", 4, on_progress=lambda event, data: events.append(data)
            )
        self.assertTrue(ok)
        self.assertIn("-O", run.call_args[0][0])
        self.assertEqual([(e["seq"], e["status"]) for e in events], [(1, "ok"), (2, "timeout"), (3, "ok"), (2, "ok")])
        self.assertEqual(
            [(r["seq"], r["status"]) for r in res["replies"]],
            [(1, "ok"), (2, "ok"), (3, "ok"), (4, "timeout")],
        )
        self.assertEqual(res["packet_loss_percent"], 25.0)
        self.assertEqual(res["avg_ms"], 750.4)

    def test_busybox_sequence_starts_at_zero(self):
        output = (
            "PING 10.144.144.2 (10.144.144.2): 56 data bytes\n"
            "64 bytes from 10.144.144.2: seq=0 ttl=64 time=1.2 ms\n"
            "64 bytes from 10.144.144.2: seq=1 ttl=64 time=1.4 ms\n"
        )
        with mock.patch.object(server, "ping_is_iputils", return_value=False), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(output)) as run:
            ok, res, _ = server.execute_ping_benchmark("10.144.144.2", 2)
        self.assertTrue(ok)
        self.assertNotIn("-O", run.call_args[0][0])
        self.assertEqual([r["seq"] for r in res["replies"]], [0, 1])


class LiveTestTests(unittest.TestCase):
    def setUp(self):
        server.LIVE_TESTS.clear()
        server.PEER_VERSION_CACHE.clear()

    def wait_for(self, job):
        deadline = time.time() + 5
        while time.time() < deadline:
            snapshot = server.live_test_snapshot(job["id"])
            if snapshot["status"] != "running":
                return snapshot
            time.sleep(0.02)
        self.fail("live test did not finish")

    def test_local_live_test_collects_samples(self):
        with mock.patch.object(server, "ping_is_iputils", return_value=True), \
                mock.patch.object(server, "run_streaming_command", side_effect=fake_stream(PING_OUTPUT)):
            params, err = server.parse_ping_request({"target": "10.144.144.2", "count": 4})
            job, err, status = server.start_live_test("ping", params, "10.144.144.1")
            snapshot = self.wait_for(job)
        self.assertEqual(status, 200)
        self.assertEqual(snapshot["status"], "done")
        self.assertEqual(len(snapshot["samples"]), 4)
        self.assertEqual(snapshot["result"]["packets_received"], 3)

    def test_request_validation(self):
        self.assertEqual(server.parse_ping_request({"target": "nope"}), (None, "Invalid target IP"))
        self.assertEqual(
            server.parse_iperf_request({"target": "10.1.1.1", "source": "10.1.1.1"}),
            (None, "Source and target cannot be the same node"),
        )
        params, _ = server.parse_iperf_request({"target": "10.1.1.1", "duration": 99, "protocol": "sctp", "bandwidth": "1G;"})
        self.assertEqual((params["duration"], params["protocol"], params["bandwidth"]), (30, "tcp", "50M"))

    def test_running_limit(self):
        for _ in range(server.LIVE_TEST_MAX_RUNNING):
            self.assertIsNotNone(server.create_live_test("ping", {}))
        self.assertIsNone(server.create_live_test("ping", {}))

    def test_remote_live_test_mirrors_peer_job(self):
        calls = []
        snapshots = [
            {"status": "running", "phase": "running", "samples": [{"interval": 0, "mbps": 900.0}]},
            {"status": "done", "phase": "done", "samples": [{"interval": 0, "mbps": 900.0}, {"interval": 1, "mbps": 910.0}],
             "result": {"summary": {"sent_mbps": 905.0}, "intervals": []}},
        ]

        def cluster_request(ip, port, endpoint, secret, payload, timeout=6, strict_port=False):
            calls.append((endpoint, payload))
            if endpoint == "/api/cluster/iperf/start":
                return True, {"ok": True, "job_id": "remote1"}, 200
            return True, {"ok": True, "job": snapshots.pop(0)}, 200

        params, _ = server.parse_iperf_request({"target": "10.144.144.3", "source": "10.144.144.2", "duration": 2})
        with mock.patch.object(server, "cluster_request", side_effect=cluster_request), \
                mock.patch.object(server, "LIVE_POLL_INTERVAL_SEC", 0.01):
            job, _, _ = server.start_live_test("iperf", params, "10.144.144.1", "secret")
            snapshot = self.wait_for(job)
        self.assertEqual(snapshot["status"], "done")
        self.assertEqual(len(snapshot["samples"]), 2)
        self.assertEqual(snapshot["result"]["source"], "10.144.144.2")
        self.assertEqual(snapshot["result"]["target"], "10.144.144.3")
        self.assertNotIn("source", calls[0][1])
        self.assertEqual(calls[1], ("/api/cluster/live/status", {"job_id": "remote1"}))

    def test_remote_live_test_falls_back_for_older_peers(self):
        def cluster_request(ip, port, endpoint, secret, payload, timeout=6, strict_port=False):
            return False, "Unauthorized", 401

        def send_cluster_http(ip, port, endpoint, secret, payload, timeout=6, strict_port=False):
            self.assertEqual(endpoint, "/api/cluster/ping/run")
            return True, {"ok": True, "data": {"avg_ms": 12.5, "replies": []}}

        params, _ = server.parse_ping_request({"target": "10.144.144.3", "source": "10.144.144.2"})
        with mock.patch.object(server, "cluster_request", side_effect=cluster_request), \
                mock.patch.object(server, "send_cluster_http", side_effect=send_cluster_http):
            job, _, _ = server.start_live_test("ping", params, "10.144.144.1", "secret")
            snapshot = self.wait_for(job)
        self.assertEqual(snapshot["status"], "done")
        self.assertEqual(snapshot["result"]["avg_ms"], 12.5)
        self.assertEqual(snapshot["result"]["source"], "10.144.144.2")


if __name__ == "__main__":
    unittest.main()
