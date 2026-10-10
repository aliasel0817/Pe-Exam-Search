#!/usr/bin/env python3
"""Pure offline tests for Stage6 workload estimation (no cloud/no writes)."""
from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import stage6_bulk_volume_preflight as p


def topic(tid: str, label: str = "정보관리 분석", target: str = "Y") -> dict:
    return {
        "topicId": tid, "studyTarget": target, "topicName": label,
        "concept": "중복과 결함을 줄이는 정보관리 기법",
        "background": "데이터 규모 확대로 일관성 유지가 어려워 등장",
        "necessity": "안정성과 신뢰성을 확보할 필요성",
        "features": "확장성·일관성·복원력",
        "technicalComponents": "입력처리·통합검증·오류복구",
        "keywords": "신뢰성, 정합성, 가용성",
    }


def entry(task: dict) -> dict:
    result = {"sha256": task["sourceHash"],
              "speechSha256": task["speechHash"]}
    if len(task["paths"]) == 1:
        result["file"] = task["paths"][0]
    else:
        result["files"] = task["paths"]
    return result


class Stage6PreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dictionary: dict[str, str] = {}
        self.rows = [
            {"topicId": "T0000", "studyTarget": "Y",
             "topicName": "정보관리 기술사"},
            topic("T0001"), topic("T0002", target="N"),
            topic("T1961", "몬테카를로 트리검색 (MCTS)"),
            topic("T2354", "SQL (Structured Query Language)"),
        ]

    def test_home_and_n_excluded_all_study_fields_counted(self) -> None:
        result = p.estimate(self.rows, self.dictionary, batch_size=2)
        self.assertEqual(result["studyTopics"], 3)
        self.assertEqual(result["homeExcluded"], 1)
        self.assertEqual(result["inactiveExcluded"], 1)
        self.assertEqual(result["fields"], 21)
        self.assertEqual(result["newFields"], 21)
        self.assertGreaterEqual(result["newSegments"], 21)
        self.assertEqual([b["topics"] for b in result["batches"]], [2, 1])

    def test_duplicate_topic_id_rejected_even_when_inactive(self) -> None:
        with self.assertRaisesRegex(ValueError, "Duplicate topic ID"):
            p.estimate(self.rows + [topic("T0002", target="N")],
                       self.dictionary)

    def test_missing_any_y_field_is_stop_not_a_silent_skip(self) -> None:
        rows = [topic("T0001")]
        rows[0]["technicalComponents"] = ""
        with self.assertRaisesRegex(ValueError, "T0001:components"):
            p.estimate(rows, self.dictionary)

    def test_invalid_status_and_zero_real_study_topics_stop(self) -> None:
        with self.assertRaisesRegex(ValueError, "StudyTarget"):
            p.estimate([topic("T0001", target="?")], self.dictionary)
        with self.assertRaisesRegex(ValueError, "No active study topics"):
            p.estimate([self.rows[0], self.rows[2]], self.dictionary)

    def test_invalid_batch_settings_are_rejected(self) -> None:
        for size in (0, -1, 201):
            with self.assertRaises(ValueError):
                p.estimate(self.rows, self.dictionary, batch_size=size)
        with self.assertRaises(ValueError):
            p.estimate(self.rows, self.dictionary, max_topics=0)

    def test_exact_manifest_hash_reuses_an_unchanged_field(self) -> None:
        original = p.planned_parts(self.rows[1], "concept", "concept",
                                   "개념", self.dictionary)
        index = {"schemaVersion": 1, "entries": {
            "T0001:concept:" + p.VOICE: entry(original)
        }}
        result = p.estimate(self.rows, self.dictionary, index)
        self.assertEqual(result["reusedExact"], 1)
        self.assertEqual(result["newFields"], 20)
        self.assertEqual(result["staleExistingFields"], 0)

    def test_both_historic_title_aliases_require_exact_original_mp3_hash(self) -> None:
        index = {"schemaVersion": 1, "entries": {}}
        for tid, current, old in [
            ("T1961", "몬테카를로 트리검색 (MCTS)", "몬테카를로 트리검색(MCTS)"),
            ("T2354", "SQL (Structured Query Language)", "SQL"),
        ]:
            original = p.planned_parts(topic(tid, old), "topic", "topicName",
                                       "토픽명", self.dictionary)
            index["entries"][tid + ":topic:" + p.VOICE] = entry(original)
        result = p.estimate(self.rows, self.dictionary, index)
        self.assertEqual(result["reusedTitleAliases"], 2)
        self.assertEqual(result["newFields"], 19)
        self.assertEqual(result["staleExistingFields"], 0)

    def test_changed_body_does_not_reuse_old_manifest(self) -> None:
        previous = topic("T0001")
        old = p.planned_parts(previous, "concept", "concept", "개념", self.dictionary)
        index = {"schemaVersion": 1, "entries": {
            "T0001:concept:" + p.VOICE: entry(old)
        }}
        changed = topic("T0001")
        changed["concept"] = "완전히 새로 바뀐 정의"
        result = p.estimate([changed], self.dictionary, index)
        self.assertEqual(result["reusedExact"], 0)
        self.assertEqual(result["staleExistingFields"], 1)
        self.assertEqual(result["newFields"], 7)

    def test_invalid_title_alias_cannot_reuse_mp3(self) -> None:
        old = p.planned_parts(topic("T2354", "SQL"), "topic", "topicName",
                               "토픽명", self.dictionary)
        changed = topic("T2354", "SQL-다른 개념")
        index = {"schemaVersion": 1, "entries": {
            "T2354:topic:" + p.VOICE: entry(old)
        }}
        result = p.estimate([changed], self.dictionary, index)
        self.assertEqual(result["reusedTitleAliases"], 0)
        self.assertEqual(result["staleExistingFields"], 1)

    def test_chunking_is_exact_generator_220_character_policy(self) -> None:
        big = topic("T0001")
        big["technicalComponents"] = "기술요소 설명, " * 100
        result = p.planned_parts(big, "components", "technicalComponents",
                                 "기술요소 및 구성요소", self.dictionary)
        self.assertGreater(result["segments"], 2)
        self.assertEqual(len(result["paths"]), result["segments"])
        self.assertTrue(all("-p" in s for s in result["paths"]))
        self.assertGreater(result["inputBytes"], result["inputChars"])

    def test_batch_cap_limits_summary_without_mutating_source(self) -> None:
        before = json.dumps(self.rows, ensure_ascii=False)
        result = p.estimate(self.rows, self.dictionary,
                            batch_size=2, max_topics=1)
        self.assertEqual(result["studyTopics"], 1)
        self.assertEqual(result["fields"], 7)
        self.assertEqual(before, json.dumps(self.rows, ensure_ascii=False))

    def test_input_and_manifest_read_files_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "private.json"
            index = root / "index.json"
            source.write_text(
                json.dumps({"topics": self.rows}, ensure_ascii=False),
                encoding="utf-8")
            index.write_text(
                json.dumps({"schemaVersion": 1, "entries": {}}), encoding="utf-8")
            before = sorted(p.name for p in root.iterdir())
            loaded = p.load_source(source)
            manifest = p.load_index(index)
            result = p.estimate(loaded, self.dictionary, manifest)
            self.assertEqual(result["studyTopics"], 3)
            self.assertEqual(before, sorted(p.name for p in root.iterdir()))
            self.assertEqual(len(loaded), len(self.rows))

    def test_empty_source_and_invalid_manifest_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            src = Path(directory) / "source.json"
            src.write_text('{"topics":[]}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "nonempty"):
                p.load_source(src)
            src.write_text('{"schemaVersion":2,"entries":[]}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "manifest"):
                p.load_index(src)

    def test_cloud_synthesis_routines_never_called_by_preflight(self) -> None:
        with (patch.object(p.legacy, "synthesize", side_effect=AssertionError("PAID")),
              patch.object(p.legacy, "access_token", side_effect=AssertionError("TOKEN")),
              patch.object(p.legacy, "reserve_charge", side_effect=AssertionError("WRITE")),
              patch.object(p.legacy, "execute", side_effect=AssertionError("EXECUTE"))):
            result = p.estimate(self.rows, self.dictionary)
            self.assertGreater(result["newSegments"], 0)

    def test_cli_offline_report_excludes_text_and_never_writes_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "private.json"
            dictionary = root / "dict.json"
            source.write_text(json.dumps({"topics": self.rows},
                                         ensure_ascii=False), encoding="utf-8")
            dictionary.write_text("{}", encoding="utf-8")
            before = sorted(p.name for p in root.iterdir())
            output = io.StringIO()
            with redirect_stdout(output):
                rc = p.main(["--input", str(source),
                             "--dictionary", str(dictionary), "--batch-size", "2"])
            self.assertEqual(rc, 0)
            text = output.getvalue()
            self.assertIn("STAGE6 OFFLINE READ-ONLY VOLUME PREFLIGHT PASSED", text)
            self.assertIn("NO TTS API", text)
            self.assertNotIn("데이터 규모 확대로", text)
            self.assertEqual(before, sorted(p.name for p in root.iterdir()))


if __name__ == "__main__":
    unittest.main()
