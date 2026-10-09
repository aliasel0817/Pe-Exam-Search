"""Isolated offline tests for the second, 7-request Aoede pilot."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import run_approved_quality_aoede_7 as q


class QualityPilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.sample = root / "approved-5.json"
        self.out = root / "quality-7"
        self.archive = root / "quality-7.zip"

    @staticmethod
    def tasks():
        counts = [(65,), (166, 165), (136, 136, 136, 135)]
        result = []
        for (topic, field, _, _), sizes in zip(q.TARGETS, counts):
            chunks = ["가" * n for n in sizes]
            files = [
                "{}/{}/{}-{:012x}{}.mp3".format(
                    q.VOICE, topic, field, 100 + len(result), "" if len(sizes) == 1
                    else "-p{:02d}".format(i))
                for i in range(1, len(sizes) + 1)
            ]
            result.append({
                "key": "{}:{}:{}".format(topic, field, q.VOICE),
                "topicId": topic, "chunks": chunks, "files": files,
                "originalHash": "a" * 64, "speechHash": "b" * 64,
            })
        return result

    def test_synthetic_approved_counts(self):
        tasks = self.tasks()
        self.assertEqual([len(x["chunks"]) for x in tasks], [1, 2, 4])
        self.assertEqual(sum(len(c) for x in tasks for c in x["chunks"]), 939)
        self.assertEqual(sum(len(x["files"]) for x in tasks), 7)

    def test_execute_needs_both_approval_flags(self):
        with mock.patch.object(q, "private_paths", return_value=(self.sample, self.out, self.archive)), \
             mock.patch.object(q, "verify_plan") as verify, \
             mock.patch.object(q.t, "synthesize") as api:
            for flags in (["--execute"], ["--execute", "--accept-possible-charges"],
                          ["--execute", "--approve-exact-7x939"]):
                self.assertEqual(q.main(flags), 2)
        verify.assert_not_called()
        api.assert_not_called()
        self.assertFalse(self.out.exists())

    def test_dry_run_does_not_call_cloud_or_write(self):
        with mock.patch.object(q, "private_paths", return_value=(self.sample, self.out, self.archive)), \
             mock.patch.object(q, "verify_plan", return_value=self.tasks()), \
             mock.patch.object(q.t, "synthesize") as api, \
             mock.patch.object(q.t, "access_token") as token:
            self.assertEqual(q.main([]), 0)
        api.assert_not_called()
        token.assert_not_called()
        self.assertFalse(self.out.exists())
        self.assertFalse(self.archive.exists())

    def test_all_seven_simulated_posts_make_valid_zip_and_journal(self):
        fake_audio = b"ID3" + b"0" * 144
        with mock.patch.object(q, "check_active_project"), \
             mock.patch.object(q.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(q.t, "synthesize", return_value=fake_audio) as api:
            q.synthesize_once(self.tasks(), self.out, self.archive)
        self.assertEqual(api.call_count, 7)
        journal = json.loads((self.out / "attempts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(journal["attempts"]), 7)
        self.assertTrue(all(x["status"] == "saved" for x in journal["attempts"]))
        self.assertEqual(sum(x["characters"] for x in journal["attempts"]), 939)
        self.assertEqual(len(json.loads((self.out / "index.json").read_text())["entries"]), 3)
        with zipfile.ZipFile(self.archive) as z:
            self.assertEqual(len(z.namelist()), 7)
            self.assertIsNone(z.testzip())
            self.assertIn("T0001/01_concept.mp3", z.namelist())
            self.assertIn("T2176/02_components.mp3", z.namelist())
            self.assertIn("T2354/04_components.mp3", z.namelist())

    def test_partial_failure_preserves_attempt_and_prevents_second_run(self):
        count = 0
        def simulate(*_):
            nonlocal count
            count += 1
            if count == 2:
                raise RuntimeError("simulated Cloud API failure")
            return b"ID3" + b"0" * 144
        with mock.patch.object(q, "check_active_project"), \
             mock.patch.object(q.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(q.t, "synthesize", side_effect=simulate):
            with self.assertRaisesRegex(RuntimeError, "simulated Cloud API failure"):
                q.synthesize_once(self.tasks(), self.out, self.archive)
        record = json.loads((self.out / "attempts.json").read_text())
        self.assertEqual([r["status"] for r in record["attempts"]], ["saved", "attempted"])
        self.assertFalse(self.archive.exists())
        with self.assertRaisesRegex(ValueError, "DO NOT RETRY"):
            q.verify_plan(self.sample, self.out, self.archive)

    def test_existing_zip_prevents_even_preflight(self):
        self.archive.write_bytes(b"archive")
        with self.assertRaisesRegex(ValueError, "DO NOT RETRY"):
            q.verify_plan(self.sample, self.out, self.archive)

    def test_wrong_active_project_blocks_before_token_and_folder(self):
        with mock.patch.object(q.subprocess, "run") as process, \
             mock.patch.object(q.t, "access_token") as token:
            process.return_value.stdout = "another-project\n"
            with self.assertRaisesRegex(ValueError, "Wrong gcloud project"):
                q.synthesize_once(self.tasks(), self.out, self.archive)
        token.assert_not_called()
        self.assertFalse(self.out.exists())

    def test_approved_source_sha_mismatch_blocks_preflight(self):
        self.sample.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            q.verify_plan(self.sample, self.out, self.archive)

    def test_cloud_locks_remain_false(self):
        q.check_cloud_locks()


if __name__ == "__main__":
    unittest.main()
