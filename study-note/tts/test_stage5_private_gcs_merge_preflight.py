"""Offline protection tests for Stage-5 private GCS 7+5 read-only merge plan.

Everything runs on temporary sample MP3 fixtures. All Cloud calls are mocks:
not a single real GCS read/write, Cloud Run deploy, or TTS synthesis.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

import quality_aoede_7x984_preflight as original
import stage4_private_audio_preflight as old_audit
import stage5_private_gcs_merge_preflight as merger
import stage5_topic_intro_v2_preflight as title_source
import upload_gcs as gcs
import verify_topic_intro_v2_5_audio as new_audit


class PrivateGcsMergeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.old = base / "old7"
        self.new = base / "new5"
        self.old.mkdir()
        self.new.mkdir()
        self.old_index = {"schemaVersion": 1, "entries": {}}
        self.new_index = {"schemaVersion": 1, "entries": {}}
        self.old_objects, self.new_objects = {}, {}

        old_fields = [
            (original.TARGETS[0][0], original.TARGETS[0][1], 1),
            (original.TARGETS[1][0], original.TARGETS[1][1], 2),
            (original.TARGETS[2][0], original.TARGETS[2][1], 4),
        ]
        counter = 0
        for tid, field, parts in old_fields:
            relpaths = []
            for part in range(parts):
                counter += 1
                suffix = "" if parts == 1 else f"-p{part + 1:02d}"
                rel = f"{merger.VOICE}/{tid}/{field}-{counter:012x}{suffix}.mp3"
                data = b"ID3" + bytes([counter]) * (151 + counter)
                self.save_file(self.old, rel, data)
                self.old_objects[rel] = data
                relpaths.append(rel)
            self.old_index["entries"][f"{tid}:{field}:{merger.VOICE}"] = {
                "sha256": "a" * 64, "speechSha256": "b" * 64,
                **({"file": relpaths[0]} if parts == 1 else {"files": relpaths}),
            }
        for idx, tid in enumerate(title_source.TOPIC_IDS, 1):
            rel = f"{merger.VOICE}/{tid}/topic-{idx:012x}.mp3"
            data = b"ID3" + bytes([idx]) * (207 + idx)
            self.save_file(self.new, rel, data)
            self.new_objects[rel] = data
            self.new_index["entries"][f"{tid}:topic:{merger.VOICE}"] = {
                "sha256": "c" * 64, "speechSha256": "d" * 64, "file": rel,
            }
        (self.old / "index.json").write_text(json.dumps(self.old_index))
        (self.new / "index.json").write_text(json.dumps(self.new_index))
        self.old_size = sum(map(len, self.old_objects.values()))
        self.new_size = sum(map(len, self.new_objects.values()))
        patches = [
            mock.patch.object(old_audit, "audit_local", return_value={
                "bucket": merger.BUCKET, "prefix": gcs.OBJECT_ROOT,
                "fields": 3, "files": 7, "audioBytes": self.old_size,
            }),
            mock.patch.object(new_audit, "verify_private_audio", return_value={
                "files": 5, "characters": 180,
                "utf8Bytes": 292, "audioBytes": self.new_size,
            }),
            mock.patch.object(original, "private_paths",
                              return_value=(base / "original-source.json", self.old, base / "old.zip")),
            mock.patch.object(title_source, "private_paths",
                              return_value=(base / "new-source.json", self.new, base / "new.zip")),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def save_file(self, root: Path, rel: str, data: bytes):
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def test_merge_retains_all_old_entries_and_appends_only_five_titles(self):
        plan = merger.build_local_plan()
        self.assertEqual(plan["merged"]["schemaVersion"], 1)
        self.assertEqual(len(plan["merged"]["entries"]), 8)
        self.assertEqual(plan["oldIndex"], self.old_index)
        self.assertEqual(plan["newIndex"], self.new_index)
        self.assertEqual(plan["oldBytes"], self.old_size)
        self.assertEqual(plan["newBytes"], self.new_size)
        self.assertEqual(len(plan["combinedDigest"]), 64)
        self.assertTrue(all(plan["merged"]["entries"][k] == value
                            for k, value in self.old_index["entries"].items()))
        self.assertEqual(len(merger.paths_of(plan["merged"])), 12)

    def test_default_cli_never_touches_gcs(self):
        with mock.patch.object(merger, "check_remote_readonly",
                               side_effect=AssertionError("unexpected cloud read")):
            self.assertEqual(merger.main([]), 0)

    def test_execute_flag_is_unrecognized(self):
        with self.assertRaises(SystemExit) as error:
            merger.main(["--execute"])
        self.assertEqual(error.exception.code, 2)

    def test_remote_success_verifies_exact_seven_audio_and_five_absences(self):
        plan = merger.build_local_plan()
        calls = []
        def fake_run(command, check=True):
            calls.append(command)
            object_path = command[3] if command[2] == "cat" else command[4]
            if command[2] == "cat":
                return subprocess.CompletedProcess(command, 0,
                    stdout=self.old_objects[object_path.split(gcs.OBJECT_ROOT + "/")[-1]], stderr=b"")
            return subprocess.CompletedProcess(command, 1, stdout=b"",
                                               stderr=b"404 Not Found")
        with mock.patch.object(gcs, "check_bucket") as bucket, \
             mock.patch.object(gcs, "remote_manifest",
                               return_value=(self.old_index, "12345678")), \
             mock.patch.object(gcs, "run", side_effect=fake_run):
            self.assertEqual(merger.check_remote_readonly(plan), "12345678")
        bucket.assert_called_once_with(merger.BUCKET, merger.PROJECT,
                                      merger.PROJECT_NUMBER)
        self.assertEqual(sum(c[2] == "cat" for c in calls), 7)
        self.assertEqual(sum(c[2] == "objects" for c in calls), 5)
        self.assertTrue(all(c[0:2] == ["gcloud", "storage"] for c in calls))

    def test_changed_remote_manifest_blocks_all_mp3_reads(self):
        plan = merger.build_local_plan()
        cloud = json.loads(json.dumps(self.old_index))
        cloud["entries"][next(iter(cloud["entries"]))]["sha256"] = "0" * 64
        with mock.patch.object(gcs, "check_bucket"), \
             mock.patch.object(gcs, "remote_manifest", return_value=(cloud, "35")), \
             mock.patch.object(gcs, "run",
                               side_effect=AssertionError("should not read audio")):
            with self.assertRaisesRegex(ValueError, "not exactly"):
                merger.check_remote_readonly(plan)

    def test_missing_remote_manifest_is_never_treated_as_empty_bucket(self):
        plan = merger.build_local_plan()
        with mock.patch.object(gcs, "check_bucket"), \
             mock.patch.object(gcs, "remote_manifest", return_value=(None, "0")):
            with self.assertRaisesRegex(ValueError, "not exactly"):
                merger.check_remote_readonly(plan)

    def test_existing_remote_audio_sha_mismatch_rejected(self):
        plan = merger.build_local_plan()
        def fake(command, check=True):
            return subprocess.CompletedProcess(command, 0, stdout=b"ID3CORRUPTED", stderr=b"")
        with mock.patch.object(gcs, "check_bucket"), \
             mock.patch.object(gcs, "remote_manifest",
                               return_value=(self.old_index, "890")), \
             mock.patch.object(gcs, "run", side_effect=fake):
            with self.assertRaisesRegex(ValueError, "MP3 differs"):
                merger.check_remote_readonly(plan)

    def test_new_object_already_exists_is_rejected(self):
        plan = merger.build_local_plan()
        def fake(command, check=True):
            if command[2] == "cat":
                rel = command[3].split(gcs.OBJECT_ROOT + "/")[-1]
                return subprocess.CompletedProcess(command, 0,
                                                   stdout=self.old_objects[rel], stderr=b"")
            return subprocess.CompletedProcess(command, 0, stdout=b"{}", stderr=b"")
        with mock.patch.object(gcs, "check_bucket"), \
             mock.patch.object(gcs, "remote_manifest",
                               return_value=(self.old_index, "99")), \
             mock.patch.object(gcs, "run", side_effect=fake):
            with self.assertRaisesRegex(ValueError, "already exists"):
                merger.check_remote_readonly(plan)

    def test_gcs_permission_failure_is_not_treated_as_object_absence(self):
        plan = merger.build_local_plan()
        def fake(command, check=True):
            if command[2] == "cat":
                rel = command[3].split(gcs.OBJECT_ROOT + "/")[-1]
                return subprocess.CompletedProcess(command, 0,
                                                   stdout=self.old_objects[rel], stderr=b"")
            return subprocess.CompletedProcess(command, 1, stdout=b"",
                                               stderr=b"403 PermissionDenied")
        with mock.patch.object(gcs, "check_bucket"), \
             mock.patch.object(gcs, "remote_manifest",
                               return_value=(self.old_index, "99")), \
             mock.patch.object(gcs, "run", side_effect=fake):
            with self.assertRaisesRegex(RuntimeError, "Cannot establish"):
                merger.check_remote_readonly(plan)

    def test_unauthorized_extra_topic_manifest_field_is_rejected(self):
        extra_path = f"{merger.VOICE}/T9999/topic-999999999999.mp3"
        self.save_file(self.new, extra_path, b"ID3" + b"z" * 200)
        self.new_index["entries"]["T9999:topic:" + merger.VOICE] = {
            "sha256": "c" * 64, "file": extra_path
        }
        (self.new / "index.json").write_text(json.dumps(self.new_index))
        with self.assertRaisesRegex(ValueError, "Unexpected or colliding"):
            merger.build_local_plan()

    def test_legacy_key_collision_blocks_merge(self):
        for rel, data in self.old_objects.items():
            self.save_file(self.new, rel, data)
        self.new_index["entries"] = {
            **self.new_index["entries"],
            **{k: value for k, value in self.old_index["entries"].items()},
        }
        (self.new / "index.json").write_text(json.dumps(self.new_index))
        with self.assertRaisesRegex(ValueError, "Unexpected or colliding"):
            merger.build_local_plan()

    def test_audio_paths_collision_rejected(self):
        name = next(iter(self.old_objects))
        self.assertRaisesRegex(ValueError, "Duplicate or invalid MP3", merger.paths_of,
                               {"entries":{"a":{"file":name},"b":{"file":name}}})

    def test_original_mp3_tampering_detected_without_cloud(self):
        file = self.old / next(iter(self.old_objects))
        file.write_bytes(b"ID3" + b"x" * 12)
        with self.assertRaisesRegex(ValueError, "Audio size differs"):
            merger.build_local_plan()

    def test_changed_global_cloud_approval_flag_blocks_merge(self):
        settings = json.loads(gcs.PROJECT_CONFIG.read_text(encoding="utf-8"))
        settings["gcsUploadApproved"] = True
        temp_path = self.old / "fake-cloud-project.json"
        temp_path.write_text(json.dumps(settings))
        with mock.patch.object(gcs, "PROJECT_CONFIG", temp_path):
            with self.assertRaisesRegex(ValueError, "approval locks changed"):
                merger.build_local_plan()

    def test_bad_cloud_response_never_interpreted_as_absence(self):
        for code, stderr, allowed in [
            (1, b"403 permission denied", False),
            (1, b"network timeout", False),
            (1, b"404 not found", True),
            (1, b"notfound", True),
            (0, b"404 Not Found", False),
        ]:
            with self.subTest(stderr=stderr):
                result = subprocess.CompletedProcess([], code, b"", stderr)
                self.assertEqual(merger._not_found(result), allowed)


if __name__ == "__main__":
    unittest.main()
