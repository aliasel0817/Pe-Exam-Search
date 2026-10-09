"""Purely local tests for the one-off approved private GCS 7-MP3 pilot."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import stage4_approved_private_upload as pilot


class ApprovedPrivatePilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.audio = self.root / "audio"
        self.audio.mkdir()
        self.objects = []
        for i in range(7):
            path = self.audio / ("sample%d.mp3" % i)
            path.write_bytes(b"ID3" + bytes([i]) * 200)
            self.objects.append(("ko-KR-Chirp3-HD-Aoede/T0001/concept-%012x.mp3" % i, path))
        self.manifest = {"schemaVersion": 1, "entries": {
            "%s:%s:%s" % (topic, field, pilot.quality.VOICE): {
                "sha256": "a" * 64}
            for topic, field, *_ in pilot.quality.TARGETS
        }}
        self.size = sum(path.stat().st_size for _, path in self.objects)
        self.result = (self.audio, self.manifest, self.objects, "study-note-tts", "558407087449", self.size)

    def test_dry_run_never_contacts_cloud(self):
        with mock.patch.object(pilot, "validated_scope", return_value=self.result), \
             mock.patch.object(pilot, "upload_once", side_effect=AssertionError("upload attempted")):
            self.assertEqual(pilot.main(["--scope", pilot.SCOPE]), 0)

    def test_execute_needs_explicit_charge_flag(self):
        with mock.patch.object(pilot, "validated_scope", side_effect=AssertionError("early check missed")), \
             mock.patch.object(pilot, "upload_once", side_effect=AssertionError("upload attempted")):
            self.assertEqual(pilot.main(["--scope", pilot.SCOPE, "--execute"]), 2)

    def test_existing_cloud_index_blocks_all_upload_writes(self):
        with mock.patch.object(pilot.gcs, "check_bucket"), \
             mock.patch.object(pilot.gcs, "remote_manifest", return_value=({"schemaVersion": 1}, "23")), \
             mock.patch.object(pilot.gcs, "execute", side_effect=AssertionError("unexpected upload")):
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                pilot.upload_once(*self.result[:5])

    def test_exact_three_keys_required(self):
        report = {"bucket": pilot.preflight.BUCKET, "prefix": pilot.gcs.OBJECT_ROOT,
                  "files": 7, "fields": 3, "audioBytes": self.size}
        bad = json.loads(json.dumps(self.manifest))
        bad["entries"]["T9999:topic:" + pilot.quality.VOICE] = {"sha256": "x" * 64}
        with mock.patch.object(pilot.preflight, "audit_local", return_value=report), \
             mock.patch.object(pilot.quality, "private_paths", return_value=(None, self.audio, None)), \
             mock.patch.object(pilot.gcs, "validate_manifest", return_value=(bad, self.objects)), \
             mock.patch.object(pilot.gcs, "project_binding", return_value=("study-note-tts", "558407087449")):
            with self.assertRaisesRegex(ValueError, "Unexpected private MP3 scope"):
                pilot.validated_scope()

    def test_remote_bytes_must_match_sha256(self):
        def result(cmd):
            data = json.dumps(self.manifest).encode() if cmd[-2].endswith("/index.json") else self.objects[0][1].read_bytes()
            return mock.Mock(stdout=data)
        with mock.patch.object(pilot.gcs, "run", side_effect=result):
            with self.assertRaisesRegex(RuntimeError, "SHA-256 mismatch"):
                pilot.verify_remote(self.manifest, self.objects, "study-note-tts")

    def test_approved_execution_calls_upload_path_exactly_once(self):
        with mock.patch.object(pilot, "validated_scope", return_value=self.result), \
             mock.patch.object(pilot, "upload_once") as upload:
            self.assertEqual(pilot.main(["--scope", pilot.SCOPE, "--execute",
                                         "--accept-possible-cloud-charges"]), 0)
            upload.assert_called_once_with(*self.result[:5])


if __name__ == "__main__":
    unittest.main()
