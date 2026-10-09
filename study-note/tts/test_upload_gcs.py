"""Offline private GCS uploader safety checks. No gcloud, no paid requests."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

MODULE_FILE=Path(__file__).resolve().with_name("upload_gcs.py")
spec=importlib.util.spec_from_file_location("study_tts_uploader", MODULE_FILE)
upload=importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload)
VOICE="ko-KR-Chirp3-HD-Aoede"
PATH=VOICE+"/T0001/topic-123456789abc.mp3"
KEY="T0001:topic:"+VOICE

def create_sample(path:Path):
    audio=path/"audio"
    media=audio/PATH
    media.parent.mkdir(parents=True,exist_ok=True)
    media.write_bytes(b"ID3"+b"0"*128)
    index={"schemaVersion":1,"entries":{
        KEY:{"sha256":"0"*64,"speechSha256":"1"*64,"file":PATH}
    }}
    (audio/"index.json").write_text(json.dumps(index),encoding="utf-8")
    return audio,index

class UploadTests(unittest.TestCase):
    def test_cloud_project_matches_confirmed_id_and_number(self):
        project_id, project_number = upload.project_binding()
        self.assertEqual(project_id, "study-note-tts")
        self.assertEqual(project_number, "558407087449")

    def test_wrong_bucket_owner_blocks_upload_before_write(self):
        good = {
            "name": "study-note-tts-audio-test",
            "projectNumber": "558407087449",
            "location": "US-CENTRAL1",
            "storageClass": "STANDARD",
            "iamConfiguration": {
                "publicAccessPrevention": "enforced",
                "uniformBucketLevelAccess": {"enabled": True}
            },
        }
        upload.validate_bucket_metadata(good, good["name"], "558407087449")
        wrong = {**good, "projectNumber": "111222333444"}
        with self.assertRaisesRegex(ValueError, "NOT owned"):
            upload.validate_bucket_metadata(wrong, good["name"], "558407087449")
        with self.assertRaisesRegex(ValueError, "bucket name mismatch"):
            upload.validate_bucket_metadata(good, "another-bucket", "558407087449")

    def test_public_bucket_or_wrong_region_rejected(self):
        meta = {
            "name": "safe-private-bucket",
            "projectNumber": "558407087449",
            "location": "US-CENTRAL1",
            "storageClass": "STANDARD",
            "iamConfiguration": {
                "publicAccessPrevention": "enforced",
                "uniformBucketLevelAccess": {"enabled": True}
            }
        }
        upload.validate_bucket_metadata(meta, "safe-private-bucket", "558407087449")
        with self.assertRaisesRegex(ValueError, "public access prevention"):
            upload.validate_bucket_metadata(
                {**meta,"iamConfiguration":{**meta["iamConfiguration"],"publicAccessPrevention":"inherited"}},
                "safe-private-bucket", "558407087449")
        with self.assertRaisesRegex(ValueError, "us-central1"):
            upload.validate_bucket_metadata(
                {**meta,"location":"ASIA-NORTHEAST3"}, "safe-private-bucket", "558407087449")

    def test_cloud_upload_needs_confirmed_exact_bucket_after_budget(self):
        target = "study-note-tts-audio-558407087449"
        config = {
            "gcsUploadApproved": True,
            "budgetAlertsUserConfirmed": True,
            "bucketCreatedUserConfirmed": False,
            "bucketName": "",
        }
        with self.assertRaisesRegex(ValueError, "not been user-confirmed"):
            upload.assert_upload_authorized(config, target)
        config["bucketCreatedUserConfirmed"] = True
        config["bucketName"] = target
        with self.assertRaisesRegex(ValueError, "CORS is not yet confirmed"):
            upload.assert_upload_authorized(config, target)
        config["gcsCorsUserConfirmed"] = True
        upload.assert_upload_authorized(config, target)
        with self.assertRaisesRegex(ValueError, "exact confirmed"):
            upload.assert_upload_authorized(config, "another-bucket")
        config["budgetAlertsUserConfirmed"] = False
        with self.assertRaisesRegex(ValueError, "budget confirmation"):
            upload.assert_upload_authorized(config, target)

    def test_nonstandard_costly_storage_features_are_rejected(self):
        good = {
            "name": "study-note-tts-audio-test",
            "projectNumber": "558407087449",
            "location": "US-CENTRAL1",
            "storageClass": "STANDARD",
            "iamConfiguration": {
                "publicAccessPrevention": "enforced",
                "uniformBucketLevelAccess": {"enabled": True},
            },
            "softDeletePolicy": {"retentionDurationSeconds": "604800"},
        }
        upload.validate_bucket_metadata(good, good["name"], "558407087449")
        for feature in (
            {"versioning": {"enabled": True}},
            {"autoclass": {"enabled": True}},
            {"hierarchicalNamespace": {"enabled": True}},
            {"billing": {"requesterPays": True}},
            {"retentionPolicy": {"retentionPeriod": "7776000"}},
            {"softDeletePolicy": {"retentionDurationSeconds": "7776000"}},
        ):
            with self.subTest(feature=feature):
                with self.assertRaises(ValueError):
                    upload.validate_bucket_metadata(
                        {**good, **feature}, good["name"], "558407087449")

    def test_validates_private_mp3_before_cloud_action(self):
        with tempfile.TemporaryDirectory() as d:
            folder,manifest=create_sample(Path(d))
            received,objects=upload.validate_manifest(folder)
            self.assertEqual(manifest,received)
            self.assertEqual([x[0] for x in objects],[PATH])

    def test_dry_run_does_not_contact_gcloud(self):
        with tempfile.TemporaryDirectory() as d:
            folder,_=create_sample(Path(d))
            cmd=[sys.executable,str(MODULE_FILE),"--audio-dir",str(folder),
                 "--bucket","study-audio-test123"]
            proc=subprocess.run(cmd,capture_output=True,text=True,timeout=15)
            self.assertEqual(proc.returncode,0,proc.stderr)
            self.assertIn("DRY RUN - NO CLOUD REQUESTS",proc.stdout)
            self.assertFalse((Path(d)/"credentials.json").exists())

    def test_execute_without_explicit_charge_permission_refused(self):
        with tempfile.TemporaryDirectory() as d:
            folder,_=create_sample(Path(d))
            cmd=[sys.executable,str(MODULE_FILE),"--audio-dir",str(folder),
                 "--bucket","study-audio-test123","--execute"]
            proc=subprocess.run(cmd,capture_output=True,text=True,timeout=15)
            self.assertEqual(proc.returncode,2)
            self.assertIn("--accept-possible-cloud-charges",proc.stderr)

    def test_cloud_upload_blocked_even_with_cli_opt_in_before_owner_approval(self):
        with tempfile.TemporaryDirectory() as d:
            folder, _ = create_sample(Path(d))
            cmd = [
                sys.executable, str(MODULE_FILE), "--audio-dir", str(folder),
                "--bucket", "study-audio-test123", "--execute",
                "--accept-possible-cloud-charges"
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            self.assertEqual(proc.returncode, 2)
            self.assertIn("not yet approved", proc.stderr)

    def test_no_public_or_path_traversal_media(self):
        with tempfile.TemporaryDirectory() as d:
            folder,index=create_sample(Path(d))
            index["entries"][KEY]["file"]="../../private.json"
            (folder/"index.json").write_text(json.dumps(index),encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"Invalid MP3"):
                upload.validate_manifest(folder)

    def test_remote_manifest_merge_keeps_existing_topics(self):
        incoming={"schemaVersion":1,"entries":{KEY:{"file":PATH}}}
        cloud={"schemaVersion":1,"entries":{
            "T0002:topic:"+VOICE:{"file":VOICE+"/T0002/topic-123456789abc.mp3"}
        }}
        result=upload.merged_manifest(incoming,cloud)
        self.assertEqual(len(result["entries"]),2)
        with self.assertRaisesRegex(ValueError,"Cloud manifest invalid"):
            upload.merged_manifest(incoming,{"schemaVersion":900})

    def test_bucket_name_validated(self):
        with tempfile.TemporaryDirectory() as d:
            folder,_=create_sample(Path(d))
            cmd=[sys.executable,str(MODULE_FILE),"--audio-dir",str(folder),
                 "--bucket","BAD/unsafe"]
            proc=subprocess.run(cmd,capture_output=True,text=True,timeout=15)
            self.assertEqual(proc.returncode,2)
            self.assertIn("Invalid GCS bucket name",proc.stderr)

if __name__=="__main__":
    unittest.main()
