#!/usr/bin/env python3
"""Offline-only safety tests for SW Aoede MP3 planning; no paid API calls."""
from __future__ import annotations

import copy
import hashlib
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import generate_mp3 as generator
import stage6_sw_offline_prep as sw


def row(tid="T0700", target="Y", name="SW 단위 시험"):
    return {
        "topicId": tid, "studyTarget": target, "domain": "SW",
        "topicName": name, "concept": "정보 일관성 확보 기술",
        "background": "프로그램 구조가 복잡해지고 유지보수 비용 증가",
        "necessity": "오류를 줄이고 코드의 품질을 개선",
        "features": "모듈화·확장성·표준화",
        "technicalComponents": "설계 원칙·품질지표·테스트·재사용",
        "keywords": "개발, 설계, 유지보수, 확장",
    }


class SwStage64OfflineTests(unittest.TestCase):
    def setUp(self):
        self.rows = [row("T0700"), row("T0701"), row("T0702", target="N")]
        self.dictionary = {"SQL": "에스큐엘"}

    def prepare(self, rows=None, batch_size=10):
        return sw.prepare(self.rows if rows is None else rows,
                          self.dictionary, batch_size=batch_size)

    def test_only_y_and_all_seven_fields(self):
        summary, selected, tasks, batches = self.prepare()
        self.assertEqual((summary["studyTopics"],
                          summary["inactiveExcluded"], len(tasks)), (2, 1, 14))
        self.assertEqual(len(batches), 1)
        self.assertEqual(len(batches[0]["topicIds"]), 2)
        self.assertEqual(summary["voice"], "ko-KR-Chirp3-HD-Aoede")

    def test_n_rows_never_produced(self):
        _, _, tasks, batches = self.prepare()
        self.assertFalse(any("T0702" in t["key"] for t in tasks))
        self.assertNotIn("T0702", batches[0]["topicIds"])

    def test_other_domain_fails_closed(self):
        items = copy.deepcopy(self.rows)
        items[0]["domain"] = "DB"
        with self.assertRaisesRegex(ValueError, "Only SW"):
            self.prepare(items)

    def test_home_row_fails_closed(self):
        items = self.rows + [row("T0000")]
        with self.assertRaisesRegex(ValueError, "no home"):
            self.prepare(items)

    def test_duplicate_ids_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.prepare(self.rows + [row("T0700")])

    def test_missing_required_field_fails_closed(self):
        items = copy.deepcopy(self.rows)
        items[0]["technicalComponents"] = "   "
        with self.assertRaisesRegex(ValueError, "T0700:components"):
            self.prepare(items)

    def test_status_other_than_y_n_fails_closed(self):
        items = [row("T0700", target="?")]
        with self.assertRaisesRegex(ValueError, "Y or N"):
            self.prepare(items)

    def test_zero_selected_rows_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "No SW study"):
            self.prepare([row("T0700", target="N")])

    def test_malformed_topic_id_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Invalid topicId"):
            self.prepare([row("XXX")])

    def test_batch_size_limited_to_ten(self):
        for size in (0, 11, -1):
            with self.assertRaisesRegex(ValueError, "between 1 and 10"):
                self.prepare(batch_size=size)

    def test_two_batches_and_no_duplication(self):
        items = [row("T{:04d}".format(700+i)) for i in range(13)]
        s, selected, tasks, batches = self.prepare(items)
        self.assertEqual(len(batches), 2)
        self.assertEqual([len(b["topicIds"]) for b in batches], [10, 3])
        self.assertEqual(s["fieldCount"], 13 * 7)
        self.assertEqual(sum(t["segments"] for t in tasks), s["segments"])
        self.assertEqual(len(set(f for t in tasks for f in t["files"])),s["segments"])

    def test_original_sha_preserved_exact(self):
        _, _, tasks, _ = self.prepare()
        expected=hashlib.sha256(self.rows[0]["concept"].encode("utf-8")).hexdigest()
        self.assertEqual(next(t for t in tasks if t["key"].startswith("T0700:concept:"))["originalSha256"],expected)

    def test_long_technical_text_splits_and_no_loss(self):
        items = [row()]
        items[0]["technicalComponents"] = "개발 방법론 및 품질 성능 지표 " * 110
        summary, _, tasks, _ = self.prepare(items)
        technical=next(t for t in tasks if t["field"]=="components")
        self.assertGreater(technical["segments"],2)
        self.assertEqual(len(technical["files"]),technical["segments"])
        self.assertEqual(sum(t["inputChars"] for t in tasks),summary["inputChars"])

    def test_metadata_safe_contains_no_private_original(self):
        s, _, tasks, _ = self.prepare()
        text=json.dumps(s,ensure_ascii=False)
        self.assertNotIn("정보 일관성",text)
        self.assertNotIn("프로그램 구조",text)
        self.assertTrue(all("chunks" not in t and "original" not in t for t in tasks))

    def test_no_input_mutation(self):
        before=json.dumps(self.rows,ensure_ascii=False)
        self.prepare()
        self.assertEqual(json.dumps(self.rows,ensure_ascii=False),before)

    def test_offline_never_calls_synthesis_auth_upload(self):
        with (patch.object(generator,"synthesize",side_effect=AssertionError("PAID TTS")),
              patch.object(generator,"access_token",side_effect=AssertionError("AUTH")),
              patch.object(generator,"execute",side_effect=AssertionError("EXECUTE"))):
            self.prepare()

    def test_private_files_created_only_outside_repo(self):
        s, selected, tasks, batches=self.prepare()
        with tempfile.TemporaryDirectory() as d:
            dest=Path(d)/"private"
            files=sw.write_private(dest,s,selected,tasks,batches)
            self.assertEqual(len(files),4)
            self.assertEqual(json.loads(files[0].read_text(encoding="utf-8"))["topics"],selected)
            self.assertTrue(all(f.exists() for f in files))
            with self.assertRaises(FileExistsError):
                sw.write_private(dest,s,selected,tasks,batches)
            self.assertEqual(json.loads(files[1].read_text(encoding="utf-8"))["entries"][0]["status"],
                             "PLANNED_NOT_UPLOADED")

    def test_refuses_private_files_inside_repository(self):
        s,selected,tasks,batches=self.prepare()
        path=Path(sw.__file__).resolve().parent/"private_DO_NOT_CREATE"
        with self.assertRaisesRegex(ValueError,"Git repository"):
            sw.write_private(path,s,selected,tasks,batches)
        self.assertFalse(path.exists())

    def test_cli_dry_run_no_file_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            src=Path(directory)/"src.json"
            src.write_text(json.dumps(self.rows,ensure_ascii=False),encoding="utf-8")
            before={p.name for p in Path(directory).iterdir()}
            out=io.StringIO()
            with redirect_stdout(out):
                rc=sw.main(["--source",str(src)])
            self.assertEqual(rc,0)
            self.assertIn("NO CLOUD REQUESTS",out.getvalue())
            self.assertEqual(before,{p.name for p in Path(directory).iterdir()})


if __name__=="__main__":
    unittest.main()
