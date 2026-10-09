"""Offline regression checks for candidate Korean technical-term pronunciations.

No Google Cloud credentials, network calls, MP3 creation, or paid API needed.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
GENERATOR = ROOT / "generate_mp3.py"
CANDIDATES = ROOT / "pronunciations.ko-candidates.json"
SAMPLE = ROOT / "voice-pilot.sample.json"

spec = importlib.util.spec_from_file_location("tts_pronunciation_generator", GENERATOR)
tts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts)


class KoreanPronunciationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dictionary = tts.load_dictionary(CANDIDATES)

    def test_dictionary_is_valid_and_preserves_required_terms(self):
        self.assertGreaterEqual(len(self.dictionary), 25)
        for term, reading in {
            "LSM-Tree": "엘에스엠 트리",
            "MCTS": "엠씨티에스",
            "SQL": "에스큐엘",
            "NoSQL": "노에스큐엘",
            "B+Tree": "비 플러스 트리",
            "Bloom Filter": "블룸 필터",
        }.items():
            self.assertEqual(self.dictionary[term], reading)

    def test_overlapping_acronyms_use_exact_term_boundaries(self):
        source = "NoSQL, SQL, RDBMS, DBMS, B+Tree, B-Tree, LSM-Tree"
        spoken = tts.for_speech("토픽명", "topic", source, self.dictionary)
        self.assertEqual(
            spoken,
            "노에스큐엘, 에스큐엘, 알디비엠에스, 디비엠에스, "
            "비 플러스 트리, 비 트리, 엘에스엠 트리",
        )

    def test_case_insensitive_matching_does_not_replace_partial_identifiers(self):
        source = "nosql, sql, SQLServer, NoSQLPlus, B+TreeNode, PreMCTS, HTTPS"
        spoken = tts.for_speech("토픽명", "topic", source, self.dictionary)
        self.assertEqual(
            spoken,
            "노에스큐엘, 에스큐엘, SQLServer, NoSQLPlus, "
            "B+TreeNode, PreMCTS, 에이치티티피에스",
        )

    def test_db_component_terms_and_field_label(self):
        spoken = tts.for_speech(
            "기술요소 및 구성요소", "components",
            "MemTable, SSTable, Compaction, Bloom Filter, Write Ahead Log",
            self.dictionary,
        )
        self.assertEqual(
            spoken,
            "기술요소 및 구성요소. 멤 테이블, 에스에스 테이블, "
            "컴팩션, 블룸 필터, 라이트 어헤드 로그",
        )

    def test_source_content_is_preserved_but_speech_hash_changes(self):
        topics = tts.get_topics(SAMPLE)
        with tempfile.TemporaryDirectory() as temp:
            manifest = {"schemaVersion": 1, "entries": {}}
            original = tts.plan(
                topics, "ko-KR-Chirp3-HD-Aoede", {"keywords"},
                {}, Path(temp), manifest, 1,
            )
            translated = tts.plan(
                topics, "ko-KR-Chirp3-HD-Aoede", {"keywords"},
                self.dictionary, Path(temp), manifest, 1,
            )
        self.assertEqual(len(original), 1)
        self.assertEqual(len(translated), 1)
        self.assertEqual(original[0]["originalHash"], translated[0]["originalHash"])
        self.assertNotEqual(original[0]["speechHash"], translated[0]["speechHash"])
        self.assertEqual(topics[0]["keywords"], (
            "LSM-Tree, MemTable, SSTable, Compaction, Bloom Filter"
        ))

    def test_aoede_dry_run_never_generates_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "audio"
            command = [
                sys.executable, str(GENERATOR),
                "--input", str(SAMPLE),
                "--out", str(output),
                "--voice", "ko-KR-Chirp3-HD-Aoede",
                "--pronunciations", str(CANDIDATES),
                "--fields", "topic,concept,keywords",
                "--max-topics", "1",
                "--max-new-requests", "3",
            ]
            result = subprocess.run(
                command, capture_output=True, text=True, timeout=15
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("DRY RUN - NO API CALLS", result.stdout)
            self.assertIn("requests: 3", result.stdout)
            self.assertFalse(output.exists())

    def test_cloud_permissions_remain_locked_in_repository(self):
        settings = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
        self.assertIs(settings["ttsGenerationApproved"], False)
        self.assertIs(settings["gcsUploadApproved"], False)
        self.assertIs(settings["cloudRunRevisionUpdateUserApproved"], False)


if __name__ == "__main__":
    unittest.main()
