"""Offline regression tests for final private five-title MP3/ZIP readback.

Fixtures use mocked MP3 bytes. No real Cloud TTS, GCS, Cloud Run or user files.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

import generate_mp3 as t
import run_approved_topic_intro_v2_5 as generate
import stage5_topic_intro_v2_preflight as pre
import topic_intro_v2 as intro
import verify_topic_intro_v2_5_audio as verifier

ROOT = Path(__file__).resolve().parent


def demo_topics() -> list[dict]:
    names = ("3C 분석 종류", "몬테카를로 트리검색(MCTS)", "퀵 정렬", "B+Tree", "SQL")
    return [
        {"topicId": tid, "topicName": name, "studyTarget": "Y"}
        for tid, name in zip(pre.TOPIC_IDS, names)
    ]


class FinalAudioIntegrityTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)
        self.folder = self.base / "five-topic-intros"
        self.zipfile = self.base / "five-topic-intros.zip"
        self.source = self.base / "source.json"
        self.source.write_text(json.dumps({"topics": demo_topics()}, ensure_ascii=False),
                               encoding="utf-8")
        self.private = mock.patch.object(
            pre, "private_paths", return_value=(self.source, self.folder, self.zipfile))
        self.private.start()
        self.addCleanup(self.private.stop)
        self.source_hash = mock.patch.object(
            pre, "SOURCE_SHA256", hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.source_hash.start()
        self.addCleanup(self.source_hash.stop)
        # Reuse the actual immutable source files through pre.ROOT.
        dictionary = t.load_dictionary(ROOT / "pronunciations.ko-candidates.json")
        self.plan = intro.plan_v2(demo_topics(), {"topic"}, dictionary,
                                  self.folder, {"schemaVersion": 1, "entries": {}}, 5)
        self.characters = sum(len(x["chunks"][0]) for x in self.plan)
        self.bytes_count = sum(t.utf8_len(x["chunks"][0]) for x in self.plan)
        patch_chars = mock.patch.object(verifier, "EXPECTED_CHARS", self.characters)
        patch_bytes = mock.patch.object(verifier, "EXPECTED_UTF8_BYTES", self.bytes_count)
        patch_chars.start()
        patch_bytes.start()
        self.addCleanup(patch_chars.stop)
        self.addCleanup(patch_bytes.stop)
        with mock.patch.object(generate, "check_active_project"), \
             mock.patch.object(t, "access_token", return_value="offline-not-real"), \
             mock.patch.object(t, "synthesize",
                               side_effect=lambda part,*_args:
                               b"ID3" + b"example-mp3-" + part.encode("utf-8")[:16] + b"X" * 256):
            generate.execute_exactly_once(self.plan, self.characters, self.bytes_count)

    def test_five_mp3_and_zip_verified_after_offline_generation(self):
        report = verifier.verify_private_audio()
        self.assertEqual(report["files"], 5)
        self.assertEqual(report["characters"], self.characters)
        self.assertEqual(report["utf8Bytes"], self.bytes_count)
        self.assertTrue(report["zipSha256"])
        self.assertTrue(self.zipfile.is_file())

    def test_readonly_repeat_preserves_every_file_byte(self):
        paths = [self.source, self.zipfile] + list(self.folder.rglob("*"))
        paths = [x for x in paths if x.is_file()]
        before = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
        verifier.verify_private_audio()
        verifier.verify_private_audio()
        after = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
        self.assertEqual(before, after)

    def test_tampering_single_mp3_fails_sha256_zip_comparison(self):
        file = next(self.folder.rglob("*.mp3"))
        data = bytearray(file.read_bytes())
        data[-3] ^= 0x01
        file.write_bytes(data)
        with self.assertRaisesRegex(ValueError, "ZIP MP3 SHA-256 differs"):
            verifier.verify_private_audio()

    def test_missing_mp3_is_rejected(self):
        next(self.folder.rglob("*.mp3")).unlink()
        with self.assertRaisesRegex(ValueError, "Missing approved MP3"):
            verifier.verify_private_audio()

    def test_extra_mp3_is_rejected(self):
        (self.folder / "unapproved.mp3").write_bytes(b"ID3" + b"u" * 256)
        with self.assertRaisesRegex(ValueError, "Unapproved"):
            verifier.verify_private_audio()

    def test_wrong_manifest_speech_hash_is_rejected(self):
        path = self.folder / "index.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        key = next(iter(data["entries"]))
        data["entries"][key]["speechSha256"] = "0" * 64
        path.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Manifest source/speech SHA"):
            verifier.verify_private_audio()

    def test_wrong_record_status_is_rejected(self):
        path = self.folder / "attempts.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["records"][0]["status"] = "attempted"
        path.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Attempt journal record"):
            verifier.verify_private_audio()

    def test_wrong_record_count_is_rejected(self):
        path = self.folder / "attempts.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["records"].pop()
        path.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "attempt journal"):
            verifier.verify_private_audio()

    def test_source_changed_without_manifest_update_is_rejected(self):
        self.source.write_text(self.source.read_text(encoding="utf-8") + " ",
                               encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "source SHA-256 changed"):
            verifier.verify_private_audio()

    def test_local_billing_ledger_missing_is_rejected(self):
        (self.folder / "local-charge-guard.json").unlink()
        with self.assertRaisesRegex(ValueError, "Missing/unsafe"):
            verifier.verify_private_audio()

    def test_cloud_approval_lock_remains_off(self):
        with mock.patch.object(verifier, "_json_file", wraps=verifier._json_file) as reader:
            report = verifier.verify_private_audio()
            self.assertEqual(report["files"], 5)
            self.assertTrue(any("cloud-project.json" in str(x[0][0]) for x in reader.call_args_list))

    def test_zip_entry_corruption_is_rejected(self):
        rebuilt = self.base / "unapproved-change.zip"
        with zipfile.ZipFile(self.zipfile) as old:
            names = old.namelist()
            data = [(name, old.read(name)) for name in names]
        with zipfile.ZipFile(rebuilt, "w", compression=zipfile.ZIP_STORED) as new:
            for idx, (name, buf) in enumerate(data):
                new.writestr(name, buf[:-1] + b"x" if idx == 0 else buf)
        with mock.patch.object(pre, "private_paths",
                               return_value=(self.source, self.folder, rebuilt)):
            with self.assertRaisesRegex(ValueError, "ZIP MP3 SHA-256 differs"):
                verifier.verify_private_audio()

    def test_zip_missing_entry_is_rejected(self):
        rebuilt = self.base / "incomplete.zip"
        with zipfile.ZipFile(self.zipfile) as old:
            names = old.namelist()
            data = [(name, old.read(name)) for name in names[1:]]
        with zipfile.ZipFile(rebuilt, "w") as new:
            for name, buf in data:
                new.writestr(name, buf)
        with mock.patch.object(pre, "private_paths",
                               return_value=(self.source, self.folder, rebuilt)):
            with self.assertRaisesRegex((ValueError, KeyError), ""):
                verifier.verify_private_audio()

    def test_zip_hash_report_equals_saved_archive(self):
        verified = verifier.verify_private_audio()
        self.assertEqual(verified["zipSha256"],
                         hashlib.sha256(self.zipfile.read_bytes()).hexdigest())

    def test_readonly_script_has_no_gcloud_or_file_write_calls(self):
        source = (ROOT / "verify_topic_intro_v2_5_audio.py").read_text(encoding="utf-8")
        self.assertNotIn("synthesize(", source)
        self.assertNotIn("gcloud", source.split("import generate_mp3 as t")[1])
        for prohibited in ("atomic_write(", "manifest_save(", "write_bytes(",
                           "unlink(", "os.remove(", "subprocess.run(", "urlopen(", "--execute"):
            self.assertNotIn(prohibited, source)


if __name__ == "__main__":
    unittest.main()
