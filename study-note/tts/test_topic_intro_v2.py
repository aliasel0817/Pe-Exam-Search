"""Offline coverage: versioned 'topic-name에 대한 설명' introduction.

Do not call Google TTS or touch the pinned historical generator.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import generate_mp3 as legacy
import topic_intro_v2 as v2

ROOT = Path(__file__).resolve().parent
VOICE = v2.VOICE


def record(name="B+Tree", ident="T2176", concept="B트리의 인덱스 구조"):
    return {
        "topicId": ident,
        "studyTarget": "Y",
        "topicName": name,
        "concept": concept,
        "background": "",
        "necessity": "",
        "features": "",
        "technicalComponents": "",
        "keywords": "",
    }


def blank_index():
    return {"schemaVersion": 1, "entries": {}}


class TopicIntroV2Tests(unittest.TestCase):
    def test_title_is_identified_with_explicit_description_suffix_and_pause(self):
        self.assertEqual(
            v2.topic_intro_text("B+Tree", {}),
            "B+Tree에 대한 설명, [pause short]",
        )
        self.assertEqual(
            v2.topic_intro_text("SQL", {}),
            "SQL에 대한 설명, [pause short]",
        )
        self.assertEqual(
            v2.topic_intro_text("몬테카를로 트리검색", {}),
            "몬테카를로 트리검색에 대한 설명, [pause short]",
        )
        self.assertEqual(legacy.synthesis_input(v2.topic_intro_text("퀵 정렬", {})),
                         {"markup": "퀵 정렬에 대한 설명, [pause short]"})

    def test_pronunciation_dictionary_applied_before_intro_suffix(self):
        spoken = v2.topic_intro_text("SQL", {"SQL": "에스큐엘"})
        self.assertEqual(spoken, "에스큐엘에 대한 설명, [pause short]")
        self.assertEqual(
            v2.topic_intro_text("SQL(구조화 질의 언어)", {}),
            "구조화 질의 언어에 대한 설명, [pause short]",
        )

    def test_bilingual_normalization_and_title_pause_remain_compatible(self):
        speech = v2.topic_intro_text("인공지능 · AI(인공지능)", {})
        self.assertIn("인공지능, [pause short] 인공지능에 대한 설명, [pause short]", speech)
        self.assertEqual(speech.count(legacy.PAUSE_MARKER), 2)

    def test_topic_input_is_never_modified_and_source_hash_is_unchanged(self):
        row = record("B+Tree")
        before = json.dumps(row, ensure_ascii=False, sort_keys=True)
        with tempfile.TemporaryDirectory() as d:
            entry = v2.plan_topic_intros([row], {}, Path(d), blank_index(), 1)[0]
        self.assertEqual(json.dumps(row, ensure_ascii=False, sort_keys=True), before)
        self.assertEqual(entry["originalHash"], legacy.digest("B+Tree"))
        self.assertEqual(entry["key"], f"T2176:topic:{VOICE}")
        self.assertEqual(entry["introVersion"], v2.INTRO_VERSION)
        self.assertEqual(entry["chunks"][0], "B+Tree에 대한 설명, [pause short]")

    def test_legacy_title_audio_is_not_reused_as_new_title_intro(self):
        row = record()
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            old = legacy.plan([row], VOICE, {"topic"}, {}, folder, blank_index(), 1)[0]
            old_path = folder / old["files"][0]
            old_path.parent.mkdir(parents=True, exist_ok=True)
            old_path.write_bytes(b"ID3" + b"0" * 200)
            old_index = {"schemaVersion": 1, "entries": {
                old["key"]: {"sha256": old["originalHash"],
                             "speechSha256": old["speechHash"],
                             "file": old["files"][0]}
            }}
            updated = v2.plan_topic_intros([row], {}, folder, old_index, 1)[0]
            self.assertEqual(old["originalHash"], updated["originalHash"])
            self.assertNotEqual(old["speechHash"], updated["speechHash"])
            self.assertNotEqual(old["files"], updated["files"])
            self.assertTrue(old_path.is_file())

    def test_already_correct_new_audio_can_be_reused_without_overwriting(self):
        row = record()
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            entry = v2.plan_topic_intros([row], {}, folder, blank_index(), 1)[0]
            target = folder / entry["files"][0]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"ID3" + b"0" * 200)
            index = {"schemaVersion": 1, "entries": {
                entry["key"]: {"sha256": entry["originalHash"],
                               "speechSha256": entry["speechHash"],
                               "file": entry["files"][0]}
            }}
            self.assertEqual(v2.plan_topic_intros([row], {}, folder, index, 1), [])
            self.assertEqual(target.stat().st_size, 203)

    def test_orphan_output_protection(self):
        row = record()
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            entry = v2.plan_topic_intros([row], {}, folder, blank_index(), 1)[0]
            target = folder / entry["files"][0]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"ID3" + b"0" * 200)
            with self.assertRaisesRegex(ValueError, "already exists"):
                v2.plan_topic_intros([row], {}, folder, blank_index(), 1)

    def test_versions_do_not_change_six_body_field_narration(self):
        row = record()
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            before = legacy.plan([row], VOICE, {"concept"}, {}, folder, blank_index(), 1)
            after = v2.plan_v2([row], {"concept"}, {}, folder, blank_index(), 1)
            self.assertEqual(before, after)
            self.assertEqual(after[0]["chunks"][0],
                             "개념은, [pause short] B트리의 인덱스 구조")

    def test_topic_precedes_body_in_seven_field_order(self):
        row = record()
        row.update(background="동작 배경", necessity="필요성", features="특징",
                   technicalComponents="기술요소", keywords="키워드")
        with tempfile.TemporaryDirectory() as d:
            planned = v2.plan_v2([row], set(v2.ORDER), {}, Path(d), blank_index(), 1)
        self.assertEqual([item["key"].split(":")[1] for item in planned],
                         list(v2.ORDER))
        self.assertEqual(planned[0]["chunks"], ["B+Tree에 대한 설명, [pause short]"])
        self.assertEqual(planned[1]["chunks"][0],
                         "개념은, [pause short] B트리의 인덱스 구조")

    def test_two_topics_are_interleaved_in_original_study_order(self):
        with tempfile.TemporaryDirectory() as d:
            planned = v2.plan_v2([record(ident="T2176"), record("SQL", "T2354")],
                                 {"topic", "concept"}, {}, Path(d), blank_index(), 2)
        self.assertEqual(
            [(r["topicId"], r["key"].split(":")[1]) for r in planned],
            [("T2176", "topic"), ("T2176", "concept"),
             ("T2354", "topic"), ("T2354", "concept")],
        )

    def test_skips_empty_title_and_excluded_study_targets(self):
        excluded = record("N 전용", "T0002")
        excluded["studyTarget"] = "N"
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(v2.plan_topic_intros(
                [record("", "T0001"), excluded], {}, Path(d), blank_index(), 2), [])

    def test_long_name_remains_untruncated_and_preserves_pause(self):
        name = ("정보관리 기술용어 " * 22).strip()
        with tempfile.TemporaryDirectory() as d:
            entry = v2.plan_topic_intros([record(name)], {}, Path(d), blank_index(), 1)[0]
        self.assertGreater(len(entry["chunks"]), 1)
        self.assertEqual("".join("".join(entry["chunks"]).split()),
                         "".join(v2.topic_intro_text(name, {}).split()))
        self.assertTrue(all(legacy.utf8_len(x) <= legacy.MAX_REQUEST_BYTES
                            and len(x) <= legacy.MAX_SPEECH_CHARS for x in entry["chunks"]))

    def test_dry_run_cli_never_generates_or_uploads(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            source = base / "private.json"
            audio = base / "audio"
            source.write_text(
                json.dumps({"topics": [record()]}, ensure_ascii=False), encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(ROOT / "topic_intro_v2.py"), "--input", str(source),
                 "--out", str(audio)], capture_output=True, text=True, timeout=15)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("TOPIC INTRO VERSION: topic-about-v2", proc.stdout)
            self.assertIn("DRY RUN - NO CLOUD/API REQUESTS", proc.stdout)
            self.assertFalse(audio.exists())
            refused = subprocess.run(
                [sys.executable, str(ROOT / "topic_intro_v2.py"), "--input", str(source),
                 "--execute"], capture_output=True, text=True, timeout=15)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("unrecognized arguments", refused.stderr)

    def test_legacy_generator_file_is_unchanged_for_pinned_quality_checks(self):
        data = (ROOT / "generate_mp3.py").read_bytes()
        object_bytes = b"blob " + str(len(data)).encode("ascii") + b"\0" + data
        self.assertEqual(hashlib.sha1(object_bytes).hexdigest(),
                         "81d1a029e8cefc9d51877afaf31d53dd86f96944")
        settings = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
        for key in ("ttsGenerationApproved", "gcsUploadApproved",
                    "cloudRunRevisionUpdateUserApproved"):
            self.assertIs(settings[key], False)


if __name__ == "__main__":
    unittest.main()
