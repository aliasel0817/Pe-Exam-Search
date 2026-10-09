"""Offline, no-cost checks of the exact 7x984 preflight."""
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import quality_aoede_7x984_preflight as p


class QualityAoede984PreflightTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.source = root / "sample.json"
        self.out = root / "audio"
        self.zip = root / "audio.zip"

    def test_scope_is_exact(self):
        self.assertEqual(sum(x[2] for x in p.TARGETS), 7)
        self.assertEqual(sum(x[3] for x in p.TARGETS), 984)
        self.assertEqual(sum(x[4] for x in p.TARGETS), 1612)
        self.assertEqual([(x[0], x[1]) for x in p.TARGETS],
                         [("T0001", "concept"), ("T2176", "components"),
                          ("T2354", "components")])

    def test_paid_execute_flag_is_not_supported(self):
        with self.assertRaises(SystemExit) as result:
            p.main(["--execute"])
        self.assertEqual(result.exception.code, 2)

    def test_mocked_preflight_never_calls_tts_or_obtains_tokens(self):
        mocked = [{"topicId": "T0001",
                   "key": "T0001:concept:" + p.VOICE,
                   "chunks": ["가" * 80]}]
        with mock.patch.object(p, "verify_plan", return_value=mocked), \
             mock.patch.object(p.t, "synthesize") as api, \
             mock.patch.object(p.t, "access_token") as token:
            self.assertEqual(p.main([]), 0)
        api.assert_not_called()
        token.assert_not_called()
        self.assertFalse(self.out.exists())

    def test_existing_output_blocks_preview(self):
        self.out.mkdir()
        with mock.patch.object(p, "private_paths",
                               return_value=(self.source, self.out, self.zip)):
            with self.assertRaisesRegex(ValueError, "Existing quality"):
                p.verify_plan()

    def test_wrong_source_sha_blocks_preflight(self):
        self.source.write_text("{}", encoding="utf-8")
        with mock.patch.object(p, "private_paths",
                               return_value=(self.source, self.out, self.zip)):
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                p.verify_plan()

    def test_missing_source_blocks_preflight(self):
        with mock.patch.object(p, "private_paths",
                               return_value=(self.source, self.out, self.zip)):
            with self.assertRaisesRegex(ValueError, "missing"):
                p.verify_plan()

    def test_cloud_approval_flags_stay_false(self):
        p.check_cloud_locks()


if __name__ == "__main__":
    unittest.main()
