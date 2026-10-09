"""Strictly offline tests for the one-shot approved five-topic Aoede TTS runner."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import run_approved_stage3_aoede as runner


class ApprovedAoedeStage3Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.out = self.root / "stage3-audio"
        self.zip = self.root / "stage3-audio.zip"
        self.sample = self.root / "sample.json"

    @staticmethod
    def planned_tasks():
        # 4,577 characters / 8,674 bytes, spread over exactly 35 safe chunks.
        text = "가" * 2048 + "é" + "a" * 2528
        assert len(text) == 4577 and len(text.encode("utf-8")) == 8674
        chunks = [text[i * 130:(i + 1) * 130] for i in range(34)] + [text[4420:]]
        result = []
        i = 0
        for topic_id in runner.TOPIC_IDS:
            for field in runner.FIELD_IDS:
                content = chunks[i]
                result.append({
                    "key": f"{topic_id}:{field}:{runner.VOICE}",
                    "topicId": topic_id,
                    "label": field,
                    "chunks": [content],
                    "files": [f"{runner.VOICE}/{topic_id}/{field}-{i:012x}.mp3"],
                    "originalHash": hashlib.sha256(content.encode()).hexdigest(),
                    "speechHash": hashlib.sha256(content.encode()).hexdigest(),
                })
                i += 1
        return result

    def test_plan_has_the_exact_approved_totals(self):
        tasks = self.planned_tasks()
        self.assertEqual(len(tasks), 35)
        self.assertEqual(sum(len(x["chunks"][0]) for x in tasks), 4577)
        self.assertEqual(sum(len(x["chunks"][0].encode("utf-8")) for x in tasks), 8674)
        self.assertEqual(len({x["key"] for x in tasks}), 35)

    def test_refuse_execute_when_either_explicit_approval_missing(self):
        with mock.patch.object(runner, "private_paths", return_value=(self.sample, self.out, self.zip)), \
             mock.patch.object(runner, "verify_plan") as planning, \
             mock.patch.object(runner.t, "synthesize") as api:
            for args in (
                ["--execute"],
                ["--execute", "--accept-possible-charges"],
                ["--execute", "--approve-exact-35x4577"],
            ):
                self.assertEqual(runner.main(args), 2)
        planning.assert_not_called()
        api.assert_not_called()
        self.assertFalse(self.out.exists())

    def test_dry_run_has_no_cloud_calls_or_outputs(self):
        with mock.patch.object(runner, "private_paths", return_value=(self.sample, self.out, self.zip)), \
             mock.patch.object(runner, "verify_plan", return_value=self.planned_tasks()), \
             mock.patch.object(runner.t, "access_token") as token, \
             mock.patch.object(runner.t, "synthesize") as api:
            self.assertEqual(runner.main([]), 0)
        self.assertFalse(self.out.exists())
        self.assertFalse(self.zip.exists())
        token.assert_not_called()
        api.assert_not_called()

    def test_wrong_project_fails_before_token_or_output(self):
        with mock.patch.object(runner.subprocess, "run") as command, \
             mock.patch.object(runner.t, "access_token") as token:
            command.return_value.stdout = ""
            with self.assertRaisesRegex(ValueError, "Wrong Cloud Shell project"):
                runner.synthesize_once(self.planned_tasks(), self.out, self.zip)
        self.assertFalse(self.out.exists())
        token.assert_not_called()

    def test_token_error_fails_before_creating_one_shot_directory(self):
        with mock.patch.object(runner, "check_active_project"), \
             mock.patch.object(runner.t, "access_token", side_effect=RuntimeError("No token")):
            with self.assertRaisesRegex(RuntimeError, "No token"):
                runner.synthesize_once(self.planned_tasks(), self.out, self.zip)
        self.assertFalse(self.out.exists())

    def test_exactly_35_simulated_calls_and_friendly_zip(self):
        fake_audio = b"ID3" + b"0" * 144
        with mock.patch.object(runner, "check_active_project"), \
             mock.patch.object(runner.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(runner.t, "synthesize", return_value=fake_audio) as api:
            runner.synthesize_once(self.planned_tasks(), self.out, self.zip)
        self.assertEqual(api.call_count, 35)
        self.assertTrue(self.zip.is_file())
        self.assertEqual(len(list(self.out.rglob("*.mp3"))), 35)
        journal = json.loads((self.out / "attempts.json").read_text())
        self.assertEqual(len(journal["attempts"]), 35)
        self.assertTrue(all(item["status"] == "saved" for item in journal["attempts"]))
        self.assertEqual(sum(x["characters"] for x in journal["attempts"]), 4577)
        self.assertEqual(sum(x["utf8Bytes"] for x in journal["attempts"]), 8674)
        self.assertEqual(len(json.loads((self.out / "index.json").read_text())["entries"]), 35)
        with zipfile.ZipFile(self.zip) as archive:
            self.assertEqual(len(archive.namelist()), 35)
            self.assertIn("T0001/01_topic.mp3", archive.namelist())
            self.assertIn("T2354/07_keywords.mp3", archive.namelist())
            self.assertIsNone(archive.testzip())

    def test_failed_second_request_keeps_attempt_record_and_blocks_rerun(self):
        calls = 0

        def fake_api(*_):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("Simulated HTTP failure")
            return b"ID3" + b"0" * 144

        with mock.patch.object(runner, "check_active_project"), \
             mock.patch.object(runner.t, "access_token", return_value="FAKE-TOKEN"), \
             mock.patch.object(runner.t, "synthesize", side_effect=fake_api) as api:
            with self.assertRaisesRegex(RuntimeError, "Simulated HTTP failure"):
                runner.synthesize_once(self.planned_tasks(), self.out, self.zip)
        self.assertEqual(api.call_count, 2)
        journal = json.loads((self.out / "attempts.json").read_text())
        self.assertEqual([x["status"] for x in journal["attempts"]], ["saved", "attempted"])
        self.assertFalse(self.zip.exists())
        with self.assertRaisesRegex(ValueError, "already exists"):
            runner.verify_plan(self.sample, self.out, self.zip)

    def test_private_sample_must_match_exact_sha_and_no_outputs(self):
        self.sample.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "differs from the approved"):
            runner.verify_plan(self.sample, self.out, self.zip)
        self.assertFalse(self.out.exists())
        self.assertFalse(self.zip.exists())

    def test_preflight_validates_real_generator_and_sample_shape(self):
        sample = {
            "topics": [
                {"topicId": t, "studyTarget": "Y", **{
                    prop: "테스트" for field, prop, _ in runner.t.FIELDS
                }}
                for t in runner.TOPIC_IDS
            ]
        }
        self.sample.write_text(json.dumps(sample, ensure_ascii=False), encoding="utf-8")
        # Allow this synthetic, PUBLIC test input with controlled totals only.
        with mock.patch.object(runner, "EXPECTED_SAMPLE_SHA256", runner.sha256_file(self.sample)), \
             mock.patch.object(runner, "EXPECTED_GENERATOR_GIT_SHA", runner.git_blob_hash(runner.ROOT / "generate_mp3.py")), \
             mock.patch.object(runner, "EXPECTED_DICTIONARY_GIT_SHA", runner.git_blob_hash(runner.ROOT / "pronunciations.ko-candidates.json")):
            tasks = runner.t.plan(
                runner.t.get_topics(self.sample), runner.VOICE, set(runner.FIELD_IDS),
                runner.t.load_dictionary(runner.ROOT / "pronunciations.ko-candidates.json"),
                self.out, {"schemaVersion": 1, "entries": {}}, len(runner.TOPIC_IDS),
            )
            count = sum(len(chunk) for item in tasks for chunk in item["chunks"])
            bytes_ = sum(len(chunk.encode("utf-8")) for item in tasks for chunk in item["chunks"])
            with mock.patch.object(runner, "EXPECTED_CHARS", count), mock.patch.object(runner, "EXPECTED_BYTES", bytes_):
                self.assertEqual(len(runner.verify_plan(self.sample, self.out, self.zip)), 35)


if __name__ == "__main__":
    unittest.main()
