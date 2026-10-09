"""Offline tests for the five-title Aoede 'topic에 대한 설명' preflight.

No Google Cloud calls; all writes are to isolated temporary test fixtures.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import generate_mp3 as legacy
import stage5_topic_intro_v2_preflight as pre

ROOT = Path(__file__).resolve().parent


def sample_topics() -> list[dict]:
    names = ("3C 분석 종류", "몬테카를로 트리검색(MCTS)", "퀵 정렬", "B+Tree", "SQL")
    return [{"topicId": tid, "topicName": name, "studyTarget": "Y"}
            for tid, name in zip(pre.TOPIC_IDS, names)]


class Stage5IntroPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.code = self.root / "code"
        self.code.mkdir()
        for name in ("generate_mp3.py", "topic_intro_v2.py",
                     "pronunciations.ko-candidates.json"):
            (self.code / name).write_bytes((ROOT / name).read_bytes())
        (self.code / "cloud-project.json").write_text(
            json.dumps({
                "schemaVersion": 1, "projectId": pre.PROJECT,
                "ttsGenerationApproved": False, "gcsUploadApproved": False,
                "cloudRunRevisionUpdateUserApproved": False,
            }),
            encoding="utf-8")
        self.source = self.root / "real5.json"
        self.output = self.root / "title-v2-audio"
        self.archive = self.root / "title-v2-audio.zip"
        self.write_source(sample_topics())
        self.root_patch = mock.patch.object(pre, "ROOT", self.code)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.path_patch = mock.patch.object(
            pre, "private_paths", return_value=(self.source, self.output, self.archive))
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)
        self.hash_patch = mock.patch.object(
            pre, "SOURCE_SHA256", hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.hash_patch.start()
        self.addCleanup(self.hash_patch.stop)

    def write_source(self, topics):
        self.source.write_text(json.dumps({"topics": topics}, ensure_ascii=False),
                               encoding="utf-8")

    def test_pinned_plan_contains_exact_five_titles_one_request_each(self):
        plan = pre.verify_plan()
        self.assertEqual([row["topicId"] for row in plan], list(pre.TOPIC_IDS))
        self.assertEqual(len(plan), 5)
        self.assertTrue(all(len(row["chunks"]) == 1 for row in plan))
        self.assertTrue(all(row["chunks"][0].endswith("에 대한 설명, [pause short]")
                            for row in plan))
        self.assertEqual(len({row["files"][0] for row in plan}), 5)
        self.assertTrue(all(row["key"].endswith(":topic:" + pre.VOICE) for row in plan))
        self.assertFalse(self.output.exists())
        self.assertFalse(self.archive.exists())

    def test_stable_existing_topic_name_digest_is_preserved(self):
        plan = pre.verify_plan()
        for rec, topic in zip(plan, sample_topics()):
            self.assertEqual(rec["originalHash"], legacy.digest(topic["topicName"]))

    def test_plan_is_read_only_when_repeated(self):
        a = pre.verify_plan()
        b = pre.verify_plan()
        self.assertEqual(a, b)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.archive.exists())

    def test_blocks_mutated_private_source_even_if_topic_id_unchanged(self):
        self.write_source([*sample_topics()[:-1],
                           {"topicId": "T2354", "topicName": "다른 SQL", "studyTarget": "Y"}])
        with self.assertRaisesRegex(ValueError, "source SHA-256"):
            pre.verify_plan()

    def test_blocks_existing_output_or_zip_without_writing(self):
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError, "already exist"):
            pre.verify_plan()
        self.output.rmdir()
        self.archive.write_bytes(b"old private ZIP")
        with self.assertRaisesRegex(ValueError, "already exist"):
            pre.verify_plan()
        self.assertEqual(self.archive.read_bytes(), b"old private ZIP")

    def test_blocks_pending_zip_without_modifying(self):
        pending = self.archive.with_name(self.archive.name + ".pending")
        pending.write_bytes(b"pending")
        with self.assertRaisesRegex(ValueError, "Unfinished"):
            pre.verify_plan()
        self.assertEqual(pending.read_bytes(), b"pending")

    def test_blocks_unexpected_topic_ids_after_repin(self):
        modified = sample_topics()
        modified[0]["topicId"] = "T9999"
        self.write_source(modified)
        with mock.patch.object(pre, "SOURCE_SHA256",
                               hashlib.sha256(self.source.read_bytes()).hexdigest()):
            with self.assertRaisesRegex(ValueError, "Topic IDs/order"):
                pre.verify_plan()

    def test_blocks_non_learning_topic_after_repin(self):
        modified = sample_topics()
        modified[1]["studyTarget"] = "N"
        self.write_source(modified)
        with mock.patch.object(pre, "SOURCE_SHA256",
                               hashlib.sha256(self.source.read_bytes()).hexdigest()):
            with self.assertRaisesRegex(ValueError, "learning targets"):
                pre.verify_plan()

    def test_block_if_legacy_dictionary_or_v2_script_changed(self):
        for name in ("generate_mp3.py", "pronunciations.ko-candidates.json",
                     "topic_intro_v2.py"):
            path = self.code / name
            saved = path.read_bytes()
            path.write_bytes(saved + b"\n")
            with self.assertRaisesRegex(ValueError, "Pinned script"):
                pre.verify_plan()
            path.write_bytes(saved)

    def test_global_cloud_flags_must_remain_false(self):
        path = self.code / "cloud-project.json"
        for flag in pre.ALLOWED_KEYS:
            settings = json.loads(path.read_text(encoding="utf-8"))
            settings[flag] = True
            path.write_text(json.dumps(settings), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must remain false"):
                pre.verify_plan()
            settings[flag] = False
            path.write_text(json.dumps(settings), encoding="utf-8")

    def test_preflight_main_prints_exact_scope_and_no_cloud_writes(self):
        with mock.patch.object(sys, "argv", ["preflight"]):
            self.assertEqual(pre.main(), 0)
        self.assertFalse(self.output.exists())
        self.assertFalse(self.archive.exists())

    def test_execute_cli_option_is_unknown_and_not_accepted(self):
        with self.assertRaises(SystemExit) as exc:
            pre.main(["--execute"])
        self.assertEqual(exc.exception.code, 2)

    def test_no_paid_api_execution_code_in_preflight(self):
        source = (ROOT / "stage5_topic_intro_v2_preflight.py").read_text(encoding="utf-8")
        self.assertNotIn("urlopen(", source)
        self.assertNotIn("subprocess.run(", source)
        self.assertNotIn("gcloud storage", source)
        self.assertNotIn("def synthesize", source)
        self.assertNotIn('add_argument("--execute"', source)

    def test_git_pinned_generator_never_modified(self):
        self.assertEqual(pre.git_blob_hash(ROOT / "generate_mp3.py"),
                         pre.LEGACY_GENERATOR_BLOB)
        self.assertEqual(pre.git_blob_hash(ROOT / "pronunciations.ko-candidates.json"),
                         pre.DICTIONARY_BLOB)
        self.assertEqual(pre.git_blob_hash(ROOT / "topic_intro_v2.py"),
                         pre.INTRO_V2_BLOB)


if __name__ == "__main__":
    unittest.main()
