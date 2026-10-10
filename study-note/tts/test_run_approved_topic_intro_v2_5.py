"""Offline one-shot scope tests for the five-title Aoede runner.

All Cloud TTS POST requests are mocked. No real billable calls, uploads,
Cloud Run deployments, Google Sheets, or operational file writes.
"""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import generate_mp3 as legacy
import topic_intro_v2 as intro
import run_approved_topic_intro_v2_5 as run


def example_rows():
    labels = ("3C 분석 종류", "몬테카를로 트리검색(MCTS)", "퀵 정렬",
              "B+Tree", "SQL")
    return [
        {"topicId": topic_id, "topicName": name, "studyTarget": "Y"}
        for topic_id, name in zip(run.p.TOPIC_IDS, labels)
    ]


class FiveTopicIntroRunnerTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.folder = self.root / "five-new-intros"
        self.zipfile = self.root / "five-new-intros.zip"
        self.old_folder = self.root / "old-35-mp3"
        self.old_folder.mkdir()
        (self.old_folder / "old.mp3").write_bytes(b"ID3" + b"x" * 256)
        self.old_audio = (self.old_folder / "old.mp3").read_bytes()
        self.paths = mock.patch.object(
            run.p, "private_paths",
            return_value=(self.root / "private-five.json", self.folder, self.zipfile),
        )
        self.paths.start()
        self.addCleanup(self.paths.stop)
        self.tasks = intro.plan_v2(example_rows(), {"topic"}, {}, self.folder,
                                  {"schemaVersion": 1, "entries": {}}, 5)
        self.chars = sum(len(x["chunks"][0]) for x in self.tasks)
        self.bytes = sum(legacy.utf8_len(x["chunks"][0]) for x in self.tasks)

    def test_dry_run_only_displays_counts_and_never_calls_cloud(self):
        with mock.patch.object(run, "approved_plan",
                               return_value=(self.tasks, self.chars, self.bytes)), \
             mock.patch.object(run, "execute_exactly_once",
                               side_effect=AssertionError("cloud must remain untouched")):
            self.assertEqual(run.main([]), 0)
        self.assertFalse(self.folder.exists())

    def test_no_authorization_flags_can_be_used_in_dry_run(self):
        with mock.patch.object(run, "approved_plan",
                               side_effect=AssertionError("unexpected preflight")):
            for args in (["--accept-possible-charges"],
                         ["--approve-exact-five-intros"],
                         ["--approve-exact-characters", str(self.chars)],
                         ["--approve-exact-utf8-bytes", str(self.bytes)]):
                self.assertEqual(run.main(args), 2)

    def test_execute_requires_all_four_approval_inputs(self):
        with mock.patch.object(run, "approved_plan",
                               side_effect=AssertionError("preflight should not run")):
            for args in (
                ["--execute"],
                ["--execute", "--accept-possible-charges"],
                ["--execute", "--accept-possible-charges", "--approve-exact-five-intros"],
                ["--execute", "--accept-possible-charges", "--approve-exact-five-intros",
                 "--approve-exact-characters", str(self.chars)],
            ):
                self.assertEqual(run.main(args), 2)

    def test_exact_counts_cannot_be_rounded_or_exceeded(self):
        base = ["--execute", "--accept-possible-charges",
                "--approve-exact-five-intros"]
        with mock.patch.object(run, "approved_plan",
                               return_value=(self.tasks, self.chars, self.bytes)), \
             mock.patch.object(run, "execute_exactly_once",
                               side_effect=AssertionError("no TTS call allowed")):
            self.assertEqual(run.main(
                base + ["--approve-exact-characters", str(self.chars + 1),
                        "--approve-exact-utf8-bytes", str(self.bytes)]), 2)
            self.assertEqual(run.main(
                base + ["--approve-exact-characters", str(self.chars),
                        "--approve-exact-utf8-bytes", str(self.bytes - 1)]), 2)
        self.assertFalse(self.folder.exists())

    def test_scope_is_exact_five_unique_topic_names(self):
        with mock.patch.object(run.p, "verify_plan", return_value=self.tasks):
            tasks, chars, bytes_total = run.approved_plan()
        self.assertEqual(chars, self.chars)
        self.assertEqual(bytes_total, self.bytes)
        self.assertEqual(len(tasks), 5)
        self.assertEqual([x["topicId"] for x in tasks], list(run.p.TOPIC_IDS))
        self.assertTrue(all(x["key"].split(":")[1] == "topic" for x in tasks))
        self.assertFalse(self.folder.exists())

    def test_scope_rejects_extra_or_changed_topic_fields(self):
        modified = [*self.tasks]
        modified[0] = {**modified[0], "key": "T0001:concept:" + run.p.VOICE}
        with mock.patch.object(run.p, "verify_plan", return_value=modified):
            with self.assertRaisesRegex(ValueError, "Unexpected topic field"):
                run.approved_plan()
        with mock.patch.object(run.p, "verify_plan",
                               return_value=self.tasks + [self.tasks[0]]):
            with self.assertRaisesRegex(ValueError, "Exactly five"):
                run.approved_plan()

    def test_larger_than_hard_character_limit_is_rejected(self):
        modified = [{**row, "chunks": list(row["chunks"])} for row in self.tasks]
        modified[0]["chunks"] = ["가" * (run.MAX_APPROVABLE_CHARS + 1)]
        with mock.patch.object(run.p, "verify_plan", return_value=modified):
            with self.assertRaisesRegex(ValueError, "budget exceeds"):
                run.approved_plan()

    def test_with_exact_approval_runner_path_is_used_once(self):
        args = ["--execute", "--accept-possible-charges",
                "--approve-exact-five-intros",
                "--approve-exact-characters", str(self.chars),
                "--approve-exact-utf8-bytes", str(self.bytes)]
        with mock.patch.object(run, "approved_plan",
                               return_value=(self.tasks, self.chars, self.bytes)), \
             mock.patch.object(run, "execute_exactly_once") as execution:
            self.assertEqual(run.main(args), 0)
            execution.assert_called_once_with(self.tasks, self.chars, self.bytes)

    def test_mocked_five_calls_write_manifest_journal_and_nonoverwriting_zip(self):
        with mock.patch.object(run, "check_active_project"), \
             mock.patch.object(run.t, "access_token", return_value="offline-mock-token"), \
             mock.patch.object(run.t, "synthesize",
                               return_value=b"ID3" + b"1" * 512) as paid:
            run.execute_exactly_once(self.tasks, self.chars, self.bytes)
        self.assertEqual(paid.call_count, 5)
        self.assertEqual(len(list(self.folder.rglob("*.mp3"))), 5)
        ledger = json.loads((self.folder / "attempts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(ledger["records"]), 5)
        self.assertEqual(sum(rec["characters"] for rec in ledger["records"]), self.chars)
        self.assertEqual([rec["status"] for rec in ledger["records"]], ["saved"] * 5)
        index = json.loads((self.folder / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(len(index["entries"]), 5)
        with zipfile.ZipFile(self.zipfile) as archive:
            self.assertEqual(len(archive.namelist()), 5)
            self.assertIsNone(archive.testzip())
        self.assertEqual((self.old_folder / "old.mp3").read_bytes(), self.old_audio)

    def test_partial_failure_keeps_attempts_and_prevents_retry(self):
        responses = [b"ID3" + b"1" * 512, RuntimeError("simulated TTS failure")]
        def fake_tts(*_args):
            item = responses.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        with mock.patch.object(run, "check_active_project"), \
             mock.patch.object(run.t, "access_token", return_value="offline-mock-token"), \
             mock.patch.object(run.t, "synthesize", side_effect=fake_tts) as paid:
            with self.assertRaisesRegex(RuntimeError, "simulated TTS failure"):
                run.execute_exactly_once(self.tasks, self.chars, self.bytes)
            self.assertEqual(paid.call_count, 2)
            with self.assertRaises(FileExistsError):
                run.execute_exactly_once(self.tasks, self.chars, self.bytes)
        journal = json.loads((self.folder / "attempts.json").read_text(encoding="utf-8"))
        self.assertEqual([x["status"] for x in journal["records"]],
                         ["saved", "attempted"])
        self.assertFalse(self.zipfile.exists())
        self.assertEqual((self.old_folder / "old.mp3").read_bytes(), self.old_audio)

    def test_wrong_project_or_credential_failure_creates_no_output(self):
        with mock.patch.object(run, "check_active_project",
                               side_effect=ValueError("wrong project")), \
             mock.patch.object(run.t, "synthesize",
                               side_effect=AssertionError("no paid POST")):
            with self.assertRaisesRegex(ValueError, "wrong project"):
                run.execute_exactly_once(self.tasks, self.chars, self.bytes)
        self.assertFalse(self.folder.exists())
        with mock.patch.object(run, "check_active_project"), \
             mock.patch.object(run.t, "access_token",
                               side_effect=RuntimeError("no token")), \
             mock.patch.object(run.t, "synthesize",
                               side_effect=AssertionError("no paid POST")):
            with self.assertRaisesRegex(RuntimeError, "no token"):
                run.execute_exactly_once(self.tasks, self.chars, self.bytes)
        self.assertFalse(self.folder.exists())

    def test_runner_code_contains_no_gcs_or_cloud_run_deploy_commands(self):
        source = (Path(__file__).resolve().parent /
                  "run_approved_topic_intro_v2_5.py").read_text(encoding="utf-8")
        for forbidden in ("gcloud storage cp", "gcloud run deploy",
                          "https://storage.googleapis.com", "upload_blob("):
            self.assertNotIn(forbidden, source)

    def test_exact_approval_bound_is_tiny(self):
        self.assertEqual(run.MAX_APPROVED_CALLS, 5)
        self.assertLessEqual(run.MAX_APPROVABLE_CHARS, 500)
        self.assertLessEqual(run.MAX_APPROVABLE_UTF8_BYTES, 1500)
        self.assertLess(self.chars, run.MAX_APPROVABLE_CHARS)
        self.assertLess(self.bytes, run.MAX_APPROVABLE_UTF8_BYTES)


if __name__ == "__main__":
    unittest.main()
