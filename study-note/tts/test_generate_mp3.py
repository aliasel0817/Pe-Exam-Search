"""Offline tests: no credential, no Google Cloud API requests."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

MODULE_FILE = Path(__file__).resolve().with_name("generate_mp3.py")
spec = importlib.util.spec_from_file_location("study_tts_generator", MODULE_FILE)
tts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts)


class StudyTtsGeneratorTests(unittest.TestCase):
    def test_utf8_chunk_limit_preserves_content(self):
        source = "데이터베이스 정규화는 데이터 이상을 방지하는 기법입니다. " * 160
        chunks = tts.split_speech(source, 650)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(tts.utf8_len(x) <= 650 for x in chunks))
        self.assertEqual("".join("".join(chunks).split()), "".join(source.split()))

    def test_long_unspaced_korean_text(self):
        source = "가" * 2000
        pieces = tts.split_speech(source, 200)
        self.assertGreater(len(pieces), 10)
        self.assertEqual("".join(pieces), source)
        self.assertTrue(all(tts.utf8_len(x) <= 200 for x in pieces))

    def test_pronunciation_does_not_change_original_hash(self):
        original = "LSM-Tree와 MCTS의 차이"
        speak = tts.for_speech("개념", "concept", original,
                               {"LSM-Tree": "엘에스엠 트리", "MCTS": "엠씨티에스"})
        self.assertIn("엘에스엠 트리", speak)
        self.assertIn("엠씨티에스", speak)
        self.assertEqual(tts.digest(original), tts.digest("LSM-Tree와 MCTS의 차이"))

    def test_no_wrong_substring_substitutions(self):
        spoken = tts.for_speech("개념", "concept", "MCTS와 XMCTS2, SQL", {"MCTS": "엠씨티에스"})
        self.assertIn("엠씨티에스", spoken)
        self.assertIn("XMCTS2", spoken)

    def test_manifest_paths(self):
        sha = tts.digest("개념")
        one = tts.paths_for("T0001", "concept", "ko-KR-Chirp3-HD-Aoede", sha, 1)
        three = tts.paths_for("T0001", "concept", "ko-KR-Chirp3-HD-Aoede", sha, 3)
        self.assertTrue(one[0].endswith("concept-" + sha[:12] + ".mp3"))
        self.assertTrue(three[2].endswith("p03.mp3"))


    def test_pronunciation_change_invalidates_cached_audio(self):
        record = {"topicId": "T0001", "studyTarget": "Y",
                  "topicName": "SQL 분석"}
        voice = "ko-KR-Chirp3-HD-Aoede"
        base = {"schemaVersion": 1, "entries": {}}
        with tempfile.TemporaryDirectory() as tmp:
            original = tts.plan([record], voice, {"topic"}, {},
                                Path(tmp), base, 1)[0]
            modified = tts.plan([record], voice, {"topic"}, {"SQL": "에스큐엘"},
                                Path(tmp), base, 1)[0]
            self.assertEqual(original["originalHash"], modified["originalHash"])
            self.assertNotEqual(original["speechHash"], modified["speechHash"])
            self.assertNotEqual(original["files"], modified["files"])

    def test_study_target_n_is_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "topics.json"
            src.write_text(json.dumps([
                {"topicId": "T0001", "topicName": "테스트", "studyTarget": "Y"},
                {"topicId": "T0002", "topicName": "제외", "studyTarget": "N"},
            ], ensure_ascii=False), encoding="utf-8")
            self.assertEqual(len(tts.get_topics(src)), 1)

    def test_plan_skips_existing_mp3_without_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            record = {"topicId": "T0001", "studyTarget": "Y", "topicName": "기술사"}
            planned = tts.plan([record], "ko-KR-Chirp3-HD-Aoede", {"topic"}, {},
                               root, {"schemaVersion": 1, "entries": {}}, 1)
            self.assertEqual(len(planned), 1)
            item = planned[0]
            fullpath = root / item["files"][0]
            fullpath.parent.mkdir(parents=True, exist_ok=True)
            fullpath.write_bytes(b"ID3" + b"0" * 128)
            manifest = {"schemaVersion": 1, "entries": {item["key"]: {
                "sha256": item["originalHash"], "speechSha256": item["speechHash"],
                "file": item["files"][0]
            }}}
            self.assertEqual(tts.plan([record], "ko-KR-Chirp3-HD-Aoede",
                                      {"topic"}, {}, root, manifest, 1), [])

    def test_ledger_blocks_excess_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "private-ledger.json"
            tts.reserve_charge(ledger, "2026-10", 49_999)
            with self.assertRaisesRegex(ValueError, "50,000"):
                tts.reserve_charge(ledger, "2026-10", 2)
            self.assertEqual(json.loads(ledger.read_text())["2026-10"], 49_999)

    def test_default_dry_run_never_needs_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "topics.json"
            src.write_text(json.dumps({"topics": [{
                "topicId": "T0001", "studyTarget": "Y",
                "topicName": "중심극한정리", "concept": "표본 평균의 분포가 정규분포에 근사"
            }]}, ensure_ascii=False), encoding="utf-8")
            cmd = [sys.executable, str(MODULE_FILE), "--input", str(src),
                   "--out", str(root / "audio"), "--max-topics", "1"]
            outcome = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            self.assertEqual(outcome.returncode, 0, outcome.stderr)
            self.assertIn("DRY RUN - NO API CALLS", outcome.stdout)
            self.assertIn("Estimated new TTS characters", outcome.stdout)
            self.assertIn("does not charge TTS API", outcome.stdout)
            self.assertFalse((root / "audio").exists())

    def test_wrong_billing_project_rejected_before_tts_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "topics.json"
            src.write_text(json.dumps({"topics": [{
                "topicId": "T0001", "studyTarget": "Y", "topicName": "정규화"
            }]}, ensure_ascii=False), encoding="utf-8")
            command = [
                sys.executable, str(MODULE_FILE), "--input", str(src),
                "--out", str(root / "audio"), "--project", "wrong-billing-project",
                "--execute", "--accept-possible-charges"
            ]
            outcome = subprocess.run(command, capture_output=True, text=True, timeout=20)
            self.assertEqual(outcome.returncode, 2)
            self.assertIn("does not match the confirmed", outcome.stderr)
            self.assertFalse((root / "audio").exists())

    def test_correct_project_still_blocked_until_cloud_tts_approved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "topics.json"
            src.write_text(json.dumps({"topics": [{
                "topicId": "T0001", "studyTarget": "Y", "topicName": "중심극한정리"
            }]}, ensure_ascii=False), encoding="utf-8")
            command = [
                sys.executable, str(MODULE_FILE), "--input", str(src),
                "--out", str(root / "audio"), "--project", "study-note-tts",
                "--execute", "--accept-possible-charges"
            ]
            outcome = subprocess.run(command, capture_output=True, text=True, timeout=20)
            self.assertEqual(outcome.returncode, 2)
            self.assertIn("not yet approved", outcome.stderr)
            self.assertFalse((root / "audio").exists())

    def test_execute_without_opt_in_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "topics.json"
            src.write_text(json.dumps({"topics": [{
                "topicId": "T0001", "studyTarget": "Y", "topicName": "정규화"
            }]}, ensure_ascii=False), encoding="utf-8")
            cmd = [sys.executable, str(MODULE_FILE), "--input", str(src),
                   "--out", str(root / "audio"), "--execute"]
            outcome = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            self.assertEqual(outcome.returncode, 2)
            self.assertIn("--accept-possible-charges", outcome.stderr)
            self.assertFalse((root / "audio").exists())


if __name__ == "__main__":
    unittest.main()
