"""Offline safety tests only; synthetic text and mock MP3, no cloud calls."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import run_approved_quality_aoede_7x984 as q


class Quality984ApprovedTests(unittest.TestCase):
    def setUp(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        self.root = Path(td.name)
        self.input = self.root / "private.json"
        self.output = self.root / "quality-7x984"
        self.zip = self.root / "quality-7x984.zip"

    @staticmethod
    def synthetic_tasks():
        # 984 characters, 1,612 bytes exactly: 314 Hangul and 670 ASCII.
        spec = [((80, 26),), ((173, 71), (173, 71)),
                ((140, 37), (140, 37), (139, 36), (139, 36))]
        result = []
        for (topic_id, field, pieces, _, _), sizes in zip(q.p.TARGETS, spec):
            chunks = ["가" * korean + "a" * (total - korean)
                      for total, korean in sizes]
            files = [
                "{}/{}/{}-{:012x}{}.mp3".format(
                    q.p.VOICE, topic_id, field, 100 + len(result),
                    "" if len(sizes) == 1 else "-p{:02d}".format(i))
                for i in range(1, len(sizes) + 1)
            ]
            result.append({
                "key": "{}:{}:{}".format(topic_id, field, q.p.VOICE),
                "topicId": topic_id, "chunks": chunks, "files": files,
                "originalHash": "a" * 64, "speechHash": "b" * 64,
            })
        return result

    def test_synthetic_totals_are_the_precise_approval(self):
        tasks = self.synthetic_tasks()
        self.assertEqual([len(e["chunks"]) for e in tasks], [1, 2, 4])
        self.assertEqual(sum(len(c) for e in tasks for c in e["chunks"]), 984)
        self.assertEqual(sum(q.t.utf8_len(c) for e in tasks for c in e["chunks"]), 1612)

    def test_missing_any_approval_flag_blocks_before_planning(self):
        with mock.patch.object(q, "validated_tasks") as verify, \
             mock.patch.object(q.t, "synthesize") as api:
            for opts in (["--execute"], ["--execute", "--accept-possible-charges"],
                         ["--execute", "--approve-exact-7x984"],
                         ["--accept-possible-charges"],
                         ["--approve-exact-7x984"]):
                self.assertEqual(q.main(opts), 2)
        verify.assert_not_called()
        api.assert_not_called()

    def test_dry_run_has_zero_api_and_filesystem_writes(self):
        with mock.patch.object(q, "validated_tasks", return_value=self.synthetic_tasks()), \
             mock.patch.object(q.t, "synthesize") as api, \
             mock.patch.object(q.t, "access_token") as token:
            self.assertEqual(q.main([]), 0)
        api.assert_not_called()
        token.assert_not_called()
        self.assertFalse(self.output.exists())
        self.assertFalse(self.zip.exists())

    def test_validated_tasks_reject_changed_byte_budget(self):
        modified = self.synthetic_tasks()
        modified[0]["chunks"][0] = "a" * 80
        with mock.patch.object(q.p, "verify_plan", return_value=modified):
            with self.assertRaisesRegex(ValueError, "per-field synthesis budget"):
                q.validated_tasks()

    def test_validated_tasks_reject_changed_preflight_code(self):
        with mock.patch.object(q.p, "git_blob_hash", return_value="0" * 40), \
             mock.patch.object(q.p, "verify_plan") as verify:
            with self.assertRaisesRegex(ValueError, "Preflight version changed"):
                q.validated_tasks()
        verify.assert_not_called()

    def test_wrong_cloud_project_blocks_before_auth_or_directory(self):
        with mock.patch.object(q.subprocess, "run") as gcloud, \
             mock.patch.object(q.t, "access_token") as token:
            gcloud.return_value.stdout = "different-project\n"
            with self.assertRaisesRegex(ValueError, "Wrong Cloud Shell project"):
                q.synthesize_once(self.synthetic_tasks(), self.output, self.zip)
        token.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_auth_failure_blocks_before_directory(self):
        with mock.patch.object(q, "check_active_project"), \
             mock.patch.object(q.t, "access_token", side_effect=RuntimeError("no token")):
            with self.assertRaisesRegex(RuntimeError, "no token"):
                q.synthesize_once(self.synthetic_tasks(), self.output, self.zip)
        self.assertFalse(self.output.exists())

    def test_all_seven_fake_posts_create_valid_zip_and_journal(self):
        fake_mp3 = b"ID3" + b"0" * 160
        with mock.patch.object(q, "check_active_project"), \
             mock.patch.object(q.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(q.t, "synthesize", return_value=fake_mp3) as api:
            q.synthesize_once(self.synthetic_tasks(), self.output, self.zip)
        self.assertEqual(api.call_count, 7)
        self.assertEqual(len(list(self.output.rglob("*.mp3"))), 7)
        log = json.loads((self.output / "attempts.json").read_text())
        self.assertEqual(len(log["records"]), 7)
        self.assertTrue(all(x["status"] == "saved" for x in log["records"]))
        self.assertEqual(sum(x["characters"] for x in log["records"]), 984)
        self.assertEqual(sum(x["utf8Bytes"] for x in log["records"]), 1612)
        self.assertEqual(len(json.loads((self.output / "index.json").read_text())["entries"]), 3)
        with zipfile.ZipFile(self.zip) as archive:
            self.assertEqual(len(archive.namelist()), 7)
            self.assertIsNone(archive.testzip())
            self.assertIn("T0001/01_concept.mp3", archive.namelist())
            self.assertIn("T2176/02_components.mp3", archive.namelist())
            self.assertIn("T2354/04_components.mp3", archive.namelist())

    def test_failure_on_second_post_preserves_journal_and_blocks_retry(self):
        count = 0

        def simulated_api(*_args):
            nonlocal count
            count += 1
            if count == 2:
                raise RuntimeError("simulated API failure")
            return b"ID3" + b"0" * 160

        with mock.patch.object(q, "check_active_project"), \
             mock.patch.object(q.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(q.t, "synthesize", side_effect=simulated_api) as api:
            with self.assertRaisesRegex(RuntimeError, "simulated API failure"):
                q.synthesize_once(self.synthetic_tasks(), self.output, self.zip)
        self.assertEqual(api.call_count, 2)
        log = json.loads((self.output / "attempts.json").read_text())
        self.assertEqual([item["status"] for item in log["records"]],
                         ["saved", "attempted"])
        self.assertFalse(self.zip.exists())
        with mock.patch.object(q.p, "private_paths",
                               return_value=(self.input, self.output, self.zip)):
            with self.assertRaisesRegex(ValueError, "Existing quality"):
                q.p.verify_plan()

    def test_second_synthesis_attempt_fails_before_any_new_api_request(self):
        with mock.patch.object(q, "check_active_project"), \
             mock.patch.object(q.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(q.t, "synthesize", return_value=b"ID3" + b"0" * 160) as api:
            q.synthesize_once(self.synthetic_tasks(), self.output, self.zip)
            with self.assertRaises(FileExistsError):
                q.synthesize_once(self.synthetic_tasks(), self.output, self.zip)
        self.assertEqual(api.call_count, 7)

    def test_repository_global_approvals_still_locked(self):
        q.p.check_cloud_locks()


if __name__ == "__main__":
    unittest.main()
