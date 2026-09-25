import unittest
import importlib.util
from pathlib import Path
from unittest import mock
import json

ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT_DIR / "web" / "server.py"
SPEC = importlib.util.spec_from_file_location("xraymesh_web_server", SERVER_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class VersionAndBranchTests(unittest.TestCase):
    def setUp(self):
        server.VERSION_CACHE.clear()
        server.PEER_VERSION_CACHE.clear()

    def test_parse_semver(self):
        self.assertEqual(server.parse_semver("2.2.5"), (2, 2, 5, 1, "", 0))
        self.assertEqual(server.parse_semver("v2.2.6-beta.1"), (2, 2, 6, 0, "beta", 1))
        self.assertEqual(server.parse_semver("2.2.6-beta.2"), (2, 2, 6, 0, "beta", 2))
        self.assertEqual(server.parse_semver("2.2.6"), (2, 2, 6, 1, "", 0))

    def test_is_newer_version(self):
        # Beta release of next minor vs older stable
        self.assertTrue(server.is_newer_version("2.2.6-beta.1", "2.2.5"))
        self.assertFalse(server.is_newer_version("2.2.5", "2.2.6-beta.1"))

        # Sequential beta versions
        self.assertTrue(server.is_newer_version("2.2.6-beta.5", "2.2.6-beta.4"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.6", "2.2.6-beta.5"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.7", "2.2.6-beta.6"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.8", "2.2.6-beta.7"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.10", "2.2.6-beta.9"))
        self.assertTrue(server.is_newer_version("3.0.0-beta.1", "2.2.6-beta.9"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.4", "2.2.6-beta.3"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.3", "2.2.6-beta.2"))
        self.assertTrue(server.is_newer_version("2.2.6-beta.2", "2.2.6-beta.1"))
        self.assertFalse(server.is_newer_version("2.2.6-beta.1", "2.2.6-beta.2"))

        # Official release is newer than its beta
        self.assertTrue(server.is_newer_version("2.2.6", "2.2.6-beta.1"))
        self.assertTrue(server.is_newer_version("2.2.6", "2.2.6-beta.2"))
        self.assertFalse(server.is_newer_version("2.2.6-beta.2", "2.2.6"))

        # Same version
        self.assertFalse(server.is_newer_version("2.2.6-beta.1", "2.2.6-beta.1"))

    def test_get_active_branch_defaults_and_overrides(self):
        with mock.patch.dict(server.os.environ, {}, clear=True):
            self.assertEqual(server.get_active_branch(), "beta")

        with mock.patch.dict(server.os.environ, {"XRAYMESH_BRANCH": "custom-branch"}):
            self.assertEqual(server.get_active_branch(), "custom-branch")

    def test_get_version_info_fetches_from_beta_branch(self):
        fake_remote_payload = {
            "version": "3.0.0-beta.4",
            "release_name": "XRayMesh v3.0.0-beta.4",
            "release_date": "2026-09-25",
            "changelog": "Beta 2 changes",
            "update_command": "bash <(curl -fsSL https://raw.githubusercontent.com/Erfan-XRay/XRayMesh/beta/xraymesh.sh) update"
        }

        class FakeResp:
            def __init__(self, data):
                self.status = 200
                self._data = json.dumps(data).encode("utf-8")
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return self._data

        with mock.patch.object(server.urllib.request, "urlopen", return_value=FakeResp(fake_remote_payload)) as mock_open:
            v_info = server.get_version_info()

        # Verify URL targeted the beta branch
        call_url = mock_open.call_args[0][0].full_url
        self.assertIn("/beta/version.json", call_url)
        self.assertEqual(v_info["current_version"], "3.0.0-beta.3")
        self.assertEqual(v_info["latest_version"], "3.0.0-beta.4")
        self.assertEqual(v_info["branch"], "beta")
        self.assertTrue(v_info["update_available"])
        self.assertIn("beta/xraymesh.sh", v_info["update_command"])


if __name__ == "__main__":
    unittest.main()
