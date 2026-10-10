#!/usr/bin/env python3
"""Tests for the exact ten-topic paid-capable SW Aoede pilot, all API calls mocked."""
from __future__ import annotations

from contextlib import ExitStack,redirect_stdout,redirect_stderr
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import generate_mp3 as t
import stage6_sw_offline_prep as sw
import stage6_sw_pilot_v1 as pilot


def make_row(n: int) -> dict:
    return {"topicId":f"T{700+n:04d}","domain":"SW","studyTarget":"Y",
            "topicName":"SW 학습 단위 "+str(n),
            "concept":"소프트웨어 품질을 확인하는 검증 기법",
            "background":"복잡한 소프트웨어 구조를 관리하기 위한 등장 배경",
            "necessity":"개발 과정의 결함과 비용을 줄이기 위한 필요성",
            "features":"정형성, 추적성, 재사용성, 확장성",
            "technicalComponents":"입력·처리·오류·테스트·검증 구성요소",
            "keywords":"검증, 설계, 아키텍처, 품질"}


class Stage6SwPilotTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.rows=[make_row(i) for i in range(10)]
        self.dictionary={}
        summary,selected,inventory,batches=sw.prepare(self.rows,self.dictionary)
        self.selected=selected
        self.inventory=inventory
        self.stats=(summary["segments"],summary["inputChars"],summary["inputBytes"])
        self.source=self.root/"source.json"
        self.expected=self.root/"inventory.json"
        self.dict_path=self.root/"dictionary.json"
        self.source.write_text(json.dumps({"topics":self.rows},ensure_ascii=False),encoding="utf-8")
        self.expected.write_text(json.dumps({"schemaVersion":1,"entries":self.inventory},ensure_ascii=False),encoding="utf-8")
        self.dict_path.write_text("{}",encoding="utf-8")
        self.out=self.root/"new-mp3-pilot"

    def pinned(self):
        stack=ExitStack()
        values={
            "TOPIC_IDS":tuple(r["topicId"] for r in self.rows),
            "PIN_SELECTED_SHA":sw.canonical_sha(self.rows),
            "PIN_FIRST10_SHA":sw.canonical_sha(self.rows[:10]),
            "PIN_DICTIONARY_SHA":sw.canonical_sha(self.dictionary),
            "EXACT_CALLS":self.stats[0],
            "EXACT_CHARACTERS":self.stats[1],
            "EXACT_UTF8_BYTES":self.stats[2],
        }
        for k,v in values.items():
            stack.enter_context(patch.object(pilot,k,v))
        return stack

    def args(self,execute=False):
        flags=["--source",str(self.source),"--inventory",str(self.expected),
               "--dictionary",str(self.dict_path)]
        if execute:
            flags += ["--output",str(self.out),"--execute","--accept-possible-charges",
                      "--approve-exact-calls",str(self.stats[0]),
                      "--approve-exact-characters",str(self.stats[1]),
                      "--approve-exact-utf8-bytes",str(self.stats[2]),
                      "--max-pilot-krw","1000"]
        return flags

    def test_clean_dry_run_no_api_or_files(self):
        with self.pinned(),patch.object(t,"synthesize",side_effect=AssertionError("PAID")),patch.object(t,"access_token",side_effect=AssertionError("AUTH")):
            buf=io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(pilot.main(self.args()),0)
        self.assertIn("0 API POSTS",buf.getvalue())
        self.assertFalse(self.out.exists())

    def test_consent_cannot_be_given_in_dry_run(self):
        with self.pinned(),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()+["--accept-possible-charges"]),2)

    def test_wrong_exact_number_blocks_before_auth(self):
        bad=self.args(execute=True)
        ix=bad.index("--approve-exact-characters")
        bad[ix+1]=str(self.stats[1]+1)
        with self.pinned(),patch.object(pilot,"check_project_and_token",side_effect=AssertionError("CLOUD")),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(bad),2)
        self.assertFalse(self.out.exists())

    def test_full_snapshot_changed_blocks(self):
        data={"topics":self.rows+[make_row(12)]}
        self.source.write_text(json.dumps(data,ensure_ascii=False),encoding="utf-8")
        with self.pinned(),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()),2)

    def test_dictionary_changed_blocks(self):
        self.dict_path.write_text('{"SQL":"에스큐엘"}',encoding="utf-8")
        with self.pinned(),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()),2)

    def test_first_topic_source_changed_blocks(self):
        changed=copy.deepcopy(self.rows)
        changed[0]["concept"]+=" 완전히 다른 원문"
        self.source.write_text(json.dumps({"topics":changed},ensure_ascii=False),encoding="utf-8")
        with self.pinned(),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()),2)

    def test_changed_manifest_path_blocks(self):
        idx=json.loads(self.expected.read_text(encoding="utf-8"))
        idx["entries"][0]["files"]=["https://evil.example/mp3"]
        self.expected.write_text(json.dumps(idx),encoding="utf-8")
        with self.pinned(),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()),2)

    def test_missing_private_manifest_fails(self):
        self.expected.unlink()
        with self.pinned(),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()),2)

    def test_external_private_output_only(self):
        tasks,chars,bytes_total=None,None,None
        with self.pinned():
            tasks,chars,bytes_total=pilot.approved_plan(self.source,self.expected,self.dict_path)
        with self.assertRaisesRegex(ValueError,"Git repository"):
            pilot.synthesize_one_shot(tasks,chars,bytes_total,Path(__file__).resolve().parent/"bad-output-test")
        self.assertFalse((Path(__file__).resolve().parent/"bad-output-test").exists())

    def test_missing_cloud_auth_prevents_all_output(self):
        with self.pinned(),patch.object(pilot,"check_project_and_token",side_effect=ValueError("NO AUTH")),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args(execute=True)),2)
        self.assertFalse(self.out.exists())

    def test_hard_budget_blocks_even_with_exact_calls(self):
        with self.pinned(),patch.object(pilot,"MAX_PILOT_WON",0),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args()),2)

    def test_success_mock_saves_exact_files_and_metadata_once(self):
        mp3=b"ID3"+b"x"*197
        with self.pinned(),patch.object(pilot,"check_project_and_token",return_value="mocked-token"),patch.object(t,"synthesize",return_value=mp3) as called,redirect_stdout(io.StringIO()):
            self.assertEqual(pilot.main(self.args(execute=True)),0)
        self.assertEqual(called.call_count,self.stats[0])
        journal=json.loads((self.out/"attempts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(journal["attempts"]),self.stats[0])
        self.assertTrue(all(a["status"]=="saved" for a in journal["attempts"]))
        manifest=json.loads((self.out/"index-batch001-only.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["entries"]),70)
        self.assertEqual(sum(x.is_file() for x in self.out.rglob("*.mp3")),self.stats[0])

    def test_retry_is_blocked_and_existing_mp3_preserved(self):
        self.out.mkdir()
        marker=self.out/"user-file.txt"
        marker.write_text("do not overwrite",encoding="utf-8")
        with self.pinned(),patch.object(pilot,"check_project_and_token",side_effect=AssertionError("SHOULD NOT SIGN IN")),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args(execute=True)),2)
        self.assertEqual(marker.read_text(encoding="utf-8"),"do not overwrite")

    def test_partial_failure_preserves_attempts_and_denies_auto_retry(self):
        seen=[0]
        def limited(*args):
            seen[0]+=1
            if seen[0]==3:
                raise RuntimeError("SIMULATED 503")
            return b"ID3"+b"x"*197
        with self.pinned(),patch.object(pilot,"check_project_and_token",return_value="mocked-token"),patch.object(t,"synthesize",side_effect=limited),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):
            self.assertEqual(pilot.main(self.args(execute=True)),2)
        self.assertEqual(seen[0],3)
        journal=json.loads((self.out/"attempts.json").read_text(encoding="utf-8"))
        self.assertEqual(len(journal["attempts"]),3)
        self.assertEqual(journal["attempts"][-1]["status"],"attempted")
        self.assertFalse((self.out/"index-batch001-only.json").exists())

    def test_cloud_uses_single_voice_and_pinned_project(self):
        with self.pinned():
            tasks,_,_=pilot.approved_plan(self.source,self.expected,self.dict_path)
            self.assertEqual(len(tasks),70)
            self.assertTrue(all(item["key"].endswith("ko-KR-Chirp3-HD-Aoede") for item in tasks))
            self.assertEqual(pilot.PROJECT,"study-note-tts")


if __name__=="__main__":
    unittest.main()
